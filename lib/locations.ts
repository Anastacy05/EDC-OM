import type { OrdreMission } from "@/types/om";
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

// ---------------------------------------------------------------------------
// Cascade Pays -> Ville : on ne propose des villes que pour le pays choisi.
// ---------------------------------------------------------------------------

// Nom français -> code ISO, construit une seule fois (même liste que
// PAYS_SUGGESTIONS, juste indexée dans l'autre sens pour la recherche).
const codeParNomPays: Record<string, string> = {};
for (const c of Country.getAllCountries()) {
  const nomFr = countries.getName(c.isoCode, "fr") ?? c.name;
  codeParNomPays[nomFr] = c.isoCode;
}

// Résultats mis en cache par pays — évite de relire/reformater la liste des
// villes à chaque frappe si l'utilisateur retape dans le champ ville.
const cacheVillesParPays = new Map<string, string[]>();

// Référence unique et stable pour "aucune ville" : un `[]` fraîchement créé
// à chaque appel invaliderait le cache de normalisation d'AutocompleteInput
// (indexé par référence de tableau) et referait rendre la liste pour rien.
const AUCUNE_VILLE: string[] = [];

export function codeISODuPaysFr(nomPaysFr: string): string | undefined {
  return codeParNomPays[nomPaysFr];
}

export function villesDuPays(nomPaysFr: string): string[] {
  const code = codeParNomPays[nomPaysFr];
  if (!code) return AUCUNE_VILLE; // pays pas (encore) reconnu -> pas de suggestion

  const dejaEnCache = cacheVillesParPays.get(code);
  if (dejaEnCache) return dejaEnCache;

  // Dédoublonnage indispensable : un même nom de ville revient plusieurs fois
  // par pays (120 doublons en France, 5 886 aux États-Unis — communes
  // homonymes dans des départements/États différents). Comme on ne garde que
  // le nom, ces entrées sont indistinguables pour l'utilisateur.
  const villes = [
    ...new Set((City.getCitiesOfCountry(code) ?? []).map((v) => nomVilleFrancais(v.name))),
  ].sort((a, b) => a.localeCompare(b, "fr"));

  cacheVillesParPays.set(code, villes);
  return villes;
}

// Pays/ville d'un OM, quelle que soit son ancienneté.
//
// Les OM créés depuis l'ajout de `paysDestination`/`villeDestination` les
// portent explicitement. Les plus anciens (localStorage d'une session
// précédente) n'ont que la chaîne `destination` — on la redécoupe alors sur
// la virgule. Sans virgule, on considère que c'est une ville seule : c'était
// le format avant l'introduction de la cascade pays -> ville.
export function paysEtVilleDeOM(om: OrdreMission): { pays: string; ville: string } {
  if (om.paysDestination || om.villeDestination) {
    return { pays: om.paysDestination ?? "", ville: om.villeDestination ?? "" };
  }

  const morceaux = (om.destination ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (morceaux.length >= 2) return { pays: morceaux[0], ville: morceaux[1] };
  return { pays: "", ville: morceaux[0] ?? "" };
}
