import { analyserDate, normaliserMatricule } from "@/lib/data/employes.validation";

/**
 * Validation de la saisie d'un ordre de mission.
 *
 * ── Pourquoi ce fichier est séparé du DAL ────────────────────────────────────
 *
 * Comme `employes.validation.ts` : aucune dépendance à Prisma, donc **importable
 * côté client**. Le formulaire peut s'en servir pour afficher les erreurs sans
 * aller-retour, et le serveur rejoue la même validation — c'est lui qui protège.
 *
 * ── Les cinq colonnes que RIEN ne validait ───────────────────────────────────
 *
 * `handleValider` (app/om/nouveau/page.tsx) ne contrôlait que les deux dates et
 * la présence d'un participant. Or la base impose `NOT NULL` sur :
 *
 *   `motif`, `ville_destination`, `code_pays`, `lieu_emission`, `date_emission`
 *
 * On pouvait donc enregistrer un OM sans pays de destination — donc sans zone,
 * donc **sans indemnité**. Cinq `NOT NULL` violables à la première insertion
 * réelle : c'est ce que cette validation ferme.
 */

/** Saisie brute, telle qu'un formulaire la produit : tout en chaînes. */
export interface SaisieOM {
  /**
   * Clé d'idempotence produite par le NAVIGATEUR (`ulid()`), transmise en champ
   * caché.
   *
   * Générée côté client dès maintenant, alors que l'étape 8 est entièrement en
   * ligne, pour deux raisons : c'est le même chemin de code qu'à l'étape 11 (où
   * la création sera hors ligne, donc où le serveur ne pourra pas la fournir), et
   * elle rend le double envoi inoffensif tout de suite — un double-clic sur
   * « Enregistrer » ne crée pas deux missions numérotées.
   */
  ulid: string;
  /** Nom français du pays, tel que proposé par l'autocomplétion. */
  paysDestination: string;
  villeDestination: string;
  /** Étape intermédiaire. Facultatif (colonne nullable). */
  viaPassage: string;
  motif: string;
  /** Facultatif. */
  financement: string;
  /** Facultatif. */
  moyenTransport: string;
  dateDepart: string;
  dateRetour: string;
  lieuEmission: string;
  dateEmission: string;
  /** Matricules des participants, dans l'ordre de saisie. */
  matricules: string[];
}

/** Saisie validée, prête pour le DAL. Les dates sont des `Date` UTC. */
export interface OMValide {
  ulid: string;
  paysDestination: string;
  villeDestination: string | null;
  viaPassage: string | null;
  motif: string | null;
  financement: string | null;
  moyenTransport: string | null;
  dateDepart: Date;
  dateRetour: Date;
  lieuEmission: string;
  dateEmission: Date;
  /** Matricules normalisés, sans doublon. */
  matricules: string[];
}

export type ErreursChampsOM = Partial<Record<keyof SaisieOM, string>>;

export interface ResultatValidationOM {
  valide?: OMValide;
  erreurs: ErreursChampsOM;
}

/** Longueurs maximales, alignées sur les colonnes. */
const MAX = {
  villeDestination: 120,
  viaPassage: 200,
  financement: 150,
  moyenTransport: 100,
  lieuEmission: 100,
} as const;

/**
 * Nombre maximal de participants à une même mission.
 *
 * Aucune contrainte en base ne le borne. La limite existe pour deux raisons
 * concrètes : chaque participant consomme un numéro d'OM définitif (donc une
 * saisie erronée en brûlerait autant), et le formulaire les affiche tous.
 * 30 est très au-delà d'une mission réelle.
 */
export const MAX_PARTICIPANTS = 30;

