// Les <input type="date"> donnent du "AAAA-MM-JJ" (ISO), pratique pour filtrer
// (durée, mois). Le document Word attend du "JJ/MM/AAAA" — donc on stocke en
// ISO et on ne convertit qu'au moment d'envoyer les données à /api/generate-om.

export function formatDateFR(iso?: string): string {
  if (!iso) return "";
  const [annee, mois, jour] = iso.split("-");
  if (!annee || !mois || !jour) return iso; // déjà dans un autre format, on laisse tel quel
  return `${jour}/${mois}/${annee}`;
}

// Les <input type="time"> donnent du "HH:mm" — converti en "HHhmm" pour
// coller à la convention déjà utilisée sur le document ("07h00").
export function formatHeureFR(heure?: string): string {
  if (!heure) return "";
  const [h, m] = heure.split(":");
  if (!h || !m) return heure; // déjà dans un autre format, on laisse tel quel
  return `${h}h${m}`;
}

// Nombre de jours de mission, bornes incluses (départ et retour comptent tous les deux).
export function dureeEnJours(dateDepart?: string, dateRetour?: string): number | null {
  if (!dateDepart || !dateRetour) return null;
  const depart = new Date(dateDepart);
  const retour = new Date(dateRetour);
  if (isNaN(depart.getTime()) || isNaN(retour.getTime())) return null;
  const diff = Math.round((retour.getTime() - depart.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

// Index du mois (0 = janvier ... 11 = décembre) à partir d'une date ISO.
export function moisDeLaMission(dateDepart?: string): number | null {
  if (!dateDepart) return null;
  const date = new Date(dateDepart);
  return isNaN(date.getTime()) ? null : date.getMonth();
}

export const NOMS_MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
