import type { OrdreMission, Participant, Frais } from "@/types/om";

const CLE_STOCKAGE = "edc-om-mock-data";

// Données de démarrage — utilisées tant que localStorage est vide (première
// visite, navigation privée, ou stockage vidé).
const donneesParDefaut: OrdreMission[] = [
  {
    id: "mission-1",
    destination: "Douala",
    viaPassage: "Edéa",
    motif: "Mission technique de supervision du projet GANDAL",
    financement: "Budget interne EDC",
    moyenTransport: "Véhicule de service",
    dateDepart: "2026-08-28",
    dateRetour: "2026-08-31",
    visas: [
      {
        departDe: "Yaoundé",
        departLe: "2026-08-28",
        departHeure: "07:00",
        arriveeA: "Edéa",
        arriveeLe: "2026-08-28",
        arriveeHeure: "10:30",
      },
      {
        departDe: "Edéa",
        departLe: "2026-08-28",
        departHeure: "11:00",
        arriveeA: "Douala",
        arriveeLe: "2026-08-28",
        arriveeHeure: "13:00",
      },
    ],
    participants: [
      {
        id: "part-1",
        matricule: "22P582",
        nom: "NKOLO ATANGANA",
        prenoms: "Stacy Julie",
        grade: "Ingénieur Stagiaire",
        poste: "Ingénieur Sécurité Réseaux",
        affectation: "DEX",
        situationFamille: "Célibataire",
        indice: "410",
        numeroOM: "0142",
        nomEmetteur: "MBO Alain",
        gradeEmetteur: "Ingénieur",
        fonctionEmetteur: "Chef de Département DRH",
        lieuEmission: "Yaoundé",
        dateEmission: "2026-08-26",
        statut: "EN_ATTENTE",
        fraisPrevisionnels: [
          { id: "frais-1", type: "Transport", montant: 45000, description: "Billet aller-retour" },
          { id: "frais-2", type: "Hébergement", montant: 60000 },
        ],
        fraisReels: [],
      },
    ],
  },
];

// Le tableau exporté doit garder la MÊME référence tout au long de la vie de
// l'app (tout le monde fait `import { mockOMs }`) — donc on ne le réassigne
// jamais, on le mute toujours en place (splice/push), y compris à
// l'hydratation depuis localStorage.
export const mockOMs: OrdreMission[] = [...donneesParDefaut];

function sauvegarder(): void {
  if (typeof window === "undefined") return; // rendu serveur — pas de localStorage
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(mockOMs));
  } catch {
    // stockage plein ou indisponible (navigation privée, quota dépassé...) —
    // on continue silencieusement, la donnée reste au moins en mémoire.
  }
}

function charger(): void {
  if (typeof window === "undefined") return; // rendu serveur — pas de localStorage
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    if (!brut) return;
    const donnees: OrdreMission[] = JSON.parse(brut);
    mockOMs.splice(0, mockOMs.length, ...donnees);
  } catch {
    // JSON corrompu — on garde les données par défaut plutôt que de planter
  }
}

// Hydratation au chargement du module. Ne fait rien côté serveur (guard
// ci-dessus) ; côté navigateur, remplace les données par défaut par ce qui
// a été sauvegardé lors d'une session précédente.
charger();

// Utile en dev pour repartir de zéro sans vider le cache du navigateur.
export function reinitialiserMockOMs(): void {
  mockOMs.splice(0, mockOMs.length, ...donneesParDefaut);
  sauvegarder();
}

export function getMockOM(id: string): OrdreMission | undefined {
  return mockOMs.find((om) => om.id === id);
}

export function getMockParticipant(
  omId: string,
  participantId: string
): { om: OrdreMission; participant: Participant } | undefined {
  const om = getMockOM(omId);
  const participant = om?.participants.find((p) => p.id === participantId);
  return om && participant ? { om, participant } : undefined;
}

// Création — une mission (infos de trajet) + un ou plusieurs participants,
// chacun démarrant "en attente" avec un id généré. Correspond à l'étape
// "enregistrer" du flux de validation (après l'aperçu). Les frais
// prévisionnels peuvent être fournis dès la création ; les frais réels
// démarrent toujours vides (saisis après la mission).
export function addMockOM(
  missionDraft: Omit<OrdreMission, "id" | "participants">,
  participantsDraft: (Omit<Participant, "id" | "statut" | "fraisReels"> & {
    fraisPrevisionnels?: Frais[];
  })[]
): OrdreMission {
  const nouvelleMission: OrdreMission = {
    ...missionDraft,
    id: crypto.randomUUID(),
    participants: participantsDraft.map((p) => ({
      ...p,
      id: crypto.randomUUID(),
      statut: "EN_ATTENTE",
      fraisPrevisionnels: p.fraisPrevisionnels ?? [],
      fraisReels: [],
    })),
  };
  mockOMs.push(nouvelleMission);
  sauvegarder();
  return nouvelleMission;
}

// Numéro d'OM séquentiel mock — à remplacer par une vraie séquence côté
// PostgreSQL (auto-increment ou séquence dédiée, cf AMELIORATIONS.md #4). Compte simplement les participations déjà enregistrées.
export function genererProchainNumeroOM(): string {
  const total = mockOMs.reduce((n, om) => n + om.participants.length, 0);
  return String(total + 1).padStart(4, "0");
}

// Les 3 actions du cahier des charges, chacune contrainte à un statut de
// départ précis — pas de transition "libre".

// Utilisateur OM : confirmer un OM en attente.
export function confirmerParticipant(omId: string, participantId: string): void {
  const found = getMockParticipant(omId, participantId);
  if (found && found.participant.statut === "EN_ATTENTE") {
    found.participant.statut = "CONFIRME";
    sauvegarder();
  }
}

// Administrateur OM : annuler un OM déjà confirmé.
export function annulerParticipant(omId: string, participantId: string): void {
  const found = getMockParticipant(omId, participantId);
  if (found && found.participant.statut === "CONFIRME") {
    found.participant.statut = "ANNULE";
    sauvegarder();
  }
}

// Utilisateur OM : supprimer un OM en attente (uniquement).
// Si c'était le dernier participant, la mission entière disparaît.
export function supprimerParticipant(omId: string, participantId: string): boolean {
  const om = getMockOM(omId);
  if (!om) return false;
  const participant = om.participants.find((p) => p.id === participantId);
  if (!participant || participant.statut !== "EN_ATTENTE") return false;

  om.participants = om.participants.filter((p) => p.id !== participantId);
  if (om.participants.length === 0) {
    const index = mockOMs.findIndex((o) => o.id === omId);
    if (index !== -1) mockOMs.splice(index, 1);
  }
  sauvegarder();
  return true;
}

export function ajouterFrais(
  omId: string,
  participantId: string,
  categorie: "previsionnel" | "reel",
  frais: Omit<Frais, "id">
): void {
  const found = getMockParticipant(omId, participantId);
  if (!found) return;
  const nouveauFrais: Frais = { ...frais, id: crypto.randomUUID() };
  if (categorie === "previsionnel") {
    found.participant.fraisPrevisionnels.push(nouveauFrais);
  } else {
    found.participant.fraisReels.push(nouveauFrais);
  }
  sauvegarder();
}

// Toutes les participations d'un employé, tous OM confondus — utilisé par
// les règles métier (concurrence, quota annuel).
export function getParticipationsDeEmploye(matricule: string) {
  const resultats: { om: OrdreMission; participant: Participant }[] = [];
  for (const om of mockOMs) {
    for (const participant of om.participants) {
      if (participant.matricule === matricule) {
        resultats.push({ om, participant });
      }
    }
  }
  return resultats;
}