/**
 * Un ULID : 26 caractères en base32 de Crockford.
 *
 * L'alphabet **exclut I, L, O et U** — les trois premières parce qu'elles se
 * confondent avec 1 et 0 à la lecture, la dernière pour éviter les grossièretés
 * involontaires. Un contrôle sur `[A-Z0-9]` accepterait donc des chaînes qu'aucun
 * générateur ne produit, et laisserait passer un identifiant fabriqué à la main.
 *
 * La colonne est `CHAR(26) UNIQUE` : une valeur plus courte serait complétée
 * d'espaces par PostgreSQL et deviendrait impossible à retrouver par égalité
 * JavaScript. La longueur est donc vérifiée ici, pas seulement la forme.
 */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Bornes de vraisemblance de la date d'émission, en années autour d'aujourd'hui.
 *
 * ⚠️ **La date d'émission n'est pas bornée par la base** : la colonne est un
 * `DATE` nullable de contrainte, et rien n'empêche `0002-01-01`. Or elle
 * s'imprime sur le document et sert de repère d'audit — une faute de frappe
 * (« 2062 » pour « 2026 ») produirait une pièce datée du futur que personne ne
 * remarquerait.
 *
 * Large volontairement : antidater de deux ans est légitime (régularisation d'un
 * dossier ancien), postdater d'un an couvre la préparation d'un exercice à venir.
 * Ce n'est pas une règle de gestion, c'est un garde-fou contre la coquille.
 */
const EMISSION_ANNEES_PASSEES = 2;
const EMISSION_ANNEES_FUTURES = 1;

/**
 * Date du jour, en heure LOCALE.
 *
 * ⚠️ Pas `new Date().toISOString().slice(0, 10)`, qui est la date **UTC** : entre
 * minuit et 1 h du matin au Cameroun (UTC+1), elle renvoie la veille. Un départ
 * daté d'hier serait alors accepté comme « aujourd'hui ». Le code actuel
 * (app/om/nouveau/page.tsx) a exactement ce défaut.
 *
 * On construit donc la date en UTC à partir des composantes LOCALES : le résultat
 * est comparable aux dates produites par `analyserDate`, qui sont elles aussi des
 * minuits UTC portant le jour saisi.
 *
 * Exportée depuis le 24/08/2026 : le formulaire a besoin de la MÊME valeur pour
 * poser `min` sur ses saisies de date. La calculer côté navigateur donnerait deux
 * définitions d'« aujourd'hui » — celle de l'écran et celle du serveur qui
 * valide — qui divergeraient d'un jour à chaque changement de date, et l'écran
 * proposerait alors ce que le serveur refuse.
 */
export function aujourdhuiLocal(): Date {
  const maintenant = new Date();
  return new Date(
    Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
  );
}

/** Lit une saisie depuis un `FormData`, sans rien valider. */
export function lireSaisieOM(formData: FormData): SaisieOM {
  const texte = (cle: string) => String(formData.get(cle) ?? "");

  return {
    ulid: texte("ulid").trim().toUpperCase(),
    paysDestination: texte("paysDestination"),
    villeDestination: texte("villeDestination"),
    viaPassage: texte("viaPassage"),
    motif: texte("motif"),
    financement: texte("financement"),
    moyenTransport: texte("moyenTransport"),
    dateDepart: texte("dateDepart"),
    dateRetour: texte("dateRetour"),
    lieuEmission: texte("lieuEmission"),
    dateEmission: texte("dateEmission"),
    // `getAll` : le formulaire envoie un champ par participant, tous nommés
    // « matricules ». Un seul `get` n'en retiendrait qu'un.
    matricules: formData.getAll("matricules").map((v) => String(v)),
  };
}

/**
 * Valide une saisie d'OM.
 *
 * `aujourdhui` est injectable pour que les tests soient déterministes : sans ça,
 * un test sur « départ dans le passé » finirait par échouer tout seul le jour où
 * la date d'essai serait dépassée.
 */
