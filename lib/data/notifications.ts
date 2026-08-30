import "server-only";

import { cache } from "react";
import type { Prisma, TypeNotification } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/data/client";
import { exigerSession } from "@/lib/auth/garde";

/**
 * Notifications en base (`notification`).
 *
 * ── Une TABLE, pas un état d'interface ───────────────────────────────────────
 *
 * MODELE-DONNEES.md §12 le pose comme un point structurant, et la raison est
 * concrète : un état d'interface disparaît au rechargement de la page. Or la
 * notification la plus importante du modèle — `OM_EN_CONFLIT` — doit atteindre
 * son destinataire **avant qu'il porte le document à la signature du DG** (§10).
 * Une information qu'un F5 efface ne peut pas porter cette responsabilité.
 *
 * ── Aucune garde d'autorisation sur les écritures, volontairement ────────────
 *
 * Même choix que `lib/data/mails.ts`, et pour la même raison. Ces fonctions sont
 * appelées depuis deux sortes de contextes :
 *
 *   • une Server Action qui a déjà exigé l'administrateur ;
 *   • le balayage de péremption, qui n'a **aucun utilisateur** — il tourne dans
 *     un `after()` déclenché par une connexion, et notifie des gens qui ne sont
 *     pas là.
 *
 * Un `exigerSession()` dans `notifier()` interdirait le second cas. En
 * contrepartie, la règle est stricte : **ne jamais exposer ces fonctions
 * d'écriture directement à une route**. Les lectures, elles, portent leur garde —
 * ce sont elles qui renvoient des données à un navigateur.
 *
 * ── Pourquoi les écritures exigent un `tx` ───────────────────────────────────
 *
 * Le paramètre `tx: Prisma.TransactionClient` n'est pas une commodité, c'est la
 * correction d'un défaut : une notification écrite hors de la transaction métier
 * **survivrait à son annulation**. On annoncerait « votre OM est confirmé » pour
 * un OM que la base a refusé. Le type impose donc l'appel depuis l'intérieur
 * d'un `$transaction`.
 */

// ---------------------------------------------------------------------------
// Écritures — toujours dans la transaction de l'action métier
// ---------------------------------------------------------------------------

/** Une notification à écrire. Le lien est la route interne ouverte au clic. */
export interface Avis {
  type: TypeNotification;
  message: string;
  /** Route interne, ex. `/om/12?participant=99T001`. Nul si rien à ouvrir. */
  lien: string | null;
}

/**
 * Écrit une notification pour un destinataire.
 *
 * Silencieuse si `idDestinataire` est nul : le cas se produit pour de bon — un
 * OM peut être créé pour un employé qui n'a pas de compte (« admin, simple user
 * **ou aucun** », `ref.txt`). Lever ici ferait échouer la confirmation d'un OM
 * parfaitement valide parce que son bénéficiaire n'a pas d'accès applicatif.
 */
export async function notifier(
  tx: Prisma.TransactionClient,
  idDestinataire: bigint | null,
  avis: Avis
): Promise<void> {
  if (idDestinataire === null) return;

  await tx.notification.create({
    data: {
      idDestinataire,
      type: avis.type,
      message: avis.message,
      lien: avis.lien,
    },
  });
}

/**
 * Notifie tous les administrateurs actifs.
 *
 * `createMany` et non une boucle : un seul aller-retour, et surtout une seule
 * instruction — donc pas de moitié écrite si la transaction tombe entre deux
 * destinataires.
 *
 * Les comptes désactivés sont exclus : leur pastille ne sera jamais lue, et une
 * file de notifications pour un compte fermé grossit sans jamais se vider.
 */
export async function notifierAdministrateurs(
  tx: Prisma.TransactionClient,
  avis: Avis,
  options: { saufIdUtilisateur?: bigint } = {}
): Promise<number> {
  const administrateurs = await tx.utilisateur.findMany({
    where: {
      role: "ADMINISTRATEUR",
      actif: true,
      ...(options.saufIdUtilisateur === undefined
        ? {}
        : { id: { not: options.saufIdUtilisateur } }),
    },
    select: { id: true },
  });

  if (administrateurs.length === 0) return 0;

  await tx.notification.createMany({
    data: administrateurs.map((a) => ({
      idDestinataire: a.id,
      type: avis.type,
      message: avis.message,
      lien: avis.lien,
    })),
  });

  return administrateurs.length;
}

