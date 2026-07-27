export interface Employee {
  matricule: string;
  nom: string;
  prenoms: string;
  grade: string;
  affectation: string;
  situationFamille: string;
  indice: string;
}

// Simule la table employés côté Spring Boot. À remplacer par un
// GET /api/employes?matricule=... une fois le backend prêt.
export const mockEmployees: Employee[] = [
  {
    matricule: "22P582",
    nom: "NKOLO ATANGANA",
    prenoms: "Stacy Julie",
    grade: "Stagiaire",
    affectation: "DEX",
    situationFamille: "Célibataire",
    indice: "410",
  },
  {
    matricule: "19P344",
    nom: "MBO",
    prenoms: "Alain",
    grade: "Secretaire Général",
    affectation: "DRH",
    situationFamille: "Marié",
    indice: "620",
  },
  {
    matricule: "21P118",
    nom: "TEDONGMOUO",
    prenoms: "Abel",
    grade: "Analyste",
    affectation: "DEX",
    situationFamille: "Marié",
    indice: "540",
  },
  {
    matricule: "20P276",
    nom: "FOUPOUAGNIGNI",
    prenoms: "Nassair",
    grade: "Directeur",
    affectation: "SDARHAS",
    situationFamille: "Célibataire",
    indice: "580",
  },
  {
    matricule: "22P190",
    nom: "MAGNE",
    prenoms: "Isabelle",
    grade: "Stagiaire",
    affectation: "DEX",
    situationFamille: "Mariée",
    indice: "545",
  },
];

export function findEmployeeByMatricule(matricule: string): Employee | undefined {
  return mockEmployees.find((e) => e.matricule === matricule);
}
