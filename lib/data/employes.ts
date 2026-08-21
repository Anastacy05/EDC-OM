import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/data/client";
import { exigerAdministrateur, exigerSession, peutAccederAuMatricule } from "@/lib/auth/garde";
import type { EmployeValide } from "@/lib/data/employes.validation";

/**
 * Accès aux employés. **Chaque fonction porte sa propre garde d'autorisation.**
 *
 * ── Pourquoi la garde est ici et pas dans les pages ──────────────────────────
 *
 * Parce que c'est le seul endroit qu'on ne peut pas contourner. La doc est
 * catégorique :
 *
 *   « Server Functions are reachable via direct POST requests, not just through
 *     your application's UI. Always verify authentication and authorization
 *     inside every Server Function. »
 *
 * Un contrôle dans la page laisserait les Server Actions ouvertes ; un contrôle
 * dans le layout ne se rejoue pas à la navigation interne (rendu partiel). Ici,
 * il n'existe aucun chemin vers la table `employe` qui ne passe pas par une
 * garde.
 *
 * C'est ce que `lib/data/referentiels.ts` ne fait PAS, et la différence est
 * volontaire : un référentiel de directions n'est pas une donnée personnelle. Un
 * dossier d'employé — date de naissance, situation de famille, indice — l'est.
 *
 * ── Sur les DTO ──────────────────────────────────────────────────────────────
 *
 * Aucune fonction ne renvoie une ligne Prisma. La doc recommande des « Data
 * Transfer Objects » pour « only return the necessary data », et il y a une
 * raison concrète : la liste du personnel n'a pas besoin de la date de naissance
 * ni de la situation de famille. Les envoyer au navigateur les exposerait dans le
 * flux RSC, lisible dans l'onglet réseau, sans qu'aucun écran ne les affiche.
 */

// ---------------------------------------------------------------------------
// Formes retournées
// ---------------------------------------------------------------------------

/** Ligne de la liste du personnel : le strict nécessaire au tableau. */
export interface EmployeListe {
  matricule: string;
  nom: string;
  prenoms: string;
  fonction: string;
  statut: string; // libellé, pas le code : c'est ce qui s'affiche
  departement: string;
  actif: boolean;
  /** Vrai si un compte utilisateur est rattaché — pilote l'action « inviter ». */
  aUnCompte: boolean;
  /** Vrai si le compte existe mais n'a jamais servi (invitation en attente). */
  compteEnAttente: boolean;
}

/** Fiche complète, pour l'écran de modification. */
export interface EmployeFiche {
  matricule: string;
  nom: string;
  prenoms: string;
  grade: string;
  fonction: string;
  situationFamille: string;
  indice: string | null;
  /** Format `AAAA-MM-JJ`, prêt pour un `<input type="date">`. */
  dateNaissance: string;
  dateEmbauche: string;
  codeStatut: string;
  codeDepartement: string;
  nombreMedailles: number;
  estDetache: boolean;
  joursCongeOrigine: number | null;
  actif: boolean;
  compte: {
    email: string;
    role: string;
    /** Nul tant que le titulaire n'a pas défini son mot de passe. */
    aDefiniSonMotDePasse: boolean;
    derniereConnexion: string | null;
  } | null;
}

/**
 * Formate une date de type `DATE` PostgreSQL en `AAAA-MM-JJ`.
 *
 * ⚠️ Les composantes UTC et non locales : Prisma renvoie un `Date` à minuit UTC
 * pour une colonne `DATE`. `getFullYear()` appliquerait le fuseau du serveur et
 * reculerait d'un jour à l'ouest de Greenwich — un employé né le 1er janvier
 * apparaîtrait né le 31 décembre de l'année précédente.
 */
