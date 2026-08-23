/**
 * Client HTTP pour les tests de bout en bout.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Sans lui, chaque banc d'essai réimplémentait les mêmes quatre choses : le
 * bocal à cookies, l'extraction des champs `$ACTION_*`, la soumission en
 * multipart, la connexion administrateur. Elles ont été réécrites quatre fois
 * dans la seule journée du 22/08/2026, avec à chaque fois les mêmes bévues —
 * dont deux ont coûté plusieurs cycles de diagnostic :
 *
 *   1. **Le nom du cookie de session** (`edc_om_acces`, pas `edc_acces`) : la
 *      connexion semblait échouer alors qu'elle réussissait.
 *   2. **`multipart/form-data` et non urlencodé** : les formulaires de Next
 *      portent `encType="multipart/form-data"`, et un corps urlencodé est
 *      accepté avec un **HTTP 200 sans que l'action s'exécute**. L'échec est
 *      donc silencieux — le pire des cas.
 *
 * Les deux sont désormais réglées ici, une fois pour toutes.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { COOKIE_ACCES, COOKIE_RENOUVELLEMENT } from "@/lib/auth/jeton";
import { DOSSIER_BUILD } from "./serveur.mts";

/**
 * Adresse par défaut, pour un serveur déjà lancé à la main.
 *
 * Les suites qui démarrent leur propre serveur passent son URL au constructeur :
 * le port est attribué par le système (port 0), donc il n'est connu qu'à
 * l'exécution et ne peut pas vivre dans une constante de module.
 */
export const BASE = process.env.TEST_URL ?? "http://localhost:3000";

export interface Reponse {
  statut: number;
  /** En-tête `Location` d'une redirection, absent sinon. */
  emplacement: string | null;
  corps: string;
}

/**
 * Session cliente : un bocal à cookies plus les requêtes qui vont avec.
 *
 * Une CLASSE et non des fonctions de module : plusieurs sessions doivent
 * coexister dans un même fichier de test — typiquement l'administrateur et le
 * titulaire d'un lien d'invitation, qui ne doit justement pas être connecté.
 * Un état de module les mélangerait, et le test passerait pour de mauvaises
 * raisons.
 */
export class Session {
  private cookies = new Map<string, string>();
  private readonly base: string;

  constructor(base: string = BASE) {
    // La barre oblique finale est retirée : sinon `${base}/connexion` produirait
    // « //connexion », que Next traite comme une URL protocole-relative.
    this.base = base.replace(/\/$/, "");
  }

  /** Adresse du serveur interrogé, utile pour retirer le préfixe d'un lien reçu. */
  get url(): string {
    return this.base;
  }

  /** Vrai si un cookie d'accès est posé. */
  get connectee(): boolean {
    return this.cookies.has(COOKIE_ACCES);
  }

  /** Noms des cookies détenus, pour les messages d'échec. */
  get nomsCookies(): string[] {
    return [...this.cookies.keys()];
  }

  /** Oublie la session, sans toucher au serveur. */
  vider(): void {
    this.cookies.clear();
  }

  /** Copie les cookies d'une autre session (pour reprendre une identité). */
  reprendre(autre: Session): void {
    this.cookies = new Map(autre.cookies);
  }

  private enTete(): string {
    return [...this.cookies].map(([nom, valeur]) => `${nom}=${valeur}`).join("; ");
  }

