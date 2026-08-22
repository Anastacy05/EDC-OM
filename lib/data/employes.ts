import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/data/client";
import { exigerAdministrateur, exigerSession, peutAccederAuMatricule } from "@/lib/auth/garde";
import type { EmployeValide } from "@/lib/data/employes.validation";
import { PAR_PAGE } from "@/lib/pagination";

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
  /** Code du motif de sortie, nul si la fiche est active ou le motif non renseigné. */
  motifSortie: string | null;
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
  /** Date de désactivation, au format `AAAA-MM-JJ`. Nulle si la fiche est active. */
  desactiveLe: string | null;
  /** Code du motif de sortie, ou `null` : il est facultatif. */
  motifSortie: string | null;
  /** Précision libre accompagnant le motif. */
  noteSortie: string | null;
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
  /** Page demandée, à partir de 1. */
  page?: number;
}

/**
 * Lignes par page.
 *
 * Réexportée depuis `lib/pagination.ts` pour ne pas casser les appelants, mais
 * DÉFINIE là-bas : ce module est `server-only` et tire `next/navigation`, donc il
 * n'est pas importable depuis un test ou un script.
 */
export { PAR_PAGE } from "@/lib/pagination";

/** Une page de résultats, avec de quoi construire la navigation. */
export interface PagePersonnel {
  employes: EmployeListe[];
  /** Total AVANT pagination : c'est lui qui donne le nombre de pages. */
  total: number;
  /** Page effectivement servie (corrigée si l'appelant a demandé n'importe quoi). */
  page: number;
  nombrePages: number;
}

/**
 * Ligne brute du `$queryRaw`. Les alias sont en minuscules sans accent :
 * PostgreSQL replie les identifiants non entre guillemets, donc `nomStatut`
 * reviendrait en `nomstatut` et la lecture serait `undefined`.
 */
interface LigneBrute {
  matricule: string;
  nom: string;
  prenoms: string;
  fonction: string;
  libelle_statut: string;
  libelle_departement: string;
  actif: boolean;
  motif_sortie: string | null;
  a_un_compte: boolean;
  compte_en_attente: boolean;
  /** Total sur l'ensemble du filtre, répété sur chaque ligne (fenêtre SQL). */
  total: bigint;
}

/**
 * Liste du personnel, filtrée, **insensible aux accents** et paginée.
 *
 * ── Pourquoi du SQL brut ─────────────────────────────────────────────────────
 *
 * Parce que Prisma n'expose pas `unaccent`. Et l'insensibilité aux accents n'est
 * pas un raffinement : les états du personnel comportent « NGUÉ », « ÉLOÏSE »,
 * « MBIDA ÉTOUNDI », et personne ne tape les accents dans un champ de recherche.
 * Sans ça, « ngue » ne trouve rien — la recherche paraît cassée.
 *
 * On passe par la fonction `sans_accent()` posée par la migration
 * `20260821214330_motif_sortie_et_fondateur`. Elle nomme le dictionnaire
 * explicitement, ce qui la rend `IMMUTABLE` — condition sans laquelle PostgreSQL
 * refuse de l'indexer (`unaccent(text)` seul est `STABLE`, parce qu'il résout son
 * dictionnaire via `search_path`).
 *
 * Les index `idx_employe_nom_sans_accent` et `idx_employe_prenoms_sans_accent`
 * portent sur `lower(sans_accent(...))`, donc **l'expression du WHERE doit être
 * écrite exactement de la même façon**, sinon ils ne sont pas utilisés.
 *
 * ⚠️ Une recherche en `%mot%` (début joker) ne peut de toute façon PAS utiliser un
 * index B-tree. Ces index servent les recherches par préfixe ; pour du milieu de
 * chaîne, PostgreSQL parcourt la table. Sans effet à 400 lignes ; si le volume
 * changeait d'ordre, il faudrait un index `pg_trgm` (`GIN … gin_trgm_ops`).
 *
 * ── Injection SQL ────────────────────────────────────────────────────────────
 *
 * `$queryRaw` avec des marqueurs `${}` produit une requête **préparée** : les
 * valeurs sont transmises hors du texte SQL, jamais concaténées. C'est
 * `$queryRawUnsafe` qui interpole, et on ne l'emploie pas ici.
 */
