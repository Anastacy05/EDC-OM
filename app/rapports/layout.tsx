import { exigerAdministrateur } from "@/lib/auth/garde";

/**
 * Protège `/rapports` et ses sous-routes.
 *
 * Les rapports agrègent les missions de TOUT le personnel — coûts par
 * direction, missions par employé, pyramide hiérarchique. Ce sont des données
 * qu'un agent n'a pas à voir sur ses collègues, d'où la réserve à
 * l'administrateur, comme pour `/parametres`.
 *
 * Mêmes limites que le layout de `/parametres` : le rendu partiel fait qu'il ne
 * se rejoue pas d'un rapport à l'autre. Voir le commentaire là-bas.
 */
export default async function RapportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await exigerAdministrateur();
  return children;
}
