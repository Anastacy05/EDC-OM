import { exigerAdministrateur } from "@/lib/auth/garde";

/**
 * Protège `/personnel` et ses sous-routes.
 *
 * Les dossiers du personnel contiennent des données personnelles — date de
 * naissance, situation de famille, indice. Réservés à l'administrateur, avec une
 * exception traitée ailleurs : `lireFicheEmploye` autorise un agent à consulter
 * SON propre dossier, contrôle qui vit dans le DAL parce que c'est le seul
 * endroit qui connaît le matricule demandé.
 *
 * ⚠️ Mêmes limites que les autres layouts de section : le rendu partiel fait
 * qu'il ne se rejoue pas d'une page à l'autre de la section. La protection réelle
 * est dans `lib/data/employes.ts`, où chaque fonction porte sa garde.
 */
export default async function PersonnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await exigerAdministrateur();
  return children;
}