export async function listerPersonnel(
  filtres: FiltresPersonnel = {}
): Promise<PagePersonnel> {
  await exigerAdministrateur();

  const recherche = filtres.recherche?.trim() || null;
  const codeStatut = filtres.codeStatut?.trim() || null;
  const codeDepartement = filtres.codeDepartement?.trim() || null;
  const inclureInactifs = filtres.inclureInactifs === true;

  // Page assainie : un `?page=0`, `?page=-3` ou `?page=abc` venu de l'URL ne doit
  // pas produire un OFFSET négatif, que PostgreSQL rejetterait par une erreur.
  const pageDemandee =
    Number.isFinite(filtres.page) && filtres.page! >= 1 ? Math.floor(filtres.page!) : 1;

  // `%` posés ici et non dans le SQL : la valeur reste un paramètre lié, donc les
  // caractères spéciaux du motif LIKE saisis par l'utilisateur restent inertes.
  const motif = recherche === null ? null : `%${recherche}%`;

  const lignes = await prisma.$queryRaw<LigneBrute[]>`
    SELECT
      e.matricule,
      e.nom,
      e.prenoms,
      e.fonction,
      s.libelle AS libelle_statut,
      d.libelle AS libelle_departement,
      e.actif,
      e.motif_sortie,
      (u.id IS NOT NULL)                                  AS a_un_compte,
      (u.id IS NOT NULL AND u.mot_de_passe_hash IS NULL)  AS compte_en_attente,
      -- Fenêtre : le total du filtre est calculé dans LA MÊME requête que la
      -- page. Deux requêtes séparées pourraient tomber de part et d'autre d'une
      -- écriture concurrente et afficher « page 3 sur 2 ».
      COUNT(*) OVER ()                                    AS total
    FROM employe e
    JOIN statut       s ON s.code = e.code_statut
    JOIN departement  d ON d.code = e.code_departement
    LEFT JOIN utilisateur u ON u.matricule = e.matricule
    WHERE
      (${inclureInactifs} OR e.actif IS TRUE)
      AND (${codeStatut}::text       IS NULL OR e.code_statut      = ${codeStatut})
      AND (${codeDepartement}::text  IS NULL OR e.code_departement = ${codeDepartement})
      AND (
        ${motif}::text IS NULL
        OR lower(sans_accent(e.nom))     LIKE lower(sans_accent(${motif}))
        OR lower(sans_accent(e.prenoms)) LIKE lower(sans_accent(${motif}))
        -- Le matricule n'a pas d'accent, mais la fonction y est appliquée pour
        -- garder une expression homogène ; le coût est nul.
        OR lower(sans_accent(e.matricule)) LIKE lower(sans_accent(${motif}))
      )
    -- Nom puis prénoms : l'ordre dans lequel les RH lisent un état du personnel.
    -- Le tri porte sur la forme SANS ACCENT, sinon « NGUÉ » se classe après
    -- « NGUZ » — la collation place les lettres accentuées à part.
    -- Le matricule en dernier départage les homonymes : sans un ordre TOTAL, deux
    -- pages peuvent répéter ou omettre une ligne (l'ordre des égalités n'est pas
    -- garanti d'une requête à l'autre).
    -- ⚠️ Aucun accent grave dans ces commentaires : ils sont à l'intérieur d'un
    -- littéral de gabarit, et le premier rencontré le refermerait.
    ORDER BY sans_accent(e.nom), sans_accent(e.prenoms), e.matricule
    LIMIT ${PAR_PAGE} OFFSET ${(pageDemandee - 1) * PAR_PAGE}
  `;

  // ── Le total quand la page est vide ──────────────────────────────────────
  //
  // ⚠️ DÉFAUT TROUVÉ PAR LES TESTS (22/08/2026). `COUNT(*) OVER ()` est une
  // fonction de fenêtre : elle est calculée SUR LES LIGNES RENVOYÉES. Au-delà de
  // la dernière page, la requête n'en renvoie aucune — le total était donc lu
  // comme 0, et l'écran annonçait « aucun employé ne correspond » alors que des
  // résultats existaient. L'utilisateur était invité à élargir sa recherche quand
  // il fallait revenir en arrière.
  //
  // Une page vide au-delà de la fin et un filtre sans résultat ne sont pas la
  // même chose, et ne demandent pas la même action. On refait donc un décompte —
  // mais SEULEMENT dans ce cas, qui est rare : une page vide au-delà de la
  // première. Le cas courant garde sa requête unique.
  let total: number;
  if (lignes.length > 0) {
    total = Number(lignes[0].total);
  } else if (pageDemandee > 1) {
    total = await compterPersonnel({ recherche, codeStatut, codeDepartement, inclureInactifs });
  } else {
    // Page 1 vide : le filtre ne trouve rien, inutile de recompter.
    total = 0;
  }

  const nombrePages = Math.max(1, Math.ceil(total / PAR_PAGE));

  return {
    employes: lignes.map((e) => ({
      matricule: e.matricule,
      nom: e.nom,
      prenoms: e.prenoms,
      fonction: e.fonction,
      statut: e.libelle_statut,
      departement: e.libelle_departement,
      actif: e.actif,
      motifSortie: e.motif_sortie,
      aUnCompte: e.a_un_compte,
      compteEnAttente: e.compte_en_attente,
    })),
    total,
    page: pageDemandee,
    nombrePages,
  };
}

