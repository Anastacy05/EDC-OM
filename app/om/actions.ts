"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { exigerAdministrateurOuEchouer, lireSession } from "@/lib/auth/garde";
import {
  creerOrdreMission,
  confirmerParticipation,
  annulerParticipation,
  refuserParticipation,
  ErreurOM,
  type AvertissementOM,
  type GenreEchecOM,
} from "@/lib/data/om";
import { getNomsPays } from "@/lib/data/referentiels";
import {
  lireSaisieOM,
  validerOM,
  type ErreursChampsOM,
} from "@/lib/data/om.validation";
import { normaliserMatricule } from "@/lib/data/employes.validation";

/**
 * Server Actions des ordres de mission.
 *
 * ── Ce que ces quatre fonctions remplacent ───────────────────────────────────
 *
 * `addMockOM` écrivait dans `localStorage`, donc dans UN navigateur. La détection
 * de conflit qui l'accompagnait (`verifierConcurrence`) lisait la même source :
 * deux agents sur deux postes pouvaient créer deux OM confirmés sur la même
 * période pour le même employé sans qu'aucun avertissement n'apparaisse. La
 * garantie annoncée par MODELE-DONNEES.md — « la validation voit toujours l'état
 * complet de la base » — était donc l'inverse de ce qui se passait.
 *
 * ── Deux gardes, comme pour le personnel ─────────────────────────────────────
 *
 * Chaque action porte la sienne ET chaque fonction du DAL porte la sienne. Celle
 * du DAL est le filet qu'on ne peut pas contourner (une Server Action est une
 * route HTTP publique) ; celle d'ici sert à renvoyer un MESSAGE au formulaire
 * plutôt qu'une redirection, qui perdrait la saisie en cours.
 *
 * ⚠️ Une exception assumée : `actionCreerOM` n'exige PAS l'administrateur. Décidé
 * le 22/08/2026 — « tout utilisateur/Admin peut créer des OMs pour n'importe quels
 * employés ». Ce sont les CONFIRMATIONS qui sont réservées à l'administrateur,
 * pas les créations.
 *
 * ── `refresh()` et non `revalidatePath()` ────────────────────────────────────
 *
 * Toutes les routes sont rendues à la demande : il n'y a aucun cache à purger, il
 * faut rafraîchir le routeur client pour que la liste montre la ligne modifiée.
 * `revalidatePath` serait un contresens — il invaliderait un cache inexistant.
 */

export interface EtatFormulaireOM {
  erreur?: string;
  champs?: ErreursChampsOM;
  succes?: string;
  /**
   * Chevauchements avec des OM **en attente**, à afficher après enregistrement.
   *
   * Ce ne sont pas des erreurs : l'OM est créé et imprimable. Aucun des deux n'est
   * encore confirmé, donc rien ne permet de dire lequel a raison — c'est
   * l'administrateur qui arbitrera. Les taire serait pire : le conflit se
   * découvrirait à la confirmation, une fois le papier signé.
   */
  avertissements?: AvertissementOM[];
}

/**
 * Adresse de l'appelant, pour les colonnes `*_depuis_ip`.
 *
 * `x-forwarded-for` peut contenir une liste (chaîne de proxies) : la première
 * valeur est celle du client. ⚠️ Même réserve que dans `lib/auth/actions.ts` :
 * cet en-tête est **falsifiable** si l'application n'est pas derrière un proxy qui
 * le réécrit. C'est donc une trace d'audit indicative, pas une preuve — ce qui
 * suffit à son usage : savoir d'où une confirmation est partie quand on relit
 * l'historique, pas fonder une décision de sécurité dessus.
 */
async function adresseAppelant(): Promise<string | null> {
  try {
    const enTetes = await headers();
    const transmis = enTetes.get("x-forwarded-for");
    return transmis?.split(",")[0]?.trim() || enTetes.get("x-real-ip") || null;
  } catch {
    return null;
  }
}

/**
 * Traduit un échec du DAL en message affichable.
 *
 * Un `switch` exhaustif sur `GenreEchecOM` et non un `catch` qui réutilise
 * `erreur.message` : les messages du DAL nomment des matricules et des contraintes,
 * ce qui est bon pour un journal et mauvais pour un écran. Ici on choisit ce que
 * l'utilisateur lit, et surtout **ce qu'il doit faire ensuite**.
 */
