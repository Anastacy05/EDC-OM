import { NextResponse, type NextRequest } from "next/server";
import {
  lireJetonAcces,
  COOKIE_ACCES,
  COOKIE_RENOUVELLEMENT,
  EN_TETE_CHEMIN,
} from "@/lib/auth/jeton";
import { PREFIXES_ADMIN, sectionActive } from "@/lib/navigation";

/**
 * Proxy — filtrage d'accès avant que la requête n'atteigne l'application.
 *
 * ⚠️ En Next 16, `middleware.ts` est déprécié et renommé `proxy.ts`. La doc est
 * nette sur l'intention du renommage : « We recommend users avoid relying on
 * Middleware unless no other options exist. » Ce fichier reste donc volontairement
 * mince.
 *
 * ── Ce qu'il fait, et ce qu'il ne fait PAS ───────────────────────────────────
 *
 * Il ne lit que les cookies. Aucun accès à la base, conformément à la doc :
 *
 *   « since Proxy runs on every route, including prefetched routes, it's
 *     important to only read the session from the cookie (optimistic checks),
 *     and avoid database checks to prevent performance issues. »
 *
 * Ce n'est donc PAS la sécurité de l'application. Elle est dans le DAL
 * (`lib/auth/garde.ts`), appelé par chaque page et chaque Server Action. La doc
 * insiste, et le cas est réel :
 *
 *   « A matcher change or a refactor that moves a Server Function to a
 *     different route can silently remove Proxy coverage. »
 *
 * Trois rôles, tous accessoires mais utiles :
 *
 *   1. Publier le chemin demandé dans un en-tête de requête. Un composant
 *      serveur ne connaît pas l'URL courante — sans ça, impossible de renvoyer
 *      l'utilisateur là où il allait après la connexion.
 *   2. Rediriger vers la connexion les requêtes sans aucune trace de session,
 *      sans faire travailler le rendu pour rien.
 *   3. Déclencher le renouvellement quand le jeton d'accès a expiré mais que le
 *      jeton de renouvellement est là — voir plus bas, c'est le point délicat.
 */

/**
 * Le nom de l'en-tête vit dans `lib/auth/jeton.ts` : `proxy.ts` n'exporte que
 * `proxy` et `config`, Next n'y attend rien d'autre.
 */

/** Route qui exécute le renouvellement (elle seule peut écrire des cookies). */
const ROUTE_RENOUVELLEMENT = "/api/auth/renouveler";

/**
 * Chemins accessibles sans session.
 *
 * Liste **blanche** et non noire : tout ce qui n'y figure pas exige une session.
 * Une route ajoutée demain est protégée par défaut — l'inverse ferait de chaque
 * nouvelle page un oubli possible.
 */
const PUBLICS = [
  "/", // page d'accueil : vitrine, ses boutons mènent à des pages protégées
  "/connexion",
  "/mot-de-passe", // et ses sous-chemins : /mot-de-passe/<jeton>
];

function estPublic(chemin: string): boolean {
  return PUBLICS.some((p) => chemin === p || (p !== "/" && chemin.startsWith(p + "/")));
}

/**
 * Réponse à opposer à une requête d'API non authentifiée.
 *
 * ⚠️ Défaut constaté à l'essai : rediriger un appel `fetch("/api/…")` vers
 * `/connexion` lui renvoie une page HTML avec un code 200. Le client, qui
 * attend du JSON ou un `.docx`, échoue alors sur une erreur d'analyse
 * incompréhensible — au lieu de voir qu'il n'est pas authentifié.
 *
 * Un 401 est la bonne réponse : il porte l'information, et le client peut
 * décider de recharger vers la connexion.
 */
