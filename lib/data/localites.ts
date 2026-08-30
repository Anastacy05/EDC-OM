import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/data/client";
import { exigerAdministrateur, exigerAdministrateurOuEchouer } from "@/lib/auth/garde";
import { NOM_LOCALITE_MAX, normaliserNomLocalite } from "@/lib/data/localites.validation";

/**
 * Localités ajoutées à la main, en complément des villes du paquet
 * `country-state-city`.
 *
 * ── Ce que ce module règle ───────────────────────────────────────────────────
 *
 * Les suggestions de ville du formulaire d'OM viennent d'une base ouverte qui ne
 * connaît que les agglomérations. Les sites de production de l'EDC — Nachtigal,
 * Song Loulou, Memve'ele, Lom Pangar — n'y figurent pas. Le champ est libre, donc
 * la saisie passe ; mais « aucune suggestion » se lit comme un refus, et l'agent
 * finit par écrire chaque fois une graphie différente du même site.
 *
 * La liste du paquet vit dans `node_modules` : elle est réécrite à chaque
 * `npm install`, donc on ne peut pas y ajouter quoi que ce soit. Les ajouts
 * vivent en base et sont FUSIONNÉS aux suggestions à l'affichage.
 *
 * ── Deux niveaux de droits, et ils ne sont pas les mêmes ─────────────────────
 *
 *   • **lire** : tout administrateur, et — via `localitesParNomPays` — tout
 *     utilisateur qui ouvre le formulaire de création d'OM. Une suggestion n'est
 *     pas une donnée sensible ;
 *   • **écrire** : administrateur uniquement. Ce sont les propositions faites à
 *     toute l'entreprise : une localité mal orthographiée sera recopiée sur des
 *     documents signés.
 *
 * ⚠️ Rien ici ne CONTRAINT la saisie. `ordre_mission.ville_destination` reste un
 * texte libre, sans clé étrangère vers `localite`. Retirer une localité ne
 * touche aucun OM déjà émis — ça cesse seulement de la proposer.
 */

/** Une localité, telle que l'écran de gestion l'affiche. */
export interface LocaliteListe {
  /** `BigInt` sérialisé : un identifiant ne franchit jamais la frontière en BigInt. */
  id: string;
  codePays: string;
  /** Nom français du pays, pour l'affichage — c'est ce que l'écran groupe. */
  nomPays: string;
  nom: string;
  creeLe: string;
  /** Adresse du compte qui l'a ajoutée, ou `null` si ce compte a disparu. */
  auteur: string | null;
}

/**
 * Toutes les localités actives, groupées par pays puis par nom.
 *
 * Le tri est fait en SQL : la base est en `fr_FR.UTF-8` (cf. docker-compose.yml),
 * donc « Édéa » se classe entre « Douala » et « Eséka » et non rejeté en fin de
 * liste comme le ferait un tri sur les octets.
 *
 * Les localités RETIRÉES ne sont pas renvoyées. Elles restent en base — le
 * retrait est une désactivation, pas une suppression — mais l'écran de gestion
 * n'a pas à afficher un historique que personne n'a demandé. Le jour où il le
 * faudra, la donnée y est.
 */
export async function listerLocalites(): Promise<LocaliteListe[]> {
  await exigerAdministrateur();

  const lignes = await prisma.localite.findMany({
    where: { actif: true },
    orderBy: [{ pays: { nomFr: "asc" } }, { nom: "asc" }],
    select: {
      id: true,
      codePays: true,
      nom: true,
      creeLe: true,
      pays: { select: { nomFr: true } },
      auteur: { select: { email: true } },
    },
  });

  return lignes.map((l) => ({
    id: l.id.toString(),
    // `code_iso` est un CHAR(2) : PostgreSQL le complète à droite. Sans `trim`,
    // la valeur porterait un espace et ne correspondrait plus à une comparaison
    // JavaScript, qui n'ignore pas les blancs de fin comme le fait `bpchar`.
    codePays: l.codePays.trim(),
    nomPays: l.pays.nomFr,
    nom: l.nom,
    creeLe: l.creeLe.toISOString(),
    auteur: l.auteur?.email ?? null,
  }));
}

/**
 * Localités actives indexées par NOM FRANÇAIS de pays, pour le formulaire d'OM.
 *
 * ── Pourquoi le nom français et non le code ISO ──────────────────────────────
 *
 * Le formulaire connaît le pays par son nom : `paysDestination` est ce que
 * l'utilisateur a choisi dans les suggestions, et `DonneesFormulaireOM.zoneParPays`
 * est déjà indexé ainsi. Renvoyer des codes ISO obligerait le composant client à
 * porter une table de correspondance de plus, pour aboutir au même endroit.
 *
 * ── Lisible par tout utilisateur authentifié ─────────────────────────────────
 *
 * Pas de `exigerAdministrateur` ici, à la différence de `listerLocalites` : cette
 * fonction alimente les suggestions du formulaire de création, que tout
 * utilisateur authentifié peut ouvrir (décision du 22/08/2026). Le contrôle de
 * session est déjà porté par `lireDonneesFormulaireOM`, son unique appelante.
 *
 * `cache()` de React : deux appels dans la même requête ne font qu'une requête
 * SQL. La portée est LA REQUÊTE, pas le processus — une localité ajoutée est donc
 * visible au rafraîchissement suivant, sans invalidation à gérer.
 */