function versChampDate(d: Date): string {
  const mois = String(d.getUTCMonth() + 1).padStart(2, "0");
  const jour = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mois}-${jour}`;
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

export interface FiltresPersonnel {
  /** Recherche libre sur nom, prénoms ou matricule. */
  recherche?: string;
  codeStatut?: string;
  codeDepartement?: string;
  /** Par défaut, les employés désactivés sont masqués. */
  inclureInactifs?: boolean;
}

/**
 * Liste du personnel, filtrée.
 *
 * ⚠️ `mode: "insensitive"` sur la recherche : sans lui, chercher « nkolo » ne
 * trouverait pas « NKOLO ATANGANA », les noms étant stockés en majuscules.
 *
 * ⚠️ Ce n'est PAS insensible aux accents. L'extension `unaccent` est installée
 * (migration `20260821010000_contraintes_natives`) mais Prisma ne l'expose pas :
 * il faudrait du SQL brut. Conséquence à connaître : « rene » ne trouve pas
 * « RENÉ ». À traiter si les RH le signalent — un index `unaccent(nom)` et une
 * requête `$queryRaw` suffiraient.
 */
export async function listerPersonnel(
  filtres: FiltresPersonnel = {}
): Promise<EmployeListe[]> {
  await exigerAdministrateur();

  const recherche = filtres.recherche?.trim();

  const lignes = await prisma.employe.findMany({
    where: {
      ...(filtres.inclureInactifs ? {} : { actif: true }),
      ...(filtres.codeStatut ? { codeStatut: filtres.codeStatut } : {}),
      ...(filtres.codeDepartement ? { codeDepartement: filtres.codeDepartement } : {}),
      ...(recherche
        ? {
            OR: [
              { nom: { contains: recherche, mode: "insensitive" } },
              { prenoms: { contains: recherche, mode: "insensitive" } },
              { matricule: { contains: recherche, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    // Nom puis prénoms : l'ordre dans lequel les RH lisent un état du personnel.
    orderBy: [{ nom: "asc" }, { prenoms: "asc" }],
    select: {
      matricule: true,
      nom: true,
      prenoms: true,
      fonction: true,
      actif: true,
      statut: { select: { libelle: true } },
      departement: { select: { libelle: true } },
      // On ne récupère QUE de quoi savoir si le compte existe et s'il a servi,
      // pas le courriel : la liste ne l'affiche pas.
      utilisateur: { select: { motDePasseHash: true } },
    },
  });

  return lignes.map((e) => ({
    matricule: e.matricule,
    nom: e.nom,
    prenoms: e.prenoms,
    fonction: e.fonction,
    statut: e.statut.libelle,
    departement: e.departement.libelle,
    actif: e.actif,
    aUnCompte: e.utilisateur !== null,
    compteEnAttente: e.utilisateur !== null && e.utilisateur.motDePasseHash === null,
  }));
}

/**
 * Fiche d'un employé.
 *
 * `exigerSession` puis `peutAccederAuMatricule`, et non `exigerAdministrateur` :
 * un agent doit pouvoir consulter SON propre dossier. Sans ce contrôle, changer
 * le matricule dans l'URL suffirait à lire celui d'un collègue — c'est
 * exactement le défaut d'autorisation que la doc appelle à traiter dans la
 * couche de données.
 */
export const lireFicheEmploye = cache(
  async (matricule: string): Promise<EmployeFiche | null> => {
    const session = await exigerSession();
    if (!peutAccederAuMatricule(session, matricule)) return null;

    const e = await prisma.employe.findUnique({
      where: { matricule },
      include: {
        utilisateur: {
          select: {
            email: true,
            role: true,
            motDePasseHash: true,
            derniereConnexion: true,
          },
        },
      },
    });
    if (!e) return null;

    return {
      matricule: e.matricule,
      nom: e.nom,
      prenoms: e.prenoms,
      grade: e.grade,
      fonction: e.fonction,
      situationFamille: e.situationFamille,
      indice: e.indice,
      dateNaissance: versChampDate(e.dateNaissance),
      dateEmbauche: versChampDate(e.dateEmbauche),
      codeStatut: e.codeStatut,
      codeDepartement: e.codeDepartement,
      nombreMedailles: e.nombreMedailles,
      estDetache: e.estDetache,
      // `Decimal` de Prisma : converti en nombre pour traverser la frontière
      // serveur/client, un Decimal n'étant pas sérialisable en RSC.
      joursCongeOrigine: e.joursCongeOrigine === null ? null : Number(e.joursCongeOrigine),
      actif: e.actif,
      compte: e.utilisateur
        ? {
            email: e.utilisateur.email,
            role: e.utilisateur.role,
            // Un booléen, JAMAIS l'empreinte : elle n'a aucune raison de quitter
            // le serveur, même hachée.
            aDefiniSonMotDePasse: e.utilisateur.motDePasseHash !== null,
            derniereConnexion: e.utilisateur.derniereConnexion?.toISOString() ?? null,
          }
        : null,
    };
  }
);

/** Codes valides, pour la validation des listes déroulantes. */
export const lireCodesReferentiels = cache(
  async (): Promise<{ statuts: Set<string>; departements: Set<string> }> => {
    await exigerAdministrateur();
    const [statuts, departements] = await Promise.all([
      prisma.statut.findMany({ where: { actif: true }, select: { code: true } }),
      prisma.departement.findMany({ where: { actif: true }, select: { code: true } }),
    ]);
    return {
      statuts: new Set(statuts.map((s) => s.code)),
      departements: new Set(departements.map((d) => d.code)),
    };
  }
);

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

/**
 * Codes d'erreur métier, traduits en messages par l'appelant.
 *
 * Un type énuméré plutôt que des chaînes libres : la Server Action doit pouvoir
 * distinguer les cas sans comparer des phrases, qui changeraient à la première
 * relecture de la formulation.
 */
export type EchecEcriture =
  | { genre: "matriculeExistant" }
  | { genre: "introuvable" }
  | { genre: "aUnCompte" }
  | { genre: "baseIndisponible" };

/** Vrai si l'erreur Prisma est une violation d'unicité (code P2002). */
function estViolationUnicite(erreur: unknown): boolean {
  return (
    typeof erreur === "object" &&
    erreur !== null &&
    "code" in erreur &&
    (erreur as { code: unknown }).code === "P2002"
  );
}

/** Vrai si la base n'a pas répondu — Docker éteint, réseau coupé. */
function estPanneBase(erreur: unknown): boolean {
  return (
    typeof erreur === "object" &&
    erreur !== null &&
    "code" in erreur &&
    ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "P1001", "P1002"].includes(
      String((erreur as { code: unknown }).code)
    )
  );
}

export async function creerEmploye(
  donnees: EmployeValide
): Promise<{ ok: true } | { ok: false; echec: EchecEcriture }> {
  await exigerAdministrateur();

  try {
    await prisma.employe.create({ data: donnees });
    return { ok: true };
  } catch (erreur) {
    // Le matricule est la clé PRIMAIRE : on ne peut pas le pré-vérifier sans
    // laisser une fenêtre entre la lecture et l'écriture. On laisse donc la base
    // arbitrer et on traduit son verdict — c'est la seule façon sûre.
    if (estViolationUnicite(erreur)) return { ok: false, echec: { genre: "matriculeExistant" } };
    if (estPanneBase(erreur)) return { ok: false, echec: { genre: "baseIndisponible" } };
    throw erreur;
  }
}

/**
 * Modifie un employé.
 *
 * Le matricule n'est PAS modifiable : c'est la clé primaire, et les
 * participations aux ordres de mission y font référence. Le changer casserait
 * l'historique. Un matricule erroné se corrige en désactivant la fiche et en
 * créant la bonne.
 */
export async function modifierEmploye(
  matricule: string,
  donnees: EmployeValide
): Promise<{ ok: true } | { ok: false; echec: EchecEcriture }> {
  await exigerAdministrateur();

  // On retire le matricule des données écrites, quoi qu'ait envoyé le
  // formulaire : un champ caché est modifiable par l'appelant.
  const { matricule: _ignore, ...aEcrire } = donnees;
  void _ignore;

  try {
    await prisma.employe.update({ where: { matricule }, data: aEcrire });
    return { ok: true };
  } catch (erreur) {
    if (estPanneBase(erreur)) return { ok: false, echec: { genre: "baseIndisponible" } };
    // P2025 : ligne absente. Peut arriver si la fiche a été supprimée pendant
    // que le formulaire était ouvert.
    if (
      typeof erreur === "object" &&
      erreur !== null &&
      "code" in erreur &&
      (erreur as { code: unknown }).code === "P2025"
    ) {
      return { ok: false, echec: { genre: "introuvable" } };
    }
    throw erreur;
  }
}

/**
 * Désactive un employé — **jamais de suppression**.
 *
 * Supprimer casserait l'historique : les participations aux ordres de mission
 * référencent le matricule, et un OM signé par le Directeur général reste un
 * acte d'autorité, même si son bénéficiaire a quitté l'EDC.
 *
 * La contrainte `CHECK (actif OR desactive_le IS NOT NULL)` impose la date : elle
 * sert à invalider un OM créé APRÈS le départ.
 *
 * Les sessions du compte rattaché sont révoquées dans la même transaction, et
 * le compte désactivé : sans ça, l'employé garderait son accès jusqu'à
 * l'expiration de son jeton.
 */
export async function desactiverEmploye(
  matricule: string
): Promise<{ ok: true } | { ok: false; echec: EchecEcriture }> {
  await exigerAdministrateur();

  const maintenant = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.employe.update({
        where: { matricule },
        data: { actif: false, desactiveLe: maintenant },
      });

      const compte = await tx.utilisateur.findUnique({
        where: { matricule },
        select: { id: true },
      });
      if (compte) {
        await tx.utilisateur.update({ where: { id: compte.id }, data: { actif: false } });
        await tx.sessionRenouvellement.updateMany({
          where: { idUtilisateur: compte.id, revoqueeLe: null },
          data: { revoqueeLe: maintenant },
        });
        // Les invitations en cours sont annulées : un lien resté dans une boîte
        // aux lettres ne doit pas rouvrir un accès qu'on vient de fermer.
        await tx.jetonMotDePasse.updateMany({
          where: { idUtilisateur: compte.id, utiliseLe: null },
          data: { utiliseLe: maintenant },
        });
      }
    });
    return { ok: true };
  } catch (erreur) {
    if (estPanneBase(erreur)) return { ok: false, echec: { genre: "baseIndisponible" } };
    throw erreur;
  }
}

/**
 * Réactive un employé et son compte.
 *
 * `desactiveLe` est remis à `null` : la contrainte l'autorise dès que `actif`
 * redevient vrai, et laisser l'ancienne date ferait croire à une désactivation
 * en cours.
 *
 * ⚠️ Le mot de passe n'est PAS réinitialisé. Un employé revenu de détachement
 * retrouve son accès tel quel. Si le compte doit repartir de zéro, l'admin émet
 * un nouveau lien depuis la fiche.
 */
export async function reactiverEmploye(
  matricule: string
): Promise<{ ok: true } | { ok: false; echec: EchecEcriture }> {
  await exigerAdministrateur();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.employe.update({
        where: { matricule },
        data: { actif: true, desactiveLe: null },
      });
      await tx.utilisateur.updateMany({ where: { matricule }, data: { actif: true } });
    });
    return { ok: true };
  } catch (erreur) {
    if (estPanneBase(erreur)) return { ok: false, echec: { genre: "baseIndisponible" } };
    throw erreur;
  }
}
