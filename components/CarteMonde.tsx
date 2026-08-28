"use client";

import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import worldData from "world-atlas/countries-110m.json";
import countriesIso from "i18n-iso-countries";
import type { Continent } from "@/lib/continents";

// world-atlas indexe ses géométries par code ISO NUMÉRIQUE (ex. "120" pour
// le Cameroun) — tout le reste de l'appli (zones, référentiels) raisonne en
// alpha-2 ("CM"). `i18n-iso-countries` ne sert plus qu'à CE pont technique.
//
// MODIFIÉ le 26/08/2026 : le NOM affiché et le CONTINENT de chaque pays
// venaient auparavant de `i18n-iso-countries`/`continentDuPaysParCode` —
// recalculés par ce composant, donc potentiellement en désaccord avec la
// table `pays` si elle a été corrigée depuis le seed initial (territoire
// contesté, pays ajouté manuellement...). Les deux viennent maintenant du
// `referentielPays` reçu en prop, lu en base par
// `lib/data/rapports.ts` → `lireReferentielPays`. Cette bibliothèque ne fait
// plus que la conversion numérique → alpha-2 : une correspondance de norme
// ISO, stable, qu'aucun administrateur n'a de raison de vouloir corriger —
// contrairement à un nom affiché ou un classement continental.

interface CarteMondeProps {
  // Mode "monde" : chaque pays est coloré selon le total de SON continent,
  // le clic remonte le continent entier (onClicContinent).
  // Mode "zoom" : ne garde que les pays d'UN continent, coloré/cliqué
  // individuellement (onClicPays) — c'est le contenu du modal.
  continentAffiche?: Continent;
  comptesParContinent?: Partial<Record<Continent, number>>;
  /**
   * Clé = code ISO alpha-2 (ex. `"CM"`), PAS le nom français — cf. le
   * commentaire de `MissionRapport.codePays` (lib/data/rapports.ts) pour le
   * bug que corrige cette convention.
   */
  comptesParPays?: Record<string, number>;
  onClicContinent?: (continent: Continent) => void;
  /** Reçoit le CODE ISO du pays cliqué (pas son nom). */
  onClicPays?: (codeISO: string) => void;
  /**
   * Nom et continent de chaque pays, LUS EN BASE — cf. commentaire d'en-tête.
   * Obligatoire : sans lui, aucun pays ne pourrait être ni nommé ni classé.
   */
  referentielPays: Record<string, { nomFr: string; continent: Continent | null }>;
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
  referentielPays,
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

            // Pays absent de la table (territoire sans continent classé à la
            // création, ou nouveau tracé du fond de carte jamais ajouté en
            // base) : rien à afficher plutôt qu'une valeur devinée.
            const entree = referentielPays[codeISO];
            if (!entree || !entree.continent) return null;
            const continent = entree.continent;
            const nomFr = entree.nomFr;

            // Mode zoom : ne dessine que le continent demandé.
            if (continentAffiche && continent !== continentAffiche) return null;

            const count = continentAffiche
              ? (comptesParPays?.[codeISO] ?? 0)
              : (comptesParContinent?.[continent] ?? 0);
            const max = continentAffiche ? maxPays : maxContinent;

            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                onClick={() => {
                  if (continentAffiche) onClicPays?.(codeISO);
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
