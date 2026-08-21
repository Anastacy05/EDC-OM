import { exigerAdministrateur } from "@/lib/auth/garde";

/**
 * Protège `/parametres`.
 *
 * ⚠️ Un layout n'est PAS une barrière suffisante, et la doc dit exactement
 * pourquoi :
 *
 *   « Due to Partial Rendering, be cautious when doing checks in Layouts as
 *     these don't re-render on navigation, meaning the user session won't be
 *     checked on every route change. »
 *
 * Concrètement : une fois ce layout rendu, une navigation interne à la section
 * ne le réexécute pas. Un compte rétrogradé entre-temps ne serait pas arrêté ici.
 *
 * Ce contrôle est là pour ce qu'il sait faire — refuser l'entrée dans la
 * section — et il est doublé :
 *   • en amont par le proxy, qui filtre les préfixes réservés sur le rôle du
 *     jeton (déduits de `lib/navigation.ts`, donc jamais oubliés) ;
 *   • en aval par les gardes du DAL, seules à s'exécuter à chaque lecture.
 *
 * Il est provisoire à un autre titre : cette page est aujourd'hui un composant
 * CLIENT qui lit `localStorage`. Elle n'a donc aucun accès serveur à contrôler.
 * Quand elle passera en composant serveur (étape 9 de l'ordre de migration), la
 * vraie protection sera dans les fonctions de lecture, et ce layout ne servira
 * plus qu'à éviter un aller-retour inutile.
 */
export default async function ParametresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await exigerAdministrateur();
  return children;
}
