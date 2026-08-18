"use client";

import { createContext, useContext, useCallback, useState, type ReactNode } from "react";

interface BrouillonContextValue {
  actif: boolean;
  activer: () => void;
  desactiver: () => void;
}

// Valeurs par défaut no-op : un composant qui lit ce contexte sans provider
// englobant (ne devrait pas arriver, mais coûte rien à sécuriser) se
// comporte simplement comme s'il n'y avait jamais de brouillon en cours.
const BrouillonContext = createContext<BrouillonContextValue>({
  actif: false,
  activer: () => {},
  desactiver: () => {},
});

// Englobe toute l'app (dans layout.tsx) : Header et les pages doivent
// partager la MÊME instance de contexte pour que BackButton sache ce qui se
// passe dans la page actuellement affichée.
export function BrouillonProvider({ children }: { children: ReactNode }) {
  const [actif, setActif] = useState(false);
  const activer = useCallback(() => setActif(true), []);
  const desactiver = useCallback(() => setActif(false), []);

  return (
    <BrouillonContext.Provider value={{ actif, activer, desactiver }}>
      {children}
    </BrouillonContext.Provider>
  );
}

export function useBrouillonNonEnregistre(): BrouillonContextValue {
  return useContext(BrouillonContext);
}
