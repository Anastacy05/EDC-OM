import { getStatuts, getDepartements } from "@/lib/data/referentiels";
import { titrePageClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import FormulaireEmploye from "../FormulaireEmploye";

export const metadata = { title: "Ajouter un employé — EDC OM" };

/**
 * Création d'un employé.
 *
 * L'accès est déjà refusé aux non-administrateurs par `app/personnel/layout.tsx`,
 * et l'action de création porte sa propre garde. Cette page n'a donc rien à
 * vérifier elle-même : elle ne lit que des référentiels publics.
 */
export default async function NouvelEmployePage() {
  const [statuts, departements] = await Promise.all([getStatuts(), getDepartements()]);

  return (
    <div className="flex min-h-full w-full flex-col gap-6 bg-blue-50 p-6 sm:p-10">
      <RetourVers href="/personnel" libelle="Retour à la liste du personnel" />

      <h1 className={titrePageClass}>Ajouter un employé</h1>

      <p className="max-w-3xl text-sm text-blue-900/80">
        L&apos;employé est <strong>ajouté</strong>, pas créé : son matricule vient du
        service du personnel. Le compte d&apos;accès à l&apos;application se crée
        ensuite, depuis sa fiche.
      </p>

      <FormulaireEmploye statuts={statuts} departements={departements} />
    </div>
  );
}
