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
]);

const OCEANIE = new Set([
  "AU", "NZ", "FJ", "PG", "SB", "VU", "WS", "TO", "KI", "FM", "MH", "PW", "NR", "TV",
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
]);

const AMERIQUE = new Set([
  "US", "CA", "MX", "GT", "BZ", "SV", "HN", "NI", "CR", "PA", "CU", "JM", "HT",
  "DO", "BS", "BB", "TT", "GD", "LC", "VC", "AG", "DM", "KN", "BR", "AR", "CL",
  "CO", "VE", "EC", "PE", "BO", "PY", "UY", "GY", "SR", "GF",
]);

export function continentDuPaysParCode(codeISO: string): Continent | null {
  if (AFRIQUE.has(codeISO)) return "Afrique";
  if (EUROPE.has(codeISO)) return "Europe";
  if (OCEANIE.has(codeISO)) return "Océanie";
  if (ASIE.has(codeISO)) return "Asie";
  if (AMERIQUE.has(codeISO)) return "Amérique";
  return null;
}

// Point d'entrée pour les données de l'appli : le pays y est stocké sous
// son nom français (lib/locations.ts), pas sous son code ISO.
export function continentDuPaysFr(nomPaysFr: string): Continent | null {
  const code = codeISODuPaysFr(nomPaysFr);
  if (!code) return null;
  return continentDuPaysParCode(code);
}