function messageOM(genre: GenreEchecOM): string {
  switch (genre) {
    case "nonAuthentifie":
      return "Votre session a expiré. Reconnectez-vous — la saisie n'a pas été enregistrée.";
    case "interdit":
      return "Vous n'avez pas accès à cet ordre de mission.";
    case "introuvable":
      return "Cet ordre de mission n'existe plus.";
    case "matriculeInconnu":
      return "Un des participants n'existe pas au fichier du personnel. Vérifiez les matricules.";
    case "employeInactif":
      return (
        "Un des participants est désactivé : il a quitté l'EDC ou son dossier est suspendu. " +
        "Retirez-le de la mission, ou réactivez sa fiche depuis l'onglet Personnel."
      );
    case "retraite":
      return (
        // ⚠️ « à la fin de la mission » et non « avant le départ » : le DAL apprécie
        // l'âge à la date de RETOUR (lib/data/om.ts). Annoncer le départ ferait
        // chercher une erreur de saisie là où il n'y en a pas — le cas visé est
        // justement l'agent qui atteint l'âge PENDANT le déplacement.
        "Un des participants atteint l'âge de la retraite avant la fin de la mission. " +
        "La mission ne peut pas lui être confiée."
      );
    case "paysInconnu":
      return (
        "Ce pays n'est pas au référentiel : sa zone est inconnue, donc l'indemnité " +
        "journalière ne peut pas être calculée. Choisissez un pays dans la liste."
      );
    case "baremeAbsent":
      return (
        "Aucun barème n'est défini pour le statut d'un des participants sur cette zone. " +
        "Signalez-le à l'administrateur : l'indemnité serait fausse sur un document signé."
      );
    case "conflitConfirme":
      return (
        "Un participant est déjà engagé sur une mission CONFIRMÉE qui recouvre ces dates. " +
        "Rien n'a été enregistré et aucun numéro n'a été consommé."
      );
    case "dejaTraite":
      return (
        "Cette participation a changé entre-temps — quelqu'un l'a traitée pendant que " +
        "l'écran était ouvert. Rafraîchissez pour voir son état réel."
      );
    case "motifObligatoire":
      return "Le motif du refus est obligatoire : c'est ce qui distingue un refus d'un effacement.";
    case "baseIndisponible":
      return "La base de données ne répond pas. Réessayez dans quelques instants — rien n'a été enregistré.";
  }
}

