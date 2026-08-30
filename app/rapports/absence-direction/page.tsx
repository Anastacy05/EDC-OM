import { lireLignesRapports } from "@/lib/data/rapports";
import { joursAbsenceParDirection } from "@/lib/analytics";
import { libelleDepartement } from "@/lib/referentiels";
import { titrePageClass, carteClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import PeriodeShell from "../PeriodeShell";

/**
 * Rapport n° 9 — Jours d'absence par direction (MODELE-DONNEES.md §11,
 * catalogue). Même gabarit que le n° 3 (coût par direction), seule la
 * grandeur additionnée change (jours au lieu de FCFA) — cf. son commentaire
 * pour `libelleDepartement()`.
 */

export const metadata = { title: "Jours d'absence par direction — EDC OM" };

async function ContenuAbsenceDirection({ debut, fin }: { debut: string; fin: string }) {
  const lignes = await lireLignesRapports({ debut, fin });
  const comptes = joursAbsenceParDirection(lignes);
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
          <span className="w-24 shrink-0 text-sm tabular-nums text-blue-900 font-medium text-right">
            {count} jour{count > 1 ? "s" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function AbsenceDirectionRapportPage({
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

      <h1 className={titrePageClass}>Jours d&apos;absence par direction</h1>

      <PeriodeShell debutParDefaut={debut} finParDefaut={fin}>
        <ContenuAbsenceDirection debut={debut} fin={fin} />
      </PeriodeShell>
    </div>
  );
}
