import { lireDonneesRapports } from "@/lib/data/rapports";
import { titrePageClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import FriseInteractif from "./FriseInteractif";

/**
 * Missions par année — composant SERVEUR depuis le 26/08/2026 (étape 14).
 * Même bascule que app/rapports/carte/page.tsx : voir ses commentaires.
 */

export const metadata = { title: "Missions par année — EDC OM" };

export default async function FriseRapportPage() {
  const { missions } = await lireDonneesRapports();

  return (
    <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      {/* Destination DÉCLARÉE, jamais déduite de l'URL : ces rapports
          renvoient vers /om?filtre=… , donc un retour calculé sur le chemin
          courant se tromperait. */}
      <RetourVers href="/rapports" libelle="Retour aux rapports" />

      <h1 className={titrePageClass}>Missions par année</h1>

      {/* COMMENTÉ (26/08/2026) — cf. app/rapports/carte/page.tsx : l'avertissement
          données de démo n'est plus vrai depuis la bascule sur la base.
      <AvertissementDonneesDemo />
      */}

      <FriseInteractif missions={missions} />
    </div>
  );
}
