/**
 * Validation du formulaire employé.
 *
 * ── Ce que cette couche fait, et ce qu'elle NE fait pas ──────────────────────
 *
 * Elle produit des **messages**, pas de la sûreté. La base porte déjà toutes les
 * contraintes dures, et elle est la dernière ligne :
 *
 *   • clés étrangères sur `code_statut` et `code_departement` ;
 *   • type `enum` sur `situation_famille` ;
 *   • `CHECK (date_embauche > date_naissance)` ;
 *   • `CHECK (NOT est_detache OR jours_conge_origine IS NOT NULL)` ;
 *   • `CHECK (nombre_medailles >= 0)` ;
 *   • `CHECK (actif OR desactive_le IS NOT NULL)`.
 *
 * Conséquence rassurante : un oubli ICI ne peut pas créer de donnée incohérente,
 * seulement une erreur PostgreSQL illisible. C'est pourquoi cette validation est
 * écrite à la main plutôt qu'avec un validateur de schéma — le gain d'une
 * dépendance serait la sûreté, or la sûreté est déjà ailleurs.
 *
 * ⚠️ Corollaire à ne pas perdre de vue : chaque contrainte de la base doit avoir
 * son message ici, sinon l'utilisateur voit le message brut de PostgreSQL. La
 * liste ci-dessus est la référence à tenir à jour.
 *
 * ── Ce module n'est ni `server-only` ni `"use client"` ────────────────────────
 *
 * Il est importé par les Server Actions (validation qui compte) et pourrait
 * l'être par le formulaire (retour immédiat). Il ne contient donc que des
 * fonctions pures : aucun accès à la base, aucune lecture d'environnement.
 */

/** Valeurs de l'enum `SituationFamille` du schéma, dans l'ordre d'affichage. */
export const SITUATIONS_FAMILLE = [
  { valeur: "CELIBATAIRE", libelle: "Célibataire" },
  { valeur: "MARIE", libelle: "Marié(e)" },
  { valeur: "DIVORCE", libelle: "Divorcé(e)" },
  { valeur: "VEUF", libelle: "Veuf(ve)" },
] as const;

export type SituationFamille = (typeof SITUATIONS_FAMILLE)[number]["valeur"];

const CODES_SITUATION = new Set<string>(SITUATIONS_FAMILLE.map((s) => s.valeur));

/**
 * Motifs de sortie, alignés sur l'énumération `MotifSortie` du schéma.
 *
 * ── Pourquoi ils existent ────────────────────────────────────────────────────
 *
 * `actif = false` ne disait rien. « Parti à la retraite », « en congé sans
 * solde » et « décédé » n'ont pas les mêmes suites : on écrit à un retraité, on
 * attend un suspendu, on n'écrit pas à une famille endeuillée. Cette information
 * était *perdue*, pas seulement absente.
 *
 * ── FACULTATIF, et c'est une décision ────────────────────────────────────────
 *
 * Arbitré le 21/08/2026 : « oui mais il n'est pas obligatoire ». Une
 * désactivation urgente — un accès à fermer tout de suite — ne doit pas être
 * retenue par un champ à remplir. La contrainte de base va dans le même sens :
 * elle interdit un motif sur une fiche ACTIVE, elle n'en exige jamais un.
 *
 * L'ordre suit la fréquence attendue, pas l'alphabet : ce qui arrive souvent est
 * en haut de la liste déroulante.
 */
export const MOTIFS_SORTIE = [
  { valeur: "RETRAITE", libelle: "Départ à la retraite" },
  { valeur: "DEMISSION", libelle: "Démission" },
  { valeur: "FIN_DE_CONTRAT", libelle: "Fin de contrat" },
  { valeur: "DETACHEMENT", libelle: "Détachement vers une autre administration" },
  { valeur: "SUSPENSION", libelle: "Suspension (congé sans solde, disponibilité)" },
  { valeur: "LICENCIEMENT", libelle: "Licenciement" },
  { valeur: "DECES", libelle: "Décès" },
  { valeur: "AUTRE", libelle: "Autre" },
] as const;

export type MotifSortie = (typeof MOTIFS_SORTIE)[number]["valeur"];

const CODES_MOTIF = new Set<string>(MOTIFS_SORTIE.map((m) => m.valeur));

/** Libellé d'un motif, ou le code brut s'il est inconnu — jamais rien d'illisible. */
export function libelleMotifSortie(motif: string | null): string | null {
  if (!motif) return null;
  return MOTIFS_SORTIE.find((m) => m.valeur === motif)?.libelle ?? motif;
}

