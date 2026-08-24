"use client";

import { useActionState, useMemo, useState } from "react";
import { UserPlus, AlertCircle, CheckCircle2, Copy, AlertTriangle } from "lucide-react";
import {
  actionCreerAdministrateur,
  type EtatAdministrateur,
} from "./actions";
import type { EmployeNommable } from "@/lib/data/administrateurs";
import AutocompleteInput from "@/components/AutocompleteInput";
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
 *
 * ── Le nom de l'employé, apparié au matricule dans les DEUX sens (24/08/2026) ─
 *
 * Le formulaire ne demandait qu'un matricule. Personne ne connaît par cœur le
 * matricule d'un collègue : il fallait ouvrir la liste du personnel dans un autre
 * onglet, chercher, recopier — et une seule faute de frappe donnait « Cet employé
 * est introuvable » sans dire lequel on visait.
 *
 * Les deux champs se remplissent donc l'un l'autre : choisir un nom pose le
 * matricule, saisir un matricule connu affiche le nom. Le matricule reste la
 * valeur ENVOYÉE — c'est la clé, le nom n'est qu'un moyen d'y arriver.
 *
 * ⚠️ Les deux champs restent **libres**. Un administrateur n'est pas forcément un
 * employé (prestataire, compte de service), et la liste ne contient que les
 * employés actifs sans compte : la fermer interdirait des cas légitimes. Le DAL
 * tranche, comme toujours.
 */
export default function FormulaireAdministrateur({
  validiteHeures,
  employes,
}: {
  validiteHeures: number;
  employes: EmployeNommable[];
}) {
  const [etat, action, enCours] = useActionState<EtatAdministrateur | undefined, FormData>(
    actionCreerAdministrateur,
    undefined
  );

  // Saisies contrôlées : c'est ce qui permet à chacune d'écrire dans l'autre.
  const [nom, setNom] = useState("");
  const [matricule, setMatricule] = useState("");
  const [email, setEmail] = useState("");

  // Index matricule → employé, construit une fois. Un `find` dans le rendu
  // parcourrait la liste à chaque frappe.
  const parMatricule = useMemo(
    () => new Map(employes.map((e) => [e.matricule, e])),
    [employes]
  );
  const parNom = useMemo(
    () => new Map(employes.map((e) => [e.nomComplet, e])),
    [employes]
  );

  const nomsProposes = useMemo(() => employes.map((e) => e.nomComplet), [employes]);

  /** L'employé désigné, s'il est reconnu. Sert au rappel affiché sous les champs. */
  const reconnu = parMatricule.get(matricule.trim().toUpperCase()) ?? null;

  /**
   * Le nom choisi pose le matricule, et l'adresse si la fiche en porte une.
   *
   * L'adresse n'écrase JAMAIS une saisie en cours : le fondateur peut vouloir un
   * autre courriel que celui noté sur la fiche, et la lui reprendre sous les doigts
   * serait la pire des serviabilités.
   */
  const choisirNom = (valeur: string) => {
    setNom(valeur);
    const employe = parNom.get(valeur);
    if (!employe) return;
    setMatricule(employe.matricule);
    if (!email && employe.emailContact) setEmail(employe.emailContact);
  };

  /** Le matricule saisi affiche le nom — le sens inverse, demandé explicitement. */
  const saisirMatricule = (valeur: string) => {
    const propre = valeur.toUpperCase();
    setMatricule(propre);
    const employe = parMatricule.get(propre.trim());
    if (employe) {
      setNom(employe.nomComplet);
      if (!email && employe.emailContact) setEmail(employe.emailContact);
    }
  };

  return (
    <section id="ajouter" className={`${carteClass} max-w-3xl scroll-mt-20`}>
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={255}
            placeholder="prenom.nom@edc.cm"
            className={`${inputClass} max-w-sm`}
          />
        </div>

        {/* ── L'employé : nom et matricule, appariés ─────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="nomEmploye" className="text-sm font-medium text-blue-900">
              Nom de l&apos;employé
            </label>
            {/* `AutocompleteInput` : le même composant que la création d'OM, donc
                le même comportement — la liste entière s'ouvre à chaque entrée
                dans le champ, sans avoir à effacer ce qui s'y trouve.
                Pas de `name` : ce champ ne part PAS au serveur, il ne sert qu'à
                trouver le matricule, qui est la clé. */}
            <AutocompleteInput
              value={nom}
              onChange={choisirNom}
              suggestions={nomsProposes}
              placeholder="NKOLO Jean Pierre"
            />
            <p className="text-xs text-slate-600">
              Employés actifs sans compte. Choisir un nom remplit le matricule.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="matricule" className="text-sm font-medium text-blue-900">
              Matricule
            </label>
            <input
              id="matricule"
              name="matricule"
              value={matricule}
              onChange={(e) => saisirMatricule(e.target.value)}
              maxLength={20}
              placeholder="22P582"
              aria-describedby="aide-matricule-admin"
              className={`${inputClass} font-mono`}
            />
            <p id="aide-matricule-admin" className="text-xs text-slate-600">
              Facultatif. À renseigner si cet administrateur est aussi un employé — c&apos;est
              ce qui relie son compte à ses propres missions et congés. À laisser vide pour
              un prestataire ou un compte de service.
            </p>
          </div>
        </div>

        {/* Le rappel de ce qui a été reconnu : sans lui, rien ne distingue un
            matricule apparié d'un matricule simplement tapé au hasard. */}
        {matricule.trim() !== "" && (
          <p
            className={`text-xs ${
              reconnu ? "text-blue-900" : "text-amber-800"
            }`}
          >
            {reconnu
              ? `Rattaché à ${reconnu.nomComplet}.`
              : "Ce matricule ne correspond à aucun employé actif sans compte. Il sera vérifié à la création."}
          </p>
        )}

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
