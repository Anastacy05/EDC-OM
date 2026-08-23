import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
// COMMENTÉ (23/08/2026) — `prisma` n'est plus importé ici, et c'est structurel :
// toutes les fonctions de ce module reçoivent un `tx` en paramètre. La réservation
// et la consommation d'une plage DOIVENT vivre dans la transaction qui crée l'OM —
// un curseur avancé sans OM créerait un trou que rien n'expliquerait. Garder le
// client global sous la main serait une invitation à l'oubli.
// import { prisma } from "@/lib/data/client";
import { getConfiguration } from "@/lib/data/configuration";
import { composerNumero, LIMITE_COMPTEUR } from "@/lib/numeroOM";

/**
 * Plages de numéros d'OM : réservation et consommation.
 *
 * ── Pourquoi des plages, et pas un compteur ──────────────────────────────────
 *
 * Un OM porte un numéro **définitif dès sa création**, parce qu'il est imprimé et
 * signé à la main par le Directeur général immédiatement. Renuméroter ensuite
 * dissocierait la pièce signée de son enregistrement (MODELE-DONNEES.md §7).
 *
 * Or la création doit pouvoir se faire **hors ligne** (étape 11) : le poste ne
 * peut alors demander le numéro suivant à personne. D'où la réservation : le
 * poste prend un lot quand il est connecté, puis y puise sans réseau.
 *
 * ⚠️ **À l'étape 8, tout est en ligne** — c'est donc le serveur qui réserve et
 * consomme. Le mécanisme est le même, seul le lieu de consommation changera à
 * l'étape 11. C'est précisément pour ça qu'on l'écrit maintenant plutôt qu'un
 * `MAX(numero) + 1` : il n'y aura pas de second mécanisme à réconcilier.
 *
 * ── Ce que la base garantit, et que ce module ne pourrait pas ────────────────
 *
 *   • `plage_numero_sans_recouvrement` — `EXCLUDE USING gist (annee WITH =,
 *     int4range(borne_min, borne_max + 1) WITH &&)` : deux plages de la même
 *     année ne peuvent pas se recouvrir, **quel que soit le poste**. C'est la
 *     garantie centrale, et elle est structurelle : PostgreSQL refuse
 *     l'insertion, il n'y a pas de fenêtre de concurrence à couvrir en code.
 *   • `plage_curseur_dans_bornes` — `prochain_numero BETWEEN borne_min AND
 *     borne_max + 1`. La valeur `borne_max + 1` **est** le marqueur d'épuisement.
 *   • `plage_bornes_ordonnees` — `borne_max >= borne_min`.
 *   • `participation.numero_om` `UNIQUE` — le filet final sur la chaîne composée.
 *
 * Ces contraintes ne remontent PAS en `P2002` : l'exclusion est un `23P01`, les
 * CHECK des `23514`. D'où les détecteurs ci-dessous.
 */

/** Motifs d'échec propres à la numérotation. */
export type EchecPlage =
  /** L'année est pleine : 9999 numéros déjà réservés. */
  | { genre: "anneePleine"; annee: number }
  /** Concurrence persistante sur la réservation, après réessai. */
  | { genre: "reservationImpossible" }
  | { genre: "baseIndisponible" };

/** Erreur portant un `EchecPlage`, pour traverser une transaction. */
export class ErreurPlage extends Error {
  constructor(readonly echec: EchecPlage) {
    super(`Numérotation impossible : ${echec.genre}`);
    this.name = "ErreurPlage";
  }
}

/** Code SQLSTATE d'une violation de contrainte d'exclusion. */
const EXCLUSION_VIOLATION = "23P01";

/**
 * Vrai si l'erreur est une violation de la contrainte d'exclusion des plages.
 *
 * Prisma remonte les erreurs SQL brutes en `P2010` (`$queryRaw`) ou `P2002` selon
 * le chemin ; le SQLSTATE est le seul discriminant fiable. Il vit dans `meta.code`
 * pour une `PrismaClientKnownRequestError`, et parfois seulement dans le message.
 */
