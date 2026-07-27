"use client";

import { useState } from "react";

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  maxSuggestions?: number;
}

/**
 * Autocomplétion simple : filtre `suggestions` selon ce qui est tapé et
 * affiche les meilleures correspondances. Volontairement fait à la main
 * (pas de <datalist>) — avec ~148 000 villes, un <datalist> natif serait
 * beaucoup trop lent à charger dans le navigateur.
 */
export default function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  maxSuggestions = 8,
}: AutocompleteInputProps) {
  const [ouvert, setOuvert] = useState(false);

  const resultats =
    value.trim().length > 0
      ? suggestions
          .filter((s) => s.toLowerCase().startsWith(value.trim().toLowerCase()))
          .slice(0, maxSuggestions)
      : [];

  return (
    <div className="relative w-full">
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        className="w-full px-3 py-2 rounded-lg border border-blue-200 bg-white text-sm
                   focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {ouvert && resultats.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg
                       border border-blue-200 bg-white shadow-lg shadow-blue-950/10">
          {resultats.map((s) => (
            <li
              key={s}
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
