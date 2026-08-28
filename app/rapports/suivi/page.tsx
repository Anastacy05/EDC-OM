import { CheckCircle2, Clock, CircleSlash, XCircle, Hourglass } from "lucide-react";
import { lireLignesRapports } from "@/lib/data/rapports";
import { suiviProcessus } from "@/lib/analytics";
import { libelleStatutParticipation, type StatutParticipation } from "@/lib/data/om.validation";
import { titrePageClass, carteClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import PeriodeShell from "../PeriodeShell";

/**
 * Rapport n° 6 — Suivi du processus (MODELE-DONNEES.md §11, catalogue).
 *
 * Une SEULE barre empilée, jamais un camembert (§11, « pourquoi ces formes ») :
 * c'est la seule part-à-tout du catalogue.
 *
 * Trois mesures obligatoires pour que le statut ne soit jamais porté par la
 * seule couleur (§11, « couleurs ») :
 *   1. une icône par statut, distincte de FORME — les mêmes que app/om/BadgeStatut.tsx,
 *      pour qu'un même statut se reconnaisse à l'identique partout dans l'appli ;
 *   2. le libellé texte visible sur chaque segment (pas seulement en infobulle) ;
 *   3. un écart de 2 px entre les segments, laissant voir la surface derrière.
 *
 * Défaut sans filtre dans l'URL : ANNÉE EN COURS, comme le rapport n° 1 —
 * même raisonnement, même composant `PeriodeShell`.
 */

export const metadata = { title: "Suivi du processus — EDC OM" };

// Mêmes icônes que app/om/BadgeStatut.tsx (un statut = une forme partout dans
// l'appli). Couleurs de REMPLISSAGE plus soutenues que le badge : un badge est
// du texte sur fond pâle, un segment de barre est une surface pleine — même
// intention (amber = attente, green = favorable, red = critique), teintes
// adaptées au rôle.
const APPARENCE_BARRE: Record<StatutParticipation, { classeFond: string; Icone: typeof Clock }> = {
  EN_ATTENTE: { classeFond: "bg-amber-500", Icone: Clock },
  CONFIRME: { classeFond: "bg-green-600", Icone: CheckCircle2 },
  ANNULE: { classeFond: "bg-slate-400", Icone: CircleSlash },
  REFUSE: { classeFond: "bg-red-600", Icone: XCircle },
  EXPIRE: { classeFond: "bg-orange-500", Icone: Hourglass },
};

async function ContenuSuivi({ debut, fin }: { debut: string; fin: string }) {
  const lignes = await lireLignesRapports({ debut, fin });
  const comptes = suiviProcessus(lignes);
  const total = comptes.reduce((somme, c) => somme + c.count, 0);

  if (total === 0) {
    return <p className="text-gray-500 text-sm">Aucune participation sur cette période.</p>;
  }

  return (
    <div className={`${carteClass} max-w-3xl`}>
      {/* La barre empilée elle-même — décorative, le détail exact est dans le
          tableau ci-dessous (§11 : « chaque graphique a son équivalent tableau »). */}
      <div
        role="img"
        aria-label={comptes
          .filter((c) => c.count > 0)
          .map((c) => `${libelleStatutParticipation(c.cle)} : ${c.count}`)
          .join(", ")}
        className="flex h-10 w-full gap-0.5 overflow-hidden rounded-lg"
      >
        {comptes
          .filter((c) => c.count > 0)
          .map(({ cle, count }) => (
            <div
              key={cle}
              style={{ width: `${(count / total) * 100}%` }}
              className={`${APPARENCE_BARRE[cle].classeFond} flex items-center justify-center overflow-hidden`}
              title={`${libelleStatutParticipation(cle)} : ${count}`}
            >
              {/* Libellé dans le segment seulement s'il y a la place — sinon
                  il déborderait ou se couperait au milieu d'un mot, moins
                  lisible qu'une absence de texte (le tableau en dessous
                  prend le relais). */}
              {count / total > 0.12 && (
                <span className="truncate px-2 text-xs font-medium text-white">
                  {libelleStatutParticipation(cle)}
                </span>
              )}
            </div>
          ))}
      </div>

      {/* Tableau — version accessible ET exportable de la même donnée. */}
      <table className="w-full text-sm">
        <caption className="sr-only">Répartition des participations par statut</caption>
        <thead>
          <tr className="text-left text-gray-600 border-b border-blue-100">
            <th className="py-2 font-medium">Statut</th>
            <th className="py-2 font-medium text-right tabular-nums">Nombre</th>
            <th className="py-2 font-medium text-right tabular-nums">Part</th>
          </tr>
        </thead>
        <tbody>
          {comptes.map(({ cle, count }) => {
            const { Icone } = APPARENCE_BARRE[cle];
            return (
              <tr key={cle} className="border-b border-blue-50 last:border-0">
                <td className="py-2 flex items-center gap-2">
                  <Icone size={14} aria-hidden="true" className="text-gray-500" />
                  {libelleStatutParticipation(cle)}
                </td>
                <td className="py-2 text-right tabular-nums">{count}</td>
                <td className="py-2 text-right tabular-nums text-gray-500">
                  {total > 0 ? ((count / total) * 100).toFixed(1) : "0.0"}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function SuiviRapportPage({
  searchParams,
}: {
  searchParams: Promise<{ debut?: string; fin?: string }>;
}) {
  const params = await searchParams;
  const anneeCourante = new Date().getUTCFullYear();
  const debut = params.debut ?? `${anneeCourante}-01-01`;
  const fin = params.fin ?? `${anneeCourante}-12-31`;

  return (
    <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      <RetourVers href="/rapports" libelle="Retour aux rapports" />

      <h1 className={titrePageClass}>Suivi du processus</h1>

      <PeriodeShell debutParDefaut={debut} finParDefaut={fin}>
        <ContenuSuivi debut={debut} fin={fin} />
      </PeriodeShell>
    </div>
  );
}
