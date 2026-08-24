import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ulid } from "ulid";
import PizZip from "pizzip";

import { Session, contient, idAction, pageContient } from "../aide/client.mts";
import { demarrerApp, type ServeurApp } from "../aide/serveur.mts";
import {
  ADMIN_ESSAI,
  DOMAINE_ESSAI,
  fermer,
  nettoyerEssai,
  prisma,
  semerAccentues,
  semerAdministrateur,
  semerCompteEmploye,
  semerEmploye,
  semerPagination,
} from "../aide/donnees.mts";
import { decomposerNumero, PAR_PAGE_OM } from "@/lib/numeroOM";
import { estRecouvrementPlage } from "@/lib/data/plagesNumero";

/**
 * Étape 8 — ordres de mission, contre le vrai serveur et la vraie base.
 *
 * ── Ce que seul le bout en bout peut prouver ─────────────────────────────────
 *
 * `tests/om.test.mts` couvre les fonctions pures. Tout le reste de l'étape 8 est
 * de l'**état** : un numéro n'est définitif que parce qu'un curseur a avancé en
 * base, un conflit n'existe que par rapport aux lignes déjà écrites, et une garde
 * ne protège que si elle résiste à une sollicitation directe de l'action. Aucune
 * de ces trois choses ne se teste sans serveur ni base.
 *
 * C'est aussi le seul niveau où la régression que l'étape 8 corrige serait visible :
 * `verifierConcurrence` lisait `localStorage`, donc **un navigateur**. Deux postes
 * créaient deux OM confirmés sur la même période sans qu'aucun avertissement
 * n'apparaisse. Un test unitaire de `periodesSeChevauchent` aurait passé au vert
 * pendant tout ce temps.
 *
 * ── ⚠️ Ne JAMAIS importer `lib/data/om.ts` ici ───────────────────────────────
 *
 * Il tire `lib/auth/garde`, donc `next/navigation` : importé hors d'un rendu
 * serveur, l'import échoue sur « createContext is not a function ». C'est pourquoi
 * la péremption est déclenchée en se **connectant** — le balayage tourne dans
 * `after(perimerOMEchus)`, lib/auth/actions.ts — puis constatée en interrogeant la
 * base, jamais en appelant `perimerParticipationsEchues()` directement.
 *
 * `lib/data/plagesNumero.ts` est en revanche sûr : il n'importe aucune garde, d'où
 * `estRecouvrementPlage` pour prouver la contrainte d'exclusion.
 *
 * ── Les créations passent par `appelerAction` ────────────────────────────────
 *
 * Le formulaire d'enregistrement n'existe qu'à l'étape « aperçu » d'un composant
 * client : il n'y a aucun champ caché à recopier dans le HTML initial. On sollicite
 * donc l'action directement — ce qui a un second mérite : c'est exactement la
 * menace décrite par la doc Next (« Server Functions are reachable via direct POST
 * requests »), donc exactement ce qu'un test de garde doit reproduire.
 */

let app: ServeurApp;

/** Identifiants `Next-Action`, résolus après compilation. */
let ID_CREER = "";
let ID_CONFIRMER = "";
let ID_ANNULER = "";
let ID_REFUSER = "";

/** Les trois agents de la mission type. Le premier sert de pivot aux conflits. */
const M1 = "99TOM1";
const M2 = "99TOM2";
const M3 = "99TOM3";
/** Désactivé : la création doit le refuser. */
const MX = "99TOMX";
/** Né en 1950, donc au-delà de l'âge de retraite configuré (60 ans). */
const MR = "99TOMR";

/** Compte non administrateur rattaché à `M3`. C'est lui qui éprouve les gardes. */
let AGENT = { email: "", motDePasse: "", matricule: "" };

/** Participants du jeu de pagination : une pleine page et un reste. */
const COMBIEN_PAGINATION = PAR_PAGE_OM + 3;

before(async () => {
  await nettoyerEssai();
  await semerAdministrateur();

  await semerEmploye({ matricule: M1, nom: "NKOLO", prenoms: "Jean" });
  await semerEmploye({ matricule: M2, nom: "MBALLA", prenoms: "Alice" });
  await semerEmploye({ matricule: M3, nom: "ATANGANA", prenoms: "Paul" });
  await semerEmploye({ matricule: MX, nom: "SORTI", prenoms: "Bertrand", actif: false });
  await semerEmploye({
    matricule: MR,
    nom: "ANCIEN",
    prenoms: "Étienne",
    dateNaissance: new Date(Date.UTC(1950, 2, 4)),
  });
  AGENT = await semerCompteEmploye(M3);

  await semerAccentues();
  await semerPagination(COMBIEN_PAGINATION);

  app = await demarrerApp();

  // APRÈS `demarrerApp` : `idAction` lit le répertoire de compilation, qui n'existe
  // qu'une fois `next build` terminé.
  [ID_CREER, ID_CONFIRMER, ID_ANNULER, ID_REFUSER] = await Promise.all([
    idAction("actionCreerOM"),
    idAction("actionConfirmerOM"),
    idAction("actionAnnulerOM"),
    idAction("actionRefuserOM"),
  ]);
});

after(async () => {
  await app?.arreter();
  await nettoyerEssai();
  await fermer();
});

// ---------------------------------------------------------------------------
// Outils du fichier
// ---------------------------------------------------------------------------

async function admin(): Promise<Session> {
  const session = new Session(app.url);
  await session.connecter(ADMIN_ESSAI.email, ADMIN_ESSAI.motDePasse);
  return session;
}

async function agent(): Promise<Session> {
  const session = new Session(app.url);
  await session.connecter(AGENT.email, AGENT.motDePasse);
  return session;
}

/**
 * Date `AAAA-MM-JJ` décalée de `jours`, en heure **locale**.
 *
 * Pas `toISOString().slice(0, 10)`, qui est la date UTC : entre minuit et 1 h au
 * Cameroun (UTC+1) elle renvoie la veille, et `validerOM` refuserait alors un
 * départ « aujourd'hui » comme étant dans le passé. C'est le défaut que l'étape 8
 * corrige dans le code ; le reproduire ici rendrait la suite rouge une nuit sur
 * vingt-quatre, sans qu'on ait rien changé.
 */
