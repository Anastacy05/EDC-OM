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

/**
 * Formate un `Date` en `AAAA-MM-JJ` — le format d'un `<input type="date">` et
 * celui qu'attend un paramètre `::date` en SQL.
 *
 * ⚠️ Les composantes **UTC** et non locales : Prisma renvoie un `Date` à minuit
 * UTC pour une colonne `DATE`. `getFullYear()` appliquerait le fuseau du serveur
 * et reculerait d'un jour à l'ouest de Greenwich — un employé né le 1er janvier
 * apparaîtrait né le 31 décembre de l'année précédente.
 *
 * Déplacée ici depuis `lib/data/employes.ts` le 22/08/2026 : les ordres de mission
 * en ont le même besoin sur cinq dates, et ce module est neutre (ni `server-only`
 * ni client), donc importable des deux côtés et depuis les tests.
 */
export function versChampDate(d: Date): string {
  const mois = String(d.getUTCMonth() + 1).padStart(2, "0");
  const jour = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mois}-${jour}`;
}

/**
 * Date du jour au format d'un `<input type="date">`, en heure **LOCALE**.
 *
 * Sert d'attribut `min` sur les saisies de date de mission : le navigateur grise
 * alors les jours antérieurs, au lieu de laisser saisir une date que la
 * validation refusera ensuite.
 *
 * ⚠️ **Pas `new Date().toISOString().slice(0, 10)`**, qui donne la date UTC :
 * entre minuit et 1 h du matin au Cameroun (UTC+1), elle renvoie la VEILLE. Le
 * `min` autoriserait donc un départ hier pendant cette heure-là, et la validation
 * serveur — qui, elle, raisonne en heure locale — le refuserait. Les deux doivent
 * dire la même chose, sinon l'écran propose ce que le serveur rejette.
 *
 * ⚠️ À n'appeler que côté navigateur (gestionnaire d'événement, `useEffect`, ou
 * composant client) : au rendu serveur, « aujourd'hui » serait celui du serveur,
 * et la valeur pourrait différer de celle recalculée à l'hydratation.
 */
export function aujourdhuiChampDate(): string {
  const maintenant = new Date();
  const mois = String(maintenant.getMonth() + 1).padStart(2, "0");
  const jour = String(maintenant.getDate()).padStart(2, "0");
  return `${maintenant.getFullYear()}-${mois}-${jour}`;
}

export const NOMS_MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
