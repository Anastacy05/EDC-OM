export interface Employee {
  matricule: string;
  nom: string;
  prenoms: string;
  grade: string;
  poste: string; // distinct du grade — c'est sur le poste que porte le quota annuel
  affectation: string;
  situationFamille: string;
  indice: string;
  dateNaissance: string; // ISO, pour la règle de départ en retraite
}

// Simule la table employés en base. À remplacer par une vraie requête Prisma
// GET /api/employes?matricule=... une fois le backend prêt.
export const mockEmployees: Employee[] = [
  {
    matricule: "22P582",
    nom: "NKOLO ATANGANA",
    prenoms: "Stacy Julie",
    grade: "Ingénieur Stagiaire",
    poste: "Ingénieur Sécurité Réseaux",
    affectation: "DEX",
    situationFamille: "Célibataire",
    indice: "410",
    dateNaissance: "2002-03-14",
  },
  {
    matricule: "19P344",
    nom: "MBO",
    prenoms: "Alain",
    grade: "Ingénieur Principal",
    poste: "Chef de Département DRH",
    affectation: "DRH",
    situationFamille: "Marié",
    indice: "620",
    // Volontairement proche de l'âge de retraite par défaut (60 ans en 2026)
    // pour pouvoir tester la règle de blocage.
    dateNaissance: "1967-05-02",
  },
  {
    matricule: "21P118",
    nom: "TEDONGMOUO",
    prenoms: "Abel",
    grade: "Ingénieur",
    poste: "Responsable Infrastructure",
    affectation: "DEX",
    situationFamille: "Marié",
    indice: "540",
    dateNaissance: "1990-11-20",
  },
  {
    matricule: "20P276",
    nom: "FOUPOUAGNIGNI",
    prenoms: "Nassair",
    grade: "Ingénieur Principal",
    poste: "Chef de Projet",
    affectation: "SDARHAS",
    situationFamille: "Célibataire",
    indice: "580",
    dateNaissance: "1988-01-09",
  },
];

export function findEmployeeByMatricule(matricule: string): Employee | undefined {
  return mockEmployees.find((e) => e.matricule === matricule);
}
