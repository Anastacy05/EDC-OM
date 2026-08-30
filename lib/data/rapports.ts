import "server-only";

import { prisma } from "@/lib/data/client";
import { exigerSession } from "@/lib/auth/garde";
import { continentDepuisColonneBD, type Continent } from "@/lib/continents";
import { versChampDate } from "@/lib/dateUtils";
import { analyserDate } from "@/lib/data/employes.validation";
import type { StatutParticipation } from "@/lib/data/om.validation";

/**
 * Données brutes consommées par les rapports (carte du monde, frise
 * chronologique, pyramide par statut — MODELE-DONNEES.md §11, catalogue
 * n° 10-12).
 *
 * AJOUTÉ le 26/08/2026, à l'occasion de l'étape 14 (commenter lib/mockData.ts
 * et lib/employees.ts) : ces trois rapports lisaient encore `mockOMs` et
 * `findEmployeeByMatricule`, la seule chose qui empêchait de commenter ces
 * deux fichiers. Ce module fait la bascule vers la base, en isolant l'accès
 * Prisma ici pour que `lib/analytics.ts` (fonctions pures de comptage) reste
 * indépendant de la source des données — testable sans base, et prêt pour le
 * catalogue complet de rapports de l'étape 12.
 *
 * ⚠️ Portée volontairement identique à ce que `mockOMs` donnait : AUCUN filtre
 * sur le statut de la participation (EN_ATTENTE/CONFIRME/REFUSE/ANNULE/EXPIRE
 * comptent tous). Décider si un rapport doit exclure les refusés/annulés est
 * un choix de produit qui relève de l'étape 12, pas de cette bascule.
 *
 * ── Le continent vient de la COLONNE `pays.continent`, pas d'un recalcul ────
 *
 * MODIFIÉ le 26/08/2026 : `continentDuPaysParCode` (lib/continents.ts) est une
 * classification STATIQUE, écrite en dur — elle n'a servi qu'à AMORCER la
 * colonne `pays.continent` (`prisma/seed.ts`). Une fois la table peuplée,
 * c'est ELLE la source de vérité : un administrateur peut y avoir corrigé un
 * territoire contesté, ou y avoir ajouté un pays absent de la bibliothèque de
 * seed (`country-state-city`). Relire `continentDuPaysParCode` à chaque
 * rapport aurait ignoré silencieusement ces corrections. `continentDepuisColonneBD`
 * ne fait que reconvertir la valeur d'énum déjà en base vers son libellé
 * français — elle ne classe rien elle-même.
 */

export interface MissionRapport {
  id: string;
  /**
   * Code ISO alpha-2 (ex. `"CM"`) — clé STABLE pour regrouper/lier vers
   * `/om?pays=`, qui filtre sur `ordre_mission.code_pays` (lib/data/om.ts),
   * PAS sur le nom affiché.
   *
   * CORRIGÉ le 26/08/2026 : `missionsParPaysDansContinent` groupait
   * auparavant par `paysDestination` (nom FR). Deux défauts distincts en
   * découlaient : (1) `CarteMonde.tsx` calculait SON PROPRE nom français via
   * `i18n-iso-countries`, qui peut différer de l'orthographe choisie en base
   * (ex. parenthèses, article) — la couleur d'un pays sur la carte pouvait donc
   * rester grise malgré des missions réelles ; (2) le clic « voir la liste »
   * envoyait ce nom vers `/om?pays=<nom>`, qui ne renvoyait jamais rien
   * puisque ce filtre compare au CODE, pas au nom. Grouper par code élimine
   * les deux : un seul identifiant, non ambigu, aux deux bouts.
   */
  codePays: string;
  /** Nom français du pays — LU EN BASE (`pays.nom_fr`), jamais recalculé, pour l'AFFICHAGE seulement (jamais comme clé). */
  paysDestination: string;
  /** Lu depuis la colonne `pays.continent` (voir le commentaire d'en-tête du fichier) — `null` seulement si la valeur d'énum est un jour étendue sans que ce mapping suive. */
  continent: Continent | null;
  /**
   * Code de zone (`pays.code_zone`, table `zone`) — sert au rapport n° 5.
   * LU EN BASE, PAS recalculé via `lib/zones.ts` → `zoneDuPaysParCode` : même
   * raisonnement que pour le continent (cf. commentaire d'en-tête) —
   * `zoneDuPaysParCode` n'a servi qu'à AMORCER cette colonne au seed, la
   * colonne fait foi ensuite.
   */
  codeZone: number;
  /** Date de départ, format `AAAA-MM-JJ`. */
  dateDepart: string;
}