function jour(jours: number): string {
  const date = new Date();
  date.setDate(date.getDate() + jours);
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const quantieme = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mois}-${quantieme}`;
}

/**
 * Une période d'essai à soi, disjointe de toutes les autres.
 *
 * ── Pourquoi ce n'est pas un luxe ────────────────────────────────────────────
 *
 * Un test qui confirme une participation laisse un OM `CONFIRME` en base pour de
 * bon. Si le test suivant réutilisait les mêmes dates, sa création échouerait sur
 * `conflitConfirme` — pour une raison qui n'a rien à voir avec lui, et le message
 * d'échec enverrait chercher très loin de la cause. Chaque appel avance donc de
 * 30 jours. Les tests de conflit, eux, redemandent volontairement la même fenêtre
 * en la gardant dans une variable.
 */
interface Fenetre {
  /** Les deux champs de formulaire, prêts à surcharger `champsOM`. */
  champs: { dateDepart: string; dateRetour: string };
  /**
   * Décalage du départ en jours. Il permet de composer des dates RELATIVES à la
   * fenêtre : un décalage écrit en dur (« jour(600) ») finit par tomber AVANT le
   * départ à mesure que les fenêtres avancent, et le test échoue alors sur « la
   * date de retour ne peut pas précéder le départ » — un refus qui n'a rien à voir
   * avec ce qu'il éprouve. Constaté le 23/08/2026.
   */
  jourDepart: number;
}

let rangFenetre = 0;
function fenetre(): Fenetre {
  rangFenetre += 1;
  const depart = 10 + rangFenetre * 30;
  return {
    champs: { dateDepart: jour(depart), dateRetour: jour(depart + 4) },
    jourDepart: depart,
  };
}

/** Champs d'un OM valide ; `surcharges` remplace ce que le test veut éprouver. */
function champsOM(
  matricules: string[],
  surcharges: Record<string, string | string[]> = {}
): Record<string, string | string[]> {
  return {
    ulid: ulid(),
    paysDestination: "Cameroun",
    villeDestination: "Yaoundé",
    viaPassage: "",
    motif: "Réunion de coordination",
    financement: "Budget EDC",
    moyenTransport: "Véhicule de service",
    ...fenetre().champs,
    lieuEmission: "Douala",
    dateEmission: jour(0),
    matricules,
    ...surcharges,
  };
}

/** Forme de `Reponse`, pour passer directement le résultat à `contient`. */
interface Creation {
  statut: number;
  emplacement: null;
  corps: string;
  redirection: string | null;
  /** Identifiant de l'OM créé, extrait de la redirection. `null` en cas de refus. */
  id: string | null;
  /** La clé d'idempotence employée, pour pouvoir la rejouer. */
  cle: string;
}

/** Sollicite `actionCreerOM` et rapporte ce qui permet d'enchaîner. */
async function creer(
  session: Session,
  matricules: string[],
  surcharges: Record<string, string | string[]> = {}
): Promise<Creation> {
  const champs = champsOM(matricules, surcharges);
  const reponse = await session.appelerAction("/om/nouveau", ID_CREER, champs);
  return {
    statut: reponse.statut,
    emplacement: null,
    corps: reponse.corps,
    redirection: reponse.redirection,
    id: /^\/om\/(\d+)/.exec(reponse.redirection ?? "")?.[1] ?? null,
    cle: String(champs.ulid),
  };
}

/** Chemin de la fiche d'un participant — celui où les actions sont rendues. */
function fiche(idOM: string, matricule: string): string {
  return `/om/${idOM}?participant=${encodeURIComponent(matricule)}`;
}

function confirmer(session: Session, idOM: string, matricule: string, motif = "") {
  return session.appelerAction(fiche(idOM, matricule), ID_CONFIRMER, {
    idOM,
    matricule,
    regularisationMotif: motif,
  });
}

function annuler(session: Session, idOM: string, matricule: string) {
  return session.appelerAction(fiche(idOM, matricule), ID_ANNULER, { idOM, matricule });
}

function refuser(session: Session, idOM: string, matricule: string, motif: string) {
  return session.appelerAction(fiche(idOM, matricule), ID_REFUSER, {
    idOM,
    matricule,
    refuseMotif: motif,
  });
}

/**
 * Numéros consommés par les comptes d'essai sur l'année courante.
 *
 * Somme de `prochain_numero − borne_min` : une plage neuve compte pour 0, une
 * plage épuisée pour sa taille entière. Les assertions portent sur des **écarts**
 * et jamais sur des valeurs absolues — le dépôt de développement porte déjà des
 * plages, et figer un numéro rendrait les tests dépendants de leur ordre.
 */
async function consommes(): Promise<number> {
  const plages = await prisma.plageNumero.findMany({
    where: {
      annee: new Date().getFullYear(),
      utilisateur: { email: { endsWith: `@${DOMAINE_ESSAI}` } },
    },
    select: { borneMin: true, prochainNumero: true },
  });
  return plages.reduce((total, p) => total + (p.prochainNumero - p.borneMin), 0);
}

function participations(idOM: string) {
  return prisma.participation.findMany({
    where: { idOrdreMission: BigInt(idOM) },
    orderBy: { matricule: "asc" },
  });
}

function participation(idOM: string, matricule: string) {
  return prisma.participation.findUniqueOrThrow({
    where: { idOrdreMission_matricule: { idOrdreMission: BigInt(idOM), matricule } },
  });
}

/**
 * Matricules des LIGNES d'une liste, lus dans les liens `?participant=`.
 *
 * ⚠️ Deux pièges que cette fonction évite :
 *
 *   1. un matricule apparaît PLUSIEURS fois par ligne (cellule, `href` du lien,
 *      libellé de lecteur d'écran) — compter les occurrences donnait 95 pour
 *      20 lignes, constaté le 22/08/2026. D'où le `Set` ;
 *   2. la barre de filtres **réaffiche le matricule demandé** dans son
 *      étiquette (« Filtré sur l'employé … »). Chercher le matricule n'importe où
 *      dans la page le trouverait donc même sans aucune ligne, et le test de
 *      cloisonnement passerait au vert en laissant la fuite ouverte. On ne lit que
 *      les liens de ligne.
 */
function matriculesDesLignes(corps: string, motif: RegExp): Set<string> {
  const trouves = new Set<string>();
  for (const occurrence of corps.matchAll(motif)) trouves.add(occurrence[1]);
  return trouves;
}

const LIGNES_OM = /\?participant=(99TOM\d)/g;
const LIGNES_PAG = /\?participant=(99TPAG\d{3})/g;
const LIGNES_ACC = /\?participant=(99TACC\d)/g;

/**
 * Attend qu'une condition sur la base devienne vraie.
 *
 * Nécessaire pour le balayage de péremption : il tourne dans `after()`, donc
 * **après** le départ de la réponse de connexion. Interroger la base
 * immédiatement lirait l'état d'avant.
 */
async function jusqua(
  condition: () => Promise<boolean>,
  quoi: string,
  essais = 40
): Promise<void> {
  for (let i = 0; i < essais; i += 1) {
    if (await condition()) return;
    await new Promise((resoudre) => setTimeout(resoudre, 250));
  }
  assert.fail(`Délai dépassé en attendant : ${quoi}`);
}

/** Identifiant du compte administrateur d'essai. */
function idAdmin() {
  return prisma.utilisateur.findUniqueOrThrow({
    where: { email: ADMIN_ESSAI.email },
    select: { id: true },
  });
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

describe("Création d'un ordre de mission", () => {
  test("un OM, N participations, N numéros distincts et consécutifs, curseur avancé de N", async () => {
    const session = await admin();
    const avant = await consommes();

    const creation = await creer(session, [M1, M2, M3]);

    assert.match(
      creation.redirection ?? "",
      /^\/om\/\d+\?cree=1$/,
      `Redirection inattendue (${creation.redirection}) — corps : ${creation.corps.slice(0, 400)}`
    );
    assert.ok(creation.id);

    const lignes = await participations(creation.id);
    assert.deepEqual(lignes.map((l) => l.matricule), [M1, M2, M3]);

    // Trois numéros DISTINCTS : c'est la décision « un numéro par participant »,
    // et ce qui justifie qu'une mission à trois agents en consomme trois.
    const numeros = lignes.map((l) => l.numeroOM);
    assert.equal(new Set(numeros).size, 3, `Numéros non distincts : ${numeros.join(", ")}`);

    const decomposes = numeros.map((n) => decomposerNumero(n));
    assert.ok(decomposes.every((d) => d !== null), `Numéros mal formés : ${numeros.join(", ")}`);
    const compteurs = decomposes.map((d) => d!.compteur).sort((a, b) => a - b);
    assert.deepEqual(
      compteurs,
      [compteurs[0], compteurs[0] + 1, compteurs[0] + 2],
      `Numéros non consécutifs : ${numeros.join(", ")}`
    );

    // L'année du numéro est celle de la CRÉATION, pas du départ : une mission 2027
    // préparée en décembre 2026 consomme un numéro 2026.
    for (const d of decomposes) assert.equal(d!.annee, new Date().getFullYear());

    assert.equal(await consommes(), avant + 3, "Le curseur n'a pas avancé d'exactement N.");

    // Un seul `ordre_mission` malgré les trois participations.
    const om = await prisma.ordreMission.findUniqueOrThrow({
      where: { id: BigInt(creation.id) },
      select: { ulid: true, codePays: true, villeDestination: true },
    });
    // ⚠️ `.trim()` : `CHAR(26)` et `CHAR(2)` sont des `bpchar`, complétés à droite.
    assert.equal(om.ulid.trim(), creation.cle);
    assert.equal(om.codePays.trim(), "CM");
    assert.equal(om.villeDestination, "Yaoundé");
  });

  test("l'instantané de l'agent et le montant du barème sont figés", async () => {
    const session = await admin();
    const creation = await creer(session, [M1]);
    assert.ok(creation.id, creation.corps.slice(0, 400));

    const ligne = await participation(creation.id, M1);

    // L'instantané n'est pas une optimisation : un OM émis en mars doit continuer
    // d'afficher « Chef de Bureau » même si l'agent est Directeur en novembre.
    assert.equal(ligne.nomS, "NKOLO");
    assert.equal(ligne.prenomsS, "Jean");
    assert.equal(ligne.gradeS, "Ingénieur");
    assert.equal(ligne.fonctionS, "CHARGÉ D'ÉTUDES");
    assert.equal(ligne.situationFamilleS, "CELIBATAIRE");
    assert.ok(ligne.codeStatutS);
    assert.ok(ligne.codeDepartementS);

    // Cameroun = zone 0. Le montant est figé, jamais recalculé à l'affichage.
    assert.equal(ligne.montantFraisFixeJournalier, 150_000);

    // L'émetteur est imposé par le SERVEUR : l'écran précédent le posait en dur
    // côté navigateur, donc modifiable par l'appelant.
    assert.equal(ligne.nomEmetteur, "EDC");
    assert.equal(ligne.fonctionEmetteur, "Le Directeur Général");
    assert.equal(ligne.gradeEmetteur, null);
    assert.equal(ligne.lieuEmission, "Douala");

    assert.equal(ligne.statut, "EN_ATTENTE");
    assert.equal(ligne.blocageMotif, null);
  });

  test("rejouer le même ULID ne crée pas de doublon et ne brûle aucun numéro", async () => {
    const session = await admin();
    const champs = champsOM([M1, M2]);

    const premier = await session.appelerAction("/om/nouveau", ID_CREER, champs);
    const idOM = /^\/om\/(\d+)/.exec(premier.redirection ?? "")?.[1];
    assert.ok(idOM, `Première création refusée : ${premier.corps.slice(0, 400)}`);

    const apresPremier = await consommes();
    const numerosInitiaux = (await participations(idOM)).map((l) => l.numeroOM);

    // Le MÊME corps, comme un double-clic ou une reprise après coupure.
    const second = await session.appelerAction("/om/nouveau", ID_CREER, champs);

    assert.equal(second.redirection, `/om/${idOM}?cree=existant`);
    assert.equal(await prisma.ordreMission.count({ where: { ulid: String(champs.ulid) } }), 1);
    assert.equal(await consommes(), apresPremier, "Le second envoi a consommé un numéro.");
    assert.deepEqual((await participations(idOM)).map((l) => l.numeroOM), numerosInitiaux);

    // La fiche le DIT, sinon l'utilisateur croit avoir créé deux OM.
    const page = await session.obtenir(`/om/${idOM}?cree=existant`);
    assert.ok(
      pageContient(page, "avait déjà été enregistré"),
      "La fiche ne signale pas que le second envoi était un doublon."
    );
  });

  test("les cinq colonnes NOT NULL que rien ne validait sont refusées côté serveur", async () => {
    const session = await admin();
    const avant = await consommes();

    // Une par une : un message groupé ne dirait pas où corriger.
    const cas: [Record<string, string>, string][] = [
      [{ motif: "   " }, "Le motif de la mission est obligatoire"],
      [{ villeDestination: "" }, "La ville de destination est obligatoire"],
      [{ paysDestination: "" }, "Le pays de destination est obligatoire"],
      [{ lieuEmission: "" }, "Le lieu d'émission est obligatoire"],
      [{ dateEmission: "" }, "Date d'émission obligatoire"],
    ];

    for (const [surcharge, attendu] of cas) {
      const nom = Object.keys(surcharge)[0];
      const creation = await creer(session, [M1], surcharge);
      assert.equal(creation.redirection, null, `${nom} : la création a abouti.`);
      assert.ok(
        contient(creation, attendu),
        `${nom} : « ${attendu} » absent de la réponse — ${creation.corps.slice(0, 300)}`
      );
    }

    assert.equal(await consommes(), avant, "Un refus de validation a consommé un numéro.");
  });

  test("refuse une saisie sans participant, un doublon, un départ passé et des dates inversées", async () => {
    const session = await admin();

    const sans = await creer(session, []);
    assert.equal(sans.redirection, null);
    assert.ok(contient(sans, "Au moins un participant est requis"));

    const double = await creer(session, [M1, M1]);
    assert.equal(double.redirection, null);
    assert.ok(contient(double, "Un même employé figure plusieurs fois"));

    const passe = await creer(session, [M1], { dateDepart: jour(-1), dateRetour: jour(3) });
    assert.equal(passe.redirection, null);
    assert.ok(contient(passe, "La date de départ ne peut pas être dans le passé"));

    const inverse = await creer(session, [M1], { dateDepart: jour(40), dateRetour: jour(38) });
    assert.equal(inverse.redirection, null);
    assert.ok(contient(inverse, "La date de retour ne peut pas précéder le départ"));
  });

  test("refuse un désactivé, un retraité, un matricule inconnu, un pays hors référentiel — sans brûler de numéro", async () => {
    const session = await admin();
    const avant = await consommes();
    const omAvant = await prisma.ordreMission.count();

    const inactif = await creer(session, [M1, MX]);
    assert.equal(inactif.redirection, null);
    assert.ok(
      contient(inactif, "Un des participants est désactivé"),
      `Désactivé : message absent — ${inactif.corps.slice(0, 300)}`
    );

    // ⚠️ L'âge est apprécié à la date de RETOUR : un agent qui atteint l'âge
    // pendant la mission passait l'ancien contrôle et se retrouvait en
    // déplacement pour l'EDC après avoir quitté le service.
    const retraite = await creer(session, [MR]);
    assert.equal(retraite.redirection, null);
    assert.ok(
      contient(retraite, "atteint l'âge de la retraite"),
      `Retraité : message absent — ${retraite.corps.slice(0, 300)}`
    );

    const inconnu = await creer(session, ["99TFANTOME"]);
    assert.equal(inconnu.redirection, null);
    assert.ok(
      contient(inconnu, "n'existe pas au fichier du personnel"),
      `Matricule inconnu : message absent — ${inconnu.corps.slice(0, 300)}`
    );

    const pays = await creer(session, [M1], { paysDestination: "Wakanda" });
    assert.equal(pays.redirection, null);
    assert.ok(
      contient(pays, "Ce pays n'est pas au référentiel"),
      `Pays inconnu : message absent — ${pays.corps.slice(0, 300)}`
    );

    // Le point qui compte : quatre refus, zéro numéro brûlé et zéro OM écrit. Un
    // numéro consommé pour rien serait un trou dans une série auditée.
    assert.equal(await consommes(), avant);
    assert.equal(await prisma.ordreMission.count(), omAvant);
  });

  test("un simple utilisateur peut créer un OM, y compris pour un collègue", async () => {
    // Décision du 22/08/2026 : la création est ouverte à tout compte authentifié ;
    // ce sont les CONFIRMATIONS qui sont réservées à l'administrateur.
    const session = await agent();
    const creation = await creer(session, [M1]);

    assert.match(
      creation.redirection ?? "",
      /^\/om\/\d+\?cree=1$/,
      `Un utilisateur ordinaire n'a pas pu créer : ${creation.corps.slice(0, 400)}`
    );
  });

  test("un visiteur non connecté n'écrit rien, même en sollicitant l'action directement", async () => {
    const visiteur = new Session(app.url);
    const champs = champsOM([M1]);

    const reponse = await visiteur.appelerAction("/om/nouveau", ID_CREER, champs);

    assert.equal(
      await prisma.ordreMission.count({ where: { ulid: String(champs.ulid) } }),
      0,
      "Une action sollicitée sans session a écrit en base."
    );
    assert.ok(
      !/^\/om\/\d+/.test(reponse.redirection ?? ""),
      `Une création anonyme a redirigé vers ${reponse.redirection}.`
    );
  });
});

