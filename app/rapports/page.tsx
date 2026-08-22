import Link from "next/link";
import { carteClass, titrePageClass } from "@/lib/styles";

/**
 * Index des rapports.
 *
 * Extrait de l'ancienne page `/admin`, qui mélangeait deux choses de nature
 * différente : le réglage de l'âge de retraite (une écriture) et l'accès aux
 * rapports (une lecture). Les onglets les séparent maintenant, et cette page
 * n'a plus qu'un rôle d'aiguillage.
 *
 * Composant SERVEUR, contrairement aux rapports eux-mêmes : elle n'affiche que
 * des liens statiques, aucune donnée. Pas de `localStorage`, donc pas de
 * garde-fou d'hydratation à prévoir.
 */

interface Rapport {
  href: string;
  titre: string;
  description: string;
  /** Faux pour les rapports du catalogue §11 encore à construire. */
  disponible: boolean;
}

const RAPPORTS: readonly Rapport[] = [
  {
    href: "/rapports/carte",
    titre: "Carte du monde",
    description: "Nombre de missions par continent, avec zoom par pays.",
    disponible: true,
  },
  {
    href: "/rapports/frise",
    titre: "Frise chronologique",
    description: "Nombre de missions par année, avec détail par mois.",
    disponible: true,
  },
  {
    href: "/rapports/pyramide",
    titre: "Pyramide hiérarchique",
    description: "Nombre de missions par statut, avec détail par employé.",
    disponible: true,
  },
];

export default function RapportsPage() {
  return (
    <div className="h-full w-full bg-blue-50 flex flex-col gap-8 p-6 sm:p-10">
      <h1 className={titrePageClass}>Rapports</h1>

      {/* Mention obligatoire sur tout écran de rapport financier
          (MODELE-DONNEES.md §11) : l'indemnité journalière ne couvre ni le
          transport ni l'hébergement. Un chiffre partiel pris pour un budget est
          une erreur qui se propage vite. */}
      <p className="max-w-3xl rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Les montants affichés dans les rapports sont un <strong>plancher, pas un coût
        complet</strong> : ils ne comprennent ni le transport ni l&apos;hébergement.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl">
        {RAPPORTS.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className={`${carteClass} hover:shadow-lg transition-shadow`}
          >
            <h2 className="text-amber-700 font-semibold text-lg">{r.titre}</h2>
            <p className="text-sm text-gray-600">{r.description}</p>
          </Link>
        ))}
      </div>

      <p className="text-sm text-blue-900/70">
        Neuf autres rapports sont spécifiés (MODELE-DONNEES.md §11) et seront ajoutés à
        l&apos;étape 12, une fois les ordres de mission lus en base.
      </p>
    </div>
  );
}
