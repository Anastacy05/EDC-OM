/**
 * Serveur SMTP jetable, pour éprouver l'envoi sans fournisseur réel.
 *
 * Parle assez du protocole pour nodemailer : EHLO, STARTTLS, AUTH (LOGIN et
 * PLAIN), MAIL, RCPT, DATA. Les messages reçus sont gardés EN MÉMOIRE et décodés,
 * plutôt qu'écrits sur disque : un test qui lit un fichier doit gérer son
 * nettoyage, et deux tests concurrents se mélangeraient.
 *
 * ── Ce qu'il permet de vérifier, et que rien d'autre ne vérifie ──────────────
 *
 * Les `comportement` fabriquent des pannes qu'un vrai relais ne produit pas sur
 * commande. C'est ainsi qu'a été trouvé, le 22/08/2026, le défaut le plus grave
 * de la couche mail : un mot de passe SMTP erroné brûlait toute la file.
 */

import net from "node:net";
import tls from "node:tls";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Ce que le serveur fait des messages qu'on lui remet. */
export type Comportement =
  /** Accepte tout. */
  | "ok"
  /** Refuse à DATA par un 5xx : échec permanent, ne doit PAS être retenté. */
  | "refus5xx"
  /** Refuse à DATA par un 4xx : échec temporaire, doit être retenté. */
  | "refus4xx"
  /** Refuse l'authentification : c'est NOTRE configuration qui est en cause. */
  | "authRefusee";

export interface MessageRecu {
  /** Adresses de l'enveloppe SMTP (`RCPT TO`), qui font foi pour l'acheminement. */
  destinataires: string[];
  expediteur: string;
  /** En-têtes bruts, tels que reçus. */
  entetes: string;
  /** Sujet décodé, accents compris. */
  sujet: string;
  /** Corps décodé du quoted-printable, accents compris. */
  corps: string;
}

/**
 * Certificat auto-signé pour STARTTLS.
 *
 * Node ne sait pas fabriquer de certificat X.509 : on passe par `openssl`, présent
 * avec Git sous Windows. S'il manque, on le dit clairement plutôt que de laisser
 * échouer une poignée de main TLS avec un message obscur.
 */
