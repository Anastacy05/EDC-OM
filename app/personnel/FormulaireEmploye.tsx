"use client";

import { useActionState, useState } from "react";
import { Save, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  actionCreerEmploye,
  actionModifierEmploye,
  type EtatFormulaireEmploye,
} from "@/app/personnel/actions";
import { SITUATIONS_FAMILLE } from "@/lib/data/employes.validation";
import type { EmployeFiche } from "@/lib/data/employes";
import type { OptionReferentiel } from "@/lib/referentiels";
import {
  inputClass,
  carteClass,
  legendClass,
  boutonPrimaire,
  TAILLE_ICONE,
} from "@/lib/styles";

/**
 * Message d'erreur d'un champ.
 *
 * ⚠️ Défini au niveau du MODULE et non dans le rendu. Je l'avais d'abord écrit
 * comme une fonction interne à `FormulaireEmploye`, ce que la règle
 * `react-hooks/static-components` a refusé — à juste titre : un composant
 * recréé à chaque rendu est une NOUVELLE identité de type pour React, qui
 * démonte et remonte le sous-arbre au lieu de le mettre à jour. On perdrait la
 * position du curseur et l'état des champs à chaque frappe.
 *
 * L'`id` est renvoyé pour être cité par `aria-describedby` : sans ce lien, un
 * lecteur d'écran annonce le champ comme invalide sans dire pourquoi.
 */
function MessageErreur({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-red-700">
      {message}
    </p>
  );
}

/**
 * Marque de champ obligatoire.
 *
 * L'astérisque est `aria-hidden` et doublée d'un texte pour lecteur d'écran :
 * seule, elle n'est qu'un symbole dont le sens repose sur une convention non
 * énoncée.
 */
function Requis() {
  return (
    <>
      <span aria-hidden="true" className="text-red-700">
        *
      </span>
      <span className="sr-only">(obligatoire)</span>
    </>
  );
}

/**
 * Formulaire employé, partagé par la création et la modification.
 *
 * Un seul composant pour les deux : les champs sont identiques, seule l'action
 * change. Les dupliquer garantirait qu'un champ ajouté un jour manque dans l'un
 * des deux — c'est la divergence la plus banale d'un CRUD.
 *
 * ── Ce qui reste côté serveur ────────────────────────────────────────────────
 *
 * Toute la validation. Celle d'ici (`required`, `min`, `max`) est du confort :
 * elle évite un aller-retour, mais un `<form>` soumis par un autre moyen la
 * contourne entièrement. C'est pourquoi `lib/data/employes.validation.ts` est
 * appelé dans l'action, et pourquoi la base porte les contraintes dures.
 */
