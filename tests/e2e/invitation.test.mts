import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { Session, contient, pageContient, lienMotDePasse } from "../aide/client.mts";
import {
  demarrerServeurSmtp,
  configurationSmtp,
  type ServeurSmtp,
} from "../aide/serveurSmtp.mts";
import { demarrerApp, type ServeurApp } from "../aide/serveur.mts";
import {
  semerAdministrateur,
  semerEmploye,
  nettoyerEssai,
  fermer,
  ADMIN_ESSAI,
  DOMAINE_ESSAI,
  prisma,
} from "../aide/donnees.mts";

/**
 * Parcours réel de l'invitation : compte créé, courriel émis, lien utilisable.
 *
 * ── Pourquoi du bout en bout et pas de l'unitaire ────────────────────────────
 *
 * Les deux défauts les plus graves de cette couche ne se voient QUE là : une file
 * de courriels brûlée par un mot de passe SMTP erroné, et un lien de mot de passe
 * qui fuitait dans la réponse alors que l'envoi avait réussi. Aucun test unitaire
 * ne les aurait attrapés — il faut la vraie Server Action, le vrai dialogue SMTP
 * et la vraie page.
 */

let smtp: ServeurSmtp;
let app: ServeurApp;
const MATRICULE = "99TINV1";
const DESTINATAIRE = `eloise.ngue@${DOMAINE_ESSAI}`;

before(async () => {
  await nettoyerEssai();
  await semerAdministrateur();
  await semerEmploye({ matricule: MATRICULE, nom: "NGUÉ", prenoms: "Éloïse Marie" });

  smtp = await demarrerServeurSmtp("ok");

  // `demarrerApp` réserve un port et pose `APP_URL` elle-même : les liens du
  // courriel pointent donc sur le serveur que ce test interroge.
  app = await demarrerApp(configurationSmtp(smtp));
});

after(async () => {
  await app?.arreter();
  await smtp?.arreter();
  await nettoyerEssai();
  await fermer();
});

