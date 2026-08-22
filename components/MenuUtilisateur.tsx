"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, Moon, Globe, Mail, IdCard, ShieldCheck, User } from "lucide-react";
import { deconnecter } from "@/lib/auth/actions";
import type { Session } from "@/lib/auth/jeton";

/**
 * Menu utilisateur : une icône, qui ouvre un panneau portant l'identité et les
 * préférences.
 *
 * ── Ce que ça remplace, et pourquoi ──────────────────────────────────────────
 *
 * Avant : le matricule en texte + un bouton « Se déconnecter » à demeure dans la
 * barre. Deux défauts. D'abord la place : avec jusqu'à six onglets, la barre
 * était saturée. Ensuite l'échelle de priorité : se déconnecter est une action
 * RARE, elle occupait autant de largeur que la navigation, qui est constante.
 *
 * Le panneau devient aussi l'endroit naturel pour la langue et le thème, qui
 * traînaient dans la barre sous forme de boutons inertes « FR » et « Moon ».
 *
 * ── L'accessibilité d'un menu n'est pas optionnelle ──────────────────────────
 *
 * Un panneau qui s'ouvre au clic est un piège au clavier s'il n'est pas traité.
 * D'où, ci-dessous : `aria-expanded`, `aria-controls`, fermeture par Échap avec
 * retour du focus au bouton, fermeture au clic extérieur, et `role="menu"` non
 * utilisé volontairement — voir le commentaire à l'endroit.
 */
