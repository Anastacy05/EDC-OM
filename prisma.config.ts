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
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
