/**
 * Compilation préalable aux tests de bout en bout.
 *
 * ── Pourquoi une étape séparée ───────────────────────────────────────────────
 *
 * `node --test` exécute les fichiers de test **en parallèle** (jusqu'au nombre de
 * cœurs). Si chaque suite lançait `next build`, trois compilations écriraient
 * dans le même `.next-test` en même temps — corruption garantie, avec des erreurs
 * qui n'auraient aucun rapport avec le code testé.
 *
 * On compile donc UNE fois ici, avant tout, et les suites se contentent de
 * démarrer un serveur sur le résultat. C'est aussi trois fois plus rapide.
 *
 * Les suites restent sérialisées (`--test-concurrency=1`) pour une autre raison :
 * elles partagent la base de données, et leurs jeux de données se marcheraient
 * dessus.
 *
 *   npx tsx tests/aide/preparer.mts
 */

import { compiler, DOSSIER_BUILD } from "./serveur.mts";

const debut = Date.now();
console.log(`  Compilation dans ${DOSSIER_BUILD}…`);

await compiler();

console.log(`  ✔ Compilé en ${((Date.now() - debut) / 1000).toFixed(1)} s.\n`);