/**
 * Compte les employés d'un filtre, sans pagination.
 *
 * Appelée uniquement quand une page au-delà de la première revient vide : c'est
 * le seul moment où la fonction de fenêtre ne peut rien dire. Les conditions
 * doivent rester **identiques** à celles de `listerPersonnel`, sinon le total
 * annoncé ne correspondrait pas à la liste.
 */
async function compterPersonnel(filtres: {
  recherche: string | null;
  codeStatut: string | null;
  codeDepartement: string | null;
  inclureInactifs: boolean;
}): Promise<number> {
  const motif = filtres.recherche === null ? null : `%${filtres.recherche}%`;

  const [ligne] = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total
    FROM employe e
    WHERE
      (${filtres.inclureInactifs} OR e.actif IS TRUE)
      AND (${filtres.codeStatut}::text      IS NULL OR e.code_statut      = ${filtres.codeStatut})
      AND (${filtres.codeDepartement}::text IS NULL OR e.code_departement = ${filtres.codeDepartement})
      AND (
        ${motif}::text IS NULL
        OR lower(sans_accent(e.nom))       LIKE lower(sans_accent(${motif}))
        OR lower(sans_accent(e.prenoms))   LIKE lower(sans_accent(${motif}))
        OR lower(sans_accent(e.matricule)) LIKE lower(sans_accent(${motif}))
      )
  `;

  return Number(ligne?.total ?? 0);
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
      // `desactiveLe` est un `TIMESTAMPTZ` et non un `DATE` : on garde l'instant
      // complet en ISO, la mise en forme appartient à l'écran.
      desactiveLe: e.desactiveLe?.toISOString() ?? null,
      motifSortie: e.motifSortie,
      noteSortie: e.noteSortie,
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
 *
 * `sortie` est FACULTATIF (décision du 21/08/2026) : une désactivation urgente ne
 * doit pas être retenue par un champ à remplir. La contrainte
 * `employe_motif_sortie_si_inactif` interdit un motif sur une fiche active, elle
 * n'en exige jamais un.
 */
export async function desactiverEmploye(
  matricule: string,
  sortie: { motifSortie: string | null; noteSortie: string | null } = {
    motifSortie: null,
    noteSortie: null,
  }
): Promise<{ ok: true } | { ok: false; echec: EchecEcriture }> {
  await exigerAdministrateur();

  const maintenant = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.employe.update({
        where: { matricule },
        data: {
          actif: false,
          desactiveLe: maintenant,
          // Le cast est nécessaire : l'énumération Prisma est un type nominal, et
          // la valeur vient d'un formulaire. `validerSortie` a déjà vérifié
          // qu'elle appartient bien à la liste — c'est là qu'est la sûreté.
          motifSortie: sortie.motifSortie as never,
          noteSortie: sortie.noteSortie,
        },
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
 * ⚠️ Le motif et la note DOIVENT être effacés : la contrainte
 * `employe_motif_sortie_si_inactif` refuse un motif sur une fiche active, donc les
 * laisser ferait échouer la transaction. C'est aussi juste sur le fond — un
 * employé revenu n'a plus de motif de sortie.
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
        data: { actif: true, desactiveLe: null, motifSortie: null, noteSortie: null },
      });
      await tx.utilisateur.updateMany({ where: { matricule }, data: { actif: true } });
    });
    return { ok: true };
  } catch (erreur) {
    if (estPanneBase(erreur)) return { ok: false, echec: { genre: "baseIndisponible" } };
    throw erreur;
  }
}