function certificatJetable(): { key: string; cert: string } {
  const dossier = mkdtempSync(path.join(tmpdir(), "edc-smtp-"));
  try {
    execFileSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "rsa:2048",
        "-keyout", path.join(dossier, "cle.pem"),
        "-out", path.join(dossier, "cert.pem"),
        "-days", "1", "-nodes", "-subj", "/CN=localhost",
      ],
      { stdio: "pipe", env: { ...process.env, MSYS_NO_PATHCONV: "1" } }
    );
    return {
      key: readFileSync(path.join(dossier, "cle.pem"), "utf8"),
      cert: readFileSync(path.join(dossier, "cert.pem"), "utf8"),
    };
  } catch (erreur) {
    throw new Error(
      "Impossible de fabriquer un certificat d'essai : `openssl` est introuvable ou " +
        "a échoué. Il est fourni avec Git pour Windows (/mingw64/bin/openssl).\n" +
        (erreur instanceof Error ? erreur.message : String(erreur))
    );
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/** Décode le quoted-printable en assemblant les octets AVANT de lire l'UTF-8. */
function deQuotedPrintable(texte: string): string {
  const continu = texte.replace(/=\r?\n/g, "");
  const octets: number[] = [];

  for (let i = 0; i < continu.length; i += 1) {
    if (continu[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(continu.slice(i + 1, i + 3))) {
      octets.push(parseInt(continu.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      octets.push(continu.charCodeAt(i));
    }
  }

  // ⚠️ Décodage de l'ENSEMBLE des octets, et non caractère par caractère : « é »
  // est encodé =C3=A9, soit DEUX octets. Les convertir séparément produit deux
  // caractères de remplacement — bévue commise le 22/08/2026 dans un décodeur
  // d'appoint, qui a fait croire à tort que les accents étaient perdus.
  return Buffer.from(octets).toString("utf8");
}

/** Décode un en-tête encodé selon la RFC 2047 (`=?UTF-8?Q?…?=`). */
function decoderEntete(valeur: string): string {
  return valeur
    // Un en-tête long est replié sur plusieurs lignes, chacune encodée à part.
    .replace(/\r?\n[ \t]+/g, "")
    .replace(/=\?UTF-8\?Q\?(.*?)\?=/gi, (_, contenu: string) =>
      deQuotedPrintable(contenu.replace(/_/g, " "))
    )
    .replace(/=\?UTF-8\?B\?(.*?)\?=/gi, (_, contenu: string) =>
      Buffer.from(contenu, "base64").toString("utf8")
    );
}

export interface ServeurSmtp {
  port: number;
  /** Messages reçus depuis le démarrage, ou depuis le dernier `vider()`. */
  messages: MessageRecu[];
  /** Dernier message reçu. Lève s'il n'y en a aucun — l'échec est plus lisible. */
  dernier(): MessageRecu;
  vider(): void;
  arreter(): Promise<void>;
}

/**
 * Démarre un serveur SMTP sur un port libre choisi par le système.
 *
 * Le port **0** laisse le système en attribuer un : deux fichiers de test lancés
 * en parallèle ne se disputent pas un numéro écrit en dur, et rien ne traîne d'une
 * exécution précédente. La configuration à passer à l'application est renvoyée par
 * `configurationSmtp()`.
 */
export function demarrerServeurSmtp(
  comportement: Comportement = "ok"
): Promise<ServeurSmtp> {
  const identite = certificatJetable();
  const messages: MessageRecu[] = [];

  /** Dialogue SMTP sur une socket, en clair puis éventuellement chiffrée. */
  function dialoguer(socket: net.Socket | tls.TLSSocket, chiffre: boolean): void {
    let tampon = "";
    let enDonnees = false;
    let brut = "";
    let expediteur = "";
    let destinataires: string[] = [];
    let attend: "utilisateur" | "motDePasse" | null = null;

    const ecrire = (ligne: string) => socket.write(ligne + "\r\n");
    if (!chiffre) ecrire("220 localhost serveur d'essai pret");

    socket.on("data", (donnees) => {
      tampon += donnees.toString("utf8");

      let coupure: number;
      while ((coupure = tampon.indexOf("\r\n")) !== -1) {
        const ligne = tampon.slice(0, coupure);
        tampon = tampon.slice(coupure + 2);

        if (enDonnees) {
          if (ligne === ".") {
            enDonnees = false;
            const separateur = brut.indexOf("\n\n");
            const entetes = separateur === -1 ? brut : brut.slice(0, separateur);
            const corps = separateur === -1 ? "" : brut.slice(separateur + 2);
            const sujet = /^Subject:([\s\S]*?)(?=\n[A-Za-z-]+:|$)/m.exec(entetes)?.[1] ?? "";

            messages.push({
              destinataires,
              expediteur,
              entetes,
              sujet: decoderEntete(sujet).trim(),
              corps: deQuotedPrintable(corps),
            });

            brut = "";
            if (comportement === "refus5xx") ecrire("550 5.1.1 Boite inexistante");
            else if (comportement === "refus4xx") ecrire("451 4.3.0 Serveur sature");
            else ecrire("250 2.0.0 Ok");
          } else {
            // Un point en début de ligne est doublé par l'émetteur (RFC 5321
            // §4.5.2) : on le rétablit, sinon le corps est altéré.
            brut += (ligne.startsWith("..") ? ligne.slice(1) : ligne) + "\n";
          }
          continue;
        }

        if (attend) {
          const etape = attend;
          attend = etape === "utilisateur" ? "motDePasse" : null;
          if (etape === "utilisateur") ecrire("334 UGFzc3dvcmQ6");
          else if (comportement === "authRefusee") ecrire("535 5.7.8 Identifiants refuses");
          else ecrire("235 2.7.0 Authentification acceptee");
          continue;
        }

        const commande = ligne.split(" ")[0].toUpperCase();

        switch (commande) {
          case "EHLO":
            ecrire("250-localhost");
            if (!chiffre) ecrire("250-STARTTLS");
            ecrire("250-AUTH LOGIN PLAIN");
            ecrire("250 8BITMIME");
            break;

          case "HELO":
            ecrire("250 localhost");
            break;

          case "STARTTLS": {
            ecrire("220 2.0.0 Pret pour TLS");
            socket.removeAllListeners("data");
            const securise = new tls.TLSSocket(socket as net.Socket, {
              ...identite,
              isServer: true,
            });
            securise.on("secure", () => dialoguer(securise, true));
            securise.on("error", () => {});
            return;
          }

          case "AUTH":
            // Le refus est traité AVANT de distinguer LOGIN de PLAIN : nodemailer
            // choisit PLAIN quand le serveur l'annonce, et sans cette priorité le
            // cas « identifiants refusés » n'était jamais atteint — la première
            // version de ce serveur laissait passer l'authentification.
            if (comportement === "authRefusee") {
              ecrire("535 5.7.8 Identifiants refuses");
            } else if (ligne.toUpperCase().includes("LOGIN")) {
              attend = "utilisateur";
              ecrire("334 VXNlcm5hbWU6");
            } else {
              ecrire("235 2.7.0 Authentification acceptee");
            }
            break;

          case "MAIL":
            expediteur = /<([^>]*)>/.exec(ligne)?.[1] ?? ligne;
            destinataires = [];
            ecrire("250 2.1.0 Expediteur accepte");
            break;

          case "RCPT":
            destinataires.push(/<([^>]*)>/.exec(ligne)?.[1] ?? ligne);
            ecrire("250 2.1.5 Destinataire accepte");
            break;

          case "DATA":
            enDonnees = true;
            ecrire("354 Envoyez le message, terminez par un point seul");
            break;

          case "RSET":
            ecrire("250 2.0.0 Ok");
            break;

          case "QUIT":
            ecrire("221 2.0.0 Au revoir");
            socket.end();
            break;

          default:
            ecrire("502 5.5.2 Commande inconnue");
        }
      }
    });

    socket.on("error", () => {
      // Une socket coupée par le client est le cas ORDINAIRE ici (nodemailer
      // referme après QUIT). Lever ferait tomber le test sur un incident qui n'en
      // est pas un.
    });
  }

  return new Promise((resoudre) => {
    // Sockets suivies à la main pour pouvoir les fermer à l'arrêt.
    //
    // ⚠️ `net.Server` n'a PAS de `closeAllConnections()` — c'est une méthode de
    // `http.Server` uniquement (vérifié le 22/08/2026 : `undefined` à
    // l'exécution). Or `close()` seul attend la fin des connexions ouvertes, et
    // nodemailer n'envoie pas toujours QUIT : sans ce suivi, le processus de test
    // ne rend jamais la main.
    const ouvertes = new Set<net.Socket>();

    const serveur = net.createServer((socket) => {
      ouvertes.add(socket);
      socket.on("close", () => ouvertes.delete(socket));
      dialoguer(socket, false);
    });

    serveur.listen(0, "127.0.0.1", () => {
      const adresse = serveur.address();
      const port = typeof adresse === "object" && adresse ? adresse.port : 0;

      resoudre({
        port,
        messages,
        dernier() {
          const message = messages.at(-1);
          if (!message) {
            throw new Error(
              "Aucun courriel n'est arrivé au serveur d'essai. Vérifier que " +
                "l'application a bien été lancée avec configurationSmtp()."
            );
          }
          return message;
        },
        vider() {
          messages.length = 0;
        },
        arreter() {
          return new Promise((fini) => {
            for (const socket of ouvertes) socket.destroy();
            ouvertes.clear();
            serveur.close(() => fini());
          });
        },
      });
    });
  });
}

/**
 * Variables d'environnement à passer à l'application pour qu'elle parle à ce
 * serveur. `SMTP_CERTIFICAT_AUTOSIGNE` est indispensable : le certificat est
 * fabriqué à la volée, donc invérifiable par construction.
 */
export function configurationSmtp(serveur: ServeurSmtp): Record<string, string> {
  return {
    SMTP_HOTE: "127.0.0.1",
    SMTP_PORT: String(serveur.port),
    SMTP_UTILISATEUR: "essai",
    SMTP_MOT_DE_PASSE: "essai",
    SMTP_CERTIFICAT_AUTOSIGNE: "true",
    MAIL_EXPEDITEUR: "noreply@edc.cm",
    MAIL_NOM_EXPEDITEUR: "EDC — Ordres de mission",
  };
}
