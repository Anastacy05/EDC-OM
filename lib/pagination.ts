/**
 * Constantes de pagination.
 *
 * ── Pourquoi un module à part ────────────────────────────────────────────────
 *
 * `PAR_PAGE` vivait dans `lib/data/employes.ts`, ce qui paraissait naturel — c'est
 * la requête qui s'en sert. Mais ce module est `server-only` et importe
 * `lib/auth/garde.ts`, donc `next/navigation`, donc le contexte React du routeur.
 * L'importer hors d'un rendu serveur échoue sur
 * « _react.default.createContext is not a function » (constaté le 22/08/2026 en
 * écrivant les tests).
 *
 * Une valeur que le DAL, la page ET les tests doivent partager n'a donc rien à
 * faire dans une couche qui traîne des dépendances React. Ici, il n'y a que des
 * nombres : importable de partout.
 */

/**
 * Lignes par page de la liste du personnel.
 *
 * 25 : au-delà, la page devient un mur de texte qu'on ne balaie plus du regard ;
 * en dessous, feuilleter 400 employés demande trop de clics.
 */
export const PAR_PAGE = 25;
