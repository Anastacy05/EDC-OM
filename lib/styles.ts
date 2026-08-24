// Classes Tailwind partagées entre les écrans, pour éviter qu'une même
// intention visuelle soit recopiée (et diverge) d'un fichier à l'autre.
//
// Deux variantes de champ coexistent volontairement : les formulaires de
// saisie ont une bordure discrète et prennent toute la largeur de leur
// colonne, tandis que la barre de filtres de la liste utilise une bordure
// marquée et une largeur libre. Ce ne sont pas les mêmes rôles.

// Champ d'un formulaire de saisie (création d'OM, administration).
export const inputClass =
  "w-full px-3 py-2 rounded-lg border border-blue-200 bg-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400";

// Champ de la barre de filtres de la liste des OM.
export const filtreInputClass =
  "px-3 py-2 rounded-lg border border-blue-500 bg-white text-sm placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-700";

// Bloc blanc translucide qui porte une section de contenu.
export const carteClass =
  "bg-white/70 rounded-2xl shadow-md shadow-blue-950/10 p-6 flex flex-col gap-4";

// Titre d'une section (<legend> dans les formulaires, <h2> ailleurs).
// amber-700 et non amber-600 : à 18px semi-gras, ce texte n'est PAS du
// « grand texte » au sens WCAG (seuil 24px, ou 18.7px en gras), il lui faut
// donc 4.5:1 et non 3:1. Sur une carte (bg-white/70 sur bg-blue-50),
// amber-600 ne donne que 3.11:1 ; amber-700 monte à 4.93:1.
export const legendClass = "text-amber-700 font-semibold px-2 text-lg";

// Titre principal de page.
// amber-700 et non amber-500 : sur le fond bg-blue-50, amber-500 tombe à
// 1.97:1 — un titre quasi illisible, même pour une vue normale. amber-700
// donne 4.64:1, au-delà du seuil de 3:1 des grands textes.
export const titrePageClass = "text-3xl font-bold italic text-amber-700 drop-shadow-xl";

// ---------------------------------------------------------------------------
// Boutons — trois niveaux, une seule source de vérité (21/08/2026)
// ---------------------------------------------------------------------------
//
// Remplacent les boutons précédents, jugés « trop grossiers » : `p-5
// rounded-full` avec `hover:scale-110`. Trois défauts concrets, pas seulement
// une question de goût :
//
//   1. AUCUNE HIÉRARCHIE. « Consulter les OM » et « Créer un OM » avaient le
//      même poids visuel, en deux bleus différents. Rien ne disait lequel est
//      l'action attendue. Un écran où tout crie ne guide personne.
//   2. `hover:scale-110` DÉPLACE LE VOISINAGE. Un bouton qui grossit de 10 %
//      sous le pointeur repousse ce qui l'entoure ; sur une rangée, le survol
//      fait bouger les autres. C'est aussi un mouvement que `prefers-reduced-
//      motion` demande d'éviter.
//   3. `p-5 rounded-full` sur un libellé long donne une pilule démesurée : le
//      rayon suit la hauteur, donc plus le texte est haut, plus les bouts
//      s'arrondissent. D'où l'aspect « bonbon ».
//
// Ce qui les remplace : `rounded-lg`, rembourrage mesuré, une ombre légère, et
// trois niveaux qui se distinguent par le REMPLISSAGE et non par la teinte.
//
// ── Contrastes MESURÉS sur le fond de l'app (bg-blue-50), pas estimés ─────────
//
//   • blanc sur blue-700      → 6.82:1  ✔ AA texte normal
//   • blue-800 sur blanc      → 8.84:1  ✔
//   • blue-700 sur blue-50    → 6.26:1  ✔
//   • blanc sur red-700       → 6.42:1  ✔
//
// Deux corrections que la mesure a imposées, contre mon premier jet :
//
//   1. `border-blue-200` ne donnait que **1.31:1** contre bg-blue-50, et le
//      fond blanc du bouton lui-même seulement 1.09:1. Un bouton en contour
//      dont on ne distingue NI le bord NI le fond n'est pas identifiable comme
//      bouton — WCAG 1.4.11 exige 3:1 pour « visual information required to
//      identify user interface components ». `border-blue-500` monte à 3.45:1.
//      Le bord est donc plus marqué que ce que l'œil aurait choisi seul.
//
//   2. `disabled:bg-blue-300` avec du texte blanc tombait à **1.81:1** : le
//      libellé était illisible. Un contrôle inactif est certes exempté du seuil
//      de 1.4.3, mais on doit pouvoir LIRE ce qu'il propose pour comprendre ce
//      qui est bloqué. `bg-blue-100` + `text-slate-600` donne 6.20:1.
//
// `focus-visible` et non `focus` : l'anneau n'apparaît qu'à la navigation au
// clavier, pas après un clic à la souris — c'est ce que la pseudo-classe a été
// créée pour distinguer. Sans anneau du tout, un utilisateur au clavier ne sait
// plus où il est.
const boutonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium " +
  "transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-50 " +
  "disabled:cursor-not-allowed";

