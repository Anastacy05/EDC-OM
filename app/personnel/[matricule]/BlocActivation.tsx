"use client";

import { useActionState, useState } from "react";
import { CircleSlash, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  actionDesactiverEmploye,
  actionReactiverEmploye,
  type EtatFormulaireEmploye,
} from "@/app/personnel/actions";
import {
  MOTIFS_SORTIE,
  LONGUEUR_NOTE_SORTIE,
  libelleMotifSortie,
} from "@/lib/data/employes.validation";
import type { EmployeFiche } from "@/lib/data/employes";
import {
  inputClass,
  carteClass,
  legendClass,
  boutonDanger,
  boutonSecondaire,
  TAILLE_ICONE,
} from "@/lib/styles";

/**
 * Bloc « activation » de la fiche employé : désactivation motivée, réactivation.
 *
 * ── Pourquoi ce bloc est devenu client (22/08/2026) ──────────────────────────
 *
 * Il était deux `<form>` nus dans un composant serveur. Le motif de sortie change
 * ça pour deux raisons :
 *
 *   1. la note n'a de sens qu'accompagnée d'un motif, donc le champ n'apparaît
 *      qu'une fois un motif choisi — ce qui exige un état local ;
 *   2. le motif est validé, donc un refus doit s'afficher. Avec un formulaire nu,
 *      la seule façon de signaler une erreur était de lever, ce qui remplace la
 *      page par la frontière d'erreur de Next et fait perdre le contexte.
 */
