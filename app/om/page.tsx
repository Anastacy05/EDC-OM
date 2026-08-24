import { Suspense } from "react";
import Link from "next/link";
import { FilePlus2, AlertTriangle } from "lucide-react";
import { listerOM } from "@/lib/data/om";
import { lireSession } from "@/lib/auth/garde";
import { getStatuts, getDepartements, getPaysOptions } from "@/lib/data/referentiels";
import { PAR_PAGE_OM } from "@/lib/numeroOM";
import { formatDateFR } from "@/lib/dateUtils";
import { libelleDepartement } from "@/lib/referentiels";
import { boutonPrimaire, carteClass, titrePageClass, TAILLE_ICONE } from "@/lib/styles";
import FiltresOM from "./FiltresOM";
import BadgeStatut from "./BadgeStatut";
import Pagination from "@/app/personnel/Pagination";

/**
 * Liste des ordres de mission.
 *
 * ── Composant SERVEUR : ce que ça corrige ────────────────────────────────────
 *
 * L'écran précédent était client et lisait `mockOMs`, donc `localStorage`. Deux
 * défauts que la bascule ferme :
 *
 *   1. **La portée était un navigateur.** Un OM créé sur un poste n'existait pas
 *      sur l'autre. La détection de conflit lisant la même source, deux agents
 *      pouvaient créer deux OM confirmés sur la même période pour le même employé
 *      sans qu'aucun avertissement n'apparaisse — l'inverse exact de la garantie
 *      annoncée par MODELE-DONNEES.md.
 *   2. **Toutes les participations partaient au navigateur** avant d'y être
 *      filtrées, et l'écran n'en montrait qu'une partie : ce qui était caché était
 *      quand même lisible dans l'onglet réseau. Le filtrage et la pagination sont
 *      maintenant dans le SQL — la page ne reçoit que ses 25 lignes.
 *
 * ── La liste montre TOUS les OM, à tout le monde (24/08/2026) ────────────────
 *
 * Un agent y voit les missions de ses collègues, et c'est voulu : il doit pouvoir
 * en télécharger le document, parce que c'est souvent lui qui prépare le dossier.
 * `?matricule=` est donc un filtre de confort, plus une restriction. Les boutons
 * d'action, eux, ne sont rendus que pour un administrateur.
 *
 * ── Ce que cet écran ne fait plus ────────────────────────────────────────────
 *
 * `useEstMonte` disparaît : il n'existait que pour éviter une discordance
 * d'hydratation en lisant `localStorage`. Sans `localStorage`, plus de discordance.
 */

export const metadata = { title: "Ordres de mission — EDC OM" };

/** Paramètres d'URL reconnus par cet écran. */
interface Recherche {
  q?: string;
  statut?: string;
  poste?: string;
  direction?: string;
  pays?: string;
  ville?: string;
  debut?: string;
  fin?: string;
  dureeMin?: string;
  dureeMax?: string;
  matricule?: string;
  bloques?: string;
  page?: string;
}

export default async function OMListePage({
  searchParams,
}: {
  searchParams: Promise<Recherche>;
}) {
  const filtres = await searchParams;

  // Les référentiels sont chargés ici et non dans la barre : celle-ci est un
  // composant client, qui ne peut pas importer le DAL.
  const [statuts, departements, pays, session] = await Promise.all([
    getStatuts(),
    getDepartements(),
    getPaysOptions(),
    lireSession(),
  ]);

  return (
    <div className="flex min-h-full w-full flex-col gap-6 bg-blue-50 p-6 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className={titrePageClass}>Ordres de mission</h1>
        <Link href="/om/nouveau" className={boutonPrimaire}>
          <FilePlus2 size={TAILLE_ICONE} aria-hidden="true" />
          Nouvel ordre de mission
        </Link>
      </div>

      {/* `useSearchParams` dans la barre exige une frontière <Suspense> : sans
          elle, `next build` échoue au prérendu (« missing-suspense-with-csr-bailout »),
          défaut invisible en `next dev` où les routes sont rendues à la demande. */}
      <Suspense fallback={<div className="h-10" />}>
        <FiltresOM
          statuts={statuts}
          departements={departements}
          pays={pays}
          estAdministrateur={session?.role === "ADMINISTRATEUR"}
        />
      </Suspense>

      {/* La `key` dépend des filtres : c'est ce qui fait réapparaître le squelette
          à chaque changement, au lieu de laisser l'ancienne liste affichée pendant
          la nouvelle requête — ce qui donnerait l'impression que le filtre n'a pas
          été pris en compte. */}
      <Suspense key={JSON.stringify(filtres)} fallback={<SqueletteTableau />}>
        <Tableau filtres={filtres} />
      </Suspense>
    </div>
  );
}