// ---------------------------------------------------------------------------
// Numérotation par plages
// ---------------------------------------------------------------------------

describe("Numérotation par plages réservées", () => {
  test("une plage trop petite est rechargée dans la même transaction", async () => {
    // Repris du premier jet de ce fichier : abaisser `taille_plage_numero` est le
    // moyen le plus direct de forcer le rechargement, et il éprouve du même coup
    // le cas « mission à cheval sur deux plages ».
    const configuration = await prisma.configuration.findUniqueOrThrow({ where: { id: 1 } });
    const annee = new Date().getFullYear();
    const { id: idUtilisateur } = await idAdmin();

    try {
      await prisma.configuration.update({ where: { id: 1 }, data: { taillePlageNumero: 2 } });

      // Les plages ouvertes existantes sont plus grandes que 2 : on les épuise
      // pour que la création soit obligée d'en réserver de neuves à la taille 2.
      await prisma.$executeRaw`
        UPDATE plage_numero SET prochain_numero = borne_max + 1
        WHERE annee = ${annee} AND id_utilisateur = ${idUtilisateur}
      `;

      const plagesAvant = await prisma.plageNumero.count({
        where: { annee, idUtilisateur },
      });

      const session = await admin();
      const creation = await creer(session, [M1, M2, M3]);
      assert.ok(creation.id, `Création refusée : ${creation.corps.slice(0, 400)}`);

      const numeros = (await participations(creation.id)).map((l) => l.numeroOM);
      assert.equal(numeros.length, 3);
      assert.equal(new Set(numeros).size, 3, `Numéros non distincts : ${numeros.join(", ")}`);

      const plagesApres = await prisma.plageNumero.count({ where: { annee, idUtilisateur } });
      assert.ok(
        plagesApres >= plagesAvant + 2,
        `Trois numéros par lots de deux exigent au moins deux plages neuves : ${plagesAvant} → ${plagesApres}`
      );

      // Les numéros d'une même mission peuvent ne PAS être consécutifs quand la
      // plage est à cheval — sans importance : chaque participant reçoit SON
      // document avec SON numéro, la mission n'a pas de numéro propre.
      const compteurs = numeros
        .map((n) => decomposerNumero(n)?.compteur)
        .filter((c): c is number => c !== undefined);
      assert.equal(compteurs.length, 3, `Numéros mal formés : ${numeros.join(", ")}`);
    } finally {
      await prisma.configuration.update({
        where: { id: 1 },
        data: { taillePlageNumero: configuration.taillePlageNumero },
      });
    }
  });

  test("`prochain_numero = borne_max + 1` marque bien l'épuisement", async () => {
    const session = await admin();
    const annee = new Date().getFullYear();
    const { id: idUtilisateur } = await idAdmin();

    // Une création garantit qu'au moins une plage existe pour ce compte.
    assert.ok((await creer(session, [M1])).id);

    // Toutes les plages du compte sont marquées épuisées…
    await prisma.$executeRaw`
      UPDATE plage_numero SET prochain_numero = borne_max + 1
      WHERE annee = ${annee} AND id_utilisateur = ${idUtilisateur}
    `;

    // …puis on en réserve une NEUVE d'un seul numéro, après la dernière borne de
    // l'année. C'est la seule encore ouverte, donc `consommerNumeros` la prendra.
    //
    // ⚠️ Ne PAS « rouvrir » une plage existante en ramenant son curseur à
    // `borne_max` : sur une plage déjà épuisée, cela rembobine d'un cran et réémet
    // un numéro DÉJÀ attribué. L'`UNIQUE` sur `numero_om` le refuse — c'est le
    // filet annoncé par `consommerNumeros` et il fonctionne — mais la transaction
    // annulée laisse le curseur rembobiné, si bien que TOUTES les créations
    // suivantes échouent sur le même numéro. Constaté le 23/08/2026 : un seul test
    // mal outillé rendait rouge tout le reste du fichier.
    const [{ maximum }] = await prisma.$queryRaw<{ maximum: number | null }[]>`
      SELECT MAX(borne_max) AS maximum FROM plage_numero WHERE annee = ${annee}
    `;
    const seul = (maximum ?? 0) + 1;
    const solo = await prisma.plageNumero.create({
      data: { annee, idUtilisateur, borneMin: seul, borneMax: seul, prochainNumero: seul },
      select: { id: true },
    });

    // Deux numéros demandés, un seul disponible : la plage doit finir épuisée et
    // une neuve fournir le second.
    const creation = await creer(session, [M1, M2]);
    assert.ok(creation.id, `Création refusée : ${creation.corps.slice(0, 400)}`);

    const numeros = (await participations(creation.id)).map((l) => l.numeroOM);
    assert.equal(numeros.length, 2);
    const compteurs = numeros
      .map((n) => decomposerNumero(n)?.compteur)
      .filter((c): c is number => c !== undefined)
      .sort((a, b) => a - b);
    assert.deepEqual(
      compteurs,
      [seul, seul + 1],
      `La mission à cheval n'a pas repris à la borne suivante : ${numeros.join(", ")}`
    );

    const epuisee = await prisma.plageNumero.findUniqueOrThrow({
      where: { id: solo.id },
      select: { borneMax: true, prochainNumero: true },
    });
    assert.equal(
      epuisee.prochainNumero,
      epuisee.borneMax + 1,
      "Une plage consommée jusqu'au bout n'est pas marquée épuisée."
    );
  });

  test("la contrainte d'exclusion interdit deux plages recouvrantes, mais accepte deux plages jointives", async () => {
    const session = await admin();
    assert.ok((await creer(session, [M1])).id);

    const annee = new Date().getFullYear();
    const { id: idUtilisateur } = await idAdmin();
    const existante = await prisma.plageNumero.findFirstOrThrow({
      where: { annee, idUtilisateur },
      orderBy: { borneMin: "asc" },
    });

    // ⚠️ Prisma ne remonte PAS `23P01` en `P2002` : sans détecteur dédié, cette
    // erreur passerait pour une panne quelconque et `avecReessaiPlage` ne
    // réessaierait pas.
    let capturee: unknown = null;
    try {
      await prisma.plageNumero.create({
        data: {
          annee,
          idUtilisateur,
          borneMin: existante.borneMin,
          borneMax: existante.borneMax,
          prochainNumero: existante.borneMin,
        },
      });
    } catch (erreur) {
      capturee = erreur;
    }
    assert.ok(capturee, "Une plage recouvrante a été acceptée : l'EXCLUDE ne protège rien.");
    assert.ok(
      estRecouvrementPlage(capturee),
      `Erreur non reconnue comme recouvrement de plages : ${String(capturee).slice(0, 300)}`
    );

    // Deux plages qui se TOUCHENT restent permises : c'est tout le sens du
    // `borne_max + 1` d'`int4range`, sans quoi 1-50 et 51-100 seraient refusées.
    const [{ maximum }] = await prisma.$queryRaw<{ maximum: number | null }[]>`
      SELECT MAX(borne_max) AS maximum FROM plage_numero WHERE annee = ${annee}
    `;
    const debut = (maximum ?? 0) + 1;
    let posees: bigint[] = [];
    try {
      const basse = await prisma.plageNumero.create({
        data: { annee, idUtilisateur, borneMin: debut, borneMax: debut + 4, prochainNumero: debut },
        select: { id: true },
      });
      const haute = await prisma.plageNumero.create({
        data: {
          annee,
          idUtilisateur,
          borneMin: debut + 5,
          borneMax: debut + 9,
          prochainNumero: debut + 5,
        },
        select: { id: true },
      });
      posees = [basse.id, haute.id];
      assert.equal(posees.length, 2, "Deux plages jointives ont été refusées.");
    } finally {
      // Sans ce nettoyage, `MAX(borne_max)` resterait poussé vers l'avant et les
      // tests suivants réserveraient toujours plus loin dans l'année.
      if (posees.length > 0) {
        await prisma.plageNumero.deleteMany({ where: { id: { in: posees } } });
      }
    }
  });

  test("deux créations simultanées obtiennent des numéros différents", async () => {
    const session = await admin();

    // Deux agents et deux périodes distincts : rien ne doit se jouer sur le
    // conflit, tout doit se jouer sur le verrou `FOR UPDATE` du curseur.
    const [gauche, droite] = await Promise.all([creer(session, [M1]), creer(session, [M2])]);

    assert.ok(gauche.id, `Création gauche refusée : ${gauche.corps.slice(0, 300)}`);
    assert.ok(droite.id, `Création droite refusée : ${droite.corps.slice(0, 300)}`);
    assert.notEqual(gauche.id, droite.id);

    const numeros = [
      ...(await participations(gauche.id)).map((l) => l.numeroOM),
      ...(await participations(droite.id)).map((l) => l.numeroOM),
    ];
    assert.equal(
      new Set(numeros).size,
      2,
      `Deux créations concurrentes ont produit le même numéro : ${numeros.join(", ")}`
    );
  });
});

