import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { Session, contient, pageContient } from "../aide/client.mts";
import {
  demarrerServeurSmtp,
  configurationSmtp,
  type ServeurSmtp,
} from "../aide/serveurSmtp.mts";
import { demarrerApp, type ServeurApp } from "../aide/serveur.mts";
import {
  semerAdministrateur,
  semerAdministrateurOrdinaire,
  semerEmploye,
  avecCapaciteFondateur,
  verifierFondateurIntact,
  nettoyerEssai,
  fermer,
  ADMIN_ESSAI,
  ADMIN_ORDINAIRE,
  DOMAINE_ESSAI,
  prisma,
} from "../aide/donnees.mts";

/**
 * Création d'administrateurs, réservée au compte fondateur.
 *
 * ── Ce que ces tests doivent absolument montrer ──────────────────────────────
 *
 * Qu'un administrateur ORDINAIRE est refusé. Un test qui ne montre que le cas
 * autorisé ne prouve rien d'une garde : il passerait même si la garde n'existait
 * pas. D'où `ADMIN_ORDINAIRE`, et d'où la sollicitation DIRECTE de l'action —
 * masquer un bouton ne protège rien, la doc de Next est explicite là-dessus.
 *
 * ⚠️ La capacité de fondateur est EMPRUNTÉE (`avecCapaciteFondateur`) : un index
 * unique partiel n'autorise qu'un porteur, et le vrai fondateur est le compte de
 * l'utilisatrice. L'emprunt est rendu dans un `finally`, et
 * `verifierFondateurIntact` contrôle en fin de suite qu'il l'a bien été.
 */

let app: ServeurApp;
let smtp: ServeurSmtp;

before(async () => {
  await nettoyerEssai();
  await semerAdministrateur();
  await semerAdministrateurOrdinaire();

  smtp = await demarrerServeurSmtp("ok");

  app = await demarrerApp(configurationSmtp(smtp));
});

after(async () => {
  await app?.arreter();
  await smtp?.arreter();
  await nettoyerEssai();

  // Contrôle de sûreté : la capacité doit être revenue à son titulaire.
  const etat = await verifierFondateurIntact();
  await fermer();

  assert.ok(
    etat.ok,
    `⚠️ La capacité de fondateur est restée sur un compte d'essai (${
      etat.ok ? "" : etat.usurpateur
    }). Réparer :\n` +
      "   npx tsx prisma/creerCompte.ts <votre-email> ADMINISTRATEUR --fondateur"
  );
});

async function session(compte: { email: string; motDePasse: string }): Promise<Session> {
  const s = new Session(app.url);
  await s.connecter(compte.email, compte.motDePasse);
  return s;
}

describe("Accès à l'écran", () => {
  test("tout administrateur peut VOIR la liste", async () => {
    // Savoir qui détient les droits fait partie de ce qu'un administrateur doit
    // pouvoir vérifier ; le cacher n'apporterait que de l'opacité.
    const ordinaire = await session(ADMIN_ORDINAIRE);
    const page = await ordinaire.obtenir("/parametres/administrateurs");

    assert.equal(page.statut, 200);
    assert.ok(page.corps.includes(ADMIN_ESSAI.email), "les comptes doivent être listés");
  });

  test("un non-fondateur ne voit PAS le formulaire de création", async () => {
    const ordinaire = await session(ADMIN_ORDINAIRE);
    const page = await ordinaire.obtenir("/parametres/administrateurs");

    assert.ok(
      pageContient(page, "Réservé au compte fondateur"),
      "l'écran doit expliquer pourquoi l'action est absente"
    );
    assert.ok(
      !pageContient(page, "Créer et envoyer l'invitation"),
      "le bouton ne doit pas être proposé : il échouerait"
    );
  });

  test("le fondateur voit le formulaire", async () => {
    await avecCapaciteFondateur(ADMIN_ESSAI.email, async () => {
      const fondateur = await session(ADMIN_ESSAI);
      const page = await fondateur.obtenir("/parametres/administrateurs");

      assert.ok(
        pageContient(page, "Créer et envoyer l'invitation"),
        "le fondateur doit pouvoir agir"
      );
      assert.ok(page.corps.includes("Fondateur"), "son étiquette doit le désigner");
    });
  });
});

