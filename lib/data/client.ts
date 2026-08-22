import "server-only";

import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Client Prisma partagé. **Seul point de connexion à la base de tout le projet.**
 *
 * `import "server-only"` en première ligne, et non par convention : sans lui,
 * rien n'empêche un composant client d'importer ce module par erreur, ce qui
 * embarquerait la chaîne de connexion — mot de passe compris — dans le bundle
 * navigateur. Avec lui, la compilation échoue au lieu de fuiter. C'est ce que
 * la doc Next 16 impose pour une couche d'accès aux données
 * (node_modules/next/dist/docs/01-app/02-guides/data-security.md).
 *
 * ⚠️ PRISMA 7 : un adaptateur de pilote est OBLIGATOIRE. Le moteur de requêtes
 * Rust a disparu, `new PrismaClient()` sans argument lève
 * « A driver adapter is required to connect to your database ».
 */

// Seul endroit du projet autorisé à lire process.env pour la base. La doc est
// explicite : « only the Data Access Layer should access process.env ».
//
// Lu dans une fonction et non dans une constante de module : `process.env.X` est
// de type `string | undefined`, et TypeScript ne propage PAS le rétrécissement
// obtenu par un `if` de module jusqu'à l'intérieur de `creerClient()` — la
// variable pourrait théoriquement changer entre les deux. Renvoyer un `string`
// depuis une fonction règle le problème à la source, sans assertion `!`.
function lireUrlBase(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL est absente. Copier .env.example en .env, puis démarrer la " +
        "base avec `docker compose up -d`."
    );
  }
  return url;
}

/**
 * En développement, Next recharge les modules à chaud à chaque modification.
 * Sans ce cache sur `globalThis`, chaque rechargement créerait un NOUVEAU
 * client — donc un nouveau pool de connexions — et PostgreSQL finirait par
 * refuser les connexions ("too many clients already") après quelques dizaines
 * d'enregistrements de fichier.
 *
 * En production, le module n'est évalué qu'une fois : le cache est inutile, et
 * on évite d'attacher quoi que ce soit au global.
 */
const globalPourPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function creerClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(lireUrlBase()),
    // En développement, tracer les requêtes lentes et les erreurs aide à
    // repérer une jointure oubliée. En production, on ne journalise que les
    // erreurs : `query` exposerait les valeurs des paramètres dans les logs.
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

export const prisma: PrismaClient = globalPourPrisma.prisma ?? creerClient();

if (process.env.NODE_ENV !== "production") {
  globalPourPrisma.prisma = prisma;
}
