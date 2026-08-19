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
