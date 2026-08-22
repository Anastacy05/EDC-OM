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

import { COOKIE_ACCES, COOKIE_RENOUVELLEMENT } from "@/lib/auth/jeton";

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
   */
  async soumettre(chemin: string, champs: Record<string, string>): Promise<Reponse> {
    const corps = new FormData();
    for (const [nom, valeur] of Object.entries(champs)) corps.append(nom, valeur);

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
    champs: Record<string, string> = {}
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
