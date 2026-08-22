import "server-only";

import { createTransport, type Transporter } from "nodemailer";

/**
 * Transport SMTP. **Seul point de sortie de courriel de tout le projet.**
 *
 * ── Pourquoi SMTP et non l'API HTTP d'un fournisseur ─────────────────────────
 *
 * L'EDC dispose d'un service de messagerie **Zimbra** (confirmé le 21/08/2026),
 * qui parle SMTP. Brevo expose lui aussi un relais SMTP
 * (`smtp-relay.brevo.com:587`) en plus de son API `api.brevo.com`.
 *
 * En passant par SMTP, basculer de Brevo vers le Zimbra de l'entreprise est un
 * changement de variables d'environnement — **pas une ligne de code**. Une
 * intégration à `api.brevo.com` nous y aurait enfermés : chaque fournisseur a
 * son schéma JSON, son authentification et ses codes d'erreur, alors que SMTP
 * est le même protocole partout depuis 1982 (RFC 821).
 *
 * C'est le seul module autorisé à lire les variables `SMTP_*`, comme
 * `lib/data/client.ts` est le seul à lire `DATABASE_URL`.
 *
 * ── Ce que ce module ne fait PAS ─────────────────────────────────────────────
 *
 * Il n'a aucune notion de file d'attente, de reprise sur échec ni de contenu :
 * ça vit dans `lib/data/mails.ts` (la file) et `lib/mail/modeles.ts` (les
 * textes). Ici, on ouvre une connexion et on remet un message — rien d'autre.
 */

/** Ce qu'on remet au serveur SMTP. Volontairement minimal. */
export interface MessageAEnvoyer {
  destinataire: string;
  sujet: string;
  /**
   * Corps en texte brut. Pas de HTML — cf. `lib/mail/modeles.ts` pour le
   * raisonnement (une seule colonne `corps`, et un lien visible en clair vaut
   * mieux qu'un lien masqué derrière un libellé).
   */
  corps: string;
}

/**
 * Configuration lue une fois, à la première utilisation.
 *
 * `hote` absent = envoi désactivé. C'est un état NORMAL, pas une panne : en
 * développement, et tant que les identifiants Brevo ne sont pas fournis, la
 * file `mail_en_attente` accumule les messages sans les émettre. On ne veut
 * surtout pas qu'une action métier échoue pour ça.
 */
interface ConfigurationSmtp {
  hote: string;
  port: number;
  /** Absents si le relais accepte un envoi non authentifié depuis une IP de confiance. */
  utilisateur?: string;
  motDePasse?: string;
  /** TLS d'emblée (port 465) ou STARTTLS après connexion en clair (587, 2525). */
  tlsImmediat: boolean;
  /** Vrai si l'on tolère un certificat non vérifiable. Voir l'avertissement. */
  certificatAutoSigne: boolean;
  expediteur: string;
  nomExpediteur: string;
}

function lireConfiguration(): ConfigurationSmtp | null {
  const hote = process.env.SMTP_HOTE?.trim();
  if (!hote) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `SMTP_PORT invalide : « ${process.env.SMTP_PORT} ». Attendu 587 (STARTTLS), ` +
        `465 (TLS immédiat) ou 2525.`
    );
  }

  // `secure` DÉDUIT du port, et non une variable de plus. C'est la source
  // d'erreur numéro un de nodemailer : `secure: true` sur le port 587 fait
  // attendre une poignée de main TLS à un serveur qui répond en clair, et la
  // connexion expire sans message clair. La règle est mécanique — 465 est le
  // seul port « SMTPS » (TLS dès l'ouverture, RFC 8314) — donc on l'applique
  // plutôt que de la confier à celui qui remplit le `.env`.
  const tlsImmediat = port === 465;

  const utilisateur = process.env.SMTP_UTILISATEUR?.trim() || undefined;
  const motDePasse = process.env.SMTP_MOT_DE_PASSE || undefined;

  // Un seul des deux renseigné est presque toujours une faute de saisie ; le
  // dire vaut mieux qu'un « 535 Authentication failed » une heure plus tard.
  if ((utilisateur && !motDePasse) || (!utilisateur && motDePasse)) {
    throw new Error(
      "SMTP_UTILISATEUR et SMTP_MOT_DE_PASSE vont ensemble : renseignez les deux, " +
        "ou aucun des deux si le relais accepte un envoi non authentifié."
    );
  }

  return {
    hote,
    port,
    utilisateur,
    motDePasse,
    tlsImmediat,
    certificatAutoSigne: process.env.SMTP_CERTIFICAT_AUTOSIGNE === "true",
    expediteur: process.env.MAIL_EXPEDITEUR?.trim() || "noreply@edc.cm",
    nomExpediteur: process.env.MAIL_NOM_EXPEDITEUR?.trim() || "EDC — Ordres de mission",
  };
}