export interface ParticipantRapport {
  matricule: string;
  /**
   * Nom et prénoms tirés de l'INSTANTANÉ (`participation.nom_s`/`prenoms_s`),
   * pas de la fiche employé actuelle — cohérent avec le principe déjà en place
   * pour le document imprimé (MODELE-DONNEES.md §5) : un OM de mars doit
   * afficher la situation de mars, même si l'employé a changé de nom depuis.
   * C'est d'ailleurs plus exact que l'ancien `findEmployeeByMatricule`, qui
   * lisait toujours la situation du jour.
   */
  nom: string;
  prenoms: string;
  /** Code du référentiel STATUTS (ex. `"CADRE"`), pas le libellé affiché. */
  codeStatut: string;
}

export interface DonneesRapports {
  missions: MissionRapport[];
  participants: ParticipantRapport[];
}

/**
 * Une entrée par pays connu de la base (`pays.nom_fr`, `pays.continent`),
 * indexée par code ISO — sert à `CarteMonde.tsx` pour l'affichage (nom au
 * survol) ET le regroupement par continent des ~180 tracés du fond de carte.
 *
 * AJOUTÉ le 26/08/2026 : avant, `CarteMonde` recalculait ces deux
 * informations lui-même à partir de bibliothèques tierces
 * (`i18n-iso-countries` pour le nom, `continentDuPaysParCode` pour le
 * continent) — deux copies indépendantes de ce que `seedPays()` avait déjà
 * écrit en base, susceptibles de diverger d'une correction faite par
 * l'administrateur. Le fond de carte (les TRACÉS géographiques eux-mêmes,
 * `world-atlas`) reste une bibliothèque, parce qu'il n'existe aucune table
 * `pays.geometrie` — mais le NOM et le CONTINENT affichés viennent maintenant
 * uniquement d'ici.
 */
export interface EntreeReferentielPays {
  nomFr: string;
  continent: Continent | null;
}

export async function lireReferentielPays(): Promise<Record<string, EntreeReferentielPays>> {
  await exigerSession();

  const tousPays = await prisma.pays.findMany({
    select: { codeIso: true, nomFr: true, continent: true },
  });

  return Object.fromEntries(
    tousPays.map((p) => [
      p.codeIso,
      { nomFr: p.nomFr, continent: continentDepuisColonneBD(p.continent) },
    ])
  );
}

/**
 * Libellé de chaque zone (`zone.libelle`), indexé par code — sert au
 * rapport n° 5 pour AFFICHER `MissionRapport.codeZone` sans deviner un texte.
 * Comme `lireReferentielPays`, purement déclaratif : 4 lignes, jamais
 * recalculées ailleurs que par `prisma/seed.ts` → `seedZones`.
 */
export async function lireReferentielZones(): Promise<Record<number, string>> {
  await exigerSession();

  const zones = await prisma.zone.findMany({ select: { code: true, libelle: true } });
  return Object.fromEntries(zones.map((z) => [z.code, z.libelle]));
}

/** Lecture complète pour les rapports. Ouverte à tout compte authentifié, comme la liste des OM (§17.10). */
export async function lireDonneesRapports(): Promise<DonneesRapports> {
  await exigerSession();

  const [oms, participations] = await Promise.all([
    prisma.ordreMission.findMany({
      select: {
        id: true,
        dateDepart: true,
        pays: { select: { nomFr: true, codeIso: true, continent: true, codeZone: true } },
      },
    }),
    prisma.participation.findMany({
      select: { matricule: true, nomS: true, prenomsS: true, codeStatutS: true },
    }),
  ]);

  const missions: MissionRapport[] = oms.map((om) => ({
    id: om.id.toString(),
    codePays: om.pays.codeIso,
    paysDestination: om.pays.nomFr,
    continent: continentDepuisColonneBD(om.pays.continent),
    codeZone: om.pays.codeZone,
    dateDepart: versChampDate(om.dateDepart),
  }));

  const participants: ParticipantRapport[] = participations.map((p) => ({
    matricule: p.matricule,
    nom: p.nomS,
    prenoms: p.prenomsS,
    codeStatut: p.codeStatutS,
  }));

  return { missions, participants };
}

