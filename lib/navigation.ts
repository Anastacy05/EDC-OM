import type { Role } from "@/lib/auth/jeton";

/**
 * Sections de l'application, source unique de la navigation.
 *
 * Une seule liste, lue à la fois par les onglets d'écran large et par le menu
 * déroulant mobile : ajouter « Congés » à l'étape 13 est une ligne, et les deux
 * rendus restent d'accord par construction. Les faire divergerait sinon —
 * c'est l'erreur classique des menus doublés.
 *
 * ⚠️ Ce module n'est NI `server-only` NI `"use client"` : il est importé des
 * deux côtés. Il ne doit donc contenir que des données, jamais un accès à la
 * base ou à `process.env`.
 */

export interface Section {
  href: string;
  libelle: string;
  /** Libellé court pour les écrans étroits, quand le long ne tient pas. */
  libelleCourt?: string;
  /**
   * Nom de l'icône lucide associée.
   *
   * Une CHAÎNE et non le composant lui-même : ce module est importé par le
   * proxy, qui n'a que faire de React. Y mettre un composant ferait entrer
   * `lucide-react` dans le paquet du proxy, exécuté à chaque requête.
   */
  icone: NomIcone;
  /** Réservée à l'administrateur : la garde de route la protège vraiment. */
  adminSeulement?: boolean;
  /**
   * Faux tant que la section n'existe pas. Affichée grisée plutôt que cachée :
   * montrer la feuille de route sans laisser croire que la fonctionnalité est là.
   */
  disponible?: boolean;
  /** Motif affiché en infobulle quand la section n'est pas disponible. */
  motifIndisponible?: string;
}

/** Icônes utilisées par la navigation. Liste fermée : le rendu la traduit. */
export type NomIcone =
  | "accueil"
  | "ordresDeMission"
  | "conges"
  | "personnel"
  | "rapports"
  | "parametres";

export const SECTIONS: readonly Section[] = [
  { href: "/", libelle: "Accueil", icone: "accueil", disponible: true },
  {
    href: "/om",
    libelle: "Ordres de mission",
    libelleCourt: "OM",
    icone: "ordresDeMission",
    disponible: true,
  },
  {
    href: "/conges",
    libelle: "Congés",
    icone: "conges",
    disponible: false,
    motifIndisponible: "Module congés — pas encore développé",
  },
  {
    href: "/personnel",
    libelle: "Personnel",
    icone: "personnel",
    adminSeulement: true,
    disponible: false,
    motifIndisponible: "Gestion du personnel — pas encore développée",
  },
  {
    href: "/rapports",
    libelle: "Rapports",
    icone: "rapports",
    adminSeulement: true,
    disponible: true,
  },
  {
    href: "/parametres",
    libelle: "Paramètres",
    icone: "parametres",
    adminSeulement: true,
    disponible: true,
  },
] as const;

/**
 * Sections visibles pour ce rôle. `null` = personne n'est connecté.
 *
 * Un visiteur non authentifié ne voit aucun onglet : le proxy le renverrait de
 * toute façon vers la connexion, et lui montrer des liens qui échouent tous
 * serait une fausse promesse.
 */
export function sectionsPour(role: Role | null): readonly Section[] {
  if (role === null) return [];
  if (role === "ADMINISTRATEUR") return SECTIONS;
  return SECTIONS.filter((s) => !s.adminSeulement);
}

/**
 * Préfixes de chemin réservés à l'administrateur, déduits de la même liste.
 *
 * Utilisé par le proxy pour son tri optimiste. Le déduire évite le défaut
 * qu'on aurait avec une liste séparée : ajouter une section admin sans penser
 * à mettre le proxy à jour, et la laisser accessible.
 */
export const PREFIXES_ADMIN: readonly string[] = SECTIONS.filter(
  (s) => s.adminSeulement
).map((s) => s.href);

/**
 * Vrai si `chemin` appartient à cette section.
 *
 * `/` est traité à part : sans ça, l'accueil serait « actif » partout, puisque
 * tout chemin commence par une barre oblique.
 */
export function sectionActive(chemin: string, href: string): boolean {
  if (href === "/") return chemin === "/";
  return chemin === href || chemin.startsWith(href + "/");
}