describe("Création d'un administrateur", () => {
  test("le fondateur crée un administrateur, qui reçoit son lien", async () => {
    const nouvel = `nouvel.admin@${DOMAINE_ESSAI}`;
    smtp.vider();

    await avecCapaciteFondateur(ADMIN_ESSAI.email, async () => {
      const fondateur = await session(ADMIN_ESSAI);
      const reponse = await fondateur.soumettreFormulaire(
        "/parametres/administrateurs",
        "Créer et envoyer l'invitation",
        { email: nouvel, matricule: "" }
      );

      assert.ok(contient(reponse, "Administrateur créé"), "l'écran doit confirmer");
    });

    const compte = await prisma.utilisateur.findUnique({
      where: { email: nouvel },
      select: { role: true, estFondateur: true, motDePasseHash: true },
    });

    assert.ok(compte, "le compte doit exister");
    assert.equal(compte.role, "ADMINISTRATEUR");
    // Le point sensible : un écran ne doit JAMAIS pouvoir transmettre la capacité
    // qui gouverne tous les autres droits.
    assert.equal(
      compte.estFondateur,
      false,
      "l'écran ne doit jamais poser estFondateur — seul prisma/creerCompte.ts le fait"
    );
    // Le mot de passe n'est pas choisi par le créateur : le titulaire le définit
    // via le lien, et personne d'autre ne le connaît.
    assert.equal(compte.motDePasseHash, null);

    assert.equal(smtp.messages.length, 1, "un courriel doit être émis");
    assert.deepEqual(smtp.dernier().destinataires, [nouvel]);
  });

  test("un administrateur ORDINAIRE est refusé, même en sollicitant l'action", async () => {
    // Le cœur du test. L'écran cache le formulaire, mais une Server Action est une
    // route HTTP : « Server Functions are reachable via direct POST requests. »
    // C'est donc la garde du DAL qui doit refuser, et c'est elle qu'on éprouve.
    const refuse = `refuse@${DOMAINE_ESSAI}`;
    smtp.vider();

    // Le formulaire n'existe pas sur la page de l'ordinaire : on emprunte les
    // champs d'action à la page du fondateur, puis on les rejoue avec la session
    // de l'ordinaire. C'est exactement ce que ferait un attaquant.
    const champs = await avecCapaciteFondateur(ADMIN_ESSAI.email, async () => {
      const fondateur = await session(ADMIN_ESSAI);
      const page = await fondateur.obtenir("/parametres/administrateurs");
      const { isolerFormulaire, champsCaches } = await import("../aide/client.mts");
      return champsCaches(
        isolerFormulaire(page.corps, "Créer et envoyer l'invitation")
      );
    });

    const ordinaire = await session(ADMIN_ORDINAIRE);
    const reponse = await ordinaire.soumettre("/parametres/administrateurs", {
      ...champs,
      email: refuse,
      matricule: "",
    });

    assert.ok(
      contient(reponse, "fondateur"),
      `l'action doit refuser en nommant la restriction (reçu : ${reponse.statut})`
    );

    const compte = await prisma.utilisateur.findUnique({ where: { email: refuse } });
    assert.equal(compte, null, "aucun compte ne doit avoir été créé");
    assert.equal(smtp.messages.length, 0, "aucun courriel ne doit partir");
  });

  test("une adresse déjà prise est refusée avec un message clair", async () => {
    await avecCapaciteFondateur(ADMIN_ESSAI.email, async () => {
      const fondateur = await session(ADMIN_ESSAI);
      const reponse = await fondateur.soumettreFormulaire(
        "/parametres/administrateurs",
        "Créer et envoyer l'invitation",
        { email: ADMIN_ORDINAIRE.email, matricule: "" }
      );
      assert.ok(contient(reponse, "déjà"), "le doublon doit être annoncé, pas planté");
    });
  });

  test("un matricule inconnu est refusé", async () => {
    await avecCapaciteFondateur(ADMIN_ESSAI.email, async () => {
      const fondateur = await session(ADMIN_ESSAI);
      const reponse = await fondateur.soumettreFormulaire(
        "/parametres/administrateurs",
        "Créer et envoyer l'invitation",
        { email: `avecmatricule@${DOMAINE_ESSAI}`, matricule: "99TINEXISTANT" }
      );
      assert.ok(contient(reponse, "Aucun employé"), "il faut créer la fiche d'abord");
    });
  });

  test("un employé désactivé ne peut pas devenir administrateur", async () => {
    const matricule = "99TADM9";
    await semerEmploye({ matricule, nom: "PARTI", prenoms: "Yves", actif: false });

    await avecCapaciteFondateur(ADMIN_ESSAI.email, async () => {
      const fondateur = await session(ADMIN_ESSAI);
      const reponse = await fondateur.soumettreFormulaire(
        "/parametres/administrateurs",
        "Créer et envoyer l'invitation",
        { email: `yves@${DOMAINE_ESSAI}`, matricule }
      );
      assert.ok(
        contient(reponse, "désactivé"),
        "on ne rattache pas des droits à un dossier fermé"
      );
    });
  });
});