export function validerOM(
  saisie: SaisieOM,
  options: {
    /** Noms de pays connus du référentiel. Vide = contrôle non effectué. */
    paysConnus?: ReadonlySet<string>;
    aujourdhui?: Date;
  } = {}
): ResultatValidationOM {
  const erreurs: ErreursChampsOM = {};
  const aujourdhui = options.aujourdhui ?? aujourdhuiLocal();

  // ── Clé d'idempotence ─────────────────────────────────────────────────────
  //
  // Vérifiée en premier : sans elle, un renvoi après coupure créerait un second
  // OM avec un second numéro définitif. Le message vise l'équipe technique et non
  // l'utilisateur, parce qu'aucune saisie ne peut produire cette erreur — le
  // champ est caché et rempli par le navigateur. S'il manque, c'est un défaut de
  // formulaire, pas une faute de l'agent.
  if (!ULID.test(saisie.ulid)) {
    erreurs.ulid =
      "Identifiant de création absent ou mal formé. Rechargez la page ; " +
      "si cela persiste, signalez-le à l'équipe technique.";
  }

  // ── Destination ───────────────────────────────────────────────────────────
  const pays = saisie.paysDestination.trim();
  if (!pays) {
    erreurs.paysDestination = "Le pays de destination est obligatoire.";
  } else if (options.paysConnus && !options.paysConnus.has(pays)) {
    // Un pays inconnu du référentiel n'a pas de zone, donc pas d'indemnité. On
    // refuse plutôt que d'enregistrer un OM sans montant : « un montant calculé
    // sur une zone devinée serait faux sur un document signé ».
    erreurs.paysDestination =
      "Ce pays n'est pas au référentiel : sa zone est inconnue, donc l'indemnité " +
      "ne peut pas être calculée. Choisissez un pays dans la liste.";
  }

  const ville = (saisie.villeDestination ?? "").trim();
  if (ville.length > MAX.villeDestination) {
    erreurs.villeDestination = `${MAX.villeDestination} caractères maximum.`;
  }

  const via = saisie.viaPassage.trim();
  if (via.length > MAX.viaPassage) {
    erreurs.viaPassage = `${MAX.viaPassage} caractères maximum.`;
  }

  // ── Objet de la mission ───────────────────────────────────────────────────
  const motif = (saisie.motif ?? "").trim();

  const financement = saisie.financement.trim();
  if (financement.length > MAX.financement) {
    erreurs.financement = `${MAX.financement} caractères maximum.`;
  }

  const transport = saisie.moyenTransport.trim();
  if (transport.length > MAX.moyenTransport) {
    erreurs.moyenTransport = `${MAX.moyenTransport} caractères maximum.`;
  }

  // ── Dates ─────────────────────────────────────────────────────────────────
  const depart = analyserDate(saisie.dateDepart);
  if (!depart) {
    erreurs.dateDepart = "Date de départ obligatoire, au format attendu.";
  } else if (depart < aujourdhui) {
    erreurs.dateDepart = "La date de départ ne peut pas être dans le passé.";
  }

  const retour = analyserDate(saisie.dateRetour);
  if (!retour) {
    erreurs.dateRetour = "Date de retour obligatoire, au format attendu.";
  } else if (depart && retour < depart) {
    // La contrainte `om_dates_coherentes` l'impose aussi en base ; ici on produit
    // un message plutôt qu'une erreur PostgreSQL.
    erreurs.dateRetour = "La date de retour ne peut pas précéder le départ.";
  }

  // ── Émission ──────────────────────────────────────────────────────────────
  const lieu = saisie.lieuEmission.trim();
  if (!lieu) {
    erreurs.lieuEmission = "Le lieu d'émission est obligatoire.";
  } else if (lieu.length > MAX.lieuEmission) {
    erreurs.lieuEmission = `${MAX.lieuEmission} caractères maximum.`;
  }

  const emission = analyserDate(saisie.dateEmission);
  if (!emission) {
    erreurs.dateEmission = "Date d'émission obligatoire, au format attendu.";
  } else {
    // Bornes de vraisemblance : aucune contrainte en base ne les impose, et une
    // coquille sur l'année s'imprimerait sur le document sans que rien ne
    // l'arrête.
    const minimum = new Date(aujourdhui);
    minimum.setUTCFullYear(minimum.getUTCFullYear() - EMISSION_ANNEES_PASSEES);
    const maximum = new Date(aujourdhui);
    maximum.setUTCFullYear(maximum.getUTCFullYear() + EMISSION_ANNEES_FUTURES);

    if (emission < minimum || emission > maximum) {
      erreurs.dateEmission =
        `Date d'émission invraisemblable : elle doit se situer entre ` +
        `${EMISSION_ANNEES_PASSEES} an(s) en arrière et ${EMISSION_ANNEES_FUTURES} an(s) ` +
        `en avant. Vérifiez l'année.`;
    }
  }

  // ── Participants ──────────────────────────────────────────────────────────
  const normalises = saisie.matricules
    .map((m) => normaliserMatricule(m))
    .filter((m) => m !== "");

  if (normalises.length === 0) {
    erreurs.matricules = "Au moins un participant est requis.";
  } else if (normalises.length > MAX_PARTICIPANTS) {
    erreurs.matricules = `${MAX_PARTICIPANTS} participants au maximum.`;
  } else if (new Set(normalises).size !== normalises.length) {
    // La clé primaire composite `(id_ordre_mission, matricule)` l'interdit en
    // base ; le dire ici évite une violation d'unicité illisible.
    erreurs.matricules =
      "Un même employé figure plusieurs fois : il ne peut apparaître qu'une fois par mission.";
  }

  if (Object.keys(erreurs).length > 0) return { erreurs };

  // Les non-nuls sont garantis par les contrôles ci-dessus ; TypeScript ne le
  // déduit pas à travers l'accumulation d'erreurs, d'où les assertions.
  return {
    erreurs: {},
    valide: {
      ulid: saisie.ulid,
      paysDestination: pays,
      villeDestination: ville || null,
      viaPassage: via === "" ? null : via,
      motif: motif || null,
      financement: financement === "" ? null : financement,
      moyenTransport: transport === "" ? null : transport,
      dateDepart: depart!,
      dateRetour: retour!,
      lieuEmission: lieu,
      dateEmission: emission!,
      matricules: normalises,
    },
  };
}

