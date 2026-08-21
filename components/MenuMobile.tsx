"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { sectionActive, type Section } from "@/lib/navigation";
import Onglet from "@/components/Onglet";

/**
 * Menu de navigation pour téléphone et tablette : un bouton, et un panneau.
 *
 * Séparé de `Onglets` depuis le 21/08/2026 : les onglets occupent la région
 * centrale du header, ce bouton la région droite. Ils ne peuvent plus être
 * frères dans un même composant.
 *
 * ── L'accessibilité d'un panneau n'est pas optionnelle ───────────────────────
 *
 * Un panneau qui s'ouvre au clic est un piège au clavier s'il n'est pas traité.
 * D'où `aria-expanded`, `aria-controls`, et la fermeture par Échap AVEC retour
 * du focus au bouton — sans ce retour, le focus retombe sur le document et la
 * tabulation repart du début de la page.
 */
export default function MenuMobile({ sections }: { sections: readonly Section[] }) {
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const idPanneau = useId();
  const boutonRef = useRef<HTMLButtonElement>(null);

  // Fermeture du panneau à la navigation.
  //
  // ⚠️ Écrit en comparaison de rendu et NON dans un `useEffect` : la règle
  // `react-hooks/set-state-in-effect` est active dans ce projet et interdit
  // `useEffect(() => setOuvert(false), [chemin])`. C'est le motif que React
  // documente pour « ajuster un état quand une valeur change » — il s'exécute
  // pendant le rendu, avant que l'écran ne soit peint, donc sans clignotement.
  const [cheminPrecedent, setCheminPrecedent] = useState(chemin);
  if (chemin !== cheminPrecedent) {
    setCheminPrecedent(chemin);
    setOuvert(false);
  }

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOuvert(false);
      boutonRef.current?.focus();
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  if (sections.length === 0) return null;

  return (
    <>
      <button
        ref={boutonRef}
        type="button"
        onClick={() => setOuvert((o) => !o)}
        // aria-expanded et aria-controls : ils disent au lecteur d'écran que ce
        // bouton commande un panneau, et s'il est ouvert. Une icône seule est
        // muette sans eux.
        aria-expanded={ouvert}
        aria-controls={idPanneau}
        aria-label={ouvert ? "Fermer le menu" : "Ouvrir le menu de navigation"}
        className="rounded-lg p-2 text-white transition-colors duration-200 hover:bg-white/15
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white
                   focus-visible:ring-offset-2 focus-visible:ring-offset-blue-600 lg:hidden"
      >
        {ouvert ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
      </button>

      {ouvert && (
        /* Conteneur ancré sous le header, plutôt qu'un voile en `fixed top-16` :
           le décalage devrait alors répliquer la hauteur exacte du header, et
           tout changement de celle-ci laisserait une bande claire. Ici le panneau
           et le voile descendent de `top-full`, donc l'ancrage reste juste sans
           aucun nombre magique. */
        <div className="absolute left-0 right-0 top-full z-50 lg:hidden">
          <nav
            id={idPanneau}
            aria-label="Navigation principale"
            className="flex flex-col gap-1 border-b-2 border-blue-700 bg-blue-600 px-4 py-3
                       shadow-xl shadow-blue-950/30"
          >
            {sections.map((s) => (
              <Onglet
                key={s.href}
                section={s}
                actif={sectionActive(chemin, s.href)}
                pleineLargeur
                auClic={() => setOuvert(false)}
              />
            ))}
          </nav>

          {/* Voile : ferme au clic à côté, geste attendu d'un panneau. Il porte
              aussi l'assombrissement, qui signale que le reste est en retrait. */}
          <div
            onClick={() => setOuvert(false)}
            aria-hidden="true"
            className="h-screen bg-blue-950/40"
          />
        </div>
      )}
    </>
  );
}
