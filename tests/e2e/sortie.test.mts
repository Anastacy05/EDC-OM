import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { Session, contient } from "../aide/client.mts";
import { demarrerApp, type ServeurApp } from "../aide/serveur.mts";
import {
  semerAdministrateur,
  semerEmploye,
  nettoyerEssai,
  fermer,
  ADMIN_ESSAI,
  prisma,
} from "../aide/donnees.mts";

/**
 * Motif de sortie : désactivation motivée, affichage, effacement à la réactivation.
 *
 * ── Ce que seule la vraie base peut confirmer ────────────────────────────────
 *
 * La contrainte `employe_motif_sortie_si_inactif` interdit un motif sur une fiche
 * ACTIVE. La réactivation doit donc effacer motif et note, sinon la transaction
 * échoue. Aucun test unitaire ne le verrait — c'est PostgreSQL qui arbitre.
 */

let app: ServeurApp;

before(async () => {
  await nettoyerEssai();
  await semerAdministrateur();

  app = await demarrerApp();
});

after(async () => {
  await app?.arreter();
  await nettoyerEssai();
  await fermer();
});

async function admin(): Promise<Session> {
  const session = new Session(app.url);
  await session.connecter(ADMIN_ESSAI.email, ADMIN_ESSAI.motDePasse);
  return session;
}

describe("Désactivation avec motif", () => {
  test("le motif et la note sont enregistrés", async () => {
    const matricule = "99TSOR1";
    await semerEmploye({ matricule, nom: "RETRAITE", prenoms: "Paul" });

    const session = await admin();
    const reponse = await session.soumettreFormulaire(
      `/personnel/${matricule}`,
      "bg-red-700", // classe propre au bouton de danger : marqueur fiable
      { motifSortie: "RETRAITE", noteSortie: "Départ effectif au 31 décembre." }
    );

    assert.ok(contient(reponse, "désactivé"), "l'écran doit confirmer");

    const fiche = await prisma.employe.findUniqueOrThrow({
      where: { matricule },
      select: { actif: true, desactiveLe: true, motifSortie: true, noteSortie: true },
    });

    assert.equal(fiche.actif, false);
    assert.equal(fiche.motifSortie, "RETRAITE");
    assert.equal(fiche.noteSortie, "Départ effectif au 31 décembre.");
    // La contrainte `CHECK (actif OR desactive_le IS NOT NULL)` l'impose : elle
    // sert à invalider un OM créé APRÈS le départ.
    assert.notEqual(fiche.desactiveLe, null, "la date de sortie doit être posée");
  });

  test("le motif est FACULTATIF : sans lui, la désactivation passe", async () => {
    // Décision de l'utilisatrice : une désactivation urgente ne doit pas être
    // retenue par un champ à remplir.
    const matricule = "99TSOR2";
    await semerEmploye({ matricule, nom: "SANSMOTIF", prenoms: "Anne" });

    const session = await admin();
    await session.soumettreFormulaire(`/personnel/${matricule}`, "bg-red-700");

    const fiche = await prisma.employe.findUniqueOrThrow({
      where: { matricule },
      select: { actif: true, motifSortie: true, noteSortie: true },
    });

    assert.equal(fiche.actif, false, "la fiche doit être désactivée malgré l'absence de motif");
    assert.equal(fiche.motifSortie, null);
    assert.equal(fiche.noteSortie, null);
  });

  test("une note sans motif est refusée", async () => {
    // La contrainte de base ne l'interdit pas, mais « note renseignée, motif nul »
    // se lit mal : on ne sait pas de quoi la note parle.
    const matricule = "99TSOR3";
    await semerEmploye({ matricule, nom: "NOTESEULE", prenoms: "Luc" });

    const session = await admin();
    const reponse = await session.soumettreFormulaire(
      `/personnel/${matricule}`,
      "bg-red-700",
      { motifSortie: "", noteSortie: "Une précision orpheline." }
    );

    assert.ok(contient(reponse, "Choisissez un motif"), "l'action doit refuser");

    const fiche = await prisma.employe.findUniqueOrThrow({
      where: { matricule },
      select: { actif: true },
    });
    assert.equal(fiche.actif, true, "rien ne doit avoir été écrit");
  });

  test("un motif inventé est refusé", async () => {
    // L'énumération PostgreSQL le refuserait, mais par une erreur illisible. La
    // validation doit produire un MESSAGE. Le champ est un `<select>`, donc cette
    // valeur ne peut venir que d'une requête forgée — ce qui est possible, une
    // Server Action étant une route HTTP.
    const matricule = "99TSOR4";
    await semerEmploye({ matricule, nom: "MOTIFFAUX", prenoms: "Eve" });

    const session = await admin();
    const reponse = await session.soumettreFormulaire(
      `/personnel/${matricule}`,
      "bg-red-700",
      { motifSortie: "PARTI_EN_VACANCES" }
    );

    assert.ok(contient(reponse, "inconnu"), "le message doit être lisible");

    const fiche = await prisma.employe.findUniqueOrThrow({
      where: { matricule },
      select: { actif: true },
    });
    assert.equal(fiche.actif, true);
  });

  test("le motif s'affiche sur la fiche et dans la liste", async () => {
    const matricule = "99TSOR5";
    await semerEmploye({ matricule, nom: "AFFICHE", prenoms: "Marc" });

    const session = await admin();
    await session.soumettreFormulaire(`/personnel/${matricule}`, "bg-red-700", {
      motifSortie: "DETACHEMENT",
      noteSortie: "Détaché au MINEE pour deux ans.",
    });

    // Sur la fiche : le libellé lisible, pas le code de l'énumération.
    const fiche = await session.obtenir(`/personnel/${matricule}`);
    assert.ok(
      fiche.corps.includes("Détachement"),
      "le libellé doit être affiché, non « DETACHEMENT »"
    );
    assert.ok(fiche.corps.includes("MINEE"), "la précision doit être visible");

    // Dans la liste : c'est là qu'on balaie plusieurs fiches, donc c'est là que
    // « Désactivé » seul obligeait à ouvrir chaque dossier.
    const liste = await session.obtenir("/personnel?q=AFFICHE&inactifs=1");
    assert.ok(liste.corps.includes(matricule));
    assert.ok(
      liste.corps.includes("Détachement"),
      "la liste doit distinguer un détachement d'une retraite"
    );
  });

  test("la désactivation ferme réellement l'accès", async () => {
    const matricule = "99TSOR6";
    await semerEmploye({ matricule, nom: "AVECCOMPTE", prenoms: "Rose" });

    const session = await admin();
    // Un compte, pour vérifier la cascade.
    await session.soumettreFormulaire(
      `/personnel/${matricule}`,
      "Créer le compte et envoyer le lien",
      { email: "rose@essai.invalid" }
    );

    await session.soumettreFormulaire(`/personnel/${matricule}`, "bg-red-700", {
      motifSortie: "DEMISSION",
    });

    const compte = await prisma.utilisateur.findUnique({
      where: { matricule },
      select: { id: true, actif: true },
    });
    assert.ok(compte, "le compte doit exister");
    assert.equal(compte.actif, false, "le compte doit être désactivé");

    const invitations = await prisma.jetonMotDePasse.count({
      where: { idUtilisateur: compte.id, utiliseLe: null },
    });
    assert.equal(
      invitations,
      0,
      "les invitations non utilisées doivent être annulées : un lien resté dans " +
        "une boîte aux lettres ne doit pas rouvrir un accès qu'on vient de fermer"
    );
  });
});