// ---------------------------------------------------------------------------
// Conflits de période
// ---------------------------------------------------------------------------

describe("Détection de conflit de période", () => {
  test("un chevauchement avec un OM CONFIRMÉ refuse TOUTE la création, sans consommer de numéro", async () => {
    // ⚠️ Divergence assumée avec le texte du plan, qui décrivait une création
    // acceptée avec `blocage_motif` posé sur le seul participant en conflit. La
    // règle arbitrée le 23/08/2026 est plus stricte à la création : un agent déjà
    // engagé par une pièce signée ne peut pas partir ailleurs, donc la mission
    // n'est pas enregistrée du tout. Le blocage nominatif existe toujours, mais il
    // est DIFFÉRÉ à la confirmation d'un concurrent (test suivant).
    const session = await admin();
    const periode = fenetre();

    const premier = await creer(session, [M1], periode.champs);
    assert.ok(premier.id, `Première création refusée : ${premier.corps.slice(0, 300)}`);
    assert.ok(
      contient(await confirmer(session, premier.id, M1), "Participation confirmée."),
      "La confirmation du premier OM a échoué."
    );

    const avant = await consommes();
    const omAvant = await prisma.ordreMission.count();

    const second = await creer(session, [M1, M2], {
      dateDepart: periode.champs.dateDepart,
      dateRetour: periode.champs.dateRetour,
    });

    assert.equal(second.redirection, null, "Un conflit confirmé n'a pas empêché la création.");
    assert.ok(
      contient(second, "déjà engagé sur une mission CONFIRMÉE"),
      `Message de conflit absent : ${second.corps.slice(0, 400)}`
    );

    // « Rien n'a été enregistré et aucun numéro n'a été consommé » : le message le
    // promet à l'utilisateur, donc le test le vérifie.
    assert.equal(await consommes(), avant);
    assert.equal(await prisma.ordreMission.count(), omAvant);
  });

  test("les bornes sont inclusives : un retour le J et un départ le J se chevauchent", async () => {
    const session = await admin();
    const periode = fenetre();

    const premier = await creer(session, [M2], periode.champs);
    assert.ok(premier.id, `Première création refusée : ${premier.corps.slice(0, 300)}`);
    assert.ok(contient(await confirmer(session, premier.id, M2), "Participation confirmée."));

    // Départ exactement le jour du retour précédent. Décision du 22/08/2026 :
    // l'intervalle est FERMÉ des deux côtés, cohérent avec `dureeEnJours` — une
    // mission d'un seul jour dure un jour, pas zéro. Une borne ouverte laisserait
    // passer un agent parti le matin de son retour de mission.
    const second = await creer(session, [M2], {
      dateDepart: periode.champs.dateRetour,
      dateRetour: jour(periode.jourDepart + 8),
    });
    assert.equal(second.redirection, null, "Les bornes ne sont pas traitées comme inclusives.");
    assert.ok(
      contient(second, "déjà engagé sur une mission CONFIRMÉE"),
      `Refus pour un autre motif que le conflit : ${second.corps.slice(0, 600)}`
    );

    // Et le LENDEMAIN du retour passe : la borne est inclusive, pas élargie. Sans
    // cette moitié, l'assertion précédente serait aussi satisfaite par une règle
    // trop large, qui interdirait de repartir le jour suivant.
    const lendemain = await creer(session, [M2], {
      dateDepart: jour(periode.jourDepart + 5),
      dateRetour: jour(periode.jourDepart + 8),
    });
    assert.match(
      lendemain.redirection ?? "",
      /^\/om\/\d+\?cree=1$/,
      `Un départ le lendemain du retour est refusé : ${lendemain.corps.slice(0, 400)}`
    );
  });

  test("un chevauchement avec un OM EN ATTENTE avertit sans bloquer, et notifie", async () => {
    const session = await admin();
    const periode = fenetre();

    const premier = await creer(session, [M1], periode.champs);
    assert.ok(premier.id, `Première création refusée : ${premier.corps.slice(0, 300)}`);

    const second = await creer(session, [M1], periode.champs);
    assert.ok(second.id, `Le second OM a été refusé : ${second.corps.slice(0, 400)}`);

    // Aucun des deux n'est confirmé : rien n'est décidé, donc rien n'est bloqué.
    // Refuser ici empêcherait l'administrateur de préparer deux hypothèses.
    assert.match(
      second.redirection ?? "",
      /^\/om\/\d+\?cree=1&conflits=1$/,
      `Le chevauchement en attente n'est pas signalé : ${second.redirection}`
    );
    assert.equal((await participation(second.id, M1)).blocageMotif, null);
    assert.equal((await participation(premier.id, M1)).blocageMotif, null);

    const page = await session.obtenir(second.redirection!);
    assert.ok(
      pageContient(page, "chevauchement"),
      "La fiche ne montre pas l'avertissement de chevauchement."
    );

    // Sans notification, le conflit se découvrirait à la confirmation, une fois le
    // papier signé — c'est précisément ce que la spécification veut éviter.
    assert.ok(
      (await prisma.notification.count({
        where: { type: "OM_EN_CONFLIT", destinataire: { email: ADMIN_ESSAI.email } },
      })) > 0,
      "Aucune notification OM_EN_CONFLIT n'a été écrite."
    );
  });

  test("confirmer l'un des deux bloque le concurrent POUR CET AGENT SEULEMENT", async () => {
    // Le point le plus important de l'étape 8 : le blocage est nominatif. Une
    // mission à plusieurs agents dont un seul est en conflit doit rester utilisable
    // pour les autres.
    const session = await admin();
    const periode = fenetre();

    const gagnant = await creer(session, [M1, M2], periode.champs);
    assert.ok(gagnant.id, `Création du gagnant refusée : ${gagnant.corps.slice(0, 300)}`);
    const perdant = await creer(session, [M1, M3], periode.champs);
    assert.ok(perdant.id, `Création du perdant refusée : ${perdant.corps.slice(0, 300)}`);

    assert.ok(
      contient(await confirmer(session, gagnant.id, M1), "Participation confirmée."),
      "La confirmation du gagnant a échoué."
    );

    const bloquee = await participation(perdant.id, M1);
    assert.ok(
      bloquee.blocageMotif,
      "Le concurrent n'a pas été bloqué : le blocage différé ne fonctionne pas."
    );
    assert.match(bloquee.blocageMotif, /Conflit de période/);
    assert.ok(bloquee.blocageDetecteLe, "`blocage_detecte_le` n'est pas renseigné.");
    assert.equal(
      bloquee.statut,
      "EN_ATTENTE",
      "Le blocage a changé le statut, ce qu'il ne doit pas faire."
    );

    // ── Et les autres passent ──────────────────────────────────────────────
    assert.equal(
      (await participation(perdant.id, M3)).blocageMotif,
      null,
      "Un participant sans conflit a été bloqué avec son collègue."
    );
    assert.equal((await participation(gagnant.id, M2)).blocageMotif, null);

    // La fiche explique le blocage : un bouton « Confirmer » grisé sans raison
    // apparente n'apprend rien à l'administrateur.
    const page = await session.obtenir(fiche(perdant.id, M1));
    assert.ok(
      pageContient(page, "Confirmation impossible."),
      "La fiche n'explique pas pourquoi la confirmation est impossible."
    );

    const refus = await confirmer(session, perdant.id, M1);
    assert.ok(
      contient(refus, "déjà engagé sur une mission CONFIRMÉE") ||
        contient(refus, "changé entre-temps"),
      `La confirmation d'une participation bloquée n'a pas été refusée : ${refus.corps.slice(0, 400)}`
    );
    assert.equal((await participation(perdant.id, M1)).statut, "EN_ATTENTE");

    // Le collègue non bloqué, lui, reste confirmable.
    assert.ok(
      contient(await confirmer(session, perdant.id, M3), "Participation confirmée."),
      "Le participant sans conflit n'a pas pu être confirmé."
    );

    // ── L'annulation lève le blocage devenu sans objet ─────────────────────
    assert.ok(
      contient(await annuler(session, gagnant.id, M1), "Participation annulée."),
      "L'annulation du gagnant a échoué."
    );
    assert.equal(
      (await participation(perdant.id, M1)).blocageMotif,
      null,
      "Le blocage subsiste alors que la mission qui le causait est annulée."
    );
    assert.ok(
      contient(await confirmer(session, perdant.id, M1), "Participation confirmée."),
      "Le blocage levé, la participation reste inconfirmable."
    );
  });

  test("confirmer deux fois la même participation est refusé", async () => {
    const session = await admin();
    const creation = await creer(session, [M2]);
    assert.ok(creation.id, creation.corps.slice(0, 300));

    assert.ok(contient(await confirmer(session, creation.id, M2), "Participation confirmée."));

    const second = await confirmer(session, creation.id, M2);
    assert.ok(
      contient(second, "changé entre-temps") || contient(second, "déjà été traitée"),
      `Une double confirmation a été acceptée : ${second.corps.slice(0, 400)}`
    );

    const ligne = await participation(creation.id, M2);
    assert.equal(ligne.statut, "CONFIRME");
    assert.ok(ligne.confirmeLe && ligne.confirmePar);
  });
});

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

