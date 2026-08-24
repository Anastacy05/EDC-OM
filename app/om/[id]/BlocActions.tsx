"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, XCircle } from "lucide-react";
import {
  actionConfirmerOM,
  actionAnnulerOM,
  actionRefuserOM,
  type EtatFormulaireOM,
} from "@/app/om/actions";
import { boutonPrimaire, boutonSecondaire, boutonDanger, inputClass } from "@/lib/styles";
import BoutonConfirme from "@/components/BoutonConfirme";

/**
 * Actions d'une participation : confirmer, annuler, refuser.
 *
 * ── Pourquoi un composant client, et lui seul ────────────────────────────────
 *
 * La page de détail est SERVEUR : elle lit la base et n'a besoin d'aucun état.
 * Seul ce bloc est client, parce que `useActionState` doit afficher le retour de
 * l'action sans recharger la page. C'est le même découpage que `BlocActivation`
 * sur la fiche employé.
 *
 * ── Ce que ça remplace : `alert()` et `confirm()` ────────────────────────────
 *
 * L'écran précédent posait ses questions avec les boîtes natives du navigateur.
 * Trois défauts concrets :
 *
 *   1. `confirm()` **bloque le fil d'exécution** et n'est pas stylable — sur
 *      certains navigateurs mobiles il ne s'affiche même pas ;
 *   2. le message de conflit n'était qu'un texte jeté : impossible de cliquer vers
 *      l'OM concurrent, alors que c'est exactement ce que l'administrateur veut
 *      faire pour arbitrer ;
 *   3. la vérification qui précédait l'`alert()` se faisait **côté navigateur**
 *      contre `localStorage`. Elle ne voyait donc pas les OM des autres postes.
 *
 * Le conflit est maintenant détecté par le serveur, dans la même transaction que
 * l'écriture, et rendu ici comme du contenu.
 *
 * ── La question est revenue, mais rendue (24/08/2026) ────────────────────────
 *
 * Supprimer `confirm()` avait supprimé la question avec lui : les trois
 * transitions partaient au premier clic. Or elles sont peu réversibles — une
 * confirmation engage l'agent et bloque les missions concurrentes, un refus est
 * motivé et visible par lui. `BoutonConfirme` repose donc la question, dans un
 * `<dialog>` : piège de focus, inertie de la page, et annonce correcte, ce
 * qu'aucune des trois n'avait avec la boîte native.
 */
