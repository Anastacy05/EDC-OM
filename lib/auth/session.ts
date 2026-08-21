import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/data/client";
import { genererJeton, hacherJeton } from "@/lib/auth/motDePasse";
import {
  COOKIE_ACCES,
  COOKIE_RENOUVELLEMENT,
  DUREE_ACCES_SECONDES,
  DUREE_RENOUVELLEMENT_JOURS,
  cleSignature,
  lireJetonAcces,
  optionsCookie,
  signerAcces,
  NOMS_COOKIES,
  type Role,
  type Session,
} from "@/lib/auth/jeton";

/**
 * Sessions : jeton d'accès court + jeton de renouvellement révocable.
 *
 * La partie purement cryptographique (signature, vérification, noms de cookies)
 * vit dans `lib/auth/jeton.ts`, qui n'est PAS `server-only` — le proxy doit
 * pouvoir l'importer. Ce module-ci ajoute tout ce qui touche la base.
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

/**
 * Fenêtre de grâce sur la rotation du jeton de renouvellement.
 *
 * ── Le problème qu'elle règle ────────────────────────────────────────────────
 *
 * Avec une rotation stricte, deux requêtes concurrentes portant le même jeton
 * se marchent dessus : la première le révoque et en émet un nouveau, la seconde
 * présente un jeton désormais révoqué et échoue — l'utilisateur est déconnecté
 * sans raison. Et ce cas n'est pas théorique : Next précharge les routes au
 * survol des liens, donc plusieurs requêtes partent réellement en parallèle.
 *
 * On accepte donc un jeton révoqué depuis moins de GRACE_MS, en émettant un
 * couple neuf. Les lignes surnuméraires ainsi créées sont sans conséquence :
 * elles expirent avec la session d'origine.
 *
 * ── Ce que ça coûte ──────────────────────────────────────────────────────────
 *
 * Un jeton volé rejoué dans les 60 secondes suivant un usage légitime passe.
 * Au-delà, il échoue. C'est le compromis retenu par les recommandations OAuth
 * sur la rotation (RFC 9700), pour cette raison exacte.
 */
const GRACE_MS = 60_000;

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
  const communs = optionsCookie();

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
 * est déjà révoqué — la fenêtre d'exploitation se réduit à GRACE_MS.
 *
 * ⚠️ ÉCRIT DES COOKIES : à n'appeler que depuis un contexte qui l'autorise —
 * Server Action ou Route Handler. Next interdit la modification de cookies
 * pendant le rendu d'un composant serveur.
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

  if (!enregistrement) return null;

  const maintenant = new Date();

  // Révoqué : toléré seulement dans la fenêtre de grâce (cf. GRACE_MS).
  if (enregistrement.revoqueeLe !== null) {
    const depuis = maintenant.getTime() - enregistrement.revoqueeLe.getTime();
    if (depuis > GRACE_MS) return null;
  }

  if (
    enregistrement.expireLe < maintenant ||
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
  //
  // `updateMany` avec `revoqueeLe: null` en condition : si une requête
  // concurrente a déjà révoqué la ligne, on ne réécrit pas sa date de
  // révocation — ce qui aurait pour effet de repousser indéfiniment la fenêtre
  // de grâce à chaque tentative, et de rendre un jeton volé utilisable sans fin.
  const nouveau = genererJeton();
  await prisma.$transaction([
    prisma.sessionRenouvellement.updateMany({
      where: { jetonHash: enregistrement.jetonHash, revoqueeLe: null },
      data: { revoqueeLe: maintenant, dernierUsageLe: maintenant },
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

  const communs = optionsCookie();
  boite.set(COOKIE_ACCES, await signerAcces(session), {
    ...communs,
    maxAge: DUREE_ACCES_SECONDES,
  });
  boite.set(COOKIE_RENOUVELLEMENT, nouveau, {
    ...communs,
    maxAge: Math.max(
      0,
      Math.floor((enregistrement.expireLe.getTime() - maintenant.getTime()) / 1000)
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

// Réexports : les appelants existants importent tout depuis `session.ts`, et
// n'ont pas à savoir que la partie jeton a été déplacée.
export { cleSignature, lireJetonAcces, signerAcces, optionsCookie, NOMS_COOKIES };
export type { Role, Session };
