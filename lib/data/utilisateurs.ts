import "server-only";

import { prisma } from "@/lib/data/client";
import { genererJeton, hacherJeton } from "@/lib/auth/motDePasse";
import type { Role } from "@/lib/auth/jeton";

/**
 * Accès aux comptes utilisateurs : connexion et définition du mot de passe.
 *
 * Séparé de `lib/auth/` volontairement : ici on parle à la base, là-bas on
 * calcule des jetons. Le découpage suit celui que la doc appelle « Data Access
 * Layer » — un seul endroit lit la table `utilisateur`, et il n'expose jamais
 * l'objet Prisma brut.
 *
 * ⚠️ Aucune de ces fonctions ne vérifie d'autorisation, contrairement au reste
 * du DAL : elles servent précisément à établir l'identité, donc avant qu'il y
 * ait une session à contrôler. Elles ne doivent être appelées que par
 * `lib/auth/actions.ts` et le script de création du premier administrateur.
 */

/**
 * Ce qu'on expose d'un compte au moment de la connexion — un DTO, pas la ligne.
 *
 * `motDePasseHash` en fait partie parce que la vérification a lieu chez
 * l'appelant : c'est lui qui doit décider quoi faire d'un compte sans mot de
 * passe (invitation jamais honorée) et déclencher un réhachage si les
 * paramètres Argon2 ont durci depuis.
 */
export interface ComptePourConnexion {
  id: bigint;
  email: string;
  role: Role;
  matricule: string | null;
  motDePasseHash: string | null;
  actif: boolean;
}

/**
 * Cherche un compte par courriel.
 *
 * Le courriel est normalisé en minuscules : la colonne est `UNIQUE` et
 * sensible à la casse, donc « Jean@edc.cm » et « jean@edc.cm » y seraient deux
 * comptes distincts. On tranche dans un seul sens — tout est stocké en
 * minuscules, à l'écriture comme à la lecture.
 */
export async function trouverCompteParEmail(
  email: string
): Promise<ComptePourConnexion | null> {
  const ligne = await prisma.utilisateur.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: {
      id: true,
      email: true,
      role: true,
      matricule: true,
      motDePasseHash: true,
      actif: true,
    },
  });
  if (!ligne) return null;
  return { ...ligne, role: ligne.role as Role };
}

/** Horodate la connexion. Sans effet fonctionnel : c'est une trace d'audit. */
export async function marquerConnexion(id: bigint): Promise<void> {
  await prisma.utilisateur.update({
    where: { id },
    data: { derniereConnexion: new Date() },
  });
}

/**
 * Remplace l'empreinte d'un mot de passe sans autre effet.
 *
 * Appelée après une connexion réussie quand `empreinteAReprendre()` est vraie :
 * c'est le seul instant où le mot de passe en clair est disponible, donc le seul
 * où l'on peut le réhacher avec des paramètres plus durs.
 */
export async function remplacerEmpreinte(id: bigint, empreinte: string): Promise<void> {
  await prisma.utilisateur.update({
    where: { id },
    data: { motDePasseHash: empreinte },
  });
}

// ---------------------------------------------------------------------------
// Définition du mot de passe par lien reçu par courriel
// ---------------------------------------------------------------------------

/** Validité du lien de définition du mot de passe. */
const DUREE_JETON_HEURES = 48;

/**
 * Émet un jeton de définition de mot de passe et renvoie sa valeur EN CLAIR —
 * la seule fois où elle existe, puisque la base n'en garde que l'empreinte.
 *
 * Les jetons encore en cours pour ce compte sont invalidés : réémettre une
 * invitation doit annuler la précédente, sinon un lien ancien resté dans une
 * boîte aux lettres reste utilisable.
 */
export async function creerJetonMotDePasse(idUtilisateur: bigint): Promise<string> {
  const jeton = genererJeton();
  const expireLe = new Date(Date.now() + DUREE_JETON_HEURES * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.jetonMotDePasse.updateMany({
      where: { idUtilisateur, utiliseLe: null },
      data: { utiliseLe: new Date() }, // « consommé » sans avoir servi = invalidé
    }),
    prisma.jetonMotDePasse.create({
      data: { jetonHash: hacherJeton(jeton), idUtilisateur, expireLe },
    }),
  ]);

  return jeton;
}

