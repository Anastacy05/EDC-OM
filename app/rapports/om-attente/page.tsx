import { lireOMEnAttenteVieillissants } from "@/lib/data/rapports";
import { titrePageClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import OMEnAttenteInteractif from "./OMEnAttenteInteractif";

/**
 * Rapport n° 7 — OM en attente vieillissants (MODELE-DONNEES.md §11, catalogue).
 *
 * « Travail du lecteur : agir sur des lignes » → un TABLEAU, pas un graphique
 * (§11, « pourquoi ces formes ») : ce n'est pas une tendance à observer, c'est
 * une liste de travail. Triée par ancienneté d'ÉMISSION croissante
 * (lib/data/rapports.ts → `lireOMEnAttenteVieillissants`), pas de pagination —
 * un encours reste petit par construction.
 *
 * PAS de `PeriodeShell` ici, contrairement aux rapports n° 1 et 6 : une
 * période filtrée sur `date_depart` masquerait justement les OM les plus
 * anciens si leur départ était déjà passé (`EXPIRE` ne les remplace pas
 * automatiquement — cf. §17.5, la régularisation reste une action distincte).
 * C'est un instantané, pas une tranche historique.
 *
 * Composant SERVEUR : ne fait que lire les données. `OMEnAttenteInteractif`
 * (client) porte le bouton Imprimer — `window.print()` n'existe pas côté
 * serveur.
 */

export const metadata = { title: "OM en attente vieillissants — EDC OM" };

export default async function OMEnAttentePage() {
  const lignes = await lireOMEnAttenteVieillissants();

  return (
    <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      <RetourVers href="/rapports" libelle="Retour aux rapports" />

      <h1 className={titrePageClass}>OM en attente vieillissants</h1>

      <p className="text-sm text-gray-600 max-w-2xl">
        Ancienneté mesurée depuis la date d&apos;ÉMISSION du document, pas la date de
        départ — un ordre émis il y a trois semaines reste tout aussi en attente que son
        départ soit dans deux jours ou déjà passé.
      </p>

      <OMEnAttenteInteractif lignes={lignes} />
    </div>
  );
}
