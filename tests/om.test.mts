import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ulid, isValid as ulidValide, decodeTime } from "ulid";

import {
  composerNumero,
  decomposerNumero,
  numeroCommeImprime,
  numeroPourGabarit,
  LARGEUR_COMPTEUR,
  LIMITE_COMPTEUR,
  SUFFIXE_DOCUMENT,
} from "@/lib/numeroOM";
import {
  validerOM,
  periodesSeChevauchent,
  mentionStatut,
  estStatutParticipation,
  libelleStatutParticipation,
  MAX_PARTICIPANTS,
  STATUTS_ENGAGEANTS,
  STATUTS_PARTICIPATION,
  EMETTEUR,
  type SaisieOM,
} from "@/lib/data/om.validation";

/**
 * Tests unitaires des ordres de mission.
 *
 * Rien ici ne touche la base : ce sont des fonctions pures. Les règles qui exigent
 * un état (numérotation, conflits, transitions) sont éprouvées de bout en bout dans
 * `tests/e2e/om.test.mts` — c'est le découpage retenu, et la doc Next recommande
 * d'ailleurs le bout en bout pour tout ce qui traverse un composant serveur.
 *
 * ── Pourquoi une date fixe ───────────────────────────────────────────────────
 *
 * `validerOM` accepte `aujourdhui` précisément pour ça. Sans injection, le test
 * « départ dans le passé » finirait par échouer tout seul le jour où la date d'essai
 * serait dépassée — le pire des tests, celui qui casse sans qu'on ait rien changé.
 */

const AUJOURDHUI = new Date(Date.UTC(2026, 7, 23)); // 23 août 2026

/** Un ULID valide et figé, pour que les tests ne dépendent pas du hasard. */
const ULID_FIXE = "01K39TPZ8QW5X6Y7Z8A9B0CDEF";

const PAYS_CONNUS = new Set(["Cameroun", "France", "Tchad"]);

/** Saisie complète et valide. Chaque test n'en modifie qu'un champ. */
function saisieValide(modifications: Partial<SaisieOM> = {}): SaisieOM {
  return {
    ulid: ULID_FIXE,
    paysDestination: "France",
    villeDestination: "Paris",
    viaPassage: "",
    motif: "Mission technique de supervision du projet GANDAL",
    financement: "Budget interne EDC",
    moyenTransport: "Avion",
    dateDepart: "2026-09-10",
    dateRetour: "2026-09-15",
    lieuEmission: "Yaoundé",
    dateEmission: "2026-08-23",
    matricules: ["22P582"],
    ...modifications,
  };
}

/** Valide une saisie et renvoie l'erreur du champ visé, ou `undefined`. */
function erreurSur(
  champ: keyof SaisieOM,
  modifications: Partial<SaisieOM>
): string | undefined {
  return validerOM(saisieValide(modifications), {
    paysConnus: PAYS_CONNUS,
    aujourdhui: AUJOURDHUI,
  }).erreurs[champ];
}

// ---------------------------------------------------------------------------
// Numéro d'OM
// ---------------------------------------------------------------------------

describe("Composition du numéro d'OM", () => {
  test("complète le compteur à quatre chiffres", () => {
    // Le gabarit imprime quatre chiffres : « 42/2026 » désalignerait la case.
    assert.equal(composerNumero(42, 2026), "0042/2026");
    assert.equal(composerNumero(1, 2026), "0001/2026");
    assert.equal(composerNumero(9999, 2026), "9999/2026");
  });

  test("l'année fait partie de la valeur stockée", () => {
    // `participation.numero_om` est UNIQUE et le compteur repart à 1 chaque année :
    // sans l'année, le 42ᵉ OM de 2027 entrerait en collision avec celui de 2026.
    assert.notEqual(composerNumero(42, 2026), composerNumero(42, 2027));
  });

  test("refuse un compteur hors bornes plutôt que de tronquer", () => {
    // ⚠️ AUCUNE contrainte en base ne borne `plage_numero.borne_max`. Si ce contrôle
    // disparaissait, PostgreSQL accepterait une plage 9990–10040 et les derniers
    // numéros déborderaient à cinq chiffres sur un document signé.
    assert.throws(() => composerNumero(0, 2026), /hors bornes/);
    assert.throws(() => composerNumero(-1, 2026), /hors bornes/);
    assert.throws(() => composerNumero(LIMITE_COMPTEUR + 1, 2026), /hors bornes/);
    assert.throws(() => composerNumero(1.5, 2026), /hors bornes/);
  });

  test("refuse une année invraisemblable", () => {
    assert.throws(() => composerNumero(42, 1999), /invraisemblable/);
    assert.throws(() => composerNumero(42, 3000), /invraisemblable/);
  });

  test("LIMITE_COMPTEUR découle de la largeur imprimée", () => {
    // Les deux constantes doivent rester d'accord : si le gabarit passait à cinq
    // chiffres, la limite doit suivre, pas être corrigée à la main.
    assert.equal(LIMITE_COMPTEUR, 10 ** LARGEUR_COMPTEUR - 1);
  });
});

