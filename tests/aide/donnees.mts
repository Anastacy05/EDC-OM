import "server-only";

/**
 * Jeu de données d'essai : semis et nettoyage.
 *
 * ── Une règle qui n'est pas négociable ───────────────────────────────────────
 *
 * **Tout ce qui est créé ici porte une marque reconnaissable**, et le nettoyage
 * ne supprime QUE ce qui la porte :
 *
 *   • matricules préfixés `99T`
 *   • adresses en `@essai.invalid` — le domaine `.invalid` est réservé par la
 *     RFC 2606 précisément pour ça : il ne peut pas exister, donc un message
 *     parti par erreur n'atteint personne.
 *
 * La règle du projet est qu'on ne supprime jamais rien ; ces lignes sont
 * l'exception, et c'est pourquoi la marque est étroite. Un nettoyage écrit
 * « `deleteMany` sur `employe` » effacerait le vrai personnel.
 *
 * ⚠️ Ce module est `server-only` : les tests qui l'importent doivent être lancés
 * avec `--conditions=react-server` (c'est ce que fait `npm run test:e2e`).
 */

import { prisma } from "@/lib/data/client";
import { hacherMotDePasse } from "@/lib/auth/motDePasse";

/** Préfixe des matricules d'essai. */
export const PREFIXE_ESSAI = "99T";

/** Domaine des adresses d'essai (RFC 2606 : ne peut pas exister). */
export const DOMAINE_ESSAI = "essai.invalid";

/**
 * Compte administrateur des tests.
 *
 * Un compte DÉDIÉ, et non celui de l'utilisatrice : un test qui pose un mot de
 * passe sur `admin@edc.cm` le laisserait derrière lui. C'est arrivé le
 * 22/08/2026, et il a fallu réémettre un lien.
 */
export const ADMIN_ESSAI = {
  email: `admin.essai@${DOMAINE_ESSAI}`,
  motDePasse: "MotDePasseEssai-2026!",
} as const;

/**
 * Second administrateur d'essai, **non fondateur**.
 *
 * Indispensable pour éprouver la restriction : sans lui, on ne peut pas vérifier
 * qu'un administrateur ordinaire est bien refusé. Un test qui ne montre que le
 * cas autorisé ne prouve rien de la garde.
 */
export const ADMIN_ORDINAIRE = {
  email: `admin.ordinaire@${DOMAINE_ESSAI}`,
  motDePasse: "AutreMotDePasse-2026!",
} as const;

export interface EmployeEssai {
  matricule: string;
  nom: string;
  prenoms: string;
  codeStatut?: string;
  codeDepartement?: string;
  actif?: boolean;
}

/**
 * Crée (ou remet à neuf) un administrateur pour les tests, et renvoie ses
 * identifiants. Idempotent : rejouable sans échouer sur un doublon.
 */
export async function semerAdministrateur(): Promise<typeof ADMIN_ESSAI> {
  const empreinte = await hacherMotDePasse(ADMIN_ESSAI.motDePasse);

  await prisma.utilisateur.upsert({
    where: { email: ADMIN_ESSAI.email },
    update: { motDePasseHash: empreinte, actif: true, role: "ADMINISTRATEUR" },
    // `estFondateur` reste FAUX : un index unique partiel n'autorise qu'un seul
    // fondateur, et l'écraser retirerait la capacité au compte réel. Les tests
    // qui en ont besoin l'empruntent via `avecCapaciteFondateur`.
    create: {
      email: ADMIN_ESSAI.email,
      role: "ADMINISTRATEUR",
      motDePasseHash: empreinte,
      matricule: null,
    },
  });

  return ADMIN_ESSAI;
}

/** Second administrateur, non fondateur. Même contrat que ci-dessus. */
export async function semerAdministrateurOrdinaire(): Promise<typeof ADMIN_ORDINAIRE> {
  const empreinte = await hacherMotDePasse(ADMIN_ORDINAIRE.motDePasse);

  await prisma.utilisateur.upsert({
    where: { email: ADMIN_ORDINAIRE.email },
    update: { motDePasseHash: empreinte, actif: true, role: "ADMINISTRATEUR" },
    create: {
      email: ADMIN_ORDINAIRE.email,
      role: "ADMINISTRATEUR",
      motDePasseHash: empreinte,
      matricule: null,
    },
  });

  return ADMIN_ORDINAIRE;
}

/**
 * Crée un employé d'essai. Les codes de référentiel sont pris en base si l'appelant
 * ne les impose pas — les figer casserait au moindre changement de seed.
 */
