import { CheckCircle2, Wallet, CalendarDays, Clock } from "lucide-react";
import { lireLignesRapports } from "@/lib/data/rapports";
import { indicateursTete, periodePrecedente, variationPct, formatFcfa } from "@/lib/analytics";
import { titrePageClass, carteClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import PeriodeShell from "../PeriodeShell";

/**
 * Rapport n° 1 — Indicateurs de tête (MODELE-DONNEES.md §11, catalogue).
 *
 * Quatre chiffres en tuiles, pas un graphique : « un graphique à une barre est
 * toujours une erreur de forme » (§11). Chaque tuile porte sa variation par
 * rapport à la période précédente de même longueur (lib/analytics.ts →
 * `periodePrecedente`).
 *
 * Défaut sans filtre dans l'URL : ANNÉE EN COURS. Une période par défaut
 * bornée est nécessaire pour que la variation ait un sens — « depuis le début
 * de la base » n'a pas de période précédente comparable.
 */

export const metadata = { title: "Indicateurs de tête — EDC OM" };

function Tuile({
  Icone,
  libelle,
  valeur,
  variation,
  avertissement,
}: {
  Icone: typeof CheckCircle2;
  libelle: string;
  valeur: string;
  variation: number | null;
  /** true si une hausse doit se lire comme défavorable (coût, attente), false sinon (missions, jours). */
  avertissement?: boolean;
}) {
  const hausse = variation !== null && variation > 0;
  const baisse = variation !== null && variation < 0;
  const favorable = avertissement ? baisse : hausse;
  const defavorable = avertissement ? hausse : baisse;

  return (
    <div className={`${carteClass} flex-1 min-w-[220px]`}>
      <div className="flex items-center gap-2 text-gray-600 text-sm">
        <Icone size={16} aria-hidden="true" />
        {libelle}
      </div>
      {/* tabular-nums volontairement absent ici : §11 dit que les grands
          nombres des tuiles doivent « respirer », contrairement aux colonnes
          de tableau et graduations. */}
      <div className="text-3xl font-bold text-blue-900">{valeur}</div>
      {variation !== null ? (
        <div
          className={`text-sm font-medium ${
            favorable ? "text-green-700" : defavorable ? "text-red-700" : "text-gray-500"
          }`}
        >
          {variation > 0 ? "+" : ""}
          {variation.toFixed(1)}% vs période précédente
        </div>
      ) : (
        <div className="text-sm text-gray-400">Aucune donnée sur la période précédente</div>
      )}
    </div>
  );
}

async function ContenuIndicateurs({ debut, fin }: { debut: string; fin: string }) {
  const precedente = periodePrecedente(debut, fin);

  const [lignesActuelles, lignesPrecedentes] = await Promise.all([
    lireLignesRapports({ debut, fin }),
    lireLignesRapports({ debut: precedente.debut, fin: precedente.fin }),
  ]);

  const actuel = indicateursTete(lignesActuelles);
  const precedent = indicateursTete(lignesPrecedentes);

  return (
    <div className="flex flex-wrap gap-4">
      <Tuile
        Icone={CheckCircle2}
        libelle="Missions confirmées"
        valeur={String(actuel.missionsConfirmees)}
        variation={variationPct(actuel.missionsConfirmees, precedent.missionsConfirmees)}
      />
      <Tuile
        Icone={Wallet}
        libelle="Coût total (plancher)"
        valeur={formatFcfa(actuel.coutTotalFcfa)}
        variation={variationPct(actuel.coutTotalFcfa, precedent.coutTotalFcfa)}
        avertissement
      />
      <Tuile
        Icone={CalendarDays}
        libelle="Jours cumulés"
        valeur={String(actuel.joursCumules)}
        variation={variationPct(actuel.joursCumules, precedent.joursCumules)}
      />
      <Tuile
        Icone={Clock}
        libelle="OM en attente"
        valeur={String(actuel.omEnAttente)}
        variation={variationPct(actuel.omEnAttente, precedent.omEnAttente)}
        avertissement
      />
    </div>
  );
}

export default async function IndicateursRapportPage({
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

      <h1 className={titrePageClass}>Indicateurs de tête</h1>

      {/* ⚠️ Le montant affiché est un PLANCHER : il ne couvre que l'indemnité
          journalière fixe, jamais le transport ni l'hébergement (§11). */}
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 max-w-2xl">
        Le coût affiché ne couvre que l&apos;indemnité journalière fixe — ni le transport, ni
        l&apos;hébergement. C&apos;est un <strong>plancher</strong>, pas un budget complet.
      </p>

      <PeriodeShell debutParDefaut={debut} finParDefaut={fin}>
        <ContenuIndicateurs debut={debut} fin={fin} />
      </PeriodeShell>
    </div>
  );
}