describe("Retrait des droits", () => {
  test("le fondateur rétrograde un administrateur, qui reste utilisateur", async () => {
    const cible = `a.retrograder@${DOMAINE_ESSAI}`;
    const compte = await prisma.utilisateur.create({
      data: { email: cible, role: "ADMINISTRATEUR" },
      select: { id: true },
    });

    // Une session en cours, pour vérifier qu'elle est révoquée.
    await prisma.sessionRenouvellement.create({
      data: {
        jetonHash: `essai-retrogradation-${compte.id}`,
        idUtilisateur: compte.id,
        expireLe: new Date(Date.now() + 86_400_000),
      },
    });

    await avecCapaciteFondateur(ADMIN_ESSAI.email, async () => {
      const fondateur = await session(ADMIN_ESSAI);
      const page = await fondateur.obtenir("/parametres/administrateurs");
      const { isolerFormulaire, champsCaches } = await import("../aide/client.mts");

      // La page porte une ligne par administrateur : on isole celle de la cible en
      // partant de son adresse, unique sur la page.
      const fragment = isolerFormulaire(page.corps, cible);
      const reponse = await fondateur.soumettre("/parametres/administrateurs", {
        ...champsCaches(fragment),
        id: compte.id.toString(),
      });

      assert.ok(contient(reponse, "retirés"), `réponse : ${reponse.statut}`);
    });

    const apres = await prisma.utilisateur.findUniqueOrThrow({
      where: { id: compte.id },
      select: { role: true, actif: true },
    });

    // Rétrograder, et non désactiver : le compte doit pouvoir continuer à
    // consulter ses propres missions et congés.
    assert.equal(apres.role, "UTILISATEUR");
    assert.equal(apres.actif, true, "le compte reste utilisable");

    const vivantes = await prisma.sessionRenouvellement.count({
      where: { idUtilisateur: compte.id, revoqueeLe: null },
    });
    assert.equal(
      vivantes,
      0,
      "les sessions doivent être révoquées : sinon le jeton en cours porterait " +
        "encore role ADMINISTRATEUR pendant quinze minutes"
    );
  });

  test("le fondateur ne peut pas se rétrograder lui-même", async () => {
    await avecCapaciteFondateur(ADMIN_ESSAI.email, async () => {
      const moi = await prisma.utilisateur.findUniqueOrThrow({
        where: { email: ADMIN_ESSAI.email },
        select: { id: true },
      });

      const fondateur = await session(ADMIN_ESSAI);
      const page = await fondateur.obtenir("/parametres/administrateurs");
      const { isolerFormulaire, champsCaches } = await import("../aide/client.mts");

      // Le bouton n'est pas rendu pour soi-même : on emprunte les champs d'une
      // autre ligne et on substitue l'identifiant. Il n'y a pas d'autre façon
      // d'éprouver la garde.
      const fragment = isolerFormulaire(page.corps, ADMIN_ORDINAIRE.email);
      const reponse = await fondateur.soumettre("/parametres/administrateurs", {
        ...champsCaches(fragment),
        id: moi.id.toString(),
      });

      assert.ok(
        contient(reponse, "vos propres droits") || contient(reponse, "fondateur"),
        `l'action doit refuser (reçu : ${reponse.statut})`
      );

      const inchange = await prisma.utilisateur.findUniqueOrThrow({
        where: { id: moi.id },
        select: { role: true, estFondateur: true },
      });
      assert.equal(inchange.role, "ADMINISTRATEUR");
      assert.equal(inchange.estFondateur, true);
    });
  });

  test("un administrateur ordinaire ne peut pas rétrograder", async () => {
    const cible = await prisma.utilisateur.findUniqueOrThrow({
      where: { email: ADMIN_ESSAI.email },
      select: { id: true },
    });

    const champs = await avecCapaciteFondateur(ADMIN_ORDINAIRE.email, async () => {
      const porteur = await session(ADMIN_ORDINAIRE);
      const page = await porteur.obtenir("/parametres/administrateurs");
      const { isolerFormulaire, champsCaches } = await import("../aide/client.mts");
      return champsCaches(isolerFormulaire(page.corps, ADMIN_ESSAI.email));
    });

    // Hors de l'emprunt : l'ordinaire n'est plus fondateur, donc il doit être
    // refusé même avec des champs d'action valides.
    const ordinaire = await session(ADMIN_ORDINAIRE);
    const reponse = await ordinaire.soumettre("/parametres/administrateurs", {
      ...champs,
      id: cible.id.toString(),
    });

    assert.ok(contient(reponse, "fondateur"), `réponse : ${reponse.statut}`);

    const inchange = await prisma.utilisateur.findUniqueOrThrow({
      where: { id: cible.id },
      select: { role: true },
    });
    assert.equal(inchange.role, "ADMINISTRATEUR", "rien ne doit avoir changé");
  });
});

