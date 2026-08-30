"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { boutonDanger, boutonPrimaire, boutonSecondaire } from "@/lib/styles";

/**
 * Boîte de confirmation, pour les gestes qu'on ne veut pas faire par accident.
 *
 * ── Ce qu'elle remplace : `confirm()` ────────────────────────────────────────
 *
 * Trois `confirm()` natifs subsistaient (`components/RetourVers.tsx`, et les
 * anciens écrans d'OM). `BlocActions` documente déjà pourquoi c'est mauvais :
 * la boîte native **bloque le fil d'exécution**, n'est pas stylable, et certains
 * navigateurs mobiles ne l'affichent pas du tout — l'utilisateur voit alors son
 * action se produire sans avoir rien confirmé, ou ne se produire jamais.
 *
 * ── Pourquoi `<dialog>` et non un `<div>` en `position: fixed` ───────────────
 *
 * `components/Modal.tsx` (utilisé par les rapports) est un `<div>` : il gère
 * Échap et le clic sur le fond, mais il lui manque tout le reste, et ce reste
 * compte pour une question à laquelle on répond « oui » ou « non » :
 *
 *   • le **piège de focus** — sans lui, la tabulation sort de la boîte et va
 *     cliquer les boutons de la page derrière, qui sont justement ceux qu'on
 *     demande de confirmer ;
 *   • l'**inertie** du reste du document, que `showModal()` pose seul ;
 *   • le **`role="dialog"` implicite** avec `aria-modal`, donc l'annonce correcte
 *     par un lecteur d'écran ;
 *   • la **couche supérieure** (top layer), qui met la boîte au-dessus de tout
 *     sans avoir à surenchérir sur les `z-index`.
 *
 * Tout cela est natif depuis `<dialog>` : le réécrire à la main serait un
 * piège de focus maison, c'est-à-dire un défaut d'accessibilité de plus.
 *
 * ── Le focus initial va sur ANNULER ─────────────────────────────────────────
 *
 * `showModal()` place le focus sur le premier élément focalisable, ou sur celui
 * qui porte `autofocus`. On le pose donc sur « Annuler » : sur une question dont
 * la réponse « oui » désactive un employé ou refuse un ordre de mission, une
 * frappe réflexe sur Entrée ne doit pas valider.
 */
export default function Confirmation({
  ouvert,
  titre,
  message,
  libelleConfirmer = "Confirmer",
  libelleAnnuler = "Annuler",
  danger = false,
  enCours = false,
  onConfirmer,
  onAnnuler,
}: {
  ouvert: boolean;
  titre: string;
  /** Ce que l'action va faire, et ce qu'elle coûte si c'est une erreur. */
  message: React.ReactNode;
  libelleConfirmer?: string;
  libelleAnnuler?: string;
  /** Vrai pour une action destructrice : le bouton de validation passe en rouge. */
  danger?: boolean;
  /** Vrai pendant la soumission : les deux boutons se verrouillent. */
  enCours?: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  const boite = useRef<HTMLDialogElement>(null);

  // La boîte suit la propriété `ouvert`, jamais l'inverse. Les gardes sur
  // `.open` sont nécessaires : `showModal()` sur une boîte déjà ouverte lève une
  // `InvalidStateError`, et `close()` sur une boîte fermée déclencherait un
  // second évènement `close`.
  useEffect(() => {
    const d = boite.current;
    if (!d) return;
    if (ouvert && !d.open) d.showModal();
    else if (!ouvert && d.open) d.close();
  }, [ouvert]);

  return (
    <dialog
      ref={boite}
      // Échap : `preventDefault` empêche la fermeture native, et c'est le parent
      // qui repasse `ouvert` à faux. Sans ça, la boîte se fermerait sans que
      // l'état du parent le sache, et le prochain « ouvrir » ne ferait rien.
      onCancel={(e) => {
        e.preventDefault();
        if (!enCours) onAnnuler();
      }}
      // Clic sur le fond. `e.target === d` ne vaut que pour le ::backdrop : tout
      // clic à l'intérieur a pour cible un descendant.
      onClick={(e) => {
        if (e.target === boite.current && !enCours) onAnnuler();
      }}
      className="max-w-lg rounded-2xl border border-blue-200 bg-white p-0 shadow-xl
                 backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 className="flex items-start gap-2 text-lg font-semibold text-blue-900">
          {danger && (
            <AlertTriangle
              size={20}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-red-700"
            />
          )}
          {titre}
        </h2>

        <div className="text-sm text-slate-700">{message}</div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            autoFocus
            disabled={enCours}
            onClick={onAnnuler}
            className={`${boutonSecondaire} disabled:opacity-40`}
          >
            {libelleAnnuler}
          </button>
          <button
            type="button"
            disabled={enCours}
            onClick={onConfirmer}
            className={`${danger ? boutonDanger : boutonPrimaire} disabled:opacity-40`}
          >
            {enCours ? "En cours…" : libelleConfirmer}
          </button>
        </div>
      </div>
    </dialog>
  );
}
