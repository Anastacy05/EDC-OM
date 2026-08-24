"use client";

import { useState, useEffect, useMemo, useRef, useId } from "react";

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  maxSuggestions?: number;
  disabled?: boolean;
}

/**
 * Autocomplétion simple : filtre `suggestions` selon ce qui est tapé et
 * affiche les meilleures correspondances. Volontairement fait à la main
 * (pas de <datalist>) — avec ~148 000 villes, un <datalist> natif serait
 * beaucoup trop lent à charger dans le navigateur.
 *
 * Le filtrage est débounced (~150ms) : sur une frappe rapide, on ne
 * refiltre pas 148 000 entrées à chaque caractère, seulement une fois que
 * la frappe marque une pause. `useMemo` évite en plus tout recalcul si un
 * re-render est déclenché sans que `value`/`suggestions` aient changé.
 *
 * ── Deux modes, depuis le 24/08/2026 : PARCOURS et RECHERCHE ─────────────────
 *
 * Le défaut signalé à l'usage : une fois « Cameroun » choisi, revenir dans le
 * champ n'affichait plus que « Cameroun » — la liste était filtrée sur la valeur
 * en place. Pour reparcourir les autres pays, il fallait **effacer entièrement sa
 * saisie**. Le champ ne servait donc qu'une fois.
 *
 * Le champ s'ouvre maintenant en **parcours** — liste non filtrée — à chaque
 * entrée dans la zone (prise de focus *et* clic, parce qu'un second clic dans un
 * champ déjà actif ne déclenche aucun `focus`). Dès la première frappe il bascule
 * en **recherche**, et refiltre. On voit donc la liste sans rien effacer, et taper
 * garde exactement le comportement d'avant.
 */

// Les noms de villes/pays sont saisis sans accent la plupart du temps
// ("yaounde", "sao paulo") : on compare sur une forme normalisée pour que
// la recherche marche quand même.
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Ordre d'affichage, du plus au moins pertinent. Sans ce classement, taper
// "par" remonterait les entrées dans l'ordre de la base de données plutôt
// que Paris en premier.
const EXACT = 0; // "paris" -> Paris
const PREFIXE = 1; // "par"  -> Paris, Parme
const DEBUT_DE_MOT = 2; // "orl"  -> New Orleans
const CONTIENT = 3; // "ari"  -> Paris

// Normaliser 148 000 noms de villes prend ~150ms — beaucoup trop pour le
// refaire à chaque frappe. Les listes de suggestions étant des références
// stables (voir les caches de lib/locations.ts), on ne normalise chaque
// liste qu'une seule fois. WeakMap : si une liste n'est plus utilisée, son
// cache est libéré avec elle.
const cacheNormalise = new WeakMap<readonly string[], string[]>();

function suggestionsNormalisees(suggestions: string[]): string[] {
  const dejaEnCache = cacheNormalise.get(suggestions);
  if (dejaEnCache) return dejaEnCache;
  const normalisees = suggestions.map(normaliser);
  cacheNormalise.set(suggestions, normalisees);
  return normalisees;
}