describe("Transitions d'une participation", () => {
  test("EN_ATTENTE → CONFIRME → ANNULE, avec les traces d'audit", async () => {
    // ⚠️ Divergence assumée avec le plan, qui voulait refuser l'annulation d'une
    // participation jamais confirmée. L'implémentation l'autorise depuis
    // `EN_ATTENTE`, `CONFIRME` et `EXPIRE` — c'est ce qui permet de retirer un
    // agent d'une mission préparée par erreur sans avoir à la confirmer d'abord.
    // Testé tel qu'implémenté, et signalé.
    const session = await admin();
    const creation = await creer(session, [M3]);
    assert.ok(creation.id, creation.corps.slice(0, 300));
    assert.equal((await participation(creation.id, M3)).statut, "EN_ATTENTE");

    assert.ok(contient(await confirmer(session, creation.id, M3), "Participation confirmée."));
    const confirmee = await participation(creation.id, M3);
    assert.equal(confirmee.statut, "CONFIRME");
    // Les colonnes que les CHECK `part_confirme_date` exigent.
    assert.ok(confirmee.confirmeLe, "`confirme_le` manquant.");
    assert.ok(confirmee.confirmePar, "`confirme_par` manquant.");
    assert.equal(confirmee.regularisationMotif, null);

    assert.ok(contient(await annuler(session, creation.id, M3), "Participation annulée."));
    const annulee = await participation(creation.id, M3);
    assert.equal(annulee.statut, "ANNULE");
    assert.ok(annulee.annuleLe, "`annule_le` manquant.");
    assert.ok(annulee.annulePar, "`annule_par` manquant.");
    // L'annulation n'efface pas l'historique : la confirmation reste inscrite.
    assert.ok(annulee.confirmeLe);

    const rejeu = await confirmer(session, creation.id, M3);
    assert.ok(
      contient(rejeu, "changé entre-temps") || contient(rejeu, "déjà été traitée"),
      `Un OM annulé a pu être confirmé : ${rejeu.corps.slice(0, 400)}`
    );
    assert.equal((await participation(creation.id, M3)).statut, "ANNULE");
  });

  test("un refus sans motif est refusé ; avec motif il est tracé, et REFUSE est terminal", async () => {
    const session = await admin();
    const creation = await creer(session, [M1]);
    assert.ok(creation.id, creation.corps.slice(0, 300));

    const sansMotif = await refuser(session, creation.id, M1, "   ");
    assert.ok(
      contient(sansMotif, "Le motif du refus est obligatoire"),
      `Un refus sans motif a été accepté : ${sansMotif.corps.slice(0, 400)}`
    );
    assert.equal((await participation(creation.id, M1)).statut, "EN_ATTENTE");

    const avecMotif = await refuser(session, creation.id, M1, "Mission reportée par la direction");
    assert.ok(
      contient(avecMotif, "Participation refusée."),
      `Refus motivé rejeté : ${avecMotif.corps.slice(0, 400)}`
    );

    const refusee = await participation(creation.id, M1);
    assert.equal(refusee.statut, "REFUSE");
    assert.equal(refusee.refuseMotif, "Mission reportée par la direction");
    // ⚠️ `part_refuse_motive` n'exige PAS `refuse_le` — asymétrie avec les trois
    // autres transitions, relevée à l'étape 8. C'est donc au CODE de le poser, et
    // c'est ce que cette assertion protège.
    assert.ok(refusee.refuseLe, "`refuse_le` manquant : la base ne l'impose pas, le code doit le poser.");
    assert.ok(refusee.refusePar, "`refuse_par` manquant.");

    const rejeu = await refuser(session, creation.id, M1, "Autre raison");
    assert.ok(
      contient(rejeu, "déjà été traitée") || contient(rejeu, "changé entre-temps"),
      `Un second refus a été accepté : ${rejeu.corps.slice(0, 400)}`
    );
    assert.equal(
      (await participation(creation.id, M1)).refuseMotif,
      "Mission reportée par la direction"
    );
  });

  test("un OM refusé ne produit plus aucun conflit", async () => {
    // `ANNULE`, `REFUSE` et `EXPIRE` n'engagent personne : décision du 22/08/2026
    // que la spécification ne tranchait pas. Le code d'origine n'écartait
    // qu'`ANNULE`, parce que les deux autres statuts n'existaient pas.
    const session = await admin();
    const periode = fenetre();

    const premier = await creer(session, [M2], periode.champs);
    assert.ok(premier.id, premier.corps.slice(0, 300));
    assert.ok(
      contient(await refuser(session, premier.id, M2, "Mission annulée en amont"), "Participation refusée.")
    );

    const second = await creer(session, [M2], periode.champs);
    assert.match(
      second.redirection ?? "",
      /^\/om\/\d+\?cree=1$/,
      `Un OM refusé bloque encore la période : ${second.corps.slice(0, 400)}`
    );
  });
});

