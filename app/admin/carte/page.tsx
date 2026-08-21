"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CarteMonde from "@/components/CarteMonde";
import Modal from "@/components/Modal";
import { missionsParContinent, missionsParPaysDansContinent } from "@/lib/analytics";
import type { Continent } from "@/lib/continents";
import { titrePageClass, carteClass } from "@/lib/styles";
import { useEstMonte } from "@/lib/useEstMonte";

export default function CarteRapportPage() {
  const router = useRouter();
  const [continentOuvert, setContinentOuvert] = useState<Continent | null>(null);
  // Garde-fou d'hydratation : les comptes dérivent de `mockOMs`, dont la valeur
  // diffère entre serveur et client (cf. app/om/[id]/page.tsx). Ici l'écart
  // toucherait aussi le REMPLISSAGE de la carte, pas seulement du texte.
  const estMonte = useEstMonte();

  const comptesContinent = missionsParContinent();
  const comptesParContinent = Object.fromEntries(
    comptesContinent.map(({ cle, count }) => [cle, count])
  ) as Partial<Record<Continent, number>>;

  const comptesPays = continentOuvert ? missionsParPaysDansContinent(continentOuvert) : [];
  const comptesParPays = Object.fromEntries(comptesPays.map(({ cle, count }) => [cle, count]));

  const allerVersListe = (pays: string) => {
    router.push(`/om?pays=${encodeURIComponent(pays)}`);
  };

  return (
    <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      <h1 className={titrePageClass}>Missions par continent</h1>

      <div className={`${carteClass} max-w-5xl`}>
        <p className="text-sm text-gray-600">
          Clique sur un continent pour voir le détail par pays.
        </p>
        <CarteMonde
          comptesParContinent={comptesParContinent}
          onClicContinent={(continent) => setContinentOuvert(continent)}
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
          {comptesContinent.length === 0 && estMonte && (
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
          />
          <div className="flex flex-col gap-1 mt-4">
            {comptesPays.map(({ cle, count }) => (
              <button
                key={cle}
                onClick={() => allerVersListe(cle)}
                className="flex justify-between px-3 py-2 rounded-lg hover:bg-blue-50 text-left text-sm"
              >
                <span>{cle}</span>
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
    </div>
  );
}