export async function semerEmploye(employe: EmployeEssai): Promise<string> {
  if (!employe.matricule.startsWith(PREFIXE_ESSAI)) {
    throw new Error(
      `Matricule d'essai « ${employe.matricule} » : il doit commencer par ` +
        `« ${PREFIXE_ESSAI} », sinon le nettoyage ne le retrouvera pas.`
    );
  }

  const [statut, departement] = await Promise.all([
    employe.codeStatut
      ? { code: employe.codeStatut }
      : prisma.statut.findFirstOrThrow({ select: { code: true } }),
    employe.codeDepartement
      ? { code: employe.codeDepartement }
      : prisma.departement.findFirstOrThrow({ select: { code: true } }),
  ]);

  const donnees = {
    nom: employe.nom,
    prenoms: employe.prenoms,
    dateNaissance: new Date(Date.UTC(1990, 4, 12)),
    dateEmbauche: new Date(Date.UTC(2015, 0, 5)),
    situationFamille: "CELIBATAIRE" as const,
    codeStatut: statut.code,
    codeDepartement: departement.code,
    grade: "Ingénieur",
    fonction: "CHARGÉ D'ÉTUDES",
    actif: employe.actif ?? true,
    // ⚠️ La contrainte `employe_desactivation_datee` — `CHECK (actif OR
    // desactive_le IS NOT NULL)` — impose cette date dès que `actif` est faux.
    // Sans elle, semer un employé désactivé échoue sur une erreur 23514
    // (constaté le 22/08/2026 en écrivant les tests). La date sert à invalider un
    // OM créé APRÈS le départ : elle n'est donc pas décorative.
    desactiveLe: (employe.actif ?? true) ? null : new Date(Date.UTC(2026, 0, 15)),
  };

  await prisma.employe.upsert({
    where: { matricule: employe.matricule },
    update: donnees,
    create: { matricule: employe.matricule, ...donnees },
  });

  return employe.matricule;
}

/**
 * Supprime tout le jeu d'essai. À appeler en `before` ET en `after` : un test
 * interrompu laisse des traces, et repartir d'un état sale fait échouer le suivant
 * pour une raison qui n'a rien à voir avec lui.
 *
 * L'ordre suit les dépendances de clés étrangères ; `onDelete: Cascade` ne couvre
 * pas tout.
 */
export async function nettoyerEssai(): Promise<void> {
  const comptes = await prisma.utilisateur.findMany({
    where: {
      OR: [
        { email: { endsWith: `@${DOMAINE_ESSAI}` } },
        { matricule: { startsWith: PREFIXE_ESSAI } },
      ],
    },
    select: { id: true },
  });
  const identifiants = comptes.map((c) => c.id);

  if (identifiants.length > 0) {
    await prisma.jetonMotDePasse.deleteMany({
      where: { idUtilisateur: { in: identifiants } },
    });
    await prisma.sessionRenouvellement.deleteMany({
      where: { idUtilisateur: { in: identifiants } },
    });
    await prisma.notification.deleteMany({
      where: { idDestinataire: { in: identifiants } },
    });
    await prisma.utilisateur.deleteMany({ where: { id: { in: identifiants } } });
  }

  await prisma.employe.deleteMany({
    where: { matricule: { startsWith: PREFIXE_ESSAI } },
  });

  await prisma.mailEnAttente.deleteMany({
    where: { destinataire: { endsWith: `@${DOMAINE_ESSAI}` } },
  });
}

/** Ferme la connexion. Sans ça, le processus de test ne rend pas la main. */
export async function fermer(): Promise<void> {
  await prisma.$disconnect();
}

// ---------------------------------------------------------------------------
// Capacité de fondateur : emprunt temporaire
// ---------------------------------------------------------------------------

/**
 * Prête la capacité de fondateur à un compte d'essai, le temps d'une fonction.
 *
 * ── Pourquoi il faut l'emprunter ─────────────────────────────────────────────
 *
 * Un seul compte peut être fondateur — un index UNIQUE partiel l'impose. Pour
 * éprouver « le fondateur peut créer un administrateur », le compte qui agit DOIT
 * donc être le fondateur. Il n'y a pas d'autre voie : le vrai fondateur est le
 * compte de l'utilisatrice, dont on n'a pas le mot de passe et dont il serait
 * inacceptable d'en poser un.
 *
 * ⚠️ **La capacité est RENDUE dans un `finally`.** Elle revient donc même si le
 * test échoue ou lève. Le seul cas non couvert est l'arrêt brutal du processus
 * (Ctrl+C, coupure) — auquel cas la réparation est :
 *
 *     npx tsx prisma/creerCompte.ts <email-du-vrai-fondateur> ADMINISTRATEUR --fondateur
 *
 * `verifierFondateurIntact()` ci-dessous sert à détecter la situation.
 */
