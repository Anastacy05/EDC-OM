"use client";

import { useActionState } from "react";
import { definirMotDePasse, type EtatFormulaire } from "@/lib/auth/actions";
import { inputClass, carteClass, legendClass } from "@/lib/styles";

/**
 * Formulaire de définition du mot de passe.
 *
 * Le jeton voyage dans un champ caché : l'action est un point d'entrée HTTP
 * indépendant de la page, elle doit donc le recevoir explicitement — et elle le
 * revérifie en base avant d'écrire quoi que ce soit.
 */
export default function FormulaireMotDePasse({
  jeton,
  email,
  reinitialisation,
}: {
  jeton: string;
  email: string;
  reinitialisation: boolean;
}) {
  const [etat, action, enCours] = useActionState<EtatFormulaire | undefined, FormData>(
    definirMotDePasse,
    undefined
  );

  return (
    <form action={action} className={`${carteClass} w-full max-w-md`} noValidate>
      <input type="hidden" name="jeton" value={jeton} />

      <p className="text-sm text-blue-900/80">
        Compte&nbsp;: <span className="font-semibold">{email}</span>
      </p>

      {/* Champ en lecture seule et non caché : les gestionnaires de mots de
          passe associent l'entrée qu'ils enregistrent à un identifiant présent
          dans le formulaire. Sans lui, le mot de passe serait mémorisé sans
          nom d'utilisateur. */}
      <input
        type="email"
        name="identifiant"
        value={email}
        readOnly
        autoComplete="username"
        aria-hidden="true"
        tabIndex={-1}
        className="hidden"
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="motDePasse" className={legendClass}>
          {reinitialisation ? "Nouveau mot de passe" : "Choisissez un mot de passe"}
        </label>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          // "new-password" : demande au navigateur de PROPOSER un mot de passe
          // fort plutôt que de remplir avec l'ancien.
          autoComplete="new-password"
          required
          minLength={12}
          className={inputClass}
          autoFocus
          aria-describedby="regle-mdp"
          aria-invalid={etat?.champs?.motDePasse ? true : undefined}
        />
        <p id="regle-mdp" className="text-xs text-blue-900/70">
          12 caractères minimum. Une phrase dont vous vous souvenez vaut mieux qu&apos;un mot
          court compliqué.
        </p>
        {etat?.champs?.motDePasse && (
          <p className="text-sm text-red-700">{etat.champs.motDePasse}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="confirmation" className={legendClass}>
          Confirmation
        </label>
        <input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
          aria-invalid={etat?.champs?.confirmation ? true : undefined}
        />
        {etat?.champs?.confirmation && (
          <p className="text-sm text-red-700">{etat.champs.confirmation}</p>
        )}
      </div>

      {etat?.erreur && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 border border-red-300 px-3 py-2 text-sm text-red-800"
        >
          {etat.erreur}
        </p>
      )}

      <button
        type="submit"
        disabled={enCours}
        className="mt-2 py-2 px-4 rounded-lg bg-blue-700 text-white shadow-md shadow-blue-950/20
                   hover:bg-blue-800 disabled:bg-blue-300 disabled:cursor-not-allowed
                   transition-colors duration-300"
      >
        {enCours ? "Enregistrement…" : "Enregistrer et se connecter"}
      </button>

      {reinitialisation && (
        <p className="text-xs text-amber-800">
          Enregistrer déconnectera vos autres appareils.
        </p>
      )}
    </form>
  );
}
