import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import BarreNavigation, { SqueletteBarreNavigation } from "@/components/BarreNavigation";

/**
 * Barre supérieure : identité, navigation centrée, compte.
 *
 * ── Comment les onglets sont réellement centrés ──────────────────────────────
 *
 * Pas avec `justify-between` : il répartit l'espace RESTANT entre les groupes,
 * pas l'élément du milieu. Dès que le groupe de gauche (logo) et celui de droite
 * (avatar, bouton de menu) diffèrent en largeur — ce qui est toujours le cas —
 * le centre se décale. C'est un échec de centrage optique, pas un bogue.
 *
 * Technique retenue, à trois régions :
 *
 *   • gauche  → `flex-1 basis-0`  part égale de l'espace libre
 *   • centre  → `shrink-0`        dimensionné par son contenu
 *   • droite  → `flex-1 basis-0`  part égale, contenu aligné à la fin
 *
 * `basis-0` compte autant que `flex-1` : sans lui, la largeur intrinsèque du
 * contenu latéral entre dans le partage et rétablit l'asymétrie. Les onglets
 * tombent alors au centre réel de la barre, quelles que soient les largeurs des
 * côtés.
 *
 * ── Deux points qui ne sont pas décoratifs ────────────────────────────────────
 *
 * `relative` : le panneau mobile se positionne en `absolute top-full`, il lui
 * faut cet ancêtre positionné. Sans lui, il se placerait par rapport à la
 * fenêtre et se décalerait au défilement.
 *
 * `bg-blue-600` et non `bg-blue-500` : changement du 21/08/2026, pour une raison
 * mesurée et non esthétique. Sur `bg-blue-500`, `text-white` ne donnait que
 * **3,76:1** — sous les 4,5:1 exigés par WCAG pour du texte de taille normale,
 * ce que sont les libellés d'onglets. Sur `bg-blue-600`, le blanc atteint
 * **5,26:1**. Un seul cran d'écart, et tout le texte du header passe le seuil.
 * La bordure suit : `border-blue-700`.
 *
 * ── Ce qui n'est plus ici ─────────────────────────────────────────────────────
 *
 * Le bouton de retour. Il déduisait sa destination de l'URL, ce qui l'envoyait
 * sur un 404 depuis `/mot-de-passe/<jeton>` et mentait après un saut d'un
 * rapport vers `/om?pays=…`. Il est devenu `components/RetourVers.tsx`, posé par
 * chaque page avec une destination déclarée — conforme au GOV.UK Design System,
 * qui place le lien de retour « at the top of a page, before the <main>
 * element », pas dans la bannière.
 */
export default function Header() {
  return (
    <header
      className="relative flex min-h-16 w-full items-center gap-2 border-b-2 border-blue-700
                 bg-blue-600 px-3 sm:gap-4 sm:px-6 md:px-8"
    >
      {/* ── Région gauche ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 basis-0 items-center">
        {/* Le logo ramène à l'accueil : convention si constante qu'un logo non
            cliquable se lit comme un défaut. `aria-label` plutôt que du texte
            visible, l'image portant déjà l'identité. */}
        <Link
          href="/"
          aria-label="EDC OM — aller à l'accueil"
          className="flex items-center gap-2.5 rounded-lg p-1 transition-colors duration-200
                     hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2
                     focus-visible:ring-white focus-visible:ring-offset-2
                     focus-visible:ring-offset-blue-600"
        >
          <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg">
            {/* alt="" : l'image est décorative ici, le lien qui l'entoure porte
                déjà son sens. Un alt répété serait annoncé deux fois. */}
            <Image src="/logo.jpeg" alt="" fill sizes="36px" className="object-cover" />
          </span>
          {/* Masqué sous `sm` : sur un téléphone, la place va aux commandes.
              Le nom reste accessible par l'`aria-label` du lien. */}
          <span className="hidden text-sm font-semibold tracking-tight text-white sm:inline">
            EDC OM
          </span>
        </Link>
      </div>

      {/* ── Régions centre et droite ───────────────────────────────────────────
          Portées par `BarreNavigation`, qui doit lire la session pour savoir
          quels onglets afficher.

          Suspense : cette lecture est dynamique (cookies + base). Sans cette
          frontière, l'attente remonterait au layout racine et retarderait le
          premier octet de TOUTES les pages — la doc appelle à « push dynamic
          access down ». La coquille du header, elle, part immédiatement. */}
      <Suspense fallback={<SqueletteBarreNavigation />}>
        <BarreNavigation />
      </Suspense>

      {/* COMMENTÉ (21/08/2026) — « S'inscrire » et « Se Connecter » remplacés par
          BarreNavigation, qui affiche réellement l'état de connexion.

          « S'inscrire » ne reviendra pas : il n'y a pas d'inscription libre dans
          cette application. Les comptes sont créés par l'administrateur avec le
          matricule de l'employé, et le titulaire définit son mot de passe par le
          lien reçu par courriel. Laisser une inscription ouverte permettrait de
          créer un compte sans matricule, donc sans employé — et de contourner
          l'appariement compte/employé sur lequel reposent les quotas de mission
          et les soldes de congés.

      <div
        title="Pas encore disponible"
        className="py-2 px-4 rounded-lg bg-blue-300/50 text-white/70 shadow-md cursor-not-allowed shadow-blue-950/20"
      >
        S&apos;inscrire
      </div>
      <div
        title="Pas encore disponible"
        className="py-2 px-4 rounded-lg bg-white/50 text-blue-900/50 shadow-md cursor-not-allowed shadow-blue-950/20"
      >
        Se Connecter
      </div>
      */}

      {/* COMMENTÉ (21/08/2026) — « FR » et « Moon » sortent de la barre
          supérieure. Motif : avec les onglets, la barre porte maintenant jusqu'à
          six sections plus le compte ; deux boutons inertes de plus la saturent,
          et sur téléphone ils se disputeraient la place avec le bouton de menu.

          Ils ne sont pas abandonnés : ils ont été REPRIS dans le menu
          utilisateur (components/MenuUtilisateur.tsx), sous forme d'entrées
          désactivées avec le motif en infobulle. C'est la place naturelle d'une
          préférence de compte.

      <div
        title="Pas encore disponible"
        className="p-2 rounded-lg bg-amber-200/50 text-blue-800/50 shadow-md cursor-not-allowed shadow-amber-800/20"
      >
        FR
      </div>
      <div
        title="Pas encore disponible"
        className="p-2 rounded-lg bg-amber-500/50 text-blue-400/50 shadow-md cursor-not-allowed shadow-amber-50/20"
      >
        Moon
      </div>
      */}
    </header>
  );
}
