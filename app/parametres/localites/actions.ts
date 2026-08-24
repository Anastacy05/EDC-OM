"use server";

import { refresh } from "next/cache";
import {
  ajouterLocalite,
  retirerLocalite,
  NOM_LOCALITE_MAX,
  type EchecLocalite,
} from "@/lib/data/localites";

/**
 * Server Actions de gestion des localités.
 *
 * ── Ce fichier est un point d'entrée HTTP ────────────────────────────────────
 *
 * La doc est explicite : « Server Functions are reachable via direct POST
 * requests, not just through your application's UI. » Que l'écran soit sous
 * `/parametres` — préfixe réservé aux administrateurs par le proxy — ne protège
 * donc pas ces fonctions. C'est `exigerAdministrateurOuEchouer()`, dans le DAL,
 * qui protège ; ces actions se contentent d'attraper l'erreur pour l'afficher
 * plutôt que de laisser remonter une frontière d'erreur.
 */

export interface EtatLocalite {
  erreur?: string;
  succes?: string;
}

function message(echec: EchecLocalite): string {
  switch (echec.genre) {
    case "paysInconnu":
      return "Ce pays n'est pas au référentiel. Choisissez-le dans les suggestions : c'est lui qui décide dans quelle liste la localité sera proposée.";
    case "nomVide":
      return "Indiquez le nom de la localité.";
    case "nomTropLong":
      return `Le nom ne peut pas dépasser ${NOM_LOCALITE_MAX} caractères.`;
    case "dejaPresente":
      return "Cette localité est déjà proposée pour ce pays — les accents et la casse ne comptent pas.";
    case "introuvable":
      return "Cette localité n'est plus dans la liste.";
    case "baseIndisponible":
      return "La base de données ne répond pas. Réessayez dans quelques instants — rien n'a été enregistré.";
  }
}

export async function actionAjouterLocalite(
  _precedent: EtatLocalite | undefined,
  formData: FormData
): Promise<EtatLocalite> {
  const pays = String(formData.get("pays") ?? "");
  const nom = String(formData.get("nom") ?? "");

  let resultat: Awaited<ReturnType<typeof ajouterLocalite>>;
  try {
    resultat = await ajouterLocalite(pays, nom);
  } catch (erreur) {
    // La garde du DAL lève avec un message destiné à l'utilisateur : on le
    // reprend tel quel plutôt que d'en inventer un moins précis.
    return { erreur: erreur instanceof Error ? erreur.message : "Action refusée." };
  }

  if (!resultat.ok) return { erreur: message(resultat.echec) };

  // `refresh()` et non `redirect()` : on reste sur l'écran, l'ajout suivant est
  // le geste le plus probable. La liste au-dessus du formulaire est relue.
  refresh();
  return { succes: `« ${nom.trim()} » est désormais proposée pour ${pays.trim()}.` };
}

export async function actionRetirerLocalite(
  _precedent: EtatLocalite | undefined,
  formData: FormData
): Promise<EtatLocalite> {
  const id = String(formData.get("id") ?? "");

  let resultat: Awaited<ReturnType<typeof retirerLocalite>>;
  try {
    resultat = await retirerLocalite(id);
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : "Action refusée." };
  }

  if (!resultat.ok) return { erreur: message(resultat.echec) };

  refresh();
  // Pas de message de succès : la ligne disparaît de la liste, ce qui dit la
  // même chose sans occuper la place. Un état de retour vide suffit — mais il
  // faut le renvoyer, sinon `useActionState` garderait l'erreur précédente.
  return {};
}
