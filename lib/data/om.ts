import "server-only";

import { prisma } from "@/lib/data/client";
import {
  exigerAdministrateur,
  exigerSession,
  // COMMENTÉ (24/08/2026) — `peutAccederAuMatricule` n'est plus utilisé ici : la
  // lecture des ordres de mission est ouverte à tout compte authentifié, pour que
  // chacun puisse télécharger le document d'un collègue. La garde reste employée
  // par `lib/data/employes.ts`, où le cloisonnement du dossier personnel garde
  // tout son sens.
  // peutAccederAuMatricule,
  type Session,
} from "@/lib/auth/garde";
import { getConfiguration, type Configuration } from "@/lib/data/configuration";
import { getPaysParNomFr, getMontantFraisFixe } from "@/lib/data/referentiels";
import { localitesParNomPays } from "@/lib/data/localites";
import {
  EMETTEUR,
  MAX_PARTICIPANTS,
  STATUTS_ENGAGEANTS,
  aujourdhuiLocal,
  mentionStatut,
  type OMValide,
} from "@/lib/data/om.validation";
import { analyserDate, anneesRevolues } from "@/lib/data/employes.validation";
import {
  chercherChevauchements,
  chevauchementsBloquants,
  chevauchementsSignales,
  motifBlocage,
  type Chevauchement,
} from "@/lib/data/omConflits";
import { notifier, notifierAdministrateurs, notifierSansDoublon } from "@/lib/data/notifications";
import { avecReessaiPlage, consommerNumeros } from "@/lib/data/plagesNumero";
import { PAR_PAGE_OM } from "@/lib/numeroOM";
import { versChampDate } from "@/lib/dateUtils";

export type GenreEchecOM =
  | "nonAuthentifie"
  | "interdit"
  | "introuvable"
  | "matriculeInconnu"
  | "employeInactif"
  | "retraite"
  | "paysInconnu"
  | "baremeAbsent"
  | "conflitConfirme"
  | "dejaTraite"
  | "motifObligatoire"
  | "baseIndisponible";

export class ErreurOM extends Error {
  /**
   * `detail` nomme le ou les agents concernés, quand le genre seul ne suffit pas.
   *
   * Sur une mission à dix participants, « un des participants est désactivé » ne dit
   * pas lequel : il faudrait les reprendre un par un. Le genre reste le discriminant
   * (l'écran choisit la phrase), `detail` ne fait que la compléter — l'écran ne
   * l'affiche jamais seul, et ne le lit jamais pour décider quoi que ce soit.
   */
  constructor(
    readonly genre: GenreEchecOM,
    message: string,
    readonly detail?: string
  ) {
    super(message);
    this.name = "ErreurOM";
  }
}

export interface AvertissementOM {
  matricule: string;
  nom: string;
  prenoms: string;
  numeroOM: string;
  destination: string;
  dateDepart: string;
  dateRetour: string;
}

export interface ResultatCreationOM {
  id: string;
  ulid: string;
  dejaCree: boolean;
  participations: Array<{ matricule: string; numeroOM: string }>;
  avertissements: AvertissementOM[];
}

export interface OMParticipantDTO {
  matricule: string;
  nom: string;
  prenoms: string;
  grade: string | null;
  fonction: string;
  codeStatut: string;
  departement: string;
  situationFamille: string | null;
  indice: string | null;
  montantFraisFixeJournalier: number | null;
  numeroOM: string;
  statut: string;
  blocageMotif: string | null;
  mentionStatut: string | null;
  dateEmission: string;
  lieuEmission: string;
}

export interface OMDetailDTO {
  id: string;
  ulid: string;
  paysDestination: string;
  codePays: string;
  villeDestination: string;
  viaPassage: string | null;
  motif: string | null;
  financement: string | null;
  moyenTransport: string | null;
  dateDepart: string;
  dateRetour: string;
  creeLe: string;
  participants: OMParticipantDTO[];
}

export interface OMDocumentDTO {
  idOM: string;
  matricule: string;
  numeroOM: string;
  nom: string;
  prenoms: string;
  grade: string | null;
  affectation: string;
  matriculeEmploye: string;
  situationFamille: string | null;
  indice: string | null;
  destination: string;
  viaPassage: string | null;
  motif: string | null;
  financement: string | null;
  moyenTransport: string | null;
  dateDepart: string;
  dateRetour: string;
  nomEmetteur: string;
  gradeEmetteur: string | null;
  fonctionEmetteur: string;
  lieuEmission: string;
  dateEmission: string;
  statut: string;
  mentionStatut: string | null;
  chapitre: string | null;
  article: string | null;
  paragraphe: string | null;
  exercice: string | null;
  exerciceAnnee: string | null;
}

export interface FiltresOM {
  page?: number;
  /** Recherche libre sur le nom, les prénoms, le matricule ou le numéro d'OM. */
  recherche?: string;
  matricule?: string;
  /** Code ISO du pays de destination. */
  pays?: string;
  /** Ville de destination, en « contient ». */
  ville?: string;
  /** Statut de workflow de la participation (`EN_ATTENTE`, `CONFIRME`, …). */
  statut?: string;
  /** Statut HIÉRARCHIQUE figé à l'émission (`code_statut_s`). */
  codeStatut?: string;
  /** Direction figée à l'émission (`code_departement_s`). */
  codeDepartement?: string;
  /** Bornes sur la date de DÉPART. */
  debut?: string;
  fin?: string;
  /** Durée en jours, bornes incluses. */
  dureeMin?: number;
  dureeMax?: number;
  /** Ne garder que les participations bloquées par un conflit. */
  bloquesSeulement?: boolean;
}

export interface LigneOM {
  idOM: string;
  matricule: string;
  nom: string;
  prenoms: string;
  numeroOM: string;
  destination: string;
  dateDepart: string;
  dateRetour: string;
  /** Durée calendaire, bornes incluses — calculée en SQL. */
  dureeJours: number;
  statut: string;
  blocageMotif: string | null;
  /** Fonction figée à l'émission. */
  fonction: string;
  /** Direction figée à l'émission. */
  departement: string;
}

export interface ResultatListeOM {
  lignes: LigneOM[];
  total: number;
  page: number;
  nombrePages: number;
}

function idSession(session: Session): bigint {
  return BigInt(session.idUtilisateur);
}

function maintenant(): Date {
  return new Date();
}