/** État inactif commun : lisible, mais visiblement hors service. */
const desactive = "disabled:bg-blue-100 disabled:text-slate-600 disabled:border-transparent disabled:shadow-none";

/** Action attendue de l'écran. **Une seule par écran**, sinon il n'y a plus de principale. */
export const boutonPrimaire =
  `${boutonBase} ${desactive} bg-blue-700 text-white shadow-sm shadow-blue-950/20 ` +
  `hover:bg-blue-800 active:bg-blue-900`;

/** Action possible mais non attendue. Contour, pour peser moins sans disparaître. */
export const boutonSecondaire =
  `${boutonBase} ${desactive} bg-white text-blue-800 border border-blue-500 ` +
  `shadow-sm shadow-blue-950/10 hover:bg-blue-50 hover:border-blue-700 active:bg-blue-100`;

/** Action de service (annuler, revenir). Sans fond : ne réclame aucune attention. */
export const boutonDiscret =
  `${boutonBase} ${desactive} text-blue-700 hover:bg-blue-100 active:bg-blue-200`;

/**
 * Action destructrice — suppression, révocation.
 *
 * Rouge, mais **jamais rouge seul** : la couleur ne doit pas être le seul
 * porteur du sens (WCAG 1.4.1). Ces boutons portent donc toujours une icône
 * explicite et un verbe sans ambiguïté.
 */
export const boutonDanger =
  `${boutonBase} ${desactive} bg-red-700 text-white shadow-sm shadow-red-950/20 ` +
  `hover:bg-red-800 active:bg-red-900`;

/** Bouton réduit à une icône. `aria-label` OBLIGATOIRE : sans lui, il est muet. */
export const boutonIcone =
  "inline-flex items-center justify-center rounded-lg p-2 transition-colors duration-200 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
  "focus-visible:ring-offset-2";

/**
 * Taille d'icône accompagnant un libellé de bouton.
 *
 * 18 px et non 16 ou 24 : à côté d'un `text-sm` (14 px, hauteur de ligne 20 px),
 * 18 px cadre la hauteur des majuscules sans dépasser la ligne de base.
 */
export const TAILLE_ICONE = 18;

// ---------------------------------------------------------------------------
// Largeur de page — centrée et bornée (24/08/2026)
// ---------------------------------------------------------------------------
//
// Les écrans étaient en `w-full … p-6 sm:p-10` : le contenu collait au bord
// gauche et s'étirait sur toute la largeur de la fenêtre. Sur un écran large, la
// barre de filtres de la liste des OM étalait ses douze champs d'un bord à
// l'autre, et l'œil devait traverser le vide pour passer d'un libellé à sa valeur.
//
// ── Ce que disent les standards ────────────────────────────────────────────
//
// La règle n'est pas une largeur en pixels : c'est un NOMBRE DE CARACTÈRES par
// ligne. WCAG 2.2, critère **1.4.8 Visual Presentation** (niveau AAA) demande,
// pour les blocs de texte, un mécanisme donnant des lignes de « no more than 80
// characters or glyphs (40 if CJK) ».
//
// ⚠️ Ces deux conteneurs **ne suffisent pas** à atteindre ce seuil, et il ne faut
// pas croire le contraire : ils bornent la MISE EN PAGE, pas les paragraphes. Un
// texte de 896 px en `text-sm` fait encore une centaine de caractères. Les
// paragraphes portent donc leur propre borne (`max-w-md`, `max-w-3xl` selon les
// écrans), et c'est là que le critère se joue. La distinction est faite exprès :
// un formulaire à deux colonnes borné à 80 caractères serait inutilisable.
//
// ── Deux largeurs, parce que deux natures de contenu ───────────────────────
//
// `bg-blue-50` n'est répété dans aucun des deux : il est déjà sur `<body>`
// (app/layout.tsx). Les sept écrans qui le reposaient le faisaient pour rien.

