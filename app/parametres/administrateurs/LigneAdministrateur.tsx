"use client";

import { useActionState } from "react";
import {
  Crown,
  ShieldMinus,
  MailWarning,
  CircleSlash,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  actionRetrograderAdministrateur,
  type EtatAdministrateur,
} from "./actions";
import type { AdministrateurListe } from "@/lib/data/administrateurs";
import { boutonDanger, TAILLE_ICONE } from "@/lib/styles";

/**
 * Une ligne de la liste des administrateurs.
 *
 * Composant client parce qu'elle porte une action dont le résultat s'affiche
 * (`useActionState`). Un formulaire nu obligerait à lever pour signaler un refus,
 * ce qui remplacerait la page par la frontière d'erreur de Next.
 */
export default function LigneAdministrateur({
  admin,
  peutAgir,
}: {
  admin: AdministrateurListe;
  /** Vrai si l'utilisateur courant est le fondateur. */
  peutAgir: boolean;
}) {
  const [etat, action, enCours] = useActionState<EtatAdministrateur | undefined, FormData>(
    actionRetrograderAdministrateur,
    undefined
  );

  // Le fondateur ne se rétrograde pas (le CHECK en base l'interdit, et
  // l'application se verrouillerait), et personne ne se retire ses propres droits
  // — il n'y aurait plus moyen de les rétablir sans accès serveur.
  const retrogradable = peutAgir && !admin.estFondateur && !admin.estMoi;

  return (
    <li className="flex flex-col gap-3 px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all font-medium text-blue-900">{admin.email}</span>

            {admin.estFondateur && (
              // Icône ET mot : la couleur seule ne porte jamais une information.
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                <Crown size={12} aria-hidden="true" />
                Fondateur
              </span>
            )}

            {admin.estMoi && (
              <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-900">
                Vous
              </span>
            )}

            {!admin.actif && (
              <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">
                <CircleSlash size={12} aria-hidden="true" />
                Désactivé
              </span>
            )}

            {!admin.aDefiniSonMotDePasse && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                <MailWarning size={12} aria-hidden="true" />
                Invitation en attente
              </span>
            )}
          </div>

          <p className="text-xs text-slate-600">
            {admin.nomEmploye ? (
              <>
                {admin.nomEmploye} —{" "}
                <span className="font-mono">{admin.matricule}</span>
              </>
            ) : (
              // Le dire plutôt que de laisser un blanc : un administrateur sans
              // matricule est un cas prévu (prestataire, compte de service), pas
              // une donnée manquante.
              "Aucun employé rattaché"
            )}
            {" · "}
            {admin.derniereConnexion
              ? `Dernière connexion le ${new Date(admin.derniereConnexion).toLocaleString(
                  "fr-FR",
                  { dateStyle: "long", timeStyle: "short" }
                )}`
              : "Jamais connecté"}
          </p>
        </div>

        {retrogradable && (
          <form action={action}>
            <input type="hidden" name="id" value={admin.id} />
            <button
              type="submit"
              disabled={enCours}
              className={`${boutonDanger} text-xs`}
              title="Le compte reste actif comme utilisateur ; il perd seulement ses droits d'administration."
            >
              <ShieldMinus size={TAILLE_ICONE} aria-hidden="true" />
              {enCours ? "Retrait…" : "Retirer les droits"}
            </button>
          </form>
        )}
      </div>

      {etat?.erreur && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          <AlertCircle size={14} aria-hidden="true" className="mr-1 inline" />
          {etat.erreur}
        </p>
      )}

      {etat?.succes && (
        <p
          role="status"
          className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900"
        >
          <CheckCircle2 size={14} aria-hidden="true" className="mr-1 inline" />
          {etat.succes}
        </p>
      )}
    </li>
  );
}
