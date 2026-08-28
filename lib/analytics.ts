import type { Continent } from "@/lib/continents";
import type { MissionRapport, ParticipantRapport, LigneRapport } from "@/lib/data/rapports";
import { STATUTS_ENGAGEANTS, type StatutParticipation } from "@/lib/data/om.validation";

// ---------------------------------------------------------------------------
// Carte du monde et frise chronologique comptent la MISSION (un OM = une
// unité, quel que soit son nombre de participants) : "3 personnes sur le
// même vol vers Douala" reste UNE mission enregistrée vers le Cameroun.
//
// La pyramide compte le PARTICIPANT : trois personnes de statuts différents
// sur une même mission doivent apparaître chacune dans leur propre barre.
//
// MODIFIÉ le 26/08/2026 (étape 14) : ces fonctions lisaient `mockOMs`
// (lib/mockData.ts) et `findEmployeeByMatricule` (lib/employees.ts)
// directement, deux globales alimentées par localStorage — désormais
// commentées. Elles prennent maintenant les données en PARAMÈTRE
// (`MissionRapport[]`/`ParticipantRapport[]`, lues en base par
// lib/data/rapports.ts) : le calcul reste pur et testable sans base, seule la
// provenance des données change. Les appelants (les pages `/rapports/*`)
// récupèrent ces tableaux côté serveur et les redescendent en props.
// ---------------------------------------------------------------------------

export interface Compte<T extends string | number> {
  cle: T;
  count: number;
}

/** FCFA sans décimale, séparateur de milliers français — même format partout où un montant s'affiche. */
export function formatFcfa(montant: number): string {
  return new Intl.NumberFormat("fr-FR").format(montant) + " FCFA";
}

// --- Carte du monde ---------------------------------------------------

export function missionsParContinent(missions: MissionRapport[]): Compte<Continent>[] {
  const compteurs = new Map<Continent, number>();
  for (const om of missions) {
    if (!om.continent) continue;
    compteurs.set(om.continent, (compteurs.get(om.continent) ?? 0) + 1);
  }
  return [...compteurs.entries()].map(([cle, count]) => ({ cle, count }));
}

/** `cle` = code ISO du pays (stable), `libelle` = nom français (affichage seulement). */
export interface CompteLibelle {
  cle: string;
  libelle: string;
  count: number;
}

export function missionsParPaysDansContinent(
  missions: MissionRapport[],
  continent: Continent
): CompteLibelle[] {
  const compteurs = new Map<string, { libelle: string; count: number }>();
  for (const om of missions) {
    if (om.continent !== continent) continue;
    const existant = compteurs.get(om.codePays);
    if (existant) {
      existant.count += 1;
    } else {
      compteurs.set(om.codePays, { libelle: om.paysDestination, count: 1 });
    }
  }
  return [...compteurs.entries()]
    .map(([cle, v]) => ({ cle, libelle: v.libelle, count: v.count }))
    .sort((a, b) => b.count - a.count);
}

// --- Rapport n° 4 — Top destinations ------------------------------------

/** Toutes les destinations, comptées par MISSION (pas par participation), triées par fréquence décroissante — le catalogue (§11) prescrit « top 10 + Autres », géré par l'appelant (page), pas ici : cette fonction rend le classement complet. */
export function topDestinations(missions: MissionRapport[]): CompteLibelle[] {
  const compteurs = new Map<string, { libelle: string; count: number }>();
  for (const om of missions) {
    const existant = compteurs.get(om.codePays);
    if (existant) {
      existant.count += 1;
    } else {
      compteurs.set(om.codePays, { libelle: om.paysDestination, count: 1 });
    }
  }
  return [...compteurs.entries()]
    .map(([cle, v]) => ({ cle, libelle: v.libelle, count: v.count }))
    .sort((a, b) => b.count - a.count);
}

// --- Rapport n° 5 — Répartition par zone --------------------------------

/** `cle` = code de zone (0-3, `pays.code_zone`), dans l'ordre CROISSANT du barème — une échelle ORDINALE (zone 0 < zone 1 < ... ), pas un classement par fréquence : la zone 3 doit toujours s'afficher après la zone 2, même si elle compte plus de missions. */
export function missionsParZone(missions: MissionRapport[]): Compte<number>[] {
  const compteurs = new Map<number, number>();
  for (const om of missions) {
    compteurs.set(om.codeZone, (compteurs.get(om.codeZone) ?? 0) + 1);
  }
  return [...compteurs.entries()]
    .map(([cle, count]) => ({ cle, count }))
    .sort((a, b) => a.cle - b.cle);
}

// --- Frise chronologique -----------------------------------------------

