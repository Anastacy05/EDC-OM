import Link from "next/link";
import { titrePageClass, carteClass } from "@/lib/styles";

const RAPPORTS = [
  {
    href: "/admin/rapports/carte",
    titre: "Carte du monde",
    description: "Nombre de missions par continent, avec zoom par pays.",
  },
  {
    href: "/admin/rapports/frise",
    titre: "Frise chronologique",
    description: "Nombre de missions par année, avec détail par mois.",
  },
  {
    href: "/admin/rapports/pyramide",
    titre: "Pyramide hiérarchique",
    description: "Nombre de missions par statut, avec détail par employé.",
  },
];

export default function RapportsPage() {
  return (
    <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      <h1 className={titrePageClass}>Rapports</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl">
        {RAPPORTS.map((r) => (
          <Link key={r.href} href={r.href} className={`${carteClass} hover:shadow-lg transition-shadow`}>
            <h2 className="text-amber-600 font-semibold text-lg">{r.titre}</h2>
            <p className="text-sm text-gray-600">{r.description}</p>
          </Link>
        ))}
      </div>

      <Link href="/om" className="text-blue-700 hover:underline text-sm w-fit">
        ← Voir la liste complète des ordres de mission
      </Link>
    </div>
  );
}
