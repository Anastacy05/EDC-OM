"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  hacherMotDePasse,
  verifierMotDePasse,
  empreinteAReprendre,
} from "@/lib/auth/motDePasse";
import { ouvrirSession, fermerSession } from "@/lib/auth/session";
import type { Session } from "@/lib/auth/jeton";
import {
  trouverCompteParEmail,
  marquerConnexion,
  remplacerEmpreinte,
  verifierJetonMotDePasse,
  definirMotDePasseAvecJeton,
} from "@/lib/data/utilisateurs";
import { attenteRestante, enregistrerEchec, enregistrerSucces } from "@/lib/auth/limitation";
import { cheminDeRetourSur } from "@/lib/auth/redirection";

/**
 * Server Actions d'authentification.
 *
 * Ce sont les SEULS endroits, avec le Route Handler de renouvellement, où une
 * session peut être ouverte ou fermée — parce que ce sont les seuls contextes
 * où Next autorise l'écriture de cookies. Un composant serveur ne peut pas.
 *
 * ⚠️ La doc est explicite sur ce que sont ces fonctions :
 *
 *   « Server Functions are reachable via direct POST requests, not just through
 *     your application's UI. »
 *
 * Autrement dit : des points d'entrée HTTP publics. Tout ce qui suit part de là.
 */

/** Longueur minimale d'un mot de passe. */
const LONGUEUR_MINIMALE = 12;

export interface EtatFormulaire {
  erreur?: string;
  /** Messages rattachés à un champ précis, pour l'afficher sous le champ. */
  champs?: { email?: string; motDePasse?: string; confirmation?: string };
}

/**
 * Empreinte leurre, pour égaliser le temps de réponse.
 *
 * Sans elle, une adresse inconnue répond en ~1 ms (pas de hachage) et une
 * adresse connue en ~130 ms : l'écart est mesurable depuis l'extérieur et
 * révèle qui possède un compte à l'EDC. On vérifie donc le mot de passe saisi
 * contre une empreinte factice même quand le compte n'existe pas.
 *
 * Calculée une fois par processus, à la première tentative — pas au chargement
 * du module, pour ne pas ajouter 130 ms au démarrage de pages qui n'ont rien à
 * voir avec la connexion.
 */
let leurre: Promise<string> | null = null;
function empreinteLeurre(): Promise<string> {
  // Le contenu haché n'a aucune importance : il ne sert qu'à faire travailler
  // Argon2 le même temps. Il n'est comparé à rien de significatif.
  leurre ??= hacherMotDePasse("leurre-sans-signification-" + LONGUEUR_MINIMALE);
  return leurre;
}

/**
 * Adresse et navigateur de l'appelant, pour la trace de session et la
 * limitation de débit.
 *
 * `x-forwarded-for` peut contenir une liste (chaîne de proxies) : la première
 * valeur est celle du client. ⚠️ Cet en-tête est falsifiable si l'application
 * n'est pas derrière un proxy qui le réécrit — ce qui limite la limitation de
 * débit par IP à un ralentisseur, pas à une barrière. Le compteur par compte,
 * lui, reste efficace.
 */
async function contexteRequete(): Promise<{
  adresseIp: string | null;
  agentUtilisateur: string | null;
}> {
  const enTetes = await headers();
  const transmis = enTetes.get("x-forwarded-for");
  const adresseIp = transmis?.split(",")[0]?.trim() || enTetes.get("x-real-ip") || null;
  return { adresseIp, agentUtilisateur: enTetes.get("user-agent") };
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

export async function connecter(
  _etatPrecedent: EtatFormulaire | undefined,
  formData: FormData
): Promise<EtatFormulaire> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const motDePasse = String(formData.get("motDePasse") ?? "");
  const retour = cheminDeRetourSur(String(formData.get("retour") ?? ""));

  // Validation à la main plutôt qu'avec un validateur de schéma : deux champs,
  // dont un qu'on ne contraint pas à la saisie (voir plus bas). Ajouter une
  // dépendance pour ça ne se justifie pas ; elle le deviendra pour les
  // formulaires d'OM, bien plus riches.
  const champs: EtatFormulaire["champs"] = {};
  if (!email) champs.email = "Adresse requise.";
  else if (!email.includes("@")) champs.email = "Adresse invalide.";
  if (!motDePasse) champs.motDePasse = "Mot de passe requis.";
  if (Object.keys(champs).length > 0) return { champs };

  // ⚠️ On ne vérifie PAS la longueur minimale à la connexion, seulement à la
  // définition. Un compte créé avant un durcissement de la règle doit pouvoir
  // se connecter, sinon un changement de politique enfermerait dehors des
  // utilisateurs dont le mot de passe est parfaitement valide.

  const { adresseIp, agentUtilisateur } = await contexteRequete();

  const attente = attenteRestante(email, adresseIp);
  if (attente > 0) {
    return {
      erreur: `Trop de tentatives. Réessayez dans ${Math.ceil(attente / 60)} minute(s).`,
    };
  }

  const compte = await trouverCompteParEmail(email);

  // Un seul message pour tous les échecs — compte inconnu, mot de passe faux,
  // compte désactivé, invitation jamais honorée. Distinguer « ce compte
  // n'existe pas » de « mot de passe incorrect » donnerait à un tiers le moyen
  // d'établir la liste des adresses de l'EDC.
  const ECHEC = "Adresse ou mot de passe incorrect.";

  if (!compte || !compte.actif || !compte.motDePasseHash) {
    await verifierMotDePasse(motDePasse, await empreinteLeurre()); // temps constant
    enregistrerEchec(email, adresseIp);
    return { erreur: ECHEC };
  }

  const valide = await verifierMotDePasse(motDePasse, compte.motDePasseHash);
  if (!valide) {
    enregistrerEchec(email, adresseIp);
    return { erreur: ECHEC };
  }

  enregistrerSucces(email, adresseIp);

  const session: Session = {
    idUtilisateur: compte.id.toString(),
    email: compte.email,
    role: compte.role,
    matricule: compte.matricule,
  };

  await ouvrirSession(session, {
    agentUtilisateur: agentUtilisateur ?? undefined,
    adresseIp: adresseIp ?? undefined,
  });
  await marquerConnexion(compte.id);

  // Réhachage opportuniste : c'est le seul instant où le mot de passe en clair
  // est disponible, donc le seul où l'on peut le reprendre avec des paramètres
  // Argon2 plus durs. Un échec ici ne doit pas faire échouer la connexion —
  // l'utilisateur est authentifié, le reste est de l'entretien.
  if (empreinteAReprendre(compte.motDePasseHash)) {
    try {
      await remplacerEmpreinte(compte.id, await hacherMotDePasse(motDePasse));
    } catch {
      // Silencieux volontairement : l'ancienne empreinte reste valable.
    }
  }

  // `redirect` lève une exception (`NEXT_REDIRECT`) : elle doit être appelée
  // HORS de tout try/catch, sinon le catch l'avale et la redirection n'a pas
  // lieu. C'est pour cette raison que le bloc ci-dessus est refermé avant.
  redirect(retour);
}