export function missionsParAnnee(missions: MissionRapport[]): Compte<number>[] {
  const compteurs = new Map<number, number>();
  for (const om of missions) {
    if (!om.dateDepart) continue;
    const annee = new Date(om.dateDepart).getFullYear();
    compteurs.set(annee, (compteurs.get(annee) ?? 0) + 1);
  }
  return [...compteurs.entries()]
    .map(([cle, count]) => ({ cle, count }))
    .sort((a, b) => a.cle - b.cle);
}

// NOMS_MOIS n'est PAS redéfini ici : lib/dateUtils.ts le porte déjà
// (utilisé par lib/data/om.ts). Les appelants l'importent de là.

export function missionsParMoisDansAnnee(missions: MissionRapport[], annee: number): Compte<number>[] {
  const compteurs = new Map<number, number>();
  for (const om of missions) {
    if (!om.dateDepart) continue;
    const date = new Date(om.dateDepart);
    if (date.getFullYear() !== annee) continue;
    const mois = date.getMonth();
    compteurs.set(mois, (compteurs.get(mois) ?? 0) + 1);
  }
  return [...compteurs.entries()]
    .map(([cle, count]) => ({ cle, count }))
    .sort((a, b) => a.cle - b.cle);
}

// Bornes ISO du mois `mois` (0-11) de `annee`, pour filtrer la liste par
// période une fois qu'on a choisi un mois dans le modal.
export function bornesDuMois(annee: number, mois: number): { debut: string; fin: string } {
  const debut = new Date(Date.UTC(annee, mois, 1));
  const fin = new Date(Date.UTC(annee, mois + 1, 0)); // jour 0 du mois suivant = dernier jour du mois courant
  return { debut: debut.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
}

/**
 * Période de même longueur, immédiatement AVANT `[debut, fin]` — sert de
 * référence à la variation affichée sur les tuiles du rapport n° 1. Une
 * période de 31 jours se compare aux 31 jours précédents, pas au même
 * intervalle calendaire l'an dernier : plus simple, et correct pour une
 * période choisie librement (pas seulement une année pleine).
 */
export function periodePrecedente(debut: string, fin: string): { debut: string; fin: string } {
  const dDebut = new Date(`${debut}T00:00:00Z`);
  const dFin = new Date(`${fin}T00:00:00Z`);
  const dureeMs = dFin.getTime() - dDebut.getTime();

  const finPrecedente = new Date(dDebut.getTime() - 24 * 60 * 60 * 1000); // veille du début
  const debutPrecedent = new Date(finPrecedente.getTime() - dureeMs);

  return {
    debut: debutPrecedent.toISOString().slice(0, 10),
    fin: finPrecedente.toISOString().slice(0, 10),
  };
}

/** Variation en % de `valeur` par rapport à `reference`. `null` si `reference` est 0 (rien à comparer). */
export function variationPct(valeur: number, reference: number): number | null {
  if (reference === 0) return null;
  return ((valeur - reference) / reference) * 100;
}

// --- Pyramide hiérarchique -----------------------------------------------

// `cle` est le CODE du référentiel STATUTS (ex. "CADRE"), pas le libellé
// affiché — c'est ce que porte `participation.code_statut_s`. Les appelants
// libellisent via lib/data/referentiels.ts → getStatuts().
export function participantsParStatut(participants: ParticipantRapport[]): Compte<string>[] {
  const compteurs = new Map<string, number>();
  for (const participant of participants) {
    if (!participant.codeStatut) continue;
    compteurs.set(participant.codeStatut, (compteurs.get(participant.codeStatut) ?? 0) + 1);
  }
  return [...compteurs.entries()].map(([cle, count]) => ({ cle, count }));
}

export interface ComptePersonne {
  matricule: string;
  nom: string;
  prenoms: string;
  count: number;
}

export function participantsParEmployeDansStatut(
  participants: ParticipantRapport[],
  codeStatut: string
): ComptePersonne[] {
  const compteurs = new Map<string, ComptePersonne>();
  for (const participant of participants) {
    if (participant.codeStatut !== codeStatut) continue;
    const existant = compteurs.get(participant.matricule);
    if (existant) {
      existant.count += 1;
    } else {
      compteurs.set(participant.matricule, {
        matricule: participant.matricule,
        nom: participant.nom,
        prenoms: participant.prenoms,
        count: 1,
      });
    }
  }
  return [...compteurs.values()].sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// AJOUTÉ le 26/08/2026, étape 12 (catalogue de rapports, MODELE-DONNEES.md
// §11) — rapport n° 1 (indicateurs de tête) et n° 6 (suivi du processus).
//
// Les deux lisent `LigneRapport[]` (une ligne = une PARTICIPATION, avec son
// coût et sa durée propres), lu en base par lib/data/rapports.ts →
// `lireLignesRapports`, filtré par période EN SQL — pas ici : cette fonction
// ne reçoit déjà que les lignes de la période demandée.
// ---------------------------------------------------------------------------

export interface IndicateursTete {
  missionsConfirmees: number;
  coutTotalFcfa: number;
  joursCumules: number;
  omEnAttente: number;
}

/**
 * ── Ce que chaque chiffre compte, et pourquoi ────────────────────────────────
 *
 * `missionsConfirmees` et `omEnAttente` comptent l'ORDRE DE MISSION (comme la
 * carte/la frise) : trois personnes confirmées sur le même vol vers Douala
 * sont UNE mission confirmée, pas trois — c'est le document qui compte, pas
 * la ligne. Une mission est comptée dans `omEnAttente` dès qu'AU MOINS une de
 * ses participations est `EN_ATTENTE` (bloquée ou non — le blocage est un
 * sous-état de l'attente, pas un statut à part, cf. BadgeStatut.tsx).
 *
 * `coutTotalFcfa` et `joursCumules` somment la PARTICIPATION (le coût et les
 * jours sont des grandeurs par personne), et **seulement celles dont le
 * statut est dans `STATUTS_ENGAGEANTS`** (`EN_ATTENTE`, `CONFIRME` —
 * lib/data/om.validation.ts, arbitré le 22-23/08/2026) : un OM `ANNULE`,
 * `REFUSE` ou `EXPIRE` ne correspond à personne réellement parti — l'inclure
 * gonflerait un coût qui n'a pas eu lieu. C'est un choix, pas une évidence :
 * `EXPIRE` en particulier a pu correspondre à un vrai déplacement dont la
 * confirmation a simplement été oubliée (cf. §17.5, la régularisation) — mais
 * réutiliser `STATUTS_ENGAGEANTS` garde une SEULE définition de « ça a eu
 * lieu » dans toute l'appli, plutôt que d'en inventer une seconde ici.
 */
export function indicateursTete(lignes: LigneRapport[]): IndicateursTete {
  const missionsConfirmeesId = new Set<string>();
  const omEnAttenteId = new Set<string>();
  let coutTotalFcfa = 0;
  let joursCumules = 0;

  for (const ligne of lignes) {
    if (ligne.statutParticipation === "CONFIRME") {
      missionsConfirmeesId.add(ligne.idOrdreMission);
    }
    if (ligne.statutParticipation === "EN_ATTENTE") {
      omEnAttenteId.add(ligne.idOrdreMission);
    }
    if ((STATUTS_ENGAGEANTS as readonly string[]).includes(ligne.statutParticipation)) {
      coutTotalFcfa += ligne.coutFcfa;
      joursCumules += ligne.dureeJours;
    }
  }

  return {
    missionsConfirmees: missionsConfirmeesId.size,
    coutTotalFcfa,
    joursCumules,
    omEnAttente: omEnAttenteId.size,
  };
}

// Ordre FIXE des segments de la barre empilée — jamais l'ordre des comptes :
// « la couleur suit l'entité, jamais son rang » (§11, règles communes). Un
// filtre qui vide EN_ATTENTE ne doit pas faire sauter CONFIRME à sa place.
export const ORDRE_STATUTS_PROCESSUS: readonly StatutParticipation[] = [
  "EN_ATTENTE",
  "CONFIRME",
  "ANNULE",
  "REFUSE",
  "EXPIRE",
];

/** Compte de PARTICIPATIONS par statut (pas de mission ici : un OM à deux
 * participants aux statuts différents doit peser dans les deux segments). */
export function suiviProcessus(lignes: LigneRapport[]): Compte<StatutParticipation>[] {
  const compteurs = new Map<StatutParticipation, number>();
  for (const statut of ORDRE_STATUTS_PROCESSUS) compteurs.set(statut, 0);
  for (const ligne of lignes) {
    compteurs.set(ligne.statutParticipation, (compteurs.get(ligne.statutParticipation) ?? 0) + 1);
  }
  return ORDRE_STATUTS_PROCESSUS.map((cle) => ({ cle, count: compteurs.get(cle) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Rapport n° 2 — Coût par période. Même filtre que `indicateursTete` : ne
// somme que les participations dans `STATUTS_ENGAGEANTS` (cf. son commentaire
// détaillé plus haut pour le pourquoi).
// ---------------------------------------------------------------------------

export function coutParAnnee(lignes: LigneRapport[]): Compte<number>[] {
  const compteurs = new Map<number, number>();
  for (const ligne of lignes) {
    if (!(STATUTS_ENGAGEANTS as readonly string[]).includes(ligne.statutParticipation)) continue;
    const annee = new Date(ligne.dateDepart).getFullYear();
    compteurs.set(annee, (compteurs.get(annee) ?? 0) + ligne.coutFcfa);
  }
  return [...compteurs.entries()]
    .map(([cle, count]) => ({ cle, count }))
    .sort((a, b) => a.cle - b.cle);
}

export function coutParMois(lignes: LigneRapport[]): Compte<string>[] {
  const compteurs = new Map<string, number>();
  for (const ligne of lignes) {
    if (!(STATUTS_ENGAGEANTS as readonly string[]).includes(ligne.statutParticipation)) continue;
    // Clé "AAAA-MM" : triable lexicographiquement, contrairement à un simple
    // numéro de mois qui confondrait janvier 2025 et janvier 2026 si la
    // période demandée dépasse un an.
    const date = new Date(ligne.dateDepart);
    const cle = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    compteurs.set(cle, (compteurs.get(cle) ?? 0) + ligne.coutFcfa);
  }
  return [...compteurs.entries()]
    .map(([cle, count]) => ({ cle, count }))
    .sort((a, b) => (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0));
}

/** Nombre de jours entiers écoulés depuis `dateISO` (AAAA-MM-JJ) jusqu'à aujourd'hui. Sert au rapport n° 7. */
export function joursDepuis(dateISO: string): number {
  const debut = new Date(`${dateISO}T00:00:00Z`);
  const maintenant = new Date();
  const aujourdHuiUTC = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
  return Math.max(0, Math.round((aujourdHuiUTC.getTime() - debut.getTime()) / (24 * 60 * 60 * 1000)));
}

// ---------------------------------------------------------------------------
// Rapports n° 3 et n° 9 — coût et jours d'absence par direction.
//
// `cle` = `LigneRapport.codeDepartement` BRUT (code OU libellé libre, cf. son
// commentaire dans lib/data/rapports.ts) — PAS résolu ici : `lib/analytics.ts`
// reste indépendant de `lib/referentiels.ts` (qui, lui, dépend de rien
// d'autre mais reste un souci d'AFFICHAGE, pas de calcul). Les pages
// résolvent via `libelleDepartement()`, exactement comme `/om`
// (app/om/page.tsx) — une seule fonction de résolution dans toute l'appli.
//
// Même filtre `STATUTS_ENGAGEANTS` que `indicateursTete`/`coutParAnnee` (cf.
// leurs commentaires) : un OM annulé ne coûte rien et n'absente personne.
// ---------------------------------------------------------------------------

export function coutParDirection(lignes: LigneRapport[]): Compte<string>[] {
  const compteurs = new Map<string, number>();
  for (const ligne of lignes) {
    if (!(STATUTS_ENGAGEANTS as readonly string[]).includes(ligne.statutParticipation)) continue;
    compteurs.set(ligne.codeDepartement, (compteurs.get(ligne.codeDepartement) ?? 0) + ligne.coutFcfa);
  }
  return [...compteurs.entries()]
    .map(([cle, count]) => ({ cle, count }))
    .sort((a, b) => b.count - a.count);
}

export function joursAbsenceParDirection(lignes: LigneRapport[]): Compte<string>[] {
  const compteurs = new Map<string, number>();
  for (const ligne of lignes) {
    if (!(STATUTS_ENGAGEANTS as readonly string[]).includes(ligne.statutParticipation)) continue;
    compteurs.set(ligne.codeDepartement, (compteurs.get(ligne.codeDepartement) ?? 0) + ligne.dureeJours);
  }
  return [...compteurs.entries()]
    .map(([cle, count]) => ({ cle, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Rapport n° 8 — missions par employé (tableau paginé/cherchable/exportable,
// géré côté page : ici, seulement l'agrégation par matricule).
// ---------------------------------------------------------------------------

export interface LigneEmploye {
  matricule: string;
  nom: string;
  prenoms: string;
  nombreMissions: number;
  joursCumules: number;
  coutFcfa: number;
}

/** Une ligne par EMPLOYÉ (pas par participation) — même filtre `STATUTS_ENGAGEANTS` que les rapports n° 1/2/3/9. */
export function missionsParEmploye(lignes: LigneRapport[]): LigneEmploye[] {
  const parEmploye = new Map<string, LigneEmploye>();
  for (const ligne of lignes) {
    if (!(STATUTS_ENGAGEANTS as readonly string[]).includes(ligne.statutParticipation)) continue;
    const existant = parEmploye.get(ligne.matricule);
    if (existant) {
      existant.nombreMissions += 1;
      existant.joursCumules += ligne.dureeJours;
      existant.coutFcfa += ligne.coutFcfa;
    } else {
      parEmploye.set(ligne.matricule, {
        matricule: ligne.matricule,
        nom: ligne.nom,
        prenoms: ligne.prenoms,
        nombreMissions: 1,
        joursCumules: ligne.dureeJours,
        coutFcfa: ligne.coutFcfa,
      });
    }
  }
  return [...parEmploye.values()].sort((a, b) => b.nombreMissions - a.nombreMissions);
}
