import Link from "next/link";
import { lireLignesRapports } from "@/lib/data/rapports";
import { coutParMois, coutParAnnee, formatFcfa } from "@/lib/analytics";
import { NOMS_MOIS } from "@/lib/dateUtils";
import { titrePageClass, carteClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import PeriodeShell from "../PeriodeShell";

/**
 * Rapport n° 2 — Coût par période (MODELE-DONNEES.md §11, catalogue).
 *
 * « Colonnes (mois) ou ligne (années) » : deux vues, choisies par `?vue=`,
 * jamais superposées sur le même graphique — § 11, « aucun double axe » (même
 * s'il ne s'agirait ici que d'une seule mesure à deux granularités, garder
 * les vues séparées évite d'avoir à confondre visuellement une barre de mois
 * et un point d'année sur le même axe).
 *
 * Une seule teinte (bleu), comme prescrit : ce n'est pas une comparaison de
 * catégories qui mériterait une rampe.
 */

export const metadata = { title: "Coût par période — EDC OM" };

function BarreHorizontale({ libelle, valeur, max }: { libelle: string; valeur: number; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-sm text-gray-700 text-right">{libelle}</span>
      <div className="flex-1 h-5 bg-blue-100 rounded-full overflow-hidden">
        <div
          style={{ width: `${max > 0 ? (valeur / max) * 100 : 0}%` }}
          className="h-full bg-blue-600 rounded-full"
        />
      </div>
      <span className="w-32 shrink-0 text-sm tabular-nums text-blue-900 font-medium">
        {formatFcfa(valeur)}
      </span>
    </div>
  );
}

async function ContenuCoutPeriode({
  debut,
  fin,
  vue,
}: {
  debut: string;
  fin: string;
  vue: "mois" | "annee";
}) {
  const lignes = await lireLignesRapports({ debut, fin });

  if (vue === "annee") {
    const comptes = coutParAnnee(lignes);
    const max = Math.max(1, ...comptes.map((c) => c.count));
    return (
      <div className={`${carteClass} max-w-2xl`}>
        {comptes.length === 0 ? (
          <p className="text-gray-500 text-sm">Aucune mission engageante sur cette période.</p>
        ) : (
          comptes.map(({ cle, count }) => (
            <BarreHorizontale key={cle} libelle={String(cle)} valeur={count} max={max} />
          ))
        )}
      </div>
    );
  }

  const comptes = coutParMois(lignes);
  const max = Math.max(1, ...comptes.map((c) => c.count));
  return (
    <div className={`${carteClass} max-w-2xl`}>
      {comptes.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucune mission engageante sur cette période.</p>
      ) : (
        comptes.map(({ cle, count }) => {
          const [annee, mois] = cle.split("-");
          const libelle = `${NOMS_MOIS[Number(mois) - 1].slice(0, 3)} ${annee}`;
          return <BarreHorizontale key={cle} libelle={libelle} valeur={count} max={max} />;
        })
      )}
    </div>
  );
}

export default async function CoutPeriodeRapportPage({
  searchParams,
}: {
  searchParams: Promise<{ debut?: string; fin?: string; vue?: string }>;
}) {
  const params = await searchParams;
  const anneeCourante = new Date().getUTCFullYear();
  const debut = params.debut ?? `${anneeCourante}-01-01`;
  const fin = params.fin ?? `${anneeCourante}-12-31`;
  const vue: "mois" | "annee" = params.vue === "annee" ? "annee" : "mois";

  const suivants = new URLSearchParams({ debut, fin });

  return (
    <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      <RetourVers href="/rapports" libelle="Retour aux rapports" />

      <h1 className={titrePageClass}>Coût par période</h1>

      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 max-w-2xl">
        Le coût affiché ne couvre que l&apos;indemnité journalière fixe — ni le transport, ni
        l&apos;hébergement. C&apos;est un <strong>plancher</strong>, pas un budget complet.
      </p>

      <div className="flex gap-4 text-sm">
        <Link
          href={`?${new URLSearchParams({ ...Object.fromEntries(suivants), vue: "mois" })}`}
          className={vue === "mois" ? "font-semibold text-blue-900 underline" : "text-blue-700 underline hover:no-underline"}
        >
          Par mois
        </Link>
        <Link
          href={`?${new URLSearchParams({ ...Object.fromEntries(suivants), vue: "annee" })}`}
          className={vue === "annee" ? "font-semibold text-blue-900 underline" : "text-blue-700 underline hover:no-underline"}
        >
          Par année
        </Link>
      </div>

      <PeriodeShell debutParDefaut={debut} finParDefaut={fin}>
        <ContenuCoutPeriode debut={debut} fin={fin} vue={vue} />
      </PeriodeShell>
    </div>
  );
}
