import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import { STATUTS_ENGAGEANTS, STATUTS_BLOQUANTS } from "@/lib/data/om.validation";
import { versChampDate } from "@/lib/dateUtils";

/**
 * Détection des chevauchements de période, en SQL.
 *
 * ── Pourquoi un module à part ────────────────────────────────────────────────
 *
 * La même requête sert à quatre moments du cycle de vie, et il est essentiel
 * qu'elle soit **littéralement la même** :
 *
 *   1. à la création, pour refuser un chevauchement avec un OM confirmé ;
 *   2. à la création encore, pour signaler un chevauchement avec un OM en attente ;
 *   3. à la confirmation, comme dernier filet — et pour inscrire le blocage sur
 *      les OM en attente qui viennent de perdre ;
 *   4. à l'annulation, pour savoir si un blocage devenu sans objet peut tomber.
 *
 * Trois copies de cette logique finiraient par diverger, et l'écart se lirait en
 * FCFA sur un document signé : un agent envoyé deux fois aux mêmes dates touche
 * deux indemnités.
 *
 * ── L'intervalle est FERMÉ des deux côtés ────────────────────────────────────
 *
 * `daterange(depart, retour, '[]')` : un retour le 10 et un départ le 10 **se
 * chevauchent**. C'est la traduction exacte de `periodesSeChevauchent`
 * (lib/data/om.validation.ts), qui prévient que « l'équivalent SQL doit rester
 * d'accord ». Les deux bornes comptent, cohérent avec `dureeEnJours` : une
 * mission d'un seul jour dure un jour, pas zéro.
 *
 * ⚠️ `&&` sur un `daterange` **ne peut pas utiliser** `idx_om_date_depart` : un
 * index B-tree n'indexe pas un recouvrement d'intervalles. La requête est donc
 * bornée par `p.matricule = ANY(…)`, qui passe par `idx_part_matricule` — c'est
 * lui qui fait le travail. À quelques dizaines d'OM par agent, le filtrage
 * d'intervalle sur le reste est négligeable ; il faudrait un index GiST si le
 * volume changeait d'ordre de grandeur.
 */

/** Un OM qui occupe déjà l'agent sur la période demandée. */
export interface Chevauchement {
  matricule: string;
  /** Nom de l'agent, tel que figé dans l'instantané de CETTE participation. */
  nom: string;
  prenoms: string;
  numeroOM: string;
  /** `EN_ATTENTE` ou `CONFIRME` — c'est lui qui dit si le chevauchement bloque. */
  statut: string;
  /** Identifiant de l'OM concurrent, sérialisé : un BigInt ne traverse pas RSC. */
  idOM: string;
  /** « Pays, Ville », composée pour l'affichage. */
  destination: string;
  /** Format `AAAA-MM-JJ`. */
  dateDepart: string;
  dateRetour: string;
}

/** Ligne brute du `$queryRaw`. Alias en minuscules : PostgreSQL replie les identifiants. */
interface LigneChevauchement {
  matricule: string;
  nom_s: string;
  prenoms_s: string;
  numero_om: string;
  statut: string;
  id_om: bigint;
  nom_fr: string;
  ville_destination: string;
  date_depart: Date;
  date_retour: Date;
}

/**
 * Cherche les OM engageants qui recouvrent `[depart, retour]` pour ces agents.
 *
 * `idOMExclu` retire un OM de la recherche — indispensable à la confirmation et à
 * l'annulation, où l'OM courant recouvre évidemment sa propre période et se
 * signalerait lui-même comme conflit.
 *
 * `statuts` par défaut : les deux statuts engageants. Passer `STATUTS_BLOQUANTS`
 * restreint aux seuls confirmés, ce qui est la question « ce participant est-il
 * réellement empêché ? ».
 */
