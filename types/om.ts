// Une étape du trajet (une ligne du tableau VISAS, page 2 du document).
// Partagée par toute la mission — tout le monde suit le même itinéraire.
export interface VisaLeg {
  departDe: string;
  departLe: string;
  departHeure: string;
  arriveeA: string;
  arriveeLe: string;
  arriveeHeure: string;
}

export type StatutParticipant = "EN_ATTENTE" | "CONFIRME" | "ANNULE";

export interface Frais {
  id: string;
  type: string; // "Transport" | "Hébergement" | "Restauration" | "Autre", etc.
  montant: number;
  description?: string;
}

// Un employé engagé sur la mission. Chacun a son propre document (numéro,
// statut, frais) mais partage les infos de trajet définies au niveau de l'OM.
export interface Participant {
  id: string;
  matricule?: string;
  nom?: string;
  prenoms?: string;
  grade?: string;
  poste?: string;
  affectation?: string;
  situationFamille?: string;
  indice?: string;

  // Propres au document émis pour CET employé
  numeroOM?: string;
  nomEmetteur?: string;
  gradeEmetteur?: string;
  fonctionEmetteur?: string;
  lieuEmission?: string;
  dateEmission?: string;

  statut: StatutParticipant;
  fraisPrevisionnels: Frais[];
  fraisReels: Frais[];
}

// Une mission = les infos de trajet partagées + la liste des participants.
// C'est CET objet qui est stocké (un seul enregistrement même si plusieurs
// employés sont concernés).
export interface OrdreMission {
  id: string;
  // Chaîne composée "Pays, Ville" — c'est elle qui part dans le document
  // Word (une seule balise `destination` dans le template).
  destination?: string;
  // Mêmes informations, gardées séparées pour pouvoir filtrer la liste par
  // pays ou par ville sans redécouper la chaîne. Absentes des OM créés
  // avant leur introduction : passer par `paysEtVilleDeOM` (lib/locations.ts).
  paysDestination?: string;
  villeDestination?: string;
  viaPassage?: string;
  motif?: string;
  financement?: string;
  moyenTransport?: string;
  dateDepart?: string;
  dateRetour?: string;
  chapitre?: string;
  article?: string;
  paragraphe?: string;
  exercice?: string;
  exerciceAnnee?: string;
  visas?: VisaLeg[];
  participants: Participant[];
}

// L'objet "à plat" envoyé à docxtemplater pour UN participant — mission +
// identité + émission, avec exactement les clés des balises du template.
// Construit à la volée par lib/buildDocument.ts, jamais stocké tel quel.
export interface OrdreMissionDocument {
  numeroOM?: string;
  nom?: string;
  prenoms?: string;
  grade?: string;
  affectation?: string;
  matricule?: string;
  situationFamille?: string;
  indice?: string;
  destination?: string;
  viaPassage?: string;
  motif?: string;
  financement?: string;
  moyenTransport?: string;
  dateDepart?: string;
  dateRetour?: string;
  nomEmetteur?: string;
  gradeEmetteur?: string;
  fonctionEmetteur?: string;
  lieuEmission?: string;
  dateEmission?: string;
  chapitre?: string;
  article?: string;
  paragraphe?: string;
  exercice?: string;
  exerciceAnnee?: string;
  visas?: VisaLeg[];
}
