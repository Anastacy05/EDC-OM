import { Country, City } from "country-state-city";
import countries from "i18n-iso-countries";
import fr from "i18n-iso-countries/langs/fr.json";

countries.registerLocale(fr);

// 250 pays et ~148 000 villes, en local (pas d'appel réseau, pas de clé API).
// Calculé une seule fois au chargement du module — jamais recalculé à chaque
// frappe ou à chaque rendu du formulaire.

// Pays — traduits en français via i18n-iso-countries (couverture 100% des
// 250 pays de country-state-city, vérifié). Utilisés pour les étapes du
// tableau VISAS (page 2), qui raisonne au niveau frontière/pays.
export const PAYS_SUGGESTIONS: string[] = Country.getAllCountries()
  .map((c) => countries.getName(c.isoCode, "fr") ?? c.name)
  .sort((a, b) => a.localeCompare(b, "fr"));

// Villes — utilisées pour "destination" et "en passant par" (page 1).
//
// Contrairement aux pays, il n'existe pas de base de données gratuite et
// complète des noms de villes en français : la grande majorité des noms de
// ville sont des noms propres qui ne se traduisent pas (Douala, Tokyo,
// Nairobi...). Seule une poignée de grandes villes ont un vrai exonyme
// français différent du nom local/anglais — on les corrige à la main.
const EXONYMES_FR: Record<string, string> = {
  London: "Londres",
  Moscow: "Moscou",
  Cairo: "Le Caire",
  Brussels: "Bruxelles",
  Vienna: "Vienne",
  Munich: "Munich", // identique, gardé pour mémoire
  Athens: "Athènes",
  Prague: "Prague",
  Warsaw: "Varsovie",
  Lisbon: "Lisbonne",
  Copenhagen: "Copenhague",
  "The Hague": "La Haye",
  Antwerp: "Anvers",
  Geneva: "Genève",
  Naples: "Naples",
  Venice: "Venise",
  Florence: "Florence",
  Milan: "Milan",
  Turin: "Turin",
  Seville: "Séville",
  "New Delhi": "New Delhi",
  Beijing: "Pékin",
  "Ho Chi Minh City": "Hô-Chi-Minh-Ville",
  Bucharest: "Bucarest",
  Belgrade: "Belgrade",
  Sofia: "Sofia",
  Bratislava: "Bratislava",
  Zagreb: "Zagreb",
  Kiev: "Kiev",
  Kyiv: "Kiev",
  Damascus: "Damas",
  Jerusalem: "Jérusalem",
  Baghdad: "Bagdad",
  Tehran: "Téhéran",
  Algiers: "Alger",
  Tripoli: "Tripoli",
  Khartoum: "Khartoum",
  Addis_Ababa: "Addis-Abeba",
  "Addis Ababa": "Addis-Abeba",
};

function nomVilleFrancais(nom: string): string {
  return EXONYMES_FR[nom] ?? nom;
}

const villesCameroun =
  City.getCitiesOfCountry("CM")?.map((c) => nomVilleFrancais(c.name)) ?? [];
const autresVilles = City.getAllCities()
  .filter((c) => c.countryCode !== "CM")
  .map((c) => nomVilleFrancais(c.name));

// Le Cameroun (siège EDC) en tête, pour que les suggestions les plus
// probables remontent en premier.
export const VILLES_SUGGESTIONS: string[] = [...new Set([...villesCameroun, ...autresVilles])];
