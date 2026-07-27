import type { OrdreMission } from "@/types/om";

// Un OM "mock" a un id + un statut en plus des champs qui iront dans le docx.
export interface OrdreMissionMock extends OrdreMission {
  id: string;
  statut: "EN_ATTENTE" | "CONFIRME" | "ANNULE";
}

// Simule ce que Spring Boot renverra plus tard.
// Remplacé pour de vrai par un fetch vers l'API une fois le backend prêt.
export const mockOMs: OrdreMissionMock[] = [
  {
    id: "1",
    statut: "EN_ATTENTE",
    numeroOM: "0142",
    nom: "NKOLO ATANGANA",
    prenoms: "Stacy Julie",
    grade: "Ingénieur Stagiaire",
    affectation: "DEX",
    matricule: "22P582",
    situationFamille: "Célibataire",
    indice: "410",
    destination: "Douala",
    viaPassage: "Edéa",
    motif: "Mission technique de supervision du projet GANDAL",
    financement: "Budget interne EDC",
    moyenTransport: "Véhicule de service",
    dateDepart: "2026-07-28",
    dateRetour: "2026-07-31",
    nomEmetteur: "MBO Alain",
    gradeEmetteur: "Ingénieur",
    fonctionEmetteur: "Chef de Département DRH",
    lieuEmission: "Yaoundé",
    dateEmission: "2026-07-26",
    visas: [
      {
        departDe: "Yaoundé",
        departLe: "28/07/2026",
        departHeure: "07h00",
        arriveeA: "Edéa",
        arriveeLe: "28/07/2026",
        arriveeHeure: "10h30",
      },
      {
        departDe: "Edéa",
        departLe: "28/07/2026",
        departHeure: "11h00",
        arriveeA: "Douala",
        arriveeLe: "28/07/2026",
        arriveeHeure: "13h00",
      },
    ],
  },
];

export function getMockOM(id: string): OrdreMissionMock | undefined {
  return mockOMs.find((om) => om.id === id);
}

// Ajoute un nouvel OM au tableau mock — en mémoire seulement, donc réinitialisé
// à chaque rechargement complet de la page. À remplacer par un vrai POST vers
// Spring Boot quand le backend sera prêt.
export function addMockOM(om: OrdreMission): OrdreMissionMock {
  const newOM: OrdreMissionMock = {
    ...om,
    id: crypto.randomUUID(),
    statut: "EN_ATTENTE",
  };
  mockOMs.push(newOM);
  return newOM;
}

// Les OM sont non modifiables une fois créés — "confirmer" ne change que le
// statut, jamais les données de la mission (nom, dates, destination, etc.).
export function confirmMockOM(id: string): void {
  const om = mockOMs.find((o) => o.id === id);
  if (om) om.statut = "CONFIRME";
}

export function deleteMockOM(id: string): void {
  const index = mockOMs.findIndex((o) => o.id === id);
  if (index !== -1) mockOMs.splice(index, 1);
}

