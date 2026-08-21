import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * Jeton d'accès : signature et vérification. **Sans `server-only` et sans
 * Prisma, volontairement.**
 *
 * Pourquoi ce module existe séparément de `session.ts` : le proxy (`proxy.ts`)
 * doit pouvoir vérifier un jeton d'accès pour filtrer les requêtes avant
 * qu'elles n'atteignent l'application, et cette vérification doit rester une
 * lecture de cookie — sans base, sans Prisma dans son paquet. C'est ce que
 * demande la doc pour le proxy :
 *
 *   « since Proxy runs on every route, including prefetched routes, it's
 *     important to only read the session from the cookie (optimistic checks),
 *     and avoid database checks to prevent performance issues. »
 *
 * D'où la coupure : ici, uniquement ce qui se calcule à partir du cookie et de
 * la clé de signature. Tout ce qui touche la base (renouvellement, révocation)
 * reste dans `session.ts`, qui est `server-only`.
 *
 * NOTE (vérifié le 21/08/2026) : `server-only` n'aurait PAS empêché le proxy
 * d'importer `session.ts` — le proxy tourne sur le runtime Node depuis Next 16
 * et la garde ne s'y déclenche pas. La séparation est donc là pour la raison
 * ci-dessus, pas par contrainte de l'outillage.
 */

export const COOKIE_ACCES = "edc_om_acces";
export const COOKIE_RENOUVELLEMENT = "edc_om_renouvellement";

/**
 * En-tête par lequel le proxy publie le chemin demandé à destination du rendu.
 *
 * Déclaré ici et non dans `proxy.ts` pour que `garde.ts` puisse le lire sans
 * importer le proxy — ce qui ferait entrer `next/server` dans le graphe de
 * dépendances des composants serveur pour une seule constante.
 */
export const EN_TETE_CHEMIN = "x-edc-chemin";

export const DUREE_ACCES_SECONDES = 15 * 60; // 15 min
export const DUREE_RENOUVELLEMENT_JOURS = 30;

export type Role = "ADMINISTRATEUR" | "UTILISATEUR";

export interface Session {
  idUtilisateur: string; // BigInt sérialisé : un BigInt ne passe pas dans un JWT
  email: string;
  role: Role;
  /** Matricule de l'employé rattaché, absent pour un compte purement technique. */
  matricule: string | null;
}

/**
 * Options communes aux deux cookies de session.
 *
 * Fonction et non constante : `NODE_ENV` doit être lu à l'appel. Figé au
 * chargement du module, `secure` serait résolu au moment du build et non à
 * l'exécution.
 */
export function optionsCookie() {
  return {
    httpOnly: true, // inaccessible à document.cookie, donc au XSS
    secure: process.env.NODE_ENV === "production", // en dev, localhost est en HTTP
    // "lax" et non "strict" : "strict" n'envoie aucun cookie lors d'une
    // navigation venue d'un lien externe, ce qui déconnecterait l'utilisateur
    // arrivant depuis le lien d'un courriel — précisément le flux de
    // définition du mot de passe. "lax" bloque toujours les requêtes POST
    // inter-sites, donc le CSRF qui compte ici.
    sameSite: "lax" as const,
    path: "/",
  };
}

/**
 * Clé de signature. Lue paresseusement et non au chargement du module : un
 * `throw` au niveau module ferait échouer le build de pages qui n'ont rien à
 * voir avec l'authentification, avec un message peu clair.
 */
export function cleSignature(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET absente ou trop courte (32 caractères minimum). " +
        "Générer une valeur avec : node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signerAcces(session: Session): Promise<string> {
  return new SignJWT({ ...session } as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DUREE_ACCES_SECONDES}s`)
    .sign(cleSignature());
}

/**
 * Vérifie un jeton d'accès. Renvoie `null` si absent, expiré, ou signé avec une
 * autre clé — jamais d'exception, pour que l'appelant traite tous les cas
 * d'échec de la même façon.
 */
export async function lireJetonAcces(jeton: string | undefined): Promise<Session | null> {
  if (!jeton) return null;
  try {
    const { payload } = await jwtVerify(jeton, cleSignature(), {
      algorithms: ["HS256"], // liste explicite : interdit qu'un jeton force `alg: none`
    });
    const { idUtilisateur, email, role, matricule } = payload as unknown as Session;
    if (!idUtilisateur || !email || (role !== "ADMINISTRATEUR" && role !== "UTILISATEUR")) {
      return null;
    }
    return { idUtilisateur, email, role, matricule: matricule ?? null };
  } catch {
    return null;
  }
}

export const NOMS_COOKIES = {
  acces: COOKIE_ACCES,
  renouvellement: COOKIE_RENOUVELLEMENT,
} as const;