export default function BlocActivation({ fiche }: { fiche: EmployeFiche }) {
  const [etat, action, enCours] = useActionState<EtatFormulaireEmploye | undefined, FormData>(
    fiche.actif ? actionDesactiverEmploye : actionReactiverEmploye,
    undefined
  );

  return (
    <section className={`${carteClass} max-w-3xl`}>
      <h2 className={legendClass}>
        {fiche.actif ? "Désactiver cet employé" : "Réactiver cet employé"}
      </h2>

      {/* Ce qu'on sait du départ, affiché AVANT les actions : c'est le contexte
          dont l'administrateur a besoin pour décider. */}
      {!fiche.actif && <RappelSortie fiche={fiche} />}

      {etat?.erreur && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          {etat.erreur}
        </p>
      )}

      {etat?.succes && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900"
        >
          <CheckCircle2 size={18} aria-hidden="true" className="shrink-0" />
          {etat.succes}
        </p>
      )}

      {fiche.actif ? (
        <FormulaireDesactivation fiche={fiche} action={action} enCours={enCours} />
      ) : (
        <>
          <p className="text-sm text-blue-900/80">
            La réactivation rend l&apos;accès au compte tel qu&apos;il était.{" "}
            <strong>Le mot de passe n&apos;est pas réinitialisé</strong> — émettez un
            nouveau lien ci-dessus si le compte doit repartir de zéro.
          </p>
          <p className="text-sm text-blue-900/80">
            Le motif de sortie sera effacé : un employé revenu n&apos;en a plus.
          </p>
          <form action={action}>
            <input type="hidden" name="matricule" value={fiche.matricule} />
            <button type="submit" disabled={enCours} className={boutonSecondaire}>
              <RotateCcw size={TAILLE_ICONE} aria-hidden="true" />
              {enCours ? "Réactivation…" : "Réactiver"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

/**
 * Rappelle les circonstances du départ.
 *
 * C'est la raison d'être de la colonne : `actif = false` ne disait pas si la
 * personne est retraitée, suspendue ou décédée — or on n'écrit pas à une famille
 * endeuillée comme on écrit à un retraité.
 */
function RappelSortie({ fiche }: { fiche: EmployeFiche }) {
  const libelle = libelleMotifSortie(fiche.motifSortie);

  return (
    <dl className="grid gap-2 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
      <dt className="font-medium text-blue-900">Désactivé le</dt>
      <dd className="text-blue-900/80">
        {fiche.desactiveLe
          ? new Date(fiche.desactiveLe).toLocaleString("fr-FR", {
              dateStyle: "long",
              timeStyle: "short",
            })
          : "Date inconnue"}
      </dd>

      <dt className="font-medium text-blue-900">Motif</dt>
      <dd className="text-blue-900/80">
        {libelle ?? (
          // Dire que l'information manque, plutôt que de laisser une case vide :
          // le motif est facultatif, donc son absence est un cas normal — mais
          // elle doit se lire comme telle et non comme un défaut d'affichage.
          <span className="text-slate-500">Non renseigné</span>
        )}
      </dd>

      {fiche.noteSortie && (
        <>
          <dt className="font-medium text-blue-900">Précision</dt>
          {/* `whitespace-pre-line` : la note est un texte libre, ses retours à la
              ligne font partie de ce qui a été écrit. */}
          <dd className="whitespace-pre-line text-blue-900/80">{fiche.noteSortie}</dd>
        </>
      )}
    </dl>
  );
}

function FormulaireDesactivation({
  fiche,
  action,
  enCours,
}: {
  fiche: EmployeFiche;
  action: (formData: FormData) => void;
  enCours: boolean;
}) {
  // État local : le champ de précision doit apparaître dès le choix du motif,
  // donc AVANT toute soumission.
  const [motif, setMotif] = useState("");

  return (
    <>
      <p className="text-sm text-blue-900/80">
        La fiche n&apos;est <strong>jamais supprimée</strong> : les ordres de mission déjà
        signés y font référence, et un OM signé par le Directeur général reste un acte
        d&apos;autorité même après un départ.
      </p>
      <p className="text-sm text-blue-900/80">
        La désactivation ferme immédiatement l&apos;accès : le compte est désactivé, les
        sessions en cours sont révoquées, et les invitations non utilisées sont annulées.
      </p>

      {/* `<form>` et non `onClick` : c'est une mutation serveur. En POST, elle
          n'est pas déclenchable par une simple balise <img> pointant sur une URL,
          ce qui serait le cas d'un GET. */}
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="matricule" value={fiche.matricule} />

        <div className="flex flex-col gap-1">
          <label htmlFor="motifSortie" className="text-sm font-medium text-blue-900">
            Motif de sortie
          </label>
          <select
            id="motifSortie"
            name="motifSortie"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            aria-describedby="aide-motif"
            className={`${inputClass} max-w-md`}
          >
            {/* Aucune valeur par défaut imposée : « Non renseigné » est un choix
                légitime, et présélectionner « Retraite » ferait enregistrer une
                information fausse par simple inattention. */}
            <option value="">Non renseigné</option>
            {MOTIFS_SORTIE.map((m) => (
              <option key={m.valeur} value={m.valeur}>
                {m.libelle}
              </option>
            ))}
          </select>
          <p id="aide-motif" className="text-xs text-slate-600">
            Facultatif — une désactivation urgente ne doit pas attendre. Mais sans lui,
            rien ne distinguera plus tard une retraite d&apos;une suspension ou d&apos;un
            décès.
          </p>
        </div>

        {/* Le champ n'apparaît qu'accompagné d'un motif : une précision seule ne
            se rattache à rien, et l'action la refuse. */}
        {motif !== "" && (
          <div className="flex flex-col gap-1">
            <label htmlFor="noteSortie" className="text-sm font-medium text-blue-900">
              Précision
            </label>
            <textarea
              id="noteSortie"
              name="noteSortie"
              rows={3}
              maxLength={LONGUEUR_NOTE_SORTIE}
              placeholder={
                motif === "DETACHEMENT"
                  ? "Administration d'accueil, durée prévue…"
                  : motif === "SUSPENSION"
                    ? "Durée, date de retour attendue…"
                    : "Information utile pour la suite du dossier"
              }
              className={`${inputClass} max-w-md`}
            />
            <p className="text-xs text-slate-600">
              {LONGUEUR_NOTE_SORTIE} caractères maximum.
            </p>
          </div>
        )}

        <button type="submit" disabled={enCours} className={`${boutonDanger} self-start`}>
          <CircleSlash size={TAILLE_ICONE} aria-hidden="true" />
          {enCours ? "Désactivation…" : "Désactiver"}
        </button>
      </form>
    </>
  );
}