// ═══════════════════════════════════════════════════════════════════════════
// Rapports financiers/opérationnels (catalogue §11, n° 1-9)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Une ligne = une PARTICIPATION (pas une mission) : le coût et la durée sont
 * des grandeurs par personne, pas par OM. Trois personnes sur le même vol
 * vers Douala ont chacune leur ligne, leur coût, leurs jours — contrairement à
 * `MissionRapport` (carte/frise), qui compte l'OM comme unité.
 */
export interface LigneRapport {
  idOrdreMission: string;
  matricule: string;
  /** Instantané (`participation.nom_s`/`prenoms_s`) — cf. le commentaire de `ParticipantRapport.nom` sur pourquoi. */
  nom: string;
  prenoms: string;
  numeroOM: string;
  /**
   * Direction/service — instantané (`participation.code_departement_s`).
   * PEUT ÊTRE un code (`Departement.code`, ex. "DEX") OU un libellé libre
   * saisi à la main (cf. le commentaire de la colonne en base, élargie le
   * 24/08/2026) : `libelleDepartement()` (lib/referentiels.ts) sait résoudre
   * les deux, comme le fait déjà `/om` (app/om/page.tsx) — les rapports n° 3
   * et 9 réutilisent la MÊME fonction plutôt que d'en écrire une seconde.
   */
  codeDepartement: string;
  statutParticipation: StatutParticipation;
  /** `AAAA-MM-JJ`. */
  dateDepart: string;
  /** `date_retour - date_depart + 1`, même calcul que lib/data/om.ts (listerOM). */
  dureeJours: number;
  /** `montant_frais_fixe_journalier × dureeJours`. 0 si le montant n'a pas pu être calculé à la création. */
  coutFcfa: number;
}

export interface FiltrePeriode {
  /** `AAAA-MM-JJ`, borne incluse. Filtre sur `date_depart`. */
  debut?: string;
  /** `AAAA-MM-JJ`, borne incluse. Filtre sur `date_depart`. */
  fin?: string;
}

interface LigneRapportBrute {
  id_om: bigint;
  matricule: string;
  nom_s: string;
  prenoms_s: string;
  numero_om: string;
  code_departement_s: string;
  statut: string;
  date_depart: Date;
  duree_jours: number;
  montant_frais_fixe_journalier: number | null;
}

/**
 * Lecture pour les rapports financiers/opérationnels (n° 1 à 9). Filtre par
 * période sur `date_depart`, en SQL — même logique que `listerOM`
 * (lib/data/om.ts), pas un filtre en mémoire après coup : une période large ne
 * doit pas faire transiter des années de participations pour n'en garder que
 * quelques mois.
 *
 * Pas de filtre sur `statut` ICI : chaque rapport décide lui-même ce qu'il
 * compte (ex. `indicateursTete` exclut REFUSE/ANNULE/EXPIRE du coût, cf. son
 * commentaire) — cette fonction reste neutre, comme `lireDonneesRapports`.
 */
export async function lireLignesRapports(filtre: FiltrePeriode = {}): Promise<LigneRapport[]> {
  await exigerSession();

  const debut = filtre.debut ? analyserDate(filtre.debut) : null;
  const fin = filtre.fin ? analyserDate(filtre.fin) : null;

  const lignes = await prisma.$queryRaw<LigneRapportBrute[]>`
    SELECT
      o.id                                        AS id_om,
      p.matricule,
      p.nom_s,
      p.prenoms_s,
      p.numero_om,
      p.code_departement_s,
      p.statut::text                              AS statut,
      o.date_depart,
      (o.date_retour - o.date_depart + 1)         AS duree_jours,
      p.montant_frais_fixe_journalier
    FROM participation p
    JOIN ordre_mission o ON o.id = p.id_ordre_mission
    WHERE (${debut}::date IS NULL OR o.date_depart >= ${debut}::date)
      AND (${fin}::date IS NULL OR o.date_depart <= ${fin}::date)
  `;

  return lignes.map((l) => ({
    idOrdreMission: l.id_om.toString(),
    matricule: l.matricule,
    nom: l.nom_s,
    prenoms: l.prenoms_s,
    numeroOM: l.numero_om,
    codeDepartement: l.code_departement_s,
    statutParticipation: l.statut as StatutParticipation,
    dateDepart: versChampDate(l.date_depart),
    dureeJours: Number(l.duree_jours),
    coutFcfa: (l.montant_frais_fixe_journalier ?? 0) * Number(l.duree_jours),
  }));
}

