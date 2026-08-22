import "server-only";

import { prisma } from "@/lib/data/client";
import {
  remettreAuServeur,
  estEchecDefinitif,
  estEchecDeConfiguration,
  envoiConfigure,
} from "@/lib/mail/transport";
import type { Courriel } from "@/lib/mail/modeles";

/**
 * File des courriels sortants (`mail_en_attente`).
 *
 * ── Pourquoi une file, et non un `sendMail` direct ───────────────────────────
 *
 * Le schéma le disait déjà : « Un mail déclenché hors ligne part À LA
 * RECONNEXION, émis par le SERVEUR — jamais par le navigateur. » Trois
 * propriétés en découlent :
 *
 *   • un serveur SMTP indisponible ne fait pas échouer l'action métier : le
 *     message attend en base ;
 *   • un message n'est jamais perdu par un redémarrage — il est écrit avant
 *     toute tentative ;
 *   • on sait ce qui a été envoyé, à qui, et ce qui a échoué avec quelle erreur.
 *
 * ── Aucune autorisation vérifiée ici, volontairement ─────────────────────────
 *
 * Contrairement au reste du DAL, ces fonctions ne portent pas de garde. Elles
 * sont appelées depuis des contextes déjà gardés (une Server Action qui a exigé
 * l'administrateur) ET depuis des contextes sans utilisateur du tout (le
 * balayage de la file). Y mettre `exigerSession()` interdirait le second cas.
 * En contrepartie : **ne jamais exposer ces fonctions directement à une route**.
 */

/**
 * Nombre de tentatives au-delà duquel on renonce.
 *
 * Sert AUSSI de marqueur d'abandon : une ligne à `tentatives >= MAX_TENTATIVES`
 * et `envoyeLe IS NULL` est un échec définitif. C'est un prédicat de requête,
 * pas une colonne de plus — donc aucune migration, et l'information reste
 * lisible (`derniereErreur` dit pourquoi).
 */
const MAX_TENTATIVES = 5;

/** Combien de messages un balayage traite au plus. Borne le temps passé. */
const LOT = 20;

// ---------------------------------------------------------------------------
// Mise en file
// ---------------------------------------------------------------------------

/**
 * Écrit un courriel dans la file et renvoie son identifiant.
 *
 * N'envoie RIEN. C'est ce qui rend l'opération sûre dans une transaction métier :
 * si la transaction est annulée, le message disparaît avec elle. Un `sendMail`
 * direct, lui, serait déjà parti — impossible à annuler.
 */
export async function enfilerCourriel(
  destinataire: string,
  courriel: Courriel
): Promise<bigint> {
  const ligne = await prisma.mailEnAttente.create({
    data: {
      destinataire: destinataire.trim().toLowerCase(),
      sujet: courriel.sujet,
      corps: courriel.corps,
    },
    select: { id: true },
  });
  return ligne.id;
}

// ---------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------

export type ResultatEnvoi =
  | { genre: "envoye" }
  /** Pas de SMTP configuré : le message reste en file, sans tentative comptée. */
  | { genre: "differe" }
  /** Échec temporaire : une nouvelle tentative aura lieu. */
  | { genre: "reporte"; erreur: string }
  /** Échec définitif, ou trop de tentatives : on ne réessaiera plus. */
  | { genre: "abandonne"; erreur: string }
  /**
   * Notre configuration est en cause, pas le destinataire. Le message est laissé
   * **intact** — tentative rendue — et le balayage doit s'arrêter : tous les
   * autres échoueraient de la même façon.
   */
  | { genre: "mauvaiseConfiguration"; erreur: string };

/**
 * Tente d'émettre UN message de la file, identifié par son `id`.
 *
 * ── La tentative est comptée AVANT l'essai ───────────────────────────────────
 *
 * L'incrément de `tentatives` sert de verrou et de garde-fou à la fois :
 *
 *   • **verrou** : la condition `tentatives: <valeur lue>` fait échouer la mise
 *     à jour si un autre processus est passé entre-temps. `count === 0` signifie
 *     « quelqu'un d'autre s'en occupe », et on s'abstient. C'est un verrou
 *     optimiste, préférable ici à un `SELECT … FOR UPDATE` qui garderait une
 *     transaction ouverte pendant tout le dialogue SMTP — plusieurs secondes.
 *
 *   • **garde-fou** : si le processus meurt pendant `remettreAuServeur` (ou si
 *     le serveur accepte le message puis coupe avant de répondre), la tentative
 *     est déjà inscrite. Compter APRÈS l'essai laisserait une ligne
 *     éternellement à zéro tentative, réessayée sans fin — et un message peut
 *     très bien partir plusieurs fois de cette manière.
 *
 * Le prix de ce choix est assumé : un plantage du serveur consomme une tentative
 * pour rien. Sur cinq, c'est acceptable ; l'inverse serait une boucle infinie.
 */
