import "server-only";

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/data/client";
import { genererJeton, hacherJeton } from "@/lib/auth/motDePasse";

/**
 * Sessions : jeton d'accès court + jeton de renouvellement révocable.
 *
 * ── Pourquoi deux jetons ─────────────────────────────────────────────────────
 *
 * Un seul jeton signé de longue durée serait plus simple, mais IRRÉVOCABLE :
 * désactiver le compte d'un employé qui quitte l'EDC ne l'empêcherait pas de
 * continuer à valider des OM jusqu'à l'expiration. Inacceptable pour un acte
 * d'autorité.
 *
 * À l'inverse, vérifier une session en base à chaque requête interdirait le
 * fonctionnement hors ligne, qui est une exigence du projet.
 *
 * D'où le compromis :
 *   • jeton d'ACCÈS   — JWT signé, 15 min, cookie httpOnly, JAMAIS en base.
 *                       Se vérifie sans toucher la base, donc valable hors ligne.
 *   • jeton de RENOUVELLEMENT — opaque, 30 jours, HACHÉ en base, révocable.
 *                       Consulté seulement quand le réseau est là.
 *
 * Conséquence : révocation effective en 15 minutes au pire, et l'application
 * reste utilisable hors ligne le temps du jeton d'accès en cours.
 */

const COOKIE_ACCES = "edc_om_acces";
const COOKIE_RENOUVELLEMENT = "edc_om_renouvellement";

const DUREE_ACCES_SECONDES = 15 * 60; // 15 min
const DUREE_RENOUVELLEMENT_JOURS = 30;

export type Role = "ADMINISTRATEUR" | "UTILISATEUR";

export interface Session {
  idUtilisateur: string; // BigInt sérialisé : un BigInt ne passe pas dans un JWT
  email: string;
  role: Role;
  /** Matricule de l'employé rattaché, absent pour un compte purement technique. */
  matricule: string | null;
}

/**
 * Clé de signature. Lue paresseusement et non au chargement du module : un
 * `throw` au niveau module ferait échouer le build de pages qui n'ont rien à
 * voir avec l'authentification, avec un message peu clair.
 */
function cleSignature(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET absente ou trop courte (32 caractères minimum). " +
        "Générer une valeur avec : node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
    );
  }
  return new TextEncoder().encode(secret);
}

// ---------------------------------------------------------------------------
// Jeton d'accès (JWT)
// ---------------------------------------------------------------------------

