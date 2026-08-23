import { lireDonneesFormulaireOM } from "@/lib/data/om";
import FormulaireOM from "./FormulaireOM";

/**
 * Création d'un ordre de mission — enveloppe SERVEUR.
 *
 * ── Pourquoi une enveloppe, et pas une page cliente ──────────────────────────
 *
 * Le formulaire a besoin d'interactivité, il reste donc client. Mais il a aussi
 * besoin de données que seul le serveur peut lire : les employés ACTIFS, la
 * classification des zones, le barème, l'âge de retraite. Trois d'entre elles
 * viennent de tables que les RH peuvent corriger sans redéploiement.
 *
 * Surtout, `getConfiguration()` est **asynchrone**, alors que l'écran est client.
 * `lib/data/configuration.ts` posait le problème : « les pages qui l'utilisent
 * doivent devenir des composants serveur, ou recevoir la valeur en props ». Cette
 * enveloppe prend la seconde branche — il n'y a donc pas besoin d'entamer l'étape 9
 * pour brancher la règle de retraite.
 *
 * ── La garde ─────────────────────────────────────────────────────────────────
 *
 * `lireDonneesFormulaireOM` appelle `exigerSession()`, qui redirige vers la
 * connexion si besoin. La garde n'est donc pas ici, mais dans le DAL — le seul
 * endroit qu'aucun chemin ne contourne.
 */

export const metadata = { title: "Nouvel ordre de mission — EDC OM" };

export default async function NouvelOMPage() {
  const donnees = await lireDonneesFormulaireOM();
  return <FormulaireOM donnees={donnees} />;
}