// STATUTS_ENGAGEANTS non ré-exporté ici : lib/analytics.ts l'importe
// directement depuis lib/data/om.validation.ts, qui est déjà conçu pour être
// importable côté client (aucune dépendance à Prisma, cf. son en-tête) — une
// ré-exportation ici ajouterait un détour sans raison.

// ═══════════════════════════════════════════════════════════════════════════
// Rapport n° 7 — OM en attente vieillissants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Une ligne = une participation `EN_ATTENTE`, avec de quoi AGIR (§11, « le
 * travail du lecteur ») : `idOrdreMission` pour le lien vers `/om/[id]`, le
 * `matricule` pour `?participant=`, comme le fait déjà `PyramideInteractif`
 * vers `/om?matricule=`.
 */
export interface LigneOMEnAttente {
  idOrdreMission: string;
  matricule: string;
  nom: string;
  prenoms: string;
  numeroOM: string;
  destination: string;
  dateDepart: string;
  /** Date d'émission du document — c'est elle qui mesure l'ancienneté, pas la date de départ : un OM émis il y a trois semaines pour un départ dans 2 jours est tout aussi urgent qu'un émis il y a trois semaines pour un départ hier. */
  dateEmission: string;
  /** Vrai si bloqué par un conflit (`blocage_motif` non nul) — l'admin ne peut pas confirmer avant d'avoir arbitré, cf. BadgeStatut.tsx. */
  bloque: boolean;
}

interface LigneOMEnAttenteBrute {
  id_om: bigint;
  matricule: string;
  nom_s: string;
  prenoms_s: string;
  numero_om: string;
  nom_fr: string;
  ville_destination: string;
  date_depart: Date;
  date_emission: Date;
  blocage_motif: string | null;
}

/**
 * Toutes les participations `EN_ATTENTE`, triées par date d'ÉMISSION
 * croissante (les plus anciennes d'abord) — c'est la liste de travail de
 * l'administrateur, pas un rapport filtré par période : un OM oublié depuis
 * deux mois doit apparaître même si le filtre de période des autres rapports
 * de la page d'accueil est resté sur « cette année ».
 *
 * Pas de pagination ICI, contrairement à `listerOM` : le nombre d'OM en
 * attente à un instant donné est par construction petit (c'est un encours,
 * pas un historique) — le paginer ajouterait une complexité sans bénéfice
 * réel tant que ce nombre reste de cet ordre de grandeur.
 */
export async function lireOMEnAttenteVieillissants(): Promise<LigneOMEnAttente[]> {
  await exigerSession();

  const lignes = await prisma.$queryRaw<LigneOMEnAttenteBrute[]>`
    SELECT
      o.id                AS id_om,
      p.matricule,
      p.nom_s,
      p.prenoms_s,
      p.numero_om,
      y.nom_fr,
      o.ville_destination,
      o.date_depart,
      p.date_emission,
      p.blocage_motif
    FROM participation p
    JOIN ordre_mission o ON o.id = p.id_ordre_mission
    JOIN pays          y ON y.code_iso = o.code_pays
    WHERE p.statut = 'EN_ATTENTE'
    ORDER BY p.date_emission ASC, p.numero_om ASC
  `;

  return lignes.map((l) => ({
    idOrdreMission: l.id_om.toString(),
    matricule: l.matricule,
    nom: l.nom_s,
    prenoms: l.prenoms_s,
    numeroOM: l.numero_om,
    destination: `${l.nom_fr.trim()}, ${l.ville_destination}`,
    dateDepart: versChampDate(l.date_depart),
    dateEmission: versChampDate(l.date_emission),
    bloque: l.blocage_motif !== null,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Rapport n° 2 — Coût par période
// ═══════════════════════════════════════════════════════════════════════════
//
// Pas de fonction dédiée ici : `lireLignesRapports` (ci-dessus) donne déjà
// tout ce qu'il faut (coût + date de départ par ligne) — l'agrégation par
// mois/année est une fonction PURE de lib/analytics.ts (`coutParMois`,
// `coutParAnnee`), sur le même modèle que `missionsParAnnee`.