  /**
   * Absorbe les `Set-Cookie` de la réponse.
   *
   * `getSetCookie()` et non `headers.get("set-cookie")` : ce dernier CONCATÈNE
   * les en-têtes multiples en une seule chaîne séparée par des virgules, ce qui
   * est indécodable dès qu'une date d'expiration en contient une. Une réponse de
   * connexion pose deux cookies : sans cette méthode, on en perd un.
   */
  private absorber(reponse: Response): void {
    for (const brut of reponse.headers.getSetCookie()) {
      const [paire] = brut.split(";");
      const separateur = paire.indexOf("=");
      if (separateur === -1) continue;

      const nom = paire.slice(0, separateur).trim();
      const valeur = paire.slice(separateur + 1).trim();

      // Suppression : valeur vide ou Max-Age=0. C'est ainsi qu'une déconnexion
      // se manifeste, et l'ignorer laisserait la session « connectée » à tort.
      if (valeur === "" || /max-age\s*=\s*0/i.test(brut)) this.cookies.delete(nom);
      else this.cookies.set(nom, valeur);
    }
  }

  async obtenir(chemin: string): Promise<Reponse> {
    const reponse = await fetch(this.base + chemin, {
      headers: { cookie: this.enTete() },
      // `manual` : on veut CONSTATER la redirection. En la suivant, un test de
      // garde d'autorisation verrait un 200 sur /connexion et croirait la page
      // protégée accessible.
      redirect: "manual",
    });
    this.absorber(reponse);
    return {
      statut: reponse.status,
      emplacement: reponse.headers.get("location"),
      corps: await reponse.text(),
    };
  }

  /**
   * Soumet un formulaire de Server Action.
   *
   * ⚠️ `FormData` et NON `URLSearchParams` : voir l'en-tête du fichier. On laisse
   * `fetch` poser lui-même l'en-tête `content-type` avec sa frontière — l'écrire
   * à la main produit une frontière qui ne correspond pas au corps.
   *
   * Une valeur peut être un TABLEAU : le champ est alors répété, ce qui est la seule
   * façon d'envoyer plusieurs participants à un ordre de mission (`getAll`).
   * `append` et non `set` — `set` écraserait la valeur précédente, et le serveur ne
   * verrait qu'un seul matricule.
   */
  async soumettre(
    chemin: string,
    champs: Record<string, string | string[]>
  ): Promise<Reponse> {
    const corps = new FormData();
    for (const [nom, valeur] of Object.entries(champs)) {
      if (Array.isArray(valeur)) for (const v of valeur) corps.append(nom, v);
      else corps.append(nom, valeur);
    }

    const reponse = await fetch(this.base + chemin, {
      method: "POST",
      headers: { cookie: this.enTete() },
      body: corps,
      redirect: "manual",
    });
    this.absorber(reponse);
    return {
      statut: reponse.status,
      emplacement: reponse.headers.get("location"),
      corps: await reponse.text(),
    };
  }

  /**
   * POST en JSON, pour les Route Handlers (`/api/*`).
   *
   * Distinct de `soumettre` : une route d'API attend `application/json`, pas un
   * corps multipart. Renvoie aussi le type de contenu, car c'est ce qui distingue un
   * document Word d'un message d'erreur, ainsi que les octets bruts — le contenu du
   * `.docx` est la seule preuve qu'une mention de statut y figure vraiment.
   */
  async poster(
    chemin: string,
    charge: unknown
  ): Promise<
    Reponse & {
      typeContenu: string | null;
      octets: number;
      /** En-tête `Content-Disposition`, qui porte le nom de fichier proposé. */
      disposition: string | null;
      /** Corps brut, pour ouvrir une archive ou compter des octets. */
      binaire: Uint8Array;
    }
  > {
    const reponse = await fetch(this.base + chemin, {
      method: "POST",
      headers: { cookie: this.enTete(), "content-type": "application/json" },
      body: JSON.stringify(charge),
      redirect: "manual",
    });
    this.absorber(reponse);
    const donnees = await reponse.arrayBuffer();
    const typeContenu = reponse.headers.get("content-type");
    return {
      statut: reponse.status,
      emplacement: reponse.headers.get("location"),
      // Le corps n'est décodé en texte que s'il n'est pas binaire : décoder un
      // `.docx` en UTF-8 produirait du bruit illisible dans les messages d'échec.
      corps: typeContenu?.includes("json") ? new TextDecoder().decode(donnees) : "",
      typeContenu,
      octets: donnees.byteLength,
      disposition: reponse.headers.get("content-disposition"),
      binaire: new Uint8Array(donnees),
    };
  }

