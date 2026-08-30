import { lireLignesRapports } from "@/lib/data/rapports";
import { coutParDirection, formatFcfa } from "@/lib/analytics";
import { libelleDepartement } from "@/lib/referentiels";
import { titrePageClass, carteClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import PeriodeShell from "../PeriodeShell";

/**
 * Rapport n° 3 — Coût par direction (MODELE-DONNEES.md §11, catalogue).
 *
 * `libelleDepartement()` (lib/referentiels.ts) résout `codeDepartement` —
 * code OU libellé libre, cf. le commentaire de `LigneRapport.codeDepartement`
 * (lib/data/rapports.ts) — la MÊME fonction que `/om` (app/om/page.tsx),
 * pour ne jamais avoir deux résolutions divergentes du même champ.
 */

export const metadata = { title: "Coût par direction — EDC OM" };

async function ContenuCoutDirection({ debut, fin }: { debut: string; fin: string }) {
  const lignes = await lireLignesRapports({ debut, fin });
  const comptes = coutParDirection(lignes);
  const max = Math.max(1, ...comptes.map((c) => c.count));

  if (comptes.length === 0) {
    return <p className="text-gray-500 text-sm">Aucune mission engageante sur cette période.</p>;
  }

  return (
    <div className={`${carteClass} max-w-2xl`}>
      {comptes.map(({ cle, count }) => (
        <div key={cle} className="flex items-center gap-3">
          <span className="w-40 shrink-0 text-sm text-gray-700 text-right truncate" title={libelleDepartement(cle)}>
            {libelleDepartement(cle)}
          </span>
          <div className="flex-1 h-5 bg-blue-100 rounded-full overflow-hidden">
            <div style={{ width: `${(count / max) * 100}%` }} className="h-full bg-blue-600 rounded-full" />
          </div>
          <span className="w-32 shrink-0 text-sm tabular-nums text-blue-900 font-medium text-right">
            {formatFcfa(count)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function CoutDirectionRapportPage({
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

      <h1 className={titrePageClass}>Coût par direction</h1>

      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 max-w-2xl">
        Le coût affiché ne couvre que l&apos;indemnité journalière fixe — ni le transport, ni
        l&apos;hébergement. C&apos;est un <strong>plancher</strong>, pas un budget complet.
      </p>

      <PeriodeShell debutParDefaut={debut} finParDefaut={fin}>
        <ContenuCoutDirection debut={debut} fin={fin} />
      </PeriodeShell>
    </div>
  );
}
