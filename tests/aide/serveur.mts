/**
 * Lancement et arrêt du serveur applicatif pour les tests de bout en bout.
 *
 * ── `next start` et non `next dev` ───────────────────────────────────────────
 *
 * Deux raisons, toutes deux tirées d'incidents réels :
 *
 * 1. En développement, chaque route est compilée à la première requête : la
 *    première visite d'une page peut dépasser trente secondes, ce qui ressemble à
 *    un blocage et fait dépasser les délais d'attente.
 * 2. Le rendu de production est celui des utilisateurs. Le 21/08/2026, un défaut
 *    n'apparaissait qu'au prérendu (`missing-suspense-with-csr-bailout`) et restait
 *    invisible en `next dev`.
 *
 * ⚠️ **Production et développement partagent `.next` et se marchent dessus.** Le
 * 22/08/2026, un build lancé pendant qu'un serveur de développement tournait a
 * cassé le chargement des polices — erreur obscure (« Can't resolve
 * @vercel/turbopack-next/internal/font/google/font ») qui a coûté un long
 * diagnostic. D'où `DOSSIER_BUILD` : les tests compilent dans `.next-test`, via
 * la variable `EDC_DIST_DIR` que `next.config.ts` lit pour son `distDir`.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import net from "node:net";

/** Répertoire de sortie distinct, pour ne pas piétiner le `.next` de travail. */
const DOSSIER_BUILD = ".next-test";

export interface ServeurApp {
  url: string;
  arreter(): Promise<void>;
}

/**
 * Réserve un port libre, puis le relâche.
 *
 * ── Pourquoi pas simplement `--port 0` ───────────────────────────────────────
 *
 * Parce que l'application a besoin de connaître sa propre adresse AVANT de
 * démarrer : `APP_URL` sert à construire les liens de mot de passe, et elle est
 * lue dans l'environnement. Avec le port 0, on ne l'apprendrait qu'après le
 * démarrage — il faudrait relancer le serveur, ce qui double le temps d'attente.
 *
 * Il reste une fenêtre de concurrence entre la libération et le démarrage de
 * Next. Elle est étroite et sans conséquence ici : une seule suite de tests tourne
 * à la fois, et un `EADDRINUSE` se verrait immédiatement dans le message d'erreur.
 */
export function reserverPort(): Promise<number> {
  return new Promise((resoudre, rejeter) => {
    const sonde = net.createServer();
    sonde.on("error", rejeter);
    sonde.listen(0, "127.0.0.1", () => {
      const adresse = sonde.address();
      const port = typeof adresse === "object" && adresse ? adresse.port : 0;
      sonde.close(() => resoudre(port));
    });
  });
}

/** Attend que le serveur réponde, ou lève au bout de `limiteMs`. */
async function attendreReponse(
  url: string,
  limiteMs: number,
  /** Renvoie un message si le processus est mort, pour abandonner tout de suite. */
  mort: () => string | null = () => null
): Promise<void> {
  const echeance = Date.now() + limiteMs;
  let derniereErreur = "";

  while (Date.now() < echeance) {
    const fatal = mort();
    if (fatal) throw new Error(fatal);

    try {
      // `/connexion` et non `/` : cette page est publique, donc un 200 y prouve
      // que l'application rend vraiment. La racine redirige vers la connexion
      // quand personne n'est authentifié, ce qui rendrait le test ambigu.
      const reponse = await fetch(`${url}/connexion`, { redirect: "manual" });
      if (reponse.status < 500) return;
      derniereErreur = `HTTP ${reponse.status}`;
    } catch (erreur) {
      derniereErreur = erreur instanceof Error ? erreur.message : String(erreur);
    }
    await new Promise((suite) => setTimeout(suite, 400));
  }

  throw new Error(
    `Le serveur n'a pas répondu sur ${url} en ${limiteMs / 1000} s. ` +
      `Dernière erreur : ${derniereErreur}`
  );
}

/**
 * Compile l'application dans un répertoire séparé.
 *
 * Appelé une fois par exécution de la suite. Coûteux (~20 s), mais c'est le prix
 * d'un test qui éprouve le rendu réel.
 */
export async function compiler(env: Record<string, string> = {}): Promise<void> {
  const processus = spawn("npx", ["next", "build"], {
    env: { ...process.env, ...env, EDC_DIST_DIR: DOSSIER_BUILD },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  let sortie = "";
  processus.stdout?.on("data", (bloc) => (sortie += bloc));
  processus.stderr?.on("data", (bloc) => (sortie += bloc));

  const [code] = (await once(processus, "exit")) as [number | null];
  if (code !== 0) {
    throw new Error(`\`next build\` a échoué (code ${code}) :\n${sortie.slice(-3000)}`);
  }
}

/**
 * Démarre le serveur sur un port réservé, en injectant `APP_URL`.
 *
 * ── Pourquoi `APP_URL` est posée ici ─────────────────────────────────────────
 *
 * L'application construit les liens de mot de passe sur `APP_URL` et non sur
 * l'en-tête `Host`, qui est fourni par le client donc falsifiable. Sans cette
 * injection, les liens reçus par courriel pointeraient sur le port 3000 et les
 * tests les trouveraient inutilisables — pour une raison qui n'a rien à voir avec
 * le code testé.
 *
 * L'appelant peut la surcharger via `env` s'il veut éprouver ce cas précis.
 */
export async function demarrerApp(
  env: Record<string, string> = {}
): Promise<ServeurApp> {
  const port = await reserverPort();
  const url = `http://localhost:${port}`;

  const processus: ChildProcess = spawn(
    "npx",
    ["next", "start", "--port", String(port)],
    {
      env: { ...process.env, APP_URL: url, ...env, EDC_DIST_DIR: DOSSIER_BUILD },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    }
  );

  let sortie = "";
  const surveiller = (bloc: Buffer) => {
    sortie += bloc.toString();
  };
  processus.stdout?.on("data", surveiller);
  processus.stderr?.on("data", surveiller);

  // Une sortie prématurée est signalée tout de suite : sans ça, on attendrait
  // soixante secondes une réponse d'un processus déjà mort.
  let mort: string | null = null;
  processus.on("exit", (code) => {
    mort = `Le serveur s'est arrêté (code ${code}) :\n${sortie.slice(-2000)}`;
  });

  try {
    await attendreReponse(url, 60_000, () => mort);
  } catch (erreur) {
    await arreterProcessus(processus);
    throw erreur;
  }

  return {
    url,
    arreter: () => arreterProcessus(processus),
  };
}

/**
 * Termine le serveur et son arborescence.
 *
 * ⚠️ Sous Windows, `kill()` ne touche que le processus lancé — `npx` — et laisse
 * le vrai serveur Node détenir le port. `taskkill /T` termine l'arborescence.
 * Sans ça, le port reste occupé et l'exécution suivante échoue sur `EADDRINUSE`.
 */
async function arreterProcessus(processus: ChildProcess): Promise<void> {
  if (processus.exitCode !== null) return;

  if (process.platform === "win32" && processus.pid) {
    spawn("taskkill", ["/PID", String(processus.pid), "/T", "/F"], {
      stdio: "ignore",
      shell: true,
    });
  } else {
    processus.kill("SIGTERM");
  }

  await Promise.race([
    once(processus, "exit"),
    new Promise((suite) => setTimeout(suite, 8_000)),
  ]);
}

export { DOSSIER_BUILD };
