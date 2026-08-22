"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { exigerAdministrateurOuEchouer } from "@/lib/auth/garde";
import {
  creerEmploye,
  modifierEmploye,
  desactiverEmploye,
  reactiverEmploye,
  lireCodesReferentiels,
  type EchecEcriture,
} from "@/lib/data/employes";
import {
  lireSaisie,
  validerEmploye,
  validerSortie,
  normaliserMatricule,
  type ErreursChamps,
} from "@/lib/data/employes.validation";
import {
  creerCompte,
  creerJetonMotDePasse,
  VALIDITE_JETON_HEURES,
} from "@/lib/data/utilisateurs";
import { prisma } from "@/lib/data/client";
import { envoyerCourrielMaintenant } from "@/lib/data/mails";
import { courrielInvitation } from "@/lib/mail/modeles";

/**
 * Server Actions du personnel.
 *
 * ── Deux gardes, pas une ─────────────────────────────────────────────────────
 *
 * Chaque action appelle `exigerAdministrateurOuEchouer()`, ET chaque fonction du
 * DAL qu'elle utilise porte la sienne. Ce n'est pas redondant par négligence :
 *
 *   • celle du DAL est le filet qu'on ne peut pas contourner ;
 *   • celle d'ici permet de renvoyer un MESSAGE au formulaire plutôt qu'une
 *     redirection, qui perdrait la saisie en cours.
 *
 * ── `refresh()` et non `revalidatePath()` ────────────────────────────────────
 *
 * Toutes les routes de cette application sont rendues à la demande : rien n'est
 * mis en cache, donc il n'y a rien à invalider. Ce qu'il faut, c'est rafraîchir
 * le routeur client pour que la liste affiche la ligne modifiée. C'est
 * exactement ce que la doc décrit :
 *
 *   « This refreshes the client router, ensuring the UI reflects the latest
 *     state. The refresh() function does not revalidate tagged data. »
 *
 * `revalidatePath` serait un contresens ici : il purge un cache inexistant.
 */

export interface EtatFormulaireEmploye {
  erreur?: string;
  champs?: ErreursChamps;
  /** Message de réussite, quand l'action ne redirige pas. */
  succes?: string;
  /**
   * Lien d'invitation à transmettre, affiché une seule fois.
   *
   * ⚠️ Présent UNIQUEMENT si le courriel n'a pas pu partir : c'est le repli, pas
   * le fonctionnement normal. Quand l'envoi réussit, le lien n'est pas renvoyé
   * au navigateur — l'afficher le ferait exister dans un second endroit (page,
   * historique, éventuelle capture d'écran) sans aucun bénéfice.
   */
  lienInvitation?: string;
}

/** Traduit un échec du DAL en message affichable. */
function message(echec: EchecEcriture): string {
  switch (echec.genre) {
    case "matriculeExistant":
      return "Ce matricule est déjà utilisé. Vérifiez s'il ne s'agit pas d'un employé désactivé, auquel cas réactivez sa fiche.";
    case "introuvable":
      return "Cette fiche n'existe plus. Elle a peut-être été supprimée depuis l'ouverture du formulaire.";
    case "aUnCompte":
      return "Un compte existe déjà pour cet employé.";
    case "baseIndisponible":
      return "La base de données ne répond pas. Réessayez dans quelques instants — rien n'a été enregistré.";
  }
}

// ---------------------------------------------------------------------------
// Création et modification
// ---------------------------------------------------------------------------

export async function actionCreerEmploye(
  _precedent: EtatFormulaireEmploye | undefined,
  formData: FormData
): Promise<EtatFormulaireEmploye> {
  try {
    await exigerAdministrateurOuEchouer();
  } catch {
    return { erreur: "Action réservée à l'administrateur." };
  }

  const saisie = lireSaisie(formData);

  let codes: Awaited<ReturnType<typeof lireCodesReferentiels>>;
  try {
    codes = await lireCodesReferentiels();
  } catch (erreur) {
    console.error("[personnel] référentiels illisibles :", erreur);
    return { erreur: message({ genre: "baseIndisponible" }) };
  }

  const { valide, erreurs } = validerEmploye(saisie, {
    codesStatutsValides: codes.statuts,
    codesDepartementsValides: codes.departements,
  });
  if (!valide) return { champs: erreurs };

  const resultat = await creerEmploye(valide);
  if (!resultat.ok) {
    // Le matricule en doublon est rattaché au CHAMP, pas au formulaire : c'est
    // là que l'utilisateur doit corriger.
    if (resultat.echec.genre === "matriculeExistant") {
      return { champs: { matricule: message(resultat.echec) } };
    }
    return { erreur: message(resultat.echec) };
  }

  // `redirect` lève une exception (`NEXT_REDIRECT`) : elle doit être appelée
  // HORS de tout try/catch, sinon le catch l'avale. D'où sa place ici, après
  // que tous les blocs précédents sont refermés.
  redirect(`/personnel/${encodeURIComponent(valide.matricule)}?cree=1`);
}

