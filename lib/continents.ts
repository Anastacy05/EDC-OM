import { codeISODuPaysFr } from "@/lib/locations";

// Classification géographique standard (5 continents, sans l'Antarctique) —
// AUCUN rapport avec lib/zones.ts, qui découpe le monde différemment pour
// le calcul des frais de mission. Deux découpages, deux besoins différents :
// ne pas les fusionner.
export type Continent = "Afrique" | "Amérique" | "Asie" | "Europe" | "Océanie";

export const CONTINENTS: Continent[] = ["Afrique", "Amérique", "Asie", "Europe", "Océanie"];

const AFRIQUE = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD",
  "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE",
  "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG",
  "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG",
  "ZM", "ZW", "EH",
  // Territoires ajoutés le 21/08/2026 (cf. note en fin de fichier) : îles de
  // l'océan Indien et de l'Atlantique Sud rattachées géographiquement à
  // l'Afrique, mais politiquement à la France ou au Royaume-Uni.
  "YT", // Mayotte (département français)
  "RE", // La Réunion (département français)
  "SH", // Sainte-Hélène, Ascension et Tristan da Cunha (britannique)
]);

// Europe géographique au sens large, y compris la Russie (convention
// courante) — contrairement à lib/zones.ts, il n'y a ici aucune raison
// d'exclure Allemagne/Autriche/Suisse ou les pays de l'ex-URSS européens :
// ce sont bien des pays d'Europe.
const EUROPE = new Set([
  "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IS", "IE", "IT", "XK", "LV", "LI", "LT", "LU", "MT", "MD",
  "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO", "RU", "SM", "RS", "SK", "SI",
  "ES", "SE", "CH", "UA", "GB", "VA",
  // Territoires ajoutés le 21/08/2026 : dépendances de la Couronne, territoires
  // britanniques et îles nordiques.
  "AX", // Åland (Finlande)
  "FO", // Îles Féroé (Danemark)
  "GI", // Gibraltar (britannique)
  "GG", // Guernesey
  "JE", // Jersey
  "IM", // Île de Man
  "SJ", // Svalbard et Jan Mayen (Norvège)
]);

const OCEANIE = new Set([
  "AU", "NZ", "FJ", "PG", "SB", "VU", "WS", "TO", "KI", "FM", "MH", "PW", "NR", "TV",
  // Territoires ajoutés le 21/08/2026 : collectivités françaises, territoires
  // américains et néo-zélandais du Pacifique.
  "NC", // Nouvelle-Calédonie
  "PF", // Polynésie française
  "WF", // Wallis-et-Futuna
  "GU", // Guam
  "MP", // Îles Mariannes du Nord
  "AS", // Samoa américaines
  "CK", // Îles Cook
  "NU", // Niue
  "TK", // Tokelau
  "NF", // Île Norfolk
  "PN", // Îles Pitcairn
  "UM", // Îles mineures éloignées des États-Unis
]);

// Asie au sens large, Moyen-Orient et Caucase inclus — la répartition en
// "zones de frais" (Moyen-Orient regroupé avec l'Afrique du Nord/du Sud
// dans lib/zones.ts) n'a pas cours ici, c'est une question purement
// géographique.
const ASIE = new Set([
  "CN", "JP", "KR", "KP", "MN", "TW", "HK", "MO",
  "IN", "PK", "BD", "LK", "NP", "BT", "MV",
  "TH", "VN", "LA", "KH", "MM", "MY", "SG", "ID", "PH", "BN", "TL",
  "SA", "AE", "QA", "KW", "BH", "OM", "YE", "IQ", "IR", "IL", "PS", "JO",
  "LB", "SY", "TR", "CY",
  "KZ", "UZ", "TM", "KG", "TJ", "AF",
  "GE", "AM", "AZ",
  // Territoires ajoutés le 21/08/2026 : îles de l'océan Indien.
  "IO", // Territoire britannique de l'océan Indien
  "CX", // Île Christmas (Australie, mais dans l'océan Indien)
  "CC", // Îles Cocos (idem)
]);