export const localitesParNomPays = cache(async (): Promise<Record<string, string[]>> => {
  const lignes = await prisma.localite.findMany({
    where: { actif: true },
    orderBy: { nom: "asc" },
    select: { nom: true, pays: { select: { nomFr: true } } },
  });

  const parPays: Record<string, string[]> = {};
  for (const l of lignes) {
    parPays[l.pays.nomFr] ??= [];
    parPays[l.pays.nomFr].push(l.nom);
  }
  return parPays;
});

export type EchecLocalite =
  | { genre: "paysInconnu" }
  | { genre: "nomVide" }
  | { genre: "nomTropLong" }
  | { genre: "dejaPresente" }
  | { genre: "introuvable" }
  | { genre: "baseIndisponible" };

/** Longueur de `localite.nom` en base. Réexportée par commodité : les appelants
 *  serveur n'ont pas à connaître le module de validation pour un seul nombre. */
export { NOM_LOCALITE_MAX };

function estViolationUnicite(erreur: unknown): boolean {
  return (
    typeof erreur === "object" &&
    erreur !== null &&
    "code" in erreur &&
    (erreur as { code: unknown }).code === "P2002"
  );
}

function estPanneBase(erreur: unknown): boolean {
  return (
    typeof erreur === "object" &&
    erreur !== null &&
    "code" in erreur &&
    ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "P1001", "P1002"].includes(
      String((erreur as { code: unknown }).code)
    )
  );
}

/**
 * Ajoute une localité à la liste des suggestions d'un pays.
 *
 * `nomPaysFr` est le nom tel que le formulaire l'a envoyé. Il doit correspondre
 * EXACTEMENT à une ligne de `pays` : on ne devine pas. Un pays approché
 * rattacherait la localité à la mauvaise liste, où elle ne serait jamais
 * proposée — une ligne morte que rien ne signalerait.
 *
 * ── Le doublon est détecté par la base, pas ici ──────────────────────────────
 *
 * `idx_localite_unique_par_pays` porte sur `(code_pays, lower(sans_accent(btrim(nom))))`
 * `WHERE actif`, donc « MEMVE'ELE » et « Memve'ele » se heurtent. Un `findFirst`
 * préalable ne remplacerait pas cet index : entre la lecture et l'écriture, une
 * seconde requête peut insérer la même valeur. On tente, et on traduit la P2002.
 */
export async function ajouterLocalite(
  nomPaysFr: string,
  nom: string
): Promise<{ ok: true } | { ok: false; echec: EchecLocalite }> {
  const session = await exigerAdministrateurOuEchouer();

  const libelle = normaliserNomLocalite(nom);
  if (!libelle) return { ok: false, echec: { genre: "nomVide" } };
  if (libelle.length > NOM_LOCALITE_MAX) {
    return { ok: false, echec: { genre: "nomTropLong" } };
  }

  try {
    const pays = await prisma.pays.findFirst({
      where: { nomFr: nomPaysFr.trim() },
      select: { codeIso: true },
    });
    if (!pays) return { ok: false, echec: { genre: "paysInconnu" } };

    await prisma.localite.create({
      data: {
        codePays: pays.codeIso,
        nom: libelle,
        creePar: BigInt(session.idUtilisateur),
      },
      select: { id: true },
    });

    return { ok: true };
  } catch (erreur) {
    if (estViolationUnicite(erreur)) return { ok: false, echec: { genre: "dejaPresente" } };
    if (estPanneBase(erreur)) return { ok: false, echec: { genre: "baseIndisponible" } };
    throw erreur;
  }
}

/**
 * Retire une localité des suggestions.
 *
 * ── Désactivation, jamais suppression ────────────────────────────────────────
 *
 * `actif = false` avec `retire_le` et `retire_par`. Une ligne effacée emporterait
 * avec elle qui l'avait ajoutée et quand — or c'est exactement ce qu'on veut
 * pouvoir consulter quand une localité douteuse apparaît dans les suggestions.
 *
 * L'index unique étant PARTIEL (`WHERE actif`), la même localité peut être
 * réintroduite ensuite : le retrait n'est pas un cul-de-sac.
 *
 * ⚠️ Aucun ordre de mission n'est touché. `ville_destination` est un texte libre :
 * les OM qui citent cette localité continuent de l'afficher et de l'imprimer.
 * C'est voulu — un document signé ne se réécrit pas parce qu'une liste a changé.
 */
export async function retirerLocalite(
  id: string
): Promise<{ ok: true } | { ok: false; echec: EchecLocalite }> {
  const session = await exigerAdministrateurOuEchouer();

  let identifiant: bigint;
  try {
    identifiant = BigInt(id);
  } catch {
    // Un identifiant non numérique vient d'un champ manipulé : ce n'est pas une
    // panne de la base, c'est une ligne qui n'existe pas.
    return { ok: false, echec: { genre: "introuvable" } };
  }

  try {
    // `updateMany` et non `update` : `update` lève P2025 quand la ligne manque,
    // alors qu'ici « déjà retirée » n'est pas une erreur à faire remonter. Le
    // filtre `actif: true` rend l'opération idempotente — deux clics sur le même
    // bouton ne réécrivent pas `retire_le`, donc ne falsifient pas la date.
    const { count } = await prisma.localite.updateMany({
      where: { id: identifiant, actif: true },
      data: { actif: false, retireLe: new Date(), retirePar: BigInt(session.idUtilisateur) },
    });

    if (count === 0) return { ok: false, echec: { genre: "introuvable" } };
    return { ok: true };
  } catch (erreur) {
    if (estPanneBase(erreur)) return { ok: false, echec: { genre: "baseIndisponible" } };
    throw erreur;
  }
}
