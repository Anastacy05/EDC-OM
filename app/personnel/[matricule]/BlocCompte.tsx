"use client";

import { useActionState } from "react";
import { Mail, Copy, KeyRound, AlertTriangle, CheckCircle2 } from "lucide-react";
import { actionEmettreInvitation, type EtatFormulaireEmploye } from "@/app/personnel/actions";
import type { EmployeFiche } from "@/lib/data/employes";
import {
  inputClass,
  carteClass,
  legendClass,
  boutonSecondaire,
  TAILLE_ICONE,
} from "@/lib/styles";

/**
 * Bloc « compte d'accès » de la fiche employé.
 *
 * ── État PROVISOIRE, et il faut le dire à l'écran ────────────────────────────
 *
 * Le lien de définition du mot de passe est **affiché** pour que
 * l'administrateur le transmette lui-même. L'envoi automatique attend le choix
 * du fournisseur (serveur SMTP de l'EDC, Resend ou Brevo — MODELE-DONNEES.md
 * §12).
 *
 * Ce n'est pas moins sûr que le courriel, qui circule aussi en clair sur le
 * réseau. Mais ça repose sur la discipline de l'administrateur, là où la file
 * `mail_en_attente` l'automatisera. L'avertissement à l'écran n'est donc pas
 * décoratif : il énonce une responsabilité qui lui incombe aujourd'hui.
 */
export default function BlocCompte({
  fiche,
  validiteHeures,
}: {
  fiche: EmployeFiche;
  validiteHeures: number;
}) {
  const [etat, action, enCours] = useActionState<EtatFormulaireEmploye | undefined, FormData>(
    actionEmettreInvitation,
    undefined
  );

  return (
    <section className={`${carteClass} max-w-3xl`}>
      <h2 className={legendClass}>Compte d&apos;accès à l&apos;application</h2>

      {fiche.compte ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="font-medium text-blue-900">Adresse</dt>
          <dd className="break-all text-blue-900/80">{fiche.compte.email}</dd>

          <dt className="font-medium text-blue-900">Rôle</dt>
          <dd className="text-blue-900/80">
            {fiche.compte.role === "ADMINISTRATEUR" ? "Administrateur" : "Utilisateur"}
          </dd>

          <dt className="font-medium text-blue-900">État</dt>
          <dd>
            {fiche.compte.aDefiniSonMotDePasse ? (
              <span className="inline-flex items-center gap-1 text-blue-900/80">
                <CheckCircle2 size={14} aria-hidden="true" />
                Mot de passe défini
              </span>
            ) : (
              /* Icône ET mot, jamais la couleur seule : l'écart rouge/vert tombe
                 à ΔE 4,7 en deutéranopie, sous le plancher de 6 (mesuré le
                 20/08/2026). */
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                <AlertTriangle size={14} aria-hidden="true" />
                Invitation en attente — le titulaire n&apos;a pas encore défini son mot de
                passe
              </span>
            )}
          </dd>

          <dt className="font-medium text-blue-900">Dernière connexion</dt>
          <dd className="text-blue-900/80">
            {fiche.compte.derniereConnexion
              ? new Date(fiche.compte.derniereConnexion).toLocaleString("fr-FR", {
                  dateStyle: "long",
                  timeStyle: "short",
                })
              : "Jamais"}
          </dd>
        </dl>
      ) : (
        <p className="text-sm text-blue-900/80">
          Aucun compte. Sans compte, cet employé peut figurer sur un ordre de mission mais
          ne peut pas se connecter.
        </p>
      )}

      {/* ── Émission du lien ───────────────────────────────────────────────── */}
      <form action={action} className="flex flex-col gap-3 border-t border-blue-100 pt-4">
        <input type="hidden" name="matricule" value={fiche.matricule} />

        {!fiche.compte && (
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-blue-900">
              Adresse professionnelle
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
        )}

        {/* Compte existant : l'adresse est reprise telle quelle. La changer
            demanderait de vérifier la nouvelle boîte, sinon on déplacerait un
            accès vers une adresse non prouvée. */}
        {fiche.compte && <input type="hidden" name="email" value={fiche.compte.email} />}

        <button
          type="submit"
          disabled={enCours || !fiche.actif}
          className={boutonSecondaire}
          title={
            fiche.actif
              ? undefined
              : "Employé désactivé : réactivez sa fiche avant de créer son compte."
          }
        >
          {fiche.compte ? (
            <KeyRound size={TAILLE_ICONE} aria-hidden="true" />
          ) : (
            <Mail size={TAILLE_ICONE} aria-hidden="true" />
          )}
          {enCours
            ? "Émission…"
            : fiche.compte
              ? "Émettre un nouveau lien de mot de passe"
              : "Créer le compte et émettre le lien"}
        </button>

        {fiche.compte && (
          <p className="text-xs text-amber-800">
            Émettre un nouveau lien invalide immédiatement les précédents.
          </p>
        )}

        {etat?.erreur && (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {etat.erreur}
          </p>
        )}

        {etat?.succes && !etat.lienInvitation && (
          <p role="status" className="text-sm text-green-800">
            {etat.succes}
          </p>
        )}
      </form>

      {etat?.lienInvitation && (
        <LienAafficher
          lien={etat.lienInvitation}
          message={etat.succes ?? ""}
          validiteHeures={validiteHeures}
        />
      )}
    </section>
  );
}

/**
 * Affiche le lien à transmettre.
 *
 * `readOnly` plutôt que `disabled` : un champ désactivé n'est pas sélectionnable,
 * donc le texte ne serait pas copiable à la main — or c'est précisément ce qu'on
 * demande à l'utilisateur.
 */
function LienAafficher({
  lien,
  message,
  validiteHeures,
}: {
  lien: string;
  message: string;
  validiteHeures: number;
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4"
    >
      <p className="text-sm font-medium text-amber-900">{message}</p>

      <p className="flex items-start gap-2 text-sm text-amber-900">
        <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          <strong>Ce lien vaut le mot de passe.</strong> Transmettez-le par un canal sûr. Il
          est à usage unique, valable {validiteHeures} heures, et{" "}
          <strong>ne sera plus affiché</strong> — s&apos;il est perdu, il faut en émettre un
          nouveau.
        </span>
      </p>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={lien}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Lien de définition du mot de passe"
          className={`${inputClass} font-mono text-xs`}
        />
        <BoutonCopier lien={lien} />
      </div>

      <p className="text-xs text-amber-800">
        L&apos;envoi automatique par courriel viendra quand le fournisseur d&apos;envoi
        sera choisi (MODELE-DONNEES.md §12).
      </p>
    </div>
  );
}

function BoutonCopier({ lien }: { lien: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        // `navigator.clipboard` exige un contexte sécurisé (HTTPS ou localhost).
        // En cas d'échec, on ne prétend pas avoir copié : le champ reste
        // sélectionnable à la main, ce qui est le repli.
        navigator.clipboard?.writeText(lien).catch(() => {});
      }}
      aria-label="Copier le lien"
      title="Copier le lien"
      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-amber-400
                 bg-white p-2 text-amber-900 transition-colors duration-200 hover:bg-amber-100
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
    >
      <Copy size={TAILLE_ICONE} aria-hidden="true" />
    </button>
  );
}