const AMERIQUE = new Set([
  "US", "CA", "MX", "GT", "BZ", "SV", "HN", "NI", "CR", "PA", "CU", "JM", "HT",
  "DO", "BS", "BB", "TT", "GD", "LC", "VC", "AG", "DM", "KN", "BR", "AR", "CL",
  "CO", "VE", "EC", "PE", "BO", "PY", "UY", "GY", "SR", "GF",
  // Territoires ajoutés le 21/08/2026 : Caraïbes, Atlantique Nord et Sud.
  "AI", // Anguilla
  "AW", // Aruba
  "BM", // Bermudes
  "BQ", // Bonaire, Saint-Eustache et Saba
  "CW", // Curaçao
  "KY", // Îles Caïmans
  "FK", // Îles Malouines
  "GL", // Groenland
  "GP", // Guadeloupe
  "MQ", // Martinique
  "MS", // Montserrat
  "PR", // Porto Rico
  "BL", // Saint-Barthélemy
  "MF", // Saint-Martin (partie française)
  "SX", // Saint-Martin (partie néerlandaise)
  "PM", // Saint-Pierre-et-Miquelon
  "TC", // Îles Turques-et-Caïques
  "VG", // Îles vierges britanniques
  "VI", // Îles vierges américaines
  "GS", // Géorgie du Sud-et-les Îles Sandwich du Sud
]);

export function continentDuPaysParCode(codeISO: string): Continent | null {
  if (AFRIQUE.has(codeISO)) return "Afrique";
  if (EUROPE.has(codeISO)) return "Europe";
  if (OCEANIE.has(codeISO)) return "Océanie";
  if (ASIE.has(codeISO)) return "Asie";
  if (AMERIQUE.has(codeISO)) return "Amérique";
  return null;
}

// ---------------------------------------------------------------------------
// COMPLÉTÉ (21/08/2026) — 49 territoires manquaient.
//
// Découvert en amorçant la table `pays` : sur les 250 pays fournis par
// country-state-city, seuls 201 étaient classés. Les 49 absents étaient des
// territoires et dépendances (Réunion, Mayotte, Nouvelle-Calédonie,
// Guadeloupe, Martinique, Groenland, Jersey, Guam...).
//
// Ce n'était pas qu'un défaut de seed : `continentDuPaysParCode` renvoyait
// `null` pour eux, donc `missionsParContinent` (lib/analytics.ts) les IGNORAIT
// purement et simplement. Une mission à La Réunion n'apparaissait sur AUCUN
// rapport par continent, silencieusement — alors que le calcul du frais fixe,
// lui, fonctionnait (lib/zones.ts a un repli « reste du monde -> zone 3 »).
//
// Les territoires sont classés par GÉOGRAPHIE, pas par rattachement politique :
// La Réunion et Mayotte en Afrique (et non en Europe avec la France), la
// Guadeloupe et la Martinique en Amérique, la Nouvelle-Calédonie en Océanie.
// C'est cohérent avec l'objet de ce fichier — un découpage géographique pour
// les rapports — et sans effet sur le barème, qui relève de lib/zones.ts.
//
// RESTENT NON CLASSÉS, volontairement : les 4 territoires antarctiques et
// subantarctiques, qui ne relèvent d'aucun des cinq continents retenus :
//   AQ  Antarctique
//   BV  Île Bouvet (Norvège, Atlantique Sud)
//   HM  Îles Heard-et-MacDonald (Australie, océan Indien austral)
//   TF  Terres australes et antarctiques françaises
// Aucune mission EDC n'y est plausible. Ils restent absents de la table `pays`,
// donc non sélectionnables comme destination — ce qui est le comportement voulu.
// ---------------------------------------------------------------------------

// Point d'entrée pour les données de l'appli : le pays y est stocké sous
// son nom français (lib/locations.ts), pas sous son code ISO.
export function continentDuPaysFr(nomPaysFr: string): Continent | null {
  const code = codeISODuPaysFr(nomPaysFr);
  if (!code) return null;
  return continentDuPaysParCode(code);
}
