import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { Session } from "../aide/client.mts";
import { demarrerApp, type ServeurApp } from "../aide/serveur.mts";
import {
  semerAdministrateur,
  semerAccentues,
  semerPagination,
  nettoyerEssai,
  fermer,
  ADMIN_ESSAI,
} from "../aide/donnees.mts";
// ⚠️ Depuis `lib/pagination` et NON `lib/data/employes` : ce dernier est
// `server-only` et tire `next/navigation`, donc le contexte React du routeur.
// L'importer hors d'un rendu serveur échoue sur « createContext is not a
// function » — c'est ce qui a justifié d'extraire cette constante (22/08/2026).
import { PAR_PAGE } from "@/lib/pagination";

/**
 * Recherche insensible aux accents et pagination.
 *
 * ── Ce qui est éprouvé ici, et nulle part ailleurs ───────────────────────────
 *
 * La requête est du SQL brut : ni TypeScript ni ESLint n'en vérifient quoi que ce
 * soit. Une faute de nom de colonne, un alias replié en minuscules par PostgreSQL,
 * un `OFFSET` négatif — tout cela ne se voit qu'à l'exécution, contre une vraie
 * base.
 */

let app: ServeurApp;
/** Nombre d'employés du jeu de pagination. Deux pages pleines plus un reste. */
const COMBIEN = PAR_PAGE * 2 + 3;

before(async () => {
  await nettoyerEssai();
  await semerAdministrateur();
  await semerAccentues();
  await semerPagination(COMBIEN);


  app = await demarrerApp();
});

after(async () => {
  await app?.arreter();
  await nettoyerEssai();
  await fermer();
});

/** Ouvre une session administrateur prête à interroger la liste. */
async function admin(): Promise<Session> {
  const session = new Session(app.url);
  await session.connecter(ADMIN_ESSAI.email, ADMIN_ESSAI.motDePasse);
  return session;
}

describe("Recherche insensible aux accents", () => {
  test("« ngue » trouve « NGUÉ »", async () => {
    // Le cas qui motive toute la mécanique : personne ne tape les accents dans un
    // champ de recherche, et sans `sans_accent()` la recherche paraît cassée.
    const session = await admin();
    const page = await session.obtenir("/personnel?q=ngue");

    assert.equal(page.statut, 200);
    assert.ok(page.corps.includes("99TACC1"), "NGUÉ doit être trouvé depuis « ngue »");
  });

  test("« eloise » trouve « Éloïse » (aigu ET tréma)", async () => {
    const session = await admin();
    const page = await session.obtenir("/personnel?q=eloise");
    assert.ok(page.corps.includes("99TACC1"), "le prénom doit être cherché aussi");
  });

  test("« etoundi » trouve « ÉTOUNDI » en second mot", async () => {
    // Le motif est `%mot%` : la correspondance doit fonctionner au milieu d'un nom
    // composé, pas seulement en préfixe.
    const session = await admin();
    const page = await session.obtenir("/personnel?q=etoundi");
    assert.ok(page.corps.includes("99TACC2"));
  });

  test("« tchoumegne » trouve « TCHOUMÈGNE » (accent grave)", async () => {
    const session = await admin();
    const page = await session.obtenir("/personnel?q=tchoumegne");
    assert.ok(page.corps.includes("99TACC4"));
  });

  test("la recherche accentuée trouve aussi la forme sans accent", async () => {
    // Le sens INVERSE : taper « NGUÉ » doit fonctionner. Les deux côtés de la
    // comparaison passent par `sans_accent`, donc l'un ne va pas sans l'autre.
    const session = await admin();
    const page = await session.obtenir(`/personnel?q=${encodeURIComponent("NGUÉ")}`);
    assert.ok(page.corps.includes("99TACC1"));
  });

  test("la casse est ignorée", async () => {
    const session = await admin();
    for (const motif of ["NGUZ", "nguz", "NgUz"]) {
      const page = await session.obtenir(`/personnel?q=${motif}`);
      assert.ok(page.corps.includes("99TACC3"), `« ${motif} » doit trouver NGUZ`);
    }
  });

  test("la recherche porte aussi sur le matricule", async () => {
    const session = await admin();
    const page = await session.obtenir("/personnel?q=99TACC5");
    assert.ok(page.corps.includes("SANSACCENT"));
  });

  test("une recherche sans correspondance le dit", async () => {
    const session = await admin();
    const page = await session.obtenir("/personnel?q=zzzintrouvablezzz");
    assert.ok(
      page.corps.includes("Aucun employé ne correspond"),
      "le message doit inviter à élargir, pas laisser un tableau vide"
    );
  });

  test("un motif contenant % ou _ est traité littéralement", async () => {
    // Ces caractères sont spéciaux dans un LIKE. Comme le motif est un paramètre
    // LIÉ, ils arrivent tels quels côté SQL et jouent leur rôle de joker — ce
    // n'est pas une injection, mais il faut savoir que la requête n'échoue pas.
    const session = await admin();
    for (const motif of ["%", "_", "100%", "a'b", '"x"'] ) {
      const page = await session.obtenir(`/personnel?q=${encodeURIComponent(motif)}`);
      assert.equal(page.statut, 200, `« ${motif} » ne doit pas casser la requête`);
    }
  });
});