  /**
   * Appelle une Server Action **directement**, comme le navigateur le fait après
   * hydratation.
   *
   * ── Pourquoi cette méthode est nécessaire ──────────────────────────────────
   *
   * `soumettreFormulaire` couvre les actions dont le `<form>` est rendu côté
   * serveur : il suffit d'en recopier les champs cachés. Mais le formulaire
   * d'enregistrement d'un ordre de mission n'apparaît qu'à l'étape « aperçu »,
   * atteinte par un clic dans un composant client — il n'est donc PAS dans le HTML
   * initial, et il n'y a aucun champ caché à recopier. Sans cette méthode, la
   * création d'un OM — le cœur de l'étape 8 — ne serait éprouvée par aucun test de
   * bout en bout.
   *
   * Elle sert aussi à ce qu'aucun formulaire ne permet : **solliciter une action
   * réservée sans passer par l'écran**. C'est exactement la menace décrite par la
   * doc Next (« Server Functions are reachable via direct POST requests »), donc
   * exactement ce qu'un test de garde doit reproduire.
   *
   * ── Le protocole ───────────────────────────────────────────────────────────
   *
   * En-tête `Next-Action: <identifiant>` plus un corps multipart portant les
   * arguments sérialisés par React :
   *
   *     "_1_<champ>" = <valeur>               ← les entrées du FormData n° 1
   *     "0"          = ["$undefined","$K1"]   ← les deux arguments de l'action
   *
   * Le premier argument est l'état précédent d'`useActionState` (`undefined` au
   * premier envoi), le second le `FormData`. `$K1` est la référence de React vers
   * un FormData dont les entrées portent le préfixe `_1_`.
   *
   * ⚠️ **L'ordre compte** : les entrées `_1_*` doivent précéder la racine `"0"`.
   * Le serveur décode le multipart **au fil du flux** (busboy) et résout la
   * référence `$K1` au moment où il lit la racine : ce qui arrive après est perdu.
   * Avec la racine en tête, l'action reçoit un FormData **vide** — et comme aucune
   * erreur n'est levée, l'échec se lit alors comme « tous les champs sont
   * obligatoires », ce qui envoie chercher très loin de la cause. Constaté le
   * 23/08/2026.
   *
   * ⚠️ Cette forme a été **vérifiée** contre `encodeReply` / `decodeReply` de la
   * copie de `react-server-dom` embarquée par Next 16.2.12, plutôt que devinée. On
   * ne l'importe pas pour autant : `next/dist/compiled/…` est un chemin interne,
   * dont le nom dépend même du bundler (turbopack / webpack). Si le format
   * changeait, le test échouerait bruyamment — ce qui est le comportement voulu.
   */
  async appelerAction(
    chemin: string,
    identifiantAction: string,
    champs: Record<string, string | string[]> = {}
  ): Promise<Reponse & { redirection: string | null }> {
    const corps = new FormData();
    for (const [nom, valeur] of Object.entries(champs)) {
      if (Array.isArray(valeur)) for (const v of valeur) corps.append(`_1_${nom}`, v);
      else corps.append(`_1_${nom}`, valeur);
    }
    // La racine en DERNIER : voir l'avertissement ci-dessus.
    corps.append("0", JSON.stringify(["$undefined", "$K1"]));

    const reponse = await fetch(this.base + chemin, {
      method: "POST",
      headers: { cookie: this.enTete(), "Next-Action": identifiantAction },
      body: corps,
      redirect: "manual",
    });
    this.absorber(reponse);

    // Une action qui redirige ne répond PAS 303 : le navigateur doit d'abord
    // recevoir le flux, donc Next annonce la destination dans un en-tête et laisse
    // le routeur client naviguer. Sans le lire, un test de création n'aurait aucun
    // moyen de connaître l'identifiant de l'OM créé.
    const annonce = reponse.headers.get("x-action-redirect");
    return {
      statut: reponse.status,
      emplacement: reponse.headers.get("location"),
      corps: await reponse.text(),
      // L'en-tête porte parfois un mode de navigation suffixé (« ;push »).
      redirection: annonce ? annonce.split(";")[0] : reponse.headers.get("location"),
    };
  }

