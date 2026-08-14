export interface Employee {
  matricule: string;
  nom: string;
  prenoms: string;
  // Titre statutaire attaché à la personne, lié à l'indice ci-dessous.
  // Champ libre : il dépend du corps (ingénieur, administrateur civil...).
  grade: string;
  // Emploi occupé dans l'organigramme — valeur du référentiel POSTES
  // (lib/referentiels.ts). C'est aussi sur le poste que porte le quota
  // annuel de missions (lib/config.ts).
  poste: string;
  affectation: string; // code du référentiel DEPARTEMENTS (lib/referentiels.ts)
  situationFamille: string;
  indice: string;
  dateNaissance: string; // ISO, pour la règle de départ en retraite
}

// Simule la table employés en base. À remplacer par une vraie requête Prisma
// GET /api/employes?matricule=... une fois le backend prêt.
export const mockEmployees: Employee[] = [
  {
    matricule: "0001",
    nom: "NKOLO ATANGANA",
    prenoms: "Stacy Julie",
    grade: "Ingénieur",
    poste: "Chef de la Division Informatique",
    statut: "Sous Directeur",
    affectation: "DSI",
    situationFamille: "Célibataire",
    indice: "410",
    dateNaissance: "2002-03-14",
    dateEmbauche: "2010-06-31",
  },
  {
    matricule: "0002",
    nom: "MAGNE",
    prenoms: "Isabelle Christ",
    grade: "Ingénieur",
    poste: "Chef de Service Cartographie et SIG",
    statut: "Chef de Service",
    affectation: "DEX",
    situationFamille: "Mariée",
    indice: "620",
    // Volontairement proche de l'âge de retraite par défaut (60 ans en 2026)
    // pour pouvoir tester la règle de blocage.
    dateNaissance: "1967-05-02",
    dateEmbauche: "2010-06-31",
  },
  {
    matricule: "0003",
    nom: "TOMO MBIANDA",
    prenoms: "Angela Katia",
    grade: "Ingénieur",
    poste: "Chef d'Équipe",
    statut: "Chef de Bureau",
    affectation: "DEP",
    situationFamille: "Mariée",
    indice: "540",
    dateNaissance: "1990-11-20",
    dateEmbauche: "2010-06-31",
  },
  {
    matricule: "0004",
    nom: "WOKMENI",
    prenoms: "Raïssa Raëlle",
    grade: "Ingénieur",
    poste: "Chargé de Suivi Budgétaire",
    statut: "Cadre",
    affectation: "DAI",
    situationFamille: "Célibataire",
    indice: "580",
    dateNaissance: "1988-01-09",
    dateEmbauche: "2010-06-31",
  },
];

export function findEmployeeByMatricule(matricule: string): Employee | undefined {
  return mockEmployees.find((e) => e.matricule === matricule);
}
