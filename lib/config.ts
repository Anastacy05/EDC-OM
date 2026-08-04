// Valeurs définies/modifiées par l'Administrateur OM (cf. cahier des charges).
// Pas d'écran d'administration pour l'instant (rôles pas encore implémentés)
// — ce fichier EST la config, en dur. Le jour où l'écran existe, il n'aura
// qu'à écrire ici (ou dans la base PostgreSQL via Prisma une fois branchée).

export const configOM = {
  // Âge à partir duquel un employé ne peut plus partir en mission.
  ageRetraite: 60,

  // Nombre maximum de missions par an, selon le poste de l'employé.
  // Un poste absent de cette table n'a pas de limite (Infinity).
  tauxMissionAnnuelParPoste: {
    "Ingénieur Sécurité Réseaux": 12,
    "Chef de Département DRH": 6,
    "Responsable Infrastructure": 10,
    "Chef de Projet": 8,
  } as Record<string, number>,
};

export function quotaAnnuelPourPoste(poste?: string): number {
  if (!poste) return Infinity;
  return configOM.tauxMissionAnnuelParPoste[poste] ?? Infinity;
}
