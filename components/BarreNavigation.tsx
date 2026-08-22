import Link from "next/link";
import { LogIn } from "lucide-react";
import { lireSession } from "@/lib/auth/garde";
import { sectionsPour } from "@/lib/navigation";
import Onglets from "@/components/Onglets";
import MenuMobile from "@/components/MenuMobile";
import MenuUtilisateur from "@/components/MenuUtilisateur";

/**
 * Régions centre et droite du header : onglets filtrés par rôle, puis compte.
 *
 * ── Pourquoi tout passe par ici ──────────────────────────────────────────────
 *
 * C'est le seul endroit qui lit la session pour le header. Les onglets visibles
 * en dépendent (un agent ne voit ni Personnel, ni Rapports, ni Paramètres), et
 * le menu utilisateur aussi. Une seule lecture, distribuée en props.
 *
 * ── Pourquoi ce n'est pas dans `Header` ──────────────────────────────────────
 *
 * Lire la session est dynamique, et le header vit dans le layout racine. La doc
 * prévient :
 *
 *   « A top-level await on cookies(), headers(), or the DAL in a layout delays
 *     the first streamed chunk for that segment and holds {children} behind that
 *     work. […] move the await into a nested Server Component and wrap it in
 *     <Suspense> so the rest of the page streams first. »
 *
 * D'où ce composant séparé, que `Header` enveloppe dans `<Suspense>`.
 *
 * Le filtrage par rôle est du CONFORT. La sécurité est dans
 * `app/parametres/layout.tsx`, `app/rapports/layout.tsx` et les gardes du DAL.
 * Vérifié : une session UTILISATEUR qui tape /rapports reçoit
 * `307 → /?acces=refuse`.
 */
export default async function BarreNavigation() {
  const session = await lireSession();
  const sections = sectionsPour(session?.role ?? null);

  return (
    <>
      {/* ── Région CENTRE : dimensionnée par son contenu ─────────────────────
          `shrink-0` et pas de `flex-1` : c'est ce qui la laisse à sa largeur
          naturelle, entre deux régions latérales qui se partagent le reste à
          parts égales. Elle tombe donc au centre réel de la barre. */}
      <Onglets sections={sections} />

      {/* ── Région DROITE : part égale de l'espace, contenu à la fin ──────────
          `flex-1 basis-0` en miroir exact de la région gauche du header. Sans
          `basis-0`, la largeur intrinsèque de l'avatar entrerait dans le partage
          et décalerait le centre. */}
      <div className="flex flex-1 basis-0 items-center justify-end gap-1 sm:gap-2">
        {/* Le bouton de menu vit ici et non au centre : sur téléphone, il doit
            rester à portée du pouce, du même côté que le compte. */}
        <MenuMobile sections={sections} />

        {session ? (
          // Composant client, mais la session est lue ICI, côté serveur, et
          // passée en prop : un composant client ne peut pas importer le DAL.
          <MenuUtilisateur session={session} />
        ) : (
          <Link
            href="/connexion"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-3 py-2
                       text-sm font-medium text-blue-800 shadow-sm shadow-blue-950/20
                       transition-colors duration-200 hover:bg-blue-50
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white
                       focus-visible:ring-offset-2 focus-visible:ring-offset-blue-600 sm:px-4"
          >
            <LogIn size={18} aria-hidden="true" />
            <span className="hidden sm:inline">Se connecter</span>
          </Link>
        )}
      </div>
    </>
  );
}

/**
 * Réservation d'espace pendant le chargement.
 *
 * Occupe la place des DEUX régions (centre vide + droite), pour que le header ne
 * saute pas quand la session arrive : sans `flex-1 basis-0` ici, la région droite
 * naîtrait sans largeur puis en prendrait une, décalant les onglets au passage.
 */
export function SqueletteBarreNavigation() {
  return (
    <div className="flex flex-1 basis-0 items-center justify-end">
      <div className="h-9 w-9 animate-pulse rounded-full bg-white/20" aria-hidden="true" />
    </div>
  );
}
