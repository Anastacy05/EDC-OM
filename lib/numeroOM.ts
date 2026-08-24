/**
 * Numéro d'ordre de mission : composition, décomposition, bornes.
 *
 * ── Pourquoi un module neutre, hors de `lib/data/` ───────────────────────────
 *
 * Même raison que `lib/pagination.ts` : un module `server-only` importe
 * `lib/auth/garde.ts`, donc `next/navigation`, donc le contexte React du routeur.
 * L'importer hors d'un rendu serveur échoue sur « createContext is not a
 * function ». Or ces fonctions doivent être appelées par le DAL, par les écrans
 * ET par les tests.
 *
 * ── Le format : le GABARIT fait foi (arbitré le 22/08/2026) ──────────────────
 *
 * Le gabarit `templates/template_om_avec_balises.docx` imprime :
 *
 *     N° {numeroOM}/EDC/DG/DRH/SDARHAS
 *
 * Le suffixe est donc DANS le document, pas dans la donnée. Stocker le format
 * annoncé par MODELE-DONNEES.md §7 — `0042/OM/EDC/DG/2026` — produirait sur le
 * papier :
 *
 *     N° 0042/OM/EDC/DG/2026/EDC/DG/DRH/SDARHAS
 *
 * soit deux suffixes collés. La colonne ne porte donc que ce qui identifie :
 * **le compteur et l'année**. §7 est amendé en conséquence.
 *
 * ── Pourquoi l'année est dans la valeur stockée ──────────────────────────────
 *
 * `participation.numero_om` est `UNIQUE` et le compteur repart à 1 chaque année.
 * Sans l'année, le 42ᵉ OM de 2027 entrerait en collision avec celui de 2026.
 */

/** Séparateur entre le compteur et l'année. */
const SEPARATEUR = "/";

/** Chiffres du compteur, imposés par le gabarit (« 0042 »). */
export const LARGEUR_COMPTEUR = 4;

/**
 * Suffixe imprimé par le gabarit, après le compteur.
 *
 * Écrit ici pour que l'écran puisse montrer le numéro complet, mais **le gabarit
 * en reste la source** : le modifier ici ne changerait pas le document. S'il
 * fallait changer le suffixe, c'est le `.docx` qu'il faudrait reprendre, et cette
 * constante avec.
 */
export const SUFFIXE_DOCUMENT = "/EDC/DG/DRH/SDARHAS";

/**
 * Plus grand compteur représentable sur `LARGEUR_COMPTEUR` chiffres.
 *
 * ⚠️ **Aucune contrainte en base ne borne `plage_numero.borne_max`.** Rien
 * n'empêche donc PostgreSQL d'accepter une plage 9990–10040, dont les derniers
 * numéros déborderaient à cinq chiffres et casseraient l'alignement du document.
 * C'est au code de refuser — d'où cette constante, vérifiée à la réservation.
 *
 * 9999 OM dans une même année est très au-delà du besoin (400 employés), mais un
 * plafond silencieux est pire qu'un plafond nommé.
 */
export const LIMITE_COMPTEUR = 10 ** LARGEUR_COMPTEUR - 1; // 9999

/** Lignes par page de la liste des OM. Aligné sur celle du personnel. */
export const PAR_PAGE_OM = 25;

/**
 * Compose le numéro stocké en base : `"0042/2026"`.
 *
 * Lève plutôt que de tronquer : un numéro erroné sur une pièce administrative
 * numérotée est un défaut de traçabilité, pas un détail d'affichage.
 */
export function composerNumero(compteur: number, annee: number): string {
  if (!Number.isInteger(compteur) || compteur < 1 || compteur > LIMITE_COMPTEUR) {
    throw new Error(
      `Compteur d'OM hors bornes : ${compteur}. Attendu entre 1 et ${LIMITE_COMPTEUR} ` +
        `(le gabarit imprime ${LARGEUR_COMPTEUR} chiffres).`
    );
  }
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2999) {
    throw new Error(`Année d'OM invraisemblable : ${annee}.`);
  }

  return `${String(compteur).padStart(LARGEUR_COMPTEUR, "0")}${SEPARATEUR}${annee}`;
}

/**
 * Décompose un numéro stocké, ou `null` s'il ne suit pas le format.
 *
 * `null` et non une exception : cette fonction sert à LIRE des valeurs existantes
 * (tri, affichage, audit). Une ligne ancienne au format différent ne doit pas
 * faire tomber un écran — elle doit s'afficher telle quelle.
 */
export function decomposerNumero(
  valeur: string
): { compteur: number; annee: number } | null {
  // Ancrée aux deux extrémités : « 0042/2026/extra » n'est pas un numéro valide.
  const trouve = /^(\d{4})\/(\d{4})$/.exec(valeur.trim());
  if (!trouve) return null;

  const compteur = Number(trouve[1]);
  const annee = Number(trouve[2]);

  // « 0000/2026 » est syntaxiquement conforme mais n'existe pas : les compteurs
  // partent de 1.
  if (compteur < 1) return null;

  return { compteur, annee };
}

/**
 * Le numéro tel qu'il apparaîtra sur le document, suffixe du gabarit compris.
 *
 * ⚠️ **Pour l'affichage à l'écran UNIQUEMENT.** Le document Word compose déjà ce
 * suffixe lui-même ; lui passer cette chaîne le doublerait. Elle existe pour que
 * l'écran montre à l'utilisateur ce qu'il va imprimer — sans quoi il verrait
 * « 0042/2026 » à l'écran et « N° 0042/EDC/DG/DRH/SDARHAS » sur le papier, et
 * douterait avec raison qu'il s'agit du même document.
 */
export function numeroCommeImprime(numeroStocke: string): string {
  const parts = decomposerNumero(numeroStocke);
  if (!parts) return numeroStocke; // format inconnu : on n'invente rien
  return `${String(parts.compteur).padStart(LARGEUR_COMPTEUR, "0")}${SUFFIXE_DOCUMENT}`;
}

/**
 * Le compteur SEUL, tel que la balise `{numeroOM}` du gabarit l'attend : `"0042"`.
 *
 * ── Pourquoi cette fonction existe (défaut constaté le 24/08/2026) ───────────
 *
 * Le gabarit imprime `N° {numeroOM}/EDC/DG/DRH/SDARHAS`. Lui passer la valeur
 * stockée `0042/2026` produit donc sur le papier :
 *
 *     N° 0042/2026/EDC/DG/DRH/SDARHAS
 *
 * L'année s'intercale au milieu du suffixe administratif, alors qu'elle n'a rien à
 * y faire : elle est dans la donnée pour rendre `numero_om` unique d'une année sur
 * l'autre (le compteur repart à 1), **pas pour être imprimée**. Le commentaire en
 * tête de ce module l'annonçait — « le suffixe est DANS le document, pas dans la
 * donnée » — mais rien ne retirait l'année avant de remplir la balise.
 *
 * Cette fonction est donc l'unique passerelle entre la colonne et le gabarit. Elle
 * vaut aussi pour le fac-similé (`OMPreview`), qui recompose le même suffixe : les
 * deux doivent montrer strictement la même chose, sinon l'aperçu cesse d'être un
 * aperçu.
 */
export function numeroPourGabarit(numeroStocke: string): string {
  const parts = decomposerNumero(numeroStocke);
  if (!parts) return numeroStocke; // format inconnu : on n'invente rien
  return String(parts.compteur).padStart(LARGEUR_COMPTEUR, "0");
}
