"use client";

import { useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { filtreInputClass } from "@/lib/styles";
import type { OptionReferentiel } from "@/lib/referentiels";
import { STATUTS_PARTICIPATION } from "@/lib/data/om.validation";

/**
 * Barre de filtres de la liste des ordres de mission.
 *
 * ── Ce qui change par rapport à l'écran précédent ─────────────────────────────
 *
 * Les filtres étaient portés par `useState` et appliqués en JavaScript sur la
 * TOTALITÉ des OM déjà transmis au navigateur. Ils passent maintenant par l'URL et
 * sont appliqués en SQL. Trois conséquences :
 *
 *   1. une liste filtrée est **partageable** — c'est déjà ce dont les rapports se
 *      servaient en arrivant ici avec `?pays=` ou `?matricule=` ;
 *   2. le bouton « précédent » du navigateur défait le filtre ;
 *   3. seule la page demandée traverse le réseau, et les participations des autres
 *      agents ne sont **jamais envoyées** à un utilisateur qui n'y a pas droit —
 *      l'ancien filtrage client les lui livrait toutes avant de les masquer.
 *
 * Seule cette barre est cliente, parce qu'elle doit réagir à la saisie.
 */
export default function FiltresOM({
  statuts,
  departements,
  pays,
  /** Vrai si l'utilisateur est administrateur : lui seul filtre par personne. */
  estAdministrateur,
}: {
  statuts: OptionReferentiel[];
  departements: OptionReferentiel[];
  pays: OptionReferentiel[];
  estAdministrateur: boolean;
}) {
  const router = useRouter();
  const parametres = useSearchParams();
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const valeur = (cle: string) => parametres.get(cle) ?? "";

  /**
   * Réécrit un paramètre et navigue.
   *
   * `router.replace` et non `push` : chaque frappe empilerait sinon une entrée
   * d'historique, et il faudrait autant de « précédent » que de caractères tapés
   * pour sortir de la page.
   *
   * ⚠️ La page est remise à 1 à chaque changement de filtre. Sans ça, un
   * utilisateur sur la page 4 qui affine sa recherche atterrirait sur la page 4
   * d'un résultat qui n'en compte qu'une — un écran vide, alors que des résultats
   * existent.
   */
  const definir = (cle: string, v: string) => {
    const suivants = new URLSearchParams(parametres);
    if (v) suivants.set(cle, v);
    else suivants.delete(cle);
    if (cle !== "page") suivants.delete("page");
    router.replace(suivants.size ? `/om?${suivants}` : "/om");
  };

  /**
   * Recherche différée de 300 ms.
   *
   * Sans ce délai, chaque caractère déclenche une requête SQL et un rendu serveur.
   * 300 ms est au-dessus du rythme de frappe courant et reste imperceptible.
   */
  const rechercher = (v: string) => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => definir("q", v), 300);
  };

  const CLES = [
    "q", "statut", "poste", "direction", "pays", "ville",
    "debut", "fin", "dureeMin", "dureeMax", "matricule", "bloques",
  ];
  const aDesFiltres = CLES.some((c) => parametres.get(c));

  return (
    <div className="flex flex-col gap-3">
      {/* Bandeau du filtre venu d'un rapport : sans lui, l'utilisateur voit une
          liste étrangement courte sans comprendre pourquoi. */}
      {valeur("matricule") && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          <span>
            Filtré sur l&apos;employé <strong className="font-mono">{valeur("matricule")}</strong>
            {" "}— venu d&apos;un rapport.
          </span>
          <button
            type="button"
            onClick={() => definir("matricule", "")}
            className="underline hover:no-underline"
          >
            Retirer ce filtre
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-700"
          />
          <input
            type="search"
            // `defaultValue` et non `value` : le champ n'est pas contrôlé, sinon le
            // différé de 300 ms ferait sauter le curseur à chaque rendu.
            defaultValue={valeur("q")}
            onChange={(e) => rechercher(e.target.value)}
            placeholder="Nom, matricule ou n° d'OM"
            aria-label="Rechercher un ordre de mission"
            aria-describedby="aide-recherche-om"
            className={`${filtreInputClass} w-64 pl-9`}
          />
        </div>

        <p id="aide-recherche-om" className="sr-only">
          La recherche ignore les accents et la casse : « nkolo » trouve « NKOLÔ ».
        </p>

        {/* Les CINQ statuts, et non trois : `REFUSE` et `EXPIRE` existent en base
            depuis l'étape 8. L'ancienne liste en ignorait deux, donc deux états
            étaient infiltrables. */}
        <select
          value={valeur("statut")}
          onChange={(e) => definir("statut", e.target.value)}
          aria-label="Filtrer par statut de l'ordre de mission"
          className={filtreInputClass}
        >
          <option value="">Tous les statuts</option>
          {STATUTS_PARTICIPATION.map((s) => (
            <option key={s.valeur} value={s.valeur}>
              {s.libelle}
            </option>
          ))}
        </select>

        {/* « Poste » bascule sur le référentiel STATUTS : POSTES a été supprimé le
            19/08/2026 parce qu'il dupliquait STATUTS, et `participation` ne porte
            pas de colonne `poste` mais `code_statut_s`. */}
        <select
          value={valeur("poste")}
          onChange={(e) => definir("poste", e.target.value)}
          aria-label="Filtrer par statut hiérarchique"
          className={filtreInputClass}
        >
          <option value="">Tous les statuts hiérarchiques</option>
          {statuts.map((s) => (
            <option key={s.valeur} value={s.valeur}>
              {s.libelle}
            </option>
          ))}
        </select>

        <select
          value={valeur("direction")}
          onChange={(e) => definir("direction", e.target.value)}
          aria-label="Filtrer par direction"
          className={filtreInputClass}
        >
          <option value="">Toutes les directions</option>
          {departements.map((d) => (
            <option key={d.valeur} value={d.valeur}>
              {d.libelle}
            </option>
          ))}
        </select>

        {/* Liste fermée et non autocomplétion libre : les pays viennent du
            référentiel, donc une saisie libre ne pourrait que produire un filtre
            sans résultat. La valeur envoyée est le code ISO. */}
        <select
          value={valeur("pays")}
          onChange={(e) => definir("pays", e.target.value)}
          aria-label="Filtrer par pays de destination"
          className={filtreInputClass}
        >
          <option value="">Tous les pays</option>
          {pays.map((p) => (
            <option key={p.valeur} value={p.valeur}>
              {p.libelle}
            </option>
          ))}
        </select>

        <input
          type="search"
          defaultValue={valeur("ville")}
          onChange={(e) => {
            if (minuteur.current) clearTimeout(minuteur.current);
            const v = e.target.value;
            minuteur.current = setTimeout(() => definir("ville", v), 300);
          }}
          placeholder="Ville"
          aria-label="Filtrer par ville de destination"
          className={`${filtreInputClass} w-40`}
        />

        <label className="flex flex-col gap-1 text-xs text-amber-700">
          Départ — du
          <input
            type="date"
            value={valeur("debut")}
            onChange={(e) => definir("debut", e.target.value)}
            className={filtreInputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-amber-700">
          au
          <input
            type="date"
            value={valeur("fin")}
            onChange={(e) => definir("fin", e.target.value)}
            className={filtreInputClass}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-amber-700">
          Durée min (j.)
          <input
            type="number"
            min={1}
            value={valeur("dureeMin")}
            onChange={(e) => definir("dureeMin", e.target.value)}
            className={`${filtreInputClass} w-28`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-amber-700">
          max (j.)
          <input
            type="number"
            min={1}
            value={valeur("dureeMax")}
            onChange={(e) => definir("dureeMax", e.target.value)}
            className={`${filtreInputClass} w-28`}
          />
        </label>

        {/* Réservé à l'administrateur : c'est lui qui arbitre les conflits, et un
            agent ne voit de toute façon que ses propres participations. */}
        {estAdministrateur && (
          <label className="flex items-center gap-2 text-sm text-blue-900">
            <input
              type="checkbox"
              checked={valeur("bloques") === "1"}
              onChange={(e) => definir("bloques", e.target.checked ? "1" : "")}
              className="h-4 w-4 rounded border-blue-500"
            />
            Uniquement les conflits à arbitrer
          </label>
        )}

        {aDesFiltres && (
          <button
            type="button"
            onClick={() => router.replace("/om")}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-blue-700
                       transition-colors duration-200 hover:bg-blue-100 focus-visible:outline-none
                       focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X size={16} aria-hidden="true" />
            Effacer les filtres
          </button>
        )}
      </div>
    </div>
  );
}
