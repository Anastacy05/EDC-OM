import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { courrielInvitation } from "@/lib/mail/modeles";
import { estEchecDefinitif, estEchecDeConfiguration } from "@/lib/mail/transport";

/**
 * Tests unitaires de la couche courriel : textes et classement des échecs.
 *
 * Aucun serveur, aucune base — ces fonctions sont pures. C'est ce qui les rend
 * bon marché à éprouver, et le classement des échecs mérite de l'être : c'est là
 * qu'un défaut sérieux s'était glissé (cf. MODELE-DONNEES.md §16.2).
 */

describe("Modèles de courriel", () => {
  const options = { lien: "https://om.edc.cm/mot-de-passe/JETON", validiteHeures: 48 };

  test("l'invitation porte le lien en clair dans le corps", () => {
    const { corps } = courrielInvitation({ ...options, reinitialisation: false });
    // En texte brut le lien doit être LISIBLE, pas masqué derrière un libellé :
    // c'est ce qui permet au destinataire de vérifier où il va avant de cliquer.
    assert.ok(corps.includes(options.lien), "le lien doit apparaître tel quel");
  });

  test("la durée de validité est annoncée, et vient du paramètre", () => {
    const { corps } = courrielInvitation({
      ...options,
      validiteHeures: 12,
      reinitialisation: false,
    });
    assert.match(corps, /12 heures/);
    assert.doesNotMatch(corps, /48 heures/, "la durée ne doit pas être écrite en dur");
  });

  test("première invitation et réinitialisation ne disent pas la même chose", () => {
    const premiere = courrielInvitation({ ...options, reinitialisation: false });
    const reprise = courrielInvitation({ ...options, reinitialisation: true });

    assert.notEqual(premiere.sujet, reprise.sujet);
    assert.match(premiere.sujet, /acc[eè]s/i);
    assert.match(reprise.sujet, /initialisation/i);
    assert.match(premiere.corps, /compte vient d'être créé/);
  });

  test("le message dit quoi faire à qui n'a rien demandé", () => {
    // Sans cette phrase, la seule réaction possible devant un message inattendu
    // est de cliquer pour voir — exactement ce qu'il faut éviter.
    for (const reinitialisation of [true, false]) {
      const { corps } = courrielInvitation({ ...options, reinitialisation });
      assert.match(corps, /ne suivez pas ce lien/);
      assert.match(corps, /reste valable/);
    }
  });

  test("les accents sont préservés (pas de translittération)", () => {
    const { corps } = courrielInvitation({ ...options, reinitialisation: false });
    assert.match(corps, /créé/);
    assert.match(corps, /reçoit/);
  });
});

/**
 * Classement des échecs SMTP.
 *
 * Les objets d'erreur reproduisent la FORME RÉELLE des erreurs de nodemailer 9,
 * mesurée le 22/08/2026 en les provoquant contre un serveur d'essai. Inventer
 * ces formes rendrait les tests d'accord avec eux-mêmes et faux dans la vraie vie.
 */
describe("Classement des échecs SMTP", () => {
  const boiteInexistante = { responseCode: 550, message: "Message failed: 550 Boite inexistante" };
  const serveurSature = { responseCode: 451, message: "Message failed: 451 Serveur sature" };
  const identifiantsFaux = {
    code: "EAUTH",
    responseCode: 535,
    command: "AUTH PLAIN",
    message: "Invalid login: 535 5.7.8 Identifiants refuses",
  };
  const hoteInjoignable = {
    code: "ESOCKET",
    errno: -4078,
    syscall: "connect",
    command: "CONN",
    message: "connect ECONNREFUSED 127.0.0.1:2599",
  };
  const tlsImpossible = {
    code: "ESOCKET",
    command: "CONN",
    message: "error:0A00010B:SSL routines:tls_validate_record_header:wrong version number",
  };
  const delaiDepasse = { code: "ETIMEDOUT", command: "CONN", message: "Greeting never received" };

  test("5xx : définitif, le destinataire est en cause", () => {
    assert.equal(estEchecDefinitif(boiteInexistante), true);
    assert.equal(estEchecDeConfiguration(boiteInexistante), false);
  });

  test("4xx : temporaire, on réessaie", () => {
    assert.equal(estEchecDefinitif(serveurSature), false);
    assert.equal(estEchecDeConfiguration(serveurSature), false);
  });

  test("EAUTH : configuration, et SURTOUT pas définitif", () => {
    // Le cœur du défaut du 22/08/2026. `EAUTH` porte responseCode 535, donc un
    // 5xx : un classement naïf le rangeait en « définitif » et brûlait TOUTE la
    // file au premier balayage, sans qu'un `.env` corrigé la fasse repartir.
    assert.equal(estEchecDeConfiguration(identifiantsFaux), true);
    assert.equal(
      estEchecDefinitif(identifiantsFaux),
      false,
      "un mot de passe SMTP faux ne doit JAMAIS condamner un message"
    );
  });

  test("ESOCKET avec syscall : réseau, donc temporaire", () => {
    // `ESOCKET` recouvre deux causes opposées ; `syscall` les sépare. Sans cette
    // distinction, un serveur momentanément arrêté bloquerait la file.
    assert.equal(estEchecDeConfiguration(hoteInjoignable), false);
    assert.equal(estEchecDefinitif(hoteInjoignable), false);
  });

  test("ESOCKET sans syscall : TLS, donc notre configuration", () => {
    assert.equal(estEchecDeConfiguration(tlsImpossible), true);
    assert.equal(estEchecDefinitif(tlsImpossible), false);
  });

  test("délai dépassé : temporaire", () => {
    assert.equal(estEchecDefinitif(delaiDepasse), false);
    assert.equal(estEchecDeConfiguration(delaiDepasse), false);
  });

  test("les deux catégories sont mutuellement exclusives", () => {
    // Garantie par construction : `estEchecDefinitif` écarte d'abord les fautes
    // de configuration. Le vérifier interdit qu'une refonte casse l'invariant
    // sans que rien ne le signale.
    for (const erreur of [
      boiteInexistante, serveurSature, identifiantsFaux,
      hoteInjoignable, tlsImpossible, delaiDepasse,
    ]) {
      assert.ok(
        !(estEchecDefinitif(erreur) && estEchecDeConfiguration(erreur)),
        `${JSON.stringify(erreur.message)} tombe dans les deux catégories`
      );
    }
  });

  test("les entrées absurdes ne lèvent pas", () => {
    // Ces prédicats sont appelés dans un `catch` : s'ils levaient, ils
    // masqueraient l'erreur d'origine par une autre, sans rapport.
    for (const valeur of [null, undefined, "texte", 42, {}, new Error("nu")]) {
      assert.equal(typeof estEchecDefinitif(valeur), "boolean");
      assert.equal(typeof estEchecDeConfiguration(valeur), "boolean");
    }
  });
});