export async function chercherChevauchements(
  tx: Prisma.TransactionClient,
  parametres: {
    matricules: readonly string[];
    depart: Date;
    retour: Date;
    idOMExclu?: bigint | null;
    statuts?: readonly string[];
  }
): Promise<Chevauchement[]> {
  const { matricules, depart, retour } = parametres;
  if (matricules.length === 0) return [];

  const statuts = [...(parametres.statuts ?? STATUTS_ENGAGEANTS)];
  const exclu = parametres.idOMExclu ?? null;

  const lignes = await tx.$queryRaw<LigneChevauchement[]>`
    SELECT
      p.matricule,
      p.nom_s,
      p.prenoms_s,
      p.numero_om,
      p.statut::text          AS statut,
      o.id                    AS id_om,
      pa.nom_fr,
      o.ville_destination,
      o.date_depart,
      o.date_retour
    FROM participation p
    JOIN ordre_mission o ON o.id = p.id_ordre_mission
    JOIN pays pa         ON pa.code_iso = o.code_pays
    WHERE p.matricule = ANY(${[...matricules]}::text[])
      -- Cast text des deux côtés : statut est un type énuméré, et comparer un
      -- enum à un tableau de texte sans cast échoue sur « operator does not exist ».
      AND p.statut::text = ANY(${statuts}::text[])
      -- Intervalle FERMÉ : retour le 10 contre départ le 10 = chevauchement.
      AND daterange(o.date_depart, o.date_retour, '[]')
       && daterange(${depart}::date, ${retour}::date, '[]')
      AND (${exclu}::bigint IS NULL OR o.id <> ${exclu}::bigint)
    -- Le plus contraignant d'abord : un confirmé passe avant un en attente, et
    -- l'appelant n'affiche souvent que le premier.
    ORDER BY (p.statut::text = 'CONFIRME') DESC, o.date_depart ASC
  `;

  return lignes.map((l) => ({
    matricule: l.matricule,
    nom: l.nom_s,
    prenoms: l.prenoms_s,
    numeroOM: l.numero_om,
    statut: l.statut,
    idOM: String(l.id_om),
    destination: `${l.nom_fr}, ${l.ville_destination}`,
    dateDepart: versChampDate(l.date_depart),
    dateRetour: versChampDate(l.date_retour),
  }));
}

/** Ceux qui bloquent réellement : un OM confirmé occupe déjà l'agent. */
export function chevauchementsBloquants(liste: Chevauchement[]): Chevauchement[] {
  const bloquants = new Set<string>(STATUTS_BLOQUANTS);
  return liste.filter((c) => bloquants.has(c.statut));
}

/** Ceux qui méritent un signal sans empêcher : deux hypothèses concurrentes. */
export function chevauchementsSignales(liste: Chevauchement[]): Chevauchement[] {
  const bloquants = new Set<string>(STATUTS_BLOQUANTS);
  return liste.filter((c) => !bloquants.has(c.statut));
}

/**
 * Motif de blocage à inscrire dans `participation.blocage_motif`.
 *
 * ── Pourquoi une phrase et non un identifiant ────────────────────────────────
 *
 * La colonne est un `TEXT` libre, et la tentation serait d'y ranger l'identifiant
 * de l'OM gagnant pour pouvoir « défaire » proprement. C'est le choix inverse qui
 * est fait : le blocage est **recalculé** à chaque annulation, jamais déduit d'une
 * référence stockée. Un identifiant mémorisé finirait par mentir — l'OM désigné
 * peut lui-même être annulé, refusé, ou remplacé par un troisième.
 *
 * Le motif est donc de l'information destinée à un humain : il s'affiche à
 * l'écran et explique pourquoi la confirmation est refusée. Sa véracité au moment
 * où on le lit est garantie par le fait qu'on le réécrit, ou qu'on l'efface, à
 * chaque changement d'état.
 */
export function motifBlocage(conflit: Chevauchement): string {
  return (
    `Conflit de période : l'ordre de mission n° ${conflit.numeroOM} ` +
    `(${conflit.destination}, du ${conflit.dateDepart} au ${conflit.dateRetour}) ` +
    `est confirmé pour cet agent sur des dates qui se chevauchent. ` +
    `Annulez-le, ou modifiez les dates de celui-ci.`
  );
}