// ---------------------------------------------------------------------------
// Gardes
// ---------------------------------------------------------------------------

describe("Gardes des transitions et de la lecture", () => {
  test("un simple utilisateur ne confirme, n'annule ni ne refuse — même par POST direct", async () => {
    const admineur = await admin();
    const creation = await creer(admineur, [M3]);
    assert.ok(creation.id, creation.corps.slice(0, 300));
    const idOM = creation.id;

    const session = await agent();
    const tentatives: [string, () => Promise<{ corps: string; statut: number; emplacement: string | null }>][] = [
      ["confirmation", () => confirmer(session, idOM, M3)],
      ["annulation", () => annuler(session, idOM, M3)],
      ["refus", () => refuser(session, idOM, M3, "Je refuse")],
    ];

    for (const [quoi, appel] of tentatives) {
      const reponse = await appel();
      assert.ok(
        contient(reponse, "réservée à l'administrateur"),
        `${quoi} : un utilisateur ordinaire n'a pas été refusé — ${reponse.corps.slice(0, 300)}`
      );
    }

    assert.equal(
      (await participation(idOM, M3)).statut,
      "EN_ATTENTE",
      "Une action réservée a modifié la base malgré le refus affiché."
    );
  });

  test("un agent voit TOUTES les participations, et peut filtrer sur un collègue", async () => {
    // ── Règle changée le 24/08/2026 ──────────────────────────────────────────
    //
    // La lecture était cloisonnée par matricule. Elle est ouverte à tout compte
    // authentifié, pour une raison opérationnelle : un agent doit pouvoir
    // TÉLÉCHARGER l'ordre de mission d'un collègue — c'est souvent lui qui prépare
    // le dossier de la mission, et il ne peut pas imprimer ce qu'il ne voit pas.
    //
    // Le cloisonnement subsiste là où il a du sens : le DOSSIER PERSONNEL
    // (`lireFicheEmploye`), éprouvé par `tests/e2e/recherche.test.mts`.
    const admineur = await admin();
    const sien = await creer(admineur, [M3]);
    const autre = await creer(admineur, [M1]);
    assert.ok(sien.id && autre.id);

    const session = await agent();

    // Le filtre de l'URL est honoré, y compris sur un collègue : c'est un filtre,
    // plus une restriction.
    const filtree = await session.obtenir(`/om?matricule=${M1}`);
    assert.equal(filtree.statut, 200);
    const vus = matriculesDesLignes(filtree.corps, LIGNES_OM);
    assert.ok(
      vus.has(M1),
      `Le filtre sur ${M1} ne renvoie rien pour un utilisateur ordinaire : ${[...vus].join(", ")}`
    );
    assert.deepEqual(
      [...vus].filter((m) => m !== M1),
      [],
      `Le filtre laisse passer d'autres matricules : ${[...vus].join(", ")}`
    );

    // Et sans filtre, il voit les siennes ET celles des autres.
    const toutes = matriculesDesLignes((await session.obtenir("/om")).corps, LIGNES_OM);
    assert.ok(toutes.has(M3), "L'agent ne voit pas ses propres participations.");
    assert.ok(toutes.has(M1), "L'agent ne voit pas les participations de ses collègues.");
  });

  test("un agent ouvre la fiche d'un collègue, mais n'y trouve aucun bouton d'action", async () => {
    const admineur = await admin();
    const creation = await creer(admineur, [M1]);
    assert.ok(creation.id, creation.corps.slice(0, 300));

    const session = await agent();
    const reponse = await session.obtenir(fiche(creation.id, M1));

    assert.equal(
      reponse.statut,
      200,
      `La fiche d'un collègue est refusée (statut ${reponse.statut}) : le bouton de téléchargement devient inatteignable.`
    );
    assert.ok(pageContient(reponse, "NKOLO"), "La fiche du collègue ne montre pas l'agent.");

    // ⚠️ Ce qui compte maintenant : la lecture est ouverte, l'ÉCRITURE non.
    // `BlocActions` n'est rendu que pour un administrateur, et le test précédent
    // vérifie qu'une sollicitation directe de l'action est refusée de toute façon.
    for (const bouton of ["Confirmer", "Annuler", "Refuser"]) {
      assert.ok(
        !pageContient(reponse, `>${bouton}`),
        `Le bouton « ${bouton} » est rendu pour un utilisateur ordinaire.`
      );
    }
  });

  test("une mission collective montre TOUS ses participants, y compris à un agent", async () => {
    // ── Le symptôme signalé le 24/08/2026 ────────────────────────────────────
    //
    // « Je choisis plusieurs personnes, dans l'aperçu je vois bien les 2 OM, mais
    // après enregistrement il n'y en a qu'un. » Les deux participations étaient bien
    // écrites : c'est la fiche qui filtrait la liste au seul demandeur, si bien que
    // la navigation entre participants disparaissait — et avec elle l'accès au
    // second document.
    const admineur = await admin();
    const creation = await creer(admineur, [M1, M2, M3]);
    assert.ok(creation.id, creation.corps.slice(0, 400));
    const idOM = creation.id;

    assert.equal((await participations(idOM)).length, 3, "Les trois participations ne sont pas en base.");

    const session = await agent();
    // Vue depuis SA participation : les deux collègues doivent apparaître.
    const page = await session.obtenir(fiche(idOM, M3));
    assert.equal(page.statut, 200);
    for (const autre of [M1, M2]) {
      assert.ok(
        page.corps.includes(`/om/${idOM}?participant=${autre}`),
        `Le participant ${autre} n'est pas navigable depuis la fiche de ${M3}.`
      );
    }

    // Et chacun des trois documents est effectivement téléchargeable.
    for (const qui of [M1, M2, M3]) {
      const document = await session.poster("/api/generate-om", {
        idOrdreMission: idOM,
        matricule: qui,
      });
      assert.equal(document.statut, 200, `Document de ${qui} refusé (statut ${document.statut}).`);
      assert.ok(document.octets > 5_000, `Document de ${qui} suspect : ${document.octets} octets.`);
    }

    // Les trois numéros sont distincts : un document par agent, c'est la décision
    // « un numéro par participant ».
    const numeros = (await participations(idOM)).map((l) => l.numeroOM);
    assert.equal(new Set(numeros).size, 3, `Numéros non distincts : ${numeros.join(", ")}`);
  });
});

