// Une étape du trajet (une ligne du tableau VISAS, page 2 du document).
export interface VisaLeg {
  departDe: string;
  departLe: string;
  departHeure: string;
  arriveeA: string;
  arriveeLe: string;
  arriveeHeure: string;
}

// Correspond 1:1 aux balises docxtemplater du template .docx.
export interface OrdreMission {
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
