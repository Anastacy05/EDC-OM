import { notFound } from "next/navigation";
import { CircleSlash, CheckCircle2, AlertTriangle } from "lucide-react";
import { lireFicheEmploye } from "@/lib/data/employes";
import { getStatuts, getDepartements } from "@/lib/data/referentiels";
import { VALIDITE_JETON_HEURES } from "@/lib/data/utilisateurs";
import { libelleMotifSortie } from "@/lib/data/employes.validation";
import { conteneurFormClass, titrePageClass } from "@/lib/styles";
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
  searchParams: Promise<{ cree?: string; acces?: string }>;
}) {
  const { matricule } = await params;
  const { cree, acces } = await searchParams;

  const fiche = await lireFicheEmploye(decodeURIComponent(matricule));
  if (!fiche) notFound();

  const [statuts, departements] = await Promise.all([getStatuts(), getDepartements()]);

  return (
    <div className={conteneurFormClass}>
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
          {acces === "envoye"
            ? "Employé ajouté et accès ouvert : le lien de définition du mot de passe est parti par courriel."
            : "Employé ajouté. Créez son compte d'accès ci-dessous pour qu'il puisse se connecter."}
        </p>
      )}

      {/* Le sort de l'ouverture d'accès voyage en CODE dans l'URL, jamais en
          texte : la barre d'adresse est copiée et journalisée, et le lien de mot
          de passe est un secret. La reprise passe donc par le bloc ci-dessous,
          qui sait réémettre — et qui, lui, peut afficher le lien. */}
      {acces === "differe" && (
        <p
          role="status"
          className="flex max-w-3xl items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          Le compte est créé, mais le courriel n&apos;est pas parti. Il reste en file et
          sera retenté ; pour ne pas attendre, réémettez le lien ci-dessous — il
          s&apos;affichera à l&apos;écran.
        </p>
      )}

      {acces === "refuse" && (
        <p
          role="alert"
          className="flex max-w-3xl items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          La fiche est bien créée, mais le compte n&apos;a pas pu l&apos;être — l&apos;adresse
          est peut-être déjà rattachée à un autre compte. Reprenez l&apos;ouverture
          d&apos;accès ci-dessous.
        </p>
      )}

      <BlocCompte fiche={fiche} validiteHeures={VALIDITE_JETON_HEURES} />

      <FormulaireEmploye fiche={fiche} statuts={statuts} departements={departements} />

      <BlocActivation fiche={fiche} />
    </div>
  );
}