  /**
   * Soumet le formulaire de `chemin` qui contient `marqueur`, en y ajoutant
   * `champs`. Enchaîne lecture de la page, isolation du bon formulaire,
   * récupération de ses champs cachés et envoi.
   *
   * C'est le geste que TOUS les tests d'action répètent ; le factoriser évite de
   * réintroduire l'une des bévues citées en tête de fichier.
   */
  async soumettreFormulaire(
    chemin: string,
    marqueur: string,
    champs: Record<string, string | string[]> = {}
  ): Promise<Reponse> {
    const page = await this.obtenir(chemin);
    if (page.statut !== 200) {
      throw new Error(
        `${chemin} a répondu ${page.statut}${
          page.emplacement ? ` (vers ${page.emplacement})` : ""
        } — impossible d'y lire un formulaire.`
      );
    }
    const fragment = isolerFormulaire(page.corps, marqueur);
    return this.soumettre(chemin, { ...champsCaches(fragment), ...champs });
  }

  /**
   * Ouvre une session pour ce compte. Lève si la connexion échoue, plutôt que de
   * laisser les assertions suivantes échouer sur une cause déplacée.
   */
  async connecter(email: string, motDePasse: string): Promise<void> {
    const reponse = await this.soumettreFormulaire("/connexion", 'name="motDePasse"', {
      email,
      motDePasse,
    });

    if (!this.connectee) {
      // Le message d'erreur de l'application est repris tel quel : c'est
      // l'information utile (mot de passe faux ? compte désactivé ? base
      // injoignable ?), et la chercher à la main dans le flux RSC est pénible.
      const motif =
        /Adresse ou mot de passe incorrect|momentanément indisponible|Trop de tentatives/.exec(
          reponse.corps
        )?.[0] ?? `HTTP ${reponse.statut}`;
      throw new Error(`Connexion refusée pour ${email} : ${motif}`);
    }
  }

  async deconnecter(): Promise<void> {
    await this.soumettreFormulaire("/", "Se déconnecter").catch(() => {});
    this.vider();
  }
}

/**
 * Position d'un texte dans du HTML, en tolérant les entités.
 *
 * Cherche d'abord tel quel — le cas courant, et le moins coûteux. Si le marqueur
 * contient une apostrophe ou un guillemet, il est réessayé sous sa forme échappée :
 * React écrit `l&#x27;invitation`, donc un marqueur écrit naturellement
 * (« l'invitation ») ne correspondrait à rien.
 *
 * On ne décode PAS le HTML pour chercher dedans : ça décalerait toutes les
 * positions, et `isolerFormulaire` a besoin d'indices valides dans la chaîne
 * d'origine.
 */
function trouver(html: string, marqueur: string): number {
  const direct = html.indexOf(marqueur);
  if (direct !== -1) return direct;

  const echappe = marqueur
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#x27;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return echappe === marqueur ? -1 : html.indexOf(echappe);
}