export async function envoyerCourrielEnFile(id: bigint): Promise<ResultatEnvoi> {
  // Sans SMTP, on ne consomme pas de tentative : la file doit pouvoir attendre
  // des semaines que les identifiants arrivent, sans s'auto-épuiser.
  if (!envoiConfigure()) return { genre: "differe" };

  const ligne = await prisma.mailEnAttente.findUnique({
    where: { id },
    select: {
      destinataire: true,
      sujet: true,
      corps: true,
      tentatives: true,
      envoyeLe: true,
    },
  });

  if (!ligne) return { genre: "abandonne", erreur: "Message introuvable." };
  if (ligne.envoyeLe !== null) return { genre: "envoye" }; // déjà parti
  if (ligne.tentatives >= MAX_TENTATIVES) {
    return { genre: "abandonne", erreur: `Abandonné après ${MAX_TENTATIVES} tentatives.` };
  }

  const reserve = await prisma.mailEnAttente.updateMany({
    where: { id, envoyeLe: null, tentatives: ligne.tentatives },
    data: { tentatives: ligne.tentatives + 1 },
  });
  if (reserve.count === 0) {
    // Un autre processus a la main. Ne pas envoyer : ce serait un doublon.
    return { genre: "reporte", erreur: "Message déjà pris en charge ailleurs." };
  }

  try {
    await remettreAuServeur({
      destinataire: ligne.destinataire,
      sujet: ligne.sujet,
      corps: ligne.corps,
    });
  } catch (erreur) {
    const texte = erreur instanceof Error ? erreur.message : String(erreur);

    // ── Notre faute, pas celle du destinataire ────────────────────────────────
    //
    // Identifiants refusés, ou dialogue TLS impossible. Le message n'a rien à se
    // reprocher : on REND la tentative consommée et on ne touche pas à son
    // compteur, pour qu'il reparte tel quel une fois le `.env` corrigé.
    //
    // Sans ce cas, un mot de passe SMTP erroné brûlait la file entière au
    // premier balayage — constaté le 22/08/2026 en éprouvant la couche.
    if (estEchecDeConfiguration(erreur)) {
      await prisma.mailEnAttente.update({
        where: { id },
        data: {
          tentatives: ligne.tentatives, // tentative rendue
          derniereErreur: `Configuration d'envoi en cause : ${texte}`.slice(0, 1000),
        },
      });
      console.error(
        "[mail] CONFIGURATION D'ENVOI EN CAUSE — aucun message ne partira tant que " +
          "ce n'est pas corrigé (npx tsx prisma/verifierMail.ts) :",
        texte
      );
      return { genre: "mauvaiseConfiguration", erreur: texte };
    }

    const definitif = estEchecDefinitif(erreur);

    // `tentatives` est porté à MAX pour un échec définitif : la ligne sort de la
    // file sans qu'on ait besoin d'une colonne « abandonné ». Le message reste
    // en base, avec sa cause — jamais supprimé, conformément à la règle du
    // projet sur la conservation.
    await prisma.mailEnAttente.update({
      where: { id },
      data: {
        derniereErreur: texte.slice(0, 1000),
        ...(definitif ? { tentatives: MAX_TENTATIVES } : {}),
      },
    });

    // ⚠️ On journalise le destinataire et l'erreur, JAMAIS le corps : il
    // contient le lien de définition du mot de passe, qui vaut le mot de passe.
    console.error(
      `[mail] échec ${definitif ? "définitif" : "temporaire"} vers ${ligne.destinataire} :`,
      texte
    );

    const restantes = MAX_TENTATIVES - (ligne.tentatives + 1);
    if (definitif || restantes <= 0) return { genre: "abandonne", erreur: texte };
    return { genre: "reporte", erreur: texte };
  }

  await prisma.mailEnAttente.update({
    where: { id },
    data: { envoyeLe: new Date(), derniereErreur: null },
  });

  return { genre: "envoye" };
}

/**
 * Met un courriel en file puis tente de l'émettre immédiatement.
 *
 * Pour les messages dont l'émetteur attend une réponse honnête à l'écran —
 * typiquement l'invitation : l'administrateur doit savoir s'il peut compter sur
 * le courriel ou s'il doit transmettre le lien lui-même. Un envoi en arrière-plan
 * ne le lui dirait pas.
 */
export async function envoyerCourrielMaintenant(
  destinataire: string,
  courriel: Courriel
): Promise<ResultatEnvoi> {
  const id = await enfilerCourriel(destinataire, courriel);
  return envoyerCourrielEnFile(id);
}

// ---------------------------------------------------------------------------
// Balayage de la file
// ---------------------------------------------------------------------------