function dateLocaleAujourdHui(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function estBaseIndisponible(erreur: unknown): boolean {
  const code = typeof erreur === "object" && erreur !== null
    ? (erreur as { code?: unknown }).code
    : undefined;
  return code === "P1001" || code === "P1002" || code === "ECONNREFUSED";
}

function estUnique(erreur: unknown): boolean {
  return typeof erreur === "object" && erreur !== null &&
    (erreur as { code?: unknown }).code === "P2002";
}

async function resultatExistant(ulid: string): Promise<ResultatCreationOM | null> {
  const existant = await prisma.ordreMission.findUnique({
    where: { ulid },
    select: {
      id: true,
      ulid: true,
      participations: {
        select: { matricule: true, numeroOM: true },
        orderBy: { matricule: "asc" },
      },
    },
  });
  return existant
    ? {
        id: String(existant.id),
        ulid: existant.ulid,
        dejaCree: true,
        participations: existant.participations,
        avertissements: [],
      }
    : null;
}

function destination(conflit: Chevauchement): AvertissementOM {
  return {
    matricule: conflit.matricule,
    nom: conflit.nom,
    prenoms: conflit.prenoms,
    numeroOM: conflit.numeroOM,
    destination: conflit.destination,
    dateDepart: conflit.dateDepart,
    dateRetour: conflit.dateRetour,
  };
}

/**
 * Lit et contrôle les employés d'une mission, et renvoie de quoi figer l'instantané.
 *
 * ⚠️ La date de DÉPART n'est pas un paramètre : la règle de retraite est appréciée à
 * la date de RETOUR (cf. plus bas). L'ajouter « au cas où » inviterait à s'en servir,
 * et c'est exactement le raccourci qui a produit le défaut d'origine.
 */
async function employesPourOM(matricules: string[], retour: Date, configuration: Configuration) {
  const employes = await prisma.employe.findMany({
    where: { matricule: { in: matricules } },
    select: {
      matricule: true, nom: true, prenoms: true, grade: true, fonction: true,
      codeStatut: true, codeDepartement: true, departementLibre: true, situationFamille: true, indice: true,
      dateNaissance: true, actif: true, desactiveLe: true,
    },
  });
  const parMatricule = new Map(employes.map((e) => [e.matricule, e]));
  for (const matricule of matricules) {
    const employe = parMatricule.get(matricule);
    if (!employe) {
      throw new ErreurOM("matriculeInconnu", `Employé introuvable : ${matricule}.`, matricule);
    }
    if (!employe.actif) {
      throw new ErreurOM(
        "employeInactif",
        `L'employé ${matricule} est désactivé.`,
        `${employe.nom} ${employe.prenoms} (${matricule})`
      );
    }
    // ⚠️ L'âge est apprécié à la date de RETOUR, pas de départ.
    //
    // `verifierRetraite` (lib/businessRules.ts) prenait le départ. Un agent qui
    // atteint l'âge de la retraite pendant la mission passait donc le contrôle et se
    // retrouvait en déplacement pour l'EDC après avoir quitté le service. Le retour
    // est la borne juste : c'est la date jusqu'à laquelle la mission engage.
    const age = anneesRevolues(employe.dateNaissance, retour);
    if (age >= configuration.ageRetraite) {
      throw new ErreurOM(
        "retraite",
        `L'employé ${matricule} atteint l'âge de retraite (${age} ans) avant la fin de la mission.`,
        `${employe.nom} ${employe.prenoms} — ${age} ans au ${versChampDate(retour)}`
      );
    }
  }
  return parMatricule;
}

function dtoParticipant(row: {
  matricule: string; nomS: string; prenomsS: string; gradeS: string | null; fonctionS: string;
  codeStatutS: string; codeDepartementS: string; situationFamilleS: string | null; indiceS: string | null;
  montantFraisFixeJournalier: number | null; numeroOM: string; statut: string;
  blocageMotif: string | null; dateEmission: Date; lieuEmission: string;
}): OMParticipantDTO {
  return {
    matricule: row.matricule, nom: row.nomS, prenoms: row.prenomsS, grade: row.gradeS,
    fonction: row.fonctionS, codeStatut: row.codeStatutS, departement: row.codeDepartementS,
    situationFamille: row.situationFamilleS, indice: row.indiceS,
    montantFraisFixeJournalier: row.montantFraisFixeJournalier,
    numeroOM: row.numeroOM, statut: row.statut, blocageMotif: row.blocageMotif,
    mentionStatut: mentionStatut(row.statut, { bloque: row.blocageMotif !== null }),
    dateEmission: versChampDate(row.dateEmission), lieuEmission: row.lieuEmission,
  };
}

export async function creerOrdreMission(valide: OMValide): Promise<ResultatCreationOM> {
  const session = await exigerSession();
  const dejaCree = await resultatExistant(valide.ulid);
  if (dejaCree) return dejaCree;
  const configuration = await getConfiguration();
  const pays = await getPaysParNomFr(valide.paysDestination);
  if (!pays) throw new ErreurOM("paysInconnu", "Le pays de destination n'existe pas dans le référentiel.");

  const employes = await employesPourOM(
    valide.matricules,
    valide.dateRetour,
    configuration
  );
  const montants = new Map<string, number>();
  for (const matricule of valide.matricules) {
    const employe = employes.get(matricule)!;
    const montant = await getMontantFraisFixe(employe.codeStatut, pays.zone);
    if (montant === undefined) {
      throw new ErreurOM(
        "baremeAbsent",
        `Aucun barème pour le statut de ${matricule} et la zone ${pays.zone}.`,
        `${employe.nom} ${employe.prenoms} — statut ${employe.codeStatut}, zone ${pays.zone}`
      );
    }
    montants.set(matricule, montant);
  }

  const creeLe = new Date();
  // Le compteur appartient à l'année d'ÉMISSION du numéro, donc à la création,
  // pas à la date de départ saisie. Une mission 2027 préparée en décembre 2026
  // consomme un numéro 2026, visible sur le papier produit ce jour-là.
  const annee = creeLe.getFullYear();
  try {
    return await avecReessaiPlage(() => prisma.$transaction(async (tx) => {
    const existant = await tx.ordreMission.findUnique({ where: { ulid: valide.ulid }, select: { id: true, ulid: true } });
    if (existant) {
      const participants = await tx.participation.findMany({
        where: { idOrdreMission: existant.id }, select: { matricule: true, numeroOM: true }, orderBy: { matricule: "asc" },
      });
      return { id: String(existant.id), ulid: existant.ulid, dejaCree: true, participations: participants, avertissements: [] };
    }

    const conflits = await chercherChevauchements(tx, {
      matricules: valide.matricules, depart: valide.dateDepart, retour: valide.dateRetour,
      statuts: STATUTS_ENGAGEANTS,
    });
    const bloquants = chevauchementsBloquants(conflits);
    if (bloquants.length) {
      throw new ErreurOM("conflitConfirme", `Conflit confirmé pour ${bloquants.map((c) => c.matricule).join(", ")}.`);
    }
    const signales = chevauchementsSignales(conflits);
    const numeros = await consommerNumeros(tx, idSession(session), annee, valide.matricules.length);
    const om = await tx.ordreMission.create({
      data: {
        ulid: valide.ulid, codePays: pays.codeIso, villeDestination: valide.villeDestination,
        viaPassage: valide.viaPassage, motif: valide.motif, financement: valide.financement,
        moyenTransport: valide.moyenTransport, dateDepart: valide.dateDepart, dateRetour: valide.dateRetour,
        creePar: idSession(session), creeLe,
      }, select: { id: true, ulid: true },
    });
    await tx.participation.createMany({
      data: valide.matricules.map((matricule, index) => {
        const e = employes.get(matricule)!;
        return {
          idOrdreMission: om.id, matricule, numeroOM: numeros.numeros[index],
          nomS: e.nom, prenomsS: e.prenoms, gradeS: e.grade, fonctionS: e.fonction,
          codeStatutS: e.codeStatut,
          codeDepartementS: e.departementLibre ?? e.codeDepartement ?? "Direction non renseignée",
          situationFamilleS: e.situationFamille, indiceS: e.indice,
          montantFraisFixeJournalier: montants.get(matricule),
          nomEmetteur: EMETTEUR.nom, gradeEmetteur: EMETTEUR.grade,
          fonctionEmetteur: EMETTEUR.fonction, lieuEmission: valide.lieuEmission,
          dateEmission: valide.dateEmission,
        };
      }),
    });
    await notifierAdministrateurs(tx, {
      type: "OM_A_VALIDER", message: `Nouvel ordre de mission à valider (${valide.ulid}).`,
      lien: `/om/${om.id}`,
    }, { saufIdUtilisateur: idSession(session) });
    if (signales.length > 0) {
      const message =
        `Chevauchement à surveiller pour ${[...new Set(signales.map((c) => c.matricule))].join(", ")}. ` +
        "Aucun OM n'est encore confirmé : l'administrateur devra arbitrer.";
      await notifierSansDoublon(tx, idSession(session), {
        type: "OM_EN_CONFLIT",
        message,
        lien: `/om/${om.id}`,
      });
      const auteursConcurrents = await tx.ordreMission.findMany({
        where: { id: { in: [...new Set(signales.map((c) => BigInt(c.idOM)))] } },
        select: { id: true, creePar: true },
      });
      for (const concurrent of auteursConcurrents) {
        await notifierSansDoublon(tx, concurrent.creePar, {
          type: "OM_EN_CONFLIT",
          message,
          lien: `/om/${concurrent.id}`,
        });
      }
    }
    return {
      id: String(om.id), ulid: om.ulid, dejaCree: false,
      participations: numeros.numeros.map((numeroOM, index) => ({ matricule: valide.matricules[index], numeroOM })),
      avertissements: signales.map(destination),
    };
    }));
  } catch (erreur) {
    // Deux renvois du même brouillon peuvent franchir ensemble la première
    // lecture. L'UNIQUE sur ulid arbitre ; le perdant relit le gagnant au lieu
    // d'afficher un faux échec.
    if (estUnique(erreur)) {
      const concurrent = await resultatExistant(valide.ulid);
      if (concurrent) return concurrent;
    }
    if (estBaseIndisponible(erreur)) {
      throw new ErreurOM("baseIndisponible", "La base de données ne répond pas.");
    }
    throw erreur;
  }
}

export async function lireParticipation(idOM: string, matricule: string): Promise<OMDetailDTO | null> {
  // ── Lecture ouverte à tout compte authentifié (décidé le 24/08/2026) ────────
  //
  // COMMENTÉ (24/08/2026) — la garde par matricule. Elle produisait deux des
  // symptômes signalés : la fiche d'un OM créé pour un collègue répondait par la
  // page d'erreur (`interdit`), et sur une mission collective la liste des
  // participants était filtrée au seul demandeur — d'où « je vois 2 OM dans
  // l'aperçu, un seul après enregistrement », alors que les deux participations
  // existaient bien en base.
  //
  // La raison de l'ouverture est le TÉLÉCHARGEMENT : un agent doit pouvoir sortir
  // le document d'un collègue, et une fiche qu'il ne peut pas ouvrir rend le bouton
  // inatteignable. Les transitions restent réservées à l'administrateur, et
  // `BlocActions` n'est rendu que pour lui.
  //
  // if (!peutAccederAuMatricule(session, matricule)) throw new ErreurOM("interdit", "Accès interdit.");
  await exigerSession();
  let id: bigint;
  try { id = BigInt(idOM); } catch { return null; }
  const om = await prisma.ordreMission.findUnique({
    where: { id },
    include: { pays: { select: { nomFr: true } }, participations: true },
  });
  if (!om || om.participations.length === 0) return null;
  // Matricule VIDE = « la mission, par son premier participant ». C'est le cas de la
  // redirection qui suit une création (`/om/<id>?cree=1`, sans participant) et celui
  // d'un compte administrateur, qui n'a pas de matricule. Sans lui, l'écran de
  // confirmation répondait 404 à l'auteur de l'OM — le chemin le plus fréquent de la
  // fonctionnalité. Constaté le 23/08/2026.
  if (matricule !== "" && !om.participations.some((p) => p.matricule === matricule)) return null;
  return {
    id: String(om.id), ulid: om.ulid, paysDestination: om.pays.nomFr.trim(), codePays: om.codePays.trim(),
    villeDestination: om.villeDestination ?? "", viaPassage: om.viaPassage, motif: om.motif,
    financement: om.financement, moyenTransport: om.moyenTransport,
    dateDepart: versChampDate(om.dateDepart), dateRetour: versChampDate(om.dateRetour), creeLe: om.creeLe.toISOString(),
    // TOUS les participants, pour tout le monde : la navigation entre eux est ce qui
    // permet de télécharger chaque document d'une mission collective.
    //
    // COMMENTÉ (24/08/2026) — le filtre qui ne gardait que le demandeur.
    // .filter((p) => session.role === "ADMINISTRATEUR" || p.matricule === matricule)
    participants: om.participations.map(dtoParticipant),
  };
}

export async function lireDocumentOM(idOM: string, matricule: string): Promise<OMDocumentDTO | null> {
  const detail = await lireParticipation(idOM, matricule);
  if (!detail) return null;
  const participant = detail.participants.find((p) => p.matricule === matricule);
  if (!participant) return null;
  const om = await prisma.ordreMission.findUnique({ where: { id: BigInt(idOM) }, select: {
    chapitre: true, article: true, paragraphe: true, exercice: true, exerciceAnnee: true,
  } });
  return {
    idOM: detail.id, matricule, numeroOM: participant.numeroOM, nom: participant.nom, prenoms: participant.prenoms,
    grade: participant.grade, affectation: participant.departement, matriculeEmploye: matricule,
    situationFamille: participant.situationFamille, indice: participant.indice,
    destination: `${detail.paysDestination}, ${detail.villeDestination}`, viaPassage: detail.viaPassage,
    motif: detail.motif, financement: detail.financement, moyenTransport: detail.moyenTransport,
    dateDepart: versChampDate(analyserDate(detail.dateDepart)!), dateRetour: versChampDate(analyserDate(detail.dateRetour)!),
    nomEmetteur: EMETTEUR.nom, gradeEmetteur: EMETTEUR.grade, fonctionEmetteur: EMETTEUR.fonction,
    lieuEmission: participant.lieuEmission, dateEmission: participant.dateEmission, statut: participant.statut,
    mentionStatut: participant.mentionStatut, chapitre: om?.chapitre ?? null, article: om?.article ?? null,
    paragraphe: om?.paragraphe ?? null, exercice: om?.exercice ?? null,
    exerciceAnnee: om?.exerciceAnnee === null || om?.exerciceAnnee === undefined ? null : String(om.exerciceAnnee),
  };
}

export async function confirmerParticipation(
  idOM: string,
  matricule: string,
  regularisationMotif?: string,
  adresseIp?: string | null
): Promise<void> {
  const session = await exigerAdministrateur();
  const id = BigInt(idOM);
  await prisma.$transaction(async (tx) => {
    const p = await tx.participation.findUnique({
      where: { idOrdreMission_matricule: { idOrdreMission: id, matricule } },
      include: { ordreMission: { include: { pays: { select: { nomFr: true } } } } },
    });
    if (!p) throw new ErreurOM("introuvable", "Participation introuvable.");
    if (!["EN_ATTENTE", "EXPIRE"].includes(p.statut)) throw new ErreurOM("dejaTraite", "Cette participation a déjà été traitée.");
    const conflits = await chercherChevauchements(tx, { matricules: [matricule], depart: p.ordreMission.dateDepart, retour: p.ordreMission.dateRetour, idOMExclu: id, statuts: STATUTS_ENGAGEANTS });
    const bloquants = chevauchementsBloquants(conflits);
    if (bloquants.length) throw new ErreurOM("conflitConfirme", "Cette participation entre en conflit avec un OM confirmé.");
    const instant = maintenant();
    const resultat = await tx.participation.updateMany({
      where: { idOrdreMission: id, matricule, statut: { in: ["EN_ATTENTE", "EXPIRE"] }, blocageMotif: null },
      data: {
        statut: "CONFIRME",
        confirmeLe: instant,
        confirmePar: idSession(session),
        confirmeDepuisIp: adresseIp || null,
        regularisationMotif: regularisationMotif?.trim() || null,
      },
    });
    if (resultat.count !== 1) throw new ErreurOM("dejaTraite", "La participation a changé entre-temps.");
    const concurrents = await chercherChevauchements(tx, { matricules: [matricule], depart: p.ordreMission.dateDepart, retour: p.ordreMission.dateRetour, idOMExclu: id, statuts: ["EN_ATTENTE"] });
    const gagnant: Chevauchement = {
      matricule,
      nom: p.nomS,
      prenoms: p.prenomsS,
      numeroOM: p.numeroOM,
      statut: "CONFIRME",
      idOM: String(id),
      destination: `${p.ordreMission.pays.nomFr.trim()}, ${p.ordreMission.villeDestination}`,
      dateDepart: versChampDate(p.ordreMission.dateDepart),
      dateRetour: versChampDate(p.ordreMission.dateRetour),
    };
    for (const conflit of concurrents) {
      await tx.participation.updateMany({
        where: { idOrdreMission: BigInt(conflit.idOM), matricule: conflit.matricule, statut: "EN_ATTENTE" },
        data: { blocageMotif: motifBlocage(gagnant), blocageDetecteLe: instant },
      });
      const auteur = await tx.ordreMission.findUnique({
        where: { id: BigInt(conflit.idOM) },
        select: { creePar: true },
      });
      await notifierSansDoublon(tx, auteur?.creePar ?? null, {
        type: "OM_EN_CONFLIT",
        message: `L'OM ${conflit.numeroOM} est désormais bloqué : l'OM ${p.numeroOM} a été confirmé sur la même période.`,
        lien: `/om/${conflit.idOM}?participant=${encodeURIComponent(matricule)}`,
      });
    }
    await notifierAdministrateurs(tx, { type: "OM_CONFIRME", message: `OM ${p.numeroOM} confirmé.`, lien: `/om/${id}` });
  });
}

export async function annulerParticipation(idOM: string, matricule: string, adresseIp?: string | null): Promise<void> {
  const session = await exigerAdministrateur();
  const id = BigInt(idOM);
  await prisma.$transaction(async (tx) => {
    const p = await tx.participation.findUnique({ where: { idOrdreMission_matricule: { idOrdreMission: id, matricule } }, include: { ordreMission: true } });
    if (!p) throw new ErreurOM("introuvable", "Participation introuvable.");
    if (!["EN_ATTENTE", "CONFIRME", "EXPIRE"].includes(p.statut)) throw new ErreurOM("dejaTraite", "Cette participation ne peut plus être annulée.");
    const maintenant = new Date();
    const resultat = await tx.participation.updateMany({ where: { idOrdreMission: id, matricule, statut: p.statut }, data: { statut: "ANNULE", annuleLe: maintenant, annulePar: idSession(session), annuleDepuisIp: adresseIp || null } });
    if (resultat.count !== 1) throw new ErreurOM("dejaTraite", "La participation a changé entre-temps.");
    const bloquees = await tx.participation.findMany({ where: { matricule, blocageMotif: { not: null }, statut: "EN_ATTENTE" }, select: { idOrdreMission: true } });
    for (const bloquee of bloquees) {
      const cible = await tx.ordreMission.findUnique({ where: { id: bloquee.idOrdreMission }, select: { dateDepart: true, dateRetour: true } });
      if (!cible) continue;
      const restants = await chercherChevauchements(tx, { matricules: [matricule], depart: cible.dateDepart, retour: cible.dateRetour, idOMExclu: bloquee.idOrdreMission, statuts: ["CONFIRME"] });
      if (restants.length === 0) {
        await tx.participation.update({ where: { idOrdreMission_matricule: { idOrdreMission: bloquee.idOrdreMission, matricule } }, data: { blocageMotif: null, blocageDetecteLe: null } });
        const auteur = await tx.ordreMission.findUnique({ where: { id: bloquee.idOrdreMission }, select: { creePar: true } });
        await notifierSansDoublon(tx, auteur?.creePar ?? null, {
          type: "OM_A_VALIDER",
          message: "Un ordre de mission précédemment bloqué redevient confirmable.",
          lien: `/om/${bloquee.idOrdreMission}?participant=${encodeURIComponent(matricule)}`,
        });
      }
    }
    await notifierAdministrateurs(tx, { type: "OM_ANNULE", message: `OM ${p.numeroOM} annulé.`, lien: `/om/${id}` });
  });
}

export async function refuserParticipation(idOM: string, matricule: string, motif: string, adresseIp?: string | null): Promise<void> {
  const session = await exigerAdministrateur();
  const propre = motif.trim();
  if (!propre) throw new ErreurOM("motifObligatoire", "Le motif du refus est obligatoire.");
  const id = BigInt(idOM);
  await prisma.$transaction(async (tx) => {
    const p = await tx.participation.findUnique({ where: { idOrdreMission_matricule: { idOrdreMission: id, matricule } }, include: { ordreMission: { select: { creePar: true } } } });
    if (!p) throw new ErreurOM("introuvable", "Participation introuvable.");
    const resultat = await tx.participation.updateMany({ where: { idOrdreMission: id, matricule, statut: "EN_ATTENTE" }, data: { statut: "REFUSE", refuseLe: new Date(), refusePar: idSession(session), refuseDepuisIp: adresseIp || null, refuseMotif: propre } });
    if (resultat.count !== 1) throw new ErreurOM("dejaTraite", "La participation a déjà été traitée.");
    await notifier(tx, p.ordreMission.creePar, { type: "OM_REFUSE", message: `L'OM ${p.numeroOM} a été refusé : ${propre}`, lien: `/om/${id}?participant=${encodeURIComponent(matricule)}` });
  });
}

export async function regulariserParticipation(idOM: string, matricule: string, motif?: string, adresseIp?: string | null): Promise<void> {
  await confirmerParticipation(idOM, matricule, motif, adresseIp);
}

/**
 * Fait passer à `EXPIRE` les participations jamais confirmées dont le retour est
 * passé depuis plus que le délai de grâce, et alerte celles qui s'en approchent.
 *
 * ── Pourquoi un délai de grâce ──────────────────────────────────────────────
 *
 * §7 veut qu'un OM jamais confirmé dont la date de retour est passée devienne
 * `EXPIRE` automatiquement. Pris au pied de la lettre, ça bascule l'OM dès le
 * lendemain du retour — or le cas le plus fréquent n'est pas l'OM abandonné, c'est
 * **l'OM confirmé sur le papier dont personne n'a cliqué « Confirmer »**. La mission
 * a eu lieu, le DG a signé, et l'application la déclarerait caduque.
 *
 * D'où le délai (`configuration.delai_peremption_jours`, 15 par défaut) pendant
 * lequel on NOTIFIE au lieu de basculer, et la régularisation qui permet de
 * confirmer après coup — `EXPIRE` n'est pas un cul-de-sac.
 *
 * ── Pas de garde, et c'est justifié ─────────────────────────────────────────
 *
 * Seule fonction de ce module sans contrôle d'autorisation. Elle n'agit pour le
 * compte de personne et ne renvoie aucune donnée nominative : c'est un balayage
 * système, appelé depuis `after()` à la connexion (`lib/auth/actions.ts`). Le module
 * étant `server-only` et cette fonction n'étant pas une Server Action, elle n'est
 * joignable par aucune requête HTTP — il n'y a donc pas d'appelant à autoriser.
 *
 * ⚠️ Elle est en revanche appelable par tout code serveur : si elle devait un jour
 * être déclenchée depuis un écran, il faudrait y ajouter `exigerAdministrateur()`.
 */
export async function perimerParticipationsEchues(): Promise<{ expirees: number; bientotExpirees: number }> {
  const configuration = await getConfiguration();
  const aujourdHui = dateLocaleAujourdHui();
  const seuilGrace = new Date(aujourdHui);
  seuilGrace.setUTCDate(seuilGrace.getUTCDate() - configuration.delaiPeremptionJours);
  const seuilAlerte = new Date(aujourdHui);
  seuilAlerte.setUTCDate(seuilAlerte.getUTCDate() - Math.max(1, configuration.delaiPeremptionJours - 3));
  return prisma.$transaction(async (tx) => {
    const aAlerter = await tx.participation.findMany({ where: { statut: "EN_ATTENTE", ordreMission: { dateRetour: { lt: seuilAlerte, gte: seuilGrace } } }, select: { idOrdreMission: true, matricule: true, numeroOM: true, ordreMission: { select: { creePar: true } } } });
    for (const p of aAlerter) await notifierSansDoublon(tx, p.ordreMission.creePar, { type: "OM_BIENTOT_EXPIRE", message: `L'OM ${p.numeroOM} va bientôt expirer.`, lien: `/om/${p.idOrdreMission}?participant=${encodeURIComponent(p.matricule)}` });
    const aExpirer = await tx.participation.findMany({ where: { statut: "EN_ATTENTE", ordreMission: { dateRetour: { lt: seuilGrace } } }, select: { idOrdreMission: true, matricule: true, numeroOM: true, ordreMission: { select: { creePar: true } } } });
    if (aExpirer.length) {
      await tx.participation.updateMany({ where: { statut: "EN_ATTENTE", idOrdreMission: { in: aExpirer.map((p) => p.idOrdreMission) } }, data: { statut: "EXPIRE", expireLe: new Date() } });
      for (const p of aExpirer) await notifier(tx, p.ordreMission.creePar, { type: "OM_EXPIRE", message: `L'OM ${p.numeroOM} est expiré.`, lien: `/om/${p.idOrdreMission}?participant=${encodeURIComponent(p.matricule)}` });
    }
    return { expirees: aExpirer.length, bientotExpirees: aAlerter.length };
  });
}

/**
 * Ligne brute du `$queryRaw`.
 *
 * ⚠️ Les alias sont en minuscules sans accent : PostgreSQL replie les identifiants
 * qui ne sont pas entre guillemets, donc `dureeJours` reviendrait en `dureejours`
 * et la lecture serait `undefined` — sans erreur, juste une colonne vide.
 */
interface LigneBruteOM {
  id_om: bigint;
  matricule: string;
  nom_s: string;
  prenoms_s: string;
  numero_om: string;
  nom_fr: string;
  ville_destination: string;
  date_depart: Date;
  date_retour: Date;
  duree_jours: number;
  statut: string;
  blocage_motif: string | null;
  fonction_s: string;
  code_departement_s: string;
  /** Total sur l'ensemble du filtre, répété sur chaque ligne (fenêtre SQL). */
  total: bigint;
}

/**
 * Liste des participations, filtrée et paginée.
 *
 * ── Une ligne par PARTICIPATION, pas par mission ─────────────────────────────
 *
 * C'est le grain du métier : chaque agent reçoit SON document, avec SON numéro et
 * SON statut. Une mission à trois agents produit donc trois lignes, dont une peut
 * être bloquée pendant que les deux autres sont confirmées.
 *
 * ── Ce que la garde impose, et ce qu'elle n'impose PLUS (24/08/2026) ─────────
 *
 * `exigerSession()` : tout compte authentifié voit **toutes** les participations,
 * et `matricule` n'est qu'un filtre d'affichage. La raison est opérationnelle —
 * un agent doit pouvoir TÉLÉCHARGER l'ordre de mission d'un collègue, parce que
 * c'est souvent lui qui prépare le dossier de la mission.
 *
 * Ce n'est pas un relâchement général : les TRANSITIONS restent réservées à
 * l'administrateur (`exigerAdministrateur` dans chacune), et le dossier personnel
 * reste cloisonné (`lireFicheEmploye`). Ce qui est ouvert, c'est la lecture d'une
 * pièce qui circule de toute façon sur papier une fois signée.
 *
 * ── Pourquoi du SQL brut ─────────────────────────────────────────────────────
 *
 * Deux raisons, les mêmes que pour `listerPersonnel` :
 *
 *   • Prisma n'expose pas `unaccent`, et personne ne tape les accents dans un
 *     champ de recherche — sans lui, « nkolo » ne trouve pas « NKOLÔ » ;
 *   • `COUNT(*) OVER ()` donne le total du filtre dans LA MÊME requête que la
 *     page. Deux requêtes séparées pourraient tomber de part et d'autre d'une
 *     écriture concurrente et afficher « page 3 sur 2 ».
 *
 * La durée est calculée en SQL (`date_retour - date_depart + 1`) : la filtrer en
 * JavaScript obligerait à ramener toutes les lignes pour n'en garder que
 * quelques-unes, ce qui viderait la pagination de son sens.
 *
 * ⚠️ `$queryRaw` avec des marqueurs `${}` produit une requête **préparée** : les
 * valeurs voyagent hors du texte SQL. C'est `$queryRawUnsafe` qui interpole, et on
 * ne l'emploie pas.
 */
/**
 * Tout ce dont le formulaire de création a besoin, en UN appel.
 *
 * ── Pourquoi cette fonction existe ───────────────────────────────────────────
 *
 * Le formulaire est un composant CLIENT — il a besoin d'interactivité (ajout de
 * participants, cascade pays → ville, aperçu). Il ne peut donc appeler ni le DAL ni
 * `getConfiguration()`, qui sont asynchrones et `server-only`. Une enveloppe serveur
 * charge ces données et les lui passe en props.
 *
 * C'est ce qui résout la dépendance inversée relevée dans `lib/data/configuration.ts` :
 * « les pages qui l'utilisent doivent devenir des composants serveur, ou recevoir la
 * valeur en props ». On prend la seconde branche, ce qui évite d'entamer l'étape 9.
 *
 * ── Ce qui est envoyé, et ce qui ne l'est pas ────────────────────────────────
 *
 * ⚠️ **Pas de `dateNaissance`.** Le formulaire ne peut donc pas pré-vérifier la
 * retraite, et c'est un choix : envoyer la date de naissance de tous les employés
 * actifs au navigateur exposerait 400 données personnelles dans le flux RSC pour
 * n'afficher qu'un message. La règle est appliquée par `creerOrdreMission`, qui est
 * de toute façon la seule application qui compte — le refus nomme l'agent concerné.
 *
 * Le barème complet est envoyé (une dizaine de statuts × 4 zones), parce qu'il
 * permet d'afficher le montant indicatif dès que la destination est choisie, sans
 * aller-retour serveur à chaque frappe. Ce ne sont pas des données personnelles :
 * ce sont les montants du code de l'entreprise.
 */
export interface DonneesFormulaireOM {
  employes: Array<{
    matricule: string;
    nom: string;
    prenoms: string;
    grade: string | null;
    fonction: string;
    codeStatut: string;
    /** Libellé du statut hiérarchique, pour l'affichage. */
    libelleStatut: string;
    codeDepartement: string;
    situationFamille: string | null;
  }>;
  /** Nom français → code de zone, pour déduire la zone à la saisie. */
  zoneParPays: Record<string, number>;
  /** Libellés des 4 zones, indexés par code. */
  libellesZones: Record<string, string>;
  /** `codeStatut` → (`zone` → montant journalier). */
  bareme: Record<string, Record<string, number>>;
  /** Lieu d'émission proposé par défaut. */
  ageRetraite: number;
  maxParticipants: number;
  /**
   * Aujourd'hui au format `AAAA-MM-JJ`, pour l'attribut `min` des saisies de date.
   *
   * Calculé par le SERVEUR, avec la fonction même que la validation utilise. Le
   * calculer dans le navigateur donnerait deux définitions d'« aujourd'hui » qui
   * peuvent différer d'un jour, et l'écran proposerait alors une date que le
   * serveur refuse — en plus d'une discordance d'hydratation.
   */
  dateMinimum: string;
  /**
   * Localités ajoutées à la main, indexées par NOM FRANÇAIS de pays.
   *
   * Complètent — sans les remplacer — les ~148 000 villes du paquet
   * `country-state-city` que le formulaire charge côté navigateur. Cette base ne
   * connaît que les agglomérations : les sites de production (Nachtigal, Song
   * Loulou, Memve'ele) n'y figurent pas, et sa liste n'est pas modifiable
   * puisqu'elle vit dans `node_modules`.
   *
   * Indexées par nom français et non par code ISO : c'est sous cette forme que le
   * formulaire connaît le pays choisi, comme `zoneParPays`. Passer des codes ISO
   * obligerait le composant client à porter une correspondance de plus pour
   * aboutir au même endroit.
   */
  villesAjoutees: Record<string, string[]>;
}

export async function lireDonneesFormulaireOM(): Promise<DonneesFormulaireOM> {
  // `exigerSession` et non `exigerAdministrateur` : tout utilisateur authentifié
  // peut créer un OM pour n'importe quel employé actif (décision du 22/08/2026).
  await exigerSession();

  const [employes, pays, zones, bareme, configuration, villesAjoutees] = await Promise.all([
    prisma.employe.findMany({
      where: { actif: true },
      orderBy: [{ nom: "asc" }, { prenoms: "asc" }],
      select: {
        matricule: true,
        nom: true,
        prenoms: true,
        grade: true,
        fonction: true,
        codeDepartement: true,
        departementLibre: true,
        situationFamille: true,
        codeStatut: true,
        statut: { select: { libelle: true } },
      },
    }),
    prisma.pays.findMany({ select: { nomFr: true, codeZone: true } }),
    prisma.zone.findMany({ select: { code: true, libelle: true } }),
    prisma.baremeFraisFixe.findMany({
      select: { codeStatut: true, codeZone: true, montantJournalier: true },
    }),
    getConfiguration(),
    localitesParNomPays(),
  ]);

  const zoneParPays: Record<string, number> = {};
  for (const p of pays) zoneParPays[p.nomFr] = p.codeZone;

  const libellesZones: Record<string, string> = {};
  for (const z of zones) libellesZones[String(z.code)] = z.libelle;

  const grille: Record<string, Record<string, number>> = {};
  for (const b of bareme) {
    grille[b.codeStatut] ??= {};
    grille[b.codeStatut][String(b.codeZone)] = b.montantJournalier;
  }

  return {
    employes: employes.map((e) => ({
      matricule: e.matricule,
      nom: e.nom,
      prenoms: e.prenoms,
      grade: e.grade,
      fonction: e.fonction,
      codeStatut: e.codeStatut,
      libelleStatut: e.statut.libelle,
      codeDepartement: e.departementLibre ?? e.codeDepartement ?? "Direction non renseignée",
      situationFamille: e.situationFamille,
    })),
    zoneParPays,
    libellesZones,
    bareme: grille,
    ageRetraite: configuration.ageRetraite,
    maxParticipants: MAX_PARTICIPANTS,
    dateMinimum: versChampDate(aujourdhuiLocal()),
    villesAjoutees,
  };
}

export async function listerOM(filtres: FiltresOM = {}): Promise<ResultatListeOM> {
  // La session n'est plus LUE, mais elle est toujours EXIGÉE : c'est la garde qui
  // ferme la liste à un appelant non authentifié. La valeur de retour n'est pas
  // conservée depuis le 24/08/2026, la portée ne dépendant plus du rôle.
  await exigerSession();

  // Page assainie : un `?page=0`, `?page=-3` ou `?page=abc` venu de l'URL ne doit
  // pas produire un OFFSET négatif, que PostgreSQL rejetterait.
  const page =
    Number.isFinite(filtres.page) && (filtres.page ?? 0) >= 1 ? Math.floor(filtres.page!) : 1;

  // ── Le matricule est un FILTRE, pas une restriction (décidé le 24/08/2026) ──
  //
  // Tout utilisateur authentifié voit toutes les participations, et peut donc
  // filtrer sur qui il veut. La raison est opérationnelle : un agent doit pouvoir
  // TÉLÉCHARGER l'ordre de mission d'un collègue — c'est souvent lui qui prépare le
  // dossier de la mission, et il ne peut pas imprimer ce qu'il ne voit pas.
  //
  // COMMENTÉ (24/08/2026) — l'écrasement du filtre par le matricule de la session.
  // Il cloisonnait la liste par agent, ce qui produisait trois symptômes signalés :
  // un OM créé pour un collègue n'apparaissait pas dans /om, sa fiche répondait 404,
  // et une mission collective ne montrait qu'un participant. Le cloisonnement reste
  // en place pour le DOSSIER PERSONNEL (`lireFicheEmploye`), qui n'a pas la même
  // finalité : y accéder n'aide personne à faire partir une mission.
  //
  // ⚠️ Les TRANSITIONS restent réservées à l'administrateur — `confirmerParticipation`,
  // `annulerParticipation` et `refuserParticipation` portent chacune
  // `exigerAdministrateur()`. Ouvrir la lecture n'ouvre pas l'écriture.
  //
  // const matricule =
  //   session.role === "ADMINISTRATEUR" ? filtres.matricule?.trim() || null : session.matricule;
  //
  // if (matricule === null && session.role !== "ADMINISTRATEUR") {
  //   return { lignes: [], total: 0, page, nombrePages: 1 };
  // }
  const matricule = filtres.matricule?.trim() || null;

  const recherche = filtres.recherche?.trim() || null;
  // `%` posés ici et non dans le SQL : la valeur reste un paramètre lié, donc les
  // caractères spéciaux du motif LIKE saisis par l'utilisateur restent inertes.
  const motif = recherche === null ? null : `%${recherche}%`;
  const ville = filtres.ville?.trim() ? `%${filtres.ville.trim()}%` : null;
  const pays = filtres.pays?.trim() || null;
  const statut = filtres.statut?.trim() || null;
  const codeStatut = filtres.codeStatut?.trim() || null;
  const codeDepartement = filtres.codeDepartement?.trim() || null;
  const debut = filtres.debut ? analyserDate(filtres.debut) : null;
  const fin = filtres.fin ? analyserDate(filtres.fin) : null;
  const dureeMin = Number.isFinite(filtres.dureeMin) ? filtres.dureeMin! : null;
  const dureeMax = Number.isFinite(filtres.dureeMax) ? filtres.dureeMax! : null;
  const bloques = filtres.bloquesSeulement === true;

  const lignes = await prisma.$queryRaw<LigneBruteOM[]>`
    SELECT
      o.id                                        AS id_om,
      p.matricule,
      p.nom_s,
      p.prenoms_s,
      p.numero_om,
      y.nom_fr,
      o.ville_destination,
      o.date_depart,
      o.date_retour,
      (o.date_retour - o.date_depart + 1)         AS duree_jours,
      p.statut::text                              AS statut,
      p.blocage_motif,
      p.fonction_s,
      p.code_departement_s,
      COUNT(*) OVER ()                            AS total
    FROM participation p
    JOIN ordre_mission o ON o.id = p.id_ordre_mission
    JOIN pays          y ON y.code_iso = o.code_pays
    WHERE
      (${matricule}::text IS NULL OR p.matricule = ${matricule})
      AND (${pays}::text            IS NULL OR o.code_pays          = ${pays})
      AND (${codeStatut}::text      IS NULL OR p.code_statut_s      = ${codeStatut})
      AND (${codeDepartement}::text IS NULL OR p.code_departement_s = ${codeDepartement})
      -- Le cast vers le type énuméré est fait par PostgreSQL sur la comparaison
      -- textuelle : passer le paramètre en ::"StatutParticipation" échouerait sur
      -- une valeur hors énumération au lieu de ne rien renvoyer.
      AND (${statut}::text IS NULL OR p.statut::text = ${statut})
      AND (${ville}::text  IS NULL OR o.ville_destination ILIKE ${ville})
      AND (${debut}::date  IS NULL OR o.date_depart >= ${debut}::date)
      AND (${fin}::date    IS NULL OR o.date_depart <= ${fin}::date)
      AND (${dureeMin}::int IS NULL OR (o.date_retour - o.date_depart + 1) >= ${dureeMin}::int)
      AND (${dureeMax}::int IS NULL OR (o.date_retour - o.date_depart + 1) <= ${dureeMax}::int)
      AND (${bloques} IS FALSE OR p.blocage_motif IS NOT NULL)
      AND (
        ${motif}::text IS NULL
        OR lower(sans_accent(p.nom_s))     LIKE lower(sans_accent(${motif}))
        OR lower(sans_accent(p.prenoms_s)) LIKE lower(sans_accent(${motif}))
        OR lower(sans_accent(p.matricule)) LIKE lower(sans_accent(${motif}))
        OR p.numero_om LIKE ${motif}
      )
    -- ── Ordre de la liste (revu le 24/08/2026) ──────────────────────────────
    --
    -- 1. Les etats MORTS au fond. ANNULE, REFUSE et EXPIRE ne correspondent a
    --    aucune mission qui va avoir lieu : ils n'engagent personne, ne
    --    produisent aucun conflit, et ne demandent plus rien a l'administrateur.
    --    Les intercaler par date les mettait au meme rang qu'une mission a
    --    preparer. L'expression rend 1 pour ces trois statuts et 0 pour les
    --    autres, et le tri croissant place donc les vivants d'abord.
    --
    --    ⚠️ La liste des trois doit rester d'accord avec STATUTS_ENGAGEANTS de
    --    om.validation.ts, qui enumere les deux AUTRES ('EN_ATTENTE', 'CONFIRME').
    --    Les deux ensembles sont complementaires : ajouter un sixieme statut
    --    demande de trancher ici aussi.
    --
    -- 2. Depart decroissant : les missions les plus recentes d'abord, c'est
    --    l'ordre dans lequel on consulte un etat d'OM.
    --
    -- 3. Le numero departage : il est UNIQUE, donc l'ordre est TOTAL. Sans ca,
    --    deux pages peuvent repeter ou omettre une ligne, l'ordre des egalites
    --    n'etant pas garanti d'une requete a l'autre.
    --
    -- (⚠️ AUCUN accent grave dans ces commentaires : ils termineraient le
    -- litteral de gabarit JavaScript.)
    ORDER BY
      (CASE WHEN p.statut IN ('ANNULE', 'REFUSE', 'EXPIRE') THEN 1 ELSE 0 END),
      o.date_depart DESC,
      p.numero_om DESC
    LIMIT ${PAR_PAGE_OM} OFFSET ${(page - 1) * PAR_PAGE_OM}
  `;

  // ⚠️ `COUNT(*) OVER ()` est une fonction de FENÊTRE : elle est calculée sur les
  // lignes RENVOYÉES. Au-delà de la dernière page, la requête n'en renvoie aucune,
  // donc le total serait lu comme 0 et l'écran annoncerait « aucun résultat » alors
  // qu'il faut revenir en arrière. Même défaut que celui trouvé par les tests sur
  // `listerPersonnel` le 22/08/2026 — on recompte, mais seulement dans ce cas.
  let total: number;
  if (lignes.length > 0) {
    total = Number(lignes[0].total);
  } else if (page > 1) {
    total = await compterOM({
      matricule,
      motif,
      ville,
      pays,
      statut,
      codeStatut,
      codeDepartement,
      debut,
      fin,
      dureeMin,
      dureeMax,
      bloques,
    });
  } else {
    total = 0;
  }

  return {
    total,
    page,
    nombrePages: Math.max(1, Math.ceil(total / PAR_PAGE_OM)),
    lignes: lignes.map((l) => ({
      idOM: String(l.id_om),
      matricule: l.matricule,
      nom: l.nom_s,
      prenoms: l.prenoms_s,
      numeroOM: l.numero_om,
      // `nom_fr` est un VARCHAR mais `code_iso` un CHAR(2) : on nettoie par
      // habitude, le coût est nul et l'oubli inverse serait invisible.
      destination: `${l.nom_fr.trim()}, ${l.ville_destination}`,
      dateDepart: versChampDate(l.date_depart),
      dateRetour: versChampDate(l.date_retour),
      dureeJours: Number(l.duree_jours),
      statut: l.statut,
      blocageMotif: l.blocage_motif,
      fonction: l.fonction_s,
      departement: l.code_departement_s,
    })),
  };
}

/**
 * Compte les participations d'un filtre, sans pagination.
 *
 * Appelée uniquement quand une page au-delà de la première revient vide — le seul
 * moment où la fonction de fenêtre ne peut rien dire. Les conditions doivent rester
 * **identiques** à celles de `listerOM`, sinon le total annoncé ne correspondrait
 * pas à la liste.
 */
async function compterOM(f: {
  matricule: string | null;
  motif: string | null;
  ville: string | null;
  pays: string | null;
  statut: string | null;
  codeStatut: string | null;
  codeDepartement: string | null;
  debut: Date | null;
  fin: Date | null;
  dureeMin: number | null;
  dureeMax: number | null;
  bloques: boolean;
}): Promise<number> {
  const [ligne] = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total
    FROM participation p
    JOIN ordre_mission o ON o.id = p.id_ordre_mission
    WHERE
      (${f.matricule}::text IS NULL OR p.matricule = ${f.matricule})
      AND (${f.pays}::text            IS NULL OR o.code_pays          = ${f.pays})
      AND (${f.codeStatut}::text      IS NULL OR p.code_statut_s      = ${f.codeStatut})
      AND (${f.codeDepartement}::text IS NULL OR p.code_departement_s = ${f.codeDepartement})
      AND (${f.statut}::text IS NULL OR p.statut::text = ${f.statut})
      AND (${f.ville}::text  IS NULL OR o.ville_destination ILIKE ${f.ville})
      AND (${f.debut}::date  IS NULL OR o.date_depart >= ${f.debut}::date)
      AND (${f.fin}::date    IS NULL OR o.date_depart <= ${f.fin}::date)
      AND (${f.dureeMin}::int IS NULL OR (o.date_retour - o.date_depart + 1) >= ${f.dureeMin}::int)
      AND (${f.dureeMax}::int IS NULL OR (o.date_retour - o.date_depart + 1) <= ${f.dureeMax}::int)
      AND (${f.bloques} IS FALSE OR p.blocage_motif IS NOT NULL)
      AND (
        ${f.motif}::text IS NULL
        OR lower(sans_accent(p.nom_s))     LIKE lower(sans_accent(${f.motif}))
        OR lower(sans_accent(p.prenoms_s)) LIKE lower(sans_accent(${f.motif}))
        OR lower(sans_accent(p.matricule)) LIKE lower(sans_accent(${f.motif}))
        OR p.numero_om LIKE ${f.motif}
      )
  `;
  return Number(ligne?.total ?? 0);
}
