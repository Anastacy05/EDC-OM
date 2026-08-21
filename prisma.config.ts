// Configuration Prisma 7.
//
// ⚠️ CHANGEMENT PAR RAPPORT À PRISMA 6 : l'URL de la base ne se déclare PLUS
// dans le bloc `datasource` de schema.prisma (via `env("DATABASE_URL")`), mais
// ici. C'est ce fichier que la CLI lit, et c'est lui qui charge dotenv —
// Prisma 7 ne lit plus `.env` tout seul.
//
// Conséquence pratique : si `DATABASE_URL` manque, l'erreur vient d'ici et non
// du schéma.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Lancé par `prisma db seed`, et automatiquement après un `migrate reset`.
    // tsx et non `node` : le script importe les modules du projet (lib/zones.ts,
    // lib/referentiels.ts…) pour DÉRIVER les référentiels au lieu de les
    // recopier, et ces modules sont en TypeScript.
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
