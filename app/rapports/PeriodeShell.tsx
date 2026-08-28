"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Printer } from "lucide-react";
import { filtreInputClass } from "@/lib/styles";

/**
 * Barre de filtre par période + conteneur du contenu qu'elle filtre, pour les
 * rapports n° 1-9 (MODELE-DONNEES.md §11).
 *
 * ── Pourquoi la barre et l'assombrissement vivent dans le MÊME composant ────
 *
 * §11, règles communes : « Au rechargement, maintenir l'affichage précédent en
 * opacité réduite plutôt qu'afficher un squelette : pas de saut de mise en
 * page. » `children` est un composant SERVEUR (async, lit `lireLignesRapports`)
 * — la seule façon de savoir, côté client, qu'une nouvelle version est en
 * cours de préparation est d'envelopper la navigation dans `useTransition` :
 * `isPending` reste vrai tant que React n'a pas reçu le nouveau rendu serveur,
 * et l'ANCIEN `children` continue de s'afficher pendant ce temps — c'est ce
 * mécanisme, pas un `<Suspense fallback>`, qui évite le squelette.
 *
 * Ça oblige à ce que le bouton qui déclenche la navigation et le `<div>` qui
 * s'assombrit partagent le même état — d'où un seul composant plutôt que
 * `FiltrePeriode` (retiré) séparé du contenu.
 */
export default function PeriodeShell({
  debutParDefaut,
  finParDefaut,
  children,
}: {
  /** Bornes effectivement appliquées quand l'URL ne précise rien — affichées dans les champs, pas seulement calculées en silence. */
  debutParDefaut: string;
  finParDefaut: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const parametres = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const debut = parametres.get("debut") ?? debutParDefaut;
  const fin = parametres.get("fin") ?? finParDefaut;

  const definir = (nouvellesBornes: { debut: string; fin: string }) => {
    const suivants = new URLSearchParams(parametres);
    suivants.set("debut", nouvellesBornes.debut);
    suivants.set("fin", nouvellesBornes.fin);
    // startTransition : sans lui, Next.js afficherait immédiatement le
    // fallback de Suspense le plus proche (donc un squelette) le temps que le
    // nouveau rendu serveur arrive. Avec lui, React garde l'ancien `children`
    // à l'écran et se contente de lever `isPending`.
    startTransition(() => {
      router.replace(`${pathname}?${suivants}`);
    });
  };

  const aujourdHui = new Date();
  const anneeCourante = aujourdHui.getUTCFullYear();

  const appliquerCetteAnnee = () =>
    definir({ debut: `${anneeCourante}-01-01`, fin: `${anneeCourante}-12-31` });

  const appliquerDouzeDerniersMois = () => {
    const finJour = aujourdHui.toISOString().slice(0, 10);
    const debutDate = new Date(aujourdHui);
    debutDate.setUTCFullYear(debutDate.getUTCFullYear() - 1);
    debutDate.setUTCDate(debutDate.getUTCDate() + 1);
    definir({ debut: debutDate.toISOString().slice(0, 10), fin: finJour });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* print:hidden : choisir une période ou relancer un calcul n'a aucun
          sens sur une page déjà imprimée — seul le CONTENU filtré doit
          apparaître sur le papier. */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Depuis
          <input
            type="date"
            value={debut}
            max={fin}
            onChange={(e) => e.target.value && definir({ debut: e.target.value, fin })}
            className={filtreInputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Jusqu&apos;au
          <input
            type="date"
            value={fin}
            min={debut}
            onChange={(e) => e.target.value && definir({ debut, fin: e.target.value })}
            className={filtreInputClass}
          />
        </label>
        <button type="button" onClick={appliquerCetteAnnee} className="text-sm text-blue-700 underline hover:no-underline">
          Cette année
        </button>
        <button type="button" onClick={appliquerDouzeDerniersMois} className="text-sm text-blue-700 underline hover:no-underline">
          12 derniers mois
        </button>
        {isPending && (
          <span className="text-sm text-gray-500" role="status">
            Actualisation…
          </span>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900"
        >
          <Printer size={14} aria-hidden="true" />
          Imprimer
        </button>
      </div>

      <div className={isPending ? "opacity-50 transition-opacity" : "transition-opacity"}>
        {children}
      </div>
    </div>
  );
}
