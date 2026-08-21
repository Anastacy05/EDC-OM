import { notFound } from "next/navigation";
import { CircleSlash, RotateCcw, CheckCircle2 } from "lucide-react";
import { lireFicheEmploye } from "@/lib/data/employes";
import { getStatuts, getDepartements } from "@/lib/data/referentiels";
import { VALIDITE_JETON_HEURES } from "@/lib/data/utilisateurs";
import { actionDesactiverEmploye, actionReactiverEmploye } from "@/app/personnel/actions";
import { carteClass, legendClass, titrePageClass, boutonDanger, boutonSecondaire, TAILLE_ICONE } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import FormulaireEmploye from "../FormulaireEmploye";
import BlocCompte from "./BlocCompte";

/**
 * Fiche employé : modification, compte d'accès, activation.
 *
 * `notFound()` plutôt qu'un message : il rend un 404 réel, avec le bon code HTTP.
 * Un matricule inexistant et un matricule interdit y mènent tous deux — c'est
 * volontaire, distinguer les deux révélerait quels matricules existent.
 */
export default async function FicheEmployePage({
  params,
  searchParams,
}: {
  params: Promise<{ matricule: string }>;
  searchParams: Promise<{ cree?: string }>;
}) {
  const { matricule } = await params;
  const { cree } = await searchParams;

  const fiche = await lireFicheEmploye(decodeURIComponent(matricule));
  if (!fiche) notFound();

  const [statuts, departements] = await Promise.all([getStatuts(), getDepartements()]);

  return (
    <div className="flex min-h-full w-full flex-col gap-6 bg-blue-50 p-6 sm:p-10">
      <RetourVers href="/personnel" libelle="Retour à la liste du personnel" />

      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className={titrePageClass}>
          {fiche.nom} {fiche.prenoms}
        </h1>
        <span className="font-mono text-sm text-blue-900/70">{fiche.matricule}</span>
        {!fiche.actif && (
          <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-1 text-xs text-slate-700">
            <CircleSlash size={12} aria-hidden="true" />
            Désactivé
          </span>
        )}
      </div>

      {/* Confirmation après création. Portée par l'URL et non par un état : la
          page vient d'être atteinte par une redirection, il n'y a pas d'état
          client à transporter. */}
      {cree === "1" && (
        <p
          role="status"
          className="flex max-w-3xl items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900"
        >
          <CheckCircle2 size={18} aria-hidden="true" className="shrink-0" />
          Employé ajouté. Créez son compte d&apos;accès ci-dessous pour qu&apos;il puisse se
          connecter.
        </p>
      )}

      <BlocCompte fiche={fiche} validiteHeures={VALIDITE_JETON_HEURES} />

      <FormulaireEmploye fiche={fiche} statuts={statuts} departements={departements} />

      {/* ── Activation ──────────────────────────────────────────────────────── */}
      <section className={`${carteClass} max-w-3xl`}>
        <h2 className={legendClass}>
          {fiche.actif ? "Désactiver cet employé" : "Réactiver cet employé"}
        </h2>

        {fiche.actif ? (
          <>
            <p className="text-sm text-blue-900/80">
              La fiche n&apos;est <strong>jamais supprimée</strong> : les ordres de mission
              déjà signés y font référence, et un OM signé par le Directeur général reste un
              acte d&apos;autorité même après un départ.
            </p>
            <p className="text-sm text-blue-900/80">
              La désactivation ferme immédiatement l&apos;accès : le compte est désactivé, les
              sessions en cours sont révoquées, et les invitations non utilisées sont
              annulées.
            </p>
            {/* `<form>` et non `onClick` : c'est une mutation serveur. En POST,
                elle n'est pas déclenchable par une simple balise <img> pointant
                sur une URL, ce qui serait le cas d'un GET. */}
            <form action={actionDesactiverEmploye}>
              <input type="hidden" name="matricule" value={fiche.matricule} />
              <button type="submit" className={boutonDanger}>
                <CircleSlash size={TAILLE_ICONE} aria-hidden="true" />
                Désactiver
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-blue-900/80">
              La réactivation rend l&apos;accès au compte tel qu&apos;il était.{" "}
              <strong>Le mot de passe n&apos;est pas réinitialisé</strong> — émettez un
              nouveau lien ci-dessus si le compte doit repartir de zéro.
            </p>
            <form action={actionReactiverEmploye}>
              <input type="hidden" name="matricule" value={fiche.matricule} />
              <button type="submit" className={boutonSecondaire}>
                <RotateCcw size={TAILLE_ICONE} aria-hidden="true" />
                Réactiver
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
