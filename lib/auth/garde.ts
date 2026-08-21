import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { renouvelerSession } from "@/lib/auth/session";
import { lireJetonAcces, NOMS_COOKIES, EN_TETE_CHEMIN, type Session, type Role } from "@/lib/auth/jeton";

/**
 * Garde d'autorisation. **À appeler dans CHAQUE fonction qui lit ou écrit des
 * données, sans exception.**
 *
 * La doc Next 16 est catégorique là-dessus, et c'est contre-intuitif :
 *
 *   « Server Functions are reachable via direct POST requests, not just through
 *     your application's UI. Always verify authentication and authorization
 *     inside every Server Function. »
 *
 * Autrement dit : masquer un bouton dans l'interface ne protège rien. Une Server
 * Function est une route HTTP joignable directement. La vérification doit donc
 * vivre au plus près de la donnée — ici — et pas dans le composant qui l'affiche.
 *
 * Le proxy (`proxy.ts`) fait un premier tri, mais il ne remplace pas ces
 * gardes, et la doc dit pourquoi : « A matcher change or a refactor that moves a
 * Server Function to a different route can silently remove Proxy coverage. »
 *
 * `cache()` de React mémoïse le résultat pour la durée d'UNE requête : appeler
 * `exigerSession()` dans dix fonctions différentes ne vérifie le jeton qu'une
 * fois. C'est ce qui rend la règle « partout » tenable sans coût.
 */

/**
 * Session courante, ou `null`. Ne redirige pas — pour les cas où l'absence de
 * session est un état normal (page de connexion, affichage conditionnel).
 */
export const lireSession = cache(async (): Promise<Session | null> => {
  const boite = await cookies();
  const session = await lireJetonAcces(boite.get(NOMS_COOKIES.acces)?.value);
  if (session) return session;

  // Jeton d'accès absent ou expiré : on tente le renouvellement, qui relit
  // l'état du compte en base et échoue si celui-ci a été désactivé.
  //
  // ⚠️ Ne réussit QUE depuis un contexte autorisé à écrire des cookies : Server
  // Action ou Route Handler. Pendant le rendu d'un composant serveur, Next
  // interdit la modification de cookies et lève — d'où le try/catch, qui rend
  // alors `null`.
  //
  // Ce n'est pas une faille mais une répartition : sur une navigation (GET), le
  // renouvellement a déjà eu lieu dans le proxy, qui redirige vers
  // /api/auth/renouveler avant que le rendu ne commence. Il ne reste donc ici
  // que le cas des Server Actions, où l'écriture est justement permise.
  try {
    return await renouvelerSession();
  } catch {
    return null;
  }
});

/**
 * Chemin demandé, publié par le proxy dans un en-tête de requête.
 *
 * Un composant serveur ne connaît pas l'URL courante : il n'y a pas
 * d'équivalent serveur à `usePathname()`. Sans cet en-tête, la redirection vers
 * la connexion perdrait la destination voulue et ramènerait tout le monde à
 * l'accueil après authentification.
 */
async function cheminCourant(): Promise<string | null> {
  try {
    return (await headers()).get(EN_TETE_CHEMIN);
  } catch {
    return null; // hors contexte de requête (rendu statique)
  }
}

/**
 * Session courante, ou redirection vers la page de connexion.
 *
 * `redirect()` lève une exception interceptée par Next : le code qui suit
 * l'appel n'est jamais atteint. C'est ce qui rend cette garde fiable — pas
 * besoin de se souvenir d'un `return` après.
 */
export const exigerSession = cache(async (): Promise<Session> => {
  const session = await lireSession();
  if (session) return session;

  const chemin = await cheminCourant();
  redirect(chemin ? `/connexion?retour=${encodeURIComponent(chemin)}` : "/connexion");
});

/**
 * Exige le rôle administrateur.
 *
 * Utilisé pour tout ce que `ref.txt` réserve à l'admin : confirmer un OM, gérer
 * le personnel, valider un congé, régler l'âge de retraite.
 *
 * Redirige vers l'accueil et non vers la connexion : l'utilisateur EST
 * authentifié, il n'a simplement pas le droit. Le renvoyer se connecter serait
 * trompeur, et lui répondre 403 en pleine navigation aussi.
 */
export const exigerAdministrateur = cache(async (): Promise<Session> => {
  const session = await exigerSession();
  if (session.role !== "ADMINISTRATEUR") redirect("/?acces=refuse");
  return session;
});

/**
 * Variante sans redirection, pour les Server Actions : lever une erreur plutôt
 * que rediriger permet de renvoyer un message exploitable au formulaire.
 */
export async function exigerAdministrateurOuEchouer(): Promise<Session> {
  const session = await lireSession();
  if (!session) throw new Error("Non authentifié.");
  if (session.role !== "ADMINISTRATEUR") {
    throw new Error("Action réservée à l'administrateur.");
  }
  return session;
}

/**
 * Vrai si la session peut agir sur les données de ce matricule.
 *
 * Un administrateur voit tout ; un utilisateur ne voit que SES propres OM et
 * congés. Sans ce contrôle, changer un identifiant dans l'URL suffirait à lire
 * le dossier d'un collègue — c'est exactement le défaut d'autorisation que la
 * doc appelle à traiter dans la couche de données.
 */
export function peutAccederAuMatricule(session: Session, matricule: string): boolean {
  if (session.role === "ADMINISTRATEUR") return true;
  return session.matricule !== null && session.matricule === matricule;
}

export type { Session, Role };