function rang(candidatNormalise: string, recherche: string): number {
  if (candidatNormalise === recherche) return EXACT;
  const position = candidatNormalise.indexOf(recherche);
  if (position === -1) return -1;
  if (position === 0) return PREFIXE;
  return /[\s\-']/.test(candidatNormalise[position - 1]) ? DEBUT_DE_MOT : CONTIENT;
}

/**
 * Nombre d'entrées rendues en mode PARCOURS.
 *
 * ⚠️ Une borne est indispensable, et son absence était un vrai défaut : la
 * branche « saisie vide » renvoyait `suggestions` **sans découpe**, donc
 * jusqu'à 148 000 `<li>` dans le DOM au premier focus d'un champ de ville. Le
 * navigateur y passait plusieurs secondes.
 *
 * 200 plutôt que les 10 du mode recherche : la liste des pays en compte environ
 * 250, donc on la voit pratiquement en entier, ce qui est la demande. Pour les
 * villes, on montre les 200 premières et le pied de liste invite à préciser — la
 * seule alternative honnête serait un rendu virtualisé, dont l'application n'a
 * pas besoin ailleurs.
 */
const MAX_PARCOURS = 200;

export default function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  maxSuggestions = 10,
  disabled = false,
}: AutocompleteInputProps) {
  const [ouvert, setOuvert] = useState(false);
  const [valeurDebounced, setValeurDebounced] = useState(value);
  const [indexActif, setIndexActif] = useState(-1);
  /** Vrai tant que l'utilisateur n'a pas tapé depuis son entrée dans le champ. */
  const [parcourir, setParcourir] = useState(false);
  const listeId = useId();
  const optionActiveRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setValeurDebounced(value), 150);
    return () => clearTimeout(timer);
  }, [value]);

  const resultats = useMemo(() => {
    if (disabled) return [];
    const recherche = normaliser(valeurDebounced.trim());

    // Parcours : la liste telle quelle, sans tenir compte de la valeur en place.
    // C'est ce qui permet de revoir les autres pays sans effacer celui qui est
    // déjà choisi.
    if (parcourir || recherche.length === 0) return suggestions.slice(0, MAX_PARCOURS);

    const normalisees = suggestionsNormalisees(suggestions);
    const classes: { texte: string; rang: number }[] = [];
    for (let i = 0; i < suggestions.length; i++) {
      const r = rang(normalisees[i], recherche);
      if (r !== -1) classes.push({ texte: suggestions[i], rang: r });
    }

    // À pertinence égale, le plus court d'abord (Paris avant Parisot), puis
    // par ordre alphabétique.
    classes.sort(
      (a, b) =>
        a.rang - b.rang ||
        a.texte.length - b.texte.length ||
        a.texte.localeCompare(b.texte, "fr")
    );
    return classes.slice(0, maxSuggestions).map((c) => c.texte);
  }, [disabled, parcourir, valeurDebounced, suggestions, maxSuggestions]);

  /** Vrai si des entrées existent au-delà de ce qui est affiché. */
  const tronquee = parcourir && suggestions.length > resultats.length;

  // Le surlignage est remis à zéro quand l'utilisateur tape (voir onChange).
  // Ce clamp est la ceinture de sécurité : si la liste raccourcit pour une
  // autre raison (changement de pays), un index devenu hors limites ne doit
  // pas surligner le vide ni faire planter Entrée.
  const indexSurligne = indexActif < resultats.length ? indexActif : -1;

  useEffect(() => {
    optionActiveRef.current?.scrollIntoView({ block: "nearest" });
  }, [indexSurligne]);

  function choisir(suggestion: string) {
    onChange(suggestion);
    setOuvert(false);
    setParcourir(false);
    setIndexActif(-1);
  }

  /**
   * Ouvre la liste en mode parcours.
   *
   * Appelée par `onFocus` ET par `onClick` : après une sélection à la souris, le
   * champ garde le focus, donc un second clic dedans ne produit aucun `focus`.
   * Sans le clic, il faudrait sortir du champ puis y revenir pour rouvrir la
   * liste — exactement la gêne qu'on corrige.
   */
  function ouvrirEnParcours() {
    setOuvert(true);
    setParcourir(true);
    setIndexActif(-1);
  }

  function gererClavier(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOuvert(false);
      return;
    }
    if (!ouvert || resultats.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndexActif((indexSurligne + 1) % resultats.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndexActif(indexSurligne <= 0 ? resultats.length - 1 : indexSurligne - 1);
    } else if (e.key === "Enter" && indexSurligne >= 0) {
      // Sans ce preventDefault, Entrée validerait le formulaire entier au
      // lieu de sélectionner la suggestion surlignée.
      e.preventDefault();
      choisir(resultats[indexSurligne]);
    }
  }

  return (
    <div className="relative w-full">
      <input
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        role="combobox"
        aria-expanded={ouvert && resultats.length > 0}
        aria-controls={listeId}
        aria-autocomplete="list"
        aria-activedescendant={
          indexSurligne >= 0 ? `${listeId}-${indexSurligne}` : undefined
        }
        onChange={(e) => {
          onChange(e.target.value);
          setOuvert(true);
          // La première frappe fait passer du parcours à la recherche : c'est le
          // geste qui dit « je sais ce que je cherche ».
          setParcourir(false);
          setIndexActif(-1);
        }}
        onKeyDown={gererClavier}
        onFocus={ouvrirEnParcours}
        onClick={ouvrirEnParcours}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        className="w-full px-3 py-2 rounded-lg border border-blue-200 bg-white text-sm placeholder:text-gray-500
                   focus:outline-none focus:ring-2 focus:ring-blue-400
                   disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
      />
      {ouvert && resultats.length > 0 && (
        <ul
          id={listeId}
          role="listbox"
          className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg
                     border border-blue-200 bg-white shadow-lg shadow-blue-950/10"
        >
          {resultats.map((s, index) => (
            <li
              key={s}
              id={`${listeId}-${index}`}
              ref={index === indexSurligne ? optionActiveRef : null}
              role="option"
              aria-selected={index === indexSurligne}
              onMouseDown={() => choisir(s)}
              onMouseEnter={() => setIndexActif(index)}
              className={`px-3 py-2 text-sm cursor-pointer ${
                index === indexSurligne ? "bg-blue-100" : "hover:bg-blue-100"
              }`}
            >
              {s}
            </li>
          ))}

          {/* Dire ce qu'on ne montre pas. Sans cette ligne, une liste coupée à
              200 entrées se lit comme la liste complète, et l'utilisateur conclut
              que sa ville n'existe pas au lieu de préciser sa saisie. */}
          {tronquee && (
            <li
              role="presentation"
              className="border-t border-blue-100 px-3 py-2 text-xs italic text-slate-600"
            >
              {suggestions.length - resultats.length} autres entrées — tapez quelques
              lettres pour les atteindre.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
