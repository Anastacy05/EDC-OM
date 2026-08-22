import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/data/client";

/**
 * Configuration de l'application (table à ligne unique).
 *
 * Remplace la lecture `localStorage` de lib/config.ts. Deux différences de
 * nature, à connaître avant de brancher les écrans :
 *
 * 1. **C'est asynchrone.** `configOM.ageRetraite` était une lecture synchrone
 *    d'un objet en mémoire ; ici il faut `await`. Les pages qui l'utilisent
 *    doivent donc devenir des composants serveur, ou recevoir la valeur en
 *    props. Le commentaire de lib/config.ts annonçait que « les appelants
 *    n'auront pas à bouger » : c'est vrai de la signature, faux de la nature.
 *
 * 2. **Les bornes sont garanties par la base**, pas seulement par le
 *    formulaire : `CHECK (age_retraite BETWEEN 50 AND 75)`. Un appel
 *    programmatique hors bornes est rejeté par PostgreSQL, pas silencieusement
 *    ignoré comme le faisait `mettreAJourConfig`.
 */

export interface Configuration {
  ageRetraite: number;
  /** Taille des lots de numéros d'OM réservés par poste (création hors ligne). */
  taillePlageNumero: number;
}

/**
 * La ligne 1 est créée par le seed et le `CHECK (id = 1)` interdit qu'il y en
 * ait une autre. Son absence signifie que le seed n'a pas tourné : on échoue
 * franchement plutôt que de renvoyer un âge de retraite par défaut, qui
 * laisserait passer des OM pour des employés retraités.
 */
export const getConfiguration = cache(async (): Promise<Configuration> => {
  const ligne = await prisma.configuration.findUnique({
    where: { id: 1 },
    select: { ageRetraite: true, taillePlageNumero: true },
  });

  if (!ligne) {
    throw new Error(
      "Aucune configuration en base. Lancer `npx prisma db seed` — sans elle, " +
        "l'âge de retraite est inconnu et la règle de blocage ne peut pas " +
        "s'appliquer."
    );
  }

  return {
    ageRetraite: ligne.ageRetraite,
    taillePlageNumero: ligne.taillePlageNumero,
  };
});