export default function BlocActions({
  idOM,
  matricule,
  statut,
  bloque,
  /** Vrai si la participation est expirée : la confirmation devient régularisation. */
  expire,
}: {
  idOM: string;
  matricule: string;
  statut: string;
  bloque: boolean;
  expire: boolean;
}) {
  const [etatConfirmer, confirmer, confirmationEnCours] = useActionState(
    actionConfirmerOM,
    undefined as EtatFormulaireOM | undefined
  );
  const [etatAnnuler, annuler, annulationEnCours] = useActionState(
    actionAnnulerOM,
    undefined as EtatFormulaireOM | undefined
  );
  const [etatRefuser, refuser, refusEnCours] = useActionState(
    actionRefuserOM,
    undefined as EtatFormulaireOM | undefined
  );

  // Les transitions autorisées, alignées sur le DAL. Les répéter ici n'est pas
  // une duplication de la règle : c'est ce qui permet de DÉSACTIVER un bouton
  // plutôt que de laisser cliquer pour obtenir un refus. Le DAL reste l'autorité.
  const confirmable = (statut === "EN_ATTENTE" || statut === "EXPIRE") && !bloque;
  const annulable = ["EN_ATTENTE", "CONFIRME", "EXPIRE"].includes(statut);
  const refusable = statut === "EN_ATTENTE";

  const etats = [etatConfirmer, etatAnnuler, etatRefuser].filter(Boolean) as EtatFormulaireOM[];
  const erreur = etats.find((e) => e.erreur)?.erreur;
  const succes = etats.find((e) => e.succes)?.succes;

  return (
    <div className="flex flex-col gap-4">
      {/* Le blocage AVANT les boutons : sans cette explication, un bouton
          « Confirmer » grisé n'a aucune raison apparente. */}
      {bloque && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p>
            <strong>Confirmation impossible.</strong> Cette participation est en conflit
            de période avec une mission déjà confirmée. Annulez l&apos;une des deux, ou
            corrigez les dates. Le document reste téléchargeable — il ne doit pas partir
            à la signature en l&apos;état.
          </p>
        </div>
      )}

      {erreur && (
        // `role="alert"` : sans lui, un message apparu après coup n'est pas annoncé
        // par un lecteur d'écran, et l'utilisateur croit que rien ne s'est passé.
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-2 text-sm text-red-900">
          {erreur}
        </p>
      )}
      {succes && (
        <p role="status" className="rounded-lg bg-green-100 px-4 py-2 text-sm text-green-900">
          {succes}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-3">
        {/* Un formulaire par action : une Server Action est liée à SON formulaire,
            et grouper les trois enverrait les champs des autres à chaque fois —
            dont le motif de refus lors d'une simple confirmation. */}
        <form action={confirmer} className="flex flex-col gap-2">
          <input type="hidden" name="idOM" value={idOM} />
          <input type="hidden" name="matricule" value={matricule} />

          {/* Régularisation : le motif n'apparaît QUE pour un OM expiré. Le
              proposer partout inviterait à le remplir sans objet, et il sert
              précisément à expliquer pourquoi on confirme après la date. */}
          {expire && (
            <label className="flex flex-col gap-1 text-xs text-amber-700">
              Motif de régularisation (facultatif)
              <input
                type="text"
                name="regularisationMotif"
                maxLength={500}
                placeholder="Ex. : mission effectuée, confirmation oubliée"
                className={`${inputClass} w-80`}
              />
            </label>
          )}

          <BoutonConfirme
            titre={expire ? "Régulariser cette participation ?" : "Confirmer cette participation ?"}
            message={
              expire
                ? "La mission est déjà passée : vous enregistrez après coup que le document a bien été signé. La participation repassera en « Confirmé »."
                : "Vous enregistrez que l'ordre de mission est signé. L'agent est dès lors engagé sur ces dates, et toute autre mission qui les recouvre sera bloquée."
            }
            libelleConfirmer={expire ? "Régulariser" : "Confirmer"}
            disabled={!confirmable}
            enCours={confirmationEnCours}
            className={`${boutonPrimaire} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <CheckCircle2 size={18} aria-hidden="true" />
            {confirmationEnCours
              ? "Enregistrement…"
              : expire
                ? "Régulariser (confirmer après péremption)"
                : "Confirmer"}
          </BoutonConfirme>
        </form>

        <form action={annuler}>
          <input type="hidden" name="idOM" value={idOM} />
          <input type="hidden" name="matricule" value={matricule} />
          <BoutonConfirme
            titre="Annuler cette participation ?"
            message="La participation passera en « Annulé » et ne comptera plus dans les conflits de période. Le document restera téléchargeable, avec la mention « ANNULÉ » — c'est une trace, pas une suppression."
            libelleConfirmer="Annuler la participation"
            danger
            disabled={!annulable}
            enCours={annulationEnCours}
            className={`${boutonSecondaire} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <CircleSlash size={18} aria-hidden="true" />
            {annulationEnCours ? "Annulation…" : "Annuler"}
          </BoutonConfirme>
        </form>
      </div>

      {/* Le refus est séparé et porte son champ : la contrainte
          `part_refuse_motive` exige un motif, et un refus sans raison serait un
          effacement déguisé — c'est justement ce que REFUSE remplace. */}
      {refusable && (
        <form action={refuser} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="idOM" value={idOM} />
          <input type="hidden" name="matricule" value={matricule} />
          <label className="flex flex-col gap-1 text-xs text-amber-700">
            Motif du refus (obligatoire)
            <input
              type="text"
              name="refuseMotif"
              required
              maxLength={500}
              placeholder="Ex. : mission reportée par la direction"
              className={`${inputClass} w-80`}
            />
          </label>
          <BoutonConfirme
            titre="Refuser cet ordre de mission ?"
            message="Le refus écarte la participation avant toute confirmation, et le motif saisi sera visible par l'agent. Le document restera téléchargeable avec la mention « REFUSÉ — SANS VALEUR »."
            libelleConfirmer="Refuser"
            danger
            enCours={refusEnCours}
            className={`${boutonDanger} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <XCircle size={18} aria-hidden="true" />
            {refusEnCours ? "Refus…" : "Refuser"}
          </BoutonConfirme>
        </form>
      )}
    </div>
  );
}