export async function avecCapaciteFondateur<T>(
  email: string,
  travail: () => Promise<T>
): Promise<T> {
  const titulaire = await prisma.utilisateur.findFirst({
    where: { estFondateur: true },
    select: { id: true, email: true },
  });

  const emprunteur = await prisma.utilisateur.findUniqueOrThrow({
    where: { email },
    select: { id: true },
  });

  // Retrait PUIS pose, dans une transaction : l'index unique refuserait deux
  // porteurs simultanés, donc l'ordre inverse échouerait.
  await prisma.$transaction([
    prisma.utilisateur.updateMany({
      where: { estFondateur: true },
      data: { estFondateur: false },
    }),
    prisma.utilisateur.update({
      where: { id: emprunteur.id },
      data: { estFondateur: true },
    }),
  ]);

  try {
    return await travail();
  } finally {
    await prisma.$transaction([
      prisma.utilisateur.updateMany({
        where: { estFondateur: true },
        data: { estFondateur: false },
      }),
      // Rien à restaurer s'il n'y avait aucun fondateur au départ : on ne va pas
      // en inventer un.
      ...(titulaire
        ? [
            prisma.utilisateur.update({
              where: { id: titulaire.id },
              data: { estFondateur: true },
            }),
          ]
        : []),
    ]);
  }
}

/**
 * Vérifie qu'aucun compte d'essai ne détient la capacité de fondateur.
 *
 * Appelée en fin de suite : c'est le filet qui signale un emprunt non rendu, au
 * lieu de laisser le dépôt dans un état incohérent sans que personne le sache.
 */
export async function verifierFondateurIntact(): Promise<
  { ok: true; titulaire: string | null } | { ok: false; usurpateur: string }
> {
  const fondateur = await prisma.utilisateur.findFirst({
    where: { estFondateur: true },
    select: { email: true },
  });

  if (fondateur?.email.endsWith(`@${DOMAINE_ESSAI}`)) {
    return { ok: false, usurpateur: fondateur.email };
  }
  return { ok: true, titulaire: fondateur?.email ?? null };
}

/**
 * Jeu d'employés aux noms accentués, pour éprouver la recherche.
 *
 * Les noms sont réalistes pour le Cameroun et couvrent trois classes de
 * caractères : É (aigu), Ï (tréma), È (grave). Un jeu sans accent ne prouverait
 * rien de la fonction `sans_accent()`.
 */
export const EMPLOYES_ACCENTUES: readonly EmployeEssai[] = [
  { matricule: "99TACC1", nom: "NGUÉ", prenoms: "Éloïse Marie" },
  { matricule: "99TACC2", nom: "MBIDA ÉTOUNDI", prenoms: "René" },
  { matricule: "99TACC3", nom: "NGUZ", prenoms: "Albert" },
  { matricule: "99TACC4", nom: "TCHOUMÈGNE", prenoms: "Françoise" },
  { matricule: "99TACC5", nom: "SANSACCENT", prenoms: "Paul" },
] as const;

/** Sème le jeu accentué. Séquentiel : l'ordre d'insertion doit être déterministe. */
export async function semerAccentues(): Promise<void> {
  for (const employe of EMPLOYES_ACCENTUES) await semerEmploye(employe);
}

/**
 * Sème `combien` employés numérotés, pour éprouver la pagination.
 *
 * Les noms sont préfixés `ZZPAGINATION` : ils se classent en fin de tri
 * alphabétique, donc ils ne s'intercalent pas dans les jeux des autres tests. Le
 * numéro est complété à trois chiffres pour que l'ordre alphabétique coïncide
 * avec l'ordre numérique — sinon « 10 » précède « 2 » et les assertions sur
 * l'ordre deviennent illisibles.
 */
export async function semerPagination(combien: number): Promise<void> {
  for (let i = 1; i <= combien; i += 1) {
    const numero = String(i).padStart(3, "0");
    await semerEmploye({
      matricule: `99TPAG${numero}`,
      nom: `ZZPAGINATION${numero}`,
      prenoms: `Agent ${numero}`,
    });
  }
}

export { prisma };
