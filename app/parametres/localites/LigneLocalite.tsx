"use client";

import { useActionState } from "react";
import { MapPin, Trash2, AlertCircle } from "lucide-react";
import { actionRetirerLocalite, type EtatLocalite } from "./actions";
import type { LocaliteListe } from "@/lib/data/localites";
import { boutonDanger, TAILLE_ICONE } from "@/lib/styles";
import BoutonConfirme from "@/components/BoutonConfirme";

/**
 * Une ligne de la liste des localités.
 *
 * Composant client parce qu'elle porte une action dont le refus s'affiche
 * (`useActionState`). Un formulaire nu obligerait à lever pour signaler l'échec,
 * ce qui remplacerait la page par la frontière d'erreur de Next.
 */
export default function LigneLocalite({ localite }: { localite: LocaliteListe }) {
  const [etat, action, enCours] = useActionState<EtatLocalite | undefined, FormData>(
    actionRetirerLocalite,
    undefined
  );

  return (
    <li className="flex flex-col gap-2 px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <MapPin
            size={16}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-blue-700"
          />
          <div className="flex flex-col">
            <span className="font-medium text-blue-900">{localite.nom}</span>
            <span className="text-xs text-slate-600">
              {localite.nomPays}
              {" · ajoutée le "}
              {new Date(localite.creeLe).toLocaleDateString("fr-FR", { dateStyle: "long" })}
              {/* L'auteur, s'il est encore là. Le taire quand il a disparu plutôt
                  que d'écrire « par — » : l'information n'existe plus, et la
                  clé étrangère est en `SET NULL` précisément pour que la
                  localité survive à son compte. */}
              {localite.auteur ? ` par ${localite.auteur}` : ""}
            </span>
          </div>
        </div>

        <form action={action}>
          <input type="hidden" name="id" value={localite.id} />
          <BoutonConfirme
            titre="Retirer cette localité des suggestions ?"
            message={
              <>
                <strong>{localite.nom}</strong> ne sera plus proposée dans les villes de{" "}
                {localite.nomPays}. Les ordres de mission qui la citent{" "}
                <strong>ne changent pas</strong> : la ville d&apos;un OM est un texte
                enregistré une fois pour toutes, pas une référence à cette liste.
                <br />
                Elle pourra être remise plus tard.
              </>
            }
            libelleConfirmer="Retirer"
            danger
            enCours={enCours}
            className={`${boutonDanger} text-xs`}
          >
            <Trash2 size={TAILLE_ICONE} aria-hidden="true" />
            {enCours ? "Retrait…" : "Retirer"}
          </BoutonConfirme>
        </form>
      </div>

      {etat?.erreur && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          <AlertCircle size={14} aria-hidden="true" className="mr-1 inline" />
          {etat.erreur}
        </p>
      )}
    </li>
  );
}
