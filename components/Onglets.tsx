"use client";

import { usePathname } from "next/navigation";
import { sectionActive, type Section } from "@/lib/navigation";
import Onglet from "@/components/Onglet";

/**
 * Onglets de navigation, région CENTRALE du header.
 *
 * ── Pourquoi ce composant ne contient plus le bouton de menu ─────────────────
 *
 * Parce que les deux ne vivent plus au même endroit : les onglets sont centrés,
 * le bouton de menu est à droite avec le menu utilisateur. Les garder dans un
 * même composant les forçait à être frères dans une seule région du header,
 * donc à partager sa position.
 *
 * ── Ce que « centré » exige ──────────────────────────────────────────────────
 *
 * Pas `justify-between` : il répartit l'espace RESTANT, pas l'élément du milieu.
 * Dès que le groupe de gauche (logo + retour) et celui de droite (avatar) n'ont
 * pas la même largeur — ce qui est le cas — le centre est décalé.
 *
 * La technique retenue est celle des trois régions : les deux latérales prennent
 * une part ÉGALE de l'espace libre (`flex-1 basis-0`), la centrale est
 * dimensionnée par son contenu (`shrink-0`). Les onglets tombent alors au centre
 * réel de la barre, quelles que soient les largeurs des côtés.
 *
 * `basis-0` compte autant que `flex-1` : sans lui, la largeur intrinsèque du
 * contenu latéral entre dans le partage et rétablit l'asymétrie.
 *
 * ── Pourquoi un composant client ─────────────────────────────────────────────
 *
 * L'onglet actif dépend de l'URL courante, et il n'existe pas d'équivalent
 * serveur à `usePathname()`.
 *
 * Les sections arrivent en PROPS depuis un composant serveur : un composant
 * client ne peut pas importer le DAL, et le filtrage par rôle ne doit pas
 * dépendre du navigateur.
 *
 * ⚠️ Ce filtrage est du confort, pas de la sécurité. Masquer un onglet n'empêche
 * personne de taper l'adresse : ce sont les layouts de section et les gardes du
 * DAL qui refusent l'accès.
 */
export default function Onglets({ sections }: { sections: readonly Section[] }) {
  const chemin = usePathname();

  if (sections.length === 0) return null;

  return (
    // `hidden lg:flex` — `lg` et non `md` : avec six sections aux libellés
    // français longs (« Ordres de mission », « Paramètres ») accompagnés d'une
    // icône, les onglets débordent en dessous de 1024 px. Le seuil suit le
    // contenu réel, pas une convention.
    <nav
      aria-label="Navigation principale"
      className="hidden shrink-0 items-center gap-1 lg:flex"
    >
      {sections.map((s) => (
        <Onglet key={s.href} section={s} actif={sectionActive(chemin, s.href)} />
      ))}
    </nav>
  );
}
