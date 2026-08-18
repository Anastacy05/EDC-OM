"use client";

import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import worldData from "world-atlas/countries-110m.json";
import countriesIso from "i18n-iso-countries";
import fr from "i18n-iso-countries/langs/fr.json";
import { continentDuPaysParCode, type Continent } from "@/lib/continents";

countriesIso.registerLocale(fr);

// world-atlas indexe ses géométries par code ISO NUMÉRIQUE (ex. "120" pour
// le Cameroun) — tout le reste de l'appli (zones, référentiels) raisonne en
// alpha-2 ("CM"). i18n-iso-countries fait le pont dans les deux sens.

interface CarteMondeProps {
  // Mode "monde" : chaque pays est coloré selon le total de SON continent,
  // le clic remonte le continent entier (onClicContinent).
  // Mode "zoom" : ne garde que les pays d'UN continent, coloré/cliqué
  // individuellement (onClicPays) — c'est le contenu du modal.
  continentAffiche?: Continent;
  comptesParContinent?: Partial<Record<Continent, number>>;
  comptesParPays?: Record<string, number>; // clé = nom FR du pays
  onClicContinent?: (continent: Continent) => void;
  onClicPays?: (nomPaysFr: string) => void;
}

function nomFrDuPays(nomAnglais: string, codeISO: string): string {
  return countriesIso.getName(codeISO, "fr") ?? nomAnglais;
}

// Échelle de couleur simple : plus le compte est élevé, plus le bleu est
// soutenu. Tout est relatif au maximum affiché à l'écran, pas à une échelle
// absolue fixe — sinon une seule mission écraserait visuellement les autres
// vues qui plafonnent plus bas.
function couleurPourCompte(count: number, max: number): string {
  if (count === 0) return "#e5e7eb"; // gris clair — aucune mission
  const intensite = max > 0 ? count / max : 0;
  const palette = ["#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"];
  const index = Math.min(palette.length - 1, Math.floor(intensite * palette.length));
  return palette[index];
}

export default function CarteMonde({
  continentAffiche,
  comptesParContinent,
  comptesParPays,
  onClicContinent,
  onClicPays,
}: CarteMondeProps) {
  const maxContinent = comptesParContinent
    ? Math.max(0, ...Object.values(comptesParContinent).map((v) => v ?? 0))
    : 0;
  const maxPays = comptesParPays ? Math.max(0, ...Object.values(comptesParPays)) : 0;

  return (
    <ComposableMap projection="geoEqualEarth" width={800} height={420} className="w-full h-auto">
      <Geographies geography={worldData}>
        {({ geographies }) =>
          geographies.map((geo) => {
            const codeISO = countriesIso.numericToAlpha2(geo.id as string);
            if (!codeISO) return null;
            const continent = continentDuPaysParCode(codeISO);
            if (!continent) return null;

            // Mode zoom : ne dessine que le continent demandé.
            if (continentAffiche && continent !== continentAffiche) return null;

            const nomFr = nomFrDuPays(geo.properties.name, codeISO);

            const count = continentAffiche
              ? (comptesParPays?.[nomFr] ?? 0)
              : (comptesParContinent?.[continent] ?? 0);
            const max = continentAffiche ? maxPays : maxContinent;

            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                onClick={() => {
                  if (continentAffiche) onClicPays?.(nomFr);
                  else onClicContinent?.(continent);
                }}
                style={{
                  default: {
                    fill: couleurPourCompte(count, max),
                    stroke: "#ffffff",
                    strokeWidth: 0.5,
                    outline: "none",
                    cursor: onClicContinent || onClicPays ? "pointer" : "default",
                  },
                  hover: {
                    fill: "#f59e0b",
                    stroke: "#ffffff",
                    strokeWidth: 0.5,
                    outline: "none",
                  },
                  pressed: {
                    fill: "#d97706",
                    stroke: "#ffffff",
                    strokeWidth: 0.5,
                    outline: "none",
                  },
                }}
              >
                <title>{`${nomFr} — ${count} mission${count > 1 ? "s" : ""}`}</title>
              </Geography>
            );
          })
        }
      </Geographies>
    </ComposableMap>
  );
}
