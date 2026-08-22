"use server";

import { refresh } from "next/cache";
import {
  creerAdministrateur,
  retrograderAdministrateur,
  type EchecAdministrateur,
} from "@/lib/data/administrateurs";
import { normaliserMatricule } from "@/lib/data/employes.validation";
import { VALIDITE_JETON_HEURES } from "@/lib/data/utilisateurs";
import { envoyerCourrielMaintenant } from "@/lib/data/mails";
import { courrielInvitation } from "@/lib/mail/modeles";

/**
 * Server Actions de gestion des administrateurs.
 *
 * ── Ce fichier est un point d'entrée HTTP ────────────────────────────────────
 *
 * La doc est explicite : « Server Functions are reachable via direct POST
 * requests, not just through your application's UI. » Cacher l'écran aux
 * non-fondateurs ne protège donc rien — c'est `exigerFondateurOuEchouer()`, dans
 * le DAL, qui protège. Ces actions le rappellent en attrapant l'erreur pour
 * l'afficher plutôt que de laisser remonter une frontière d'erreur.
 */

export interface EtatAdministrateur {
  erreur?: string;
  succes?: string;
  /** Lien d'invitation, affiché seulement si le courriel n'a pas pu partir. */
  lienInvitation?: string;
}

function message(echec: EchecAdministrateur): string {
  switch (echec.genre) {
    case "emailPris":
      return "Cette adresse — ou ce matricule — est déjà rattachée à un compte.";
    case "introuvable":
      return "Ce compte n'existe plus.";
    case "pasAdministrateur":
      return "Ce compte n'est pas administrateur.";
    case "estFondateur":
      return "Le compte fondateur ne peut pas être rétrogradé : plus personne ne pourrait alors créer d'administrateur.";
    case "estMoi":
      return "Vous ne pouvez pas retirer vos propres droits : vous ne pourriez plus les rétablir sans un accès au serveur.";
    case "employeInconnu":
      return "Aucun employé ne porte ce matricule. Créez sa fiche d'abord.";
    case "employeInactif":
      return "Cet employé est désactivé. Réactivez sa fiche avant de lui donner des droits.";
    case "baseIndisponible":
      return "La base de données ne répond pas. Réessayez dans quelques instants — rien n'a été enregistré.";
  }
}

export async function actionCreerAdministrateur(
  _precedent: EtatAdministrateur | undefined,
  formData: FormData
): Promise<EtatAdministrateur> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  // Le matricule est facultatif : un administrateur n'est pas forcément un
  // employé de l'EDC (prestataire, compte de service).
  const matriculeBrut = String(formData.get("matricule") ?? "").trim();
  const matricule = matriculeBrut === "" ? null : normaliserMatricule(matriculeBrut);

  if (!email) return { erreur: "Adresse de courriel requise." };
  if (!email.includes("@") || email.length < 5) {
    return { erreur: "Adresse de courriel invalide." };
  }

  let resultat: Awaited<ReturnType<typeof creerAdministrateur>>;
  try {
    resultat = await creerAdministrateur(email, matricule);
  } catch (erreur) {
    // La garde du DAL lève avec un message destiné à l'utilisateur : on le
    // reprend tel quel plutôt que d'en inventer un moins précis.
    return { erreur: erreur instanceof Error ? erreur.message : "Action refusée." };
  }

  if (!resultat.ok) return { erreur: message(resultat.echec) };

  const base = process.env.APP_URL ?? "http://localhost:3000";
  const lien = `${base}/mot-de-passe/${encodeURIComponent(resultat.jeton)}`;

  const envoi = await envoyerCourrielMaintenant(
    email,
    courrielInvitation({
      lien,
      validiteHeures: VALIDITE_JETON_HEURES,
      reinitialisation: false,
    })
  );

  refresh();

  if (envoi.genre === "envoye") {
    return {
      succes: `Administrateur créé. Le lien de mot de passe a été envoyé à ${email}.`,
    };
  }

  const cause =
    envoi.genre === "differe"
      ? "Aucun serveur d'envoi n'est configuré."
      : envoi.genre === "mauvaiseConfiguration"
        ? "Le serveur d'envoi refuse notre configuration ; l'adresse n'est pas en cause."
        : envoi.genre === "abandonne"
          ? "L'envoi a définitivement échoué : l'adresse est peut-être inexacte."
          : "L'envoi a échoué ; une nouvelle tentative aura lieu.";

  return {
    succes: `Administrateur créé pour ${email}. ${cause}`,
    lienInvitation: lien,
  };
}

export async function actionRetrograderAdministrateur(
  _precedent: EtatAdministrateur | undefined,
  formData: FormData
): Promise<EtatAdministrateur> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { erreur: "Compte non identifié." };

  let resultat: Awaited<ReturnType<typeof retrograderAdministrateur>>;
  try {
    resultat = await retrograderAdministrateur(id);
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : "Action refusée." };
  }

  if (!resultat.ok) return { erreur: message(resultat.echec) };

  refresh();
  return {
    succes:
      "Droits d'administration retirés. Le compte reste actif comme utilisateur, et ses " +
      "sessions en cours ont été révoquées.",
  };
}
