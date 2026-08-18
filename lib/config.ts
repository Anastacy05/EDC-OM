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
//
// Le quota annuel de missions par poste, qui vivait ici, a été retiré à la
// demande du boss (considéré inutile) — cf. historique git pour la version
// avec `tauxMissionAnnuelParPoste`/`quotaAnnuelPourPoste` si jamais il fallait
// la réintroduire.

export interface ConfigOM {
  // Âge à partir duquel un employé ne peut plus partir en mission.
  ageRetraite: number;
}

// ⚠️ Valeur à faire valider par les RH : plausible, pas officielle.
const CONFIG_PAR_DEFAUT: ConfigOM = {
  ageRetraite: 60,
};

const CLE_STOCKAGE = "edc-om-config";

function copieParDefaut(): ConfigOM {
  return { ...CONFIG_PAR_DEFAUT };
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
  } catch {
    // JSON corrompu — on garde les valeurs par défaut plutôt que de planter
  }
}

// Hydratation au chargement du module. Ne fait rien côté serveur (guard
// ci-dessus) ; côté navigateur, remplace les valeurs par défaut par celles
// enregistrées lors d'une session précédente.
charger();

// Écriture depuis /admin.
export function mettreAJourConfig(patch: Partial<ConfigOM>): void {
  if (ageRetraiteValide(patch.ageRetraite)) {
    configOM.ageRetraite = patch.ageRetraite;
  }
  sauvegarder();
}

export function reinitialiserConfig(): void {
  configOM.ageRetraite = CONFIG_PAR_DEFAUT.ageRetraite;
  sauvegarder();
}