/** Convertit une exception quelconque en état de formulaire. */
function etatDepuisErreur(erreur: unknown, contexte: string): EtatFormulaireOM {
  if (erreur instanceof ErreurOM) {
    // `detail` nomme l'agent concerné. Sur une mission à dix participants,
    // « un des participants est désactivé » obligerait à les reprendre un par un.
    return {
      erreur: erreur.detail
        ? `${messageOM(erreur.genre)} (${erreur.detail})`
        : messageOM(erreur.genre),
    };
  }
  console.error(`[om] ${contexte} :`, erreur);
  return {
    erreur:
      "Une erreur inattendue s'est produite. Rien n'a été enregistré — " +
      "si cela se reproduit, signalez-le à l'équipe technique.",
  };
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

/**
 * Crée un ordre de mission et ses N participations.
 *
 * ── Pourquoi la validation est rejouée ici ───────────────────────────────────
 *
 * Le formulaire valide déjà côté navigateur (même module, `om.validation.ts`),
 * mais cette action est joignable en POST direct : la validation du navigateur
 * n'est qu'un confort d'affichage. Celle-ci est la seule qui protège les cinq
 * colonnes `NOT NULL` que rien ne contrôlait.
 *
 * ── Redirection APRÈS le try ─────────────────────────────────────────────────
 *
 * `redirect()` lève `NEXT_REDIRECT`. Placée dans le `try`, elle serait avalée par
 * le `catch` et la redirection n'aurait jamais lieu — l'utilisateur resterait sur
 * un formulaire vide en croyant que l'enregistrement a échoué, alors qu'il a
 * réussi. D'où le résultat rangé dans une variable et la redirection en dehors.
 *
 * ── Les avertissements voyagent dans l'URL ───────────────────────────────────
 *
 * Ils ne sont pas persistés (aucune colonne pour ça) et l'action redirige, donc
 * l'état retourné serait perdu. On passe le nombre en paramètre : la fiche
 * recalcule les chevauchements à l'affichage, ce qui garde une seule source de
 * vérité et reste juste même si la situation a changé entre-temps.
 */
export async function actionCreerOM(
  _precedent: EtatFormulaireOM | undefined,
  formData: FormData
): Promise<EtatFormulaireOM> {
  // `lireSession` et non `exigerAdministrateurOuEchouer` : la création est ouverte
  // à tout utilisateur authentifié (décision du 22/08/2026).
  const session = await lireSession();
  if (!session) return { erreur: messageOM("nonAuthentifie") };

  const saisie = lireSaisieOM(formData);

  // Les noms de pays servent à refuser une destination sans zone AVANT d'ouvrir la
  // transaction. Le DAL revérifie (`paysInconnu`) : ici c'est pour rattacher
  // l'erreur au CHAMP, donc pour que l'utilisateur sache où corriger.
  let paysConnus: ReadonlySet<string> | undefined;
  try {
    paysConnus = new Set(await getNomsPays());
  } catch (erreur) {
    console.error("[om] référentiel des pays illisible :", erreur);
    return { erreur: messageOM("baseIndisponible") };
  }

  const { valide, erreurs } = validerOM(saisie, { paysConnus });
  if (!valide) return { champs: erreurs };

  let resultat: Awaited<ReturnType<typeof creerOrdreMission>>;
  try {
    resultat = await creerOrdreMission(valide);
  } catch (erreur) {
    return etatDepuisErreur(erreur, "création");
  }

  // Renvoi du même brouillon (double-clic, reprise après coupure) : l'ULID a
  // arbitré, on emmène l'utilisateur sur l'OM déjà créé au lieu de lui annoncer
  // une erreur. C'est tout l'intérêt de la clé d'idempotence.
  const parametres = new URLSearchParams({ cree: resultat.dejaCree ? "existant" : "1" });
  if (resultat.avertissements.length > 0) {
    parametres.set("conflits", String(resultat.avertissements.length));
  }

  redirect(`/om/${resultat.id}?${parametres.toString()}`);
}

// ---------------------------------------------------------------------------
// Transitions — administrateur uniquement
// ---------------------------------------------------------------------------

/** Matricule d'un champ caché, normalisé comme à la saisie. */
function matriculeDe(formData: FormData): string {
  return normaliserMatricule(String(formData.get("matricule") ?? ""));
}

/**
 * Confirme une participation — « le papier est signé ».
 *
 * ⚠️ La confirmation **re-détecte le conflit**, et c'est le filet qui compte :
 * deux OM en attente peuvent être créés simultanément sans que ni l'un ni l'autre
 * ne voie l'autre (chacun est le premier). C'est à la confirmation que l'arbitrage
 * a lieu, et le DAL bloque alors l'OM concurrent au lieu de le laisser croire
 * qu'il est encore confirmable.
 *
 * `regularisationMotif` sert à confirmer un OM déjà `EXPIRE` : la mission a eu
 * lieu, le DG a signé, personne n'a cliqué. `EXPIRE` n'est donc pas un cul-de-sac
 * (cf. migration `20260823010000`).
 */
export async function actionConfirmerOM(
  _precedent: EtatFormulaireOM | undefined,
  formData: FormData
): Promise<EtatFormulaireOM> {
  try {
    await exigerAdministrateurOuEchouer();
  } catch {
    return { erreur: "Action réservée à l'administrateur." };
  }

  const idOM = String(formData.get("idOM") ?? "").trim();
  const matricule = matriculeDe(formData);
  if (!idOM || !matricule) return { erreur: "Participation non identifiée." };

  const motif = String(formData.get("regularisationMotif") ?? "");

  try {
    await confirmerParticipation(idOM, matricule, motif, await adresseAppelant());
  } catch (erreur) {
    return etatDepuisErreur(erreur, "confirmation");
  }

  refresh();
  return {
    succes: motif.trim()
      ? "Participation régularisée : elle est enregistrée comme confirmée malgré la péremption."
      : "Participation confirmée.",
  };
}

/**
 * Annule une participation.
 *
 * Autorisée depuis `EN_ATTENTE`, `CONFIRME` et `EXPIRE`. Le DAL en profite pour
 * **lever les blocages devenus sans objet** : si cette participation était la
 * seule à bloquer un autre OM, celui-ci redevient confirmable et son auteur en est
 * averti. Sans ça, un OM resterait bloqué par une mission annulée, et personne ne
 * saurait pourquoi.
 */
export async function actionAnnulerOM(
  _precedent: EtatFormulaireOM | undefined,
  formData: FormData
): Promise<EtatFormulaireOM> {
  try {
    await exigerAdministrateurOuEchouer();
  } catch {
    return { erreur: "Action réservée à l'administrateur." };
  }

  const idOM = String(formData.get("idOM") ?? "").trim();
  const matricule = matriculeDe(formData);
  if (!idOM || !matricule) return { erreur: "Participation non identifiée." };

  try {
    await annulerParticipation(idOM, matricule, await adresseAppelant());
  } catch (erreur) {
    return etatDepuisErreur(erreur, "annulation");
  }

  refresh();
  return { succes: "Participation annulée." };
}

/**
 * Refuse une participation **avant** confirmation, avec motif obligatoire.
 *
 * C'est ce qui remplace la suppression : l'OM reste consultable, et quelqu'un
 * répond du refus. La contrainte `part_refuse_motive` l'impose côté base ; le
 * message ici évite que l'utilisateur découvre la règle par une erreur PostgreSQL.
 */
export async function actionRefuserOM(
  _precedent: EtatFormulaireOM | undefined,
  formData: FormData
): Promise<EtatFormulaireOM> {
  try {
    await exigerAdministrateurOuEchouer();
  } catch {
    return { erreur: "Action réservée à l'administrateur." };
  }

  const idOM = String(formData.get("idOM") ?? "").trim();
  const matricule = matriculeDe(formData);
  if (!idOM || !matricule) return { erreur: "Participation non identifiée." };

  const motif = String(formData.get("refuseMotif") ?? "");
  if (!motif.trim()) return { erreur: messageOM("motifObligatoire") };

  try {
    await refuserParticipation(idOM, matricule, motif, await adresseAppelant());
  } catch (erreur) {
    return etatDepuisErreur(erreur, "refus");
  }

  refresh();
  return { succes: "Participation refusée. Son auteur en est averti." };
}
