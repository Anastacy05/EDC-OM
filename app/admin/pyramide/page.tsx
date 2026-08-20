"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { participantsParStatut, participantsParEmployeDansStatut } from "@/lib/analytics";
import { STATUTS } from "@/lib/referentiels";
import { titrePageClass, carteClass } from "@/lib/styles";
import { useEstMonte } from "@/lib/useEstMonte";

export default function PyramideRapportPage() {
  const router = useRouter();
  const [statutOuvert, setStatutOuvert] = useState<string | null>(null);
  // Garde-fou d'hydratation : les comptes dérivent de `mockOMs`, dont la valeur
  // diffère entre serveur et client (cf. app/om/[id]/page.tsx).
  const estMonte = useEstMonte();

  const comptesBruts = participantsParStatut();
  const compteParStatut = new Map(comptesBruts.map((c) => [c.cle, c.count]));

  // Ordre de la pyramide = ordre du référentiel (déjà du plus élevé au plus
  // bas dans la hiérarchie) — pas l'ordre des comptes, pour garder la forme
  // organisationnelle même si un niveau intermédiaire a 0 mission.
  const niveaux = STATUTS.map((s) => ({
    statut: s.valeur,
    count: compteParStatut.get(s.valeur) ?? 0,
  }));

  const employesDuStatut = statutOuvert ? participantsParEmployeDansStatut(statutOuvert) : [];

  const allerVersListe = (matricule: string) => {
    router.push(`/om?matricule=${encodeURIComponent(matricule)}`);
  };

  return (
    <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      <h1 className={titrePageClass}>Missions par statut</h1>

      <div className={`${carteClass} max-w-3xl`}>
        <p className="text-sm text-gray-600">
          Clique sur un niveau pour voir le détail par employé.
        </p>

        <div className="flex flex-col items-center gap-1">
          {!estMonte ? (
            <p className="text-gray-500 text-sm self-start">Chargement des données…</p>
          ) : (
            niveaux.map(({ statut, count }, index) => {
              // Largeur = rang hiérarchique, pas nombre de missions : la forme
              // en pyramide doit rester lisible même si un niveau est à 0.
              const largeurPct = ((index + 1) / niveaux.length) * 100;
              return (
                <button
                  key={statut}
                  onClick={() => count > 0 && setStatutOuvert(statut)}
                  disabled={count === 0}
                  style={{ width: `${largeurPct}%` }}
                  className="flex items-center justify-between gap-3 px-4 py-2 rounded-lg
                             bg-blue-600 hover:bg-amber-700 disabled:bg-gray-200 disabled:cursor-default
                             text-white disabled:text-gray-600 text-sm transition-colors"
                >
                  <span className="truncate">{statut}</span>
                  <span className="font-medium shrink-0">{count}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {statutOuvert && (
        <Modal titre={`${statutOuvert} — détail par employé`} onFermer={() => setStatutOuvert(null)}>
          <div className="flex flex-col gap-1">
            {employesDuStatut.map((e) => (
              <button
                key={e.matricule}
                onClick={() => allerVersListe(e.matricule)}
                className="flex justify-between px-3 py-2 rounded-lg hover:bg-blue-50 text-left text-sm"
              >
                <span>
                  {e.nom} {e.prenoms}
                  <span className="text-gray-500 ml-2">{e.matricule}</span>
                </span>
                <span className="text-blue-700 font-medium">
                  {e.count} mission{e.count > 1 ? "s" : ""}
                </span>
              </button>
            ))}
            {employesDuStatut.length === 0 && (
              <p className="text-gray-500 text-sm">Aucun employé de ce statut n&apos;a de mission.</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
