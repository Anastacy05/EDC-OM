# Documentation technique — EDC-OM

**Application de gestion des ordres de mission de l'Electricity Development Corporation.**
État au 26/08/2026, après l'étape 12 du plan de migration (rapports). Ce document est un
**complément** à [README.md](README.md) (installation développeur, commandes) et
[MODELE-DONNEES.md](MODELE-DONNEES.md) (décisions de modélisation, arbitrages métier) —
il ne les recopie pas, il y renvoie et couvre ce qu'ils ne couvrent pas : la référence
exhaustive de chaque page et chaque fonction, et le déploiement en **production**.

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Pile technique et dépendances](#2-pile-technique-et-dépendances)
3. [Installation — développement](#3-installation--développement)
4. [Déploiement — serveur de production](#4-déploiement--serveur-de-production)
5. [Architecture générale](#5-architecture-générale)
6. [Modèle de données — Prisma](#6-modèle-de-données--prisma)
7. [Arborescence du projet](#7-arborescence-du-projet)
8. [Référence des pages (`app/`)](#8-référence-des-pages-app)
9. [Référence de la bibliothèque (`lib/`)](#9-référence-de-la-bibliothèque-lib)
10. [Composants partagés (`components/`)](#10-composants-partagés-components)
11. [État d'avancement du plan de migration](#11-état-davancement-du-plan-de-migration)
12. [Perspectives](#12-perspectives)

---

## 1. Vue d'ensemble

EDC-OM numérise le circuit papier des **ordres de mission** (OM) : création, validation
hiérarchique, génération du document Word, suivi. Un module de **congés** est prévu mais
pas commencé (voir §11). L'interface, le code et les commentaires sont **entièrement en
français** — vocabulaire métier sans équivalent anglais fidèle (matricule, statut, jour
ouvrable, ordre de mission).

**Deux règles de convention à connaître avant de lire le code** (détaillées dans
`README.md` et `AGENTS.md`) :

1. **Toute lecture/écriture passe par `lib/data/`**, et chaque fonction y porte sa propre
   garde d'autorisation (`exigerSession`, `exigerAdministrateur`…) — jamais seulement la
   page ou le layout, parce qu'une Server Action est une route HTTP joignable directement.
2. **On ne supprime pas de code : on le commente**, avec la raison et la date. Le projet
   contient donc des blocs commentés volontaires (`lib/mockData.ts`, `lib/businessRules.ts`,
   `lib/employees.ts` entiers, par exemple) — ce n'est pas de la négligence, c'est
   l'historique des décisions.

---

## 2. Pile technique et dépendances

### 2.1 Runtime et outils

| Outil | Version | Pourquoi |
|---|---|---|
| **Node.js** | **≥ 24.7.0** | `crypto.argon2` (hachage des mots de passe) n'existe qu'à partir de cette version — l'authentification échoue en dessous. |
| **PostgreSQL** | **16** minimum | Contrainte `EXCLUDE` sur un `int4range` (plages de numéros d'OM), types énumérés, `CHECK`. |
| **npm** | fourni avec Node | Gestionnaire de paquets du projet. |
| Docker + Compose v2 | — | Fait tourner PostgreSQL en local — **développement uniquement**, voir §4 pour la production. |

### 2.2 Dépendances applicatives (`package.json`)

⚠️ **Le zip fourni ne contient pas de `package.json`, `tsconfig.json`, `next.config.*` ni
configuration ESLint** — cette section a donc été **reconstituée en lisant les imports du
code source** (`grep` systématique sur tous les fichiers `.ts`/`.tsx`), pas recopiée d'un
fichier de config. Avant tout déploiement, comparer avec le vrai `package.json` du dépôt et
combler les écarts.

| Paquet | Rôle dans le projet |
|---|---|
| `next` | Framework (App Router). |
| `react` | Composants. |
| `@prisma/client` + `@prisma/adapter-pg` | Client de base de données généré et son adaptateur `pg` (Prisma 7 — voir §2.3). |
| `jose` | Signature/vérification des jetons de session (JWT, `lib/auth/jeton.ts`). |
| `nodemailer` | Envoi SMTP des courriels (`lib/mail/transport.ts`). |
| `docxtemplater` + `pizzip` | Génération du document Word de l'OM (`lib/generateOmDocx.ts`) à partir d'un gabarit `.docx`. |
| `ulid` | Identifiants triables par le temps (participations). |
| `lucide-react` | Icônes SVG de toute l'interface. |
| `react-simple-maps` + `world-atlas` | Fond de carte du monde (rapport « carte », `components/CarteMonde.tsx`). |
| `i18n-iso-countries` | **Seulement** la conversion code numérique ISO → alpha-2 des tracés `world-atlas` — le nom et le continent affichés viennent de la base depuis le 26/08/2026, voir §9.9. |
| `country-state-city` | Référentiel pays/villes pour les suggestions de saisie (`lib/locations.ts`) — a aussi servi à amorcer `pays.continent`/`pays.code_zone` au seed. |
| `exceljs` | Export `.xlsx` du rapport « missions par employé » — **import dynamique**, chargé seulement au clic sur « Exporter ». À vérifier/ajouter au `package.json` si absent : ajouté au cours de l'étape 12, jamais utilisé ailleurs avant. |

Bibliothèque native Node **sans dépendance npm** : `node:crypto` fournit `argon2`,
`randomBytes`, `timingSafeEqual`, `createHash` pour tout `lib/auth/motDePasse.ts`.

### 2.3 Prisma 7 — une bascule à connaître

Le projet est sur **Prisma 7**, dont deux comportements diffèrent de Prisma 6 et piègent
si on suit un tutoriel plus ancien :

- **L'URL de la base ne se déclare plus dans `schema.prisma`** (`env("DATABASE_URL")`),
  mais dans **`prisma.config.ts`**, à la racine — c'est ce fichier que lit la CLI, et lui
  seul charge `dotenv`. Une erreur « DATABASE_URL absente » vient de ce fichier, pas du
  schéma.
- **Le client est régénéré dans `lib/generated/prisma/`**, pas dans `node_modules/.prisma/
  client` — l'import applicatif se fait via `lib/data/client.ts`, jamais directement
  `@prisma/client` ailleurs dans le code.

---

## 3. Installation — développement

Couverte en détail par **[README.md](README.md)**, section « Démarrage après un clone » —
sept étapes dans l'ordre : `npm install` → `.env` → `AUTH_SECRET` → `docker compose up -d`
→ `npx prisma migrate dev` → `npx tsx prisma/creerCompte.ts` → `npm run dev`. Ne pas
dupliquer ici : s'y reporter directement, y compris pour le dépannage (`ECONNREFUSED`,
`crypto.argon2 is not a function`, etc.) et la liste des commandes (`npm test`, `npx prisma
studio`…).

Le reste de ce document part du principe que le développement fonctionne déjà, et couvre
ce que le README ne couvre pas : **la mise en production**.

---

## 4. Déploiement — serveur de production

Cette section n'existe dans aucun autre document du projet — c'est le principal ajout de
cette documentation. Le `docker-compose.yml` fourni est **explicitement marqué
développement uniquement** dans ses propres commentaires (mot de passe en clair, port
exposé) : ce qui suit décrit une mise en place distincte, pensée pour rester joignable
uniquement en interne à l'EDC.

### 4.1 Vue d'ensemble de la cible

```
                    ┌─────────────────────────────┐
Internet/Intranet → │  Nginx (reverse proxy, TLS)  │
                    └──────────────┬──────────────┘
                                   │  http://127.0.0.1:3000
                    ┌──────────────▼──────────────┐
                    │   Next.js (process Node,     │
                    │   géré par systemd)          │
                    └──────────────┬──────────────┘
                                   │  connexion réseau interne uniquement
                    ┌──────────────▼──────────────┐
                    │  PostgreSQL 16 (service       │
                    │  systemd ou conteneur dédié)  │
                    └──────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  Serveur SMTP interne EDC     │
                    │  (Zimbra) — voir §4.7         │
                    └──────────────────────────────┘
```

Principe directeur : **la base de données n'est jamais exposée** au-delà de la machine (ou
du réseau privé) qui héberge l'application — ni port public, ni identifiant par défaut.

### 4.2 Préparer le serveur

Sur une machine Linux (Debian/Ubuntu — adapter les commandes de paquets sinon) :

```bash
# Node.js ≥ 24.7.0 — via nvm, pas le paquet de la distribution (souvent trop ancien)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 24.7.0
nvm alias default 24.7.0
node --version   # doit afficher ≥ v24.7.0

# PostgreSQL 16
sudo apt update
sudo apt install -y postgresql-16 postgresql-contrib-16

# Nginx (reverse proxy + TLS)
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 4.3 Base de données de production

**Ne pas réutiliser `docker-compose.yml`** tel quel (mot de passe `edc_dev_only`, port
exposé). À la place, sur l'instance PostgreSQL du serveur :

```sql
CREATE ROLE edc_om WITH LOGIN PASSWORD 'un-mot-de-passe-long-et-généré-aléatoirement';
CREATE DATABASE edc_om OWNER edc_om ENCODING 'UTF8' LC_COLLATE 'fr_FR.UTF-8' LC_CTYPE 'fr_FR.UTF-8';
```

Puis, connecté à la base `edc_om` :

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- contrainte EXCLUDE sur les plages de numéros d'OM
CREATE EXTENSION IF NOT EXISTS unaccent;    -- recherche insensible aux accents
```

(Ce sont exactement les deux extensions que `prisma/init/` installe automatiquement en
développement — à faire à la main ici puisqu'il n'y a pas de conteneur qui les rejoue.)

Dans `pg_hba.conf`, n'autoriser la connexion à `edc_om` que depuis `127.0.0.1` (ou le
réseau privé si l'application tourne sur une autre machine que la base) — jamais `0.0.0.0`.

### 4.4 Récupérer et construire l'application

```bash
git clone <dépôt> /opt/edc-om
cd /opt/edc-om
npm ci                # installation reproductible depuis package-lock.json, pas `npm install`
```

### 4.5 Variables d'environnement de production

Créer `/opt/edc-om/.env` (jamais suivi par git — le modèle documenté est `.env.example`) :

| Variable | Obligatoire | Exemple / valeur | Remarque |
|---|---|---|---|
| `DATABASE_URL` | **oui** | `postgresql://edc_om:motdepasse@127.0.0.1:5432/edc_om` | Lue par `prisma.config.ts`, pas par `schema.prisma` (§2.3). |
| `AUTH_SECRET` | **oui** | (généré, 48 octets aléatoires) | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. **La changer déconnecte tout le monde** — à conserver dans un gestionnaire de secrets, jamais dans le dépôt. |
| `APP_URL` | recommandé | `https://om.edc.cm` | Sert à construire les liens envoyés par courriel (invitation, réinitialisation) — sans elle, `http://localhost:3000` s'y retrouverait. |
| `NODE_ENV` | **oui** | `production` | Active les optimisations Next et désactive les avertissements de développement. |
| `SMTP_HOTE` | recommandé | `smtp.edc.cm` (Zimbra) | Sans SMTP configuré, les courriels s'accumulent dans `mail_en_attente` et les liens doivent être transmis à la main (acceptable en secours, pas en usage normal). |
| `SMTP_PORT` | si SMTP | `587` | STARTTLS attendu — voir `lib/mail/transport.ts`. |
| `SMTP_UTILISATEUR` / `SMTP_MOT_DE_PASSE` | si le serveur l'exige | — | — |
| `SMTP_CERTIFICAT_AUTOSIGNE` | si besoin | `true` | Seulement si le Zimbra interne présente un certificat auto-signé — sinon laisser absente. |
| `MAIL_EXPEDITEUR` | recommandé | `noreply@edc.cm` | Par défaut `noreply@edc.cm` si absente. |
| `MAIL_NOM_EXPEDITEUR` | recommandé | `EDC — Ordres de mission` | — |

Vérifier la connexion SMTP **sans envoyer de courriel réel** :

```bash
npx tsx prisma/verifierMail.ts
```

Permissions du fichier : `chmod 600 .env`, propriétaire l'utilisateur système qui fera
tourner l'application (voir §4.6) — jamais lisible par les autres comptes du serveur.

### 4.6 Schéma, référentiels, build, premier compte

```bash
npx prisma migrate deploy   # applique les migrations SANS générer de nouvelles migrations
                             # (à la différence de `migrate dev`, réservé au développement)
npx prisma db seed          # référentiels : statuts, directions, zones, pays, barèmes, jours fériés
                             # idempotent — sans effet de bord si rejoué

npm run build                # build de production
npx tsx prisma/creerCompte.ts admin@edc.cm ADMINISTRATEUR --fondateur
                             # imprime un lien à usage unique (48h) pour choisir le mot de passe —
                             # sans ce compte, AUCUNE page n'est accessible
```

### 4.7 Faire tourner l'application en continu — systemd

Ne pas laisser `npm run dev`/`npm start` tourner dans un terminal : utiliser un service
système qui redémarre l'application en cas de plantage ou de redémarrage du serveur.

Créer `/etc/systemd/system/edc-om.service` :

```ini
[Unit]
Description=EDC-OM — Ordres de mission
After=network.target postgresql.service

[Service]
Type=simple
User=edc-om
WorkingDirectory=/opt/edc-om
EnvironmentFile=/opt/edc-om/.env
ExecStart=/usr/bin/env node .next/standalone/server.js
Restart=on-failure
RestartSec=5

# Durcissement — l'application n'a besoin d'écrire nulle part sur le disque
# en fonctionnement normal (Prisma parle au réseau, pas au système de fichiers)
ProtectSystem=strict
ReadWritePaths=/opt/edc-om/.next/cache
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

> Le chemin `ExecStart` suppose `output: "standalone"` dans `next.config.*` (à vérifier/
> ajouter — absent du zip fourni, cf. §2.2). Sans ce mode, remplacer par
> `ExecStart=/usr/bin/env npm start` et garder `WorkingDirectory=/opt/edc-om`.

Créer l'utilisateur système dédié (jamais `root`) et démarrer :

```bash
sudo useradd --system --home /opt/edc-om --shell /usr/sbin/nologin edc-om
sudo chown -R edc-om:edc-om /opt/edc-om
sudo systemctl daemon-reload
sudo systemctl enable --now edc-om
sudo systemctl status edc-om     # doit afficher "active (running)"
sudo journalctl -u edc-om -f     # journaux en continu
```

### 4.8 Reverse proxy et HTTPS — Nginx

```nginx
# /etc/nginx/sites-available/edc-om
server {
    listen 80;
    server_name om.edc.cm;
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name om.edc.cm;

    ssl_certificate     /etc/letsencrypt/live/om.edc.cm/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/om.edc.cm/privkey.pem;

    client_max_body_size 10M;   # génération de documents .docx : marge raisonnable

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/edc-om /etc/nginx/sites-enabled/
sudo certbot --nginx -d om.edc.cm   # certificat Let's Encrypt, si le nom est joignable publiquement ;
                                     # sinon utiliser un certificat émis par l'AC interne de l'EDC
sudo nginx -t && sudo systemctl reload nginx
```

Si le serveur reste **entièrement interne** (jamais exposé à internet), Let's Encrypt
n'est pas joignable pour la validation — utiliser un certificat émis par l'autorité de
certification interne de l'EDC, ou a minima un certificat auto-signé accepté par les
postes du parc (moins recommandé, mais mieux que du texte en clair sur le réseau interne).

### 4.9 Mises à jour

```bash
cd /opt/edc-om
git pull
npm ci
npx prisma migrate deploy     # applique les migrations éventuelles — jamais `migrate dev` en production
npm run build
sudo systemctl restart edc-om
```

### 4.10 Sauvegardes

Aucun mécanisme de sauvegarde n'existe dans le dépôt — c'est une responsabilité
opérationnelle du serveur, pas du code. Au minimum :

```bash
# Sauvegarde quotidienne, à programmer via cron/systemd timer
pg_dump -U edc_om -Fc edc_om > /var/backups/edc-om/edc_om_$(date +%F).dump
```

Restauration : `pg_restore -U edc_om -d edc_om --clean /chemin/vers/le.dump`. Tester la
restauration au moins une fois avant d'en dépendre.

### 4.11 Ce que ce déploiement ne couvre PAS

- **Le hors-ligne** (étapes 10-11 du plan, §11) n'est pas fait — la génération du document
  Word (`docxtemplater`) tourne encore côté serveur (`app/api/generate-om/route.ts`), donc
  **l'application exige une connexion réseau** entre le poste client et le serveur pour
  produire un OM. Rien à changer côté déploiement pour l'instant.
- **Le module congés** n'est pas commencé (§11) — les tables `type_conge`, `jour_ferie`,
  `solde_conge`, `demande_conge` existent dans le schéma mais aucun écran ne les utilise.

---

## 5. Architecture générale

**Next.js App Router**, présentation en **composants serveur par défaut** — les composants
client (`"use client"`) sont l'exception, réservés à ce qui a vraiment besoin
d'interactivité (formulaires, filtres, modaux, graphiques cliquables). Convention
récurrente dans tout le projet : une page `page.tsx` **serveur** qui lit les données via
`lib/data/`, et un composant `XxxInteractif.tsx` **client** à côté qui reçoit ces données en
props et gère l'état d'écran (recherche, tri, ouverture de modal…) — voir par exemple
`app/rapports/carte/page.tsx` + `CarteInteractif.tsx`, ou `app/rapports/om-attente/page.tsx`
+ `OMEnAttenteInteractif.tsx`.

### 5.1 La couche `lib/data/` — DAL

Toute lecture et écriture de données passe par un fichier de `lib/data/`, chacun marqué
`import "server-only"` en tête (empêche toute inclusion accidentelle dans un bundle
client). **Chaque fonction exportée y appelle sa propre garde** (`exigerSession()`,
`exigerAdministrateur()`, `exigerFondateurOuEchouer()`…, définies dans `lib/auth/garde.ts`)
— pas seulement la page qui l'appelle. Raison documentée dans `README.md` : une Server
Action Next.js est une route HTTP directement joignable, masquer un bouton à l'écran ne
protège rien côté serveur.

### 5.2 Authentification et sessions

Double jeton : un jeton d'**accès** signé (JWT via `jose`, `lib/auth/jeton.ts`), courte
durée (15 min), et un jeton de **renouvellement**, longue durée (30 jours), qui permet de
regénérer le premier sans reconnexion. `proxy.ts` (l'équivalent de l'ancien
`middleware.ts`) fait un premier filtrage sur chaque requête, mais **ne remplace pas** les
gardes du DAL — seulement un aiguillage précoce (redirection vers `/connexion` si aucune
session). Mots de passe hachés en **Argon2id** via `node:crypto` natif (aucune dépendance
externe, cf. §2.2).

### 5.3 Rôles

Deux rôles (`lib/auth/jeton.ts` → `type Role = "ADMINISTRATEUR" | "UTILISATEUR"`), plus une
capacité exclusive et transférable, le **fondateur** (`estFondateur()`,
`exigerFondateurOuEchouer()`), seule habilitée à créer/rétrograder d'autres administrateurs
— issue de secours si le titulaire perd l'accès (voir README, étape 6).

### 5.4 Rapports — la couche `lib/analytics.ts` / `lib/data/rapports.ts`

Séparation stricte : `lib/data/rapports.ts` (`server-only`, accès Prisma) lit les données
brutes en base ; `lib/analytics.ts` (sans accès Prisma, importable côté client) ne fait que
des calculs **purs** dessus (regroupements, sommes, tris) — testable sans base de données,
et réutilisable aussi bien dans un composant serveur qu'un composant client. Détail des 12
rapports du catalogue en §9.9-9.10.

---

## 6. Modèle de données — Prisma

Décisions de modélisation et arbitrages complets dans **[MODELE-DONNEES.md](MODELE-DONNEES.md)**
(2065 lignes) — cette section résume la structure et l'implémentation, sans redécider ce
qui y est déjà tranché.

### 6.1 Emplacement des fichiers

| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma` | Déclaration des modèles, seule source de vérité du schéma. |
| `prisma.config.ts` | Configuration Prisma 7 — URL de connexion (`DATABASE_URL`), chemin des migrations, commande de seed. **Remplace** le bloc `datasource` de `schema.prisma` pour l'URL (§2.3). |
| `prisma/migrations/` | Historique des migrations SQL, une par changement de schéma (7 au 24/08/2026, listées ci-dessous). |
| `prisma/seed.ts` | Peuple les référentiels (statuts, directions, zones, pays, barèmes, jours fériés) — idempotent. |
| `lib/generated/prisma/` | **Client généré**, pas dans `node_modules/.prisma` (spécificité Prisma 7 configurée dans `schema.prisma` via `output`). Ne jamais éditer à la main — régénéré par `npx prisma generate` (appelé automatiquement par `migrate dev`/`migrate deploy`). |
| `lib/data/client.ts` | Point d'entrée applicatif unique vers le client Prisma (`export const prisma`). Rien ailleurs dans le code n'importe `@prisma/client` ou `lib/generated/prisma` directement. |

### 6.2 Migrations (ordre chronologique)

| Migration | Contenu |
|---|---|
| `20260821003951_schema_initial` | Schéma de base : référentiels, employés, comptes, ordres de mission, participations. |
| `20260821010000_contraintes_natives` | Contraintes `CHECK`/`EXCLUDE` natives PostgreSQL. |
| `20260821022539_session_renouvellement` | Table du jeton de renouvellement (double-jeton, §5.2). |
| `20260821214330_motif_sortie_et_fondateur` | Motif de sortie d'un employé + capacité fondateur. |
| `20260823010000_peremption_et_regularisation` | Péremption automatique des participations `EN_ATTENTE` échues + régularisation. |
| `20260824010000_champs_employe_facultatifs` | Assouplissement de contraintes `NOT NULL` sur la fiche employé. |
| `20260825010000_localites_ajoutees` | Table des localités ajoutées à la main (villes hors référentiel `country-state-city`). |

### 6.3 Modèles — vue d'ensemble

| Modèle | Rôle |
|---|---|
| `Departement` | Référentiel des directions/services. |
| `Statut` | Référentiel hiérarchique (Cadre, Chef de Service…), avec un rang qui ordonne la pyramide (rapport n° 12). |
| `Zone` | Les 4 zones du barème de frais fixes (codes 0 à 3, libellés en base). |
| `Pays` | Référentiel pays — `code_iso` (clé), `nom_fr`, **`continent`** (colonne, pas recalculée), **`code_zone`** (idem). Amorcé par `country-state-city` au seed, mais modifiable ensuite par un administrateur — voir §9.9 pour pourquoi c'est important. |
| `Localite` | Villes ajoutées manuellement pour un pays (sites de production EDC absents du référentiel tiers). |
| `BaremeFraisFixe` | Montant journalier FCFA, par (statut, zone). |
| `Employe` | Fiche personnel — matricule, nom, département, statut, dates d'entrée/sortie. |
| `Utilisateur` | Compte de connexion, éventuellement rattaché à un `Employe` (rôle UTILISATEUR) ou non (ADMINISTRATEUR). |
| `JetonMotDePasse` | Jetons à usage unique pour définir/réinitialiser un mot de passe. |
| `SessionRenouvellement` | Jeton de renouvellement de session (§5.2). |
| `OrdreMission` | Un OM — destination (`code_pays`), dates de départ/retour, numéro. |
| `PlageNumero` | Gestion des plages de numérotation des OM (évite les collisions en écriture concurrente). |
| `Participation` | Un employé sur un OM — statut du workflow (`EN_ATTENTE`/`CONFIRME`/`ANNULE`/`REFUSE`/`EXPIRE`), et un **instantané** des champs de l'employé au moment de la création (`nom_s`, `prenoms_s`, `code_statut_s`, `code_departement_s`) : le document imprimé et les rapports reflètent la situation DE L'ÉPOQUE, pas la fiche actuelle. |
| `Frais` | Frais réels au-delà du forfait — table créée, aucun écran ne l'utilise encore (cf. §12). |
| `TypeConge`, `JourFerie`, `SynchronisationFerie`, `SoldeConge`, `DemandeConge` | Module congés — schéma posé, **aucun écran construit** (§11). |
| `Notification` | Avis internes (ex. nouvel OM à valider). |
| `MailEnAttente` | File d'attente des courriels — permet à l'application de fonctionner même sans SMTP configuré (le lien reste affichable à l'écran, voir README). |
| `Configuration` | Réglages modifiables par un administrateur (âge de retraite). |

### 6.4 Deux principes structurants à retenir

- **L'instantané plutôt que la référence vivante** (`Participation.nom_s`, `code_statut_s`,
  etc.) : un document légal doit refléter la situation au moment de son émission, pas être
  réécrit rétroactivement si l'employé change de nom ou de statut ensuite.
- **La base fait foi une fois peuplée, pas les bibliothèques qui l'ont amorcée** : `pays.
  continent` et `pays.code_zone` sont dérivés une fois, au seed, de classifications
  statiques (`lib/continents.ts`, `lib/zones.ts`) et de `country-state-city` — mais un
  administrateur peut ensuite corriger un territoire contesté ou ajouter un pays absent de
  ces bibliothèques. Le code applicatif (rapports, formulaires) doit donc **relire la
  colonne**, jamais recalculer via la bibliothèque d'origine. C'est un principe appliqué
  au fil du développement (voir §9.9) — à vérifier systématiquement pour tout nouveau code
  qui toucherait à un référentiel géographique.

---

## 7. Arborescence du projet

```
app/                          routes (Next.js App Router)
  connexion/                  authentification
  mot-de-passe/[jeton]/       définition du mot de passe (invitation/réinitialisation)
  om/                         ordres de mission (liste, création, détail)
  personnel/                  fiches employés (admin)
  parametres/                 réglages, administrateurs, localités (admin)
  rapports/                   les 12 rapports du catalogue (admin)
  api/                        deux routes HTTP hors Server Actions (renouvellement, génération de document)
components/                   composants partagés, hors page précise
contexts/                     état React partagé (brouillon de formulaire OM)
lib/
  auth/                       jetons, sessions, gardes, hachage, limitation de débit
  data/                       couche d'accès aux données — server-only, chaque fonction gardée
  mail/                       transport SMTP et modèles de messages
  generated/prisma/           client Prisma généré — ne pas éditer
  *.ts (racine de lib/)       utilitaires transverses (dates, styles, référentiels statiques…)
prisma/
  schema.prisma                schéma
  migrations/                  historique SQL
  seed.ts                      peuplement des référentiels
  creerCompte.ts, verifierMail.ts, sondeLocalite.ts   scripts d'exploitation (CLI, `npx tsx`)
prisma.config.ts               configuration Prisma 7 (URL de connexion, seed)
proxy.ts                       filtrage des requêtes (ex-middleware.ts)
tests/                         unitaires + bout en bout
types/                         types partagés hors Prisma
```

---

## 8. Référence des pages (`app/`)

### 8.1 Racine et authentification

| Route | Fichier(s) | Rôle |
|---|---|---|
| `/` | `app/page.tsx` | Accueil — composant serveur, deux `<Link>` vers les sections principales (pas de `<div onClick>`, pour l'accessibilité). |
| `/connexion` | `app/connexion/page.tsx` + `FormulaireConnexion.tsx` | Page publique — seule avec `/mot-de-passe/[jeton]` accessible sans session. Redirige si déjà connecté. |
| `/mot-de-passe/[jeton]` | `page.tsx` + `FormulaireMotDePasse.tsx` | Définition du mot de passe via lien à usage unique (48h). Jeton dans le CHEMIN et non en paramètre (survit à une troncature par un client mail) ; métadonnées `referrer: no-referrer` et `robots` pour éviter la fuite/indexation du jeton. |
| `app/layout.tsx` | — | Layout racine (police, structure HTML globale). |

### 8.2 Personnel (admin)

| Route | Fichier(s) | Rôle |
|---|---|---|
| `/personnel` | `page.tsx` + `FiltresPersonnel.tsx` + `Pagination.tsx` | Liste — premier écran migré sur SQL direct (filtrage ET pagination en base, pas en mémoire). |
| `/personnel/nouveau` | `page.tsx` | Ajout d'un employé — matricule non saisi (généré), garde déjà portée par le layout + l'action. |
| `/personnel/[matricule]` | `page.tsx` + `BlocActivation.tsx` + `BlocCompte.tsx` | Fiche : modification, compte d'accès, activation/désactivation. `notFound()` (404 réel) pour matricule inexistant ET interdit — volontairement indistinguable. |
| — | `app/personnel/layout.tsx` | Garde d'accès (`exigerAdministrateur`) commune à toute la section. |
| — | `app/personnel/actions.ts` | Server Actions : création, modification, désactivation/réactivation. |

### 8.3 Ordres de mission

| Route | Fichier(s) | Rôle |
|---|---|---|
| `/om` | `page.tsx` + `FiltresOM.tsx` | Liste, filtrée en SQL (`lib/data/om.ts` → `listerOM`) : période, pays (code ISO), statut, direction, ville, matricule — tous les rapports en lien renvoient ici. |
| `/om/nouveau` | `page.tsx` (enveloppe serveur) + `FormulaireOM.tsx` (client) | Création. L'enveloppe lit côté serveur les données que le formulaire client ne peut pas lire lui-même (employés actifs, zones, barème, âge de retraite via `getConfiguration()`, asynchrone). |
| `/om/[id]` | `page.tsx` + `BlocActions.tsx` + `BoutonTelecharger.tsx` | Détail d'un OM pour UN participant (`?participant=<matricule>`). Composant serveur — `useEstMonte` n'y est plus nécessaire (donnée réelle, pas de désaccord serveur/client via `localStorage`). |
| — | `app/om/actions.ts` | Server Actions : création, confirmation, annulation, refus, régularisation d'une participation. |
| — | `app/om/BadgeStatut.tsx` | Badge visuel du statut d'une participation (icône + couleur + libellé) — réutilisé tel quel par le rapport n° 7. |
| `/api/generate-om` | `app/api/generate-om/route.ts` | Génère le `.docx` de l'OM côté serveur (`docxtemplater`) — **pas encore basculé côté navigateur** (étape 10 du plan, non faite, cf. §11). |

### 8.4 Paramètres (admin)

| Route | Fichier(s) | Rôle |
|---|---|---|
| `/parametres` | `page.tsx` | Réglage de l'âge de retraite (`lib/config.ts`) — **persistance localStorage désormais commentée** (26/08/2026) ; la vraie source de vérité pour la validation est la table `configuration`, cette page ne l'écrit pas encore (bascule prévue étape 9, non faite). |
| `/parametres/administrateurs` | `page.tsx` + `FormulaireAdministrateur.tsx` + `LigneAdministrateur.tsx` | Visible par tout administrateur ; créer/rétrograder réservé au **fondateur**. |
| `/parametres/localites` | `page.tsx` + `FormulaireLocalite.tsx` + `LigneLocalite.tsx` | Ajout de villes absentes de `country-state-city` (sites de production EDC). |
| — | `app/parametres/layout.tsx` | Garde d'accès commune. |

### 8.5 Rapports (admin) — les 12 du catalogue (§11 de MODELE-DONNEES.md)

Tous, sauf le n° 7, enveloppés par `app/rapports/PeriodeShell.tsx` (filtre de période commun,
bouton Imprimer, `useTransition` pour garder l'ancien contenu affiché — en opacité réduite,
jamais un squelette — pendant le rechargement).

| # | Route | Forme | Spécificité |
|---|---|---|---|
| 1 | `/rapports/indicateurs` | 4 tuiles | Missions confirmées, coût plancher, jours cumulés, OM en attente — avec variation vs période précédente de même longueur. |
| 2 | `/rapports/cout-periode` | Barres | Bascule mois/année (`?vue=`). |
| 3 | `/rapports/cout-direction` | Barres horizontales | Résout `codeDepartement` (code ou libellé libre) via `libelleDepartement()`. |
| 4 | `/rapports/top-destinations` | Barres horizontales | Top 10 + « Autres », lien vers `/om?pays=<code ISO>`. |
| 5 | `/rapports/repartition-zone` | Colonnes, rampe ordinale | 4 zones, couleur exprime l'ordre du barème, pas une catégorie arbitraire. |
| 6 | `/rapports/suivi` | Barre empilée unique | Icône + libellé + couleur par statut (jamais la couleur seule), ordre FIXE des segments. |
| 7 | `/rapports/om-attente` | Tableau | **Pas de `PeriodeShell`** — c'est un encours à traiter, pas une tranche historique. Trié par ancienneté d'ÉMISSION. Lien direct vers `/om/[id]`. |
| 8 | `/rapports/missions-employe` | Tableau | Cherchable, triable (colonnes cliquables), paginé (20/page), **export `.xlsx`** (`exceljs`, import dynamique) + impression. |
| 9 | `/rapports/absence-direction` | Barres horizontales | Jours cumulés par direction. |
| 10 | `/rapports/carte` | Carte du monde interactive | `components/CarteMonde.tsx` — nom et continent lus en base (`lireReferentielPays`), plus de recalcul via bibliothèque tierce. |
| 11 | `/rapports/frise` | Colonnes | Missions par année, détail par mois en modal. |
| 12 | `/rapports/pyramide` | Barres empilées par rang | Missions par statut hiérarchique, ordre du référentiel (`getStatuts()`), détail par employé en modal. |

Fichiers transverses de la section :
- `app/rapports/page.tsx` — index/catalogue, une carte cliquable par rapport disponible.
- `app/rapports/layout.tsx` — garde d'accès.
- `app/rapports/PeriodeShell.tsx` — filtre de période partagé + impression.
- `app/rapports/AvertissementDonneesDemo.tsx` — **non utilisé depuis le 26/08/2026** (conservé commenté, cf. §0/convention).

---

## 9. Référence de la bibliothèque (`lib/`)

Regroupement par domaine. Toute fonction marquée **[DAL]** vit dans `lib/data/` (`server-
only`, garde d'autorisation portée par la fonction elle-même).

### 9.1 `lib/auth/` — authentification

| Fichier | Fonctions clés |
|---|---|
| `jeton.ts` | `Session`, `Role` (types) ; `signerAcces`/`lireJetonAcces` (JWT via `jose`) ; constantes de durée (`DUREE_ACCES_SECONDES` = 15 min, `DUREE_RENOUVELLEMENT_JOURS` = 30). |
| `session.ts` | `ouvrirSession`, `renouvelerSession`, `fermerSession`, `revoquerToutesLesSessions` — écrit/lit les cookies `edc_om_acces`/`edc_om_renouvellement`. |
| `garde.ts` **[DAL]** | `lireSession` (peut être `null`), `exigerSession`/`exigerAdministrateur`/`exigerFondateurOuEchouer` (redirigent ou lèvent), `estFondateur`, `peutAccederAuMatricule`. Toutes mises en cache (`cache()` de React) pour ne lire la session qu'une fois par requête. |
| `motDePasse.ts` | `hacherMotDePasse`/`verifierMotDePasse` (Argon2id, `node:crypto`), `empreinteAReprendre` (détecte un hachage à ré-empreinter après un changement de paramètres), `genererJeton`/`hacherJeton` (jetons à usage unique). |
| `limitation.ts` | `attenteRestante`/`enregistrerEchec`/`enregistrerSucces` — limitation de débit sur les tentatives de connexion, en mémoire (par email + IP). |
| `redirection.ts` | `cheminDeRetourSur` — valide qu'une URL de retour post-connexion reste interne au site (anti-redirection ouverte). |
| `actions.ts` | Server Actions : `connecter`, `deconnecter`, `definirMotDePasse`. |

### 9.2 `lib/data/` — accès aux données (DAL)

| Fichier | Fonctions clés |
|---|---|
| `client.ts` | `export const prisma` — point d'entrée unique vers le client généré. |
| `configuration.ts` | `getConfiguration` (cache) — lit la table `configuration` (âge de retraite). |
| `administrateurs.ts` | `listerAdministrateurs`, `listerEmployesNommables`, `creerAdministrateur`, `retrograderAdministrateur` — les deux dernières réservées au fondateur. |
| `employes.ts` | `listerPersonnel` (filtré/paginé en SQL), `lireFicheEmploye`, `lireCodesReferentiels` (cache), `creerEmploye`, `modifierEmploye`, `desactiverEmploye`, `reactiverEmploye`. |
| `employes.validation.ts` | Validation pure (pas d'accès base) : `validerEmploye`, `validerSortie`, `analyserDate`, `anneesRevolues`, `normaliserMatricule`, `lireSaisie` (extrait un `SaisieEmploye` d'un `FormData`). |
| `localites.ts` | `listerLocalites`, `localitesParNomPays` (cache), `ajouterLocalite`, `retirerLocalite`. |
| `localites.validation.ts` | `normaliserNomLocalite`, `cleLocalite`. |
| `mails.ts` | `enfilerCourriel`, `envoyerCourrielEnFile`, `envoyerCourrielMaintenant`, `balayerFile` (traite la file d'attente), `etatFile`. |
| `notifications.ts` | `notifier`, `notifierAdministrateurs`, `notifierSansDoublon`, `compterNonLues` (cache), `listerNotifications`, `marquerLue`/`marquerToutesLues`. |
| `om.ts` | Le plus gros fichier du DAL. `creerOrdreMission`, `lireParticipation`, `lireDocumentOM`, `confirmerParticipation`, `annulerParticipation`, `refuserParticipation`, `regulariserParticipation`, `perimerParticipationsEchues` (péremption automatique des `EN_ATTENTE` trop anciens), `lireDonneesFormulaireOM`, `listerOM` (filtres + pagination + tri, SQL brut pour les jointures complexes). |
| `om.validation.ts` | Validation pure : `validerOM`, `lireSaisieOM`, `periodesSeChevauchent`, `libelleStatutParticipation`, **`STATUTS_ENGAGEANTS`** (`["EN_ATTENTE", "CONFIRME"]` — définit « un agent réellement en déplacement », réutilisé tel quel par tous les rapports financiers), `STATUTS_BLOQUANTS`, `mentionStatut`. |
| `omConflits.ts` | `chercherChevauchements`, `chevauchementsBloquants`/`chevauchementsSignales`, `motifBlocage` — détection de conflit de planning entre deux missions du même employé. |
| `plagesNumero.ts` | `consommerNumeros`, `avecReessaiPlage` — attribution atomique de numéros d'OM par plage, avec ré-essai en cas de collision concurrente. |
| `rapports.ts` | Voir §9.9 — dédié, plus détaillé. |
| `referentiels.ts` | Wrappers en cache autour des tables de référence : `getDepartements`, `getStatuts`, `getCodesStatutsCadres`, `getLibellesZones`, `getNomsPays`, `getZoneDuPaysFr`, `getPaysOptions`, `getPaysParNomFr`, `getMontantFraisFixe`, `getTypesConge` (déjà prêt pour le futur module congés). |
| `utilisateurs.ts` | `trouverCompteParEmail`, `marquerConnexion`, `remplacerEmpreinte`, `creerJetonMotDePasse`/`verifierJetonMotDePasse`, `definirMotDePasseAvecJeton`, `creerCompte`. |

### 9.3 `lib/mail/`

| Fichier | Rôle |
|---|---|
| `transport.ts` | Construit le transport `nodemailer` à partir des variables `SMTP_*` (§4.5) — retourne `null` si non configuré, jamais une erreur qui bloquerait l'application. |
| `modeles.ts` | Gabarits des courriels (invitation, réinitialisation…). |

### 9.4 Utilitaires transverses (racine de `lib/`)

| Fichier | Fonctions/exports clés |
|---|---|
| `dateUtils.ts` | `formatDateFR`, `formatHeureFR`, `dureeEnJours`, `moisDeLaMission`, `versChampDate` (Date → `AAAA-MM-JJ`), `aujourdhuiChampDate`, `NOMS_MOIS`. |
| `numeroOM.ts` | `composerNumero`/`decomposerNumero` (format `EDC/DG/DRH/SDARHAS/NNNN/AAAA`), `numeroCommeImprime`, `numeroPourGabarit`, `LARGEUR_COMPTEUR` (4 chiffres), `LIMITE_COMPTEUR` (9999). |
| `email.ts` | `normaliserEmail`, `estEmailValide`, `EMAIL_LONGUEUR_MAX`. |
| `baremes.ts` | `BAREME_FRAIS_FIXE` (table statut×zone), `montantFraisFixe`. |
| `continents.ts` | `Continent` (type, 5 valeurs FR), `continentDuPaysParCode` (classification STATIQUE — sert uniquement à amorcer le seed), `continentDepuisColonneBD` (reconvertit la colonne `pays.continent` **déjà en base** — c'est celle-ci qu'utilise le code applicatif, cf. §9.9), `continentDuPaysFr`. |
| `zones.ts` | `Zone` (type `0\|1\|2\|3`), `zoneDuPaysParCode`/`zoneDuPaysFr` (classification statique, seed uniquement), `LIBELLE_ZONE`. |
| `locations.ts` | `PAYS_SUGGESTIONS`/`VILLES_SUGGESTIONS` (saisie assistée), `codeISODuPaysFr`, `villesDuPays`/`villesDuPaysAvecAjouts`, `paysEtVilleDeOM`. |
| `referentiels.ts` | Référentiels **statiques** côté affichage (`DEPARTEMENTS`, `POSTES`, `STATUTS`, `libelleDepartement`) — distinct de `lib/data/referentiels.ts` (DAL, lit la base) ; `libelleDepartement` résout un code OU un libellé libre, réutilisé par les rapports n° 3 et 9. |
| `navigation.ts` | `SECTIONS` (menu), `sectionsPour(role)`, `sectionActive`, `PREFIXES_ADMIN`. |
| `pagination.ts` | `PAR_PAGE` (taille de page par défaut). |
| `styles.ts` | Classes Tailwind partagées (`carteClass`, `titrePageClass`, `boutonPrimaire`, etc.) — vocabulaire visuel commun à toute l'application. |
| `useEstMonte.ts` | `useEstMonte()` — hook client, garde d'hydratation. **Encore utilisé uniquement par `/parametres`** (le seul écran pas encore rebranché sur la base réelle, cf. §8.4) ; toutes les autres pages qui l'utilisaient en historique (rapports, `/om`) ne l'utilisent plus depuis leur bascule serveur. |
| `config.ts` | `configOM`, `mettreAJourConfig`, `reinitialiserConfig` — persistance `localStorage` **commentée** depuis le 26/08/2026 ; en mémoire pour la durée du processus serveur uniquement. |
| `buildDocument.ts` | `lignesVisasVierges`, `buildDocumentForParticipant` — prépare les données injectées dans le gabarit `.docx`. |
| `generateOmDocx.ts` | `generateOmDocx(om)` — génère le `Buffer` du document via `docxtemplater`/`pizzip`. |
| `mockData.ts`, `businessRules.ts`, `employees.ts` | **Entièrement commentés** depuis le 26/08/2026 (étape 14) — plus aucune dépendance active. Conservés pour l'historique (convention §0/README). Ne pas les réutiliser tels quels : `lib/data/rapports.ts`, `lib/data/om.ts` et `lib/data/employes.ts` les ont remplacés. |

### 9.5 `contexts/`

`brouillonContext.tsx` — état React partagé du formulaire de création d'OM (persistance
du brouillon pendant la saisie, avant soumission).

### 9.6 `proxy.ts`

Premier filtrage des requêtes (remplace `middleware.ts`) : redirige vers `/connexion` en
l'absence de session, transmet le chemin demandé via l'en-tête `x-edc-chemin` pour que la
page de connexion sache où revenir. Ne fait AUCUNE vérification de rôle fine — c'est le
DAL qui en a la responsabilité (§5.1).

### 9.7 `prisma/` — scripts d'exploitation (CLI)

| Script | Usage |
|---|---|
| `seed.ts` | `npx prisma db seed` (ou automatiquement après `migrate dev`/`migrate reset`) — référentiels. |
| `creerCompte.ts` | `npx tsx prisma/creerCompte.ts <email> ADMINISTRATEUR\|UTILISATEUR [matricule] [--fondateur]` — voir README §6. |
| `verifierMail.ts` | `npx tsx prisma/verifierMail.ts [destinataire]` — teste la connexion SMTP sans (ou avec) envoi réel. |
| `sondeLocalite.ts` | Utilitaire de vérification/exploration des localités (voir son fichier pour l'usage exact — pas documenté ailleurs). |

### 9.8 `types/om.ts`

Types partagés côté OM qui ne viennent pas directement de Prisma (formes de données
utilisées à travers plusieurs couches — DAL, formulaire, génération de document).

### 9.9 `lib/data/rapports.ts` — détail (DAL des rapports)

Le fichier le plus modifié de la session de travail dont cette documentation rend compte.
Deux fonctions de lecture principales :

- **`lireDonneesRapports()`** → `{ missions: MissionRapport[], participants:
  ParticipantRapport[] }` — sert la carte, la frise, la pyramide, le top destinations et
  la répartition par zone. `MissionRapport` porte `codePays` (code ISO — clé de
  regroupement STABLE, jamais le nom affiché, cf. le correctif ci-dessous),
  `paysDestination` (nom, affichage seulement), **`continent`** (lu depuis la colonne
  `pays.continent`, pas recalculé), `codeZone` (lu depuis `pays.code_zone`, idem).
- **`lireLignesRapports(filtre?)`** → `LigneRapport[]` — sert les rapports financiers/
  opérationnels (indicateurs, coût par période/direction, suivi du processus, absence par
  direction, missions par employé). Une ligne = une PARTICIPATION (pas une mission), avec
  son coût (`montant_frais_fixe_journalier × dureeJours`), sa durée, son statut, sa
  direction (`codeDepartement`, brut — résolu à l'affichage par `libelleDepartement()`).
  Filtre de période appliqué **en SQL** (comme `listerOM`), pas en mémoire après coup.
- `lireOMEnAttenteVieillissants()` → `LigneOMEnAttente[]` — dédiée au rapport n° 7, triée
  par date d'ÉMISSION croissante, pas de filtre de période (c'est un encours, pas un
  historique).
- `lireReferentielPays()` / `lireReferentielZones()` — référentiels complets (tous les
  pays/zones connus, pas seulement ceux avec des missions), pour l'affichage de
  `CarteMonde.tsx` et du rapport n° 5.

**Correctif notable apporté au cours du développement** (à connaître pour ne pas le
réintroduire) : `missionsParPaysDansContinent` groupait initialement par **nom français**
du pays. Deux bugs en découlaient — `CarteMonde.tsx` calculait un nom français par une
bibliothèque tierce (`i18n-iso-countries`), potentiellement différent de l'orthographe
choisie en base, laissant un pays gris malgré des missions réelles ; et le clic « voir la
liste » envoyait ce nom vers `/om?pays=<nom>`, qui compare en réalité au **code ISO**
(`ordre_mission.code_pays`) — la liste revenait donc toujours vide. Corrigé en regroupant
par `codePays` partout, le nom et le continent n'étant plus que des propriétés d'affichage
lues depuis la base (jamais recalculées par une bibliothèque tierce ni utilisées comme
clé).

### 9.10 `lib/analytics.ts` — détail (calcul pur, sans base)

Toutes les fonctions sont pures : entrée `MissionRapport[]`/`ParticipantRapport[]`/
`LigneRapport[]`, sortie un tableau de `Compte<T>` (`{ cle, count }`) ou `CompteLibelle`
(`{ cle, libelle, count }` — quand la clé stable et le texte affiché diffèrent, ex. code
pays vs nom).

| Fonction | Rapport(s) | Notes |
|---|---|---|
| `missionsParContinent` | 10 (carte) | Compte l'OM, pas la participation. |
| `missionsParPaysDansContinent` | 10 (carte, détail) | Clé = code ISO (cf. correctif §9.9). |
| `topDestinations` | 4 | Idem, tri par fréquence décroissante — page tronque à 10 + « Autres ». |
| `missionsParZone` | 5 | Tri **croissant par code de zone** (ordinal), pas par fréquence. |
| `missionsParAnnee` / `missionsParMoisDansAnnee` | 11 (frise) | — |
| `bornesDuMois` | 11 | Bornes ISO d'un mois, pour filtrer `/om` après un clic. |
| `periodePrecedente` / `variationPct` | 1 (indicateurs) | Période de même durée immédiatement avant, pour calculer une variation en %. |
| `participantsParStatut` / `participantsParEmployeDansStatut` | 12 (pyramide) | Compte la participation (pas l'OM) — un OM à statuts mixtes pèse dans plusieurs barres. |
| `indicateursTete` | 1 | Missions confirmées/OM en attente = comptage d'OM ; coût/jours = somme des participations dans `STATUTS_ENGAGEANTS` uniquement. |
| `suiviProcessus` | 6 | Ordre FIXE des segments (`ORDRE_STATUTS_PROCESSUS`), jamais trié par valeur. |
| `coutParAnnee` / `coutParMois` | 2 | Même filtre `STATUTS_ENGAGEANTS`. |
| `joursDepuis` | 7 | Âge en jours d'une date ISO jusqu'à aujourd'hui. |
| `coutParDirection` / `joursAbsenceParDirection` | 3, 9 | Regroupées par `codeDepartement` BRUT — résolution du libellé laissée à la page (`libelleDepartement()`). |
| `missionsParEmploye` | 8 | Une ligne par matricule (agrégat : nombre de missions, jours, coût). |
| `formatFcfa` | 1, 2, 3, 8, 9 | Formatage FCFA partagé (`Intl.NumberFormat("fr-FR")`). |

---

## 10. Composants partagés (`components/`)

| Composant | Rôle |
|---|---|
| `BarreNavigation.tsx`, `Header.tsx`, `MenuMobile.tsx`, `MenuUtilisateur.tsx` | Chrome de navigation, adapté au rôle (`lib/navigation.ts` → `sectionsPour`). |
| `CarteMonde.tsx` | Fond de carte interactif (rapport n° 10) — reçoit désormais un `referentielPays` (nom + continent lus en base) en prop obligatoire ; ne recalcule plus rien via bibliothèque tierce (§9.9). |
| `Modal.tsx` | Modale générique, centrée (`fixed inset-0 flex items-center justify-center`) — utilisée par carte/frise/pyramide pour les détails au clic. |
| `AutocompleteInput.tsx` | Champ avec suggestions (pays, villes, employés…). |
| `BoutonConfirme.tsx`, `Confirmation.tsx` | Confirmation d'action destructive avant exécution. |
| `Onglet.tsx`, `Onglets.tsx` | Navigation par onglets (ex. `/parametres`). |
| `OMPreview.tsx` | Aperçu de l'ordre de mission avant génération du document. |
| `RetourVers.tsx` | Lien « Retour à… » réutilisé sur presque toutes les pages secondaires — `print:hidden` (n'a pas de sens sur un PDF imprimé). |

---

## 11. État d'avancement du plan de migration

Référence complète : `MODELE-DONNEES.md` §13 (« Ordre de migration »). Récapitulatif :

| # | Étape | État |
|---|---|---|
| 1-8 | Nettoyage, Docker/Postgres, schéma Prisma, seed, DAL, auth/rôles, personnel CRUD, `ordre_mission`+`participation` | ✅ Fait |
| 9 | Bascule des pages admin en composants serveur, `useEstMonte` devient inutile | Partiel — fait partout **sauf** `/parametres` (§8.4), qui reste le seul écran sur `localStorage`. |
| 10 | Migration de `docxtemplater` vers le navigateur (condition du hors-ligne) | ❌ Pas fait. |
| 11 | PWA : Service Worker, IndexedDB, création hors ligne | ❌ Pas fait. Décision explicite de reporter (priorité donnée aux rapports). |
| 12 | Rapports, avec exports XLSX et PDF | ✅ **Fait** — 12/12 rapports du catalogue, export `.xlsx` (n° 8) et PDF (impression navigateur, la plupart des rapports). |
| 13 | Module congés | ❌ Pas commencé. Décision explicite de reporter (voir §12). |
| 14 | Commenter `lib/mockData.ts`, `lib/employees.ts`, les lectures `localStorage` de `lib/config.ts` | ✅ Fait, ainsi que `lib/businessRules.ts` (code mort découvert au passage). |

---

## 12. Perspectives

### 12.1 Court terme — ce que ce document recommande de vérifier avant mise en production

- **Reconstituer et valider `package.json`/`tsconfig.json`/`next.config.*`** — absents du
  zip transmis pour ce travail ; §2.2 en a reconstitué la liste de dépendances par lecture
  du code, mais c'est une **reconstruction**, pas une lecture directe. Vérifier notamment
  que `exceljs` y figure (ajoutée en dernier, pour l'export du rapport n° 8) et que
  `next.config.*` déclare `output: "standalone"` si le service systemd du §4.7 doit
  fonctionner tel que décrit.
- **`npx tsc --noEmit` et la suite de tests** (`npm test`, `npm run test:e2e`) n'ont pas pu
  être exécutés au cours du développement de ce lot (même absence de `package.json`) — à
  lancer avant tout déploiement.
- **`/parametres`** reste sur `localStorage` en mémoire (non persistant) pour l'âge de
  retraite affiché, alors que la validation réelle lit déjà la table `configuration` — un
  administrateur qui modifie la valeur à l'écran ne change donc RIEN à la validation
  effective tant que l'étape 9 n'est pas terminée pour cette page. Le bandeau d'avertissement
  déjà présent sur l'écran le signale, mais la finir (queue courte : brancher un Server
  Action d'écriture sur `configuration`) fermerait un vrai écart fonctionnel.

### 12.2 Moyen terme

- **Étape 10-11 (hors ligne)** : nécessite de réécrire la génération du `.docx` pour
  qu'elle tourne dans le navigateur (`docxtemplater` le permet, la bascule reste à faire),
  puis un Service Worker + IndexedDB pour la création d'OM sans réseau. Chantier
  substantiel, à ne pas sous-estimer.
- **Module congés (étape 13)** : le schéma est posé (`TypeConge`, `JourFerie`, `SoldeConge`,
  `DemandeConge`) mais bloqué par trois arbitrages RH non tranchés (types de congé exacts,
  définition du jour ouvrable, cas du cadre médaillé) et un calendrier des jours fériés
  camerounais incomplet (l'Aïd n'est dans aucune API publique consultée). À relancer ces
  points côté RH avant de reprendre le développement.
- **Table `frais`** : créée mais inutilisée par aucun écran — à réévaluer si la saisie de
  frais réels (au-delà du forfait journalier) devient une exigence.

### 12.3 Dette identifiée pendant ce travail, non corrigée (hors du périmètre demandé)

- `lib/referentiels.ts` (statique) et `lib/data/referentiels.ts` (DAL, base) coexistent —
  le premier documente lui-même, dans son en-tête, qu'il devait céder la place à la base
  une fois celle-ci branchée. C'est fait pour les rapports (`libelleDepartement` reste
  utilisé, mais lit un objet statique, pas la table `departement`) — à uniformiser si un
  administrateur doit un jour pouvoir renommer une direction sans redéploiement.
- La pyramide (rapport n° 12) ne liste que les statuts `actif: true` du référentiel — une
  participation historique portant un statut désactivé depuis serait comptée dans les
  totaux mais invisible dans le détail par barre. Cas limite, non corrigé (comportement
  déjà cohérent avec le reste du DAL, qui filtre pareil ailleurs).

---

*Document généré le 28/08/2026 à partir d'une lecture exhaustive du code source fourni
(zip sans `package.json`/configuration de build — voir avertissements §2.2 et §12.1). À
recouper avec le dépôt git réel avant toute décision opérationnelle qui en dépendrait.*