function refusApi(): NextResponse {
  return NextResponse.json(
    { erreur: "Non authentifié." },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

export default async function proxy(requete: NextRequest) {
  const chemin = requete.nextUrl.pathname;

  // La route de renouvellement doit rester joignable sans session valide :
  // c'est précisément son rôle. La filtrer créerait une boucle.
  if (chemin === ROUTE_RENOUVELLEMENT) return NextResponse.next();

  // Une requête d'API se répond en JSON, jamais par une redirection vers une
  // page. Le test est fait ici, une fois, plutôt qu'à chaque point de refus.
  const estApi = chemin.startsWith("/api/");

  // Le chemin demandé, transmis au rendu. `NextResponse.next({ request })` est
  // la seule façon de modifier les en-têtes de la REQUÊTE (et non de la
  // réponse) : c'est ce que lira `garde.ts`.
  const enTetes = new Headers(requete.headers);
  enTetes.set(EN_TETE_CHEMIN, chemin + requete.nextUrl.search);
  const suite = NextResponse.next({ request: { headers: enTetes } });

  if (estPublic(chemin)) return suite;

  const session = await lireJetonAcces(requete.cookies.get(COOKIE_ACCES)?.value);
  if (session) {
    // Contrôle optimiste du rôle : évite d'afficher la coquille d'une page
    // réservée à un utilisateur ordinaire avant que le layout ne le renvoie.
    // La vérification qui compte reste celle du layout de section.
    //
    // Les préfixes viennent de `lib/navigation.ts`, la même liste qui construit
    // les onglets. Les recopier ici créerait le défaut classique : ajouter une
    // section réservée, oublier de la déclarer au proxy, et la laisser ouverte.
    if (
      session.role !== "ADMINISTRATEUR" &&
      PREFIXES_ADMIN.some((prefixe) => sectionActive(chemin, prefixe))
    ) {
      if (estApi) return refusApi();
      return NextResponse.redirect(new URL("/?acces=refuse", requete.nextUrl));
    }
    return suite;
  }

  const aUnRenouvellement = Boolean(requete.cookies.get(COOKIE_RENOUVELLEMENT)?.value);

  if (!aUnRenouvellement) {
    if (estApi) return refusApi();
    // Aucune trace de session : direction la connexion, en mémorisant la
    // destination voulue.
    const versConnexion = new URL("/connexion", requete.nextUrl);
    versConnexion.searchParams.set("retour", chemin + requete.nextUrl.search);
    return NextResponse.redirect(versConnexion);
  }

  // ⚠️ Une redirection transforme la requête en GET et PERD son corps. Sur une
  // soumission de Server Action, rediriger vers le renouvellement effacerait
  // donc le formulaire que l'utilisateur vient de remplir — le cas typique
  // d'un OM saisi après un quart d'heure de rédaction.
  //
  // Même raisonnement pour les appels d'API : un client `fetch` suit les
  // redirections en silence et se retrouverait avec la réponse d'une autre
  // route que celle qu'il a appelée.
  //
  // Dans les deux cas on laisse passer : Server Actions et Route Handlers ont
  // le droit d'écrire des cookies, donc `lireSession()` renouvellera de
  // lui-même au cours de l'exécution.
  if (estApi) return suite;
  if (requete.method !== "GET" && requete.method !== "HEAD") return suite;

  // Jeton d'accès expiré, jeton de renouvellement présent : on délègue à la
  // route de renouvellement, qui a le droit d'écrire des cookies.
  //
  // ⚠️ Pourquoi ne pas renouveler ICI, ce qui éviterait un aller-retour.
  //
  // Ce n'est PAS une impossibilité technique : vérifié le 21/08/2026, importer
  // Prisma dans ce fichier compile et fonctionne à l'exécution (le proxy tourne
  // sur le runtime Node depuis Next 16), et la garde `server-only` de
  // `lib/data/client.ts` ne s'y oppose pas. La raison est un choix :
  //
  //   1. La doc l'écrit noir sur blanc — « avoid database checks to prevent
  //      performance issues » — parce que ce fichier s'exécute sur CHAQUE
  //      requête, y compris les préchargements.
  //   2. Prisma entrerait dans le paquet du proxy, donc dans le chemin critique
  //      de toutes les requêtes, y compris celles des fichiers statiques que le
  //      `matcher` ne filtre pas.
  //   3. Concentrer les écritures de session dans un seul endroit (la route)
  //      laisse un seul point à auditer.
  //
  // ⚠️ Ce détour touche AUSSI les préchargements, et on ne peut pas les
  // distinguer : « During RSC requests, Next.js strips internal Flight headers
  // from the request instance in Proxy. For example, headers like rsc,
  // next-router-state-tree, and next-router-prefetch are not exposed. » C'est
  // sans dommage — un préchargement qui renouvelle pose simplement des cookies
  // frais — mais c'est la raison pour laquelle la rotation du jeton tolère une
  // fenêtre de grâce : plusieurs requêtes concurrentes arrivent ici avec le
  // même jeton. Voir GRACE_MS dans lib/auth/session.ts.
  const versRenouvellement = new URL(ROUTE_RENOUVELLEMENT, requete.nextUrl);
  versRenouvellement.searchParams.set("suite", chemin + requete.nextUrl.search);
  return NextResponse.redirect(versRenouvellement);
}

export const config = {
  /**
   * Exclut ce qui n'a pas de session à contrôler : les fichiers générés par
   * Next, les images optimisées, et les fichiers statiques reconnaissables à
   * leur extension.
   *
   * `_next/static` et `_next/image` sont exclus nommément plutôt que par
   * extension : leurs URL n'en portent pas toujours.
   */
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt|xml|webmanifest)$).*)"],
};
