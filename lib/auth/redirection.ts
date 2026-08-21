/**
 * Validation d'un chemin de retour fourni par la requête.
 *
 * Après une connexion ou un renouvellement, on renvoie l'utilisateur là où il
 * voulait aller — chemin transporté dans l'URL, donc **contrôlé par le
 * client**. Le rediriger tel quel ouvrirait une redirection ouverte : un lien
 * `…/connexion?retour=https://faux-edc.cm/` afficherait notre page de connexion
 * puis déposerait la victime sur un site tiers, avec toute l'apparence d'un
 * parcours légitime. C'est le vecteur classique de l'hameçonnage interne.
 *
 * On n'accepte donc qu'un chemin interne, et on refuse en particulier :
 *   • `https://…`, `//exemple.cm` → autre origine (le second est un chemin
 *     protocole-relatif, que le navigateur résout en URL absolue) ;
 *   • `javascript:…`, `data:…` → exécution de script ;
 *   • `\\exemple.cm` → certains navigateurs normalisent `\` en `/` ;
 *   • tout ce qui ne commence pas par `/`.
 */

const REPLI = "/";

/**
 * Vrai si la chaîne contient un caractère de contrôle. Un saut de ligne glissé
 * dans un en-tête `Location` permettrait d'en injecter d'autres.
 *
 * Test sur les points de code plutôt qu'une expression régulière à
 * échappements : une plage de contrôle écrite à la main dans une regex est une
 * source classique d'erreur silencieuse — les caractères concernés étant
 * invisibles, une faute de frappe ne se voit pas à la relecture. La boucle,
 * elle, se lit sans ambiguïté.
 */
function contientCaractereDeControle(valeur: string): boolean {
  for (const caractere of valeur) {
    const code = caractere.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function cheminDeRetourSur(valeur: string | null | undefined): string {
  if (!valeur) return REPLI;

  // Un chemin peut arriver encodé une fois de trop ; on ne décode pas
  // récursivement (ce serait à son tour contournable), mais un seul niveau
  // suffit à ne pas se faire berner par « %2F%2Fexemple.cm ».
  let chemin: string;
  try {
    chemin = decodeURIComponent(valeur);
  } catch {
    return REPLI; // séquence d'échappement invalide : suspect, on abandonne
  }

  if (!chemin.startsWith("/")) return REPLI;
  if (chemin.startsWith("//")) return REPLI;
  if (chemin.includes("\\")) return REPLI;
  if (contientCaractereDeControle(chemin)) return REPLI;

  return chemin;
}