describe("Décomposition du numéro d'OM", () => {
  test("aller-retour", () => {
    for (const [compteur, annee] of [
      [1, 2026],
      [42, 2026],
      [9999, 2099],
    ] as const) {
      assert.deepEqual(decomposerNumero(composerNumero(compteur, annee)), {
        compteur,
        annee,
      });
    }
  });

  test("renvoie null sans lever, pour ne pas faire tomber un écran", () => {
    // Cette fonction LIT des valeurs existantes (tri, affichage, audit). Une ligne
    // ancienne au format différent doit s'afficher telle quelle, pas casser la page.
    for (const invalide of ["", "42/2026", "0042-2026", "0042/2026/extra", "abcd/2026"]) {
      assert.equal(decomposerNumero(invalide), null, `« ${invalide} » devrait être refusé`);
    }
  });

  test("« 0000 » est syntaxiquement conforme mais n'existe pas", () => {
    // Les compteurs partent de 1 : accepter 0 laisserait croire à un numéro valide.
    assert.equal(decomposerNumero("0000/2026"), null);
  });
});

describe("Numéro tel qu'imprimé", () => {
  test("porte le suffixe du gabarit, sans l'année", () => {
    // Le gabarit imprime « N° {numeroOM}/EDC/DG/DRH/SDARHAS ». L'écran doit montrer
    // ce que l'utilisateur va imprimer, sinon il verrait « 0042/2026 » à l'écran et
    // autre chose sur le papier, et douterait avec raison qu'il s'agit du même
    // document.
    assert.equal(numeroCommeImprime("0042/2026"), `0042${SUFFIXE_DOCUMENT}`);
  });

  test("un format inconnu est rendu tel quel — on n'invente rien", () => {
    assert.equal(numeroCommeImprime("format-inattendu"), "format-inattendu");
  });
});

describe("Numéro passé au gabarit", () => {
  test("le COMPTEUR seul : le gabarit ajoute le suffixe lui-même", () => {
    // ⚠️ Le défaut que ce test protège (signalé le 24/08/2026) : la balise du
    // gabarit est `N° {numeroOM}/EDC/DG/DRH/SDARHAS`. Lui passer la valeur stockée
    // imprimait « N° 0042/2026/EDC/DG/DRH/SDARHAS » — l'année au milieu du suffixe
    // administratif, alors qu'elle n'est dans la colonne que pour rendre
    // `numero_om` unique d'une année sur l'autre.
    assert.equal(numeroPourGabarit("0042/2026"), "0042");
    assert.equal(numeroPourGabarit("0001/2026"), "0001");
  });

  test("les deux fonctions se complètent : compteur + suffixe = numéro imprimé", () => {
    // C'est l'invariant qui garantit que l'écran et le papier disent la même chose.
    // S'il tombe, le fac-similé cesse d'être un fac-similé.
    const stocke = "0042/2026";
    assert.equal(numeroPourGabarit(stocke) + SUFFIXE_DOCUMENT, numeroCommeImprime(stocke));
  });

  test("un format inconnu est rendu tel quel", () => {
    assert.equal(numeroPourGabarit("format-inattendu"), "format-inattendu");
  });
});

// ---------------------------------------------------------------------------
// ULID
// ---------------------------------------------------------------------------

