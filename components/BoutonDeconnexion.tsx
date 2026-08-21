"use client";

import { deconnecter } from "@/lib/auth/actions";

/**
 * Bouton de déconnexion.
 *
 * `<form action={…}>` et non un `onClick` : la déconnexion révoque un jeton en
 * base et efface des cookies, donc elle doit passer par une Server Action. Un
 * gestionnaire de clic ne pourrait ni l'une ni l'autre depuis le navigateur.
 *
 * Bénéfice au passage : en POST, la déconnexion n'est pas déclenchable par un
 * simple `<img src>` pointant sur une URL — ce qui serait le cas d'un GET.
 */
export default function BoutonDeconnexion() {
  return (
    <form action={deconnecter}>
      <button
        type="submit"
        className="py-2 px-4 rounded-lg bg-white/90 text-blue-800 shadow-md shadow-blue-950/20
                   hover:bg-white hover:scale-105 transition-all duration-300 cursor-pointer"
      >
        Se déconnecter
      </button>
    </form>
  );
}