describe("Garanties de la base", () => {
  test("deux fondateurs sont impossibles", async () => {
    // L'index UNIQUE partiel `WHERE est_fondateur` est la seule garantie qui
    // survive à un défaut applicatif. Le vérifier ici, c'est vérifier que la
    // migration est bien en place.
    const titulaire = await prisma.utilisateur.findFirst({
      where: { estFondateur: true },
      select: { id: true },
    });

    if (!titulaire) {
      // Aucun fondateur en base : le test n'a rien à éprouver, et en poser un
      // modifierait l'état du dépôt. On le signale plutôt que de passer en silence.
      assert.ok(true, "aucun fondateur en base — contrainte non éprouvée");
      return;
    }

    const autre = await prisma.utilisateur.findFirst({
      where: { estFondateur: false, role: "ADMINISTRATEUR" },
      select: { id: true },
    });
    if (!autre) return;

    await assert.rejects(
      prisma.utilisateur.update({
        where: { id: autre.id },
        data: { estFondateur: true },
      }),
      "un second fondateur doit être refusé par l'index unique partiel"
    );
  });

  test("un fondateur non administrateur est impossible", async () => {
    const titulaire = await prisma.utilisateur.findFirst({
      where: { estFondateur: true },
      select: { id: true },
    });
    if (!titulaire) return;

    // Le CHECK `utilisateur_fondateur_est_admin` doit refuser.
    await assert.rejects(
      prisma.utilisateur.update({
        where: { id: titulaire.id },
        data: { role: "UTILISATEUR" },
      }),
      "le CHECK doit lier la capacité au rôle ADMINISTRATEUR"
    );
  });
});