describe("ULID, clé d'idempotence", () => {
  test("26 caractères, alphabet de Crockford", () => {
    const valeur = ulid();
    assert.equal(valeur.length, 26);
    // ⚠️ L'alphabet EXCLUT I, L, O et U. Un contrôle sur `[A-Z0-9]` accepterait
    // des chaînes qu'aucun générateur ne produit.
    assert.match(valeur, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.ok(ulidValide(valeur));
  });

  test("croissant dans le temps : l'ordre alphabétique suit l'ordre d'émission", () => {
    // C'est la propriété qui rend la colonne utile à l'audit sans index
    // supplémentaire — 48 bits d'horodatage en tête, donc le tri binaire d'un
    // `CHAR(26)` est un tri chronologique.
    //
    // ⚠️ Les horodatages sont IMPOSÉS, et ce n'est pas un confort de test :
    // `ulid()` n'est PAS monotone à l'intérieur d'une même milliseconde. La
    // monotonie est une option de la spécification, fournie par
    // `monotonicFactory()`, que ce projet n'emploie pas. Deux appels successifs
    // tombant dans la même milliseconde ne diffèrent donc que par leurs 80 bits
    // d'aléa, et se trient au hasard. Un test qui comparait deux `ulid()` nus
    // passait une fois sur deux — constaté le 23/08/2026.
    //
    // Rien dans l'application ne dépend de cet ordre : l'ULID sert de clé
    // d'idempotence, pas de curseur. C'est `cree_le` qui date un OM.
    const avant = ulid(1_756_000_000_000);
    const apres = ulid(1_756_000_001_000);
    assert.ok(apres > avant, `${apres} devrait suivre ${avant}`);

    // Le même horodatage ne garantit que la longueur et l'alphabet.
    const jumeaux = [ulid(1_756_000_000_000), ulid(1_756_000_000_000)];
    assert.equal(jumeaux[0].slice(0, 10), jumeaux[1].slice(0, 10));
    assert.notEqual(jumeaux[0], jumeaux[1]);
  });

  test("l'horodatage est relisible", () => {
    const instant = 1_756_000_000_000;
    assert.equal(decodeTime(ulid(instant)), instant);
  });

  test("la validation rejette un ULID tronqué", () => {
    // ⚠️ La colonne est `CHAR(26)`, donc un `bpchar` : PostgreSQL COMPLÈTE à droite
    // et ignore les espaces de fin en comparaison. Un ULID tronqué serait stocké
    // complété **et comparé égal** — d'où le contrôle de longueur applicatif.
    assert.equal(erreurSur("ulid", { ulid: ULID_FIXE.slice(0, 25) }) !== undefined, true);
    assert.equal(erreurSur("ulid", { ulid: "" }) !== undefined, true);
    // Lettres exclues de l'alphabet : I, L, O, U.
    assert.equal(
      erreurSur("ulid", { ulid: "01K39TPZ8QW5X6Y7Z8A9B0CDEI" }) !== undefined,
      true
    );
  });
});

// ---------------------------------------------------------------------------
// Validation de la saisie
// ---------------------------------------------------------------------------

describe("Une saisie correcte est acceptée", () => {
  test("aucune erreur, et les champs facultatifs vides deviennent null", () => {
    const { valide, erreurs } = validerOM(saisieValide(), {
      paysConnus: PAYS_CONNUS,
      aujourdhui: AUJOURDHUI,
    });

    assert.deepEqual(erreurs, {});
    assert.ok(valide);
    // `null` et non `""` : les colonnes sont nullables, et une chaîne vide en base
    // se distingue mal d'une valeur saisie puis effacée.
    assert.equal(valide.viaPassage, null);
    // Les dates sont des minuits UTC portant le jour saisi.
    assert.equal(valide.dateDepart.toISOString(), "2026-09-10T00:00:00.000Z");
  });

  test("les matricules sont normalisés", () => {
    const { valide } = validerOM(saisieValide({ matricules: [" 22p582 ", "22P 583"] }), {
      paysConnus: PAYS_CONNUS,
      aujourdhui: AUJOURDHUI,
    });
    assert.deepEqual(valide?.matricules, ["22P582", "22P583"]);
  });
});

describe("Ce que la validation impose, et ce qu'elle a cessé d'imposer", () => {
  // Cinq colonnes étaient `NOT NULL` sans que rien ne les valide : `handleValider`
  // ne contrôlait que les deux dates et la présence d'un participant. On pouvait
  // enregistrer un OM sans pays de destination — donc sans zone, donc SANS
  // INDEMNITÉ.
  //
  // ── Le 24/08/2026, deux des cinq sont devenues facultatives ────────────────
  //
  // `motif` et `ville_destination` ne conditionnent RIEN : le gabarit imprime pour
  // chacune une ligne à compléter, qui se remplit au stylo. Les exiger ne rendait
  // pas le document plus complet, ça poussait à taper « RAS » — donc à imprimer
  // une contrevérité. Les trois autres restent dues, parce qu'elles portent
  // chacune une conséquence : le pays donne la zone donc l'indemnité, le lieu et
  // la date d'émission datent la pièce.

  test("le motif est FACULTATIF depuis le 24/08/2026", () => {
    const { valide, erreurs } = validerOM(saisieValide({ motif: "   " }), {
      paysConnus: PAYS_CONNUS,
      aujourdhui: AUJOURDHUI,
    });
    assert.equal(erreurs.motif, undefined);
    // `null` et non `""` : « pas de motif saisi » est un fait, une chaîne vide
    // serait un motif vide. La colonne est nullable pour dire exactement ça.
    assert.equal(valide?.motif, null);
  });

  test("la ville de destination est FACULTATIVE depuis le 24/08/2026", () => {
    const { valide, erreurs } = validerOM(saisieValide({ villeDestination: "" }), {
      paysConnus: PAYS_CONNUS,
      aujourdhui: AUJOURDHUI,
    });
    assert.equal(erreurs.villeDestination, undefined);
    assert.equal(valide?.villeDestination, null);
  });

  test("le pays de destination reste obligatoire : sans lui, aucune indemnité", () => {
    assert.match(erreurSur("paysDestination", { paysDestination: "" }) ?? "", /obligatoire/);
  });

  test("lieu d'émission obligatoire", () => {
    assert.match(erreurSur("lieuEmission", { lieuEmission: "" }) ?? "", /obligatoire/);
  });

  test("date d'émission obligatoire", () => {
    assert.ok(erreurSur("dateEmission", { dateEmission: "" }));
  });

  test("la longueur de la ville reste bornée quand elle est saisie", () => {
    // Facultatif ne veut pas dire non contrôlé : la colonne est un VARCHAR(120),
    // et un dépassement produirait une erreur PostgreSQL illisible.
    assert.match(
      erreurSur("villeDestination", { villeDestination: "x".repeat(121) }) ?? "",
      /120 caractères/
    );
  });
});

describe("Le pays doit être au référentiel", () => {
  test("un pays inconnu est refusé, pas remplacé par un défaut", () => {
    // Sans zone, l'indemnité serait devinée — et fausse sur un document signé.
    const message = erreurSur("paysDestination", { paysDestination: "Atlantide" });
    assert.match(message ?? "", /zone est inconnue/);
  });

  test("le contrôle est sauté si le référentiel n'est pas fourni", () => {
    // `paysConnus` absent = contrôle non effectué. C'est utile aux tests unitaires,
    // et sans danger : le DAL revérifie en base à l'écriture.
    const { erreurs } = validerOM(saisieValide({ paysDestination: "Atlantide" }), {
      aujourdhui: AUJOURDHUI,
    });
    assert.equal(erreurs.paysDestination, undefined);
  });
});

describe("Les dates", () => {
  test("retour avant départ refusé", () => {
    const message = erreurSur("dateRetour", {
      dateDepart: "2026-09-15",
      dateRetour: "2026-09-10",
    });
    assert.match(message ?? "", /précéder le départ/);
  });

  test("un aller-retour le même jour est accepté", () => {
    // Une mission d'un jour est légitime, et la contrainte de base l'autorise
    // (`date_retour >= date_depart`).
    const { erreurs } = validerOM(
      saisieValide({ dateDepart: "2026-09-10", dateRetour: "2026-09-10" }),
      { paysConnus: PAYS_CONNUS, aujourdhui: AUJOURDHUI }
    );
    assert.equal(erreurs.dateRetour, undefined);
  });

  test("départ dans le passé refusé", () => {
    assert.match(erreurSur("dateDepart", { dateDepart: "2026-08-22" }) ?? "", /passé/);
  });

  test("un départ AUJOURD'HUI est accepté", () => {
    // La borne est large : partir le jour même est courant. Une comparaison stricte
    // refuserait la saisie du matin pour un départ l'après-midi.
    const { erreurs } = validerOM(saisieValide({ dateDepart: "2026-08-23" }), {
      paysConnus: PAYS_CONNUS,
      aujourdhui: AUJOURDHUI,
    });
    assert.equal(erreurs.dateDepart, undefined);
  });

  test("une date impossible est refusée, pas reportée", () => {
    // `Date.UTC` accepte le 31 février et le reporte au 2 ou 3 mars. Sans la
    // relecture d'`analyserDate`, la date passerait EN SILENCE.
    assert.ok(erreurSur("dateDepart", { dateDepart: "2026-02-31" }));
    assert.ok(erreurSur("dateDepart", { dateDepart: "2026-13-01" }));
    assert.ok(erreurSur("dateDepart", { dateDepart: "10/09/2026" }));
  });

  test("une date d'émission invraisemblable est refusée", () => {
    // ⚠️ La base ne borne PAS cette colonne : « 2062 » pour « 2026 » produirait une
    // pièce datée du futur que personne ne remarquerait.
    assert.ok(erreurSur("dateEmission", { dateEmission: "2062-08-23" }));
    assert.ok(erreurSur("dateEmission", { dateEmission: "0002-01-01" }));
  });
});

describe("Les participants", () => {
  test("au moins un", () => {
    assert.match(erreurSur("matricules", { matricules: [] }) ?? "", /au moins un/i);
  });

  test("les entrées vides ne comptent pas pour un participant", () => {
    // Un formulaire peut envoyer un champ vide : le prendre pour un participant
    // ferait échouer l'écriture sur un matricule introuvable.
    assert.ok(erreurSur("matricules", { matricules: ["", "  "] }));
  });

  test("un doublon est refusé avant la base", () => {
    // La clé primaire composite l'interdit de toute façon ; le dire ici évite une
    // violation d'unicité illisible.
    const message = erreurSur("matricules", { matricules: ["22P582", "22p582"] });
    assert.match(message ?? "", /plusieurs fois/);
  });

  test(`plus de ${MAX_PARTICIPANTS} participants refusé`, () => {
    // Chaque participant consomme un numéro d'OM DÉFINITIF : une saisie erronée en
    // brûlerait autant.
    const trop = Array.from({ length: MAX_PARTICIPANTS + 1 }, (_, i) => `22P${i + 100}`);
    assert.ok(erreurSur("matricules", { matricules: trop }));
  });

  test(`exactement ${MAX_PARTICIPANTS} est accepté`, () => {
    const limite = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => `22P${i + 100}`);
    const { erreurs } = validerOM(saisieValide({ matricules: limite }), {
      paysConnus: PAYS_CONNUS,
      aujourdhui: AUJOURDHUI,
    });
    assert.equal(erreurs.matricules, undefined);
  });
});

