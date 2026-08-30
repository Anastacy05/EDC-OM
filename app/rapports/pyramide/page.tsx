import { lireDonneesRapports } from "@/lib/data/rapports";
import { getStatuts } from "@/lib/data/referentiels";
import { titrePageClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import PyramideInteractif from "./PyramideInteractif";

/**
 * Missions par statut — composant SERVEUR depuis le 26/08/2026 (étape 14).
 * Même bascule que app/rapports/carte/page.tsx : voir ses commentaires.
 *
 * `getStatuts()` remplace la constante `STATUTS` de lib/referentiels.ts : la
 * pyramide lit maintenant le référentiel réel, dans le même ordre (rang
 * croissant), que la table est déjà triée à produire (§ commentaire de
 * `getStatuts`).
 */

export const metadata = { title: "Missions par statut — EDC OM" };

export default async function PyramideRapportPage() {
  const [{ participants }, statuts] = await Promise.all([lireDonneesRapports(), getStatuts()]);

  return (
    <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      {/* Destination DÉCLARÉE, jamais déduite de l'URL : ces rapports
          renvoient vers /om?filtre=… , donc un retour calculé sur le chemin
          courant se tromperait. */}
      <RetourVers href="/rapports" libelle="Retour aux rapports" />

      <h1 className={titrePageClass}>Missions par statut</h1>

      {/* COMMENTÉ (26/08/2026) — cf. app/rapports/carte/page.tsx : l'avertissement
          données de démo n'est plus vrai depuis la bascule sur la base.
      <AvertissementDonneesDemo />
      */}

      <PyramideInteractif participants={participants} statuts={statuts} />
    </div>
  );
}
