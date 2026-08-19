"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

interface ModalProps {
  titre: string;
  onFermer: () => void;
  children: ReactNode;
}

export default function Modal({ titre, onFermer, children }: ModalProps) {
  // Échap ferme le modal — évite de piéger un utilisateur clavier.
  useEffect(() => {
    const gererEchap = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    window.addEventListener("keydown", gererEchap);
    return () => window.removeEventListener("keydown", gererEchap);
  }, [onFermer]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onFermer}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-blue-100 sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-amber-700">{titre}</h2>
          <button
            onClick={onFermer}
            aria-label="Fermer"
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none px-2"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
