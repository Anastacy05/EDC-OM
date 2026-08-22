import { Suspense } from "react";
import Link from "next/link";
import { UserPlus, CircleSlash, MailWarning, Pencil } from "lucide-react";
import { listerPersonnel, PAR_PAGE } from "@/lib/data/employes";
import { getStatuts, getDepartements } from "@/lib/data/referentiels";
import { libelleMotifSortie } from "@/lib/data/employes.validation";
import { boutonPrimaire, carteClass, titrePageClass, TAILLE_ICONE } from "@/lib/styles";
import FiltresPersonnel from "./FiltresPersonnel";
import Pagination from "./Pagination";

/**
 * Liste du personnel.
 *
 * ── Composant serveur, et c'est le point important ───────────────────────────
 *
 * Premier écran de l'application à lire la base directement plutôt que
 * `localStorage`. Le filtrage ET la pagination se font donc en SQL : avec plus de
 * 400 employés, seule la page demandée traverse le réseau.
 *
 * ── Pourquoi `<Suspense>` autour du tableau ──────────────────────────────────
 *
 * Deux raisons qui se rejoignent. D'abord `useSearchParams` dans la barre de
 * filtres exige une frontière — sans elle, `next build` échoue au prérendu
 * (« missing-suspense-with-csr-bailout »), défaut invisible en `next dev` où les
 * routes sont rendues à la demande. Ensuite la requête est dynamique : la
 * frontière laisse partir le titre et les filtres avant que la base ait répondu.
 */

export const metadata = { title: "Personnel — EDC OM" };

/** Paramètres d'URL reconnus par cet écran. */
interface Recherche {
  q?: string;
  statut?: string;
  direction?: string;
  inactifs?: string;
  page?: string;
}

export default async function PersonnelPage({
  searchParams,
}: {
  searchParams: Promise<Recherche>;
}) {
  const filtres = await searchParams;

  // Les référentiels sont chargés ici et non dans la barre : celle-ci est un
  // composant client, qui ne peut pas importer le DAL.
  const [statuts, departements] = await Promise.all([getStatuts(), getDepartements()]);

  return (
    <div className="flex min-h-full w-full flex-col gap-6 bg-blue-50 p-6 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className={titrePageClass}>Personnel</h1>
        <Link href="/personnel/nouveau" className={boutonPrimaire}>
          <UserPlus size={TAILLE_ICONE} aria-hidden="true" />
          Ajouter un employé
        </Link>
      </div>

      <Suspense fallback={<div className="h-10" />}>
        <FiltresPersonnel statuts={statuts} departements={departements} />
      </Suspense>

      <Suspense key={JSON.stringify(filtres)} fallback={<SqueletteTableau />}>
        <Tableau filtres={filtres} />
      </Suspense>
    </div>
  );
}

/**
 * Le tableau, isolé pour que son attente ne retienne pas les filtres.
 *
 * La `key` du `<Suspense>` parent dépend des filtres : c'est ce qui fait
 * réapparaître le squelette à chaque changement de filtre, au lieu de laisser
 * l'ancienne liste affichée pendant la nouvelle requête — ce qui donnerait
 * l'impression que le filtre n'a pas été pris en compte.
 */