/**
 * Conteneur d'un écran de formulaire ou de fiche.
 *
 * `max-w-4xl` (896 px) : la largeur que `/om/nouveau` s'était déjà donnée, et
 * proche du `max-w-[860px]` de la fiche d'un ordre de mission. Assez large pour
 * une grille à deux colonnes, assez étroite pour que l'œil relie un libellé à son
 * champ.
 */
export const conteneurFormClass =
  "mx-auto flex w-full max-w-4xl flex-col gap-6 p-6 sm:p-10";

/**
 * Conteneur d'un écran de liste ou de tableau large.
 *
 * `max-w-7xl` (1280 px) : le tableau des ordres de mission a neuf colonnes, et le
 * comprimer davantage le rendrait illisible — une ligne de tableau n'est pas lue
 * comme une phrase, le critère des 80 caractères ne s'y applique pas.
 *
 * ⚠️ Pas `max-w-screen-2xl` : Tailwind v4 a retiré les utilitaires
 * `max-w-screen-*`. La classe ne produirait AUCUNE règle, la borne serait
 * silencieusement absente, et l'écran redeviendrait pleine largeur sans que rien
 * ne le signale.
 */
export const conteneurLargeClass =
  "mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 sm:p-10";

// ---------------------------------------------------------------------------
// Lignes de tableau cliquables (24/08/2026)
// ---------------------------------------------------------------------------
//
// Les listes n'étaient cliquables que sur un lien étroit : le numéro d'OM, ou un
// « Modifier » à l'extrémité droite de la ligne. Il fallait viser, alors que
// toute la ligne parle du même enregistrement.
//
// ── Pourquoi un « lien étendu » et pas un `onClick` sur la ligne ────────────
//
// Un `<tr onClick>` aurait trois défauts, les mêmes que ceux relevés sur
// l'accueil le 21/08/2026 à propos des `<div onClick>` : il rend la page cliente
// pour rien, il n'est pas atteignable au clavier, et il n'est ni annoncé comme
// lien ni ouvrable dans un nouvel onglet — donc pas de clic milieu, pas de
// « copier l'adresse du lien ».
//
// La solution garde UN vrai `<a>` par ligne et lui fait couvrir la ligne entière
// par un pseudo-élément. Aucun JavaScript, le clavier fonctionne, le menu
// contextuel donne l'adresse, et il n'y a toujours qu'un seul arrêt de
// tabulation par ligne — pas un par cellule.
//
// ⚠️ Deux conséquences à connaître :
//
//   1. **La sélection de texte dans la ligne devient malaisée**, le recouvrement
//      captant le glissement. C'est le compromis assumé du procédé ; les valeurs
//      qu'on copie vraiment (matricule, numéro d'OM) restent lisibles à l'écran
//      et la fiche les redonne.
//   2. **Un second élément interactif dans la ligne serait inatteignable**, passant
//      sous le recouvrement. Il faudrait alors le remonter (`relative z-10`). Les
//      deux listes n'en ont aucun aujourd'hui, et c'est ce qui rend le procédé
//      applicable ici.

/** À poser sur le `<tr>` : sert d'ancre au recouvrement du lien. */
export const ligneCliquableClass =
  "relative border-b border-blue-100 last:border-0 transition-colors duration-200 " +
  "hover:bg-blue-100/70 focus-within:bg-blue-100/70";

/**
 * À poser sur l'unique `<a>` de la ligne : il s'étend sur toute la ligne.
 *
 * `after:content-['']` est indispensable — sans contenu, même vide, le
 * pseudo-élément n'est pas généré et le recouvrement n'existe pas.
 */
export const lienEtenduClass =
  "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset";