async function signerAcces(session: Session): Promise<string> {
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

// ---------------------------------------------------------------------------
// Ouverture, renouvellement et fermeture de session
// ---------------------------------------------------------------------------

/**
 * Pose les deux cookies après une authentification réussie, et enregistre le
 * jeton de renouvellement en base.
 */
export async function ouvrirSession(
  session: Session,
  contexte: { agentUtilisateur?: string; adresseIp?: string } = {}
): Promise<void> {
  const jetonRenouvellement = genererJeton();
  const expireLe = new Date(
    Date.now() + DUREE_RENOUVELLEMENT_JOURS * 24 * 60 * 60 * 1000
  );

  await prisma.sessionRenouvellement.create({
    data: {
      jetonHash: hacherJeton(jetonRenouvellement), // le clair ne touche jamais la base
      idUtilisateur: BigInt(session.idUtilisateur),
      expireLe,
      agentUtilisateur: contexte.agentUtilisateur?.slice(0, 300) ?? null,
      adresseIp: contexte.adresseIp ?? null,
    },
  });

  const boite = await cookies();
  const communs = {
    httpOnly: true, // inaccessible à document.cookie, donc au XSS
    secure: process.env.NODE_ENV === "production", // en dev, localhost est en HTTP
    // "lax" et non "strict" : "strict" n'envoie aucun cookie lors d'une
    // navigation venue d'un lien externe, ce qui déconnecterait l'utilisateur
    // arrivant depuis le lien d'un courriel. "lax" bloque toujours les
    // requêtes POST inter-sites, donc le CSRF qui compte ici.
    sameSite: "lax" as const,
    path: "/",
  };

  boite.set(COOKIE_ACCES, await signerAcces(session), {
    ...communs,
    maxAge: DUREE_ACCES_SECONDES,
  });
  boite.set(COOKIE_RENOUVELLEMENT, jetonRenouvellement, {
    ...communs,
    maxAge: DUREE_RENOUVELLEMENT_JOURS * 24 * 60 * 60,
  });
}

/**
 * Échange un jeton de renouvellement contre un nouveau jeton d'accès.
 *
 * C'est ICI que la révocation prend effet : on relit l'état du compte en base.
 * Un compte désactivé, une session révoquée ou expirée n'obtiennent pas de
 * nouveau jeton d'accès, et la session s'éteint au plus tard 15 minutes après.
 *
 * ⚠️ ROTATION : le jeton de renouvellement est remplacé à chaque usage. Si un
 * jeton volé est réutilisé après que le titulaire légitime s'en est servi, il
 * est déjà révoqué — la fenêtre d'exploitation se réduit à un seul usage.
 */
export async function renouvelerSession(): Promise<Session | null> {
  const boite = await cookies();
  const jeton = boite.get(COOKIE_RENOUVELLEMENT)?.value;
  if (!jeton) return null;

  const enregistrement = await prisma.sessionRenouvellement.findUnique({
    where: { jetonHash: hacherJeton(jeton) },
    include: {
      utilisateur: {
        select: { id: true, email: true, role: true, matricule: true, actif: true },
      },
    },
  });

  if (
    !enregistrement ||
    enregistrement.revoqueeLe !== null ||
    enregistrement.expireLe < new Date() ||
    !enregistrement.utilisateur.actif // le compte a été désactivé entre-temps
  ) {
    return null;
  }

  const session: Session = {
    idUtilisateur: enregistrement.utilisateur.id.toString(),
    email: enregistrement.utilisateur.email,
    role: enregistrement.utilisateur.role as Role,
    matricule: enregistrement.utilisateur.matricule,
  };

  // Rotation : l'ancien jeton est révoqué, un nouveau est émis.
  const nouveau = genererJeton();
  await prisma.$transaction([
    prisma.sessionRenouvellement.update({
      where: { jetonHash: enregistrement.jetonHash },
      data: { revoqueeLe: new Date(), dernierUsageLe: new Date() },
    }),
    prisma.sessionRenouvellement.create({
      data: {
        jetonHash: hacherJeton(nouveau),
        idUtilisateur: enregistrement.idUtilisateur,
        expireLe: enregistrement.expireLe, // pas de prolongation infinie
        agentUtilisateur: enregistrement.agentUtilisateur,
        adresseIp: enregistrement.adresseIp,
      },
    }),
  ]);

  const communs = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
  boite.set(COOKIE_ACCES, await signerAcces(session), {
    ...communs,
    maxAge: DUREE_ACCES_SECONDES,
  });
  boite.set(COOKIE_RENOUVELLEMENT, nouveau, {
    ...communs,
    maxAge: Math.max(
      0,
      Math.floor((enregistrement.expireLe.getTime() - Date.now()) / 1000)
    ),
  });

  return session;
}

/** Ferme la session courante : révoque en base ET efface les cookies. */
export async function fermerSession(): Promise<void> {
  const boite = await cookies();
  const jeton = boite.get(COOKIE_RENOUVELLEMENT)?.value;

  if (jeton) {
    // updateMany et non update : un jeton déjà absent ne doit pas faire échouer
    // la déconnexion. Se déconnecter doit toujours réussir.
    await prisma.sessionRenouvellement.updateMany({
      where: { jetonHash: hacherJeton(jeton), revoqueeLe: null },
      data: { revoqueeLe: new Date() },
    });
  }

  boite.delete(COOKIE_ACCES);
  boite.delete(COOKIE_RENOUVELLEMENT);
}

/** Révoque toutes les sessions d'un utilisateur : désactivation du compte. */
export async function revoquerToutesLesSessions(idUtilisateur: bigint): Promise<number> {
  const { count } = await prisma.sessionRenouvellement.updateMany({
    where: { idUtilisateur, revoqueeLe: null },
    data: { revoqueeLe: new Date() },
  });
  return count;
}

export const NOMS_COOKIES = {
  acces: COOKIE_ACCES,
  renouvellement: COOKIE_RENOUVELLEMENT,
} as const;
