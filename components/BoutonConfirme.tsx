"use client";

import { useRef, useState } from "react";
import Confirmation from "@/components/Confirmation";

/**
 * Bouton de soumission qui pose une question avant d'envoyer.
 *
 * ── Pourquoi un composant plutôt qu'un `onSubmit` sur chaque formulaire ──────
 *
 * Les gestes à confirmer sont portés par des `<form action={serverAction}>` :
 * confirmer un ordre de mission, l'annuler, le refuser, désactiver un employé,
 * rétrograder un administrateur. Intercepter la soumission dans chacun d'eux
 * voudrait dire recopier six fois le même état local, la même boîte et le même
 * enchaînement — dont la partie subtile ci-dessous.
 *
 * ── Le point délicat : `requestSubmit`, pas `submit` ────────────────────────
 *
 * ⚠️ `form.submit()` **ne déclenche pas** l'évènement `submit`. Or c'est cet
 * évènement que React intercepte pour appeler la Server Action : avec `submit()`,
 * le navigateur enverrait une requête HTML classique vers l'URL de la page, la
 * Server Action ne serait jamais appelée, et l'utilisateur verrait un rechargement
 * sans effet. `requestSubmit()` émet l'évènement, donc passe par React.
 *
 * On garde le bouton en `type="button"` : un `type="submit"` enverrait le
 * formulaire au premier clic, avant même que la question soit posée.
 *
 * ── Ce que le composant ne fait PAS ────────────────────────────────────────
 *
 * Il ne remplace aucune garde. Le DAL porte `exigerAdministrateur()` et la base
 * ses `CHECK` : cette boîte protège d'un geste distrait, pas d'un appelant
 * hostile — qui, lui, solliciterait l'action directement sans passer par l'écran.
 */
export default function BoutonConfirme({
  titre,
  message,
  libelleConfirmer,
  danger = false,
  disabled = false,
  enCours = false,
  className,
  children,
}: {
  /** Titre de la question. */
  titre: string;
  /** Ce que l'action va faire, et ce qu'elle coûte si c'est une erreur. */
  message: React.ReactNode;
  libelleConfirmer?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Vrai pendant la soumission : verrouille le bouton et la boîte. */
  enCours?: boolean;
  className?: string;
  /** Contenu du bouton — icône et libellé, comme un `<button>` ordinaire. */
  children: React.ReactNode;
}) {
  const bouton = useRef<HTMLButtonElement>(null);
  const [question, setQuestion] = useState(false);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        disabled={disabled || enCours}
        onClick={() => {
          // La validation du navigateur AVANT la question, et non après.
          // `requestSubmit()` l'exécute de toute façon, mais elle refuserait alors
          // le formulaire une fois la confirmation obtenue — on aurait demandé
          // « refuser cet ordre de mission ? », répondu oui, et reçu « ce champ
          // est obligatoire ». `reportValidity()` affiche le même message
          // natif, au bon moment.
          const formulaire = bouton.current?.form;
          if (formulaire && !formulaire.reportValidity()) return;
          setQuestion(true);
        }}
        className={className}
      >
        {children}
      </button>

      <Confirmation
        ouvert={question}
        titre={titre}
        message={message}
        libelleConfirmer={libelleConfirmer}
        danger={danger}
        enCours={enCours}
        onAnnuler={() => setQuestion(false)}
        onConfirmer={() => {
          setQuestion(false);
          // `.form` est le formulaire ancêtre du bouton : on n'a donc rien à lui
          // passer, et on ne peut pas se tromper de formulaire quand la page en
          // porte plusieurs — c'est le cas de BlocActions, qui en a trois.
          bouton.current?.form?.requestSubmit();
        }}
      />
    </>
  );
}
