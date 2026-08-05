"use client";

import { useSyncExternalStore } from "react";

// Abonnement vide : la valeur ne change jamais après l'hydratation, il n'y a
// donc rien à notifier. Défini hors du hook pour garder une référence stable
// (useSyncExternalStore se réabonne si la fonction change à chaque rendu).
const neJamaisNotifier = () => () => {};
const cotéClient = () => true;
const cotéServeur = () => false;

/**
 * Vrai uniquement après l'hydratation, côté navigateur.
 *
 * Nécessaire dès qu'un rendu dérive de localStorage : `configOM`
 * (lib/config.ts) et `mockOMs` (lib/mockData.ts) valent les données par défaut
 * au rendu serveur et les données enregistrées côté client. Afficher
 * directement l'une ou l'autre produit un écart d'hydratation — React remonte
 * un warning et peut conserver le HTML du serveur.
 *
 * Implémenté avec `useSyncExternalStore` plutôt qu'avec le classique
 * `useState(false)` + `useEffect(() => setMonte(true))` : la règle
 * `react-hooks/set-state-in-effect` du projet interdit un `setState`
 * synchrone dans un effet. Ici, ni état ni effet — c'est React lui-même qui
 * distingue l'instantané serveur de l'instantané client.
 */
export function useEstMonte(): boolean {
  return useSyncExternalStore(neJamaisNotifier, cotéClient, cotéServeur);
}