/** Longueur maximale de la note de sortie. Aligné sur la colonne `TEXT`, borné ici. */
export const LONGUEUR_NOTE_SORTIE = 500;

/**
 * Valide le motif et la note d'une désactivation.
 *
 * Les deux sont facultatifs, mais un motif fourni doit appartenir à
 * l'énumération : sans ce contrôle, une valeur inventée envoyée en POST ferait
 * échouer l'écriture sur une erreur PostgreSQL illisible plutôt que sur un
 * message.
 */
export function validerSortie(saisie: { motifSortie: string; noteSortie: string }):
  | { valide: { motifSortie: MotifSortie | null; noteSortie: string | null } }
  | { erreur: string } {
  const motif = saisie.motifSortie.trim();
  const note = saisie.noteSortie.trim();

  if (motif !== "" && !CODES_MOTIF.has(motif)) {
    return { erreur: "Motif de sortie inconnu." };
  }
  if (note.length > LONGUEUR_NOTE_SORTIE) {
    return { erreur: `La note ne doit pas dépasser ${LONGUEUR_NOTE_SORTIE} caractères.` };
  }

  // Une note sans motif est refusée : la contrainte de base ne l'interdit pas,
  // mais « note_sortie renseignée, motif_sortie nul » se lit mal dans un état RH
  // — on ne sait pas de quoi la note parle.
  if (note !== "" && motif === "") {
    return { erreur: "Choisissez un motif pour accompagner cette précision." };
  }

  return {
    valide: {
      motifSortie: motif === "" ? null : (motif as MotifSortie),
      noteSortie: note === "" ? null : note,
    },
  };
}

/**
 * Bornes d'âge acceptées à la saisie.
 *
 * Volontairement larges : l'âge de retraite est un PARAMÈTRE (table
 * `configuration`, 50 à 75 ans) et le dossier d'un retraité doit rester
 * modifiable. Ces bornes n'existent que pour attraper une faute de frappe de
 * siècle — « 1090 » au lieu de « 1990 » — pas pour appliquer une règle RH.
 */
const AGE_MINIMUM = 15;
const AGE_MAXIMUM = 100;

/** Données brutes du formulaire, avant validation. Tout est chaîne. */
export interface SaisieEmploye {
  matricule: string;
  nom: string;
  prenoms: string;
  grade: string;
  fonction: string;
  situationFamille: string;
  indice: string;
  dateNaissance: string;
  dateEmbauche: string;
  codeStatut: string;
  codeDepartement: string;
  nombreMedailles: string;
  estDetache: boolean;
  joursCongeOrigine: string;
}

/** Données validées, prêtes pour la base. */
export interface EmployeValide {
  matricule: string;
  nom: string;
  prenoms: string;
  grade: string;
  fonction: string;
  situationFamille: SituationFamille;
  indice: string | null;
  dateNaissance: Date;
  dateEmbauche: Date;
  codeStatut: string;
  codeDepartement: string;
  nombreMedailles: number;
  estDetache: boolean;
  joursCongeOrigine: number | null;
}

export type ErreursChamps = Partial<Record<keyof SaisieEmploye, string>>;

export interface ResultatValidation {
  valide?: EmployeValide;
  erreurs: ErreursChamps;
}

/**
 * Analyse une date au format `AAAA-MM-JJ` (celui d'un `<input type="date">`).
 *
 * ⚠️ `new Date("2026-08-21")` est interprété en **UTC** par la spécification, ce
 * qui décale la date d'un jour pour tout fuseau à l'ouest de Greenwich. Le
 * Cameroun est à UTC+1, donc à l'est — le décalage y va dans l'autre sens, mais
 * il existe. On construit donc la date en UTC explicitement : la colonne est de
 * type `DATE`, sans heure, et doit porter exactement le jour saisi.
 */
function analyserDate(valeur: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur.trim());
  if (!m) return null;

  const [, a, mo, j] = m;
  const annee = Number(a);
  const mois = Number(mo);
  const jour = Number(j);
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;

  const d = new Date(Date.UTC(annee, mois - 1, jour));
  // Contrôle de cohérence : Date.UTC accepte le 31 février et le reporte au
  // 2 ou 3 mars. Sans cette relecture, une date impossible passerait en silence.
  if (
    d.getUTCFullYear() !== annee ||
    d.getUTCMonth() !== mois - 1 ||
    d.getUTCDate() !== jour
  ) {
    return null;
  }
  return d;
}

