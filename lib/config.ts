// Valeurs définies/modifiées par l'Administrateur OM (cf. cahier des charges),
// éditables depuis /admin et conservées d'une session à l'autre dans
// localStorage — même mécanique que lib/mockData.ts pour les OM.
//
// À remplacer par une table `configuration` PostgreSQL le jour où Prisma est
// branché : `configOM` deviendra le résultat d'une requête, `mettreAJourConfig`
// un UPDATE. Les appelants (lib/businessRules.ts) n'auront pas à bouger.
//
// ⚠️ Pas encore de contrôle d'accès : les rôles ne sont pas implémentés, donc
// n'importe qui atteignant /admin peut écrire ici.

export interface ConfigOM {
  // Âge à partir duquel un employé ne peut plus partir en mission.
  ageRetraite: number;

  // Nombre maximum de missions par an, selon le POSTE occupé (pas le grade :
  // c'est la fonction dans l'organigramme qui justifie de se déplacer, pas le
  // titre statutaire). Les clés sont les valeurs du référentiel POSTES
  // (lib/referentiels.ts) — toute clé qui n'y correspond pas est morte.
  //
  // Une clé ABSENTE vaut "illimité" (cf. quotaAnnuelPourPoste). C'est le seul
  // encodage possible de l'illimité : Infinity ne survit pas à
  // JSON.stringify, qui le transforme en null.
  tauxMissionAnnuelParPoste: Record<string, number>;
}

// Les plafonds croissent avec le niveau hiérarchique. ⚠️ Valeurs à faire
// valider par les RH : elles sont plausibles, pas officielles.
//
// PCA et Membre du Conseil d'Administration sont volontairement absents : ce
// sont des mandats de gouvernance, non soumis à un quota. L'écran /admin les
// affiche quand même (il lit POSTES, pas ces clés-ci), donc un plafond peut
// leur être imposé à tout moment.
const CONFIG_PAR_DEFAUT: ConfigOM = {
  ageRetraite: 60,
  tauxMissionAnnuelParPoste: {
    "Directeur Général": 24,
    "Directeur Général Adjoint": 20,
    Directeur: 12,
    "Sous-Directeur": 10,
    "Chef de Service": 8,
    "Chef de Bureau": 6,
    Cadre: 6,
    "Agent de maîtrise": 4,
    "Employé de bureau": 4,
  },
};

const CLE_STOCKAGE = "edc-om-config";

function copieParDefaut(): ConfigOM {
  return {
    ...CONFIG_PAR_DEFAUT,
    tauxMissionAnnuelParPoste: { ...CONFIG_PAR_DEFAUT.tauxMissionAnnuelParPoste },
  };
}

// L'objet exporté doit garder la MÊME référence pendant toute la vie de l'app
// (tout le monde fait `import { configOM }`) — donc on ne le réassigne jamais,
// on le mute toujours en place, y compris à l'hydratation depuis localStorage.
export const configOM: ConfigOM = copieParDefaut();

// Bornes de sécurité : une valeur hors bornes est ignorée plutôt qu'écrite.
// Le formulaire /admin les refuse déjà en amont ; ceci couvre un localStorage
// bricolé à la main ou un appel programmatique.
const AGE_RETRAITE_MIN = 50;
const AGE_RETRAITE_MAX = 75;

function ageRetraiteValide(valeur: unknown): valeur is number {
  return (
    typeof valeur === "number" &&
    Number.isInteger(valeur) &&
    valeur >= AGE_RETRAITE_MIN &&
    valeur <= AGE_RETRAITE_MAX
  );
}

function quotaValide(valeur: unknown): valeur is number {
  return typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 0;
}

// Ne garde que les entrées exploitables — une clé au quota invalide est
// supprimée, donc traitée comme "illimité", plutôt que de figer une valeur
// aberrante dans les règles métier.
function quotasValides(brut: unknown): Record<string, number> {
  if (!brut || typeof brut !== "object") return {};
  const resultat: Record<string, number> = {};
  for (const [poste, quota] of Object.entries(brut as Record<string, unknown>)) {
    if (quotaValide(quota)) resultat[poste] = quota;
  }
  return resultat;
}

function sauvegarder(): void {
  if (typeof window === "undefined") return; // rendu serveur — pas de localStorage
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(configOM));
  } catch {
    // stockage plein ou indisponible (navigation privée, quota dépassé...) —
    // on continue silencieusement, la config reste au moins en mémoire.
  }
}

function charger(): void {
  if (typeof window === "undefined") return; // rendu serveur — pas de localStorage
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    if (!brut) return;
    const stocke = JSON.parse(brut) as Partial<ConfigOM>;

    // Fusion sur les valeurs par défaut, pas remplacement : un champ ajouté
    // plus tard resterait sinon `undefined` pour tout navigateur ayant déjà
    // sauvegardé une version antérieure de la config.
    configOM.ageRetraite = ageRetraiteValide(stocke.ageRetraite)
      ? stocke.ageRetraite
      : CONFIG_PAR_DEFAUT.ageRetraite;
    configOM.tauxMissionAnnuelParPoste = quotasValides(stocke.tauxMissionAnnuelParPoste);
  } catch {
    // JSON corrompu — on garde les valeurs par défaut plutôt que de planter
  }
}

// Hydratation au chargement du module. Ne fait rien côté serveur (guard
// ci-dessus) ; côté navigateur, remplace les valeurs par défaut par celles
// enregistrées lors d'une session précédente.
charger();

// Écriture depuis /admin. Les champs absents du patch ne sont pas touchés.
// Pour rendre un poste "illimité", il faut OMETTRE sa clé du dictionnaire
// passé en `tauxMissionAnnuelParPoste` (le dictionnaire remplace l'ancien,
// il n'est pas fusionné clé à clé).
export function mettreAJourConfig(patch: Partial<ConfigOM>): void {
  if (ageRetraiteValide(patch.ageRetraite)) {
    configOM.ageRetraite = patch.ageRetraite;
  }
  if (patch.tauxMissionAnnuelParPoste !== undefined) {
    configOM.tauxMissionAnnuelParPoste = quotasValides(patch.tauxMissionAnnuelParPoste);
  }
  sauvegarder();
}

export function reinitialiserConfig(): void {
  const defauts = copieParDefaut();
  configOM.ageRetraite = defauts.ageRetraite;
  configOM.tauxMissionAnnuelParPoste = defauts.tauxMissionAnnuelParPoste;
  sauvegarder();
}

export function quotaAnnuelPourPoste(poste?: string): number {
  if (!poste) return Infinity;
  return configOM.tauxMissionAnnuelParPoste[poste] ?? Infinity;
}
