import type { Zone } from "@/lib/zones";
import { STATUTS } from "@/lib/referentiels";

// ⚠️ VALEURS PLACEHOLDER — générées arbitrairement (ordre de grandeur
// plausible, décroissant avec le rang, croissant avec l'éloignement de la
// zone), PAS le vrai barème EDC. À remplacer ligne par ligne dès que les
// vraies valeurs sont communiquées ; la structure (un montant par statut et
// par zone) ne devrait pas avoir à changer.
//
// Devise implicite : FCFA (siège EDC au Cameroun).
export const BAREME_FRAIS_FIXE: Record<string, Record<Zone, number>> = {
  "Administrateur": { 0: 75000, 1: 110000, 2: 150000, 3: 190000 },
  "Directeur Général": { 0: 70000, 1: 105000, 2: 145000, 3: 185000 },
  "Directeur Général Adjoint": { 0: 65000, 1: 95000, 2: 135000, 3: 170000 },
  "Directeur": { 0: 55000, 1: 85000, 2: 120000, 3: 150000 },
  "Sous-directeur": { 0: 45000, 1: 70000, 2: 100000, 3: 130000 },
  "Chef de Service": { 0: 38000, 1: 58000, 2: 85000, 3: 110000 },
  "Chef de Bureau": { 0: 32000, 1: 50000, 2: 72000, 3: 95000 },
  "Cadre": { 0: 27000, 1: 42000, 2: 60000, 3: 80000 },
  "Agent de maîtrise": { 0: 22000, 1: 34000, 2: 48000, 3: 65000 },
  "Agent d'exécution": { 0: 18000, 1: 28000, 2: 40000, 3: 55000 },
};

// Garde-fou dev : signale au chargement du module si un statut du
// référentiel n'a pas (ou plus) de ligne dans le barème — sinon l'absence
// se traduirait juste par un montant manquant, silencieusement, sur un
// document réel.
if (process.env.NODE_ENV !== "production") {
  for (const { valeur } of STATUTS) {
    if (!(valeur in BAREME_FRAIS_FIXE)) {
      console.warn(`[baremes] Aucun frais fixe défini pour le statut "${valeur}".`);
    }
  }
}

export function montantFraisFixe(statut: string | undefined, zone: Zone | null): number | undefined {
  if (!statut || zone === null) return undefined;
  return BAREME_FRAIS_FIXE[statut]?.[zone];
}
