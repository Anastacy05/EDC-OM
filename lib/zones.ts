// Zones géographiques utilisées pour le calcul du frais fixe journalier
// (lib/baremes.ts). Basé sur les codes ISO 3166-1 alpha-2, car les noms de
// pays affichés (lib/locations.ts) sont déjà en français et peuvent varier
// légèrement d'une source à l'autre — les codes ISO ne bougent pas.
//
// country-state-city ne fournit pas de champ "région"/"continent" — cette
// classification est donc construite à la main, par listes explicites.
//
// ⚠️ Quelques cas limites sont tranchés par convention, à vérifier auprès
// des RH si le barème officiel les traite différemment :
//   - Soudan (SD) classé Afrique subsaharienne (zone 1), pas Afrique du Nord
//   - Turquie (TR) et Chypre (CY) classées Moyen-Orient/Proche-Orient (zone 2),
//     pas Europe, du fait de leur position transcontinentale
//   - Sahara occidental (EH) classé comme le Maroc (zone 2)

import { codeISODuPaysFr } from "@/lib/locations";

export type Zone = 0 | 1 | 2 | 3;

// Zone 0 — cas spécial, le Cameroun (siège EDC) a son propre barème.
const CAMEROUN = "CM";

// Zone 2 (partie "Afrique") — Afrique du Sud + Afrique du Nord (Maghreb + Égypte).
const AFRIQUE_DU_NORD_ET_DU_SUD = new Set([
  "MA", // Maroc
  "DZ", // Algérie
  "TN", // Tunisie
  "LY", // Libye
  "EG", // Égypte
  "EH", // Sahara occidental (cf. note ci-dessus)
  "ZA", // Afrique du Sud
]);

// Zone 1 — reste de l'Afrique (tous les autres pays du continent).
const AFRIQUE = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD",
  "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE",
  "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG",
  "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG",
  "ZM", "ZW", "EH",
]);

// Zone 2 — Moyen-Orient et Proche-Orient (les deux confondus : la
// distinction traditionnelle Proche/Moyen-Orient n'a pas d'impact sur le
// barème, seul compte "cette zone-là dans son ensemble").
const MOYEN_ORIENT_PROCHE_ORIENT = new Set([
  "SA", "AE", "QA", "KW", "BH", "OM", "YE", // péninsule Arabique
  "IQ", "IR",                                // Irak, Iran
  "IL", "PS", "JO", "LB", "SY",              // Levant
  "TR", "CY",                                 // transcontinentaux (cf. note)
]);

// Pays de l'ex-URSS — zone 3, quelle que soit leur position géographique
// (Europe de l'Est ou Asie centrale), conformément à l'énoncé du barème.
const EX_URSS = new Set([
  "RU", "UA", "BY", "MD",              // Europe de l'Est
  "EE", "LV", "LT",                    // Pays baltes
  "GE", "AM", "AZ",                    // Caucase
  "KZ", "UZ", "TM", "KG", "TJ",        // Asie centrale
]);

// Allemagne, Autriche, Suisse — zone 3, exclues explicitement du reste de
// l'Europe (zone 2).
const EUROPE_ZONE_3 = new Set(["DE", "AT", "CH"]);

// Reste de l'Europe — zone 2 (tout ce qui n'est ni ex-URSS ni DE/AT/CH).
const EUROPE = new Set([
  "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IS", "IE", "IT", "XK", "LV", "LI", "LT", "LU", "MT", "MD",
  "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO", "RU", "SM", "RS", "SK", "SI",
  "ES", "SE", "CH", "UA", "GB", "VA",
]);

// Amériques — zone 3, du Canada à l'Argentine, Caraïbes comprises.
const AMERIQUE = new Set([
  "US", "CA", "MX", "GT", "BZ", "SV", "HN", "NI", "CR", "PA", "CU", "JM", "HT",
  "DO", "BS", "BB", "TT", "GD", "LC", "VC", "AG", "DM", "KN", "BR", "AR", "CL",
  "CO", "VE", "EC", "PE", "BO", "PY", "UY", "GY", "SR", "GF",
]);

export function zoneDuPaysParCode(codeISO: string): Zone {
  if (codeISO === CAMEROUN) return 0;
  if (EX_URSS.has(codeISO)) return 3;
  if (EUROPE_ZONE_3.has(codeISO)) return 3;
  if (AFRIQUE_DU_NORD_ET_DU_SUD.has(codeISO)) return 2;
  if (AFRIQUE.has(codeISO)) return 1;
  if (MOYEN_ORIENT_PROCHE_ORIENT.has(codeISO)) return 2;
  if (EUROPE.has(codeISO)) return 2;
  if (AMERIQUE.has(codeISO)) return 3;
  // Reste du monde (Asie hors Moyen-Orient, Océanie...) -> zone 3.
  return 3;
}

export const LIBELLE_ZONE: Record<Zone, string> = {
  0: "Zone 0 — Cameroun",
  1: "Zone 1 — Afrique (hors Afrique du Sud et du Nord)",
  2: "Zone 2 — Afrique du Sud/du Nord, Moyen-Orient, Europe (hors DE/AT/CH)",
  3: "Zone 3 — Allemagne, Autriche, Suisse, ex-URSS, Amériques, reste du monde",
};

// Point d'entrée utilisé par le formulaire : le pays y est stocké sous son
// nom français (celui choisi via l'autocomplétion, cf. lib/locations.ts),
// pas sous son code ISO.
export function zoneDuPaysFr(nomPaysFr: string): Zone | null {
  const code = codeISODuPaysFr(nomPaysFr);
  if (!code) return null; // pays pas (encore) reconnu -> zone indéterminée
  return zoneDuPaysParCode(code);
}
