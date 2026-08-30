import Link from "next/link";
import { lireDonneesRapports } from "@/lib/data/rapports";
import { topDestinations } from "@/lib/analytics";
import { titrePageClass, carteClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import PeriodeShell from "../PeriodeShell";

/**
 * Rapport n° 4 — Top destinations (MODELE-DONNEES.md §11, catalogue).
 *
 * « Top 10 + Autres » : au-delà de la 10ᵉ destination, une seule barre
 * agrège le reste — un classement à 60 barres serait illisible et n'aiderait
 * pas la décision (§11, « le travail du lecteur »).
 *
 * Compte la MISSION (un OM = une unité), comme la carte/la frise — pas la
 * participation : `topDestinations` (lib/analytics.ts) réutilise
 * `MissionRapport[]`, pas `LigneRapport[]`. Groupé par `codePays` (le code
 * ISO), jamais par nom affiché — même raison que la carte
 * (lib/data/rapports.ts → commentaire de `MissionRapport.codePays`).
 */

export const metadata = { title: "Top destinations — EDC OM" };

const LIMITE_AFFICHEE = 10;

async function ContenuTopDestinations({ debut, fin }: { debut: string; fin: string }) {
  const { missions } = await lireDonneesRapports();
  // Filtre EN MÉMOIRE ici, pas en SQL : `lireDonneesRapports` n'a pas de
  // paramètre de période (elle sert aussi carte/frise, qui n'en ont pas
  // besoin) — filtrer sur `dateDepart` après coup reste bon marché pour un
  // volume de cet ordre. Un futur passage pourrait lui ajouter le même
  // `FiltrePeriode` que `lireLignesRapports`, si ce filtrage devient un point
  // chaud.
  const missionsPeriode = missions.filter((m) => m.dateDepart >= debut && m.dateDepart <= fin);

  const classement = topDestinations(missionsPeriode);
  const top = classement.slice(0, LIMITE_AFFICHEE);
  const autres = classement.slice(LIMITE_AFFICHEE);
  const totalAutres = autres.reduce((somme, c) => somme + c.count, 0);
  const max = Math.max(1, top[0]?.count ?? 0, totalAutres);

  if (classement.length === 0) {
    return <p className="text-gray-500 text-sm">Aucune mission sur cette période.</p>;
  }

  return (
    <div className={`${carteClass} max-w-2xl`}>
      {top.map(({ cle, libelle, count }) => (
        <Link
          key={cle}
          href={`/om?pays=${encodeURIComponent(cle)}`}
          className="flex items-center gap-3 group"
        >
          <span className="w-40 shrink-0 text-sm text-gray-700 text-right truncate group-hover:text-blue-800">
            {libelle}
          </span>
          <div className="flex-1 h-5 bg-blue-100 rounded-full overflow-hidden">
            <div
              style={{ width: `${(count / max) * 100}%` }}
              className="h-full bg-blue-600 rounded-full group-hover:bg-amber-700 transition-colors"
            />
          </div>
          <span className="w-12 shrink-0 text-sm tabular-nums text-blue-900 font-medium text-right">
            {count}
          </span>
        </Link>
      ))}
      {autres.length > 0 && (
        <div className="flex items-center gap-3 pt-2 border-t border-blue-100">
          <span className="w-40 shrink-0 text-sm text-gray-500 text-right truncate">
            Autres ({autres.length} pays)
          </span>
          <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
            <div
              style={{ width: `${(totalAutres / max) * 100}%` }}
              className="h-full bg-gray-400 rounded-full"
            />
          </div>
          <span className="w-12 shrink-0 text-sm tabular-nums text-gray-600 font-medium text-right">
            {totalAutres}
          </span>
        </div>
      )}
    </div>
  );
}

export default async function TopDestinationsRapportPage({
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

      <h1 className={titrePageClass}>Top destinations</h1>

      <PeriodeShell debutParDefaut={debut} finParDefaut={fin}>
        <ContenuTopDestinations debut={debut} fin={fin} />
      </PeriodeShell>
    </div>
  );
}
