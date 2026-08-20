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
// lui donne un tableau vide — or ces cases doivent rester visibles même
// vides, pour un remplissage manuel a posteriori (comme le reste de la
// page 2). On garantit donc toujours au moins 3 lignes.
//
// (20/08/2026) Les étapes VISA n'étant plus gérées par l'application, cette
// fonction ne reçoit plus de données : elle ne sert QUE à réserver les lignes
// vierges à l'impression. Elle reste donc indispensable — la retirer ferait
// disparaître le tableau du document Word, ce qui est l'inverse du but.
const NB_LIGNES_VISAS_MIN = 3;

function lignesVisasVierges(): VisaLeg[] {
  return Array.from({ length: NB_LIGNES_VISAS_MIN }, () => ({ ...LEG_VIDE }));
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
    // Toujours des lignes vierges : le tableau VISAS du document est rempli à
    // la main, mais ses cases doivent exister à l'impression.
    visas: lignesVisasVierges(),
  };
}