function estRecouvrementPlage(erreur: unknown): boolean {
  if (typeof erreur !== "object" || erreur === null) return false;

  const meta = (erreur as { meta?: { code?: unknown; message?: unknown } }).meta;
  if (meta?.code === EXCLUSION_VIOLATION) return true;

  const texte = `${(erreur as { message?: unknown }).message ?? ""}${
    typeof meta?.message === "string" ? meta.message : ""
  }`;
  return (
    texte.includes(EXCLUSION_VIOLATION) ||
    texte.includes("plage_numero_sans_recouvrement")
  );
}

/** Vrai si la base n'a pas répondu. Même liste que `lib/data/employes.ts`. */
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

/** Ce que la consommation renvoie : les numéros composés, dans l'ordre. */
export interface NumerosAttribues {
  /** Numéros prêts pour `participation.numero_om`, ex. `["0042/2026", "0043/2026"]`. */
  numeros: string[];
  /** Identifiant de la plage qui les a émis — trace d'audit. */
  idPlage: bigint;
}

/**
 * Réserve une nouvelle plage pour cet utilisateur et cette année.
 *
 * La plage démarre après la **plus grande `borne_max` de l'année, tous postes
 * confondus** : l'exclusion porte sur `annee` seule, donc deux utilisateurs ne
 * peuvent pas se chevaucher non plus. Prendre le maximum par utilisateur
 * produirait des plages qui se recouvrent, et PostgreSQL les refuserait.
 *
 * `tx` est exigé : la réservation doit vivre dans la même transaction que la
 * création de l'OM. Sinon un échec ultérieur laisserait une plage réservée pour
 * rien — un trou dans la série, et la série est auditée.
 */
async function reserverPlage(
  tx: Prisma.TransactionClient,
  idUtilisateur: bigint,
  annee: number,
  taille: number
): Promise<{ id: bigint; borneMin: number; borneMax: number; prochainNumero: number }> {
  // `MAX(borne_max)` sur l'année, verrou de table implicite par la contrainte
  // d'exclusion : si deux transactions calculent le même départ, la seconde
  // échouera sur `23P01` et sera réessayée par l'appelant.
  const [borne] = await tx.$queryRaw<{ maximum: number | null }[]>`
    SELECT MAX(borne_max) AS maximum FROM plage_numero WHERE annee = ${annee}
  `;

  const debut = (borne?.maximum ?? 0) + 1;
  // Borne haute rabotée à 9999 : le gabarit imprime quatre chiffres, et aucun
  // CHECK ne l'impose en base (cf. LIMITE_COMPTEUR).
  const fin = Math.min(debut + taille - 1, LIMITE_COMPTEUR);

  if (debut > LIMITE_COMPTEUR) {
    throw new ErreurPlage({ genre: "anneePleine", annee });
  }

  const creee = await tx.plageNumero.create({
    data: {
      annee,
      idUtilisateur,
      borneMin: debut,
      borneMax: fin,
      prochainNumero: debut,
    },
    select: { id: true, borneMin: true, borneMax: true, prochainNumero: true },
  });

  return creee;
}

/**
 * Attribue `combien` numéros consécutifs, en consommant (ou créant) une plage.
 *
 * ── Le verrou ────────────────────────────────────────────────────────────────
 *
 * `SELECT … FOR UPDATE` sur la plage retenue : sans lui, deux créations
 * simultanées par le même utilisateur liraient le même `prochain_numero` et
 * émettraient les mêmes numéros. Le `UNIQUE` sur `numero_om` rattraperait la
 * collision, mais en faisant échouer la seconde création — alors que les deux
 * sont légitimes.
 *
 * ── Le choix de la plage ─────────────────────────────────────────────────────
 *
 * La table n'a **pas** d'unicité sur `(annee, id_utilisateur)`, et c'est voulu :
 * un poste recharge sa réserve, donc possède plusieurs plages par an. « La plage
 * courante » n'est donc pas identifiable sans tri explicite — on prend la plus
 * petite `borne_min` encore ouverte, pour épuiser les réserves anciennes d'abord
 * et laisser le moins de trous possible.
 *
 * ── Une plage à cheval ───────────────────────────────────────────────────────
 *
 * Si la plage courante ne peut pas fournir les N numéros, on la consomme jusqu'au
 * bout puis on en réserve une autre. Les numéros d'une même mission peuvent donc
 * ne pas être consécutifs — sans importance : chaque participant reçoit SON
 * document avec SON numéro, la mission n'a pas de numéro propre.
 */
