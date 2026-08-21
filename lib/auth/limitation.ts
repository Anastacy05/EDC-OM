import "server-only";

/**
 * Limitation du nombre de tentatives de connexion.
 *
 * ── Ce que ça protège ────────────────────────────────────────────────────────
 *
 * Argon2 ralentit déjà chaque essai à ~130 ms, ce qui plafonne une attaque par
 * force brute à quelques essais par seconde et par cœur. C'est beaucoup pour un
 * mot de passe faible : 5 essais/s font 400 000 essais par jour. Le verrou
 * temporaire ferme cet écart.
 *
 * ── Sa limite, à connaître ───────────────────────────────────────────────────
 *
 * Le compteur vit **en mémoire du processus**. Il est donc perdu au
 * redémarrage, et il ne serait pas partagé entre plusieurs instances si
 * l'application était déployée en parallèle. Pour un déploiement mono-serveur —
 * le cas de l'EDC — c'est suffisant. Si l'architecture change, ce module est le
 * seul à remplacer (par une table ou un Redis).
 *
 * On ne verrouille PAS le compte en base, volontairement : ce serait offrir à
 * un tiers le moyen de bloquer n'importe quel employé en épuisant ses essais.
 * Le verrou est temporaire et lié au couple compte + adresse.
 */

const SEUIL = 5; // essais ratés avant verrou
const FENETRE_MS = 15 * 60 * 1000; // durée d'observation et du verrou
const MAX_ENTREES = 10_000; // garde-fou mémoire

interface Compteur {
  essais: number;
  /** Instant du dernier essai raté : sert à la péremption de l'entrée. */
  dernierEssai: number;
}

const compteurs = new Map<string, Compteur>();

function cle(email: string, adresseIp: string | null): string {
  return `${email.trim().toLowerCase()}|${adresseIp ?? "?"}`;
}

/**
 * Purge les entrées péremptées. Appelée à chaque écriture plutôt que par un
 * minuteur : un `setInterval` au niveau module empêcherait le processus de
 * s'arrêter proprement et tournerait aussi pendant le build.
 */
function purger(): void {
  const limite = Date.now() - FENETRE_MS;
  for (const [k, v] of compteurs) {
    if (v.dernierEssai < limite) compteurs.delete(k);
  }
  // Filet de sécurité : si la purge n'a pas suffi (attaque distribuée générant
  // des clés neuves en masse), on repart de zéro plutôt que de gonfler
  // indéfiniment. Perdre les compteurs est moins grave que saturer la mémoire.
  if (compteurs.size > MAX_ENTREES) compteurs.clear();
}

/**
 * Secondes restantes avant de pouvoir réessayer, ou 0 si la voie est libre.
 */
export function attenteRestante(email: string, adresseIp: string | null): number {
  const c = compteurs.get(cle(email, adresseIp));
  if (!c || c.essais < SEUIL) return 0;
  const restant = c.dernierEssai + FENETRE_MS - Date.now();
  return restant > 0 ? Math.ceil(restant / 1000) : 0;
}

export function enregistrerEchec(email: string, adresseIp: string | null): void {
  purger();
  const k = cle(email, adresseIp);
  const c = compteurs.get(k);
  compteurs.set(k, {
    essais: (c?.essais ?? 0) + 1,
    dernierEssai: Date.now(),
  });
}

/** Remet le compteur à zéro : une connexion réussie efface l'ardoise. */
export function enregistrerSucces(email: string, adresseIp: string | null): void {
  compteurs.delete(cle(email, adresseIp));
}