export default function MenuUtilisateur({ session }: { session: Session }) {
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const idPanneau = useId();
  const conteneurRef = useRef<HTMLDivElement>(null);
  const boutonRef = useRef<HTMLButtonElement>(null);

  // Fermeture à la navigation, en comparaison de rendu et NON dans un effet :
  // la règle `react-hooks/set-state-in-effect` est active dans ce projet et
  // interdit `useEffect(() => setOuvert(false), [chemin])`. C'est le motif que
  // React documente pour ajuster un état quand une valeur change.
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
      // Rendre le focus au bouton : sans ça, Échap ferme le panneau et le focus
      // retombe sur le document, donc la tabulation repart du début de la page.
      boutonRef.current?.focus();
    };

    const surClic = (e: MouseEvent) => {
      if (!conteneurRef.current?.contains(e.target as Node)) setOuvert(false);
    };

    document.addEventListener("keydown", surTouche);
    // `mousedown` et non `click` : un `click` se déclenche après le relâchement,
    // donc un clic commencé dans le panneau et fini dehors le fermerait.
    document.addEventListener("mousedown", surClic);
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.removeEventListener("mousedown", surClic);
    };
  }, [ouvert]);

  const estAdmin = session.role === "ADMINISTRATEUR";

  /**
   * Initiales tirées du matricule, à défaut du courriel.
   *
   * Les matricules de l'EDC ont la forme « 22P582 » : les deux premiers
   * caractères suffisent à distinguer un compte d'un autre du regard, sans
   * afficher l'identifiant complet en permanence.
   */
  const initiales = (session.matricule ?? session.email).slice(0, 2).toUpperCase();

  return (
    <div ref={conteneurRef} className="relative">
      <button
        ref={boutonRef}
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-controls={idPanneau}
        aria-label={`Compte ${session.matricule ?? session.email}`}
        className="flex items-center gap-2 rounded-full p-1 pr-2 text-white transition-colors
                   duration-200 hover:bg-white/15 focus-visible:outline-none
                   focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2
                   focus-visible:ring-offset-blue-600"
      >
        {/* Pastille d'initiales. Fond blanc sur bg-blue-600 = 5,26:1 mesuré,
            et le texte blue-900 dessus 10,40:1 — largement au-dessus des seuils. */}
        <span
          aria-hidden="true"
          className="grid h-8 w-8 place-items-center rounded-full bg-white text-xs
                     font-semibold text-blue-900"
        >
          {initiales}
        </span>
        {/* Chevron omis volontairement : la pastille d'initiales est déjà
            l'affordance, et `aria-expanded` porte l'état pour les lecteurs
            d'écran. Un chevron de plus n'ajouterait que du bruit. */}
      </button>

      {ouvert && (
        <div
          id={idPanneau}
          // Pas de `role="menu"` : ce motif ARIA impose une navigation aux
          // flèches et n'admet que des `menuitem`. Or ce panneau contient du
          // texte informatif (courriel, matricule, rôle) et des contrôles de
          // nature différente. Le déclarer « menu » mentirait aux lecteurs
          // d'écran et casserait la tabulation, qui fonctionne ici nativement.
          className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border
                     border-blue-200 bg-white shadow-xl shadow-blue-950/20"
        >
          {/* ── Identité ─────────────────────────────────────────────────── */}
          <div className="border-b border-blue-100 bg-blue-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
              <User size={16} aria-hidden="true" />
              {estAdmin ? "Administrateur" : "Utilisateur"}
            </div>

            <dl className="mt-2 space-y-1.5 text-xs text-blue-900/80">
              <div className="flex items-start gap-2">
                <Mail size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <dt className="sr-only">Adresse</dt>
                {/* `break-all` : une adresse longue ne doit pas élargir le
                    panneau ni déborder. */}
                <dd className="break-all">{session.email}</dd>
              </div>

              {session.matricule && (
                <div className="flex items-center gap-2">
                  <IdCard size={14} className="shrink-0" aria-hidden="true" />
                  <dt className="sr-only">Matricule</dt>
                  <dd className="font-mono">{session.matricule}</dd>
                </div>
              )}

              {estAdmin && (
                <div className="flex items-center gap-2 text-amber-800">
                  <ShieldCheck size={14} className="shrink-0" aria-hidden="true" />
                  <dt className="sr-only">Droits</dt>
                  <dd>Accès aux rapports et aux paramètres</dd>
                </div>
              )}
            </dl>
          </div>

          {/* ── Préférences ──────────────────────────────────────────────────
              Présentes mais désactivées, comme les anciens boutons « FR » et
              « Moon » : on montre ce qui viendra sans laisser croire que c'est
              là. `disabled` et non un simple style grisé — un bouton
              visuellement éteint mais cliquable est pire que pas de bouton. */}
          <div className="border-b border-blue-100 py-1">
            <button
              type="button"
              disabled
              title="Traduction pas encore disponible"
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-500
                         cursor-not-allowed"
            >
              <Globe size={16} aria-hidden="true" />
              <span>Langue</span>
              <span className="ml-auto rounded bg-blue-100 px-1.5 py-0.5 text-xs">FR</span>
            </button>

            <button
              type="button"
              disabled
              // ⚠️ Le thème sombre avait été RETIRÉ le 20/08/2026 : le bloc
              // `prefers-color-scheme` de globals.css rendait l'application
              // illisible (1,07:1 mesuré), parce que `body` est hors de toute
              // couche et l'emportait sur les utilitaires de fond. Le rétablir
              // demandera de reprendre les couleurs de surface, pas seulement
              // de rebrancher un interrupteur.
              title="Thème sombre à reprendre — l'ancien rendait l'application illisible"
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-500
                         cursor-not-allowed"
            >
              <Moon size={16} aria-hidden="true" />
              <span>Thème sombre</span>
              <span className="ml-auto text-xs">Bientôt</span>
            </button>
          </div>

          {/* ── Sortie ────────────────────────────────────────────────────────
              `<form>` et non `onClick` : la déconnexion révoque un jeton en base
              et efface des cookies, donc elle passe par une Server Action. En
              POST, elle n'est pas déclenchable par une simple balise <img>
              pointant sur une URL, ce qui serait le cas d'un GET. */}
          <form action={deconnecter}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium
                         text-red-800 transition-colors duration-200 hover:bg-red-50
                         focus-visible:outline-none focus-visible:bg-red-50"
            >
              <LogOut size={16} aria-hidden="true" />
              Se déconnecter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