export async function actionModifierEmploye(
  _precedent: EtatFormulaireEmploye | undefined,
  formData: FormData
): Promise<EtatFormulaireEmploye> {
  try {
    await exigerAdministrateurOuEchouer();
  } catch {
    return { erreur: "Action réservée à l'administrateur." };
  }

  // Le matricule vient d'un champ caché : on le normalise comme à la création,
  // sinon une casse différente désignerait une ligne introuvable.
  const matricule = normaliserMatricule(String(formData.get("matricule") ?? ""));
  if (!matricule) return { erreur: "Matricule manquant." };

  const saisie = lireSaisie(formData);

  let codes: Awaited<ReturnType<typeof lireCodesReferentiels>>;
  try {
    codes = await lireCodesReferentiels();
  } catch (erreur) {
    console.error("[personnel] référentiels illisibles :", erreur);
    return { erreur: message({ genre: "baseIndisponible" }) };
  }

  const { valide, erreurs } = validerEmploye(saisie, {
    codesStatutsValides: codes.statuts,
    codesDepartementsValides: codes.departements,
  });
  if (!valide) return { champs: erreurs };

  const resultat = await modifierEmploye(matricule, valide);
  if (!resultat.ok) return { erreur: message(resultat.echec) };

  refresh();
  return { succes: "Modifications enregistrées." };
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

/**
 * Désactive un employé, avec un motif de sortie FACULTATIF.
 *
 * Signature `(etat, formData)` depuis le 22/08/2026, et non plus `(formData)` : le
 * motif est validé, donc un refus doit pouvoir s'afficher. Avec la signature nue,
 * la seule façon de signaler une erreur était de lever — ce qui déclenche la
 * frontière d'erreur de Next et fait perdre le contexte de la page.
 */
export async function actionDesactiverEmploye(
  _precedent: EtatFormulaireEmploye | undefined,
  formData: FormData
): Promise<EtatFormulaireEmploye> {
  try {
    await exigerAdministrateurOuEchouer();
  } catch {
    return { erreur: "Action réservée à l'administrateur." };
  }

  const matricule = normaliserMatricule(String(formData.get("matricule") ?? ""));
  if (!matricule) return { erreur: "Matricule manquant." };

  const sortie = validerSortie({
    motifSortie: String(formData.get("motifSortie") ?? ""),
    noteSortie: String(formData.get("noteSortie") ?? ""),
  });
  if ("erreur" in sortie) return { erreur: sortie.erreur };

  const resultat = await desactiverEmploye(matricule, sortie.valide);
  if (!resultat.ok) return { erreur: message(resultat.echec) };

  refresh();
  return { succes: "Employé désactivé. Son accès est fermé." };
}

export async function actionReactiverEmploye(
  _precedent: EtatFormulaireEmploye | undefined,
  formData: FormData
): Promise<EtatFormulaireEmploye> {
  try {
    await exigerAdministrateurOuEchouer();
  } catch {
    return { erreur: "Action réservée à l'administrateur." };
  }

  const matricule = normaliserMatricule(String(formData.get("matricule") ?? ""));
  if (!matricule) return { erreur: "Matricule manquant." };

  const resultat = await reactiverEmploye(matricule);
  if (!resultat.ok) return { erreur: message(resultat.echec) };

  refresh();
  return { succes: "Employé réactivé. Son accès est rouvert." };
}

// ---------------------------------------------------------------------------
// Compte et invitation
// ---------------------------------------------------------------------------

/**
 * Crée le compte de l'employé, ou réémet son lien s'il existe déjà.
 *
 * ── Le courriel est envoyé, et attendu ───────────────────────────────────────
 *
 * L'envoi est mis en file puis tenté **immédiatement**, et l'action ATTEND le
 * résultat au lieu de le confier à `after()`. C'est délibéré : l'administrateur
 * doit savoir s'il peut compter sur le courriel ou s'il doit transmettre le lien
 * lui-même. Un envoi en arrière-plan lui afficherait « c'est parti » sans le
 * savoir. Le coût est d'environ une seconde d'attente — le prix d'une réponse
 * vraie.
 *
 * En cas d'échec (ou sans SMTP configuré), le lien est renvoyé à l'écran : le
 * message reste en file et repartira au prochain balayage, mais l'administrateur
 * n'est jamais bloqué.
 *
 * Le rôle est toujours UTILISATEUR : promouvoir quelqu'un administrateur depuis
 * un écran de gestion du personnel serait une élévation de privilège trop facile.
 * Ça reste réservé au script `prisma/creerCompte.ts`, donc à un accès serveur.
 */
export async function actionEmettreInvitation(
  _precedent: EtatFormulaireEmploye | undefined,
  formData: FormData
): Promise<EtatFormulaireEmploye> {
  try {
    await exigerAdministrateurOuEchouer();
  } catch {
    return { erreur: "Action réservée à l'administrateur." };
  }

  const matricule = normaliserMatricule(String(formData.get("matricule") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) return { champs: { matricule: "Adresse de courriel requise." } };
  if (!email.includes("@") || email.length < 5) {
    return { erreur: "Adresse de courriel invalide." };
  }

  try {
    const employe = await prisma.employe.findUnique({
      where: { matricule },
      select: { actif: true, utilisateur: { select: { id: true, email: true } } },
    });

    if (!employe) return { erreur: message({ genre: "introuvable" }) };
    if (!employe.actif) {
      // Sinon on rouvrirait un accès qu'une désactivation vient de fermer.
      return { erreur: "Cet employé est désactivé. Réactivez sa fiche avant de créer son compte." };
    }

    let jeton: string;
    const reinitialisation = employe.utilisateur !== null;
    if (employe.utilisateur) {
      // Compte existant : on réémet, ce qui invalide les liens précédents. C'est
      // le parcours « mot de passe oublié » en attendant un écran dédié.
      jeton = await creerJetonMotDePasse(employe.utilisateur.id);
    } else {
      const cree = await creerCompte(email, "UTILISATEUR", matricule);
      jeton = cree.jeton;
    }

    // `APP_URL` et non l'en-tête `Host` : celui-ci est fourni par le client, donc
    // falsifiable. Un lien construit dessus pourrait pointer ailleurs.
    const base = process.env.APP_URL ?? "http://localhost:3000";
    const lien = `${base}/mot-de-passe/${encodeURIComponent(jeton)}`;

    // L'adresse du compte l'emporte sur celle du formulaire en réémission : le
    // champ est caché, mais s'y fier permettrait de détourner un lien vers une
    // adresse choisie par l'appelant.
    const destinataire = employe.utilisateur?.email ?? email;

    const envoi = await envoyerCourrielMaintenant(
      destinataire,
      courrielInvitation({
        lien,
        validiteHeures: VALIDITE_JETON_HEURES,
        reinitialisation,
      })
    );

    refresh();

    if (envoi.genre === "envoye") {
      return {
        succes: reinitialisation
          ? `Nouveau lien envoyé à ${destinataire}. Les liens précédents ne sont plus valables.`
          : `Compte créé. Le lien de mot de passe a été envoyé à ${destinataire}.`,
      };
    }

    // Repli : le courriel n'est pas parti. Il reste en file et repartira au
    // prochain balayage, mais on donne le lien tout de suite plutôt que de
    // laisser l'employé attendre un message qui viendra peut-être.
    const cause =
      envoi.genre === "differe"
        ? "Aucun serveur d'envoi n'est configuré."
        : envoi.genre === "mauvaiseConfiguration"
          ? // Distinct des autres échecs, et c'est le point : la cause est chez
            // nous, pas chez le destinataire. Sans cette distinction, l'admin
            // vérifierait l'adresse de l'employé au lieu du `.env`.
            "Le serveur d'envoi refuse notre configuration (identifiants ou " +
            "chiffrement). L'adresse de l'employé n'est pas en cause — signalez-le " +
            "à l'administrateur technique."
          : envoi.genre === "abandonne"
            ? "L'envoi du courriel a définitivement échoué : l'adresse est peut-être inexacte."
            : "L'envoi du courriel a échoué ; une nouvelle tentative aura lieu.";

    return {
      succes: `${
        reinitialisation
          ? "Nouveau lien émis. Les liens précédents ne sont plus valables."
          : `Compte créé pour ${destinataire}.`
      } ${cause}`,
      lienInvitation: lien,
    };
  } catch (erreur) {
    // Violation d'unicité sur `email` : l'adresse appartient à un autre compte.
    if (
      typeof erreur === "object" &&
      erreur !== null &&
      "code" in erreur &&
      (erreur as { code: unknown }).code === "P2002"
    ) {
      return { erreur: "Cette adresse de courriel est déjà rattachée à un autre compte." };
    }
    console.error("[personnel] émission d'invitation :", erreur);
    return { erreur: message({ genre: "baseIndisponible" }) };
  }
}

// Pas de réexport de constante ici : dans un fichier `"use server"`, chaque
// export devient un point d'entrée HTTP, et la règle est que tous soient des
// fonctions asynchrones. Turbopack tolère la constante, mais s'appuyer sur une
// tolérance non documentée est fragile — les pages importent
// `VALIDITE_JETON_HEURES` depuis `lib/data/utilisateurs.ts`, qui est leur source.
