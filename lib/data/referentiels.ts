import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/data/client";
import type { OptionReferentiel } from "@/lib/referentiels";
import type { Zone } from "@/lib/zones";

/**
 * Accès aux référentiels : départements, statuts, zones, pays, barème.
 *
 * Lecture seule. Ces tables sont amorcées par prisma/seed.ts et ne sont éditées
 * par aucun écran — le barème est figé (« montants appartenant au code de
 * l'entreprise ») et les nomenclatures RH bougent rarement.
 *
 * ── Deux principes, tirés de la doc Next 16 ──────────────────────────────────
 *
 * 1. `import "server-only"` : ce module ne doit jamais atteindre le navigateur.
 *
 * 2. Chaque fonction est enveloppée dans `cache()` de React. Cela DÉDOUBLONNE
 *    les appels à l'intérieur d'une même requête : une page qui affiche deux
 *    listes déroulantes de statuts déclenche une seule requête SQL, pas deux.
 *    C'est le bénéfice que la doc décrit — « sharing an in-memory cache across
 *    different parts of a request » — et ça évite de devoir faire remonter les
 *    données à la main d'un composant à l'autre.
 *
 *    ⚠️ La portée est LA REQUÊTE, pas le processus : rien n'est conservé d'une
 *    requête à la suivante. Un référentiel modifié en base est donc visible au
 *    rafraîchissement suivant, sans invalidation à gérer.
 *
 * ── Sur la forme retournée ───────────────────────────────────────────────────
 *
 * Les fonctions renvoient `OptionReferentiel` ({ valeur, libelle }), exactement
 * la forme des tableaux en dur de lib/referentiels.ts. C'est délibéré : les
 * composants qui consomment ces listes (formulaire de création, filtres de la
 * liste des OM) n'ont PAS à changer quand on bascule du tableau en dur vers la
 * base. Seule l'origine des données change, pas leur contrat.
 */

/** Départements (`affectation` de l'employé). Ordre alphabétique du libellé. */
export const getDepartements = cache(async (): Promise<OptionReferentiel[]> => {
  const lignes = await prisma.departement.findMany({
    where: { actif: true },
    orderBy: { libelle: "asc" },
    select: { code: true, libelle: true },
  });
  return lignes.map((d) => ({ valeur: d.code, libelle: d.libelle }));
});

/**
 * Statuts hiérarchiques, **du plus élevé au plus bas** — jamais par ordre
 * alphabétique. C'est cet ordre que lit la pyramide des rapports, et celui dans
 * lequel les RH parcourent une liste déroulante.
 */
export const getStatuts = cache(async (): Promise<OptionReferentiel[]> => {
  const lignes = await prisma.statut.findMany({
    where: { actif: true },
    orderBy: { rang: "asc" },
    select: { code: true, libelle: true },
  });
  return lignes.map((s) => ({ valeur: s.code, libelle: s.libelle }));
});

/**
 * Statuts relevant du collège cadres (art. 81-4 : 30 jours calendaires, sans
 * les majorations d'ancienneté ni de maternité).
 *
 * Renvoie un `Set` de codes plutôt qu'une liste : le calcul des congés a besoin
 * de répondre « ce statut est-il cadre ? » en O(1), pour chaque employé.
 */
export const getCodesStatutsCadres = cache(async (): Promise<Set<string>> => {
  const lignes = await prisma.statut.findMany({
    where: { estCadre: true },
    select: { code: true },
  });
  return new Set(lignes.map((s) => s.code));
});

/** Libellés des 4 zones, indexés par code — équivalent de LIBELLE_ZONE. */
export const getLibellesZones = cache(async (): Promise<Record<Zone, string>> => {
  const lignes = await prisma.zone.findMany({
    orderBy: { code: "asc" },
    select: { code: true, libelle: true },
  });
  const parCode = {} as Record<Zone, string>;
  for (const z of lignes) parCode[z.code as Zone] = z.libelle;
  return parCode;
});

/**
 * Noms français des pays destinables, triés selon la locale française.
 *
 * Le tri est fait en SQL et non en JavaScript : la base est en `fr_FR.UTF-8`
 * (cf. docker-compose.yml), donc « Éthiopie » se classe bien après « Espagne »
 * et non rejeté en fin de liste comme le ferait un tri sur les octets.
 *
 * Ne contient que les pays présents en base : les 4 territoires antarctiques
 * sont volontairement absents (cf. note en fin de lib/continents.ts).
 */
export const getNomsPays = cache(async (): Promise<string[]> => {
  const lignes = await prisma.pays.findMany({
    orderBy: { nomFr: "asc" },
    select: { nomFr: true },
  });
  return lignes.map((p) => p.nomFr);
});

