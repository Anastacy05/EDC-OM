import "dotenv/config";
import { createTransport } from "nodemailer";

/**
 * Diagnostic de la configuration SMTP.
 *
 *   npx tsx prisma/verifierMail.ts                    → vérifie la connexion
 *   npx tsx prisma/verifierMail.ts moi@exemple.cm     → envoie un message d'essai
 *
 * Sans destinataire, RIEN N'EST ENVOYÉ : le script ouvre la connexion, présente
 * les identifiants, puis raccroche. C'est ce qu'il faut pour valider un `.env`
 * sans importuner personne.
 *
 * ── Pourquoi ce script ne réutilise pas lib/mail/transport.ts ────────────────
 *
 * Même raison que `prisma/creerCompte.ts` : ce module est marqué
 * `import "server-only"`, dont l'entrée principale lève une exception hors du
 * rendu serveur de React. Les options de connexion sont donc recopiées ici — et
 * ELLES DOIVENT RESTER ALIGNÉES sur celles de `lib/mail/transport.ts`, sinon le
 * diagnostic validerait une configuration que l'application n'utilise pas.
 */

function lireEnvironnement() {
  const hote = process.env.SMTP_HOTE?.trim();
  if (!hote) {
    console.error("\n  ✖ SMTP_HOTE est vide : l'envoi de courriels est désactivé.\n");
    console.error("    Ce n'est pas une panne — la file `mail_en_attente` accumule les");
    console.error("    messages, et l'écran d'invitation affiche le lien à transmettre à");
    console.error("    la main. Renseigner SMTP_HOTE dans .env pour activer l'envoi.\n");
    process.exit(1);
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`\n  ✖ SMTP_PORT invalide : « ${process.env.SMTP_PORT} ».\n`);
    process.exit(1);
  }

  const utilisateur = process.env.SMTP_UTILISATEUR?.trim() || undefined;
  const motDePasse = process.env.SMTP_MOT_DE_PASSE || undefined;
  if ((utilisateur && !motDePasse) || (!utilisateur && motDePasse)) {
    console.error("\n  ✖ SMTP_UTILISATEUR et SMTP_MOT_DE_PASSE vont ensemble.\n");
    process.exit(1);
  }

  return {
    hote,
    port,
    utilisateur,
    motDePasse,
    tlsImmediat: port === 465,
    certificatAutoSigne: process.env.SMTP_CERTIFICAT_AUTOSIGNE === "true",
    expediteur: process.env.MAIL_EXPEDITEUR?.trim() || "noreply@edc.cm",
    nomExpediteur: process.env.MAIL_NOM_EXPEDITEUR?.trim() || "EDC — Ordres de mission",
  };
}

/** Traduit les échecs courants en cause probable plutôt qu'en code. */
function expliquer(erreur: unknown): string[] {
  const code = (erreur as { code?: string })?.code;
  const reponse = (erreur as { response?: string })?.response;

  switch (code) {
    case "EAUTH":
      return [
        "Identifiants refusés par le serveur.",
        "• Brevo : la valeur attendue est la CLÉ SMTP, pas la clé d'API.",
        "  Elle se trouve dans « SMTP & API » → onglet « SMTP » du tableau de bord.",
        "• Zimbra : vérifier que la boîte existe et que son mot de passe est à jour.",
        ...(reponse ? [`Réponse du serveur : ${reponse}`] : []),
      ];
    case "ECONNREFUSED":
      return [
        "Connexion refusée : rien n'écoute sur cet hôte et ce port.",
        "• Vérifier SMTP_HOTE et SMTP_PORT.",
        "• Un pare-feu d'entreprise bloque fréquemment le port 25 en sortie ;",
        "  essayer 587, ou 2525 chez Brevo.",
      ];
    case "ETIMEDOUT":
    case "ESOCKET":
      return [
        "Délai dépassé, ou dialogue TLS impossible.",
        "• Cause la plus fréquente : mauvais couple port / chiffrement. 465 attend",
        "  du TLS dès l'ouverture, 587 attend du clair puis STARTTLS.",
        "• Certificat non vérifiable sur un serveur interne : voir",
        "  SMTP_CERTIFICAT_AUTOSIGNE (dernier recours) ou NODE_EXTRA_CA_CERTS.",
      ];
    case "EDNS":
    case "ENOTFOUND":
      return ["Nom d'hôte introuvable : vérifier l'orthographe de SMTP_HOTE."];
    default:
      return [
        erreur instanceof Error ? erreur.message : String(erreur),
        ...(reponse ? [`Réponse du serveur : ${reponse}`] : []),
      ];
  }
}

