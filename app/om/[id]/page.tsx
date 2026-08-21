"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
// useRouter : cf. la ligne commentée dans le composant (20/08/2026).
import OMPreview from "@/components/OMPreview";
import {
  getMockOM,
  confirmerParticipant,
  annulerParticipant,
  // supprimerParticipant, // COMMENTÉ (20/08/2026) — cf. handleSupprimer ci-dessous
  // ajouterFrais, // COMMENTÉ (03/08/2026) — frais non gérés par l'appli pour l'instant
} from "@/lib/mockData";
import { buildDocumentForParticipant } from "@/lib/buildDocument";
import { formatDateFR, formatHeureFR } from "@/lib/dateUtils";
import RetourVers from "@/components/RetourVers";
import { titrePageClass } from "@/lib/styles";
import { useEstMonte } from "@/lib/useEstMonte";
import { verifierConcurrence } from "@/lib/businessRules";

const statutStyles: Record<string, string> = {
  EN_ATTENTE: "bg-amber-200 text-amber-800",
  CONFIRME: "bg-green-200 text-green-800",
  ANNULE: "bg-red-200 text-red-800",
};

export default function OMDetailPage() {
  const { id } = useParams<{ id: string }>();
  // COMMENTÉ (20/08/2026) — handleSupprimer était son seul consommateur (il
  // redirigeait vers /om quand la mission entière disparaissait). Reviendra
  // avec l'action « Refuser » réservée à l'admin.
  // const router = useRouter();
  const searchParams = useSearchParams();

  // Garde-fou d'hydratation, comme sur /admin.
  //
  // `mockOMs` (lib/mockData.ts) vaut les données par DÉFAUT au rendu serveur et
  // celles de localStorage côté navigateur. Sans ce garde-fou, un OM créé par
  // l'utilisateur est INTROUVABLE côté serveur et TROUVÉ côté client : les deux
  // rendus divergent complètement (branche « introuvable », centrée, contre la
  // page de détail), React remonte une erreur d'hydratation et peut conserver
  // le HTML du serveur — donc afficher « introuvable » pour un OM qui existe.
  //
  // Disparaîtra avec la base : les données viendront alors du serveur, qui les
  // connaîtra (MODELE-DONNEES.md §13, étape 9).
  const estMonte = useEstMonte();

  const om = getMockOM(id);
  const participantIdVoulu = searchParams.get("participant");
  const indexInitial = om
    ? Math.max(
        0,
        om.participants.findIndex((p) => p.id === participantIdVoulu)
      )
    : 0;

  const [index, setIndex] = useState(indexInitial);
  const [tick, setTick] = useState(0); // force le re-rendu après mutation du mock
  const [downloading, setDownloading] = useState(false);
  const [erreurTelechargement, setErreurTelechargement] = useState("");
  // const [nouveauFrais, setNouveauFrais] = useState({ type: "", montant: "" }); // COMMENTÉ (03/08/2026)

  const refresh = () => setTick((t) => t + 1);

  // Ce test vient AVANT celui sur `om` : au rendu serveur, `om` est
  // systématiquement absent pour tout OM créé par l'utilisateur, et afficher
  // « introuvable » serait à la fois faux et source d'écart d'hydratation.
  // Placé après tous les hooks, jamais avant (règles des hooks React).
  if (!estMonte) {
    return (
      <div className="min-h-full w-full bg-blue-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Chargement de l&apos;ordre de mission…</p>
      </div>
    );
  }

  if (!om || om.participants.length === 0) {
    return (
      <div className="min-h-full w-full bg-blue-50 flex items-center justify-center">
        <p className="text-amber-700 text-lg">Ordre de mission introuvable.</p>
      </div>
    );
  }

  const indexClamped = Math.min(index, om.participants.length - 1);
  const participant = om.participants[indexClamped];
  const document = buildDocumentForParticipant(om, participant);

  // La concurrence est vérifiée à la création (avertissement/blocage selon
  // le statut de l'OM en conflit), mais rien n'empêchait jusqu'ici de
  // confirmer un OM malgré un conflit devenu bloquant entre-temps (ex : deux
  // OM en attente créés pour la même personne, dates qui se chevauchent —
  // aucun blocage à la création puisque aucun des deux n'est encore
  // confirmé ; puis on confirme le premier, puis le second, sans que rien
  // ne s'y oppose). On revérifie donc ici, au moment précis de la
  // confirmation — c'est la seule étape qui rend réellement l'OM "engageant".
  const handleConfirmer = () => {
    const resultat = verifierConcurrence(
      participant.matricule,
      om.dateDepart,
      om.dateRetour,
      om.id // exclut l'OM courant lui-même de la recherche de conflits
    );

    if (resultat.niveau === "blocage") {
      const conflit = resultat.conflits.find((c) => c.statut === "CONFIRME");
      alert(
        `Confirmation impossible : ${participant.nom} a déjà un OM confirmé sur cette période ` +
          `(${conflit?.destination ?? "autre mission"}, du ${formatDateFR(conflit?.dateDepart)} ` +
          `au ${formatDateFR(conflit?.dateRetour)}).`
      );
      return;
    }

    if (resultat.niveau === "avertissement") {
      const conflit = resultat.conflits[0];
      const continuer = confirm(
        `Attention : ${participant.nom} a un autre OM en attente sur une période qui se ` +
          `chevauche (${conflit?.destination ?? "autre mission"}). Confirmer quand même ?`
      );
      if (!continuer) return;
    }

    confirmerParticipant(om.id, participant.id);
    refresh();
  };

  const handleAnnuler = () => {
    if (!confirm(`Annuler l'OM confirmé de ${participant.nom} ?`)) return;
    annulerParticipant(om.id, participant.id);
    refresh();
  };

  /* COMMENTÉ (20/08/2026) — la suppression d'un OM est retirée du produit.

     Raison : chaque OM consomme un numéro DÉFINITIF dès sa création
     (0042/OM/EDC/DG/2026, tiré d'une plage réservée) et il est imprimable
     immédiatement, avant même d'être confirmé. Supprimer l'enregistrement ne
     rend pas le numéro : le document existerait sur papier sans plus exister
     en base, ce qui est exactement le trou de traçabilité que la numérotation
     doit empêcher. Un OM jamais confirmé est par ailleurs une information de
     gestion, pas un déchet.

     Remplacé par deux statuts, cf. MODELE-DONNEES.md §7 :
       • REFUSE — l'admin écarte un OM non confirmé, AVEC un motif, et son
         auteur est notifié de la raison. C'est la transition qui manquait :
         annulerParticipant n'accepte que CONFIRME -> ANNULE, donc un OM en
         attente ne pouvait être qu'effacé, faute d'alternative.
       • EXPIRE — posé AUTOMATIQUEMENT quand la date de retour est passée et
         que l'OM n'a jamais été confirmé. Personne n'a à faire le ménage.

  const handleSupprimer = () => {
    if (!confirm(`Supprimer l'OM en attente de ${participant.nom} ?`)) return;
    supprimerParticipant(om.id, participant.id);
    if (!getMockOM(om.id)) {
      router.push("/om"); // c'était le dernier participant, la mission entière a disparu
      return;
    }
    setIndex((i) => Math.max(0, i - 1));
    refresh();
  };
  */

  // COMMENTÉ (03/08/2026) — frais non gérés par l'appli pour l'instant.
  // const handleAjouterFraisReel = () => {
  //   if (!nouveauFrais.type || !nouveauFrais.montant) return;
  //   ajouterFrais(om.id, participant.id, "reel", {
  //     type: nouveauFrais.type,
  //     montant: Number(nouveauFrais.montant),
  //   });
  //   setNouveauFrais({ type: "", montant: "" });
  //   refresh();
  // };

  const handleDownload = async () => {
    setDownloading(true);
    setErreurTelechargement("");
    try {
      const res = await fetch("/api/generate-om", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...document,
          dateDepart: formatDateFR(document.dateDepart),
          dateRetour: formatDateFR(document.dateRetour),
          dateEmission: formatDateFR(document.dateEmission),
          visas: document.visas?.map((leg) => ({
            ...leg,
            departLe: formatDateFR(leg.departLe),
            arriveeLe: formatDateFR(leg.arriveeLe),
            departHeure: formatHeureFR(leg.departHeure),
            arriveeHeure: formatHeureFR(leg.arriveeHeure),
          })),
        }),
      });
      if (!res.ok) throw new Error("Échec du téléchargement");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `ordre_mission_${participant.matricule}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErreurTelechargement(
        "La génération du document a échoué. Réessaie, ou préviens l'équipe technique si ça persiste."
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-full w-full bg-blue-50 py-10">
      <div className="flex flex-col gap-4 py-10 px-6 sm:px-12 lg:px-20">
        {/* MIS À JOUR (21/08/2026) — le commentaire précédent renvoyait au
            « bouton Retour du Header », qui n'existe plus : il déduisait sa
            destination de l'URL et se trompait dès qu'on arrivait ici depuis un
            rapport. Le retour est maintenant posé par la page, avec une
            destination nommée. */}
        <RetourVers href="/om" libelle="Retour à la liste des ordres de mission" />

        <h1 className={titrePageClass}>Détails de l&apos;ordre de mission</h1>
      </div>
      {/* Navigation entre les documents si la mission concerne plusieurs employés */}
      {om.participants.length > 1 && (
        <div className="max-w-[794px] mx-auto px-4 flex items-center justify-between mb-4">
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={indexClamped === 0}
            className="py-2 px-4 rounded-full bg-white disabled:opacity-40 shadow-md shadow-blue-950/10"
          >
            ← Précédent
          </button>
          <span className="text-amber-700 font-medium">
            Participant {indexClamped + 1} / {om.participants.length} — {participant.nom}
          </span>
          <button
            onClick={() => setIndex((i) => Math.min(om.participants.length - 1, i + 1))}
            disabled={indexClamped === om.participants.length - 1}
            className="py-2 px-4 rounded-full bg-white disabled:opacity-40 shadow-md shadow-blue-950/10"
          >
            Suivant →
          </button>
        </div>
      )}

      <div className="max-w-[794px] mx-auto px-4 mb-4 flex flex-col items-center gap-1">
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${statutStyles[participant.statut]}`}
        >
          {participant.statut}
        </span>
        {participant.montantFraisFixeJournalier !== undefined && (
          <span className="text-sm text-amber-700">
            {participant.statutHierarchique} — Frais fixe journalier (indicatif) :{" "}
            {participant.montantFraisFixeJournalier.toLocaleString("fr-FR")} FCFA
          </span>
        )}
      </div>

      {/* Le fac-similé reste neutre / fidèle au document Word — lecture seule */}
      <OMPreview om={document} />

      <div className="max-w-[794px] mx-auto px-4 flex justify-center gap-4 flex-wrap mt-4">
        <button
          onClick={handleConfirmer}
          disabled={participant.statut !== "EN_ATTENTE"}
          className="py-3 px-8 rounded-full bg-green-600 hover:bg-green-700 disabled:bg-green-200
                     disabled:cursor-not-allowed text-white shadow-xl shadow-blue-950/20
                     hover:scale-105 transition-all duration-300"
        >
          Confirmer
        </button>

        <button
          onClick={handleAnnuler}
          disabled={participant.statut !== "CONFIRME"}
          className="py-3 px-8 rounded-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-200
                     disabled:cursor-not-allowed text-white shadow-xl shadow-blue-950/20
                     hover:scale-105 transition-all duration-300"
        >
          Annuler
        </button>

        {/* COMMENTÉ (20/08/2026) — bouton « Supprimer » retiré : un OM ne se
            supprime pas, son numéro étant déjà émis (cf. handleSupprimer plus
            haut et MODELE-DONNEES.md §7). À remplacer par un bouton
            « Refuser » réservé à l'admin, demandant un motif, une fois les
            rôles implémentés.

        <button
          onClick={handleSupprimer}
          disabled={participant.statut !== "EN_ATTENTE"}
          className="py-3 px-8 rounded-full bg-red-600 hover:bg-red-700 disabled:bg-red-200
                     disabled:cursor-not-allowed text-white shadow-xl shadow-blue-950/20
                     hover:scale-105 transition-all duration-300"
        >
          Supprimer
        </button>
        */}

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="py-3 px-8 rounded-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300
                     disabled:cursor-not-allowed text-white shadow-xl shadow-blue-950/20
                     hover:scale-105 transition-all duration-300"
        >
          {downloading ? "Génération…" : "Télécharger (Word)"}
        </button>
      </div>

      {erreurTelechargement && (
        <div className="max-w-[794px] mx-auto px-4 mt-4">
          <div className="bg-red-100 border border-red-300 rounded-xl p-4 text-red-700 text-sm text-center">
            {erreurTelechargement}
          </div>
        </div>
      )}

      {/* COMMENTÉ (03/08/2026) — décision : on ne touche pas au verso de
          l'OM pour l'instant, les frais ne sont plus affichés/gérés ici.

      <div className="max-w-[794px] mx-auto px-4 mt-8 flex flex-col gap-4">
        <div className="bg-white/70 rounded-2xl shadow-md shadow-blue-950/10 p-6">
          <h2 className="text-amber-600 font-semibold text-lg mb-3">Frais prévisionnels</h2>
          {participant.fraisPrevisionnels.length === 0 && (
            <p className="text-sm text-gray-500">Aucun frais prévisionnel renseigné.</p>
          )}
          <ul className="text-sm flex flex-col gap-1">
            {participant.fraisPrevisionnels.map((f) => (
              <li key={f.id}>
                {f.type} — {f.montant.toLocaleString("fr-FR")} FCFA
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white/70 rounded-2xl shadow-md shadow-blue-950/10 p-6">
          <h2 className="text-amber-600 font-semibold text-lg mb-3">Frais réels</h2>
          <ul className="text-sm flex flex-col gap-1 mb-3">
            {participant.fraisReels.map((f) => (
              <li key={f.id}>
                {f.type} — {f.montant.toLocaleString("fr-FR")} FCFA
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              placeholder="Type"
              value={nouveauFrais.type}
              onChange={(e) => setNouveauFrais((p) => ({ ...p, type: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-blue-200 bg-white text-sm flex-1"
            />
            <input
              type="number"
              placeholder="Montant"
              value={nouveauFrais.montant}
              onChange={(e) => setNouveauFrais((p) => ({ ...p, montant: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-blue-200 bg-white text-sm w-32"
            />
            <button
              onClick={handleAjouterFraisReel}
              className="py-2 px-4 rounded-full bg-blue-300 hover:bg-blue-200 shadow-md shadow-blue-950/20"
            >
              Ajouter
            </button>
          </div>
        </div>
      </div>

      */}
    </div>
  );
}
