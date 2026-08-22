import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Navigation entre les pages d'une liste.
 *
 * ── Des LIENS, pas des boutons ───────────────────────────────────────────────
 *
 * Chaque page est une adresse : elle se partage, s'ouvre dans un nouvel onglet,
 * et le bouton « précédent » du navigateur fait ce qu'on attend. Des boutons
 * avec `router.push` obligeraient à rendre ce composant client et retireraient
 * ces trois propriétés sans rien apporter.
 *
 * C'est le même raisonnement que pour les filtres, déjà portés par l'URL.
 */
export default function Pagination({
  page,
  nombrePages,
  total,
  parPage,
  /** Paramètres de recherche courants, à conserver dans les liens. */
  parametres,
  /** Chemin de base, sans les paramètres. */
  base,
}: {
  page: number;
  nombrePages: number;
  total: number;
  parPage: number;
  parametres: Record<string, string | undefined>;
  base: string;
}) {
  if (nombrePages <= 1) {
    // Une seule page : la navigation n'a rien à proposer. On garde le décompte,
    // qui reste une information utile (« 12 employés »).
    return (
      <p className="text-sm text-slate-600">
        {total} employé{total > 1 ? "s" : ""}
      </p>
    );
  }

  /**
   * Construit l'adresse d'une page en CONSERVANT les filtres en cours.
   *
   * Sans ça, changer de page effacerait la recherche — et l'utilisateur croirait
   * que la pagination a réinitialisé son filtre.
   */
  const lien = (cible: number) => {
    const suivants = new URLSearchParams();
    for (const [cle, valeur] of Object.entries(parametres)) {
      if (valeur) suivants.set(cle, valeur);
    }
    if (cible > 1) suivants.set("page", String(cible));
    else suivants.delete("page");
    return suivants.size ? `${base}?${suivants}` : base;
  };

  const premier = (page - 1) * parPage + 1;
  const dernier = Math.min(page * parPage, total);

  const styleLien =
    "inline-flex items-center gap-1 rounded-lg border border-blue-500 bg-white px-3 py-1.5 " +
    "text-sm text-blue-800 transition-colors duration-200 hover:bg-blue-50 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

  // Un `<span>` grisé plutôt qu'un lien désactivé : un `<a>` sans `href` n'est
  // pas focalisable et disparaît de la navigation au clavier, alors qu'un lien
  // « désactivé » cliquable serait un piège.
  const styleInerte =
    "inline-flex items-center gap-1 rounded-lg border border-transparent bg-blue-100 px-3 py-1.5 " +
    "text-sm text-slate-500";

  return (
    <nav
      // Nommée : une page peut porter plusieurs zones de navigation, et un
      // lecteur d'écran les annonce alors toutes « navigation » sans distinction.
      aria-label="Pagination de la liste du personnel"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-slate-600">
        Employés <strong className="tabular-nums">{premier}</strong> à{" "}
        <strong className="tabular-nums">{dernier}</strong> sur{" "}
        <strong className="tabular-nums">{total}</strong>
      </p>

      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={lien(page - 1)} className={styleLien} rel="prev">
            <ChevronLeft size={16} aria-hidden="true" />
            Précédente
          </Link>
        ) : (
          <span className={styleInerte} aria-hidden="true">
            <ChevronLeft size={16} />
            Précédente
          </span>
        )}

        {/* `aria-current` sur le numéro courant : sans lui, « 3 sur 12 » n'est
            qu'un texte parmi d'autres pour une aide technique. */}
        <span className="px-2 text-sm text-blue-900" aria-current="page">
          Page <strong className="tabular-nums">{page}</strong> sur{" "}
          <span className="tabular-nums">{nombrePages}</span>
        </span>

        {page < nombrePages ? (
          <Link href={lien(page + 1)} className={styleLien} rel="next">
            Suivante
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <span className={styleInerte} aria-hidden="true">
            Suivante
            <ChevronRight size={16} />
          </span>
        )}
      </div>
    </nav>
  );
}
