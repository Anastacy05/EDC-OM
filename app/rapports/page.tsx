import Link from "next/link";
import { CheckCircle2, Wallet, CalendarDays, Compass, Map, MapPinned, BarChart3, Clock, Table2, Users, PieChart } from "lucide-react";
import { carteClass, conteneurLargeClass, titrePageClass } from "@/lib/styles";

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
 *
 * MODIFIÉ le 26/08/2026 (étape 12) : les 12 entrées du catalogue (§11) sont
 * maintenant TOUTES listées, pas seulement les trois déjà construites — les
 * 7 encore à construire s'affichent en cartes non cliquables plutôt que de
 * disparaître, pour que la page reste la table des matières du catalogue.
 */

interface Rapport {
  numero: number;
  href: string;
  titre: string;
  description: string;
  Icone: typeof CheckCircle2;
  /** Faux pour les rapports du catalogue §11 encore à construire. */
  disponible: boolean;
}

const RAPPORTS: readonly Rapport[] = [
  {
    numero: 1,
    href: "/rapports/indicateurs",
    titre: "Indicateurs de tête",
    description: "Missions confirmées, coût total, jours cumulés, OM en attente — avec variation.",
    Icone: CheckCircle2,
    disponible: true,
  },
  {
    numero: 2,
    href: "/rapports/cout-periode",
    titre: "Coût par période",
    description: "Tendance du coût plancher, par mois ou par année.",
    Icone: Wallet,
    disponible: true,
  },
  {
    numero: 3,
    href: "/rapports/cout-direction",
    titre: "Coût par direction",
    description: "Comparer le coût plancher entre directions.",
    Icone: BarChart3,
    disponible: true,
  },
  {
    numero: 4,
    href: "/rapports/top-destinations",
    titre: "Top destinations",
    description: "Palmarès des destinations les plus fréquentes.",
    Icone: Compass,
    disponible: true,
  },
  {
    numero: 5,
    href: "/rapports/repartition-zone",
    titre: "Répartition par zone",
    description: "Missions réparties sur les 4 zones du barème.",
    Icone: MapPinned,
    disponible: true,
  },
  {
    numero: 6,
    href: "/rapports/suivi",
    titre: "Suivi du processus",
    description: "Part de chaque statut (en attente, confirmé, annulé…) sur la période.",
    Icone: PieChart,
    disponible: true,
  },
  {
    numero: 7,
    href: "/rapports/om-attente",
    titre: "OM en attente vieillissants",
    description: "Les ordres de mission en attente les plus anciens, à relancer.",
    Icone: Clock,
    disponible: true,
  },
  {
    numero: 8,
    href: "/rapports/missions-employe",
    titre: "Missions par employé",
    description: "Tableau paginé, cherchable, exportable.",
    Icone: Table2,
    disponible: true,
  },
  {
    numero: 9,
    href: "/rapports/absence-direction",
    titre: "Jours d'absence par direction",
    description: "Comparer les jours cumulés de mission entre directions.",
    Icone: Users,
    disponible: true,
  },
  {
    numero: 10,
    href: "/rapports/carte",
    titre: "Carte du monde",
    description: "Nombre de missions par continent, avec zoom par pays.",
    Icone: Map,
    disponible: true,
  },
  {
    numero: 11,
    href: "/rapports/frise",
    titre: "Frise chronologique",
    description: "Nombre de missions par année, avec détail par mois.",
    Icone: CalendarDays,
    disponible: true,
  },
  {
    numero: 12,
    href: "/rapports/pyramide",
    titre: "Pyramide hiérarchique",
    description: "Nombre de missions par statut, avec détail par employé.",
    Icone: BarChart3,
    disponible: true,
  },
];

export default function RapportsPage() {
  const nbDisponibles = RAPPORTS.filter((r) => r.disponible).length;

  return (
    <div className={conteneurLargeClass}>
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
        {RAPPORTS.map((r) =>
          r.disponible ? (
            <Link
              key={r.href}
              href={r.href}
              className={`${carteClass} hover:shadow-lg transition-shadow`}
            >
              <div className="flex items-center gap-2 text-amber-700">
                <r.Icone size={18} aria-hidden="true" />
                <h2 className="font-semibold text-lg">{r.titre}</h2>
              </div>
              <p className="text-sm text-gray-600">{r.description}</p>
            </Link>
          ) : (
            <div
              key={r.href}
              aria-disabled="true"
              className={`${carteClass} opacity-50 cursor-not-allowed select-none`}
            >
              <div className="flex items-center gap-2 text-gray-500">
                <r.Icone size={18} aria-hidden="true" />
                <h2 className="font-semibold text-lg">{r.titre}</h2>
              </div>
              <p className="text-sm text-gray-500">{r.description}</p>
              <p className="text-xs text-gray-400">Pas encore construit</p>
            </div>
          )
        )}
      </div>

      <p className="text-sm text-blue-900/70">
        {nbDisponibles} rapport{nbDisponibles > 1 ? "s" : ""} sur {RAPPORTS.length} du catalogue
        (MODELE-DONNEES.md §11) {nbDisponibles > 1 ? "sont" : "est"} disponible
        {nbDisponibles > 1 ? "s" : ""}.
        {nbDisponibles < RAPPORTS.length && " Les autres suivent à l'étape 12."}
      </p>
    </div>
  );
}
