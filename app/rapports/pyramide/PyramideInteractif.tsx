"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { participantsParStatut, participantsParEmployeDansStatut } from "@/lib/analytics";
import type { ParticipantRapport } from "@/lib/data/rapports";
import type { OptionReferentiel } from "@/lib/referentiels";
import { carteClass } from "@/lib/styles";

/**
 * Partie interactive de la page pyramide : mêmes principes que
 * CarteInteractif (app/rapports/carte/CarteInteractif.tsx).
 *
 * `statuts` vient de `getStatuts()` (lib/data/referentiels.ts), pas de la
 * constante `STATUTS` de lib/referentiels.ts : c'est la table réelle, déjà
 * triée du rang le plus élevé au plus bas (le commentaire de `getStatuts`
 * dit explicitement « c'est cet ordre que lit la pyramide des rapports »).
 * `valeur` y est le CODE du référentiel, pas le libellé — c'est sur ce code
 * que `participantsParStatut` groupe désormais, puisque c'est ce que porte
 * `participation.code_statut_s`.
 */
export default function PyramideInteractif({
  participants,
  statuts,
}: {
  participants: ParticipantRapport[];
  statuts: OptionReferentiel[];
}) {
  const router = useRouter();
  const [statutOuvert, setStatutOuvert] = useState<string | null>(null);

  const comptesBruts = participantsParStatut(participants);
  const compteParStatut = new Map(comptesBruts.map((c) => [c.cle, c.count]));

  // Ordre de la pyramide = ordre du référentiel (déjà du plus élevé au plus
  // bas dans la hiérarchie) — pas l'ordre des comptes, pour garder la forme
  // organisationnelle même si un niveau intermédiaire a 0 mission.
  const niveaux = statuts.map((s) => ({
    code: s.valeur,
    libelle: s.libelle,
    count: compteParStatut.get(s.valeur) ?? 0,
  }));

  const libelleOuvert = statutOuvert ? statuts.find((s) => s.valeur === statutOuvert)?.libelle : null;
  const employesDuStatut = statutOuvert
    ? participantsParEmployeDansStatut(participants, statutOuvert)
    : [];

  const allerVersListe = (matricule: string) => {
    router.push(`/om?matricule=${encodeURIComponent(matricule)}`);
  };

  return (
    <>
      <div className={`${carteClass} max-w-3xl`}>
        <p className="text-sm text-gray-600">
          Clique sur un niveau pour voir le détail par employé.
        </p>

        <div className="flex flex-col items-center gap-1">
          {niveaux.map(({ code, libelle, count }, index) => {
            // Largeur = rang hiérarchique, pas nombre de missions : la forme
            // en pyramide doit rester lisible même si un niveau est à 0.
            const largeurPct = ((index + 1) / niveaux.length) * 100;
            return (
              <button
                key={code}
                onClick={() => count > 0 && setStatutOuvert(code)}
                disabled={count === 0}
                style={{ width: `${largeurPct}%` }}
                className="flex items-center justify-between gap-3 px-4 py-2 rounded-lg
                           bg-blue-600 hover:bg-amber-700 disabled:bg-gray-200 disabled:cursor-default
                           text-white disabled:text-gray-600 text-sm transition-colors"
              >
                <span className="truncate">{libelle}</span>
                <span className="font-medium shrink-0">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {statutOuvert && (
        <Modal titre={`${libelleOuvert} — détail par employé`} onFermer={() => setStatutOuvert(null)}>
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
    </>
  );
}
