/**
 * Textes des courriels sortants.
 *
 * ── Texte brut, pas de HTML ──────────────────────────────────────────────────
 *
 * Trois raisons, dans l'ordre d'importance :
 *
 * 1. **Le lien est visible.** Un courriel HTML masque l'adresse derrière un
 *    libellé (« Définir mon mot de passe »), ce qui est exactement la forme d'un
 *    hameçonnage. En texte brut, le destinataire LIT l'adresse avant de cliquer
 *    et peut vérifier qu'elle commence bien par celle de l'application. Pour un
 *    message qui vaut un mot de passe, ça compte plus que la mise en forme.
 *
 * 2. **La table n'a qu'une colonne `corps`.** Stocker les deux formes
 *    demanderait une migration. Et une file qui garde le HTML devient un
 *    gabarit figé : un message mis en file aujourd'hui et émis demain porterait
 *    l'ancienne présentation.
 *
 * 3. Rien à casser : ni image bloquée, ni style ignoré, ni rendu différent d'un
 *    client à l'autre. La plupart des lecteurs rendent l'URL cliquable d'office.
 *
 * ── Pas de `server-only` ─────────────────────────────────────────────────────
 *
 * Ce module ne fait que produire des chaînes : il ne lit ni la base ni
 * l'environnement. Le laisser importable partout permet de le tester sans
 * démarrer de serveur.
 */

export interface Courriel {
  sujet: string;
  corps: string;
}

/** Signature commune, pour que tous les messages se terminent pareil. */
const SIGNATURE = [
  "",
  "— ",
  "Application des ordres de mission",
  "Electricity Development Corporation",
  "",
  "Message automatique : cette adresse ne reçoit pas de réponse.",
].join("\n");

/**
 * Invitation à définir son mot de passe.
 *
 * Sert aussi de réinitialisation : le parcours est identique, seul le texte
 * change. Les distinguer par deux fonctions dupliquerait le lien, l'avertissement
 * et la signature — donc garantirait qu'une correction n'atteigne qu'une des
 * deux.
 *
 * ⚠️ `lien` contient le jeton en clair. C'est inévitable : c'est l'objet même du
 * message. Cela implique que ce texte ne doit JAMAIS être journalisé, et que la
 * ligne de `mail_en_attente` qui le porte est aussi sensible que la table des
 * jetons.
 */
export function courrielInvitation(options: {
  lien: string;
  validiteHeures: number;
  /** Vrai si le compte avait déjà un mot de passe : le message ne promet pas la même chose. */
  reinitialisation: boolean;
}): Courriel {
  const { lien, validiteHeures, reinitialisation } = options;

  const sujet = reinitialisation
    ? "Réinitialisation de votre mot de passe"
    : "Votre accès à l'application des ordres de mission";

  const ouverture = reinitialisation
    ? [
        "Une réinitialisation de votre mot de passe a été demandée.",
        "",
        "Ouvrez l'adresse ci-dessous pour en choisir un nouveau :",
      ]
    : [
        "Un compte vient d'être créé pour vous sur l'application des ordres de",
        "mission de l'EDC.",
        "",
        "Ouvrez l'adresse ci-dessous pour choisir votre mot de passe :",
      ];

  const corps = [
    "Bonjour,",
    "",
    ...ouverture,
    "",
    lien,
    "",
    `Ce lien est valable ${validiteHeures} heures et ne fonctionne qu'une seule fois.`,
    "Passé ce délai, demandez-en un nouveau à votre administrateur.",
    "",
    // Dit à celui qui n'a rien demandé quoi faire. Sans cette phrase, la seule
    // réaction possible devant un message inattendu est de cliquer pour voir.
    reinitialisation
      ? "Si vous n'êtes pas à l'origine de cette demande, ne suivez pas ce lien et"
      : "Si vous n'attendiez pas ce message, ne suivez pas ce lien et",
    "signalez-le à votre administrateur : votre mot de passe actuel reste valable",
    "tant que ce lien n'est pas utilisé.",
    SIGNATURE,
  ].join("\n");

  return { sujet, corps };
}
