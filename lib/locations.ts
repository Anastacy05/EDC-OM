import { Country, City } from "country-state-city";

// 250 pays et ~148 000 villes, en local (pas d'appel réseau, pas de clé API).
// Calculé une seule fois au chargement du module — jamais recalculé à chaque
// frappe ou à chaque rendu du formulaire.

// Villes — utilisées pour "destination" et "en passant par" (page 1).
// Le Cameroun (siège EDC) en tête, pour que les suggestions les plus
// probables remontent en premier.
const villesCameroun = City.getCitiesOfCountry("CM")?.map((c) => c.name) ?? [];
const autresVilles = City.getAllCities()
  .filter((c) => c.countryCode !== "CM")
  .map((c) => c.name);
export const VILLES_SUGGESTIONS: string[] = [...new Set([...villesCameroun, ...autresVilles])];

// Pays — utilisés pour les étapes du tableau VISAS (page 2), qui raisonne au
// niveau frontière/pays plutôt qu'au niveau ville.
export const PAYS_SUGGESTIONS: string[] = Country.getAllCountries().map((c) => c.name);