/**
 * Vrai si deux périodes se chevauchent, **bornes incluses**.
 *
 * ── Une décision que la spécification ne tranchait pas ───────────────────────
 *
 * Les deux comparaisons sont larges : **un retour le 10 et un départ le 10 sont
 * en conflit.** C'est l'intervalle fermé `[départ, retour]`, cohérent avec
 * `dureeEnJours` qui compte les deux bornes — une mission d'un seul jour dure
 * un jour, pas zéro.
 *
 * Le code d'origine (lib/businessRules.ts) faisait déjà ce choix, mais nulle part
 * il n'était écrit. Il l'est maintenant, ici et dans MODELE-DONNEES.md.
 *
 * ⚠️ L'équivalent SQL, utilisé par le DAL, doit rester d'accord :
 * `daterange(a1, a2, '[]') && daterange(b1, b2, '[]')`.
 */
export function periodesSeChevauchent(
  debut1: Date,
  fin1: Date,
  debut2: Date,
  fin2: Date
): boolean {
  return debut1 <= fin2 && debut2 <= fin1;
}

/**
 * Émetteur de l'ordre de mission — **figé, jamais saisi**.
 *
 * Les normes de l'EDC veulent que tout ordre de mission désigne le Directeur
 * général comme émetteur, quel que soit l'agent qui l'a établi. Ce ne sont donc
 * pas des champs de formulaire : `app/om/nouveau/page.tsx` les posait déjà en dur,
 * mais côté navigateur — donc modifiables par l'appelant. Ils vivent ici pour que
 * le serveur les impose, et l'aperçu les lise au même endroit.
 *
 * `grade` reste vide : aucune exigence équivalente ne porte dessus, et la colonne
 * `grade_emetteur` est nullable.
 */
export const EMETTEUR = {
  nom: "EDC",
  grade: null,
  fonction: "Le Directeur Général",
} as const;

/**
 * Les cinq statuts de participation, avec leur libellé.
 *
 * ⚠️ `REFUSE` et `EXPIRE` n'existaient pas dans `types/om.ts` (trois valeurs
 * seulement) : un badge pour l'un des deux s'affichait sans style. La liste est
 * ici pour que l'écran et le filtre partagent la même énumération que la base.
 *
 * L'ordre est celui du cycle de vie, pas l'alphabet.
 */
export const STATUTS_PARTICIPATION = [
  { valeur: "EN_ATTENTE", libelle: "En attente" },
  { valeur: "CONFIRME", libelle: "Confirmé" },
  { valeur: "ANNULE", libelle: "Annulé" },
  { valeur: "REFUSE", libelle: "Refusé" },
  { valeur: "EXPIRE", libelle: "Expiré" },
] as const;

export type StatutParticipation = (typeof STATUTS_PARTICIPATION)[number]["valeur"];

const CODES_STATUT_PARTICIPATION = new Set<string>(
  STATUTS_PARTICIPATION.map((s) => s.valeur)
);