/**
 * Zone d'un pays à partir de son nom français, tel que saisi dans le
 * formulaire. Remplace `zoneDuPaysFr` de lib/zones.ts, mais en lisant la
 * classification EN BASE — c'est-à-dire celle que les RH pourront corriger sans
 * redéploiement, la zone étant une décision de barème et non une donnée
 * géographique.
 *
 * `null` si le pays n'est pas reconnu : l'appelant doit alors traiter la zone
 * comme indéterminée, pas la remplacer par une valeur par défaut — un montant
 * d'indemnité calculé sur une zone devinée serait faux sur un document signé.
 */
export const getZoneDuPaysFr = cache(async (nomPaysFr: string): Promise<Zone | null> => {
  if (!nomPaysFr) return null;
  const pays = await prisma.pays.findFirst({
    where: { nomFr: nomPaysFr },
    select: { codeZone: true },
  });
  return pays ? (pays.codeZone as Zone) : null;
});

/**
 * Pays destinables sous forme d'options, `valeur` = code ISO.
 *
 * Distincte de `getNomsPays` : un filtre de liste doit envoyer dans l'URL une
 * valeur STABLE et courte. Le nom français ne l'est pas — il contient des accents
 * et des espaces, et une correction d'orthographe au référentiel casserait tous les
 * liens partagés. Le code ISO est aussi ce que porte `ordre_mission.code_pays`,
 * donc le filtre se compare sans traduction.
 */
export const getPaysOptions = cache(async (): Promise<OptionReferentiel[]> => {
  const lignes = await prisma.pays.findMany({
    orderBy: { nomFr: "asc" },
    select: { codeIso: true, nomFr: true },
  });
  // `code_iso` est un CHAR(2) : PostgreSQL le complète à droite. Sans `trim`, la
  // valeur du `<option>` porterait un espace et ne correspondrait plus au
  // paramètre relu depuis l'URL.
  return lignes.map((p) => ({ valeur: p.codeIso.trim(), libelle: p.nomFr }));
});

/**
 * Code ISO **et** zone d'un pays, à partir de son nom français.
 *
 * ── Pourquoi cette fonction en plus de `getZoneDuPaysFr` ─────────────────────
 *
 * La création d'un ordre de mission a besoin des DEUX : `ordre_mission.code_pays`
 * est une clé étrangère vers `pays.code_iso`, tandis que la zone détermine
 * l'indemnité. Les obtenir par deux appels ferait deux requêtes pour lire deux
 * colonnes de la même ligne — et surtout ouvrirait la possibilité qu'elles
 * portent sur des lignes différentes si la classification changeait entre les
 * deux.
 *
 * `null` si le nom n'est pas au référentiel. L'appelant doit alors refuser :
 * sans zone, l'indemnité serait devinée, et fausse sur un document signé.
 */
export const getPaysParNomFr = cache(
  async (nomPaysFr: string): Promise<{ codeIso: string; zone: Zone } | null> => {
    if (!nomPaysFr) return null;
    const pays = await prisma.pays.findFirst({
      where: { nomFr: nomPaysFr },
      select: { codeIso: true, codeZone: true },
    });
    // `code_iso` est un CHAR(2) : PostgreSQL le complète à droite. `trim()` évite
    // qu'un espace parasite se retrouve dans une comparaison JavaScript, qui
    // n'ignore pas les blancs de fin comme le fait `bpchar`.
    return pays ? { codeIso: pays.codeIso.trim(), zone: pays.codeZone as Zone } : null;
  }
);

/**
 * Montant de l'indemnité journalière pour un couple (statut, zone).
 *
 * `undefined` si le couple n'existe pas au barème. L'appelant NE DOIT PAS
 * substituer 0 : un OM sans indemnité calculée doit être signalé, pas émis avec
 * un montant nul. C'est ce que le `console.warn` de lib/baremes.ts cherchait à
 * prévenir en développement ; la contrainte de clé étrangère le garantit
 * maintenant côté base, mais le couple peut rester absent si un statut n'a pas
 * été amorcé pour les 4 zones.
 */
export const getMontantFraisFixe = cache(
  async (codeStatut: string, zone: Zone): Promise<number | undefined> => {
    const ligne = await prisma.baremeFraisFixe.findUnique({
      where: { codeStatut_codeZone: { codeStatut, codeZone: zone } },
      select: { montantJournalier: true },
    });
    return ligne?.montantJournalier;
  }
);

/** Types de congé actifs. ⚠️ Liste encore provisoire, à valider par la DRH. */
export const getTypesConge = cache(async (): Promise<OptionReferentiel[]> => {
  const lignes = await prisma.typeConge.findMany({
    where: { actif: true },
    orderBy: { libelle: "asc" },
    select: { code: true, libelle: true },
  });
  return lignes.map((t) => ({ valeur: t.code, libelle: t.libelle }));
});