describe("Invitation d'un employé", () => {
  test("le courriel part vraiment, et le lien reçu ouvre le formulaire", async () => {
    smtp.vider();

    const admin = new Session(app.url);
    await admin.connecter(ADMIN_ESSAI.email, ADMIN_ESSAI.motDePasse);

    const fiche = await admin.obtenir(`/personnel/${MATRICULE}`);
    assert.equal(fiche.statut, 200, "la fiche doit être accessible à l'admin");
    assert.ok(pageContient(fiche, "Aucun compte"), "l'employé ne doit pas encore avoir de compte");

    const reponse = await admin.soumettreFormulaire(
      `/personnel/${MATRICULE}`,
      "Créer le compte et envoyer le lien",
      { email: DESTINATAIRE }
    );
    assert.equal(reponse.statut, 200);

    // ── Le courriel ────────────────────────────────────────────────────────
    assert.equal(smtp.messages.length, 1, "exactement un courriel doit être émis");
    const courriel = smtp.dernier();

    assert.deepEqual(
      courriel.destinataires,
      [DESTINATAIRE],
      "l'enveloppe SMTP fait foi pour l'acheminement"
    );
    assert.equal(courriel.expediteur, "noreply@edc.cm");
    assert.match(courriel.entetes, /Auto-Submitted: auto-generated/);

    // Les accents doivent survivre à l'encodage MIME. Sans ce contrôle, un
    // encodage cassé passerait inaperçu jusqu'à ce qu'un employé reçoive du
    // charabia.
    assert.match(courriel.sujet, /accès/, `sujet reçu : « ${courriel.sujet} »`);
    assert.match(courriel.corps, /vient d'être créé/);

    const lien = courriel.corps.match(
      /https?:\/\/[^\s]+\/mot-de-passe\/[A-Za-z0-9_-]+/
    )?.[0];
    assert.ok(lien, "le corps doit contenir le lien en clair");

    // ── Le lien n'est PAS renvoyé au navigateur ─────────────────────────────
    assert.ok(
      contient(reponse, "a été envoyé à"),
      "l'écran doit confirmer l'envoi"
    );
    assert.equal(
      lienMotDePasse(reponse),
      null,
      "quand l'envoi réussit, le lien ne doit pas exister dans la réponse : " +
        "l'afficher le ferait vivre dans un second endroit sans bénéfice"
    );

    // ── Le lien fonctionne, pour quelqu'un de NON connecté ──────────────────
    const titulaire = new Session(app.url);
    const page = await titulaire.obtenir(lien!.replace(app.url, ""));
    assert.equal(page.statut, 200, "le formulaire de mot de passe doit s'ouvrir");
    assert.ok(
      pageContient(page, "motDePasse"),
      "la page doit porter le formulaire, pas l'écran « lien invalide »"
    );
    assert.ok(
      !pageContient(page, "plus valable"),
      "le lien vient d'être émis, il ne peut pas être périmé"
    );
  });

  test("la réémission invalide le lien précédent", async () => {
    smtp.vider();

    const admin = new Session(app.url);
    await admin.connecter(ADMIN_ESSAI.email, ADMIN_ESSAI.motDePasse);

    // Premier lien.
    await admin.soumettreFormulaire(
      `/personnel/${MATRICULE}`,
      "Envoyer un nouveau lien de mot de passe"
    );
    const premier = smtp.dernier().corps.match(
      /https?:\/\/[^\s]+\/mot-de-passe\/[A-Za-z0-9_-]+/
    )?.[0];
    assert.ok(premier);

    // Second lien.
    smtp.vider();
    const reponse = await admin.soumettreFormulaire(
      `/personnel/${MATRICULE}`,
      "Envoyer un nouveau lien de mot de passe"
    );
    const second = smtp.dernier().corps.match(
      /https?:\/\/[^\s]+\/mot-de-passe\/[A-Za-z0-9_-]+/
    )?.[0];
    assert.ok(second);
    assert.notEqual(premier, second, "chaque émission produit un jeton neuf");

    assert.match(
      smtp.dernier().sujet,
      /initialisation/i,
      "un compte existant reçoit le message de RÉINITIALISATION, pas de bienvenue"
    );
    assert.ok(contient(reponse, "Nouveau lien envoyé"));

    // Le premier ne doit plus rien ouvrir : un lien resté dans une boîte aux
    // lettres ne doit pas rester utilisable après réémission.
    const visiteur = new Session(app.url);
    const ancienne = await visiteur.obtenir(premier!.replace(app.url, ""));
    assert.ok(
      pageContient(ancienne, "plus valable"),
      "le lien précédent doit être refusé"
    );
  });

  test("un employé désactivé ne reçoit pas d'invitation", async () => {
    const matricule = "99TINV2";
    await semerEmploye({ matricule, nom: "PARTI", prenoms: "Jean", actif: false });
    smtp.vider();

    const admin = new Session(app.url);
    await admin.connecter(ADMIN_ESSAI.email, ADMIN_ESSAI.motDePasse);

    const fiche = await admin.obtenir(`/personnel/${matricule}`);
    assert.equal(fiche.statut, 200);

    // Le bouton est désactivé dans l'interface, mais l'action reste joignable en
    // POST : c'est elle qui doit refuser. On la sollicite donc directement.
    const reponse = await admin.soumettreFormulaire(
      `/personnel/${matricule}`,
      "Créer le compte et envoyer le lien",
      { email: `parti@${DOMAINE_ESSAI}` }
    );

    assert.ok(
      contient(reponse, "désactivé"),
      "l'action doit refuser : sinon on rouvrirait un accès qu'une désactivation vient de fermer"
    );
    assert.equal(smtp.messages.length, 0, "aucun courriel ne doit partir");

    const compte = await prisma.utilisateur.findFirst({ where: { matricule } });
    assert.equal(compte, null, "aucun compte ne doit avoir été créé");
  });

  test("la file garde une trace de chaque envoi", async () => {
    // La table `mail_en_attente` est le journal des envois : elle doit porter
    // l'horodatage de départ, et jamais être vidée.
    const envoyes = await prisma.mailEnAttente.count({
      where: { destinataire: { endsWith: `@${DOMAINE_ESSAI}` }, envoyeLe: { not: null } },
    });
    assert.ok(envoyes >= 1, `au moins un envoi doit être tracé (trouvé : ${envoyes})`);
  });
});