async function principal() {
  const config = lireEnvironnement();
  const destinataire = process.argv[2]?.trim();

  console.log("\n  Configuration lue dans .env");
  console.log("  ─────────────────────────────────────────────────────────────");
  console.log(`  Hôte           ${config.hote}:${config.port}`);
  console.log(
    `  Chiffrement    ${config.tlsImmediat ? "TLS dès l'ouverture (465)" : "STARTTLS exigé"}`
  );
  console.log(
    `  Authentif.     ${config.utilisateur ? config.utilisateur : "aucune (relais ouvert)"}`
  );
  if (config.certificatAutoSigne) {
    console.log("  Certificat     ⚠️ NON VÉRIFIÉ (SMTP_CERTIFICAT_AUTOSIGNE=true)");
  }
  console.log(`  Expéditeur     ${config.nomExpediteur} <${config.expediteur}>`);
  console.log("");

  const transport = createTransport({
    host: config.hote,
    port: config.port,
    secure: config.tlsImmediat,
    requireTLS: !config.tlsImmediat,
    auth: config.utilisateur
      ? { user: config.utilisateur, pass: config.motDePasse }
      : undefined,
    tls: { rejectUnauthorized: !config.certificatAutoSigne },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    await transport.verify();
    console.log("  ✔ Le serveur répond et accepte les identifiants.\n");
  } catch (erreur) {
    console.error("  ✖ Échec de la connexion.\n");
    for (const ligne of expliquer(erreur)) console.error(`    ${ligne}`);
    console.error("");
    transport.close();
    process.exit(1);
  }

  if (!destinataire) {
    console.log("  Aucun destinataire indiqué : aucun message n'a été envoyé.");
    console.log("  Pour un essai réel :  npx tsx prisma/verifierMail.ts vous@exemple.cm\n");
    transport.close();
    return;
  }

  try {
    const info = await transport.sendMail({
      from: { name: config.nomExpediteur, address: config.expediteur },
      to: destinataire,
      subject: "Essai de configuration — ordres de mission EDC",
      text: [
        "Ce message confirme que l'envoi de courriels est correctement configuré.",
        "",
        `Serveur : ${config.hote}:${config.port}`,
        "",
        "Aucune action n'est attendue de votre part.",
      ].join("\n"),
      headers: { "Auto-Submitted": "auto-generated" },
    });

    console.log(`  ✔ Message accepté pour ${destinataire}.`);
    console.log(`    Identifiant : ${info.messageId}`);
    if (info.rejected.length) {
      console.log(`    ⚠️ Refusés : ${info.rejected.join(", ")}`);
    }
    console.log("");
    console.log("    « Accepté » signifie que le RELAIS l'a pris en charge, pas que la");
    console.log("    boîte l'a reçu. Vérifier l'arrivée, y compris les indésirables :");
    console.log("    un domaine d'expéditeur non vérifié y atterrit régulièrement.\n");
  } catch (erreur) {
    console.error(`  ✖ Envoi refusé.\n`);
    for (const ligne of expliquer(erreur)) console.error(`    ${ligne}`);
    console.error("");
    process.exit(1);
  } finally {
    transport.close();
  }
}

principal().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