/** Entier d'un paramètre d'URL, ou `undefined` — jamais `NaN`, que le DAL rejette. */
function entier(valeur: string | undefined): number | undefined {
  if (!valeur?.trim()) return undefined;
  const n = Number.parseInt(valeur, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function Tableau({ filtres }: { filtres: Recherche }) {
  const { lignes, total, page, nombrePages } = await listerOM({
    page: entier(filtres.page) ?? 1,
    recherche: filtres.q,
    statut: filtres.statut,
    codeStatut: filtres.poste,
    codeDepartement: filtres.direction,
    pays: filtres.pays,
    ville: filtres.ville,
    debut: filtres.debut,
    fin: filtres.fin,
    dureeMin: entier(filtres.dureeMin),
    dureeMax: entier(filtres.dureeMax),
    matricule: filtres.matricule,
    bloquesSeulement: filtres.bloques === "1",
  });

  if (lignes.length === 0) {
    // Une page vide au-delà de la dernière n'est pas la même chose qu'un filtre
    // sans résultat : dans un cas il faut revenir en arrière, dans l'autre élargir
    // la recherche. Les confondre enverrait l'utilisateur au mauvais endroit.
    const auDela = total > 0 && page > nombrePages;

    return (
      <div className={carteClass}>
        {auDela ? (
          <p className="text-sm text-gray-600">
            Cette page n&apos;existe pas : la liste n&apos;en compte que {nombrePages}.{" "}
            <Link href="/om" className="text-blue-700 underline">
              Revenir à la première
            </Link>
            .
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            Aucun ordre de mission ne correspond. Élargissez la recherche, ou{" "}
            <Link href="/om/nouveau" className="text-blue-700 underline">
              créez un ordre de mission
            </Link>
            .
          </p>
        )}
      </div>
    );
  }

  const bloques = lignes.filter((l) => l.blocageMotif !== null).length;

  return (
    <>
      {bloques > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p>
            <strong>
              {bloques} participation{bloques > 1 ? "s" : ""} bloquée
              {bloques > 1 ? "s" : ""} sur cette page.
            </strong>{" "}
            Un conflit de période avec une mission confirmée empêche la confirmation.
            Le document reste imprimable, mais il ne doit pas partir à la signature en
            l&apos;état.
          </p>
        </div>
      )}

      <div className={`${carteClass} overflow-x-auto p-0`}>
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">
            Ordres de mission, {total} participation{total > 1 ? "s" : ""} au total, page{" "}
            {page} sur {nombrePages}
          </caption>
          <thead>
            <tr className="border-b border-blue-200 text-left text-blue-900">
              {/* `scope="col"` : sans lui, un lecteur d'écran n'associe pas les
                  cellules à leur en-tête, et le tableau devient une suite de mots. */}
              <th scope="col" className="px-4 py-3 font-semibold">N° d&apos;OM</th>
              <th scope="col" className="px-4 py-3 font-semibold">Nom et prénoms</th>
              <th scope="col" className="px-4 py-3 font-semibold">Fonction</th>
              <th scope="col" className="px-4 py-3 font-semibold">Direction</th>
              <th scope="col" className="px-4 py-3 font-semibold">Destination</th>
              <th scope="col" className="px-4 py-3 font-semibold">Départ</th>
              <th scope="col" className="px-4 py-3 font-semibold">Retour</th>
              <th scope="col" className="px-4 py-3 font-semibold">Durée</th>
              <th scope="col" className="px-4 py-3 font-semibold">État</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              // La clé est le couple (mission, matricule) : c'est la clé primaire de
              // `participation`. L'ancien écran utilisait `participant.id`, qui
              // n'existe plus — la table n'a pas d'identifiant de substitution.
              <tr
                key={`${l.idOM}-${l.matricule}`}
                className="border-b border-blue-100 last:border-0 hover:bg-blue-50/60"
              >
                <td className="px-4 py-3 font-mono">
                  <Link
                    href={`/om/${l.idOM}?participant=${encodeURIComponent(l.matricule)}`}
                    className="text-blue-700 hover:underline"
                  >
                    {l.numeroOM}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium">{l.nom}</span> {l.prenoms}
                  <span className="ml-2 font-mono text-xs text-slate-500">{l.matricule}</span>
                </td>
                <td className="px-4 py-3">{l.fonction}</td>
                <td className="px-4 py-3" title={libelleDepartement(l.departement)}>
                  {l.departement}
                </td>
                <td className="px-4 py-3">{l.destination}</td>
                <td className="px-4 py-3">{formatDateFR(l.dateDepart)}</td>
                <td className="px-4 py-3">{formatDateFR(l.dateRetour)}</td>
                <td className="px-4 py-3">{l.dureeJours} j.</td>
                <td className="px-4 py-3">
                  <BadgeStatut statut={l.statut} bloque={l.blocageMotif !== null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        nombrePages={nombrePages}
        total={total}
        parPage={PAR_PAGE_OM}
        base="/om"
        libelle="participation"
        parametres={{
          q: filtres.q,
          statut: filtres.statut,
          poste: filtres.poste,
          direction: filtres.direction,
          pays: filtres.pays,
          ville: filtres.ville,
          debut: filtres.debut,
          fin: filtres.fin,
          dureeMin: filtres.dureeMin,
          dureeMax: filtres.dureeMax,
          matricule: filtres.matricule,
          bloques: filtres.bloques,
        }}
      />
    </>
  );
}

function SqueletteTableau() {
  return (
    <div className={carteClass}>
      <p className="text-sm text-gray-500">Chargement des ordres de mission…</p>
    </div>
  );
}
