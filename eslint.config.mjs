import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ajouté le 23/08/2026 : répertoire de compilation des tests de bout en bout
    // (`EDC_DIST_DIR` / `DOSSIER_BUILD`). C'est du code GÉNÉRÉ, et il n'était pas
    // exclu parce qu'il n'existait pas quand cette liste a été écrite — il pesait
    // à lui seul 321 erreurs et 6 500 avertissements, qui noyaient les vrais.
    // Sans lui, `npm run lint` était devenu illisible, donc inutile.
    ".next-test/**",
  ]),
]);

export default eslintConfig;