// ---------------------------------------------------------------------------
// Document Word
// ---------------------------------------------------------------------------

describe("/api/generate-om", () => {
  test("refuse l'anonyme, l'identifiant mal formé et l'ancienne forme de corps", async () => {
    const admineur = await admin();
    const creation = await creer(admineur, [M1]);
    assert.ok(creation.id, creation.corps.slice(0, 300));

    const anonyme = await new Session(app.url).poster("/api/generate-om", {
      idOrdreMission: creation.id,
      matricule: M1,
    });
    assert.equal(anonyme.statut, 401, "Un appel anonyme n'est pas refusé en 401.");

    // ⚠️ `BigInt("0x10")` vaut 16 : sans le contrôle `/^\d+$/`, cet appel
    // désignerait une AUTRE ligne que celle que l'appelant croit demander.
    assert.equal(
      (await admineur.poster("/api/generate-om", { idOrdreMission: "0x10", matricule: M1 })).statut,
      400
    );

    assert.equal(
      (await admineur.poster("/api/generate-om", { idOrdreMission: creation.id })).statut,
      400
    );

    // LA faille que l'étape 8 ferme : la route acceptait l'objet complet du
    // document dans le corps, donc n'importe qui obtenait un OM au contenu de son
    // choix, avec la mise en forme officielle de l'EDC.
    assert.equal(
      (await admineur.poster("/api/generate-om", {
        numeroOM: "0001/2026",
        nom: "FAUX",
        prenoms: "Document",
        motif: "Contenu choisi par l'appelant",
      })).statut,
      400,
      "L'ancienne forme de corps est encore acceptée."
    );

    // ── Le document d'un collègue est PERMIS (décidé le 24/08/2026) ──────────
    //
    // Ce test attendait un 403. C'est justement l'usage attendu : un agent prépare
    // le dossier d'une mission et doit pouvoir en imprimer chaque ordre. Ce qui
    // reste refusé, c'est de FABRIQUER un document — l'ancienne forme de corps,
    // vérifiée juste au-dessus.
    const collegue = await (await agent()).poster("/api/generate-om", {
      idOrdreMission: creation.id,
      matricule: M1,
    });
    assert.equal(
      collegue.statut,
      200,
      `Un agent n'obtient pas le document d'un collègue (statut ${collegue.statut}).`
    );
    assert.ok(collegue.octets > 5_000, `Document suspect : ${collegue.octets} octets.`);

    assert.equal(
      (await admineur.poster("/api/generate-om", {
        idOrdreMission: "999999999",
        matricule: M1,
      })).statut,
      404
    );
  });

  test("produit un .docx nommé d'après le numéro d'OM", async () => {
    const session = await admin();
    const creation = await creer(session, [M1]);
    assert.ok(creation.id, creation.corps.slice(0, 300));
    const numeroOM = (await participation(creation.id, M1)).numeroOM;

    const reponse = await session.poster("/api/generate-om", {
      idOrdreMission: creation.id,
      matricule: M1,
    });

    assert.equal(reponse.statut, 200);
    assert.equal(
      reponse.typeContenu,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    assert.ok(reponse.octets > 5_000, `Document suspect : ${reponse.octets} octets.`);

    // Le « / » du numéro serait lu comme un séparateur de dossier par le système
    // de fichiers, et un retour à la ligne injecté couperait l'en-tête HTTP en deux.
    const attendu = `ordre_mission_${numeroOM.replace(/[^a-zA-Z0-9_-]/g, "-")}.docx`;
    assert.ok(
      reponse.disposition?.includes(attendu),
      `Nom de fichier inattendu : ${reponse.disposition} (attendu ${attendu})`
    );
    assert.ok(reponse.disposition?.includes("attachment"));

    // Un OM `EN_ATTENTE` ne porte AUCUNE mention : c'est le document destiné à la
    // signature du Directeur général, et le marquer « sans valeur » reviendrait à
    // lui demander de signer un papier qui s'annonce sans valeur.
    const document = new PizZip(reponse.binaire).file("word/document.xml")?.asText() ?? "";
    assert.ok(document.length > 0, "`word/document.xml` introuvable dans l'archive.");
    assert.ok(
      !document.includes("SANS VALEUR"),
      "Un OM en attente porte une mention « sans valeur » : le DG ne peut pas le signer."
    );

    // ── Le numéro IMPRIMÉ : le compteur, puis le suffixe, sans l'année ────────
    //
    // ⚠️ La balise du gabarit est `N° {numeroOM}/EDC/DG/DRH/SDARHAS`. Lui passer la
    // valeur stockée « 0001/2026 » imprimait « N° 0001/2026/EDC/DG/DRH/SDARHAS » :
    // l'année s'intercalait au milieu du suffixe administratif, alors qu'elle n'est
    // dans la colonne que pour l'unicité d'une année sur l'autre. Signalé le
    // 24/08/2026 — et invisible pour les tests d'alors, qui vérifiaient le nom du
    // fichier et la mention, jamais le numéro tel qu'il sort sur le papier.
    const compteur = decomposerNumero(numeroOM)!.compteur;
    const imprime = `N° ${String(compteur).padStart(4, "0")}/EDC/DG/DRH/SDARHAS`;
    assert.ok(
      document.includes(imprime),
      `Le numéro imprimé n'est pas « ${imprime} ». Extrait : ` +
        (document.match(/N° [^<]{0,40}/)?.[0] ?? "introuvable")
    );
    assert.ok(
      !document.includes(`/${decomposerNumero(numeroOM)!.annee}/EDC`),
      "L'année s'imprime au milieu du suffixe administratif."
    );
  });

  test("un OM annulé reste téléchargeable, et sort avec sa mention imprimée", async () => {
    const session = await admin();
    const creation = await creer(session, [M2]);
    assert.ok(creation.id, creation.corps.slice(0, 300));
    assert.ok(contient(await confirmer(session, creation.id, M2), "Participation confirmée."));
    assert.ok(contient(await annuler(session, creation.id, M2), "Participation annulée."));

    const reponse = await session.poster("/api/generate-om", {
      idOrdreMission: creation.id,
      matricule: M2,
    });
    // Le téléchargement reste TOUJOURS permis : le restreindre empêcherait
    // d'obtenir la signature, donc bloquerait le processus que l'application sert.
    assert.equal(reponse.statut, 200, "Le téléchargement d'un OM annulé a été refusé.");

    // Le contenu du `.docx` est la seule preuve que la mention y figure vraiment :
    // le gabarit n'a pas de balise dédiée, elle est préfixée au motif.
    const document = new PizZip(reponse.binaire).file("word/document.xml")?.asText() ?? "";
    assert.ok(document.length > 0, "`word/document.xml` introuvable dans l'archive.");
    assert.ok(
      document.includes("ANNUL"),
      "La mention « ANNULÉ » n'apparaît pas dans le document d'un OM annulé."
    );

    // La fiche montre la même chose que le document.
    assert.ok(
      pageContient(await session.obtenir(fiche(creation.id, M2)), "ANNUL"),
      "La fiche n'affiche pas la mention d'annulation."
    );
  });
});

// ---------------------------------------------------------------------------
// Péremption
// ---------------------------------------------------------------------------

describe("Péremption et régularisation", () => {
  test("un retour passé bascule en EXPIRE à la connexion, puis se régularise avec son motif", async () => {
    const session = await admin();
    const creation = await creer(session, [M2]);
    assert.ok(creation.id, creation.corps.slice(0, 300));
    const idOM = creation.id;

    // La mission est antidatée EN BASE : `validerOM` refuserait un départ passé à
    // la saisie, et c'est justement la règle qu'on ne veut pas contourner par
    // l'action. Le balayage, lui, ne regarde que la date de retour.
    await prisma.ordreMission.update({
      where: { id: BigInt(idOM) },
      data: {
        dateDepart: new Date(Date.UTC(2025, 0, 10)),
        dateRetour: new Date(Date.UTC(2025, 0, 15)),
      },
    });

    // Le balayage tourne dans `after(perimerOMEchus)` à la connexion : ce projet
    // n'a pas de tâche planifiée, et la spécification n'en exige pas.
    const nouvelle = new Session(app.url);
    await nouvelle.connecter(ADMIN_ESSAI.email, ADMIN_ESSAI.motDePasse);

    await jusqua(
      async () => (await participation(idOM, M2)).statut === "EXPIRE",
      `la participation ${idOM}/${M2} passe en EXPIRE`
    );

    assert.ok((await participation(idOM, M2)).expireLe, "`expire_le` n'est pas renseigné.");
    assert.ok(
      (await prisma.notification.count({
        where: { type: "OM_EXPIRE", destinataire: { email: ADMIN_ESSAI.email } },
      })) > 0,
      "Aucune notification OM_EXPIRE : l'OM paraîtrait caduc sans que personne ne l'apprenne."
    );

    // ── EXPIRE n'est pas un cul-de-sac ────────────────────────────────────
    // Le cas visé : la mission a eu lieu, le DG a signé le papier, et personne n'a
    // cliqué « Confirmer ».
    const page = await nouvelle.obtenir(fiche(idOM, M2));
    assert.ok(
      pageContient(page, "Régulariser"),
      "Le bouton de régularisation n'apparaît pas sur un OM expiré."
    );
    assert.ok(
      pageContient(page, "Motif de régularisation"),
      "Le champ de motif de régularisation n'est pas proposé."
    );

    const regularisation = await confirmer(
      nouvelle,
      idOM,
      M2,
      "Mission effectuée, confirmation oubliée"
    );
    assert.ok(
      contient(regularisation, "Participation régularisée"),
      `Régularisation refusée : ${regularisation.corps.slice(0, 400)}`
    );

    const regularisee = await participation(idOM, M2);
    assert.equal(regularisee.statut, "CONFIRME");
    assert.equal(regularisee.regularisationMotif, "Mission effectuée, confirmation oubliée");
    assert.ok(regularisee.confirmeLe);
    // La trace de péremption reste : c'est elle qui explique qu'il y ait un motif.
    assert.ok(regularisee.expireLe);
  });
});

// ---------------------------------------------------------------------------
// Liste, filtres et pagination
// ---------------------------------------------------------------------------

describe("Liste des ordres de mission", () => {
  /** Renseigné par le premier test du bloc, réutilisé par le dernier. */
  let idCollectif = "";

  test("pagine à PAR_PAGE_OM participations, sans répéter ni omettre de ligne", async () => {
    const session = await admin();

    const matricules = Array.from(
      { length: COMBIEN_PAGINATION },
      (_, i) => `99TPAG${String(i + 1).padStart(3, "0")}`
    );
    const creation = await creer(session, matricules);
    assert.ok(
      creation.id,
      `Création à ${COMBIEN_PAGINATION} participants refusée : ${creation.corps.slice(0, 400)}`
    );
    idCollectif = creation.id;
    assert.equal((await participations(creation.id)).length, COMBIEN_PAGINATION);

    const premiere = await session.obtenir("/om?q=ZZPAGINATION");
    assert.equal(premiere.statut, 200);
    const surPremiere = matriculesDesLignes(premiere.corps, LIGNES_PAG);
    assert.equal(surPremiere.size, PAR_PAGE_OM, "La première page n'est pas une page pleine.");

    const seconde = await session.obtenir("/om?q=ZZPAGINATION&page=2");
    const surSeconde = matriculesDesLignes(seconde.corps, LIGNES_PAG);
    assert.equal(
      surSeconde.size,
      COMBIEN_PAGINATION - PAR_PAGE_OM,
      "La seconde page ne contient pas le reste."
    );

    // Aucun recouvrement : c'est ce que garantit le tri TOTAL
    // (`date_depart DESC, numero_om DESC`). Sans lui, une ligne peut apparaître
    // deux fois ou disparaître entre deux pages.
    assert.equal(
      new Set([...surPremiere, ...surSeconde]).size,
      COMBIEN_PAGINATION,
      "Une ligne apparaît sur les deux pages, ou manque."
    );
  });

  test("distingue « page au-delà de la dernière » de « aucun résultat »", async () => {
    const session = await admin();

    // Les confondre enverrait l'utilisateur au mauvais endroit : dans un cas il
    // faut revenir en arrière, dans l'autre élargir la recherche.
    assert.ok(
      pageContient(await session.obtenir("/om?q=ZZPAGINATION&page=99"), "Cette page n'existe pas"),
      "Une page hors bornes affiche « aucun résultat »."
    );
    assert.ok(
      pageContient(
        await session.obtenir("/om?q=ZZZINTROUVABLE"),
        "Aucun ordre de mission ne correspond"
      ),
      "Un filtre sans résultat n'affiche pas le bon message."
    );
  });

  test("la recherche ignore les accents", async () => {
    const session = await admin();

    // 99TACC1 s'appelle NGUÉ. Sans `unaccent`, « ngue » ne le trouverait pas — et
    // personne ne tape les accents dans un champ de recherche.
    const creation = await creer(session, ["99TACC1"]);
    assert.ok(creation.id, `Création refusée : ${creation.corps.slice(0, 300)}`);

    const page = await session.obtenir("/om?q=ngue");
    assert.equal(page.statut, 200);
    assert.ok(
      matriculesDesLignes(page.corps, LIGNES_ACC).has("99TACC1"),
      "« ngue » ne trouve pas « NGUÉ » : la recherche est sensible aux accents."
    );
  });

  test("filtre par statut et par participation bloquée", async () => {
    const session = await admin();
    const periode = fenetre();

    // Un couple gagnant/perdant, pour disposer à la fois d'un CONFIRME et d'un bloqué.
    const gagnant = await creer(session, [M1], periode.champs);
    assert.ok(gagnant.id, gagnant.corps.slice(0, 300));
    const perdant = await creer(session, [M1], periode.champs);
    assert.ok(perdant.id, perdant.corps.slice(0, 300));
    assert.ok(contient(await confirmer(session, gagnant.id, M1), "Participation confirmée."));

    const numeroConfirme = (await participation(gagnant.id, M1)).numeroOM;
    const numeroBloque = (await participation(perdant.id, M1)).numeroOM;
    assert.ok((await participation(perdant.id, M1)).blocageMotif, "Le perdant n'est pas bloqué.");

    const q = (valeur: string) => encodeURIComponent(valeur);

    assert.ok(
      pageContient(
        await session.obtenir(`/om?statut=CONFIRME&q=${q(numeroConfirme)}`),
        numeroConfirme
      ),
      "Le filtre CONFIRME ne retient pas la participation confirmée."
    );
    assert.ok(
      pageContient(
        await session.obtenir(`/om?statut=REFUSE&q=${q(numeroConfirme)}`),
        "Aucun ordre de mission ne correspond"
      ),
      "Le filtre de statut ne discrimine pas."
    );

    const bloques = await session.obtenir(`/om?bloques=1&q=${q(numeroBloque)}`);
    assert.ok(
      pageContient(bloques, numeroBloque),
      "Le filtre « bloqués » ne retient pas la participation bloquée."
    );
    assert.ok(
      pageContient(bloques, "bloquée"),
      "La bannière d'avertissement des participations bloquées n'apparaît pas."
    );
    assert.ok(
      pageContient(
        await session.obtenir(`/om?bloques=1&q=${q(numeroConfirme)}`),
        "Aucun ordre de mission ne correspond"
      ),
      "Le filtre « bloqués » retient une participation qui ne l'est pas."
    );
  });

  test("la fiche d'une mission collective permet de passer d'un participant à l'autre", async () => {
    const session = await admin();
    assert.ok(idCollectif, "Le test de pagination n'a pas laissé d'OM collectif.");

    const page = await session.obtenir(fiche(idCollectif, "99TPAG001"));
    assert.equal(page.statut, 200);
    assert.ok(
      pageContient(page, "ZZPAGINATION001"),
      "Le participant demandé n'est pas celui affiché."
    );
    // Par MATRICULE et non par index de tableau : la table n'a pas d'identifiant
    // de substitution, sa clé primaire est le couple (mission, matricule).
    assert.ok(
      page.corps.includes(`/om/${idCollectif}?participant=99TPAG002`),
      "La navigation entre participants n'est pas rendue comme des liens."
    );
  });
});
