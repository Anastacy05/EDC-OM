"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CarteMonde from "@/components/CarteMonde";
import Modal from "@/components/Modal";
import { missionsParContinent, missionsParPaysDansContinent } from "@/lib/analytics";
import type { Continent } from "@/lib/continents";
import type { MissionRapport, EntreeReferentielPays } from "@/lib/data/rapports";
import { carteClass } from "@/lib/styles";

/**
 * Partie interactive de la page carte : reçoit les missions déjà lues en base
 * par le composant serveur parent (lib/data/rapports.ts) et ne fait plus que
 * du calcul en mémoire (lib/analytics.ts, fonctions pures) — comme du temps de
 * `mockOMs`, mais sur des données réelles et sans `localStorage`.
 *
 * `useEstMonte` disparaît : il n'existait que pour éviter l'écart
 * d'hydratation entre le rendu serveur (données par défaut) et le rendu
 * client (`localStorage`). Les données arrivent maintenant identiques des
 * deux côtés, il n'y a donc plus rien à protéger.
 */
export default function CarteInteractif({
  missions,
  referentielPays,
}: {
  missions: MissionRapport[];
  referentielPays: Record<string, EntreeReferentielPays>;
}) {
  const router = useRouter();
  const [continentOuvert, setContinentOuvert] = useState<Continent | null>(null);

  const comptesContinent = missionsParContinent(missions);
  const comptesParContinent = Object.fromEntries(
    comptesContinent.map(({ cle, count }) => [cle, count])
  ) as Partial<Record<Continent, number>>;

  const comptesPays = continentOuvert ? missionsParPaysDansContinent(missions, continentOuvert) : [];
  // Clé = code ISO (cf. commentaire de CompteLibelle et de CarteMonde.tsx) —
  // c'est aussi ce que /om?pays= attend (lib/data/om.ts compare à `code_pays`).
  const comptesParPays = Object.fromEntries(comptesPays.map(({ cle, count }) => [cle, count]));

  const allerVersListe = (codePays: string) => {
    router.push(`/om?pays=${encodeURIComponent(codePays)}`);
  };

  return (
    <>
      <div className={`${carteClass} max-w-5xl`}>
        <p className="text-sm text-gray-600">
          Clique sur un continent pour voir le détail par pays.
        </p>
        <CarteMonde
          comptesParContinent={comptesParContinent}
          onClicContinent={(continent) => setContinentOuvert(continent)}
          referentielPays={referentielPays}
        />
        <div className="flex flex-wrap gap-4 text-sm">
          {comptesContinent.map(({ cle, count }) => (
            <button
              key={cle}
              onClick={() => setContinentOuvert(cle)}
              className="px-3 py-1 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-800"
            >
              {cle} — {count} mission{count > 1 ? "s" : ""}
            </button>
          ))}
          {comptesContinent.length === 0 && (
            <p className="text-gray-500">Aucune mission enregistrée pour l&apos;instant.</p>
          )}
        </div>
      </div>

      {continentOuvert && (
        <Modal titre={`${continentOuvert} — détail par pays`} onFermer={() => setContinentOuvert(null)}>
          <CarteMonde
            continentAffiche={continentOuvert}
            comptesParPays={comptesParPays}
            onClicPays={allerVersListe}
            referentielPays={referentielPays}
          />
          <div className="flex flex-col gap-1 mt-4">
            {comptesPays.map(({ cle, libelle, count }) => (
              <button
                key={cle}
                onClick={() => allerVersListe(cle)}
                className="flex justify-between px-3 py-2 rounded-lg hover:bg-blue-50 text-left text-sm"
              >
                <span>{libelle}</span>
                <span className="text-blue-700 font-medium">
                  {count} mission{count > 1 ? "s" : ""}
                </span>
              </button>
            ))}
            {comptesPays.length === 0 && (
              <p className="text-gray-500 text-sm">Aucune mission enregistrée sur ce continent.</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
