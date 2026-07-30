import type { OrdreMission, Participant, OrdreMissionDocument } from "@/types/om";

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
    visas: om.visas,
  };
}
