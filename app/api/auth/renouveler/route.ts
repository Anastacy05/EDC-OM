import { NextResponse, type NextRequest } from "next/server";
import { renouvelerSession } from "@/lib/auth/session";
import { COOKIE_ACCES, COOKIE_RENOUVELLEMENT } from "@/lib/auth/jeton";
import { cheminDeRetourSur } from "@/lib/auth/redirection";

/**
 * Renouvellement de session.
 *
 * ── Pourquoi cette route existe ──────────────────────────────────────────────
 *
 * Le renouvellement doit faire deux choses que presque aucun contexte Next ne
 * permet en même temps : interroger la base, et écrire des cookies.
 *
 *   • composant serveur → lit la base, mais Next INTERDIT d'y modifier un
 *     cookie pendant le rendu ;
 *   • proxy → écrit des cookies, mais la doc déconseille d'y toucher la base,
 *     et il ne peut pas importer un module `server-only` ;
 *   • Server Action → les deux, mais il faut une soumission de formulaire ;
 *   • Route Handler → les deux, sur une simple navigation. C'est celui-ci.
 *
 * Le proxy y redirige quand le jeton d'accès a expiré alors que le jeton de
 * renouvellement est encore là. L'utilisateur ne voit qu'une navigation.
 *
 * ── Pourquoi un GET, alors qu'un GET ne devrait rien modifier ────────────────
 *
 * Parce que le déclencheur est une redirection de navigation, qui est
 * nécessairement un GET. L'effet de bord est borné : renouveler la session de
 * l'appelant à partir d'un cookie qu'il possède déjà. Un tiers qui forcerait
 * cette URL sur le navigateur d'un employé ne ferait que… prolonger sa propre
 * session légitime. Aucune donnée métier n'est touchée.
 */
export async function GET(requete: NextRequest) {
  const suite = cheminDeRetourSur(requete.nextUrl.searchParams.get("suite"));

  // Garde-fou anti-boucle : si `suite` désignait cette route, un renouvellement
  // en échec renverrait ici indéfiniment.
  const destination = suite.startsWith("/api/auth/") ? "/" : suite;

  const session = await renouvelerSession();

  if (!session) {
    // Jeton inconnu, révoqué hors fenêtre de grâce, expiré, ou compte
    // désactivé. On efface les deux cookies : les laisser ferait re-tenter le
    // renouvellement à chaque navigation.
    const versConnexion = new URL("/connexion", requete.nextUrl);
    versConnexion.searchParams.set("retour", destination);
    versConnexion.searchParams.set("motif", "expiree");
    const reponse = NextResponse.redirect(versConnexion);
    reponse.cookies.delete(COOKIE_ACCES);
    reponse.cookies.delete(COOKIE_RENOUVELLEMENT);
    return reponse;
  }

  // `renouvelerSession()` a déjà posé les cookies via `cookies()`. Next les
  // reporte sur cette réponse, il n'y a rien à recopier ici.
  //
  // Pas de mise en cache : la réponse dépend de cookies et pose des cookies.
  // Un intermédiaire qui la garderait servirait la session d'un employé à un
  // autre — le pire défaut possible pour cette route.
  const reponse = NextResponse.redirect(new URL(destination, requete.nextUrl));
  reponse.headers.set("Cache-Control", "no-store, private");
  return reponse;
}