/**
 * Empêche deux balayages simultanés dans CE processus.
 *
 * ⚠️ Même limite que le limiteur de connexions (`lib/auth/limitation.ts`) : le
 * drapeau est par processus. Avec plusieurs instances du serveur, deux
 * balayages peuvent se croiser — c'est le verrou optimiste sur `tentatives` qui
 * garantit alors qu'un message ne part pas deux fois. Ce drapeau n'est qu'une
 * économie de connexions SMTP, pas la sûreté.
 */
let balayageEnCours = false;

export interface BilanBalayage {
  envoyes: number;
  reportes: number;
  abandonnes: number;
  /** Vrai si le balayage n'a rien tenté (pas de SMTP, ou déjà en cours). */
  inactif: boolean;
  /**
   * Renseigné si le balayage s'est ARRÊTÉ parce que la configuration d'envoi est
   * en cause. Les messages non traités sont restés intacts.
   */
  configurationEnCause?: string;
}

/**
 * Émet les messages en attente, du plus ancien au plus récent.
 *
 * **Séquentiel, pas en parallèle.** Deux raisons : la documentation de Brevo
 * précise que son relais « does not support batch sending », et un envoi en
 * parallèle ouvrirait autant de connexions simultanées — ce qu'un Zimbra
 * d'entreprise limite en général par IP. La lenteur est ici une fonctionnalité :
 * elle sert de régulation naturelle du débit.
 *
 * À appeler depuis `after()` pour ne pas retarder la réponse, ou depuis une
 * tâche planifiée quand il y en aura une.
 */
export async function balayerFile(): Promise<BilanBalayage> {
  const vide: BilanBalayage = { envoyes: 0, reportes: 0, abandonnes: 0, inactif: true };

  if (!envoiConfigure() || balayageEnCours) return vide;
  balayageEnCours = true;

  try {
    const enAttente = await prisma.mailEnAttente.findMany({
      where: { envoyeLe: null, tentatives: { lt: MAX_TENTATIVES } },
      // Le plus ancien d'abord : un message d'invitation périmé ne sert plus à
      // rien, donc l'ordre d'arrivée est aussi l'ordre d'urgence.
      orderBy: { creeLe: "asc" },
      take: LOT,
      select: { id: true },
    });

    const bilan: BilanBalayage = {
      envoyes: 0,
      reportes: 0,
      abandonnes: 0,
      inactif: enAttente.length === 0,
    };

    for (const { id } of enAttente) {
      const resultat = await envoyerCourrielEnFile(id);

      // Identifiants faux ou TLS impossible : on ARRÊTE. Continuer ferait
      // échouer les dix-neuf autres pour la même raison, en consommant une
      // connexion et une ligne de journal chacun, pour rien.
      if (resultat.genre === "mauvaiseConfiguration") {
        bilan.configurationEnCause = resultat.erreur;
        break;
      }

      if (resultat.genre === "envoye") bilan.envoyes += 1;
      else if (resultat.genre === "abandonne") bilan.abandonnes += 1;
      else if (resultat.genre === "reporte") bilan.reportes += 1;
    }

    if (bilan.configurationEnCause) {
      console.error(
        `[mail] balayage interrompu : ${enAttente.length} message(s) en attente, ` +
          "aucun ne partira tant que la configuration d'envoi n'est pas corrigée."
      );
    } else if (bilan.envoyes || bilan.reportes || bilan.abandonnes) {
      console.info(
        `[mail] balayage : ${bilan.envoyes} envoyé(s), ${bilan.reportes} reporté(s), ` +
          `${bilan.abandonnes} abandonné(s)`
      );
    }

    return bilan;
  } catch (erreur) {
    // Une base injoignable ne doit pas remonter : le balayage est du travail
    // d'arrière-plan, déclenché depuis `after()`. Une exception y serait perdue
    // ou, pire, salirait la réponse déjà envoyée.
    console.error("[mail] balayage interrompu :", erreur);
    return vide;
  } finally {
    balayageEnCours = false;
  }
}

/**
 * Compte ce qui traîne dans la file. Pour un écran de diagnostic.
 *
 * `abandonnes` mérite d'être surveillé : ce sont des messages que personne n'a
 * reçus et que rien ne fera partir.
 */
export async function etatFile(): Promise<{
  enAttente: number;
  abandonnes: number;
  envoyes: number;
}> {
  const [enAttente, abandonnes, envoyes] = await Promise.all([
    prisma.mailEnAttente.count({
      where: { envoyeLe: null, tentatives: { lt: MAX_TENTATIVES } },
    }),
    prisma.mailEnAttente.count({
      where: { envoyeLe: null, tentatives: { gte: MAX_TENTATIVES } },
    }),
    prisma.mailEnAttente.count({ where: { envoyeLe: { not: null } } }),
  ]);
  return { enAttente, abandonnes, envoyes };
}

export { MAX_TENTATIVES };
