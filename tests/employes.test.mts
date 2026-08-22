import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  validerEmploye,
  normaliserMatricule,
  type SaisieEmploye,
} from "@/lib/data/employes.validation";

/**
 * Tests unitaires de la validation employé — les 11 règles.
 *
 * ── Pourquoi une date fixe ───────────────────────────────────────────────────
 *
 * `validerEmploye` accepte `aujourdhui` précisément pour ça. Sans injection, un
 * test sur « embauche dans le futur » finirait par échouer tout seul le jour où la
 * date d'essai serait dépassée — le pire des tests : celui qui casse sans qu'on
 * ait rien changé.
 */

const AUJOURDHUI = new Date(Date.UTC(2026, 7, 22)); // 22 août 2026

const REFERENTIELS = {
  codesStatutsValides: new Set(["CADRE", "AGENT"]),
  codesDepartementsValides: new Set(["DEX", "DFCC"]),
  aujourdhui: AUJOURDHUI,
};

/** Saisie complète et valide. Chaque test n'en modifie qu'un champ. */
function saisieValide(modifications: Partial<SaisieEmploye> = {}): SaisieEmploye {
  return {
    matricule: "22P582",
    nom: "NKOLO ATANGANA",
    prenoms: "Jean Pierre",
    grade: "Ingénieur",
    fonction: "SOUS-DIRECTEUR DU BUDGET",
    situationFamille: "MARIE",
    indice: "450",
    dateNaissance: "1985-03-14",
    dateEmbauche: "2012-09-01",
    codeStatut: "CADRE",
    codeDepartement: "DEX",
    nombreMedailles: "2",
    estDetache: false,
    joursCongeOrigine: "",
    ...modifications,
  };
}

/** Valide une saisie et renvoie le message d'erreur du champ visé, ou `undefined`. */
function erreurSur(
  champ: keyof SaisieEmploye,
  modifications: Partial<SaisieEmploye>
): string | undefined {
  return validerEmploye(saisieValide(modifications), REFERENTIELS).erreurs[champ];
}

describe("Normalisation du matricule", () => {
  test("majuscules et espaces retirés", () => {
    // La casse et les espaces sont une source de doublons invisibles : « 22p 582 »
    // et « 22P582 » désigneraient deux employés.
    assert.equal(normaliserMatricule("  22p 582 "), "22P582");
  });
});

describe("Une saisie correcte est acceptée", () => {
  test("aucune erreur, données prêtes pour la base", () => {
    const { valide, erreurs } = validerEmploye(saisieValide(), REFERENTIELS);
    assert.deepEqual(erreurs, {}, `erreurs inattendues : ${JSON.stringify(erreurs)}`);
    assert.ok(valide, "des données validées doivent être produites");
    assert.equal(valide.matricule, "22P582");
    assert.equal(valide.nombreMedailles, 2);
  });

  test("l'indice est facultatif", () => {
    assert.equal(erreurSur("indice", { indice: "" }), undefined);
  });
});

describe("Les 11 règles refusent", () => {
  test("1. matricule vide", () => {
    assert.ok(erreurSur("matricule", { matricule: "   " }));
  });

  test("2. nom vide", () => {
    assert.ok(erreurSur("nom", { nom: "" }));
  });

  test("3. prénoms vides", () => {
    assert.ok(erreurSur("prenoms", { prenoms: "" }));
  });

  test("4. statut inconnu du référentiel", () => {
    // La liste vient de la BASE, jamais d'une constante : un statut supprimé du
    // référentiel doit devenir invalide sans qu'on touche au code.
    assert.ok(erreurSur("codeStatut", { codeStatut: "INVENTE" }));
  });

  test("5. direction inconnue du référentiel", () => {
    assert.ok(erreurSur("codeDepartement", { codeDepartement: "INVENTE" }));
  });

  test("6. le 31 février n'existe pas", () => {
    // `new Date(Date.UTC(2000, 1, 31))` glisse silencieusement au 2 mars. La
    // validation relit donc les composants après construction pour le détecter.
    assert.ok(
      erreurSur("dateNaissance", { dateNaissance: "2000-02-31" }),
      "une date qui n'existe pas doit être refusée, pas décalée"
    );
  });

  test("7. embauche antérieure à la naissance", () => {
    assert.ok(
      erreurSur("dateEmbauche", { dateNaissance: "1990-01-01", dateEmbauche: "1985-01-01" })
    );
  });

  test("8. embauche dans le futur", () => {
    assert.ok(erreurSur("dateEmbauche", { dateEmbauche: "2027-01-01" }));
  });

  test("9. âge invraisemblable", () => {
    assert.ok(erreurSur("dateNaissance", { dateNaissance: "1850-01-01" }));
  });

  test("10. médailles négatives", () => {
    assert.ok(erreurSur("nombreMedailles", { nombreMedailles: "-1" }));
  });

  test("11. détaché sans droit à congé d'origine", () => {
    // Art. 81-6 : sans cette valeur, la règle est incalculable. La base porte la
    // même contrainte (`CHECK (NOT est_detache OR jours_conge_origine IS NOT NULL)`).
    assert.ok(erreurSur("joursCongeOrigine", { estDetache: true, joursCongeOrigine: "" }));
  });
});

describe("Cas limites des dates", () => {
  test("une embauche aujourd'hui est acceptée", () => {
    assert.equal(erreurSur("dateEmbauche", { dateEmbauche: "2026-08-22" }), undefined);
  });

  test("le 29 février d'une année bissextile est accepté", () => {
    assert.equal(erreurSur("dateNaissance", { dateNaissance: "2000-02-29" }), undefined);
  });

  test("le 29 février d'une année non bissextile est refusé", () => {
    // 1900 est divisible par 4 mais pas bissextile (règle séculaire) : c'est le
    // cas que les implémentations naïves manquent.
    assert.ok(erreurSur("dateNaissance", { dateNaissance: "1900-02-29" }));
  });

  test("un format non conforme est refusé", () => {
    for (const valeur of ["14/03/1985", "1985-3-14", "hier", ""]) {
      assert.ok(
        erreurSur("dateNaissance", { dateNaissance: valeur }),
        `« ${valeur} » aurait dû être refusé`
      );
    }
  });
});

describe("Le détachement", () => {
  test("un détaché avec son droit d'origine est accepté", () => {
    const { valide, erreurs } = validerEmploye(
      saisieValide({ estDetache: true, joursCongeOrigine: "30" }),
      REFERENTIELS
    );
    assert.deepEqual(erreurs, {});
    assert.equal(valide?.joursCongeOrigine, 30);
  });

  test("un non-détaché ne conserve pas de droit d'origine", () => {
    // Sinon une case décochée après saisie laisserait une valeur orpheline en
    // base, que la contrainte n'interdit pas mais qui n'a aucun sens.
    const { valide } = validerEmploye(
      saisieValide({ estDetache: false, joursCongeOrigine: "30" }),
      REFERENTIELS
    );
    assert.equal(valide?.joursCongeOrigine, null);
  });
});