describe("Réactivation", () => {
  test("le motif est EFFACÉ à la réactivation", async () => {
    const matricule = "99TREA1";
    await semerEmploye({ matricule, nom: "REVENU", prenoms: "Jean" });

    const session = await admin();
    await session.soumettreFormulaire(`/personnel/${matricule}`, "bg-red-700", {
      motifSortie: "SUSPENSION",
      noteSortie: "Congé sans solde de six mois.",
    });

    const reponse = await session.soumettreFormulaire(
      `/personnel/${matricule}`,
      "Réactiver"
    );
    assert.ok(contient(reponse, "réactivé"), `réponse : ${reponse.statut}`);

    const fiche = await prisma.employe.findUniqueOrThrow({
      where: { matricule },
      select: { actif: true, desactiveLe: true, motifSortie: true, noteSortie: true },
    });

    assert.equal(fiche.actif, true);
    assert.equal(fiche.desactiveLe, null, "la date de sortie doit être effacée");
    // Le point que la contrainte impose : sans cet effacement, la transaction
    // échouerait sur `employe_motif_sortie_si_inactif`.
    assert.equal(fiche.motifSortie, null, "un employé revenu n'a plus de motif de sortie");
    assert.equal(fiche.noteSortie, null);

    const compte = await prisma.utilisateur.findUnique({
      where: { matricule },
      select: { actif: true },
    });
    if (compte) assert.equal(compte.actif, true, "le compte doit être rouvert");
  });

  test("un cycle désactivation / réactivation / désactivation tient", async () => {
    // Le cas du détachement (art. 81-6) : la fiche part et revient. Un état
    // résiduel ferait échouer le second tour.
    const matricule = "99TREA2";
    await semerEmploye({ matricule, nom: "CYCLE", prenoms: "Ada" });
    const session = await admin();

    for (const motif of ["DETACHEMENT", "RETRAITE"]) {
      await session.soumettreFormulaire(`/personnel/${matricule}`, "bg-red-700", {
        motifSortie: motif,
      });
      const eteinte = await prisma.employe.findUniqueOrThrow({
        where: { matricule },
        select: { motifSortie: true },
      });
      assert.equal(eteinte.motifSortie, motif, `le motif ${motif} doit être posé`);

      await session.soumettreFormulaire(`/personnel/${matricule}`, "Réactiver");
      const revenue = await prisma.employe.findUniqueOrThrow({
        where: { matricule },
        select: { actif: true, motifSortie: true },
      });
      assert.equal(revenue.actif, true);
      assert.equal(revenue.motifSortie, null);
    }
  });
});
