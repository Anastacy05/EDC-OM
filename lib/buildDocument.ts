import type { OrdreMission, Participant, OrdreMissionDocument, VisaLeg } from "@/types/om";

const LEG_VIDE: VisaLeg = {
  departDe: "",
  departLe: "",
  departHeure: "",
  arriveeA: "",
  arriveeLe: "",
  arriveeHeure: "",
};

// La boucle {#visas} du template DISPARAÎT complètement (zéro ligne) si on
// lui donne un tableau vide — hors, ces cases doivent rester visibles même
// vides, pour un remplissage manuel a posteriori (comme le reste de la
// page 2). On garantit donc toujours au moins 3 lignes ; s'il y a plus de 3
// vraies étapes le jour où la fonctionnalité est réactivée, elles
// s'affichent normalement en plus.
const NB_LIGNES_VISAS_MIN = 3;

function visasAffiches(visas: VisaLeg[] | undefined): VisaLeg[] {
  const lignes = visas ? [...visas] : [];
  while (lignes.length < NB_LIGNES_VISAS_MIN) lignes.push({ ...LEG_VIDE });
  return lignes;
}

// Un même OM peut concerner plusieurs employés, mais le document Word
// (comme l'aperçu à l'écran) est toujours individuel — un fichier par
// participant. Cette fonction reconstruit l'objet plat correspondant aux
// balises du template à partir de la mission + d'UN participant.
export function buildDocumentForParticipant(
  om: OrdreMission,
  participant: Participant
): OrdreMissionDocument {
  return {
    numeroOM: participant.numeroOM,
    nom: participant.nom,
    prenoms: participant.prenoms,
    grade: participant.grade,
    affectation: participant.affectation,
    matricule: participant.matricule,
    situationFamille: participant.situationFamille,
    indice: participant.indice,
    destination: om.destination,
    viaPassage: om.viaPassage,
    motif: om.motif,
    financement: om.financement,
    moyenTransport: om.moyenTransport,
    dateDepart: om.dateDepart,
    dateRetour: om.dateRetour,
    nomEmetteur: participant.nomEmetteur,
    gradeEmetteur: participant.gradeEmetteur,
    fonctionEmetteur: participant.fonctionEmetteur,
    lieuEmission: participant.lieuEmission,
    dateEmission: participant.dateEmission,
    chapitre: om.chapitre,
    article: om.article,
    paragraphe: om.paragraphe,
    exercice: om.exercice,
    exerciceAnnee: om.exerciceAnnee,
    visas: visasAffiches(om.visas),
  };
}
