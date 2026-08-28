import { lireDonneesRapports, lireReferentielZones } from "@/lib/data/rapports";
import { missionsParZone } from "@/lib/analytics";
import { titrePageClass, carteClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import PeriodeShell from "../PeriodeShell";

/**
 * Rapport n° 5 — Répartition par zone (MODELE-DONNEES.md §11, catalogue).
 *
 * Colonnes, une SEULE teinte en RAMPE ORDINALE (zone 0 la plus claire, zone 3
 * la plus soutenue) — pas une palette de 4 couleurs arbitraires : ce sont 4
 * paliers d'un même barème (lib/baremes.ts), pas 4 catégories indépendantes,
 * donc la couleur doit exprimer l'ORDRE, pas seulement l'identité (§11,
 * « couleurs »).
 *
 * `codeZone` et le libellé de chaque zone sont LUS EN BASE (`pays.code_zone`,
 * `zone.libelle`) — jamais recalculés via `lib/zones.ts`, même raisonnement
 * que pour le continent (cf. lib/data/rapports.ts, commentaire d'en-tête).
 */

export const metadata = { title: "Répartition par zone — EDC OM" };

// Rampe ordinale à 4 paliers, du plus clair (zone 0) au plus soutenu (zone 3)
// — mêmes teintes que CarteMonde.tsx, pour qu'une intensité de bleu signifie
// la même chose partout dans les rapports.
const RAMPE_ZONE = ["#bfdbfe", "#60a5fa", "#3b82f6", "#1d4ed8"];

async function ContenuRepartitionZone({ debut, fin }: { debut: string; fin: string }) {
  const [{ missions }, libellesZone] = await Promise.all([
    lireDonneesRapports(),
    lireReferentielZones(),
  ]);
  // Cf. app/rapports/top-destinations/page.tsx : même filtre en mémoire,
  // même raison (lireDonneesRapports n'a pas de paramètre de période).
  const missionsPeriode = missions.filter((m) => m.dateDepart >= debut && m.dateDepart <= fin);

  const comptes = missionsParZone(missionsPeriode);
  const max = Math.max(1, ...comptes.map((c) => c.count));
  const total = comptes.reduce((somme, c) => somme + c.count, 0);

  if (total === 0) {
    return <p className="text-gray-500 text-sm">Aucune mission sur cette période.</p>;
  }

  return (
    <div className={`${carteClass} max-w-2xl`}>
      <div className="flex items-end gap-8 h-56 px-4">
        {comptes.map(({ cle, count }) => (
          <div key={cle} className="flex flex-col items-center gap-2 flex-1">
            <span className="text-sm font-medium text-blue-900">{count}</span>
            <div
              style={{
                height: `${Math.max(8, (count / max) * 160)}px`,
                backgroundColor: RAMPE_ZONE[cle] ?? RAMPE_ZONE[RAMPE_ZONE.length - 1],
              }}
              className="w-full rounded-t-lg"
            />
            <span className="text-sm text-gray-600 border-t-2 border-blue-800 pt-1 w-full text-center truncate">
              {libellesZone[cle] ?? `Zone ${cle}`}
            </span>
          </div>
        ))}
      </div>

      <table className="w-full text-sm mt-2">
        <caption className="sr-only">Missions par zone du barème</caption>
        <thead>
          <tr className="text-left text-gray-600 border-b border-blue-100">
            <th className="py-2 font-medium">Zone</th>
            <th className="py-2 font-medium text-right tabular-nums">Missions</th>
            <th className="py-2 font-medium text-right tabular-nums">Part</th>
          </tr>
        </thead>
        <tbody>
          {comptes.map(({ cle, count }) => (
            <tr key={cle} className="border-b border-blue-50 last:border-0">
              <td className="py-2">{libellesZone[cle] ?? `Zone ${cle}`}</td>
              <td className="py-2 text-right tabular-nums">{count}</td>
              <td className="py-2 text-right tabular-nums text-gray-500">
                {((count / total) * 100).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function RepartitionZoneRapportPage({
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

      <h1 className={titrePageClass}>Répartition par zone</h1>

      <PeriodeShell debutParDefaut={debut} finParDefaut={fin}>
        <ContenuRepartitionZone debut={debut} fin={fin} />
      </PeriodeShell>
    </div>
  );
}