/**
 * Isole UN formulaire du HTML, par un marqueur qui lui est propre.
 *
 * Le marqueur peut être AVANT ou DANS le formulaire : on prend le `<form>` qui
 * l'entoure s'il y en a un, sinon le premier qui suit. C'est nécessaire parce que
 * les deux dispositions existent dans l'application — le libellé d'un bouton est
 * dans son formulaire, tandis que l'adresse d'un administrateur le précède dans sa
 * ligne de liste.
 *
 * Les apostrophes et guillemets du marqueur sont tolérés : ils sont réessayés sous
 * leur forme échappée (`&#x27;`).
 *
 * ⚠️ Le marqueur doit être UNIQUE sur la page. Une page de fiche employé porte
 * trois formulaires ; ramasser tous les champs cachés de la page mélangerait leurs
 * `$ACTION_*`, et **Next exécuterait une action arbitraire** — constaté le
 * 21/08/2026, avec une désactivation déclenchée à la place d'une modification.
 *
 * Bons marqueurs : un libellé de bouton, une classe propre au bouton
 * (`bg-red-700`), une adresse de courriel. Mauvais marqueur : un mot qui apparaît
 * aussi dans un titre de section.
 */
export function isolerFormulaire(html: string, marqueur: string): string {
  const position = trouver(html, marqueur);
  if (position === -1) {
    throw new Error(`Marqueur « ${marqueur} » absent de la page.`);
  }

  // Cas 1 : le marqueur est DANS un formulaire — le `<form>` ouvert juste avant
  // n'est pas encore refermé.
  const ouvertureAvant = html.lastIndexOf("<form", position);
  if (ouvertureAvant !== -1) {
    const fermeture = html.indexOf("</form>", ouvertureAvant);
    if (fermeture > position) return html.slice(ouvertureAvant, fermeture);
  }

  // Cas 2 : le marqueur PRÉCÈDE le formulaire (ligne de liste, en-tête de carte).
  const ouvertureApres = html.indexOf("<form", position);
  if (ouvertureApres !== -1) {
    const fermeture = html.indexOf("</form>", ouvertureApres);
    if (fermeture !== -1) return html.slice(ouvertureApres, fermeture);
  }

  throw new Error(
    `Aucun <form> trouvé autour ni après « ${marqueur} ». Le formulaire n'est ` +
      `peut-être pas rendu — une action réservée, par exemple.`
  );
}

/**
 * Vrai si la page contient ce texte, entités décodées.
 *
 * À PRÉFÉRER à `page.corps.includes(...)` dans les tests : cette dernière échoue
 * silencieusement sur toute apostrophe, et une assertion d'absence réussirait
 * alors sans rien prouver.
 */
export function pageContient(reponse: Reponse, texte: string): boolean {
  return decoderEntites(reponse.corps).includes(decoderEntites(texte));
}

/**
 * Champs cachés d'un fragment de formulaire, dont les `$ACTION_*` par lesquels
 * Next identifie la Server Action à exécuter. Sans eux, la requête est un POST
 * ordinaire : la page se rend à nouveau et rien ne s'exécute.
 */
export function champsCaches(fragment: string): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const balise of fragment.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const nom = balise[0].match(/name="([^"]+)"/)?.[1];
    if (!nom) continue;
    champs[nom] = decoderEntites(balise[0].match(/value="([^"]*)"/)?.[1] ?? "");
  }
  return champs;
}

/**
 * Décode les entités HTML.
 *
 * ⚠️ Les entités NUMÉRIQUES comptent autant que les nommées : React échappe
 * l'apostrophe en `&#x27;`, jamais en `&apos;`. Sans elles, chercher
 * « Créer et envoyer l'invitation » dans une page ne trouve rien — et une
 * assertion d'ABSENCE réussit alors pour la mauvaise raison, ce qui est bien pire
 * qu'un échec. Constaté le 22/08/2026 : deux tests passaient à tort.
 *
 * `&amp;` en dernier, et ce n'est pas un détail : le décoder d'abord
 * transformerait `&amp;quot;` en `&quot;` puis en `"`, alors que la valeur
 * d'origine était le texte `&quot;`. Les valeurs `$ACTION_*` sont du JSON plein
 * de guillemets échappés — l'ordre y est donc visible.
 */
