import Link from "next/link";
import { MapPinPlus, MapPin, Info } from "lucide-react";
import { listerLocalites } from "@/lib/data/localites";
import { getNomsPays } from "@/lib/data/referentiels";
import {
  boutonPrimaire,
  carteClass,
  conteneurLargeClass,
  legendClass,
  titrePageClass,
  TAILLE_ICONE,
} from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import FormulaireLocalite from "./FormulaireLocalite";
import LigneLocalite from "./LigneLocalite";

/**
 * Gestion des localités proposées dans les villes d'un pays.
 *
 * ── Ce que cet écran règle ───────────────────────────────────────────────────
 *
 * Les suggestions de ville du formulaire d'OM viennent du paquet
 * `country-state-city`, qui ne connaît que les agglomérations. Les sites de
 * production de l'EDC — Nachtigal, Song Loulou, Memve'ele, Lom Pangar — n'y
 * figurent pas, et « aucune suggestion » se lit comme un refus de la saisie.
 *
 * ── Lecture par tout administrateur, écriture aussi ──────────────────────────
 *
 * Contrairement aux administrateurs, il n'y a pas ici de restriction au
 * fondateur : ajouter une localité ne donne aucun droit à personne, ça complète
 * une liste de propositions. Le préfixe `/parametres` est réservé aux
 * administrateurs par le proxy, et le DAL porte `exigerAdministrateur`.
 *
 * ⚠️ Ce que cette page montre n'est PAS ce qui protège. La doc le dit :
 * « Server Functions are reachable via direct POST requests. » Ce sont les gardes
 * du DAL qui refusent, l'écran ne fait que ne pas proposer l'impossible.
 */

export const metadata = { title: "Localités — EDC OM" };

export default async function LocalitesPage() {
  // `listerLocalites` porte `exigerAdministrateur` : un non-administrateur est
  // redirigé avant d'arriver ici.
  const [localites, nomsPays] = await Promise.all([listerLocalites(), getNomsPays()]);

  return (
    <div className={conteneurLargeClass}>
      <RetourVers href="/parametres" libelle="Retour aux paramètres" />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className={titrePageClass}>Localités</h1>

        {/* Une ANCRE et non un bouton avec `scrollIntoView` : elle fonctionne sans
            JavaScript et — c'est le point qui compte — elle DÉPLACE LE FOCUS sur
            la cible. Un défilement programmé ne le fait pas : la page bougerait
            sous les yeux d'un utilisateur au clavier dont le curseur serait resté
            en haut. `next/link` est inutile, la cible étant sur cette page. */}
        <a href="#ajouter" className={boutonPrimaire}>
          <MapPinPlus size={TAILLE_ICONE} aria-hidden="true" />
          Ajouter une localité
        </a>
      </div>

      <section className={`${carteClass} max-w-3xl`}>
        <h2 className={legendClass}>À quoi sert cette liste</h2>
        <p className="text-sm text-blue-900/80">
          Le champ « ville de destination » propose environ 148 000 villes, issues
          d&apos;une base publique qui ne connaît que les agglomérations. Les sites de
          production — Nachtigal, Song Loulou, Memve&apos;ele, Lom Pangar — n&apos;y
          sont pas. Ce que vous ajoutez ici s&apos;ajoute à ces suggestions, pour le pays
          choisi.
        </p>
        <p className="flex items-start gap-2 rounded-lg bg-blue-100 p-3 text-sm text-blue-900">
          <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            Le champ ville reste <strong>libre</strong> : une localité absente de cette
            liste peut être saisie à la main, et l&apos;ordre de mission s&apos;émettra
            normalement. Ce que cet écran change, c&apos;est que le nom soit{" "}
            <strong>proposé</strong> — donc écrit de la même façon par tout le monde, ce
            dont dépendent les regroupements des rapports.
          </span>
        </p>
      </section>

      {/* ── Liste ──────────────────────────────────────────────────────────── */}
      <section className={`${carteClass} max-w-3xl p-0`}>
        <h2 className={`${legendClass} px-6 pt-6`}>
          Localités ajoutées ({localites.length})
        </h2>

        {localites.length === 0 ? (
          <p className="flex items-start gap-2 px-6 pb-6 text-sm text-slate-600">
            <MapPin size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              Aucune pour l&apos;instant. Les 148 000 villes de la base publique restent
              proposées : cette liste ne les remplace pas, elle les complète.
            </span>
          </p>
        ) : (
          <ul className="divide-y divide-blue-100">
            {localites.map((localite) => (
              <LigneLocalite key={localite.id} localite={localite} />
            ))}
          </ul>
        )}
      </section>

      {/* ── Ajout ──────────────────────────────────────────────────────────── */}
      <FormulaireLocalite nomsPays={nomsPays} />

      <p className="max-w-3xl text-xs text-slate-600">
        <MapPin size={12} aria-hidden="true" className="mr-1 inline" />
        Retirer une localité ne modifie <strong>aucun ordre de mission</strong> : la ville
        d&apos;un OM est un texte enregistré à l&apos;émission, pas une référence à cette
        liste. Un OM déjà signé continue d&apos;afficher et d&apos;imprimer sa
        destination. Voir la{" "}
        <Link href="/om" className="text-blue-700 underline">
          liste des ordres de mission
        </Link>
        .
      </p>
    </div>
  );
}
