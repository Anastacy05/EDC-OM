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
  const listeId = useId();
  const optionActiveRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setValeurDebounced(value), 150);
    return () => clearTimeout(timer);
  }, [value]);

  const resultats = useMemo(() => {
    if (disabled) return [];
    const recherche = normaliser(valeurDebounced.trim());
    if (recherche.length === 0) return suggestions;

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
  }, [disabled, valeurDebounced, suggestions, maxSuggestions]);

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
          setIndexActif(-1);
        }}
        onKeyDown={gererClavier}
        onFocus={() => setOuvert(true)}
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
        </ul>
      )}
    </div>
  );
}