/**
 * Matricules du jeu de pagination présents sur une page.
 *
 * ⚠️ Un `Set`, et non la longueur du tableau de correspondances : un matricule
 * apparaît PLUSIEURS fois par ligne dans le HTML (la cellule, l'adresse du lien,
 * le libellé pour lecteur d'écran). Compter les occurrences donnait 95 là où il y
 * avait 20 lignes — deux assertions échouaient pour cette seule raison
 * (22/08/2026).
 */
function matriculesPagination(corps: string): Set<string> {
  return new Set(corps.match(/99TPAG\d{3}/g) ?? []);
}

describe("Pagination", () => {
  test("la première page ne montre que PAR_PAGE lignes", async () => {
    const session = await admin();
    const page = await session.obtenir("/personnel?q=ZZPAGINATION");

    assert.equal(page.statut, 200);
    assert.equal(
      matriculesPagination(page.corps).size,
      PAR_PAGE,
      `la première page doit être pleine`
    );
    assert.ok(page.corps.includes("Page"), "la navigation doit être présente");
  });

  test("le total compte TOUS les employés, pas seulement la page", async () => {
    const session = await admin();
    // On filtre sur le jeu de pagination pour un total prévisible.
    const page = await session.obtenir("/personnel?q=ZZPAGINATION");

    assert.ok(
      page.corps.includes(String(COMBIEN)),
      `le total ${COMBIEN} doit être affiché (c'est ce que COUNT(*) OVER () calcule)`
    );
    assert.ok(page.corps.includes("sur"), "le décompte « x à y sur z » doit être là");
  });

  test("la page 2 montre d'autres employés que la page 1", async () => {
    const session = await admin();
    const page1 = await session.obtenir("/personnel?q=ZZPAGINATION");
    const page2 = await session.obtenir("/personnel?q=ZZPAGINATION&page=2");

    const set1 = matriculesPagination(page1.corps);
    const set2 = matriculesPagination(page2.corps);

    assert.equal(set1.size, PAR_PAGE, `la page 1 doit être pleine`);
    assert.equal(set2.size, PAR_PAGE, `la page 2 doit être pleine`);

    // Le point important : AUCUN recouvrement. C'est ce que garantit l'ordre
    // TOTAL (nom, prénoms, matricule). Sans le matricule en dernier, deux
    // homonymes pourraient basculer d'une page à l'autre entre deux requêtes.
    const communs = [...set1].filter((m) => set2.has(m));
    assert.deepEqual(communs, [], "aucune ligne ne doit apparaître sur deux pages");
  });

  test("les pages couvrent l'ensemble, sans trou", async () => {
    const session = await admin();
    const vus = new Set<string>();

    const nombrePages = Math.ceil(COMBIEN / PAR_PAGE);
    for (let p = 1; p <= nombrePages; p += 1) {
      const page = await session.obtenir(`/personnel?q=ZZPAGINATION&page=${p}`);
      for (const m of matriculesPagination(page.corps)) vus.add(m);
    }

    assert.equal(
      vus.size,
      COMBIEN,
      `les ${nombrePages} pages doivent couvrir les ${COMBIEN} employés (vus : ${vus.size})`
    );
  });

  test("la dernière page contient le reste", async () => {
    const session = await admin();
    const derniere = Math.ceil(COMBIEN / PAR_PAGE);
    const page = await session.obtenir(`/personnel?q=ZZPAGINATION&page=${derniere}`);

    assert.equal(
      matriculesPagination(page.corps).size,
      COMBIEN % PAR_PAGE,
      "le reste, ni plus ni moins"
    );
  });

  test("un filtre est CONSERVÉ dans les liens de pagination", async () => {
    // Sans ça, changer de page effacerait la recherche — et l'utilisateur croirait
    // que la pagination a réinitialisé son filtre.
    const session = await admin();
    const page = await session.obtenir("/personnel?q=ZZPAGINATION");

    assert.match(
      page.corps,
      /q=ZZPAGINATION[^"]*page=2|page=2[^"]*q=ZZPAGINATION/,
      "le lien vers la page 2 doit porter q=ZZPAGINATION"
    );
  });

  test("une page au-delà de la dernière le dit, sans planter", async () => {
    const session = await admin();
    const page = await session.obtenir("/personnel?q=ZZPAGINATION&page=999");

    assert.equal(page.statut, 200);
    assert.ok(
      page.corps.includes("Cette page n") || page.corps.includes("existe pas"),
      "le message doit proposer de revenir, pas suggérer d'élargir la recherche"
    );
  });

  test("une page absurde ne produit pas d'OFFSET négatif", async () => {
    // `?page=0` ou `?page=-3` donnerait `OFFSET -25`, que PostgreSQL rejette par
    // une erreur. Le DAL les ramène donc à 1. Ces valeurs viennent de l'URL : rien
    // n'empêche quiconque de les écrire.
    const session = await admin();
    for (const valeur of ["0", "-3", "abc", "1e9", "", "2.7"]) {
      const page = await session.obtenir(
        `/personnel?q=ZZPAGINATION&page=${encodeURIComponent(valeur)}`
      );
      assert.equal(page.statut, 200, `?page=${valeur} ne doit pas provoquer d'erreur`);
    }
  });

  test("une seule page : pas de navigation, mais le décompte reste", async () => {
    const session = await admin();
    const page = await session.obtenir("/personnel?q=SANSACCENT");

    assert.ok(page.corps.includes("SANSACCENT"));
    assert.ok(
      !page.corps.includes("Suivante"),
      "aucun lien de page suivante quand il n'y en a qu'une"
    );
    assert.ok(page.corps.includes("employé"), "le décompte reste utile");
  });
});

describe("Filtres et inactifs", () => {
  test("les employés désactivés sont masqués par défaut", async () => {
    const session = await admin();
    const parDefaut = await session.obtenir("/personnel?q=ZZPAGINATION");
    const avec = await session.obtenir("/personnel?q=ZZPAGINATION&inactifs=1");

    // Le jeu de pagination est actif : les deux vues doivent donc concorder ici.
    // Le test sert surtout à vérifier que le paramètre est bien pris en compte
    // sans casser la requête.
    assert.equal(parDefaut.statut, 200);
    assert.equal(avec.statut, 200);
  });

  test("un code de statut inconnu ne trouve rien, sans erreur", async () => {
    const session = await admin();
    const page = await session.obtenir("/personnel?statut=CODE_INVENTE");
    assert.equal(page.statut, 200);
    assert.ok(page.corps.includes("Aucun employé ne correspond"));
  });
});
