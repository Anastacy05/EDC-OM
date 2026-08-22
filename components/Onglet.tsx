"use client";

import Link from "next/link";
import {
  Home,
  FileText,
  CalendarDays,
  Users,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { NomIcone, Section } from "@/lib/navigation";

/**
 * Un onglet de navigation, partagé par les onglets d'écran large et le panneau
 * mobile.
 *
 * Extrait dans son propre fichier parce que les deux rendus vivent désormais
 * dans des RÉGIONS différentes du header : les onglets au centre, le bouton de
 * menu à droite. Ils ne peuvent donc plus être frères dans un même composant.
 *
 * ── Contrastes mesurés (21/08/2026) ──────────────────────────────────────────
 *
 * Sur le fond du header, `text-white` ne donnait que **3,76:1** avec
 * `bg-blue-500` — sous les 4,5:1 exigés pour du texte de taille normale. Le fond
 * est passé à `bg-blue-600`, où le blanc atteint **5,26:1**.
 *
 * Onglet actif : pastille blanche + `text-blue-900`, soit **10,40:1** pour le
 * texte, et **3,76:1** entre la pastille et le fond — au-delà du seuil de 3:1
 * des éléments non textuels, donc la pastille est perceptible en elle-même.
 * L'état actif n'est donc PAS porté par la seule couleur : il l'est par le
 * remplissage, la graisse, et `aria-current` pour les lecteurs d'écran.
 */

/**
 * Traduction nom → composant.
 *
 * `lib/navigation.ts` ne transporte que des chaînes, pour ne pas faire entrer
 * `lucide-react` dans le paquet du proxy, qui importe ce module et s'exécute à
 * chaque requête.
 */
const ICONES: Record<NomIcone, LucideIcon> = {
  accueil: Home,
  ordresDeMission: FileText,
  conges: CalendarDays,
  personnel: Users,
  rapports: BarChart3,
  parametres: Settings,
};

const ACTIF = "bg-white text-blue-900 font-semibold shadow-sm shadow-blue-950/20";
const INACTIF = "text-white hover:bg-white/15";
const INDISPONIBLE = "text-white/50 cursor-not-allowed";
const BASE =
  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap " +
  "transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-600";

/**
 * `<span>` et non `<Link>` quand la section n'existe pas : un lien vers une
 * route absente donnerait un 404, ce qui est pire qu'un élément visiblement
 * désactivé.
 */
export default function Onglet({
  section,
  actif,
  pleineLargeur,
  auClic,
}: {
  section: Section;
  actif: boolean;
  pleineLargeur?: boolean;
  auClic?: () => void;
}) {
  const Icone = ICONES[section.icone];
  const largeur = pleineLargeur ? "w-full" : "";
  const etat =
    section.disponible === false ? INDISPONIBLE : actif ? ACTIF : INACTIF;

  // aria-hidden sur l'icône : le libellé la suit toujours, donc l'annoncer
  // serait une répétition. Une icône décorative doit être muette.
  const contenu = (
    <>
      <Icone size={16} aria-hidden="true" className="shrink-0" />
      <span>{section.libelle}</span>
    </>
  );

  if (section.disponible === false) {
    return (
      <span
        title={section.motifIndisponible ?? "Pas encore disponible"}
        aria-disabled="true"
        className={`${BASE} ${etat} ${largeur}`}
      >
        {contenu}
      </span>
    );
  }

  return (
    <Link
      href={section.href}
      onClick={auClic}
      // aria-current : c'est CE qui annonce « page courante » à un lecteur
      // d'écran. Sans lui, l'onglet actif ne se distingue que visuellement, et
      // la navigation devient un mur de liens identiques.
      aria-current={actif ? "page" : undefined}
      className={`${BASE} ${etat} ${largeur}`}
    >
      {contenu}
    </Link>
  );
}
