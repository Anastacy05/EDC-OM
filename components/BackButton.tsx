"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Bouton de retour affiché dans le Header, sur toutes les pages sauf
 * l'accueil.
 *
 * Il remonte d'un niveau dans l'arborescence plutôt que de refaire
 * `router.back()` : la destination est ainsi toujours la même quel que soit
 * le chemin emprunté. Avec l'historique, on retomberait par exemple sur
 * l'aperçu d'un brouillon déjà enregistré.
 *
 *   /om/nouveau  -> /om
 *   /om/<id>     -> /om
 *   /om          -> /
 *   /            -> rien (pas de parent)
 *
 * Composant client isolé exprès : `usePathname` forcerait sinon tout le
 * Header (et son <Image>) à basculer côté client.
 */
export default function BackButton() {
  const pathname = usePathname();

  const parent = pathname.replace(/\/[^/]*$/, "") || "/";
  if (pathname === "/") return null;

  return (
    <Link
      href={parent}
      aria-label="Revenir à la page précédente"
      className="py-2 px-4 rounded-lg bg-white/90 text-blue-800 shadow-md shadow-blue-950/20
                 hover:bg-white hover:scale-105 transition-all duration-300"
    >
      ← Retour
    </Link>
  );
}