/**
 * Transport mis en cache au niveau du module.
 *
 * `pool` reste à `false` (défaut) : une connexion est ouverte puis refermée à
 * chaque message. Pour le volume attendu — quelques invitations, et au pire
 * 400 lors d'un déploiement — c'est sans effet mesurable, et ça évite de garder
 * des sockets ouvertes que les rechargements à chaud du développement
 * abandonneraient. L'objet ne détient donc aucune ressource : le cacher ne sert
 * qu'à ne pas relire l'environnement à chaque envoi.
 */
let transport: Transporter | null = null;
let configuration: ConfigurationSmtp | null | undefined;

function obtenirConfiguration(): ConfigurationSmtp | null {
  if (configuration === undefined) configuration = lireConfiguration();
  return configuration;
}

/**
 * Vrai si un serveur SMTP est configuré.
 *
 * Les appelants s'en servent pour DÉGRADER proprement : sans SMTP, l'écran
 * d'invitation affiche le lien à transmettre à la main au lieu de prétendre
 * avoir envoyé un courriel.
 */
export function envoiConfigure(): boolean {
  return obtenirConfiguration() !== null;
}

function obtenirTransport(config: ConfigurationSmtp): Transporter {
  if (transport) return transport;

  transport = createTransport({
    host: config.hote,
    port: config.port,
    secure: config.tlsImmediat,

    // STARTTLS EXIGÉ sur les ports en clair. Sans ce drapeau, nodemailer
    // essaie STARTTLS puis, si le serveur ne l'annonce pas, **envoie en clair
    // sans rien dire** — c'est-à-dire qu'un lien valant mot de passe traverse
    // le réseau lisible. On préfère un échec bruyant.
    requireTLS: !config.tlsImmediat,

    auth: config.utilisateur
      ? { user: config.utilisateur, pass: config.motDePasse }
      : undefined,

    tls: {
      // ⚠️ DÉGRADATION DE SÉCURITÉ, assumée et bornée à un cas précis : un
      // Zimbra interne présente souvent un certificat auto-signé ou émis par
      // une autorité interne absente du magasin de Node. `false` accepte alors
      // le certificat sans le vérifier — le trafic reste CHIFFRÉ, mais plus
      // rien ne prouve l'identité du serveur, donc un intercepteur sur le
      // réseau interne pourrait se substituer à lui.
      //
      // À n'activer que si l'alternative est de renoncer à TLS. La vraie
      // solution est d'ajouter l'autorité de l'EDC au magasin du système
      // (`NODE_EXTRA_CA_CERTS`), ce qui rend cette variable inutile.
      rejectUnauthorized: !config.certificatAutoSigne,
    },

    // Sans ces bornes, un hôte injoignable fait attendre le délai par défaut du
    // système (~2 minutes sous Linux). Or l'envoi de l'invitation est ATTENDU
    // par une Server Action : l'administrateur resterait devant un bouton figé.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return transport;
}

/**
 * Remet un message au serveur SMTP.
 *
 * Lève en cas d'échec — c'est à l'appelant (`lib/data/mails.ts`) de décider si
 * l'erreur mérite une nouvelle tentative. La distinction est portée par
 * `estEchecDefinitif`.
 */
export async function remettreAuServeur(message: MessageAEnvoyer): Promise<void> {
  const config = obtenirConfiguration();
  if (!config) {
    throw new Error("Aucun serveur SMTP configuré (SMTP_HOTE absente).");
  }

  await obtenirTransport(config).sendMail({
    from: { name: config.nomExpediteur, address: config.expediteur },
    to: message.destinataire,
    subject: message.sujet,
    text: message.corps,

    // Une application ne doit pas recevoir de réponse humaine sur une adresse
    // `noreply`. Cet en-tête demande aux clients de messagerie de ne pas
    // produire d'accusé de réception ni de réponse automatique d'absence, ce
    // qui éviterait une boucle entre deux automates (RFC 3834).
    headers: { "Auto-Submitted": "auto-generated" },
  });
}

/**
 * Vrai si l'erreur vient de NOTRE configuration, et non du destinataire.
 *
 * ── Pourquoi cette troisième catégorie existe ────────────────────────────────
 *
 * Défaut trouvé en éprouvant la couche (22/08/2026) : `EAUTH` était rangé parmi
 * les échecs définitifs. Conséquence, avec un mot de passe SMTP erroné : le
 * premier balayage marquait **toute la file** définitivement abandonnée. Une
 * fois le `.env` corrigé, aucun de ces messages ne repartait — les invitations
 * étaient perdues, et rien à l'écran ne le disait.
 *
 * L'erreur d'attribution est là : un refus d'authentification ne dit rien du
 * destinataire, il dit que nos identifiants sont faux. Le message est donc
 * intact et doit rester exactement dans l'état où il était.
 *
 * ── `ESOCKET` recouvre DEUX causes opposées ──────────────────────────────────
 *
 * Mesuré sur les erreurs réelles de nodemailer 9 (22/08/2026) :
 *
 *   • hôte injoignable → `{ code: "ESOCKET", syscall: "connect", errno: -4078,
 *     message: "connect ECONNREFUSED …" }`
 *   • port en clair traité comme TLS → `{ code: "ESOCKET", command: "CONN",
 *     message: "…SSL routines:…wrong version number…" }` — **sans `syscall`**
 *
 * Le premier est temporaire (le serveur redémarre peut-être), le second vient de
 * notre `.env` et ne guérira pas seul. `syscall` les sépare : sa présence
 * signale un échec de la couche réseau, son absence un échec du protocole TLS.
 * Se contenter du `code` rangerait un serveur momentanément arrêté parmi les
 * fautes de configuration, et bloquerait la file sans raison.
 */
export function estEchecDeConfiguration(erreur: unknown): boolean {
  if (typeof erreur !== "object" || erreur === null) return false;

  const code = (erreur as { code?: unknown }).code;
  if (code === "EAUTH") return true;

  if (code === "ESOCKET") {
    // `syscall` présent = la connexion elle-même a échoué : temporaire.
    return (erreur as { syscall?: unknown }).syscall === undefined;
  }

  return false;
}

/**
 * Vrai si l'erreur ne se résoudra pas d'elle-même POUR CE DESTINATAIRE :
 * réessayer serait inutile.
 *
 * La frontière suit les codes SMTP (RFC 5321 §4.2.1) :
 *   • **5xx** = échec permanent — boîte inexistante, domaine inconnu, message
 *     refusé. Réessayer donnera exactement la même réponse.
 *   • **4xx** = échec temporaire — serveur saturé, quota momentané.
 *   • pas de code du tout = la connexion n'a pas abouti (`ECONNREFUSED`,
 *     `ETIMEDOUT`, DNS) : temporaire par nature.
 *
 * ⚠️ Les fautes de configuration sont écartées EN PREMIER, et non laissées à
 * l'ordre d'appel : un refus d'authentification porte `responseCode: 535`, donc
 * un 5xx. Sans cette exclusion explicite, la fonction le classerait « définitif »
 * — exactement le défaut que `estEchecDeConfiguration` corrige. Les deux
 * prédicats sont ainsi mutuellement exclusifs par construction.
 */
export function estEchecDefinitif(erreur: unknown): boolean {
  if (typeof erreur !== "object" || erreur === null) return false;
  if (estEchecDeConfiguration(erreur)) return false;

  const code = (erreur as { responseCode?: unknown }).responseCode;
  return typeof code === "number" && code >= 500 && code < 600;
}

/**
 * Vérifie que le serveur répond et accepte l'authentification, sans envoyer de
 * message. Utilisée par le script de diagnostic — jamais dans un chemin de
 * requête, puisqu'elle ouvre une connexion pour rien.
 */
export async function verifierConnexion(): Promise<
  { ok: true } | { ok: false; erreur: string }
> {
  const config = obtenirConfiguration();
  if (!config) return { ok: false, erreur: "SMTP_HOTE absente : envoi désactivé." };

  try {
    await obtenirTransport(config).verify();
    return { ok: true };
  } catch (erreur) {
    return { ok: false, erreur: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}

/** Décrit la configuration active, sans le mot de passe. Pour le diagnostic. */
export function decrireConfiguration(): string {
  const config = obtenirConfiguration();
  if (!config) return "envoi désactivé (SMTP_HOTE absente)";

  const chiffrement = config.tlsImmediat ? "TLS immédiat" : "STARTTLS exigé";
  const authentification = config.utilisateur
    ? `authentifié (${config.utilisateur})`
    : "non authentifié";
  const certificat = config.certificatAutoSigne ? ", certificat NON vérifié" : "";

  return `${config.hote}:${config.port} — ${chiffrement}, ${authentification}${certificat} — ` +
    `expéditeur ${config.nomExpediteur} <${config.expediteur}>`;
}
