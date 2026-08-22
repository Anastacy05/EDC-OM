import { notFound } from "next/navigation";
import { CircleSlash, CheckCircle2 } from "lucide-react";
import { lireFicheEmploye } from "@/lib/data/employes";
import { getStatuts, getDepartements } from "@/lib/data/referentiels";
import { VALIDITE_JETON_HEURES } from "@/lib/data/utilisateurs";
import { libelleMotifSortie } from "@/lib/data/employes.validation";
import { titrePageClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import FormulaireEmploye from "../FormulaireEmploye";
import BlocCompte from "./BlocCompte";
import BlocActivation from "./BlocActivation";

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
            {/* Le motif dans l'étiquette : c'est l'information qu'on cherche en
                arrivant sur une fiche éteinte. « Désactivé » seul obligeait à
                descendre en bas de page pour savoir de quoi il s'agit. */}
            {libelleMotifSortie(fiche.motifSortie) ?? "Désactivé"}
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

      <BlocActivation fiche={fiche} />
    </div>
  );
}
