// Référentiels fermés de l'EDC — départements et postes.
//
// Comme lib/config.ts, ces listes sont en dur : ce sont des nomenclatures
// internes qui bougent rarement, et il n'y a pas encore d'écran
// d'administration. Le jour où la base PostgreSQL est branchée, ces deux
// tableaux deviennent deux tables de référence.
//
// `valeur` est ce qui est STOCKÉ (dans Participant.affectation /
// Participant.poste) ; `libelle` est ce qui est AFFICHÉ. Les deux sont
// distincts parce que les données existantes stockent déjà des sigles
// courts ("DEX") alors que les listes doivent rester lisibles.
//
// ⚠️ POSTE, PAS GRADE — la nuance est structurante ici :
//   • le GRADE est un titre statutaire attaché à la PERSONNE (on le
//     possède) ; il est acquis par titularisation, détermine l'indice donc
//     la rémunération, et ne change pas quand l'agent est muté.
//     Ex. "Ingénieur Principal" — cf. Participant.grade / Participant.indice.
//   • le POSTE est l'emploi attaché à l'ORGANIGRAMME (on l'occupe) ; il est
//     révocable et peut changer sans que le grade bouge.
//     Ex. "Directeur", "Chef de Service" — cf. Participant.poste.
// C'est le principe de séparation du grade et de l'emploi. Le référentiel
// ci-dessous décrit donc des POSTES ; `grade` reste un champ libre.

export interface OptionReferentiel {
  valeur: string;
  libelle: string;
}

export const DEPARTEMENTS: OptionReferentiel[] = [
  { valeur: "DEX", libelle: "Direction de l'Exploitation (DEX)" },
  { valeur: "DAG", libelle: "Direction des Affaires Générales (DAG)" },
  { valeur: "DEP", libelle: "Direction des Études et Projets (DEP)" },
  { valeur: "DFCC", libelle: "Direction Financière, Comptable et Commerciale (DFCC)" },
  { valeur: "RH", libelle: "Direction des Ressources Humaines (RH)" },
  // Les sigles des entités ci-dessous n'étaient pas fournis — proposés ici,
  // à corriger si l'EDC en utilise d'autres en interne.
  { valeur: "DAI", libelle: "Division de l'Audit Interne" },
  { valeur: "DCRP", libelle: "Division de la Communication et des Relations Publiques" },
  { valeur: "QHSE", libelle: "Division QHSE" },
  { valeur: "DSI", libelle: "Division des Systèmes d'Information" },
  { valeur: "DAJC", libelle: "Division des Affaires Juridiques et du Contentieux" },
  { valeur: "CCM", libelle: "Cellule de Contrôle des Marchés" },
];

// Ordre hiérarchique (du plus élevé au plus bas), pas alphabétique : c'est
// l'ordre dans lequel la liste déroulante est lue par les RH.
//
// Les trois dernières valeurs ne sont pas des postes d'encadrement mais des
// catégories professionnelles (collèges de la convention collective) : EDC
// étant une société à capital public régie par le Code du travail, c'est cet
// axe qui qualifie un salarié n'occupant aucune fonction hiérarchique. Elles
// sont gardées dans la même liste pour que tout salarié soit filtrable.
export const POSTES: OptionReferentiel[] = [
  // Mandats d'organe de gouvernance, pas des emplois salariés.
  { valeur: "PCA", libelle: "PCA — Président(e) du Conseil d'Administration" },
  { valeur: "Membre du Conseil d'Administration", libelle: "Membre du Conseil d'Administration" },
  { valeur: "Directeur Général", libelle: "Directeur Général" },
  { valeur: "Directeur Général Adjoint", libelle: "Directeur Général Adjoint" },
  { valeur: "Directeur", libelle: "Directeur" },
  { valeur: "Sous-Directeur", libelle: "Sous-Directeur" },
  { valeur: "Chef de Service", libelle: "Chef de Service" },
  { valeur: "Chef de Bureau", libelle: "Chef de Bureau" },
  // Catégories professionnelles (cf. remarque ci-dessus).
  { valeur: "Cadre", libelle: "Cadre" },
  { valeur: "Agent de maîtrise", libelle: "Agent de maîtrise" },
  { valeur: "Employé de bureau", libelle: "Employé de bureau" },
];

// Les données peuvent contenir un code inconnu du référentiel (import
// ancien, saisie manuelle en base). On affiche alors le code brut plutôt
// que rien du tout.
export function libelleDepartement(valeur?: string): string {
  if (!valeur) return "";
  return DEPARTEMENTS.find((d) => d.valeur === valeur)?.libelle ?? valeur;
}

// ---------------------------------------------------------------------------
// STATUT — encore un axe DIFFÉRENT du grade et du poste, à ne pas confondre :
//   • GRADE : titre statutaire attaché à la personne (Participant.grade)
//   • POSTE : emploi occupé dans l'organigramme (Participant.poste, ci-dessus)
//   • STATUT : position hiérarchique qui détermine le barème des frais de
//     mission (indemnité journalière), avec la zone géographique de
//     destination — cf. lib/baremes.ts. Recueilli à la main (photo d'une
//     liste manuscrite) ; à faire valider par les RH si un intitulé semble
//     manquer ou mal placé.
// ---------------------------------------------------------------------------
export const STATUTS: OptionReferentiel[] = [
  { valeur: "Administrateur", libelle: "Administrateur" },
  { valeur: "Directeur Général", libelle: "Directeur Général" },
  { valeur: "Directeur Général Adjoint", libelle: "Directeur Général Adjoint" },
  { valeur: "Directeur", libelle: "Directeur" },
  { valeur: "Sous-directeur", libelle: "Sous-directeur" },
  { valeur: "Chef de Service", libelle: "Chef de Service" },
  { valeur: "Chef de Bureau", libelle: "Chef de Bureau" },
  { valeur: "Cadre", libelle: "Cadre" },
  { valeur: "Agent de maîtrise", libelle: "Agent de maîtrise" },
  { valeur: "Agent d'exécution", libelle: "Agent d'exécution" },
];