export default function FormulaireEmploye({
  fiche,
  statuts,
  departements,
}: {
  /** Absent en création. */
  fiche?: EmployeFiche;
  statuts: OptionReferentiel[];
  departements: OptionReferentiel[];
}) {
  const modification = fiche !== undefined;

  const [etat, action, enCours] = useActionState<EtatFormulaireEmploye | undefined, FormData>(
    modification ? actionModifierEmploye : actionCreerEmploye,
    undefined
  );

  // Le champ « jours de congé d'origine » n'apparaît que pour un détaché
  // (art. 81-6). État local et non dérivé du formulaire : il doit réagir à la
  // case AVANT toute soumission.
  const [estDetache, setEstDetache] = useState(fiche?.estDetache ?? false);

  /** Message d'erreur d'un champ, ou `undefined`. */
  const err = (champ: keyof NonNullable<EtatFormulaireEmploye["champs"]>) =>
    etat?.champs?.[champ];

  /**
   * Attributs communs d'un champ en erreur.
   *
   * `aria-invalid` et `aria-describedby` liés au message : sans eux, un lecteur
   * d'écran annonce le champ sans dire pourquoi il est refusé.
   */
  const liaison = (champ: keyof NonNullable<EtatFormulaireEmploye["champs"]>) => ({
    "aria-invalid": err(champ) ? (true as const) : undefined,
    "aria-describedby": err(champ) ? `err-${champ}` : undefined,
    className: `${inputClass} ${err(champ) ? "border-red-500" : ""}`,
  });

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6" noValidate>
      {modification && <input type="hidden" name="matricule" value={fiche.matricule} />}

      {/* role="alert" : l'échec est annoncé sans que l'utilisateur ait à repartir
          en exploration de la page. */}
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

      {/* ── Identité ────────────────────────────────────────────────────────── */}
      <fieldset className={carteClass}>
        <legend className={legendClass}>Identité</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="matricule" className="text-sm font-medium text-blue-900">
              Matricule <Requis />
            </label>
            <input
              id="matricule"
              name={modification ? "matriculeAffiche" : "matricule"}
              defaultValue={fiche?.matricule}
              // Non modifiable après création : c'est la clé primaire, et les
              // participations aux ordres de mission y font référence. Un
              // matricule erroné se corrige en désactivant la fiche.
              readOnly={modification}
              required={!modification}
              maxLength={20}
              placeholder="22P582"
              className={`${liaison("matricule").className} font-mono ${
                modification ? "bg-slate-100 text-slate-600" : ""
              }`}
              aria-invalid={liaison("matricule")["aria-invalid"]}
              aria-describedby={
                modification ? "aide-matricule" : liaison("matricule")["aria-describedby"]
              }
            />
            {modification ? (
              <p id="aide-matricule" className="text-xs text-slate-600">
                Non modifiable : l&apos;historique des missions y fait référence.
              </p>
            ) : (
              <MessageErreur id="err-matricule" message={err("matricule")} />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="situationFamille" className="text-sm font-medium text-blue-900">
              Situation de famille <Requis />
            </label>
            <select
              id="situationFamille"
              name="situationFamille"
              defaultValue={fiche?.situationFamille ?? ""}
              required
              {...liaison("situationFamille")}
            >
              <option value="">—</option>
              {SITUATIONS_FAMILLE.map((s) => (
                <option key={s.valeur} value={s.valeur}>
                  {s.libelle}
                </option>
              ))}
            </select>
            <MessageErreur id="err-situationFamille" message={err("situationFamille")} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="nom" className="text-sm font-medium text-blue-900">
              Nom <Requis />
            </label>
            <input
              id="nom"
              name="nom"
              defaultValue={fiche?.nom}
              required
              maxLength={100}
              // `characters` et non `words` : les noms de famille camerounais
              // composés (« NKOLO ATANGANA ») sont saisis en majuscules
              // intégrales dans les états du personnel.
              autoCapitalize="characters"
              {...liaison("nom")}
            />
            <MessageErreur id="err-nom" message={err("nom")} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="prenoms" className="text-sm font-medium text-blue-900">
              Prénoms <Requis />
            </label>
            <input
              id="prenoms"
              name="prenoms"
              defaultValue={fiche?.prenoms}
              required
              maxLength={150}
              {...liaison("prenoms")}
            />
            <MessageErreur id="err-prenoms" message={err("prenoms")} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="dateNaissance" className="text-sm font-medium text-blue-900">
              Date de naissance <Requis />
            </label>
            <input
              id="dateNaissance"
              name="dateNaissance"
              type="date"
              defaultValue={fiche?.dateNaissance}
              required
              {...liaison("dateNaissance")}
            />
            <p className="text-xs text-slate-600">
              Sert à la règle de départ en retraite (âge réglé dans Paramètres).
            </p>
            <MessageErreur id="err-dateNaissance" message={err("dateNaissance")} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="dateEmbauche" className="text-sm font-medium text-blue-900">
              Date d&apos;embauche <Requis />
            </label>
            <input
              id="dateEmbauche"
              name="dateEmbauche"
              type="date"
              defaultValue={fiche?.dateEmbauche}
              required
              {...liaison("dateEmbauche")}
            />
            <p className="text-xs text-slate-600">Base du calcul des congés (art. 80).</p>
            <MessageErreur id="err-dateEmbauche" message={err("dateEmbauche")} />
          </div>
        </div>
      </fieldset>

      {/* ── Position ────────────────────────────────────────────────────────── */}
      <fieldset className={carteClass}>
        <legend className={legendClass}>Position dans l&apos;entreprise</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="codeStatut" className="text-sm font-medium text-blue-900">
              Statut <Requis />
            </label>
            <select
              id="codeStatut"
              name="codeStatut"
              defaultValue={fiche?.codeStatut ?? ""}
              required
              {...liaison("codeStatut")}
            >
              <option value="">—</option>
              {statuts.map((s) => (
                <option key={s.valeur} value={s.valeur}>
                  {s.libelle}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-600">
              Détermine l&apos;indemnité journalière de mission, avec la zone de
              destination.
            </p>
            <MessageErreur id="err-codeStatut" message={err("codeStatut")} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="codeDepartement" className="text-sm font-medium text-blue-900">
              Direction <Requis />
            </label>
            <select
              id="codeDepartement"
              name="codeDepartement"
              defaultValue={fiche?.codeDepartement ?? ""}
              required
              {...liaison("codeDepartement")}
            >
              <option value="">—</option>
              {departements.map((d) => (
                <option key={d.valeur} value={d.valeur}>
                  {d.libelle}
                </option>
              ))}
            </select>
            <MessageErreur id="err-codeDepartement" message={err("codeDepartement")} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="grade" className="text-sm font-medium text-blue-900">
              Grade <Requis />
            </label>
            <input
              id="grade"
              name="grade"
              defaultValue={fiche?.grade}
              required
              maxLength={100}
              placeholder="Ingénieur"
              {...liaison("grade")}
            />
            <p className="text-xs text-slate-600">
              Titre statutaire attaché à la personne, lié à l&apos;indice.
            </p>
            <MessageErreur id="err-grade" message={err("grade")} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="indice" className="text-sm font-medium text-blue-900">
              Indice
            </label>
            <input
              id="indice"
              name="indice"
              defaultValue={fiche?.indice ?? ""}
              maxLength={10}
              {...liaison("indice")}
            />
            <MessageErreur id="err-indice" message={err("indice")} />
          </div>

          <div className="flex flex-col gap-1 sm:col-span-2">
            <label htmlFor="fonction" className="text-sm font-medium text-blue-900">
              Fonction <Requis />
            </label>
            <input
              id="fonction"
              name="fonction"
              defaultValue={fiche?.fonction}
              required
              maxLength={200}
              placeholder="SOUS-DIRECTEUR DU BUDGET ET DU CONTRÔLE DE GESTION"
              {...liaison("fonction")}
            />
            <p className="text-xs text-slate-600">
              Emploi précis dans l&apos;organigramme. Texte libre : ce n&apos;est pas une
              liste fermée.
            </p>
            <MessageErreur id="err-fonction" message={err("fonction")} />
          </div>
        </div>
      </fieldset>

      {/* ── Congés ──────────────────────────────────────────────────────────── */}
      <fieldset className={carteClass}>
        <legend className={legendClass}>Droits à congé</legend>

        <div className="flex flex-col gap-1">
          <label htmlFor="nombreMedailles" className="text-sm font-medium text-blue-900">
            Médailles d&apos;Honneur du Travail
          </label>
          <input
            id="nombreMedailles"
            name="nombreMedailles"
            type="number"
            min={0}
            max={10}
            step={1}
            defaultValue={fiche?.nombreMedailles ?? 0}
            className={`${liaison("nombreMedailles").className} w-32`}
            aria-invalid={liaison("nombreMedailles")["aria-invalid"]}
            aria-describedby={liaison("nombreMedailles")["aria-describedby"]}
          />
          <p className="text-xs text-slate-600">
            Art. 81-5 : un jour de congé supplémentaire par médaille.
          </p>
          <MessageErreur id="err-nombreMedailles" message={err("nombreMedailles")} />
        </div>

        <label className="flex items-center gap-2 text-sm text-blue-900">
          <input
            type="checkbox"
            name="estDetache"
            checked={estDetache}
            onChange={(e) => setEstDetache(e.target.checked)}
            className="h-4 w-4 rounded border-blue-500"
          />
          Fonctionnaire détaché
        </label>

        {/* Rendu conditionnellement : un champ visible mais sans objet invite à
            le remplir à tort. La contrainte de base
            `CHECK (NOT est_detache OR jours_conge_origine IS NOT NULL)` garantit
            de toute façon la cohérence. */}
        {estDetache && (
          <div className="flex flex-col gap-1">
            <label htmlFor="joursCongeOrigine" className="text-sm font-medium text-blue-900">
              Droit à congé de l&apos;administration d&apos;origine <Requis />
            </label>
            <input
              id="joursCongeOrigine"
              name="joursCongeOrigine"
              type="number"
              min={0}
              max={365}
              step={0.5}
              defaultValue={fiche?.joursCongeOrigine ?? ""}
              required
              className={`${liaison("joursCongeOrigine").className} w-32`}
              aria-invalid={liaison("joursCongeOrigine")["aria-invalid"]}
              aria-describedby={liaison("joursCongeOrigine")["aria-describedby"]}
            />
            <p className="text-xs text-slate-600">
              Art. 81-6 : le détaché conserve au moins ce droit. Obligatoire, sinon la
              règle est incalculable.
            </p>
            <MessageErreur id="err-joursCongeOrigine" message={err("joursCongeOrigine")} />
          </div>
        )}
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={enCours} className={boutonPrimaire}>
          <Save size={TAILLE_ICONE} aria-hidden="true" />
          {enCours
            ? "Enregistrement…"
            : modification
              ? "Enregistrer les modifications"
              : "Créer l'employé"}
        </button>
      </div>
    </form>
  );
}
