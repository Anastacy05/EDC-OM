"use client";

import { useState, useEffect, useMemo } from "react";

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
export default function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  maxSuggestions = 20,
  disabled = false,
}: AutocompleteInputProps) {
  const [ouvert, setOuvert] = useState(false);
  const [valeurDebounced, setValeurDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setValeurDebounced(value), 150);
    return () => clearTimeout(timer);
  }, [value]);

  const resultats = useMemo(() => {
    if (disabled || valeurDebounced.trim().length === 0) return suggestions;
    const recherche = valeurDebounced.trim().toLowerCase();
    return suggestions.filter((s) => s.toLowerCase().includes(recherche));
  }, [disabled, valeurDebounced, suggestions, maxSuggestions]);

  return (
    <div className="relative w-full">
      <input
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        className="w-full px-3 py-2 rounded-lg border border-blue-200 bg-white text-sm placeholder:text-gray-500
                   focus:outline-none focus:ring-2 focus:ring-blue-400
                   disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
      />
      {ouvert && resultats.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg
                       border border-blue-200 bg-white shadow-lg shadow-blue-950/10">
          {resultats.map((s,index) => (
            <li
              key={index}
              onMouseDown={() => {
                onChange(s);
                setOuvert(false);
              }}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-100"
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
