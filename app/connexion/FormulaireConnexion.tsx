"use client";

import { useActionState } from "react";
import { connecter, type EtatFormulaire } from "@/lib/auth/actions";
import { inputClass, carteClass, legendClass } from "@/lib/styles";

/**
 * Formulaire de connexion.
 *
 * Composant client uniquement pour `useActionState`, qui donne trois choses que
 * l'on n'aurait pas avec un `<form action={connecter}>` nu : les messages
 * d'erreur renvoyés par le serveur, l'état « en cours » pour désactiver le
 * bouton, et la conservation des valeurs saisies après un échec.
 *
 * L'action, elle, reste sur le serveur : le mot de passe n'est jamais manipulé
 * par du JavaScript de navigateur.
 */
export default function FormulaireConnexion({ retour }: { retour: string }) {
  const [etat, action, enCours] = useActionState<EtatFormulaire | undefined, FormData>(
    connecter,
    undefined
  );

  return (
    <form action={action} className={`${carteClass} w-full max-w-md`} noValidate>
      {/* Le chemin de retour voyage dans le formulaire plutôt que dans l'URL de
          l'action : il survit ainsi à un échec de saisie sans que la page ait à
          relire ses paramètres. Il est revalidé côté serveur. */}
      <input type="hidden" name="retour" value={retour} />

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className={legendClass}>
          Adresse professionnelle
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          // autoFocus : la connexion est le seul contenu de la page, le curseur
          // n'a aucune autre destination plausible.
          autoFocus
          required
          placeholder="prenom.nom@edc.cm"
          className={inputClass}
          aria-describedby={etat?.champs?.email ? "erreur-email" : undefined}
          aria-invalid={etat?.champs?.email ? true : undefined}
        />
        {etat?.champs?.email && (
          <p id="erreur-email" className="text-sm text-red-700">
            {etat.champs.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="motDePasse" className={legendClass}>
          Mot de passe
        </label>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          // "current-password" (et non "password") : c'est ce qui déclenche le
          // remplissage par le gestionnaire de mots de passe du navigateur, au
          // lieu d'une proposition de nouveau mot de passe.
          autoComplete="current-password"
          required
          className={inputClass}
          aria-describedby={etat?.champs?.motDePasse ? "erreur-mdp" : undefined}
          aria-invalid={etat?.champs?.motDePasse ? true : undefined}
        />
        {etat?.champs?.motDePasse && (
          <p id="erreur-mdp" className="text-sm text-red-700">
            {etat.champs.motDePasse}
          </p>
        )}
      </div>

      {/* role="alert" : un lecteur d'écran annonce l'échec sans que
          l'utilisateur ait à repartir en exploration de la page. */}
      {etat?.erreur && (
        <p role="alert" className="rounded-lg bg-red-50 border border-red-300 px-3 py-2 text-sm text-red-800">
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
        {enCours ? "Vérification…" : "Se connecter"}
      </button>

      <p className="text-sm text-blue-900/70">
        Mot de passe oublié ou premier accès ? Adressez-vous à l&apos;administrateur, qui vous
        enverra un lien de définition.
      </p>
    </form>
  );
}