/** Nombre d'années révolues entre deux dates. */
function anneesRevolues(depuis: Date, jusqua: Date): number {
  let ans = jusqua.getUTCFullYear() - depuis.getUTCFullYear();
  const moisEcart = jusqua.getUTCMonth() - depuis.getUTCMonth();
  if (moisEcart < 0 || (moisEcart === 0 && jusqua.getUTCDate() < depuis.getUTCDate())) {
    ans -= 1;
  }
  return ans;
}

/**
 * Normalise un matricule.
 *
 * Majuscules et espaces retirés : les matricules de l'EDC ont la forme
 * « 22P582 ». La colonne étant la clé PRIMAIRE, « 22p582 » et « 22P582 »
 * créeraient deux employés distincts pour une même personne — un doublon qui
 * fausserait ensuite les quotas de mission et les soldes de congés.
 */
export function normaliserMatricule(valeur: string): string {
  return valeur.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Valide une saisie.
 *
 * `aujourdhui` est un PARAMÈTRE et non `new Date()` en dur : ça rend la fonction
 * pure, donc testable sans dépendre du jour où le test tourne.
 */
export function validerEmploye(
  saisie: SaisieEmploye,
  options: {
    codesStatutsValides: ReadonlySet<string>;
    codesDepartementsValides: ReadonlySet<string>;
    aujourdhui?: Date;
  }
): ResultatValidation {
  const erreurs: ErreursChamps = {};
  const maintenant = options.aujourdhui ?? new Date();

  // ── Identité ──────────────────────────────────────────────────────────────
  const matricule = normaliserMatricule(saisie.matricule);
  if (!matricule) erreurs.matricule = "Matricule requis.";
  else if (matricule.length > 20) erreurs.matricule = "20 caractères maximum.";

  const nom = saisie.nom.trim();
  if (!nom) erreurs.nom = "Nom requis.";
  else if (nom.length > 100) erreurs.nom = "100 caractères maximum.";

  const prenoms = saisie.prenoms.trim();
  if (!prenoms) erreurs.prenoms = "Prénoms requis.";
  else if (prenoms.length > 150) erreurs.prenoms = "150 caractères maximum.";

  // ── Position ──────────────────────────────────────────────────────────────
  const grade = saisie.grade.trim();
  if (!grade) erreurs.grade = "Grade requis.";
  else if (grade.length > 100) erreurs.grade = "100 caractères maximum.";

  // Texte libre, décidé le 19/08/2026 : la fonction dépend de l'organigramme et
  // n'est pas une liste fermée. Le référentiel POSTES a été supprimé parce qu'il
  // dupliquait STATUTS.
  const fonction = saisie.fonction.trim();
  if (!fonction) erreurs.fonction = "Fonction requise.";
  else if (fonction.length > 200) erreurs.fonction = "200 caractères maximum.";

  if (!saisie.codeStatut) erreurs.codeStatut = "Statut requis.";
  else if (!options.codesStatutsValides.has(saisie.codeStatut)) {
    erreurs.codeStatut = "Statut inconnu.";
  }

  if (!saisie.codeDepartement) erreurs.codeDepartement = "Direction requise.";
  else if (!options.codesDepartementsValides.has(saisie.codeDepartement)) {
    erreurs.codeDepartement = "Direction inconnue.";
  }

  if (!saisie.situationFamille) {
    erreurs.situationFamille = "Situation de famille requise.";
  } else if (!CODES_SITUATION.has(saisie.situationFamille)) {
    erreurs.situationFamille = "Situation de famille inconnue.";
  }

  const indice = saisie.indice.trim();
  if (indice.length > 10) erreurs.indice = "10 caractères maximum.";

  // ── Dates ─────────────────────────────────────────────────────────────────
  const dateNaissance = analyserDate(saisie.dateNaissance);
  if (!saisie.dateNaissance.trim()) erreurs.dateNaissance = "Date de naissance requise.";
  else if (!dateNaissance) erreurs.dateNaissance = "Date invalide.";
  else {
    const age = anneesRevolues(dateNaissance, maintenant);
    if (age < AGE_MINIMUM) {
      erreurs.dateNaissance = `Âge calculé : ${age} ans. Vérifiez l'année.`;
    } else if (age > AGE_MAXIMUM) {
      erreurs.dateNaissance = `Âge calculé : ${age} ans. Vérifiez l'année.`;
    }
  }

  const dateEmbauche = analyserDate(saisie.dateEmbauche);
  if (!saisie.dateEmbauche.trim()) erreurs.dateEmbauche = "Date d'embauche requise.";
  else if (!dateEmbauche) erreurs.dateEmbauche = "Date invalide.";
  else if (dateEmbauche > maintenant) {
    // Refusé plutôt que toléré : la date d'embauche est la base du calcul des
    // congés (art. 80). Une date future donnerait une ancienneté négative.
    erreurs.dateEmbauche = "La date d'embauche ne peut pas être dans le futur.";
  }

  // Message porté par le champ « embauche » et non « naissance » : c'est celui
  // que l'utilisateur vient de saisir, donc celui qu'il s'attend à corriger.
  // Reflète `CHECK (date_embauche > date_naissance)`.
  if (dateNaissance && dateEmbauche && !erreurs.dateEmbauche && dateEmbauche <= dateNaissance) {
    erreurs.dateEmbauche = "L'embauche doit être postérieure à la naissance.";
  }

  // ── Congés ────────────────────────────────────────────────────────────────
  // Art. 81-5 : +1 jour de congé par Médaille d'Honneur du Travail.
  const medaillesTexte = saisie.nombreMedailles.trim() || "0";
  const nombreMedailles = Number(medaillesTexte);
  if (!/^\d+$/.test(medaillesTexte)) {
    erreurs.nombreMedailles = "Nombre entier positif ou zéro.";
  } else if (nombreMedailles > 10) {
    // La Médaille d'Honneur du Travail camerounaise compte quatre échelons ;
    // au-delà de dix, c'est une faute de frappe.
    erreurs.nombreMedailles = "Valeur invraisemblable. Vérifiez la saisie.";
  }

  // Art. 81-6 : un fonctionnaire détaché garde au moins le droit à congé de son
  // administration d'origine. Reflète `CHECK (NOT est_detache OR
  // jours_conge_origine IS NOT NULL)`.
  let joursCongeOrigine: number | null = null;
  const joursTexte = saisie.joursCongeOrigine.trim();
  if (saisie.estDetache) {
    if (!joursTexte) {
      erreurs.joursCongeOrigine =
        "Obligatoire pour un détaché : sans ce droit d'origine, la règle de l'art. 81-6 est incalculable.";
    } else if (!/^\d+([.,]\d)?$/.test(joursTexte)) {
      erreurs.joursCongeOrigine = "Nombre de jours, avec au plus une décimale.";
    } else {
      // La virgule décimale est la notation française ; le point est celle de
      // JavaScript. On accepte les deux à la saisie.
      joursCongeOrigine = Number(joursTexte.replace(",", "."));
      if (joursCongeOrigine < 0 || joursCongeOrigine > 365) {
        erreurs.joursCongeOrigine = "Entre 0 et 365 jours.";
      }
    }
  } else if (joursTexte) {
    // Non détaché mais un droit saisi : on l'ignore silencieusement plutôt que
    // de le refuser. L'utilisateur a probablement décoché après avoir saisi, et
    // lui opposer une erreur sur un champ désormais masqué serait déroutant.
    joursCongeOrigine = null;
  }

  if (Object.keys(erreurs).length > 0) return { erreurs };

  return {
    erreurs: {},
    valide: {
      matricule,
      nom,
      prenoms,
      grade,
      fonction,
      situationFamille: saisie.situationFamille as SituationFamille,
      indice: indice || null,
      dateNaissance: dateNaissance!,
      dateEmbauche: dateEmbauche!,
      codeStatut: saisie.codeStatut,
      codeDepartement: saisie.codeDepartement,
      nombreMedailles,
      estDetache: saisie.estDetache,
      joursCongeOrigine,
    },
  };
}

/** Extrait la saisie d'un `FormData`, sans la valider. */
export function lireSaisie(formData: FormData): SaisieEmploye {
  const texte = (cle: string) => String(formData.get(cle) ?? "");
  return {
    matricule: texte("matricule"),
    nom: texte("nom"),
    prenoms: texte("prenoms"),
    grade: texte("grade"),
    fonction: texte("fonction"),
    situationFamille: texte("situationFamille"),
    indice: texte("indice"),
    dateNaissance: texte("dateNaissance"),
    dateEmbauche: texte("dateEmbauche"),
    codeStatut: texte("codeStatut"),
    codeDepartement: texte("codeDepartement"),
    nombreMedailles: texte("nombreMedailles"),
    // Une case non cochée n'est PAS envoyée dans un formulaire HTML : son
    // absence vaut « faux ». Tester la présence, et non la valeur.
    estDetache: formData.get("estDetache") !== null,
    joursCongeOrigine: texte("joursCongeOrigine"),
  };
}