export async function consommerNumeros(
  tx: Prisma.TransactionClient,
  idUtilisateur: bigint,
  annee: number,
  combien: number
): Promise<NumerosAttribues> {
  if (!Number.isInteger(combien) || combien < 1) {
    throw new Error(`Nombre de numéros invalide : ${combien}.`);
  }

  const { taillePlageNumero } = await getConfiguration();
  const numeros: string[] = [];
  let idPlage: bigint | null = null;

  while (numeros.length < combien) {
    // Plage utilisable = curseur encore dans les bornes. `prochain_numero =
    // borne_max + 1` marque l'épuisement (cf. plage_curseur_dans_bornes), d'où
    // le `<=` et non `<`.
    const [ouverte] = await tx.$queryRaw<
      { id: bigint; borne_max: number; prochain_numero: number }[]
    >`
      SELECT id, borne_max, prochain_numero
      FROM plage_numero
      WHERE annee = ${annee}
        AND id_utilisateur = ${idUtilisateur}
        AND prochain_numero <= borne_max
      ORDER BY borne_min ASC
      LIMIT 1
      FOR UPDATE
    `;

    const plage =
      ouverte ??
      (await reserverPlage(tx, idUtilisateur, annee, taillePlageNumero).then((p) => ({
        id: p.id,
        borne_max: p.borneMax,
        prochain_numero: p.prochainNumero,
      })));

    idPlage = plage.id;

    // Ce que cette plage peut encore fournir, borné par ce qu'il reste à servir.
    const disponibles = plage.borne_max - plage.prochain_numero + 1;
    const aPrendre = Math.min(disponibles, combien - numeros.length);

    for (let i = 0; i < aPrendre; i += 1) {
      numeros.push(composerNumero(plage.prochain_numero + i, annee));
    }

    // Le curseur avance dans la MÊME transaction que les participations : un
    // curseur avancé sans OM créerait un trou que rien n'expliquerait.
    await tx.plageNumero.update({
      where: { id: plage.id },
      data: { prochainNumero: plage.prochain_numero + aPrendre },
    });
  }

  // `idPlage` est forcément posé : la boucle tourne au moins une fois puisque
  // `combien >= 1`. L'assertion évite un type nullable qui n'a pas de sens ici.
  return { numeros, idPlage: idPlage! };
}

/**
 * Enveloppe `travail` en réessayant une fois si la réservation a échoué sur un
 * recouvrement de plages.
 *
 * Le cas se produit quand deux transactions calculent le même `MAX(borne_max) + 1`
 * et tentent d'insérer la même plage : l'`EXCLUDE` refuse la seconde. Un réessai
 * suffit — au second tour, la plage de la première est visible, donc le maximum a
 * changé.
 *
 * **Un seul réessai**, pas une boucle : au-delà, c'est une contention qui ne se
 * résoudra pas d'elle-même, et boucler masquerait un défaut de conception au lieu
 * de le signaler.
 */
export async function avecReessaiPlage<T>(travail: () => Promise<T>): Promise<T> {
  try {
    return await travail();
  } catch (erreur) {
    if (!estRecouvrementPlage(erreur)) throw erreur;

    console.warn(
      "[numérotation] recouvrement de plages détecté — un second poste a réservé " +
        "en même temps. Réessai."
    );
    try {
      return await travail();
    } catch (second) {
      if (estRecouvrementPlage(second)) {
        throw new ErreurPlage({ genre: "reservationImpossible" });
      }
      throw second;
    }
  }
}

export { estRecouvrementPlage, estPanneBase };
