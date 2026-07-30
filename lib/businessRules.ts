import type { Employee } from "@/lib/employees";
import { getParticipationsDeEmploye } from "@/lib/mockData";
import { configOM, quotaAnnuelPourPoste } from "@/lib/config";

// ---------------------------------------------------------------------------
// 1. Concurrence — un employé ne peut pas être sur 2 missions qui se
//    chevauchent. Avertir si l'autre OM est en attente, bloquer si confirmé.
// ---------------------------------------------------------------------------

export type NiveauConflit = "aucun" | "avertissement" | "blocage";

export interface ConflitConcurrence {
  omId: string;
  numeroOM?: string;
  destination?: string;
  dateDepart?: string;
  dateRetour?: string;
  statut: "EN_ATTENTE" | "CONFIRME";
}

export interface ResultatConcurrence {
  niveau: NiveauConflit;
  conflits: ConflitConcurrence[];
}

function chevauchent(debut1?: string, fin1?: string, debut2?: string, fin2?: string): boolean {
  if (!debut1 || !fin1 || !debut2 || !fin2) return false;
  return debut1 <= fin2 && debut2 <= fin1; // format ISO -> comparaison de chaînes valide
}

export function verifierConcurrence(
  matricule: string | undefined,
  dateDepart: string | undefined,
  dateRetour: string | undefined,
  excludeOmId?: string
): ResultatConcurrence {
  if (!matricule || !dateDepart || !dateRetour) return { niveau: "aucun", conflits: [] };

  const conflits: ConflitConcurrence[] = [];
  for (const { om, participant } of getParticipationsDeEmploye(matricule)) {
    if (om.id === excludeOmId) continue;
    if (participant.statut === "ANNULE") continue;
    if (!chevauchent(dateDepart, dateRetour, om.dateDepart, om.dateRetour)) continue;

    conflits.push({
      omId: om.id,
      numeroOM: participant.numeroOM,
      destination: om.destination,
      dateDepart: om.dateDepart,
      dateRetour: om.dateRetour,
      statut: participant.statut,
    });
  }

  const niveau: NiveauConflit = conflits.some((c) => c.statut === "CONFIRME")
    ? "blocage"
    : conflits.length > 0
      ? "avertissement"
      : "aucun";

  return { niveau, conflits };
}

// ---------------------------------------------------------------------------
// 2. Retraite — bloquer si l'employé a atteint l'âge de retraite configuré
//    à la date de départ de la mission.
// ---------------------------------------------------------------------------

function ageA(dateNaissance: string, dateReference: string): number {
  const naissance = new Date(dateNaissance);
  const reference = new Date(dateReference);
  let age = reference.getFullYear() - naissance.getFullYear();
  const pasEncoreAnniversaire =
    reference.getMonth() < naissance.getMonth() ||
    (reference.getMonth() === naissance.getMonth() && reference.getDate() < naissance.getDate());
  if (pasEncoreAnniversaire) age--;
  return age;
}

export interface ResultatRetraite {
  bloque: boolean;
  age: number;
}

export function verifierRetraite(employe: Employee, dateDepart: string): ResultatRetraite {
  const age = ageA(employe.dateNaissance, dateDepart);
  return { bloque: age >= configOM.ageRetraite, age };
}

// ---------------------------------------------------------------------------
// 3. Quota annuel — bloquer si l'employé a atteint le nombre max de missions
//    par an autorisé pour son poste.
// ---------------------------------------------------------------------------

export interface ResultatQuota {
  autorise: boolean;
  utilises: number;
  quota: number;
}

export function verifierQuotaAnnuel(employe: Employee, dateDepart: string): ResultatQuota {
  const annee = new Date(dateDepart).getFullYear();
  const quota = quotaAnnuelPourPoste(employe.poste);

  const utilises = getParticipationsDeEmploye(employe.matricule).filter(({ om, participant }) => {
    if (participant.statut === "ANNULE") return false;
    if (!om.dateDepart) return false;
    return new Date(om.dateDepart).getFullYear() === annee;
  }).length;

  return { autorise: utilises < quota, utilises, quota };
}
