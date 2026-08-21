"use client";

import { useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { filtreInputClass } from "@/lib/styles";
import type { OptionReferentiel } from "@/lib/referentiels";

/**
 * Barre de filtres de la liste du personnel.
 *
 * ── Pourquoi les filtres passent par l'URL ───────────────────────────────────
 *
 * Et non par un état local. Trois conséquences concrètes :
 *
 *   1. une recherche est **partageable** — un RH peut envoyer le lien d'une
 *      liste filtrée à un collègue ;
 *   2. le bouton « précédent » du navigateur défait le filtre, comportement
 *      attendu ;
 *   3. la page reste un composant SERVEUR : c'est lui qui lit `searchParams` et
 *      interroge la base, donc le filtrage se fait en SQL et non en JavaScript
 *      sur une liste déjà entièrement transmise au navigateur. Avec plusieurs
 *      centaines d'employés, la différence n'est pas théorique.
 *
 * Seule cette barre est cliente, parce qu'elle doit réagir à la saisie.
 */
export default function FiltresPersonnel({
  statuts,
  departements,
}: {
  statuts: OptionReferentiel[];
  departements: OptionReferentiel[];
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
   */
  const definir = (cle: string, v: string) => {
    const suivants = new URLSearchParams(parametres);
    if (v) suivants.set(cle, v);
    else suivants.delete(cle);
    router.replace(suivants.size ? `/personnel?${suivants}` : "/personnel");
  };

  /**
   * Recherche différée de 300 ms.
   *
   * Sans ce délai, chaque caractère déclenche une requête SQL et un rendu
   * serveur : taper « ATANGANA » en lancerait huit, dont sept jetées. 300 ms est
   * au-dessus du rythme de frappe courant et reste imperceptible.
   */
  const rechercher = (v: string) => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => definir("q", v), 300);
  };

  const aDesFiltres = ["q", "statut", "direction", "inactifs"].some((c) => parametres.get(c));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        {/* L'icône est décorative : le champ porte déjà un `aria-label`. */}
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
          placeholder="Nom, prénoms ou matricule"
          aria-label="Rechercher un employé"
          className={`${filtreInputClass} pl-9 w-64`}
        />
      </div>

      <select
        value={valeur("statut")}
        onChange={(e) => definir("statut", e.target.value)}
        aria-label="Filtrer par statut"
        className={filtreInputClass}
      >
        <option value="">Tous les statuts</option>
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

      {/* Les désactivés sont masqués par défaut : ils encombreraient la liste
          d'exploitation courante. Mais ils doivent rester atteignables, sinon on
          ne peut plus réactiver personne. */}
      <label className="flex items-center gap-2 text-sm text-blue-900">
        <input
          type="checkbox"
          checked={valeur("inactifs") === "1"}
          onChange={(e) => definir("inactifs", e.target.checked ? "1" : "")}
          className="h-4 w-4 rounded border-blue-500"
        />
        Inclure les employés désactivés
      </label>

      {aDesFiltres && (
        <button
          type="button"
          onClick={() => router.replace("/personnel")}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-blue-700
                     transition-colors duration-200 hover:bg-blue-100 focus-visible:outline-none
                     focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X size={16} aria-hidden="true" />
          Effacer les filtres
        </button>
      )}
    </div>
  );
}
