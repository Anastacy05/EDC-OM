"use client";

import Link from "next/link";
import { AlertTriangle, Printer } from "lucide-react";
import type { LigneOMEnAttente } from "@/lib/data/rapports";
import { joursDepuis } from "@/lib/analytics";
import { formatDateFR } from "@/lib/dateUtils";
import { carteClass } from "@/lib/styles";
import BadgeStatut from "@/app/om/BadgeStatut";

/**
 * Partie interactive de la page n° 7 : `joursDepuis` recalculerait un âge
 * différent selon l'heure de génération si elle tournait côté serveur avec un
 * cache — en client, l'affichage suit toujours « maintenant » sur le poste de
 * qui regarde. Reçoit les lignes déjà lues en base par le composant serveur
 * parent (lib/data/rapports.ts).
 */
export default function OMEnAttenteInteractif({ lignes }: { lignes: LigneOMEnAttente[] }) {
  return (
    <>
      {lignes.length === 0 ? (
        <p className={`${carteClass} max-w-2xl text-gray-500 text-sm`}>
          Aucun ordre de mission en attente. Rien à relancer.
        </p>
      ) : (
        <div className={`${carteClass} max-w-4xl`}>
          <div className="flex justify-end print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900"
            >
              <Printer size={14} aria-hidden="true" />
              Imprimer
            </button>
          </div>
          <table className="w-full text-sm">
            <caption className="sr-only">Ordres de mission en attente, du plus ancien au plus récent</caption>
            <thead>
              <tr className="text-left text-gray-600 border-b border-blue-100">
                <th className="py-2 font-medium">N° OM</th>
                <th className="py-2 font-medium">Employé</th>
                <th className="py-2 font-medium">Destination</th>
                <th className="py-2 font-medium text-right tabular-nums">Départ</th>
                <th className="py-2 font-medium text-right tabular-nums">Émis il y a</th>
                <th className="py-2 font-medium print:hidden" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const jours = joursDepuis(l.dateEmission);
                return (
                  <tr key={`${l.idOrdreMission}-${l.matricule}`} className="border-b border-blue-50 last:border-0">
                    <td className="py-2 font-mono text-xs">{l.numeroOM}</td>
                    <td className="py-2">
                      {l.nom} {l.prenoms}
                    </td>
                    <td className="py-2">{l.destination}</td>
                    <td className="py-2 text-right tabular-nums text-gray-600">
                      {formatDateFR(l.dateDepart)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <span className={jours >= 14 ? "text-red-700 font-semibold" : "text-gray-700"}>
                        {jours} jour{jours > 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="py-2 print:hidden">
                      <Link
                        href={`/om/${l.idOrdreMission}?participant=${encodeURIComponent(l.matricule)}`}
                        className="inline-block hover:opacity-80"
                      >
                        {l.bloque ? (
                          <BadgeStatut statut="EN_ATTENTE" bloque />
                        ) : (
                          <span className="text-blue-700 underline hover:no-underline whitespace-nowrap">
                            Voir l&apos;OM
                          </span>
                        )}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {lignes.some((l) => l.bloque) && (
            <p className="flex items-center gap-2 text-sm text-red-700 print:hidden">
              <AlertTriangle size={14} aria-hidden="true" />
              Les lignes bloquées ont un conflit à arbitrer avant de pouvoir être confirmées —
              cliquer sur le badge mène à la fiche.
            </p>
          )}
        </div>
      )}
    </>
  );
}