async function Tableau({ filtres }: { filtres: Recherche }) {
  // `Number.parseInt` sur un paramètre d'URL : `?page=abc` donne `NaN`, que le
  // DAL ramène à 1. On ne fait donc aucune confiance à la valeur reçue.
  const page = Number.parseInt(filtres.page ?? "1", 10);

  const { employes, total, page: pageServie, nombrePages } = await listerPersonnel({
    recherche: filtres.q,
    codeStatut: filtres.statut,
    codeDepartement: filtres.direction,
    inclureInactifs: filtres.inactifs === "1",
    page,
  });

  if (employes.length === 0) {
    // Une page vide au-delà de la dernière n'est pas la même chose qu'un filtre
    // sans résultat : dans un cas il faut revenir en arrière, dans l'autre
    // élargir la recherche. Les confondre enverrait l'utilisateur au mauvais
    // endroit.
    const auDela = total > 0 && pageServie > nombrePages;

    return (
      <div className={carteClass}>
        {auDela ? (
          <p className="text-sm text-gray-600">
            Cette page n&apos;existe pas : la liste n&apos;en compte que {nombrePages}.{" "}
            <Link href="/personnel" className="text-blue-700 underline">
              Revenir à la première
            </Link>
            .
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            Aucun employé ne correspond. Élargissez la recherche, ou{" "}
            <Link href="/personnel/nouveau" className="text-blue-700 underline">
              ajoutez un employé
            </Link>
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={`${carteClass} overflow-x-auto p-0`}>
        {/* `tabular-nums` : les matricules s'alignent en colonne, chiffre sous
            chiffre, ce qu'une police proportionnelle ne fait pas. */}
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">
            Liste du personnel, {total} employé{total > 1 ? "s" : ""} au total, page{" "}
            {pageServie} sur {nombrePages}
          </caption>
          <thead>
            <tr className="border-b border-blue-200 text-left text-blue-900">
              {/* `scope="col"` : sans lui, un lecteur d'écran n'associe pas les
                  cellules à leur en-tête, et un tableau devient une suite de mots. */}
              <th scope="col" className="px-4 py-3 font-semibold">Matricule</th>
              <th scope="col" className="px-4 py-3 font-semibold">Nom et prénoms</th>
              <th scope="col" className="px-4 py-3 font-semibold">Fonction</th>
              <th scope="col" className="px-4 py-3 font-semibold">Statut</th>
              <th scope="col" className="px-4 py-3 font-semibold">Direction</th>
              <th scope="col" className="px-4 py-3 font-semibold">Compte</th>
              <th scope="col" className="px-4 py-3 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {employes.map((e) => (
              <tr
                key={e.matricule}
                className={`border-b border-blue-100 last:border-0 hover:bg-blue-50/60 ${
                  e.actif ? "" : "bg-slate-50 text-slate-500"
                }`}
              >
                <td className="px-4 py-3 font-mono">{e.matricule}</td>
                <td className="px-4 py-3">
                  <span className="font-medium">{e.nom}</span> {e.prenoms}
                  {/* État « désactivé » porté par une ICÔNE et un MOT, jamais par
                      la seule couleur du fond : mesuré le 20/08/2026, l'écart de
                      teinte entre rouge et vert tombe à ΔE 4,7 en deutéranopie,
                      sous le plancher de 6. La règle vaut pour tout état. */}
                  {!e.actif && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">
                      <CircleSlash size={12} aria-hidden="true" />
                      {/* Le motif quand il existe : « Désactivé » seul obligeait
                          à ouvrir chaque fiche pour distinguer une retraite
                          d'une suspension. */}
                      {libelleMotifSortie(e.motifSortie) ?? "Désactivé"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{e.fonction}</td>
                <td className="px-4 py-3">{e.statut}</td>
                <td className="px-4 py-3">{e.departement}</td>
                <td className="px-4 py-3">
                  {!e.aUnCompte ? (
                    <span className="text-slate-500">Aucun</span>
                  ) : e.compteEnAttente ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                      <MailWarning size={12} aria-hidden="true" />
                      Invitation en attente
                    </span>
                  ) : (
                    <span className="text-blue-900">Actif</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/personnel/${encodeURIComponent(e.matricule)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-blue-700
                               transition-colors duration-200 hover:bg-blue-100
                               focus-visible:outline-none focus-visible:ring-2
                               focus-visible:ring-blue-500"
                  >
                    <Pencil size={14} aria-hidden="true" />
                    {/* Le nom dans le libellé accessible : sans lui, la colonne
                        donne autant de liens « Modifier » identiques que de
                        lignes, indistinguables hors contexte visuel. */}
                    <span aria-hidden="true">Modifier</span>
                    <span className="sr-only">
                      Modifier la fiche de {e.nom} {e.prenoms}
                    </span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={pageServie}
        nombrePages={nombrePages}
        total={total}
        parPage={PAR_PAGE}
        base="/personnel"
        parametres={{
          q: filtres.q,
          statut: filtres.statut,
          direction: filtres.direction,
          inactifs: filtres.inactifs,
        }}
      />
    </>
  );
}

function SqueletteTableau() {
  return (
    <div className={carteClass}>
      <p className="text-sm text-gray-500">Chargement du personnel…</p>
    </div>
  );
}
