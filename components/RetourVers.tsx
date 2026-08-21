"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useBrouillonNonEnregistre } from "@/contexts/brouillonContext";

/**
 * Lien de retour, **propre à une page** et posé par elle.
 *
 * ── Pourquoi il a quitté le header (21/08/2026) ──────────────────────────────
 *
 * L'ancien `BackButton` vivait dans le header et déduisait sa destination de
 * l'URL, en retirant le dernier segment. Trois défauts, dont deux vérifiés :
 *
 *   1. **Il menait à un 404.** Sur `/mot-de-passe/<jeton>`, il calculait
 *      `/mot-de-passe` — route qui n'existe pas. Et il s'affichait sur une page
 *      publique où il n'a rien à faire.
 *   2. **Il mentait après un saut transversal.** Les rapports naviguent vers
 *      `/om?pays=…` ; depuis là, un retour déduit de l'URL donne `/`, jamais le
 *      rapport d'où l'on vient.
 *   3. **Il confondait deux natures de navigation.** Le header porte la
 *      navigation de l'APPLICATION (les sections). Le retour est une navigation
 *      DANS une page. Les mêler dans la même barre brouille les deux.
 *
 * La recommandation du GOV.UK Design System dit la même chose : « Always place
 * back links at the top of a page, before the <main> element », et, pour un
 * service à plusieurs domaines, « consider using different link text, like "Go
 * back to [page]" » — un « Retour » nu laisse l'utilisateur incertain de sa
 * destination.
 *
 * D'où ce composant : la destination est DÉCLARÉE par la page, jamais devinée,
 * et le libellé la nomme.
 *
 * ── Le garde-fou de brouillon ────────────────────────────────────────────────
 *
 * ⚠️ Il ne protège que CE lien. Un onglet du header cliqué depuis /om/nouveau
 * emporte toujours la saisie en cours sans rien demander : l'App Router de Next
 * n'expose pas de blocage de navigation. À traiter quand la création d'OM
 * passera en base (étape 8), où un brouillon persisté rendra la question sans
 * objet.
 */
export default function RetourVers({
  href,
  libelle,
  /** Vrai sur les écrans de saisie : demande confirmation si un brouillon existe. */
  protegerBrouillon = false,
}: {
  href: string;
  libelle: string;
  protegerBrouillon?: boolean;
}) {
  const router = useRouter();
  const { actif, desactiver } = useBrouillonNonEnregistre();

  const gererClic = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!protegerBrouillon || !actif) return;
    e.preventDefault();
    if (confirm("Des modifications n'ont pas été enregistrées. Quitter quand même ?")) {
      desactiver();
      router.push(href);
    }
  };

  return (
    <Link
      href={href}
      onClick={gererClic}
      className="inline-flex w-fit items-center gap-1.5 rounded-lg py-1.5 pr-3 text-sm
                 font-medium text-blue-700 transition-colors duration-200 hover:text-blue-900
                 hover:underline focus-visible:outline-none focus-visible:ring-2
                 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {libelle}
    </Link>
  );
}