// ---------------------------------------------------------------------------
// Déconnexion
// ---------------------------------------------------------------------------

export async function deconnecter(): Promise<void> {
  await fermerSession();
  redirect("/connexion");
}

// ---------------------------------------------------------------------------
// Définition du mot de passe (premier accès et réinitialisation)
// ---------------------------------------------------------------------------

/**
 * Règles de composition.
 *
 * Longueur d'abord : c'est le seul facteur qui augmente vraiment le coût d'une
 * attaque. Les recommandations récentes (NIST SP 800-63B) déconseillent
 * d'imposer des classes de caractères, qui poussent surtout à des
 * substitutions prévisibles (« Motdepasse1! »). On exige donc 12 caractères et
 * on refuse le contenu manifestement dérivé de l'adresse.
 */
function validerMotDePasse(motDePasse: string, email: string): string | null {
  if (motDePasse.length < LONGUEUR_MINIMALE) {
    return `${LONGUEUR_MINIMALE} caractères minimum.`;
  }
  // Limite haute : Argon2 accepte des entrées énormes, mais hacher plusieurs
  // mégaoctets serait un moyen simple d'épuiser le serveur.
  if (motDePasse.length > 200) return "200 caractères maximum.";

  const partieLocale = email.split("@")[0]?.toLowerCase() ?? "";
  if (partieLocale.length >= 4 && motDePasse.toLowerCase().includes(partieLocale)) {
    return "Le mot de passe ne doit pas contenir votre adresse.";
  }
  return null;
}

export async function definirMotDePasse(
  _etatPrecedent: EtatFormulaire | undefined,
  formData: FormData
): Promise<EtatFormulaire> {
  const jeton = String(formData.get("jeton") ?? "");
  const motDePasse = String(formData.get("motDePasse") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  // Le jeton est revérifié ICI, pas seulement à l'affichage du formulaire.
  // L'action est un point d'entrée HTTP : rien ne garantit qu'elle soit appelée
  // depuis la page qui a validé le jeton.
  const valide = await verifierJetonMotDePasse(jeton);
  if (!valide) {
    return { erreur: "Ce lien n'est plus valable. Demandez-en un nouveau à l'administrateur." };
  }

  const champs: EtatFormulaire["champs"] = {};
  const probleme = validerMotDePasse(motDePasse, valide.email);
  if (probleme) champs.motDePasse = probleme;
  if (motDePasse !== confirmation) champs.confirmation = "Les deux saisies diffèrent.";
  if (Object.keys(champs).length > 0) return { champs };

  const consomme = await definirMotDePasseAvecJeton(
    valide.jetonHash,
    valide.idUtilisateur,
    await hacherMotDePasse(motDePasse)
  );
  if (!consomme) {
    // Une requête concurrente a consommé le jeton entre la vérification et
    // l'écriture. Le mot de passe de l'autre requête est en place.
    return { erreur: "Ce lien vient d'être utilisé. Essayez de vous connecter." };
  }

  // Ouverture de session immédiate : le titulaire vient de prouver qu'il
  // contrôle la boîte aux lettres ET le jeton. Lui redemander de saisir le mot
  // de passe qu'il vient de choisir n'apporterait rien.
  const { adresseIp, agentUtilisateur } = await contexteRequete();
  const compte = await trouverCompteParEmail(valide.email);
  if (compte) {
    await ouvrirSession(
      {
        idUtilisateur: compte.id.toString(),
        email: compte.email,
        role: compte.role,
        matricule: compte.matricule,
      },
      {
        agentUtilisateur: agentUtilisateur ?? undefined,
        adresseIp: adresseIp ?? undefined,
      }
    );
  }

  redirect("/");
}
