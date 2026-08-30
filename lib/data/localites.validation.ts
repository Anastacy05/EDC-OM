/**
 * Règles de nommage d'une localité, **importables côté client**.
 *
 * ── Pourquoi un module à part de lib/data/localites.ts ──────────────────────
 *
 * Le DAL porte `import "server-only"` : le formulaire, qui est un composant
 * client, ne peut rien y prendre d'autre qu'un type (les `import type` sont
 * effacés à la compilation, les valeurs non). Or l'écran a besoin de la longueur
 * maximale — pour l'attribut `maxLength` — et de la même comparaison que la base,
 * pour signaler un doublon avant la soumission.
 *
 * Même découpage que `employes.validation.ts` / `employes.ts` et
 * `om.validation.ts` / `om.ts` : la règle est écrite une fois, et les deux côtés
 * la lisent. Deux copies finiraient par diverger, et c'est l'écran qui aurait
 * tort — silencieusement, puisque le serveur, lui, refuserait.
 */

/** Longueur de `localite.nom` en base (`VARCHAR(120)`). */
export const NOM_LOCALITE_MAX = 120;

/**
 * Forme ENREGISTRÉE d'un nom de localité : blancs de bord retirés, suites de
 * blancs internes ramenées à une espace.
 *
 * On ne touche ni aux accents ni à la casse : cette graphie s'imprime sur un
 * ordre de mission signé, et « Memve'ele » n'est pas « memveele ».
 */
export function normaliserNomLocalite(valeur: string): string {
  return valeur.trim().replace(/\s+/g, " ");
}

/**
 * Forme de COMPARAISON : sans casse, sans accents, blancs normalisés.
 *
 * Reproduit exactement ce que fait l'index unique en base —
 * `lower(sans_accent(btrim(nom)))` de `idx_localite_unique_par_pays`. C'est ce qui
 * fait que « Yaoundé », « YAOUNDE » et « yaounde » sont la même localité.
 *
 * ⚠️ À ne jamais enregistrer : c'est une clé de comparaison, pas un nom.
 */
export function cleLocalite(valeur: string): string {
  return normaliserNomLocalite(valeur)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
