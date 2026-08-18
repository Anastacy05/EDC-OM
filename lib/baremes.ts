import type { Zone } from "@/lib/zones";
import { STATUTS } from "@/lib/referentiels";


// Devise implicite : FCFA (siège EDC au Cameroun).
export const BAREME_FRAIS_FIXE: Record<string, Record<Zone, number>> = {
  "Administrateur": { 0: 150000, 1: 250000, 2: 300000, 3: 350000 },
  "Directeur Général": { 0: 150000, 1: 250000, 2: 300000, 3: 350000 },
  "Directeur Général Adjoint": { 0: 150000, 1: 250000, 2: 300000, 3: 350000 },
  "Directeur": { 0: 100000, 1: 150000, 2: 175000, 3: 200000 },
  "Sous-directeur": { 0: 80000, 1: 130000, 2: 150000, 3: 175000 },
  "Chef de Service": { 0: 70000, 1: 120000, 2: 140000, 3: 160000 },
  "Chef de Bureau": { 0: 65000, 1: 110000, 2: 130000, 3: 150000 },
  "Cadre": { 0: 60000, 1: 110000, 2: 130000, 3: 150000 },
  "Agent de maîtrise": { 0: 50000, 1: 110000, 2: 130000, 3: 150000 },
  "Agent d'exécution": { 0: 30000, 1: 110000, 2: 130000, 3: 150000 },
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
