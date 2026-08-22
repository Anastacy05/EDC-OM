import "server-only";

import { prisma } from "@/lib/data/client";
import { exigerAdministrateur, exigerFondateurOuEchouer, lireSession } from "@/lib/auth/garde";
import { creerJetonMotDePasse } from "@/lib/data/utilisateurs";

/**
 * Gestion des comptes administrateurs. **Réservée au compte fondateur.**
 *
 * ── Pourquoi cette restriction ───────────────────────────────────────────────
 *
 * Exigence de l'utilisatrice (21/08/2026) : « On doit malheureusement pouvoir
 * créer des admins à l'écran mais seul le premier admin pourra le faire. »
 *
 * Le « malheureusement » est juste : un écran qui fabrique des administrateurs est
 * une élévation de privilège en un clic. Si n'importe quel administrateur pouvait
 * en créer d'autres, compromettre UN compte suffirait à en fabriquer autant qu'on
 * veut — et à retirer l'accès au titulaire d'origine. Restreindre à un seul compte
 * ramène la surface à un point unique, qu'on peut protéger sérieusement.
 *
 * ── Ce que la base garantit, et que le code ne pourrait pas ──────────────────
 *
 * Trois protections vivent en base, donc hors d'atteinte d'un défaut applicatif :
 *
 *   • `idx_utilisateur_fondateur_unique` — index UNIQUE partiel `WHERE
 *     est_fondateur` : il ne peut jamais y avoir deux fondateurs ;
 *   • `utilisateur_fondateur_est_admin` — CHECK : un fondateur est forcément
 *     ADMINISTRATEUR ;
 *   • `email` UNIQUE.
 *
 * ⚠️ **Aucune fonction d'ici ne pose `estFondateur`.** La capacité ne s'attribue
 * que par `prisma/creerCompte.ts`, donc depuis un accès serveur. Un écran ne doit
 * pas pouvoir se donner le droit qui gouverne tous les autres.
 */

export interface AdministrateurListe {
  id: string;
  email: string;
  matricule: string | null;
  /** Nom de l'employé rattaché, s'il y en a un. */
  nomEmploye: string | null;
  actif: boolean;
  estFondateur: boolean;
  aDefiniSonMotDePasse: boolean;
  derniereConnexion: string | null;
  /** Vrai si c'est le compte de la session en cours. */
  estMoi: boolean;
}

/**
 * Liste les administrateurs.
 *
 * Lisible par TOUT administrateur, pas seulement le fondateur : savoir qui détient
 * les droits fait partie de ce qu'un administrateur doit pouvoir vérifier. Seules
 * les écritures sont restreintes.
 */
