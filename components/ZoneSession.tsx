import Link from "next/link";
import { lireSession } from "@/lib/auth/garde";
import BoutonDeconnexion from "@/components/BoutonDeconnexion";

/**
 * Zone du Header qui dépend de la session.
 *
 * ── Pourquoi un composant séparé et non du code dans `Header` ────────────────
 *
 * Parce que lire la session est une opération dynamique, et que la doc met en
 * garde contre le fait de la placer trop haut :
 *
 *   « A top-level await on cookies(), headers(), or the DAL in a layout delays
 *     the first streamed chunk for that segment and holds {children} behind that
 *     work. […] move the await into a nested Server Component and wrap it in
 *     <Suspense> so the rest of the page streams first. »
 *
 * Le Header est dans le layout racine : un `await` chez lui retarderait
 * l'affichage de TOUTE page. Isolé ici sous `<Suspense>`, le reste part
 * immédiatement et cette zone se remplit ensuite.
 *
 * Composant serveur : un composant client ne peut pas importer le DAL.
 */
export default async function ZoneSession() {
  const session = await lireSession();

  if (!session) {
    return (
      <Link
        href="/connexion"
        className="py-2 px-4 rounded-lg bg-white/90 text-blue-800 shadow-md shadow-blue-950/20
                   hover:bg-white hover:scale-105 transition-all duration-300"
      >
        Se connecter
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-4">
      {/* Le lien Admin n'apparaît que pour un administrateur. C'est du confort,
          pas de la sécurité : `app/admin/layout.tsx` refuse l'accès même si
          l'adresse est saisie à la main. */}
      {session.role === "ADMINISTRATEUR" && (
        <Link
          href="/admin"
          className="py-2 px-4 rounded-lg bg-amber-100 text-amber-900 shadow-md shadow-blue-950/20
                     hover:bg-amber-50 hover:scale-105 transition-all duration-300"
        >
          Admin
        </Link>
      )}

      {/* Le matricule plutôt que le courriel : c'est l'identifiant qu'un agent
          de l'EDC reconnaît, et il est plus court. Repli sur le courriel pour
          un compte technique sans matricule. */}
      <span className="text-white text-sm hidden md:inline" title={session.email}>
        {session.matricule ?? session.email}
      </span>

      <BoutonDeconnexion />
    </div>
  );
}

/** Réservation d'espace pendant le chargement, pour éviter que le Header saute. */
export function SqueletteZoneSession() {
  return <div className="h-10 w-32 rounded-lg bg-white/20 animate-pulse" aria-hidden="true" />;
}
