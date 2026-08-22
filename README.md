# EDC-OM — Ordres de mission
   Application de gestion des **ordres de mission** (OM) et, à terme, des **congés** de
   l'Electricity Development Corporation.

   L'interface, le code et les commentaires sont **en français** : les utilisateurs sont
   francophones, et le vocabulaire métier (matricule, statut, indemnité de mission, jour
   ouvrable) n'a pas d'équivalent anglais fidèle.

   - **Modèle de données et décisions d'architecture** : [MODELE-DONNEES.md](MODELE-DONNEES.md)
   - **Consignes pour les agents de code** : [AGENTS.md](AGENTS.md)

   ---

   ## Prérequis

   | Outil | Version | Pourquoi |
   |---|---|---|
   | **Node.js** | **≥ 24.7.0** | `crypto.argon2`, qui hache les mots de passe, n'existe qu'à partir de cette version. En
   dessous, l'authentification échoue. Vérifier : `node --version`. |
   | **Docker** + Compose v2 | — | Fait tourner PostgreSQL 16 en local. |
   | **npm** | fourni avec Node | — |
   | `openssl` | facultatif | Seulement pour `npm run test:e2e` (certificat SMTP jetable). Fourni avec Git pour Windows. |

   > **PostgreSQL 16 et pas moins** : le modèle utilise une contrainte `EXCLUDE` sur un
   > `int4range` (plages de numéros d'OM), des types énumérés et des `CHECK`.
   > `docker-compose.yml` s'en charge — rien à installer à la main.

   ---

   ## Démarrage après un clone

   Sept étapes. **L'ordre compte** : chacune suppose la précédente.

   ### 1. Installer les dépendances

   ```bash
   npm install
   ```

   ### 2. Créer le fichier `.env`

   ```bash
   cp .env.example .env
   ```

   `.env.example` est suivi par git et documente chaque variable ; `.env` est ignoré et
   contient vos valeurs. **Ne jamais mettre de secret dans `.env.example`.**

   ### 3. Générer la clé de signature des sessions

   `AUTH_SECRET` est vide dans le modèle, et l'application ne démarre pas sans elle.

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   Recopier le résultat dans `.env` :

   ```
   AUTH_SECRET="la-valeur-obtenue"
   ```

   > La changer plus tard **déconnecte tout le monde** : les jetons en circulation
   > deviennent invérifiables. En production, la conserver dans un gestionnaire de secrets.

   ### 4. Démarrer la base de données

   ```bash
   docker compose up -d
   ```

   Le port exposé est **5433** et non 5432, pour ne pas entrer en conflit avec une
   installation PostgreSQL déjà présente sur le poste. Les extensions `btree_gist` et
   `unaccent` sont installées automatiquement à la création du volume.

   Attendre qu'elle soit prête :

   ```bash
   docker compose ps
   ```

   La colonne `STATUS` doit indiquer `healthy`. Les étapes suivantes échoueraient sinon,
   sur un `ECONNREFUSED` peu explicite.

   ### 5. Créer le schéma et les référentiels

   ```bash
   npx prisma migrate dev
   ```

   Applique les migrations, régénère le client Prisma **et** lance le seed des référentiels
   (statuts, directions, zones, pays, barèmes, jours fériés). Le seed est **idempotent** :
   le rejouer n'a aucun effet de bord.

   ```bash
   npx prisma db seed   # pour le rejouer seul
   ```

   ### 6. Créer le premier administrateur

   C'est l'étape qu'on oublie : sans compte, **aucune page n'est accessible** — tout est
   derrière l'authentification.

   ```bash
   npx tsx prisma/creerCompte.ts votre.nom@edc.cm ADMINISTRATEUR --fondateur
   ```

   Le script imprime un **lien à usage unique, valable 48 h**. L'ouvrir dans le navigateur
   pour choisir son mot de passe.

   > **Pourquoi le mot de passe n'est pas un argument** : il finirait dans l'historique du
   > shell et dans la liste des processus. Seul le titulaire choisit son mot de passe —
   > personne d'autre ne le connaît, pas même qui crée le compte.

   > **`--fondateur`** donne le droit, exclusif, de créer et de révoquer d'autres
   > administrateurs depuis l'écran. Un seul compte peut le porter ; le reposer sur un autre
   > **transfère** la capacité. C'est l'issue de secours si le titulaire perd son accès.

   ### 7. Lancer l'application

   ```bash
   npm run dev
   ```

   Ouvrir **http://localhost:3000** et se connecter avec le compte de l'étape 6.

   ---

   ## Envoi de courriels (facultatif en développement)

   L'application envoie un courriel pour transmettre les liens de mot de passe. **Sans
   configuration, rien n'échoue** : la file `mail_en_attente` accumule les messages et
   l'écran affiche le lien à transmettre à la main.

   Pour activer l'envoi, renseigner les variables `SMTP_*` dans `.env`, puis vérifier
   **sans rien envoyer** :

   ```bash
   npx tsx prisma/verifierMail.ts                 # teste la connexion
   npx tsx prisma/verifierMail.ts vous@exemple.cm # essai réel
   ```

   Le choix de SMTP plutôt qu'une API propriétaire est délibéré : l'EDC dispose d'un service
   Zimbra, et la bascule depuis Brevo sera un changement de variables d'environnement, sans
   une ligne de code. Voir MODELE-DONNEES.md §16.

   ---

   ## Commandes

   | Commande | Effet |
   |---|---|
   | `npm run dev` | Serveur de développement (Turbopack) |
   | `npm run build` | Build de production |
   | `npm start` | Sert le build de production |
   | `npm run lint` | ESLint |
   | `npx tsc --noEmit` | Vérification des types |
   | `npm test` | Tests unitaires — **~1 s, aucun prérequis** |
   | `npm run test:e2e` | Tests de bout en bout — exige Docker, compile l'application (~1 min) |
   | `npm run test:tout` | Les deux |

   ### Base de données

   | Commande | Effet |
   |---|---|
   | `docker compose up -d` | Démarre PostgreSQL |
   | `docker compose stop` | Arrête, **en gardant les données** |
   | `docker compose down -v` | ⚠️  Supprime le volume : **toutes les données sont perdues** |
   | `npx prisma migrate dev` | Applique les migrations + seed |
   | `npx prisma migrate reset` | ⚠️  Vide et recrée tout, puis rejoue le seed |
   | `npx prisma studio` | Explorateur de la base dans le navigateur |

   ### Comptes

   | Commande | Effet |
   |---|---|
   | `npx tsx prisma/creerCompte.ts <email> ADMINISTRATEUR` | Crée un administrateur |
   | `npx tsx prisma/creerCompte.ts <email> UTILISATEUR <matricule>` | Crée un utilisateur rattaché à un employé |
   | `… --fondateur` | Donne (ou transfère) le droit de gérer les administrateurs |

   Relancer la commande sur un compte existant **réémet un lien** : c'est le parcours
   « mot de passe oublié » en attendant un écran dédié.

   ---

   ## Tests

   Deux jeux, séparés parce qu'ils n'ont pas le même coût.

   ```bash
   npm test         # validation employé, modèles de courriel, classement des échecs SMTP
   npm run test:e2e # connexion, invitation, recherche, pagination, motif de sortie, rôles
   ```

   Les tests de bout en bout démarrent un vrai serveur, un vrai serveur SMTP jetable, et
   parlent à la vraie base. Trois points utiles :

   - ils compilent dans **`.next-test`** et non `.next` — un `npm run dev` peut donc tourner
     en parallèle sans être perturbé ;
   - toutes leurs données portent une marque (`99T…`, `@essai.invalid`) et sont supprimées en
     fin de suite. **Aucune donnée réelle n'est touchée** ;
   - un test emprunte temporairement la capacité de fondateur et la rend systématiquement. Si
     un arrêt brutal l'interrompait, la suite le signale et donne la commande de réparation.

   Le socle réutilisable vit dans `tests/aide/` : client HTTP, serveur SMTP jetable, semis de
   données, lancement du serveur.

   ---

   ## Structure

   ```
   app/                    routes (App Router)
     connexion/            authentification
     mot-de-passe/[jeton]/ définition du mot de passe
     om/                   ordres de mission
     personnel/            employés (admin)
     parametres/           réglages + administrateurs (admin)
     rapports/             carte, frise, pyramide (admin)
   lib/
     auth/                 jetons, sessions, gardes, hachage
     data/                 couche d'accès aux données — `server-only`
     mail/                 transport SMTP et modèles de messages
   components/             composants partagés
   prisma/                 schéma, migrations, seed, scripts d'exploitation
   tests/                  unitaires + bout en bout
   proxy.ts                filtrage des requêtes (ex-`middleware.ts`)
   ```

   ### Deux règles à connaître avant de contribuer

   1. **Toute lecture ou écriture de données passe par `lib/data/`, et chaque fonction y porte
      sa propre garde d'autorisation.** Une Server Action est une route HTTP joignable
      directement : masquer un bouton ne protège rien. `proxy.ts` fait un premier tri, il ne
      remplace pas ces gardes.

   2. **On ne supprime pas de code : on le commente**, avec la raison et la date. Cela laisse
      des symboles orphelins qu'ESLint signale en avertissement — c'est attendu, il ne faut
      pas les « corriger » en supprimant.

   ---

   ## Dépannage

   **`DATABASE_URL est absente`**
   → `.env` manque. `cp .env.example .env`.

   **`ECONNREFUSED` sur le port 5433**
   → La base n'est pas démarrée. `docker compose up -d`, puis attendre `healthy`.

   **`crypto.argon2 is not a function`**
   → Node trop ancien. Il faut **≥ 24.7.0**.


   **`crypto.argon2 is not a function`**
   → Node trop ancien. Il faut **≥ 24.7.0**.