export async function listerAdministrateurs(): Promise<AdministrateurListe[]> {
  const session = await exigerAdministrateur();

  const lignes = await prisma.utilisateur.findMany({
    where: { role: "ADMINISTRATEUR" },
    // Le fondateur en tête : c'est le compte de référence, celui qu'on cherche.
    orderBy: [{ estFondateur: "desc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      matricule: true,
      actif: true,
      estFondateur: true,
      motDePasseHash: true,
      derniereConnexion: true,
      employe: { select: { nom: true, prenoms: true } },
    },
  });

  return lignes.map((u) => ({
    id: u.id.toString(),
    email: u.email,
    matricule: u.matricule,
    nomEmploye: u.employe ? `${u.employe.nom} ${u.employe.prenoms}` : null,
    actif: u.actif,
    estFondateur: u.estFondateur,
    // Un booléen, jamais l'empreinte : elle n'a aucune raison de quitter le
    // serveur, même hachée.
    aDefiniSonMotDePasse: u.motDePasseHash !== null,
    derniereConnexion: u.derniereConnexion?.toISOString() ?? null,
    estMoi: u.id.toString() === session.idUtilisateur,
  }));
}

export type EchecAdministrateur =
  | { genre: "emailPris" }
  | { genre: "introuvable" }
  | { genre: "pasAdministrateur" }
  | { genre: "estFondateur" }
  | { genre: "estMoi" }
  | { genre: "employeInconnu" }
  | { genre: "employeInactif" }
  | { genre: "baseIndisponible" };

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
 * Crée un compte administrateur et renvoie son jeton d'invitation en clair.
 *
 * Le mot de passe n'est JAMAIS choisi par le fondateur : le titulaire le définit
 * via le lien. Personne d'autre que lui ne le connaît, et il n'y a pas de « mot de
 * passe provisoire » à transmettre de vive voix.
 *
 * Le matricule est facultatif : un administrateur peut ne pas être un employé de
 * l'EDC (prestataire, compte de service). S'il est fourni, l'employé doit exister
 * et être actif — sinon on rattacherait des droits à un dossier fermé.
 */
export async function creerAdministrateur(
  email: string,
  matricule: string | null
): Promise<
  { ok: true; jeton: string } | { ok: false; echec: EchecAdministrateur }
> {
  await exigerFondateurOuEchouer();

  const adresse = email.trim().toLowerCase();

  try {
    if (matricule) {
      const employe = await prisma.employe.findUnique({
        where: { matricule },
        select: { actif: true, utilisateur: { select: { id: true } } },
      });
      if (!employe) return { ok: false, echec: { genre: "employeInconnu" } };
      if (!employe.actif) return { ok: false, echec: { genre: "employeInactif" } };
      // `matricule` est UNIQUE sur `utilisateur` : un employé n'a qu'un compte.
      // Le dire ici plutôt que de laisser remonter une P2002 illisible.
      if (employe.utilisateur) return { ok: false, echec: { genre: "emailPris" } };
    }

    const compte = await prisma.utilisateur.create({
      // `estFondateur` volontairement ABSENT : il reste à sa valeur par défaut
      // (false). Le poser ici échouerait de toute façon sur l'index unique, mais
      // l'omettre rend l'intention lisible.
      data: { email: adresse, role: "ADMINISTRATEUR", matricule },
      select: { id: true },
    });

    const jeton = await creerJetonMotDePasse(compte.id);
    return { ok: true, jeton };
  } catch (erreur) {
    if (estViolationUnicite(erreur)) return { ok: false, echec: { genre: "emailPris" } };
    if (estPanneBase(erreur)) return { ok: false, echec: { genre: "baseIndisponible" } };
    throw erreur;
  }
}

/**
 * Retire les droits d'administration : le compte devient UTILISATEUR.
 *
 * ── Rétrograder, et non désactiver ───────────────────────────────────────────
 *
 * Le compte continue d'exister et de fonctionner, il perd seulement ses droits.
 * C'est le geste attendu quand quelqu'un change de poste : lui fermer tout accès
 * l'empêcherait de consulter ses propres missions et congés.
 *
 * ── Deux refus, et ils ne sont pas de la même nature ─────────────────────────
 *
 *   • **le fondateur** : le rétrograder violerait le CHECK
 *     `utilisateur_fondateur_est_admin`, mais surtout il n'y aurait plus personne
 *     pour créer des administrateurs — l'application se verrouillerait ;
 *   • **soi-même** : un fondateur qui se retire par erreur perdrait la capacité de
 *     se la redonner. La seule issue serait un accès serveur.
 *
 * Les sessions du compte sont révoquées : sans ça, le jeton d'accès en cours
 * porterait encore `role: "ADMINISTRATEUR"` pendant quinze minutes.
 */
export async function retrograderAdministrateur(
  id: string
): Promise<{ ok: true } | { ok: false; echec: EchecAdministrateur }> {
  await exigerFondateurOuEchouer();

  const session = await lireSession();
  if (session?.idUtilisateur === id) return { ok: false, echec: { genre: "estMoi" } };

  let identifiant: bigint;
  try {
    identifiant = BigInt(id);
  } catch {
    // Un identifiant non numérique vient d'un champ manipulé : ce n'est pas une
    // erreur de la base, c'est une ligne qui n'existe pas.
    return { ok: false, echec: { genre: "introuvable" } };
  }

  try {
    const compte = await prisma.utilisateur.findUnique({
      where: { id: identifiant },
      select: { role: true, estFondateur: true },
    });

    if (!compte) return { ok: false, echec: { genre: "introuvable" } };
    if (compte.role !== "ADMINISTRATEUR") {
      return { ok: false, echec: { genre: "pasAdministrateur" } };
    }
    if (compte.estFondateur) return { ok: false, echec: { genre: "estFondateur" } };

    const maintenant = new Date();
    await prisma.$transaction([
      prisma.utilisateur.update({
        where: { id: identifiant },
        data: { role: "UTILISATEUR" },
      }),
      prisma.sessionRenouvellement.updateMany({
        where: { idUtilisateur: identifiant, revoqueeLe: null },
        data: { revoqueeLe: maintenant },
      }),
    ]);

    return { ok: true };
  } catch (erreur) {
    if (estPanneBase(erreur)) return { ok: false, echec: { genre: "baseIndisponible" } };
    throw erreur;
  }
}
