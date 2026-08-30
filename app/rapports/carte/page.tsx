import { lireDonneesRapports, lireReferentielPays } from "@/lib/data/rapports";
import { titrePageClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import CarteInteractif from "./CarteInteractif";

/**
 * Missions par continent — composant SERVEUR depuis le 26/08/2026 (étape 14).
 *
 * L'écran précédent était client et lisait `mockOMs`, donc `localStorage` :
 * les chiffres affichés étaient des données de démonstration propres à CHAQUE
 * navigateur, jamais les missions réellement enregistrées. `AvertissementDonneesDemo`
 * le signalait — l'encart n'a plus lieu d'être, les données viennent maintenant
 * de la base (lib/data/rapports.ts) et sont commentées à ce titre plus bas.
 *
 * La partie interactive (ouverture du détail par pays) reste dans un composant
 * client (`CarteInteractif`), qui reçoit les missions déjà lues ici en props.
 *
 * MODIFIÉ le 26/08/2026 : `referentielPays` (nom + continent de chaque pays,
 * lus en base) s'ajoute aux missions — `CarteMonde.tsx` ne recalcule plus rien
 * lui-même via des bibliothèques tierces, cf. son commentaire d'en-tête.
 */

export const metadata = { title: "Missions par continent — EDC OM" };

export default async function CarteRapportPage() {
  const [{ missions }, referentielPays] = await Promise.all([
    lireDonneesRapports(),
    lireReferentielPays(),
  ]);

  return (
    <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      {/* Destination DÉCLARÉE, jamais déduite de l'URL : ces rapports
          renvoient vers /om?filtre=… , donc un retour calculé sur le chemin
          courant se tromperait. */}
      <RetourVers href="/rapports" libelle="Retour aux rapports" />

      <h1 className={titrePageClass}>Missions par continent</h1>

      {/* COMMENTÉ (26/08/2026) — l'avertissement disait que ces chiffres
          venaient de mockOMs/localStorage, donc d'aucune mission réelle.
          C'est faux depuis la bascule sur lib/data/rapports.ts ci-dessus :
          l'afficher tromperait dans l'autre sens.
      <AvertissementDonneesDemo />
      */}

      <CarteInteractif missions={missions} referentielPays={referentielPays} />
    </div>
  );
}