describe("Longueurs maximales, alignées sur les colonnes", () => {
  test("une valeur trop longue est refusée au lieu d'être tronquée par PostgreSQL", () => {
    assert.ok(erreurSur("villeDestination", { villeDestination: "V".repeat(121) }));
    assert.ok(erreurSur("viaPassage", { viaPassage: "V".repeat(201) }));
    assert.ok(erreurSur("financement", { financement: "F".repeat(151) }));
    assert.ok(erreurSur("moyenTransport", { moyenTransport: "T".repeat(101) }));
    assert.ok(erreurSur("lieuEmission", { lieuEmission: "L".repeat(101) }));
  });
});

// ---------------------------------------------------------------------------
// Chevauchement de périodes
// ---------------------------------------------------------------------------

describe("Chevauchement, bornes INCLUSES", () => {
  const d = (jour: number) => new Date(Date.UTC(2026, 8, jour));

  test("un retour le 10 et un départ le 10 sont en conflit", () => {
    // C'est LA décision que la spécification ne tranchait pas. L'intervalle est
    // fermé — cohérent avec `dureeEnJours`, qui compte les deux bornes : une
    // mission d'un seul jour dure un jour, pas zéro.
    assert.equal(periodesSeChevauchent(d(5), d(10), d(10), d(12)), true);
    assert.equal(periodesSeChevauchent(d(10), d(12), d(5), d(10)), true);
  });

  test("des périodes disjointes ne se chevauchent pas", () => {
    assert.equal(periodesSeChevauchent(d(1), d(5), d(6), d(10)), false);
    assert.equal(periodesSeChevauchent(d(6), d(10), d(1), d(5)), false);
  });

  test("une période incluse dans l'autre chevauche", () => {
    assert.equal(periodesSeChevauchent(d(1), d(30), d(10), d(12)), true);
    assert.equal(periodesSeChevauchent(d(10), d(12), d(1), d(30)), true);
  });

  test("une période identique chevauche", () => {
    assert.equal(periodesSeChevauchent(d(10), d(15), d(10), d(15)), true);
  });

  test("une mission d'un jour chevauche une période qui la contient", () => {
    assert.equal(periodesSeChevauchent(d(12), d(12), d(10), d(15)), true);
  });
});

