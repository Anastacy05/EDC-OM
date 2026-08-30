"use client";

import { useActionState, useMemo, useState } from "react";
import { MapPinPlus, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { actionAjouterLocalite, type EtatLocalite } from "./actions";
import { NOM_LOCALITE_MAX, cleLocalite } from "@/lib/data/localites.validation";
import { villesDuPays } from "@/lib/locations";
import AutocompleteInput from "@/components/AutocompleteInput";
import {
  inputClass,
  carteClass,
  legendClass,
  boutonPrimaire,
  TAILLE_ICONE,
} from "@/lib/styles";

/**
 * Formulaire d'ajout d'une localité.
 *
 * ── Le pays est saisi par son NOM, et doit être reconnu ─────────────────────
 *
 * Même composant d'autocomplétion que le formulaire d'OM, et même règle : la
 * valeur envoyée est le nom français, que le serveur doit retrouver EXACTEMENT
 * dans la table `pays`. Un pays approché rattacherait la localité à la mauvaise
 * liste, où elle ne serait jamais proposée — une ligne morte que rien ne
 * signalerait. D'où le rappel sous le champ quand le nom n'est pas au
 * référentiel, avant même la soumission.
 *
 * ⚠️ Une liste déroulante de 250 pays a été écartée : c'est le motif retenu
 * partout ailleurs dans l'application pour les pays, et une liste de cette taille
 * se parcourt mal. L'autocomplétion s'ouvre entière au clic depuis le 24/08/2026,
 * donc elle se PARCOURT aussi bien qu'un `<select>`.
 *
 * ── Le doublon avec la liste du paquet : un avis, pas un refus ──────────────
 *
 * Les ~148 000 villes de `country-state-city` sont chargées ici, dans le
 * navigateur — c'est le même module que le formulaire d'OM. On peut donc dire à
 * l'administrateur « Douala est déjà proposée » AVANT qu'il n'ajoute un doublon.
 *
 * Mais c'est un AVIS, et l'ajout reste permis : la comparaison porte sur une
 * graphie, et l'orthographe du paquet est parfois l'anglaise (« Yaounde » sans
 * accent). Interdire fermerait le cas légitime où l'on veut la forme française.
 * Ce contrôle n'est pas fait côté serveur, et ne doit pas l'être : y importer le
 * paquet chargerait des mégaoctets de JSON dans le processus pour une politesse.
 */
export default function FormulaireLocalite({ nomsPays }: { nomsPays: string[] }) {
  const [etat, action, enCours] = useActionState<EtatLocalite | undefined, FormData>(
    actionAjouterLocalite,
    undefined
  );

  const [pays, setPays] = useState("");
  const [nom, setNom] = useState("");

  const paysReconnu = useMemo(() => {
    const propre = pays.trim();
    return propre !== "" && nomsPays.includes(propre);
  }, [pays, nomsPays]);

  /**
   * La localité figure-t-elle déjà dans la liste du paquet ?
   *
   * `villesDuPays` met son résultat en cache par pays : la liste n'est donc
   * relue qu'au changement de pays, pas à chaque frappe dans le champ « nom ».
   * La comparaison est faite sans accents ni casse, comme l'index unique en base.
   */
  const dejaDansLeCatalogue = useMemo(() => {
    const cherche = cleLocalite(nom);
    if (cherche === "" || !paysReconnu) return false;
    return villesDuPays(pays.trim()).some((v) => cleLocalite(v) === cherche);
  }, [nom, pays, paysReconnu]);

  return (
    <section id="ajouter" className={`${carteClass} max-w-3xl scroll-mt-20`}>
      <h2 className={legendClass}>Ajouter une localité</h2>

      {etat?.erreur && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          {etat.erreur}
        </p>
      )}

      {etat?.succes && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900"
        >
          <CheckCircle2 size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          {etat.succes}
        </p>
      )}

      <form action={action} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="pays" className="text-sm font-medium text-blue-900">
              Pays{" "}
              <span aria-hidden="true" className="text-red-700">
                *
              </span>
              <span className="sr-only">(obligatoire)</span>
            </label>
            {/* Champ caché : `AutocompleteInput` n'expose pas d'attribut `name`,
                c'est lui qui porte la valeur envoyée. Le même motif que le
                formulaire d'OM pour `paysDestination`. */}
            <input type="hidden" name="pays" value={pays} />
            <AutocompleteInput
              value={pays}
              onChange={(v) => setPays(v)}
              suggestions={nomsPays}
              placeholder="Cameroun"
            />
            {pays.trim() !== "" && !paysReconnu && (
              <p className="text-xs text-amber-800">
                Pays non reconnu — choisissez-le dans les suggestions. C&apos;est lui qui
                décide dans quelle liste la localité sera proposée.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="nom" className="text-sm font-medium text-blue-900">
              Localité{" "}
              <span aria-hidden="true" className="text-red-700">
                *
              </span>
              <span className="sr-only">(obligatoire)</span>
            </label>
            <input
              id="nom"
              name="nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
              maxLength={NOM_LOCALITE_MAX}
              placeholder="Nachtigal"
              aria-describedby="aide-nom-localite"
              className={inputClass}
            />
            <p id="aide-nom-localite" className="text-xs text-slate-600">
              Écrivez-la telle qu&apos;elle doit apparaître sur l&apos;ordre de mission :
              c&apos;est cette graphie qui sera imprimée.
            </p>
          </div>
        </div>

        {dejaDansLeCatalogue && (
          <p className="flex items-start gap-2 rounded-lg bg-blue-100 px-3 py-2 text-sm text-blue-900">
            <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              <strong>{nom.trim()}</strong> est déjà proposée pour {pays.trim()} : il
              n&apos;y a rien à ajouter. Sauf si vous voulez une autre graphie — la liste
              d&apos;origine écrit parfois les noms à l&apos;anglaise.
            </span>
          </p>
        )}

        <button
          type="submit"
          disabled={enCours || !paysReconnu}
          className={`${boutonPrimaire} self-start`}
        >
          <MapPinPlus size={TAILLE_ICONE} aria-hidden="true" />
          {enCours ? "Ajout…" : "Ajouter"}
        </button>

        {/* Le bouton désactivé doit dire POURQUOI : sans ça, on clique sur un
            bouton qui ne réagit pas, sans savoir ce qui manque. */}
        {!paysReconnu && (
          <p className="text-xs text-slate-600">
            Choisissez d&apos;abord un pays du référentiel.
          </p>
        )}
      </form>
    </section>
  );
}
