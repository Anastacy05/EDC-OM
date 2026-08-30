// Valeurs définies/modifiées par l'Administrateur OM (cf. cahier des charges),
// éditables depuis /admin.
//
// MODIFIÉ (26/08/2026, étape 14) : la persistance par localStorage est
// commentée plus bas (`sauvegarder`/`charger`) — même motif que
// lib/mockData.ts, commenté le même jour. `configOM` redevient donc une
// valeur PAR DÉFAUT, propre au processus serveur, sans persistance entre deux
// rechargements.
//
// ⚠️ Ce fichier n'est déjà plus la source de vérité pour la validation
// métier : la table `configuration` existe en base depuis l'étape 3 et c'est
// elle que lit lib/data/om.ts (`getConfiguration().ageRetraite`) pour bloquer
// un départ en mission. Modifier l'âge ici, depuis /parametres, n'a donc
// **aucun effet** sur les créations d'OM — l'encart amber de la page le dit
// déjà. La bascule de cette page sur la table réelle est l'étape 9
// (MODELE-DONNEES.md §13), pas celle-ci : on ne fait ici que retirer le
// pont localStorage devenu trompeur, pas rebrancher l'écriture.
//
// ⚠️ Pas encore de contrôle d'accès à l'échelle du fichier : le formulaire
// /parametres est protégé par `exigerAdministrateur` (layout), mais cette
// fonction elle-même ne vérifie rien — elle ne doit être appelée que depuis
// un contexte déjà gardé.
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

// COMMENTÉE avec sauvegarder()/charger() plus bas : n'était référencée que là.
// const CLE_STOCKAGE = "edc-om-config";

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

// COMMENTÉ (26/08/2026, étape 14) — lecture/écriture localStorage. `configOM`
// ne vit plus que dans la mémoire du processus serveur pour la durée d'une
// requête : `mettreAJourConfig`/`reinitialiserConfig` mutent toujours l'objet
// en place (donc `/parametres` continue de fonctionner à l'écran), mais plus
// rien n'est conservé d'un rechargement à l'autre — ce n'était de toute façon
// déjà vrai que PAR NAVIGATEUR, jamais partagé entre postes.
//
// function sauvegarder(): void {
//   if (typeof window === "undefined") return; // rendu serveur — pas de localStorage
//   try {
//     localStorage.setItem(CLE_STOCKAGE, JSON.stringify(configOM));
//   } catch {
//     // stockage plein ou indisponible (navigation privée, quota dépassé...) —
//     // on continue silencieusement, la config reste au moins en mémoire.
//   }
// }
//
// function charger(): void {
//   if (typeof window === "undefined") return; // rendu serveur — pas de localStorage
//   try {
//     const brut = localStorage.getItem(CLE_STOCKAGE);
//     if (!brut) return;
//     const stocke = JSON.parse(brut) as Partial<ConfigOM>;
//
//     // Fusion sur les valeurs par défaut, pas remplacement : un champ ajouté
//     // plus tard resterait sinon `undefined` pour tout navigateur ayant déjà
//     // sauvegardé une version antérieure de la config.
//     configOM.ageRetraite = ageRetraiteValide(stocke.ageRetraite)
//       ? stocke.ageRetraite
//       : CONFIG_PAR_DEFAUT.ageRetraite;
//   } catch {
//     // JSON corrompu — on garde les valeurs par défaut plutôt que de planter
//   }
// }
//
// Hydratation au chargement du module — commentée avec charger() ci-dessus.
// charger();
function sauvegarder(): void {
  // no-op : cf. commentaire ci-dessus.
}

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