// ---------------------------------------------------------------------------
// Statuts et mentions
// ---------------------------------------------------------------------------

describe("Les cinq statuts", () => {
  test("les cinq sont connus, et rien d'autre", () => {
    // ⚠️ `types/om.ts` n'en connaissait que trois : `REFUSE` et `EXPIRE`
    // produisaient un badge SANS STYLE, donc l'état le plus important à repérer
    // était le moins visible.
    assert.equal(STATUTS_PARTICIPATION.length, 5);
    for (const s of ["EN_ATTENTE", "CONFIRME", "ANNULE", "REFUSE", "EXPIRE"]) {
      assert.ok(estStatutParticipation(s), `${s} devrait être reconnu`);
    }
    assert.equal(estStatutParticipation("VALIDE"), false);
    assert.equal(estStatutParticipation(""), false);
  });

  test("un statut inconnu garde son code brut plutôt que de disparaître", () => {
    assert.equal(libelleStatutParticipation("INVENTE"), "INVENTE");
    assert.equal(libelleStatutParticipation("CONFIRME"), "Confirmé");
  });

  test("seuls EN_ATTENTE et CONFIRME engagent l'employé", () => {
    // Décision du 22/08/2026 : `ANNULE`, `REFUSE` et `EXPIRE` ne correspondent à
    // aucun agent en déplacement. `lib/businessRules.ts` n'écartait qu'`ANNULE`,
    // parce que les deux autres n'existaient pas encore.
    assert.deepEqual([...STATUTS_ENGAGEANTS], ["EN_ATTENTE", "CONFIRME"]);
  });
});

