import { lireLignesRapports } from "@/lib/data/rapports";
import { missionsParEmploye } from "@/lib/analytics";
import { titrePageClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import PeriodeShell from "../PeriodeShell";
import MissionsEmployeInteractif from "./MissionsEmployeInteractif";

/**
 * Rapport n° 8 — Missions par employé (MODELE-DONNEES.md §11, catalogue).
 * L'agrégation (`missionsParEmploye`) est pure et tourne côté serveur ; la
 * recherche/le tri/la pagination/l'export restent client (aucun aller-retour
 * réseau nécessaire pour ça) — cf. MissionsEmployeInteractif.tsx.
 */

export const metadata = { title: "Missions par employé — EDC OM" };

async function ContenuMissionsEmploye({ debut, fin }: { debut: string; fin: string }) {
  const lignes = await lireLignesRapports({ debut, fin });
  const parEmploye = missionsParEmploye(lignes);
  return <MissionsEmployeInteractif lignes={parEmploye} />;
}

export default async function MissionsEmployeRapportPage({
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

      <h1 className={titrePageClass}>Missions par employé</h1>

      <PeriodeShell debutParDefaut={debut} finParDefaut={fin}>
        <ContenuMissionsEmploye debut={debut} fin={fin} />
      </PeriodeShell>
    </div>
  );
}
