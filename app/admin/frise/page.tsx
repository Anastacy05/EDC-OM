"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { missionsParAnnee, missionsParMoisDansAnnee, bornesDuMois, NOMS_MOIS } from "@/lib/analytics";
import { titrePageClass, carteClass } from "@/lib/styles";
import { useEstMonte } from "@/lib/useEstMonte";

export default function FriseRapportPage() {
  const router = useRouter();
  const [anneeOuverte, setAnneeOuverte] = useState<number | null>(null);
  // Garde-fou d'hydratation : `missionsParAnnee()` dérive de `mockOMs`, qui vaut
  // les données par défaut au rendu serveur et celles de localStorage côté
  // client. Les deux rendus divergeraient (cf. app/om/[id]/page.tsx).
  const estMonte = useEstMonte();

  const comptesAnnee = missionsParAnnee();
  const maxAnnee = Math.max(1, ...comptesAnnee.map((c) => c.count));

  const comptesMois = anneeOuverte !== null ? missionsParMoisDansAnnee(anneeOuverte) : [];
  const compteParMois = new Map(comptesMois.map((c) => [c.cle, c.count]));
  const maxMois = Math.max(1, ...comptesMois.map((c) => c.count));

  const allerVersListe = (annee: number, mois: number) => {
    const { debut, fin } = bornesDuMois(annee, mois);
    router.push(`/om?debut=${debut}&fin=${fin}`);
  };

  return (
    <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      <h1 className={titrePageClass}>Missions par année</h1>

      <div className={`${carteClass} max-w-4xl`}>
        <p className="text-sm text-gray-600">Clique sur une année pour voir le détail par mois.</p>

        {!estMonte ? (
          <p className="text-gray-500 text-sm">Chargement des données…</p>
        ) : comptesAnnee.length === 0 ? (
          <p className="text-gray-500 text-sm">Aucune mission enregistrée pour l&apos;instant.</p>
        ) : (
          <div className="flex items-end gap-6 h-56 overflow-x-auto px-2">
            {comptesAnnee.map(({ cle, count }) => (
              <button
                key={cle}
                onClick={() => setAnneeOuverte(cle)}
                className="flex flex-col items-center gap-2 group shrink-0"
              >
                <span className="text-sm font-medium text-blue-800">{count}</span>
                <div
                  style={{ height: `${Math.max(8, (count / maxAnnee) * 160)}px` }}
                  className="w-16 rounded-t-lg bg-blue-600 group-hover:bg-amber-700 transition-colors"
                />
                <span className="text-sm text-gray-600 border-t-2 border-blue-800 pt-1 w-full text-center">
                  {cle}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {anneeOuverte !== null && (
        <Modal titre={`${anneeOuverte} — détail par mois`} onFermer={() => setAnneeOuverte(null)}>
          <div className="flex flex-col gap-1">
            {NOMS_MOIS.map((nomMois, index) => {
              const count = compteParMois.get(index) ?? 0;
              return (
                <button
                  key={nomMois}
                  onClick={() => allerVersListe(anneeOuverte, index)}
                  disabled={count === 0}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-50
                             disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-default text-left"
                >
                  <span className="w-24 text-sm text-gray-700">{nomMois}</span>
                  <div className="flex-1 h-3 bg-blue-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${(count / maxMois) * 100}%` }}
                      className="h-full bg-blue-500"
                    />
                  </div>
                  <span className="w-8 text-sm text-blue-700 font-medium text-right">{count}</span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
