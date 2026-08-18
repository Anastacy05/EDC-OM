export interface Employee {
  matricule: string;
  nom: string;
  prenoms: string;
  // Titre statutaire attaché à la personne, lié à l'indice ci-dessous.
  // Champ libre : il dépend du corps (ingénieur, administrateur civil...).
  grade: string;
  // Emploi occupé dans l'organigramme — DOIT être une des valeurs du
  // référentiel POSTES (lib/referentiels.ts), pas un intitulé libre : la
  // liste déroulante de filtre (app/om/page.tsx) compare par égalité stricte.
  //
  // ⚠️ POSTES et STATUTS (juste en dessous) se recouvrent presque entièrement
  // dans leur contenu actuel — probablement un doublon involontaire côté
  // référentiels. Gardés distincts ici puisque ce sont deux besoins
  // différents (filtre de la liste vs calcul du frais fixe), mais à
  // clarifier/fusionner si un jour ça s'avère être vraiment la même notion.
  poste: string;
  // Rang hiérarchique — valeur du référentiel STATUTS (lib/referentiels.ts).
  // Détermine, avec la zone de destination, le frais fixe journalier
  // (lib/baremes.ts). Distinct du poste : un même poste peut correspondre à
  // des statuts différents selon l'ancienneté/la classification RH.
  statut: string;
  affectation: string; // code du référentiel DEPARTEMENTS (lib/referentiels.ts)
  situationFamille: string;
  indice: string;
  dateNaissance: string; // ISO, pour la règle de départ en retraite
  dateEmbauche: string; // ISO
}

// Simule la table employés en base. À remplacer par une vraie requête Prisma
// GET /api/employes?matricule=... une fois le backend prêt.
export const mockEmployees: Employee[] = [
  {
    matricule: "0001",
    nom: "NKOLO ATANGANA",
    prenoms: "Stacy Julie",
    grade: "Ingénieur",
    poste: "Cadre",
    statut: "Cadre",
    affectation: "DSI",
    situationFamille: "Célibataire",
    indice: "410",
    dateNaissance: "2002-03-14",
    dateEmbauche: "2024-09-01",
  },
  {
    matricule: "0002",
    nom: "MAGNE",
    prenoms: "Isabelle Christ",
    grade: "Ingénieur",
    poste: "Chef de Service",
    statut: "Chef de Service",
    affectation: "DEX",
    situationFamille: "Mariée",
    indice: "620",
    // Volontairement proche de l'âge de retraite par défaut (60 ans en 2026)
    // pour pouvoir tester la règle de blocage.
    dateNaissance: "1967-05-02",
    dateEmbauche: "2001-03-15",
  },
  {
    matricule: "0003",
    nom: "TOMO MBIANDA",
    prenoms: "Angela Katia",
    grade: "Ingénieur",
    poste: "Chef de Bureau",
    // Volontairement différent du poste : illustre que poste et statut sont
    // deux axes indépendants, pas toujours alignés.
    statut: "Agent de maîtrise",
    affectation: "DEP",
    situationFamille: "Mariée",
    indice: "540",
    dateNaissance: "1990-11-20",
    dateEmbauche: "2015-06-01",
  },
  {
    matricule: "0004",
    nom: "WOKMENI",
    prenoms: "Raïssa Raëlle",
    grade: "Ingénieur",
    poste: "Cadre",
    statut: "Agent de maîtrise",
    affectation: "DAI",
    situationFamille: "Célibataire",
    indice: "580",
    dateNaissance: "1988-01-09",
    dateEmbauche: "2018-02-12",
  },
];

export function findEmployeeByMatricule(matricule: string): Employee | undefined {
  return mockEmployees.find((e) => e.matricule === matricule);
}
