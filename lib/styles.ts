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
export const legendClass = "text-amber-600 font-semibold px-2 text-lg";

// Titre principal de page.
export const titrePageClass = "text-3xl font-bold italic text-amber-500 drop-shadow-xl";
