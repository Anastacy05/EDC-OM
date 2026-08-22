"use client";

import { useActionState } from "react";
import { UserPlus, AlertCircle, CheckCircle2, Copy, AlertTriangle } from "lucide-react";
import {
  actionCreerAdministrateur,
  type EtatAdministrateur,
} from "./actions";
import {
  inputClass,
  carteClass,
  legendClass,
  boutonPrimaire,
  TAILLE_ICONE,
} from "@/lib/styles";

/**
 * Formulaire de création d'un administrateur. Rendu seulement au fondateur.
 *
 * Le lien d'invitation n'apparaît qu'en REPLI, si le courriel n'a pas pu partir —
 * même règle que pour l'invitation d'un employé : quand l'envoi réussit, afficher
 * le lien le ferait exister dans un second endroit sans aucun bénéfice.
 */
export default function FormulaireAdministrateur({
  validiteHeures,
}: {
  validiteHeures: number;
}) {
  const [etat, action, enCours] = useActionState<EtatAdministrateur | undefined, FormData>(
    actionCreerAdministrateur,
    undefined
  );

  return (
    <section className={`${carteClass} max-w-3xl`}>
      <h2 className={legendClass}>Ajouter un administrateur</h2>

      {etat?.erreur && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          {etat.erreur}
        </p>
      )}

      {etat?.succes && !etat.lienInvitation && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900"
        >
          <CheckCircle2 size={18} aria-hidden="true" className="shrink-0" />
          {etat.succes}
        </p>
      )}

      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium text-blue-900">
            Adresse professionnelle{" "}
            <span aria-hidden="true" className="text-red-700">
              *
            </span>
            <span className="sr-only">(obligatoire)</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="prenom.nom@edc.cm"
            className={`${inputClass} max-w-sm`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="matricule" className="text-sm font-medium text-blue-900">
            Matricule
          </label>
          <input
            id="matricule"
            name="matricule"
            maxLength={20}
            placeholder="22P582"
            aria-describedby="aide-matricule-admin"
            className={`${inputClass} max-w-xs font-mono`}
          />
          <p id="aide-matricule-admin" className="text-xs text-slate-600">
            Facultatif. À renseigner si cet administrateur est aussi un employé — c&apos;est
            ce qui relie son compte à ses propres missions et congés. À laisser vide pour
            un prestataire ou un compte de service.
          </p>
        </div>

        <button type="submit" disabled={enCours} className={`${boutonPrimaire} self-start`}>
          <UserPlus size={TAILLE_ICONE} aria-hidden="true" />
          {enCours ? "Création…" : "Créer et envoyer l'invitation"}
        </button>

        {enCours && (
          <p role="status" className="text-xs text-blue-900/70">
            Le courriel est en cours de remise au serveur d&apos;envoi.
          </p>
        )}
      </form>

      {etat?.lienInvitation && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4"
        >
          <p className="text-sm font-medium text-amber-900">{etat.succes}</p>

          <p className="flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              <strong>Ce lien vaut le mot de passe d&apos;un administrateur.</strong>{" "}
              Transmettez-le par un canal sûr. Il est à usage unique, valable{" "}
              {validiteHeures} heures, et <strong>ne sera plus affiché</strong>.
            </span>
          </p>

          <div className="flex items-center gap-2">
            {/* `readOnly` et non `disabled` : un champ désactivé n'est pas
                sélectionnable, donc son texte ne serait pas copiable à la main —
                or c'est précisément ce qu'on demande. */}
            <input
              type="text"
              value={etat.lienInvitation}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Lien de définition du mot de passe"
              className={`${inputClass} font-mono text-xs`}
            />
            <button
              type="button"
              onClick={() => {
                // `navigator.clipboard` exige un contexte sécurisé (HTTPS ou
                // localhost). En cas d'échec on ne prétend pas avoir copié : le
                // champ reste sélectionnable, ce qui est le repli.
                navigator.clipboard?.writeText(etat.lienInvitation!).catch(() => {});
              }}
              aria-label="Copier le lien"
              title="Copier le lien"
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-amber-400
                         bg-white p-2 text-amber-900 transition-colors duration-200 hover:bg-amber-100
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            >
              <Copy size={TAILLE_ICONE} aria-hidden="true" />
            </button>
          </div>

          <p className="text-xs text-amber-800">
            Le message reste en file d&apos;attente : s&apos;il finit par partir, le
            titulaire recevra ce même lien. Le transmettre vous-même ne crée donc pas de
            doublon.
          </p>
        </div>
      )}
    </section>
  );
}
