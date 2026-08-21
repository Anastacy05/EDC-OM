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
  normaliserMatricule,
  type ErreursChamps,
} from "@/lib/data/employes.validation";
import { creerCompte, creerJetonMotDePasse } from "@/lib/data/utilisateurs";
import { prisma } from "@/lib/data/client";

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
   * ⚠️ Il traverse le réseau vers le navigateur de l'administrateur, ce qui est
   * inévitable puisqu'il doit être copié. C'est aussi ce qui le rend provisoire :
   * l'envoi par courriel supprimera ce passage.
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
 * Désactive un employé.
 *
 * Signature `(formData)` et non `(etat, formData)` : cette action est appelée
 * par un `<form action={…}>` nu, sans `useActionState` — il n'y a rien à
 * afficher en retour, la liste se rafraîchit.
 */
export async function actionDesactiverEmploye(formData: FormData): Promise<void> {
  await exigerAdministrateurOuEchouer();
  const matricule = normaliserMatricule(String(formData.get("matricule") ?? ""));
  if (!matricule) return;

  const resultat = await desactiverEmploye(matricule);
  // On lève plutôt que d'ignorer : sans retour visible, un échec silencieux
  // laisserait l'admin croire que l'employé est désactivé alors qu'il a toujours
  // accès. La frontière d'erreur de Next l'affichera.
  if (!resultat.ok) throw new Error(message(resultat.echec));

  refresh();
}

export async function actionReactiverEmploye(formData: FormData): Promise<void> {
  await exigerAdministrateurOuEchouer();
  const matricule = normaliserMatricule(String(formData.get("matricule") ?? ""));
  if (!matricule) return;

  const resultat = await reactiverEmploye(matricule);
  if (!resultat.ok) throw new Error(message(resultat.echec));

  refresh();
}

// ---------------------------------------------------------------------------
// Compte et invitation
// ---------------------------------------------------------------------------

/**
 * Crée le compte de l'employé, ou réémet son lien s'il existe déjà.
 *
 * ⚠️ ÉTAT PROVISOIRE : le lien est RENVOYÉ À L'ÉCRAN pour que l'administrateur
 * le transmette lui-même. L'envoi automatique par courriel attend le choix du
 * fournisseur (serveur SMTP de l'EDC, Resend ou Brevo — cf. MODELE-DONNEES.md
 * §12). Ce n'est pas moins sûr que le courriel, qui circule aussi en clair, mais
 * ça repose sur la discipline de l'admin, alors que la file `mail_en_attente`
 * l'automatisera.
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

    refresh();
    return {
      succes: employe.utilisateur
        ? `Nouveau lien émis. Les liens précédents ne sont plus valables.`
        : `Compte créé pour ${email}.`,
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
