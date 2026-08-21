import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash, randomBytes } from "node:crypto";

/**
 * Création d'un compte, avec impression du lien de définition du mot de passe.
 *
 *   npx tsx prisma/creerCompte.ts admin@edc.cm ADMINISTRATEUR
 *   npx tsx prisma/creerCompte.ts jean@edc.cm UTILISATEUR 22P582
 *
 * ── Pourquoi le mot de passe n'est PAS un argument ───────────────────────────
 *
 * Il finirait dans l'historique du shell (`~/.bash_history`), dans la liste des
 * processus le temps de l'exécution, et souvent dans les journaux du terminal.
 * On crée donc le compte sans mot de passe et on imprime un lien à usage unique :
 * seul le titulaire choisit son mot de passe, et personne d'autre ne le connaît.
 *
 * ── Pourquoi ce script ne réutilise pas lib/data/utilisateurs.ts ─────────────
 *
 * Ce module est marqué `import "server-only"`, dont l'entrée principale lève une
 * exception : hors du rendu React côté serveur, la condition d'export
 * `react-server` n'est pas active. Il faudrait lancer tsx avec
 * `NODE_OPTIONS="--conditions=react-server"`, ce qui rend la commande
 * fragile. Les quelques lignes dupliquées ici sont le prix de cette garde — et
 * c'est précisément ce qu'on attend d'elle : rendre impossible l'usage du DAL
 * depuis un contexte qui n'est pas le serveur de l'application.
 */

const DUREE_JETON_HEURES = 48; // doit rester aligné sur lib/data/utilisateurs.ts

function usage(message: string): never {
  console.error(`\n  ✖ ${message}\n`);
  console.error("  Usage : npx tsx prisma/creerCompte.ts <email> <ADMINISTRATEUR|UTILISATEUR> [matricule]\n");
  process.exit(1);
}

async function principal() {
  const [emailBrut, roleBrut, matriculeBrut] = process.argv.slice(2);

  if (!emailBrut) usage("Adresse de courriel manquante.");
  const email = emailBrut.trim().toLowerCase();
  if (!email.includes("@") || email.length < 5) usage(`Adresse invalide : ${emailBrut}`);

  const role = (roleBrut ?? "").trim().toUpperCase();
  if (role !== "ADMINISTRATEUR" && role !== "UTILISATEUR") {
    usage("Le rôle doit être ADMINISTRATEUR ou UTILISATEUR.");
  }

  const matricule = matriculeBrut?.trim() || null;
  if (role === "UTILISATEUR" && !matricule) {
    usage("Un compte UTILISATEUR doit porter un matricule (c'est lui qui le relie à son employé, donc à ses quotas et à ses congés).");
  }

  const url = process.env.DATABASE_URL;
  if (!url) usage("DATABASE_URL absente. Copier .env.example en .env.");

  const prisma = new PrismaClient({ adapter: new PrismaPg(url) });

  try {
    if (matricule) {
      const employe = await prisma.employe.findUnique({ where: { matricule } });
      if (!employe) {
        // On refuse plutôt que de créer un compte orphelin : la contrainte de
        // clé étrangère l'interdirait de toute façon, mais avec un message
        // Prisma illisible.
        usage(`Aucun employé au matricule ${matricule}. Créer l'employé d'abord.`);
      }
    }

    const existant = await prisma.utilisateur.findUnique({ where: { email } });

    let idUtilisateur: bigint;
    if (existant) {
      // Compte déjà là : on n'échoue pas, on réémet une invitation. C'est le
      // cas courant d'un mot de passe oublié, et le seul moyen d'en émettre une
      // tant que l'écran d'administration du personnel n'existe pas.
      console.log(`\n  ℹ Le compte ${email} existe déjà — émission d'un nouveau lien.`);
      idUtilisateur = existant.id;
      if (!existant.actif) {
        await prisma.utilisateur.update({ where: { id: existant.id }, data: { actif: true } });
        console.log("  ℹ Compte réactivé.");
      }
    } else {
      const cree = await prisma.utilisateur.create({
        data: { email, role, matricule },
        select: { id: true },
      });
      idUtilisateur = cree.id;
      console.log(`\n  ✔ Compte créé : ${email} (${role}${matricule ? `, matricule ${matricule}` : ""})`);
    }

    // Jeton : la base ne garde que l'empreinte SHA-256. La valeur en clair
    // n'existe que dans la sortie ci-dessous — elle est irrécupérable ensuite.
    const jeton = randomBytes(32).toString("base64url");
    const jetonHash = createHash("sha256").update(jeton).digest("base64url");

    await prisma.$transaction([
      // Les invitations en cours sont invalidées : un lien resté dans une boîte
      // aux lettres ne doit pas rester utilisable après réémission.
      prisma.jetonMotDePasse.updateMany({
        where: { idUtilisateur, utiliseLe: null },
        data: { utiliseLe: new Date() },
      }),
      prisma.jetonMotDePasse.create({
        data: {
          jetonHash,
          idUtilisateur,
          expireLe: new Date(Date.now() + DUREE_JETON_HEURES * 60 * 60 * 1000),
        },
      }),
    ]);

    const base = process.env.APP_URL ?? "http://localhost:3000";
    console.log("\n  ─────────────────────────────────────────────────────────────");
    console.log("  Lien de définition du mot de passe (valable 48 h, usage unique)");
    console.log("  ─────────────────────────────────────────────────────────────");
    console.log(`\n  ${base}/mot-de-passe/${encodeURIComponent(jeton)}\n`);
    console.log("  ⚠️ Ce lien vaut le mot de passe : le transmettre par un canal");
    console.log("     sûr, et ne pas le laisser dans un historique de terminal.");
    console.log("     Il n'est pas récupérable — relancer ce script pour en obtenir");
    console.log("     un nouveau.\n");
  } finally {
    await prisma.$disconnect();
  }
}

principal().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
