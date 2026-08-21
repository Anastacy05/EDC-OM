import { exigerAdministrateur } from "@/lib/auth/garde";

/**
 * Protège toutes les routes sous `/admin`.
 *
 * ⚠️ Un layout n'est PAS une barrière suffisante, et la doc dit exactement
 * pourquoi :
 *
 *   « Due to Partial Rendering, be cautious when doing checks in Layouts as
 *     these don't re-render on navigation, meaning the user session won't be
 *     checked on every route change. »
 *
 * Concrètement : une fois ce layout rendu, naviguer de /admin/carte à
 * /admin/frise ne le réexécute pas. Un compte rétrogradé entre les deux ne
 * serait donc pas arrêté ici.
 *
 * Ce contrôle est là pour ce qu'il sait faire — refuser l'entrée dans la
 * section — et il est doublé :
 *   • en amont par le proxy, qui filtre `/admin` sur le rôle du jeton ;
 *   • en aval par les gardes du DAL, seules à s'exécuter à chaque lecture.
 *
 * Il est provisoire à un autre titre : les pages sous /admin sont aujourd'hui
 * des composants CLIENT qui lisent `localStorage`. Elles n'ont donc aucun accès
 * serveur à contrôler. Quand elles passeront en composants serveur (étape 9 de
 * l'ordre de migration), la vraie protection sera dans les fonctions de lecture,
 * et ce layout ne servira plus qu'à éviter un aller-retour inutile.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigerAdministrateur();
  return children;
}
