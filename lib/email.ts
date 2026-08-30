/**
 * Adresse de courriel : normalisation et contrôle de forme.
 *
 * ── Pourquoi un module à part ────────────────────────────────────────────────
 *
 * Le même contrôle était écrit **trois fois**, chaque fois un peu différemment :
 *
 *   • `lib/auth/actions.ts`                       → `!email.includes("@")`
 *   • `app/personnel/actions.ts`                  → `!email.includes("@") || email.length < 5`
 *   • `app/parametres/administrateurs/actions.ts` → idem
 *
 * Trois copies d'une règle, c'est trois occasions de divergence — et la plus
 * permissive fait la loi, puisqu'il suffit d'entrer par le formulaire le plus
 * laxiste. Le 24/08/2026 ajoute un quatrième point de saisie (la fiche employé) :
 * le moment de mettre la règle à un seul endroit.
 *
 * ⚠️ **La connexion reste volontairement en dehors.** `lib/auth/actions.ts` garde
 * son contrôle minimal, pour la raison qu'il documente déjà à propos du mot de
 * passe : durcir une règle ne doit jamais enfermer dehors un compte existant. Une
 * adresse enregistrée avant ce module, et que cette expression régulière
 * refuserait, doit continuer de pouvoir se connecter. On contrôle à la SAISIE, pas
 * à la présentation d'un identifiant déjà attribué.
 *
 * Ce module ne dépend de rien, donc il s'importe des deux côtés de la frontière —
 * le formulaire affiche l'erreur sans aller-retour, le serveur la rejoue.
 *
 * ── Ce que ce contrôle ne prétend PAS faire ─────────────────────────────────
 *
 * Il ne dit pas que l'adresse existe : seule une remise réussie le dit. Il ne
 * suit pas non plus la grammaire RFC 5322, qui autorise des formes que personne
 * ne saisit (guillemets, commentaires entre parenthèses, adresses IP littérales)
 * et dont l'expression régulière complète est réputée illisible.
 *
 * Il attrape ce qui se produit réellement à la frappe : l'arobase manquante, le
 * domaine sans point, l'espace laissé au milieu, la double arobase. Le vrai
 * filet reste ailleurs — le lien de mot de passe part par courriel, donc une
 * adresse fausse se signale d'elle-même : personne ne peut se connecter.
 */

/**
 * Forme acceptée : `partie-locale@domaine.ext`.
 *
 * `[^\s@]+` interdit l'espace ET l'arobase de chaque côté, ce qui écarte du même
 * coup `a@@b` et `a b@c.fr`. Le domaine exige au moins un point suivi de deux
 * lettres : sans ça, `jean@edc` passerait — c'est techniquement une adresse
 * valide sur un réseau interne, mais à l'EDC les adresses sont en `@edc.cm`, et
 * une adresse sans domaine complet ne sortirait jamais du serveur.
 */
const FORME = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Longueur maximale, alignée sur les colonnes `VARCHAR(255)`.
 *
 * C'est aussi la limite de la RFC 5321 pour un chemin inverse. Au-delà,
 * PostgreSQL tronquerait — ou refuserait — et le message d'erreur serait
 * incompréhensible.
 */
export const EMAIL_LONGUEUR_MAX = 255;

/**
 * Met une adresse sous sa forme de stockage : sans espaces, en minuscules.
 *
 * ⚠️ La casse de la partie locale est **significative** selon la RFC, mais aucun
 * serveur courant ne la distingue, et `Utilisateur.email` est `UNIQUE` : sans
 * cette normalisation, « Jean@edc.cm » et « jean@edc.cm » créeraient deux
 * comptes pour une seule personne, dont un seul recevrait les courriels.
 */
export function normaliserEmail(valeur: string): string {
  return valeur.trim().toLowerCase();
}

/** Vrai si la chaîne a la forme d'une adresse utilisable. Attend une valeur déjà normalisée. */
export function estEmailValide(valeur: string): boolean {
  return valeur.length <= EMAIL_LONGUEUR_MAX && FORME.test(valeur);
}
