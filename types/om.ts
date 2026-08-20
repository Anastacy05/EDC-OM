// Une étape du trajet (une ligne du tableau VISAS, page 2 du document).
//
// ⚠️ DÉCISION (20/08/2026) — les étapes VISA ne sont PLUS GÉRÉES par
// l'application : elles sont renseignées à la main sur le papier, hors de
// l'appli. L'entité `etape_visa` a donc été retirée du modèle de données
// (MODELE-DONNEES.md §5).
//
// Ce type est néanmoins CONSERVÉ, et c'est volontaire : le template Word
// contient une boucle {#visas}...{/visas} qui, si on lui passe un tableau
// vide, fait DISPARAÎTRE les lignes du tableau imprimé. Or ces cases doivent
// rester visibles et vierges pour le remplissage manuel. `visasAffiches()`
// (lib/buildDocument.ts) fabrique donc des étapes vides à la seule fin de
// réserver les lignes à l'impression. Le type sert à ça, plus à stocker
// quoi que ce soit.
export interface VisaLeg {
  departDe: string;
  departLe: string;
  departHeure: string;
  arriveeA: string;
  arriveeLe: string;
  arriveeHeure: string;
}

export type StatutParticipant = "EN_ATTENTE" | "CONFIRME" | "ANNULE";
// À VENIR (MODELE-DONNEES.md §7) — deux états s'ajouteront avec la base :
//   "REFUSE" : l'admin écarte un OM non confirmé, avec motif
//   "EXPIRE" : date de retour passée sans confirmation, posé automatiquement

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
  // Rang hiérarchique (référentiel STATUTS, lib/referentiels.ts) — détermine
  // le frais fixe journalier avec la zone de destination (lib/baremes.ts).
  // Nommé différemment de `statut` ci-dessous pour éviter toute confusion :
  // celui-là est le statut de WORKFLOW de l'OM (en attente/confirmé/annulé),
  // rien à voir avec le rang de la personne.
  statutHierarchique?: string;
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

  // Calculé à la création (statutHierarchique + zone de destination à ce
  // moment-là), pas recalculé ensuite : comme les autres champs "snapshot",
  // il doit refléter la situation au moment de la mission, pas une éventuelle
  // révision ultérieure du barème ou un changement de statut de l'employé.
  montantFraisFixeJournalier?: number;

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
  // COMMENTÉ (20/08/2026) — les étapes VISA ne sont plus gérées par l'appli
  // (renseignées à la main, hors application). Le champ n'était de toute façon
  // jamais alimenté : app/om/nouveau/page.tsx passait `const visas = []`.
  // Les cases vierges du document imprimé sont produites par visasAffiches()
  // dans lib/buildDocument.ts, sans passer par une donnée stockée.
  // visas?: VisaLeg[];
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
