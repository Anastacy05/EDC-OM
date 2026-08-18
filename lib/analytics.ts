import { mockOMs } from "@/lib/mockData";
import { continentDuPaysFr, type Continent } from "@/lib/continents";
import { findEmployeeByMatricule } from "@/lib/employees";

// ---------------------------------------------------------------------------
// Carte du monde et frise chronologique comptent la MISSION (un OM = une
// unité, quel que soit son nombre de participants) : "3 personnes sur le
// même vol vers Douala" reste UNE mission enregistrée vers le Cameroun.
//
// La pyramide compte le PARTICIPANT : trois personnes de statuts différents
// sur une même mission doivent apparaître chacune dans leur propre barre.
// ---------------------------------------------------------------------------

export interface Compte<T extends string | number> {
  cle: T;
  count: number;
}

// --- Carte du monde ---------------------------------------------------

export function missionsParContinent(): Compte<Continent>[] {
  const compteurs = new Map<Continent, number>();
  for (const om of mockOMs) {
    if (!om.paysDestination) continue;
    const continent = continentDuPaysFr(om.paysDestination);
    if (!continent) continue;
    compteurs.set(continent, (compteurs.get(continent) ?? 0) + 1);
  }
  return [...compteurs.entries()].map(([cle, count]) => ({ cle, count }));
}

export function missionsParPaysDansContinent(continent: Continent): Compte<string>[] {
  const compteurs = new Map<string, number>();
  for (const om of mockOMs) {
    if (!om.paysDestination) continue;
    if (continentDuPaysFr(om.paysDestination) !== continent) continue;
    compteurs.set(om.paysDestination, (compteurs.get(om.paysDestination) ?? 0) + 1);
  }
  return [...compteurs.entries()]
    .map(([cle, count]) => ({ cle, count }))
    .sort((a, b) => b.count - a.count);
}

// --- Frise chronologique -----------------------------------------------

export function missionsParAnnee(): Compte<number>[] {
  const compteurs = new Map<number, number>();
  for (const om of mockOMs) {
    if (!om.dateDepart) continue;
    const annee = new Date(om.dateDepart).getFullYear();
    compteurs.set(annee, (compteurs.get(annee) ?? 0) + 1);
  }
  return [...compteurs.entries()]
    .map(([cle, count]) => ({ cle, count }))
    .sort((a, b) => a.cle - b.cle);
}

export const NOMS_MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export function missionsParMoisDansAnnee(annee: number): Compte<number>[] {
  const compteurs = new Map<number, number>();
  for (const om of mockOMs) {
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

// --- Pyramide hiérarchique -----------------------------------------------

export function participantsParStatut(): Compte<string>[] {
  const compteurs = new Map<string, number>();
  for (const om of mockOMs) {
    for (const participant of om.participants) {
      if (!participant.statutHierarchique) continue;
      compteurs.set(
        participant.statutHierarchique,
        (compteurs.get(participant.statutHierarchique) ?? 0) + 1
      );
    }
  }
  return [...compteurs.entries()].map(([cle, count]) => ({ cle, count }));
}

export interface ComptePersonne {
  matricule: string;
  nom: string;
  prenoms: string;
  count: number;
}

export function participantsParEmployeDansStatut(statut: string): ComptePersonne[] {
  const compteurs = new Map<string, number>();
  for (const om of mockOMs) {
    for (const participant of om.participants) {
      if (participant.statutHierarchique !== statut) continue;
      if (!participant.matricule) continue;
      compteurs.set(participant.matricule, (compteurs.get(participant.matricule) ?? 0) + 1);
    }
  }
  return [...compteurs.entries()]
    .map(([matricule, count]) => {
      const employe = findEmployeeByMatricule(matricule);
      return {
        matricule,
        nom: employe?.nom ?? matricule,
        prenoms: employe?.prenoms ?? "",
        count,
      };
    })
    .sort((a, b) => b.count - a.count);
}