export interface JetonValide {
  jetonHash: string;
  idUtilisateur: bigint;
  email: string;
  /** Faux pour une première définition, vrai pour une réinitialisation. */
  aDejaUnMotDePasse: boolean;
}

/**
 * Vérifie un jeton sans le consommer — pour afficher le formulaire.
 *
 * Renvoie `null` pour tous les cas d'échec sans les distinguer : jeton inconnu,
 * expiré, déjà utilisé, compte désactivé. L'écran affiche un message unique.
 */
export async function verifierJetonMotDePasse(jeton: string): Promise<JetonValide | null> {
  const ligne = await prisma.jetonMotDePasse.findUnique({
    where: { jetonHash: hacherJeton(jeton) },
    include: {
      utilisateur: { select: { id: true, email: true, actif: true, motDePasseHash: true } },
    },
  });

  if (
    !ligne ||
    ligne.utiliseLe !== null ||
    ligne.expireLe < new Date() ||
    !ligne.utilisateur.actif
  ) {
    return null;
  }

  return {
    jetonHash: ligne.jetonHash,
    idUtilisateur: ligne.utilisateur.id,
    email: ligne.utilisateur.email,
    aDejaUnMotDePasse: ligne.utilisateur.motDePasseHash !== null,
  };
}

/**
 * Écrit le mot de passe et consomme le jeton, **dans une seule transaction**.
 *
 * L'indivisibilité compte : si le jeton était marqué utilisé sans que le mot de
 * passe soit écrit, le compte deviendrait inaccessible et le lien mort. Si le
 * mot de passe était écrit sans marquer le jeton, le lien resterait rejouable.
 *
 * `updateMany` avec `utiliseLe: null` en condition rend l'opération sûre face à
 * un double envoi du formulaire : la seconde exécution ne met à jour aucune
 * ligne, et `count === 0` le signale à l'appelant.
 *
 * Les sessions existantes sont révoquées : après une réinitialisation, les
 * appareils déjà connectés — dont celui d'un éventuel intrus — doivent
 * ressaisir le nouveau mot de passe.
 */
export async function definirMotDePasseAvecJeton(
  jetonHash: string,
  idUtilisateur: bigint,
  empreinte: string
): Promise<boolean> {
  const maintenant = new Date();
  const [consommation] = await prisma.$transaction([
    prisma.jetonMotDePasse.updateMany({
      where: { jetonHash, utiliseLe: null },
      data: { utiliseLe: maintenant },
    }),
    prisma.utilisateur.update({
      where: { id: idUtilisateur },
      data: { motDePasseHash: empreinte },
    }),
    prisma.sessionRenouvellement.updateMany({
      where: { idUtilisateur, revoqueeLe: null },
      data: { revoqueeLe: maintenant },
    }),
  ]);

  return consommation.count === 1;
}

// ---------------------------------------------------------------------------
// Création de compte (utilisée par le script d'amorçage, puis par l'admin)
// ---------------------------------------------------------------------------

/**
 * Crée un compte SANS mot de passe et renvoie le jeton d'invitation en clair.
 *
 * Le mot de passe n'est jamais choisi par l'administrateur : il est défini par
 * le titulaire via le lien. Personne d'autre que lui ne le connaît, et il n'y a
 * pas de « mot de passe provisoire » à transmettre de vive voix.
 */
export async function creerCompte(
  email: string,
  role: Role,
  matricule: string | null
): Promise<{ id: bigint; jeton: string }> {
  const utilisateur = await prisma.utilisateur.create({
    data: { email: email.trim().toLowerCase(), role, matricule },
    select: { id: true },
  });
  const jeton = await creerJetonMotDePasse(utilisateur.id);
  return { id: utilisateur.id, jeton };
}

export const VALIDITE_JETON_HEURES = DUREE_JETON_HEURES;