/** Vrai si la chaîne est l'un des cinq statuts. Sert à filtrer un paramètre d'URL. */
export function estStatutParticipation(valeur: string): valeur is StatutParticipation {
  return CODES_STATUT_PARTICIPATION.has(valeur);
}

/** Libellé d'un statut, ou le code brut s'il est inconnu — jamais rien d'illisible. */
export function libelleStatutParticipation(statut: string): string {
  return STATUTS_PARTICIPATION.find((s) => s.valeur === statut)?.libelle ?? statut;
}

/**
 * Statuts qui **engagent** l'employé, donc ceux qui produisent un chevauchement
 * digne d'être signalé.
 *
 * ── Décision prise le 22/08/2026, que la spécification ne tranchait pas ──────
 *
 * `ANNULE`, `REFUSE` et `EXPIRE` n'engagent personne : aucun des trois ne
 * correspond à un agent en déplacement. Le code d'origine
 * (lib/businessRules.ts:42) n'écartait qu'`ANNULE`, parce que les deux autres
 * statuts n'existaient pas encore — pas parce qu'ils devaient bloquer.
 *
 * ⚠️ Le DAL rejoue cette liste en SQL (`p.statut IN (…)`). Les deux doivent
 * rester d'accord, sinon l'écran et la base ne détecteraient pas les mêmes
 * conflits.
 */
export const STATUTS_ENGAGEANTS = ["EN_ATTENTE", "CONFIRME"] as const;

/**
 * Statuts qui **empêchent** une nouvelle mission sur la même période.
 *
 * ── Précision du 23/08/2026 : engager n'est pas bloquer ──────────────────────
 *
 * `STATUTS_ENGAGEANTS` ci-dessus dit ce qui *compte comme un chevauchement* ;
 * cette liste-ci dit ce qui le rend *rédhibitoire*. Les deux ne se confondent
 * pas, et c'est la règle arbitrée :
 *
 *   • chevauchement avec un OM **`CONFIRME`** → refus. L'agent est déjà engagé
 *     par une pièce que le DG a signée ; l'envoyer ailleurs aux mêmes dates est
 *     matériellement impossible.
 *   • chevauchement avec un OM **`EN_ATTENTE`** → simple signal. Aucun des deux
 *     n'est encore une décision : l'un sera confirmé, l'autre non, et c'est
 *     précisément le travail de l'administrateur d'arbitrer. Refuser ici
 *     l'empêcherait de préparer deux hypothèses.
 *
 * Le blocage n'est donc pas perdu, il est **différé** : quand l'admin confirme
 * l'un des deux, le DAL inscrit `blocage_motif` sur les autres, et le CHECK
 * `part_blocage_interdit_confirmation` interdit dès lors leur confirmation — la
 * règle passe du code à la base.
 */
export const STATUTS_BLOQUANTS = ["CONFIRME"] as const;

/**
 * Mention à imprimer en tête du document, ou `null` s'il n'y en a aucune.
 *
 * ── Pourquoi `EN_ATTENTE` ne porte AUCUNE mention ────────────────────────────
 *
 * C'est l'erreur que MODELE-DONNEES.md §10 corrige explicitement. Marquer un OM
 * en attente « SANS VALEUR » revient à demander au Directeur général de **signer
 * un papier portant la mention « sans valeur »** — contradictoire. Un OM
 * `EN_ATTENTE` est justement le document destiné à être signé, et il se distingue
 * déjà tout seul : l'emplacement de signature est vide.
 *
 * La mention n'existe donc que pour les états où le document ne doit **jamais**
 * circuler comme valide. Le cas du blocage passe avant le statut : un OM en
 * attente mais en conflit doit être régularisé **avant** de partir à la
 * signature, sinon on fait signer le DG pour rien.
 */
export function mentionStatut(
  statut: string,
  options: { bloque?: boolean } = {}
): string | null {
  if (options.bloque) return "CONFLIT DE PÉRIODE — À RÉGULARISER AVANT SIGNATURE";

  switch (statut) {
    case "REFUSE":
      return "REFUSÉ — SANS VALEUR";
    case "EXPIRE":
      return "EXPIRÉ — SANS VALEUR";
    case "ANNULE":
      return "ANNULÉ";
    // EN_ATTENTE : le document à faire signer. CONFIRME : la signature
    // manuscrite fait foi, rien à ajouter.
    default:
      return null;
  }
}