/**
 * Écrit une notification **une seule fois** pour un couple (type, lien,
 * destinataire) non encore lu.
 *
 * ── Pourquoi cette variante existe ───────────────────────────────────────────
 *
 * Le balayage de péremption tourne **à chaque connexion**. Sans garde, un OM
 * dans sa fenêtre de grâce produirait un « cet OM va se périmer » par connexion,
 * pendant quinze jours. Trente notifications identiques ne sont pas trente
 * fois plus utiles : elles noient les autres, et l'utilisateur cesse de regarder
 * la pastille — ce qui coûterait précisément l'alerte de conflit, celle qui
 * compte.
 *
 * La condition porte sur `luLe: null` et non sur l'existence tout court : si le
 * destinataire a lu l'avis puis que la situation persiste, un nouveau rappel est
 * légitime. Ce qu'on empêche, c'est le doublon **non lu**.
 *
 * ⚠️ Ce n'est pas une contrainte d'unicité, donc deux balayages simultanés
 * pourraient tous deux passer. Le verrou par processus de `perimerParticipations
 * Echues` couvre le cas courant, et le pire reste un doublon d'affichage — sans
 * conséquence métier. Une contrainte partielle en base serait disproportionnée.
 */
export async function notifierSansDoublon(
  tx: Prisma.TransactionClient,
  idDestinataire: bigint | null,
  avis: Avis
): Promise<boolean> {
  if (idDestinataire === null) return false;

  const dejaVue = await tx.notification.findFirst({
    where: {
      idDestinataire,
      type: avis.type,
      lien: avis.lien,
      luLe: null,
    },
    select: { id: true },
  });
  if (dejaVue) return false;

  await notifier(tx, idDestinataire, avis);
  return true;
}

// ---------------------------------------------------------------------------
// Lectures — gardées, elles renvoient des données à un navigateur
// ---------------------------------------------------------------------------

/** Une notification telle que l'écran l'affiche. */
export interface NotificationAffichee {
  id: string;
  type: TypeNotification;
  message: string;
  lien: string | null;
  /** Instant ISO. La mise en forme appartient à l'écran. */
  creeLe: string;
  lue: boolean;
}

/**
 * Nombre de notifications non lues de l'utilisateur courant — la pastille.
 *
 * `cache()` : le Header l'appelle sur chaque route, et il ne doit pas compter
 * deux fois pendant un même rendu.
 *
 * L'index partiel `idx_notif_non_lues` (`WHERE lu_le IS NULL`) sert exactement
 * cette requête : il ne porte que sur la fraction non lue, donc il reste petit
 * quand l'historique grossit.
 */
export const compterNonLues = cache(async (): Promise<number> => {
  const session = await exigerSession();
  return prisma.notification.count({
    where: { idDestinataire: BigInt(session.idUtilisateur), luLe: null },
  });
});

/**
 * Les notifications de l'utilisateur courant, les plus récentes d'abord.
 *
 * Le destinataire vient de la SESSION et jamais d'un paramètre : sans ça, passer
 * un autre identifiant suffirait à lire les notifications d'un collègue — le
 * défaut d'autorisation que la doc appelle à traiter dans la couche de données.
 */
export async function listerNotifications(
  limite = 30
): Promise<NotificationAffichee[]> {
  const session = await exigerSession();

  const lignes = await prisma.notification.findMany({
    where: { idDestinataire: BigInt(session.idUtilisateur) },
    orderBy: { creeLe: "desc" },
    take: limite,
    select: { id: true, type: true, message: true, lien: true, creeLe: true, luLe: true },
  });

  return lignes.map((n) => ({
    // Un BigInt ne traverse pas la frontière serveur/client : il n'est pas
    // sérialisable en RSC.
    id: String(n.id),
    type: n.type,
    message: n.message,
    lien: n.lien,
    creeLe: n.creeLe.toISOString(),
    lue: n.luLe !== null,
  }));
}

/**
 * Marque une notification comme lue.
 *
 * `updateMany` avec le destinataire dans le `WHERE`, et non `update` par
 * identifiant : c'est ce qui rend impossible de marquer lue la notification d'un
 * autre. Une ligne qui n'appartient pas à l'appelant ne correspond simplement à
 * rien, et l'appel ne fait rien — sans révéler si l'identifiant existait.
 */
export async function marquerLue(id: string): Promise<void> {
  const session = await exigerSession();

  let identifiant: bigint;
  try {
    identifiant = BigInt(id);
  } catch {
    return; // identifiant qui n'est pas un nombre : rien à marquer
  }

  await prisma.notification.updateMany({
    where: {
      id: identifiant,
      idDestinataire: BigInt(session.idUtilisateur),
      luLe: null,
    },
    data: { luLe: new Date() },
  });
}

/** Marque toutes les notifications de l'appelant comme lues. */
export async function marquerToutesLues(): Promise<number> {
  const session = await exigerSession();

  const { count } = await prisma.notification.updateMany({
    where: { idDestinataire: BigInt(session.idUtilisateur), luLe: null },
    data: { luLe: new Date() },
  });

  return count;
}
