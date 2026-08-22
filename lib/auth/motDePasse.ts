import "server-only";

import {
  argon2,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";

/**
 * Hachage et vérification des mots de passe.
 *
 * **Argon2id, via le module `crypto` natif de Node.** Aucune dépendance : ni
 * `bcrypt` (module natif à compiler, pénible sous Windows), ni `bcryptjs` (pur
 * JavaScript, donc lent et limité à 72 octets — un mot de passe plus long est
 * silencieusement tronqué).
 *
 * Argon2id est le premier choix de l'OWASP pour le stockage de mots de passe :
 * il résiste à la fois aux attaques par canal auxiliaire (grâce à sa partie
 * Argon2i) et au calcul sur matériel dédié, GPU et ASIC (grâce à sa partie
 * Argon2d), parce qu'il exige beaucoup de MÉMOIRE et pas seulement du temps
 * processeur.
 *
 * Vérifié sur cette machine : disponible, non expérimental (aucun avertissement
 * de dépréciation), ~90 ms par hachage avec les paramètres ci-dessous.
 */

// Paramètres recommandés par l'OWASP pour Argon2id : 19 MiB de mémoire,
// 2 passes, parallélisme 1. Le coût mémoire est ce qui protège réellement —
// augmenter les passes sans la mémoire n'apporte presque rien.
const MEMOIRE_KIO = 19456; // 19 MiB
const PASSES = 2;
const PARALLELISME = 1;
const LONGUEUR_EMPREINTE = 32; // octets
const LONGUEUR_SEL = 16; // octets

/**
 * Format stocké : `argon2id$<passes>$<memoire>$<parallelisme>$<sel>$<empreinte>`
 *
 * Les paramètres sont stockés AVEC l'empreinte, et non lus depuis les constantes
 * ci-dessus. C'est ce qui permettra de les durcir plus tard sans invalider les
 * mots de passe existants : chaque empreinte se vérifie avec les paramètres qui
 * ont servi à la produire.
 */
const PREFIXE = "argon2id";

function calculer(
  motDePasse: string,
  sel: Buffer,
  passes: number,
  memoire: number,
  parallelisme: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      {
        message: Buffer.from(motDePasse, "utf8"),
        nonce: sel,
        parallelism: parallelisme,
        tagLength: LONGUEUR_EMPREINTE,
        memory: memoire,
        passes,
      },
      (err: Error | null, empreinte: Buffer) => {
        if (err) reject(err);
        else resolve(empreinte);
      }
    );
  });
}

export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  // Un sel aléatoire par mot de passe : deux utilisateurs ayant choisi le même
  // mot de passe n'ont pas la même empreinte, ce qui interdit les tables
  // précalculées et rend une fuite bien moins exploitable.
  const sel = randomBytes(LONGUEUR_SEL);
  const empreinte = await calculer(motDePasse, sel, PASSES, MEMOIRE_KIO, PARALLELISME);
  return [
    PREFIXE,
    PASSES,
    MEMOIRE_KIO,
    PARALLELISME,
    sel.toString("base64url"),
    empreinte.toString("base64url"),
  ].join("$");
}

/**
 * Renvoie `true` si le mot de passe correspond.
 *
 * Ne lève JAMAIS d'exception sur une empreinte malformée : elle renvoie `false`.
 * Une erreur distinguerait « format invalide » de « mot de passe faux », ce qui
 * renseignerait un attaquant sur l'état du compte.
 */
export async function verifierMotDePasse(
  motDePasse: string,
  stocke: string
): Promise<boolean> {
  try {
    const [prefixe, passesTxt, memoireTxt, parallelismeTxt, selB64, empreinteB64] =
      stocke.split("$");
    if (prefixe !== PREFIXE) return false;

    const passes = Number(passesTxt);
    const memoire = Number(memoireTxt);
    const parallelisme = Number(parallelismeTxt);
    if (!Number.isInteger(passes) || !Number.isInteger(memoire) || !Number.isInteger(parallelisme)) {
      return false;
    }

    const sel = Buffer.from(selB64, "base64url");
    const attendue = Buffer.from(empreinteB64, "base64url");
    const calculee = await calculer(motDePasse, sel, passes, memoire, parallelisme);

    // timingSafeEqual et non `===` : une comparaison ordinaire s'arrête au
    // premier octet différent, et le temps de réponse révèle alors combien
    // d'octets étaient corrects. Elle exige des longueurs égales, d'où le test
    // préalable — lui-même sans risque, la longueur n'étant pas un secret.
    if (calculee.length !== attendue.length) return false;
    return timingSafeEqual(calculee, attendue);
  } catch {
    return false;
  }
}

/**
 * Indique si une empreinte a été produite avec des paramètres plus faibles que
 * les actuels. À appeler après une connexion réussie : c'est le bon moment pour
 * réhacher, puisque le mot de passe en clair est disponible.
 */
export function empreinteAReprendre(stocke: string): boolean {
  const [prefixe, passesTxt, memoireTxt] = stocke.split("$");
  if (prefixe !== PREFIXE) return true;
  return Number(passesTxt) < PASSES || Number(memoireTxt) < MEMOIRE_KIO;
}

// ---------------------------------------------------------------------------
// Jetons à usage unique (définition du mot de passe, renouvellement de session)
// ---------------------------------------------------------------------------

/**
 * Jeton opaque de 32 octets. `randomBytes` et non `Math.random` : ce dernier
 * n'est pas cryptographiquement sûr et ses valeurs sont prédictibles.
 */
export function genererJeton(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Empreinte d'un jeton, pour le stocker en base sans conserver sa valeur.
 *
 * SHA-256 sans sel suffit ICI, contrairement aux mots de passe : un jeton est
 * long et tiré au hasard, donc insensible aux attaques par dictionnaire ou par
 * table précalculée — ce contre quoi le sel et Argon2 protègent. En revanche il
 * faut bien hacher : une fuite de la base ne doit pas livrer des jetons de
 * session utilisables tels quels.
 */
export function hacherJeton(jeton: string): string {
  return createHash("sha256").update(jeton).digest("base64url");
}