export function decoderEntites(valeur: string): string {
  return valeur
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/**
 * Cherche un texte dans une réponse de Server Action.
 *
 * Le corps est un flux RSC, pas du HTML : les chaînes y sont échappées à la
 * façon JSON. Chercher `L'envoi a échoué` échoue donc là où le flux contient
 * `L\'envoi a échoué`. On normalise les deux côtés — échappements JSON ET entités
 * HTML, le flux pouvant contenir les deux.
 */
export function contient(reponse: Reponse, texte: string): boolean {
  const normaliser = (s: string) =>
    decoderEntites(s.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, "\n"));
  return normaliser(reponse.corps).includes(normaliser(texte));
}

/** Premier lien de définition de mot de passe trouvé dans une réponse, ou `null`. */
export function lienMotDePasse(reponse: Reponse): string | null {
  return reponse.corps.match(/https?:\/\/[^"'\\ ]+\/mot-de-passe\/[A-Za-z0-9_-]+/)?.[0] ?? null;
}

export { COOKIE_ACCES, COOKIE_RENOUVELLEMENT };

// ---------------------------------------------------------------------------
// Identifiant d'une Server Action
// ---------------------------------------------------------------------------

/** Une lecture des morceaux compilés suffit pour toute la suite. */
const identifiantsActions = new Map<string, string>();

/**
 * Identifiant `Next-Action` d'une Server Action, retrouvé dans le paquet compilé.
 *
 * ── Pourquoi le chercher, et pourquoi c'est fiable ─────────────────────────────
 *
 * Cet identifiant est un condensé calculé à la compilation : il n'existe ni dans le
 * code source ni dans aucun manifeste nommé. Il est en revanche écrit en clair dans
 * les morceaux JavaScript envoyés au navigateur, **accompagné du nom de l'export** —
 * Next le passe à `createServerReference` pour produire des messages d'erreur
 * lisibles :
 *
 *     createServerReference)("60482081…", r.callServer, void 0,
 *                            r.findSourceMapURL, "actionCreerOM")
 *
 * C'est ce nom qui rend la recherche sûre : on ne retient pas « le premier
 * identifiant trouvé », on retient celui qui porte le nom demandé. Un export
 * renommé ou disparu fait échouer le test au lieu d'en appeler un autre.
 *
 * ⚠️ Lit le répertoire de compilation des tests (`DOSSIER_BUILD`), donc exige que
 * `tests/aide/preparer.mts` ait tourné — ce que `npm run test:e2e` fait avant tout.
 */
export async function idAction(nomExport: string): Promise<string> {
  const connu = identifiantsActions.get(nomExport);
  if (connu) return connu;

  const racine = path.join(process.cwd(), DOSSIER_BUILD, "static");
  let fichiers: string[];
  try {
    fichiers = (await readdir(racine, { recursive: true }))
      .filter((f) => f.endsWith(".js"))
      .map((f) => path.join(racine, f));
  } catch {
    throw new Error(
      `Répertoire de compilation « ${racine} » introuvable. Lancez ` +
        `\`npx tsx tests/aide/preparer.mts\` (ou \`npm run test:e2e\`) d'abord.`
    );
  }

  // Le nom est ancré à la fin : `[^)]*` ne peut donc pas franchir la parenthèse
  // fermante et rattacher l'identifiant d'un appel voisin.
  const motif = new RegExp(
    `createServerReference\\)\\("([0-9a-f]+)"[^)]*"${nomExport}"\\)`
  );

  for (const fichier of fichiers) {
    const trouve = motif.exec(await readFile(fichier, "utf8"));
    if (trouve) {
      identifiantsActions.set(nomExport, trouve[1]);
      return trouve[1];
    }
  }

  throw new Error(
    `Aucune Server Action nommée « ${nomExport} » dans ${DOSSIER_BUILD}. ` +
      `L'export a-t-il été renommé, ou n'est-il plus référencé par un composant client ?`
  );
}