describe("Mention portée sur le document", () => {
  test("un OM sans valeur le dit sur le papier", () => {
    assert.match(mentionStatut("REFUSE") ?? "", /SANS VALEUR/);
    assert.match(mentionStatut("EXPIRE") ?? "", /SANS VALEUR/);
    assert.match(mentionStatut("ANNULE") ?? "", /ANNULÉ/);
  });

  test("rien pour EN_ATTENTE : c'est le document destiné à la signature", () => {
    // Le restreindre empêcherait d'obtenir la signature du DG, qui est justement
    // l'étape suivante.
    assert.equal(mentionStatut("EN_ATTENTE"), null);
  });

  test("rien pour CONFIRME : la signature manuscrite fait foi", () => {
    assert.equal(mentionStatut("CONFIRME"), null);
  });

  test("le blocage l'emporte sur le statut", () => {
    // Une participation bloquée est `EN_ATTENTE` en base, mais « en attente »
    // suggérerait qu'il n'y a qu'à confirmer — alors que c'est justement impossible.
    assert.match(mentionStatut("EN_ATTENTE", { bloque: true }) ?? "", /CONFLIT DE PÉRIODE/);
    assert.match(mentionStatut("CONFIRME", { bloque: true }) ?? "", /CONFLIT DE PÉRIODE/);
  });
});

describe("Émetteur figé", () => {
  test("toujours le Directeur général, jamais l'agent qui saisit", () => {
    // Les normes de l'EDC l'exigent. Le formulaire le posait déjà en dur, mais
    // CÔTÉ NAVIGATEUR — donc modifiable par l'appelant.
    assert.equal(EMETTEUR.fonction, "Le Directeur Général");
    assert.equal(EMETTEUR.grade, null);
  });
});
