# EDC-OM — Architecture de la couche données, MCD et MLD

> Document de conception. Rédigé le 19/08/2026, à partir de l'état du code au commit
> `550278d`. Il tranche les questions posées avant la mise en place de la base et sert
> de référence pour la migration depuis `localStorage`.
>
> Les sections marquées **À TRANCHER** attendent une décision métier.

---

## 1. Verdict : backend séparé ou pas ?

**Recommandation : rester sur Next.js, avec une couche d'accès aux données dédiée.**
Pas de second service, pas de second langage.

### Pourquoi

Un backend séparé (Spring Boot, NestJS, Django, Laravel…) se justifie quand au moins
une de ces conditions est vraie. Aucune ne l'est ici :

| Condition | EDC-OM |
|---|---|
| Plusieurs consommateurs de l'API (app mobile, autre SI) | Non — un seul front web |
| Une équipe backend distincte, ou une autre stack imposée | Non |
| Traitements longs / asynchrones (batchs, files d'attente) | Non — tout est synchrone |
| Contraintes réglementaires de séparation des couches | Pas exprimées |
| API déjà existante à réutiliser | Non |

Le coût d'un service séparé est concret : deux déploiements, deux jeux de types à
garder synchronisés (les `interface` de [types/om.ts](types/om.ts) devraient être
redéfinies côté serveur, ou générées), CORS, authentification à propager. Pour une
équipe de cette taille et un seul client, c'est du travail qui ne rend aucun service.

À l'inverse, l'app fait **déjà** du serveur : [app/api/generate-om/route.ts](app/api/generate-om/route.ts)
est un Route Handler Node.js qui manipule un `.docx` avec `docxtemplater`. La brique
serveur existe, elle est juste sous-employée.

### Le motif retenu : Data Access Layer

La doc Next 16 embarquée ([data-security.md](node_modules/next/dist/docs/01-app/02-guides/data-security.md))
décrit trois approches et recommande explicitement celle-ci **pour un nouveau projet** :

> *For new projects, we recommend creating a dedicated **Data Access Layer** (DAL). […]
> A Data Access Layer should: only run on the server; perform authorization checks;
> return safe, minimal Data Transfer Objects (DTOs).*

Concrètement, la structure cible :

```
lib/data/            ← la DAL. Seule à parler à Prisma, seule à lire process.env.
  employes.ts          import "server-only" en tête de chaque fichier
  ordresMission.ts
  referentiels.ts
  configuration.ts
lib/actions/         ← Server Functions ("use server") appelées par les formulaires
  ordreMission.ts
```

Deux règles non négociables, que la doc souligne :

1. **`import "server-only"`** en tête de chaque module de la DAL. Sans ça, rien
   n'empêche un `import` depuis un composant client d'embarquer la chaîne de connexion
   dans le bundle navigateur.
2. **Vérifier l'autorisation dans *chaque* Server Function.** La doc est catégorique :
   > *Server Functions are reachable via direct POST requests, not just through your
   > application's UI. Always verify authentication and authorization inside every
   > Server Function.*

   Ça vaut aussi pour le Route Handler existant : `POST /api/generate-om` accepte
   aujourd'hui n'importe quel JSON et rend un document Word. Une fois la base en place,
   il doit lire l'OM **depuis la base par son identifiant**, pas depuis le corps de la
   requête.

Autre point que la doc appelle : *« choose one data fetching approach and avoiding
mixing them »*. Donc pas de mélange DAL + requêtes Prisma directes dans les composants.

### Ce qui change dans le code existant

Les singletons `localStorage` ont volontairement été écrits pour être remplaçables —
[lib/config.ts](lib/config.ts) le dit : *« À remplacer par une table `configuration`
PostgreSQL le jour où Prisma est branché : `configOM` deviendra le résultat d'une
requête, `mettreAJourConfig` un UPDATE. Les appelants n'auront pas à bouger. »*
C'est vrai pour la signature, mais pas pour la nature : `configOM` est synchrone,
une requête est asynchrone. Les pages qui le lisent devront devenir des composants
serveur (ou recevoir la valeur en props). Même remarque pour `mockOMs` et
`mockEmployees`.

Effet de bord bienvenu : le passage en composants serveur fait disparaître toute la
classe de bugs d'hydratation que [lib/useEstMonte.ts](lib/useEstMonte.ts) contourne
aujourd'hui — ce hook deviendra inutile.

**Stack : PostgreSQL 16 + Prisma.** PostgreSQL parce que le modèle a besoin de types
énumérés, de contraintes `CHECK`, et éventuellement d'`EXCLUDE` (cf. §6). Prisma parce
que les commentaires du code le désignent déjà et que son client typé s'aligne avec la
DAL.

---

## 2. Décisions de modélisation prises en amont

Rappel des choix déjà arbitrés, qui contraignent le modèle :

| Question | Décision |
|---|---|
| Garder une copie des infos de l'employé dans l'OM ? | **Oui** — snapshot dans `participation` |
| Les employés viennent d'où ? | **Saisis dans l'app** — `employe` est une table gérée en CRUD, pas un import |
| Référentiels : énumérations ou tables ? | **Les deux**, selon un critère — cf. §4 |
| Quota annuel de missions | **Retiré** (décision du directeur) |
| Comptes utilisateurs | **Entité séparée** de `employe` |

### Pourquoi le snapshot n'est pas une redondance

C'est le point le plus important du modèle, et il est déjà documenté dans
[types/om.ts:48-52](types/om.ts#L48-L52) à propos de `montantFraisFixeJournalier` :

> *Calculé à la création (statutHierarchique + zone de destination à ce moment-là), pas
> recalculé ensuite : comme les autres champs "snapshot", il doit refléter la situation
> au moment de la mission, pas une éventuelle révision ultérieure du barème ou un
> changement de statut de l'employé.*

Un ordre de mission est une **pièce administrative datée**. Si un agent passe de « Chef
de Bureau » à « Directeur » en novembre, l'OM émis en mars doit continuer à afficher
« Chef de Bureau » et l'indemnité correspondante. Une jointure vers `employe` afficherait
la valeur d'aujourd'hui et falsifierait le document.

D'où : `participation` porte des colonnes dupliquées (`nom_snapshot`, `poste_snapshot`,
`montant_frais_fixe_journalier`…). Ce n'est pas une dénormalisation de performance,
c'est une **exigence fonctionnelle**. L'alternative serait d'historiser `employe`
(tables temporelles, `valide_du`/`valide_au`) : beaucoup plus lourd, et inutile ici
puisque seul l'instant de l'émission compte.

---

## 3. POSTE et STATUT : deux axes, deux tables

Question laissée ouverte par [lib/employees.ts:12-16](lib/employees.ts#L12-L16) :

> *⚠️ POSTES et STATUTS se recouvrent presque entièrement dans leur contenu actuel —
> probablement un doublon involontaire côté référentiels. […] à clarifier/fusionner si
> un jour ça s'avère être vraiment la même notion.*

**Verdict : ce ne sont pas la même notion. Deux tables distinctes.**

Les données du projet le prouvent — 2 employés sur 4 ont un poste différent de leur
statut, et c'est délibéré ([lib/employees.ts:67-68](lib/employees.ts#L67-L68) :
*« Volontairement différent du poste : illustre que poste et statut sont deux axes
indépendants »*) :

| Matricule | Poste (organigramme) | Statut (barème) |
|---|---|---|
| 0003 TOMO MBIANDA | Chef de Bureau | Agent de maîtrise |
| 0004 WOKMENI | Cadre | Agent de maîtrise |

Les trois axes, à ne pas confondre — la distinction est déjà écrite dans
[lib/referentiels.ts:13-22](lib/referentiels.ts#L13-L22) et [:78-86](lib/referentiels.ts#L78-L86) :

- **GRADE** — titre statutaire attaché à la *personne* (on le possède). Acquis par
  titularisation, détermine l'indice donc la rémunération, ne bouge pas en cas de
  mutation. Ex. « Ingénieur Principal ». → **champ libre**, dépend du corps.
- **POSTE** — emploi occupé dans l'*organigramme* (on l'occupe). Révocable. Sert au
  filtrage de la liste. → **table de référence**.
- **STATUT** — position hiérarchique qui, croisée avec la zone, **détermine l'indemnité
  journalière**. C'est l'axe qui porte l'argent. → **table de référence**.

Ce qui se recouvre, c'est le *contenu des deux listes*, pas le concept. Écarts réels :

| Présent seulement dans POSTES | Présent seulement dans STATUTS |
|---|---|
| PCA, Membre du Conseil d'Administration | Administrateur |
| Employé de bureau | Agent d'exécution |

Deux nettoyages à faire au passage :

- **`Sous-Directeur` (POSTES) vs `Sous-directeur` (STATUTS)** — casse différente sur la
  même chaîne. Le barème est indexé sur `"Sous-directeur"` ([lib/baremes.ts:11](lib/baremes.ts#L11)).
  Aujourd'hui sans conséquence puisque les deux référentiels sont disjoints, mais c'est
  une bombe à retardement : le jour où quelqu'un cherche un barème à partir du poste,
  `BAREME_FRAIS_FIXE["Sous-Directeur"]` renvoie `undefined` **silencieusement**. La
  migration doit normaliser les codes.
- **Les clés sont les libellés eux-mêmes.** `poste = "Chef de Service"` est à la fois
  la valeur stockée, la clé du barème et le texte affiché. Renommer un libellé
  casserait les données. → dans le modèle, `code` (stable, ex. `CHEF_SERVICE`) séparé
  de `libelle` (affiché, modifiable). Le référentiel a déjà cette structure
  `{valeur, libelle}`, il suffit de rendre `valeur` réellement stable.

---

## 4. Énumération PostgreSQL ou table de référence ?

Tu demandais de vérifier. Le critère décisif n'est pas la taille de la liste mais
**trois questions** :

1. La liste peut-elle changer sans redéploiement (les RH doivent-ils pouvoir l'éditer) ?
2. La valeur porte-t-elle des attributs propres (libellé affiché, ordre, actif/inactif) ?
3. La valeur a-t-elle un sens dans la logique applicative (`if statut === …`) ?

Ce qu'il faut savoir sur les `ENUM` PostgreSQL :

- **Ajouter** une valeur est facile : `ALTER TYPE … ADD VALUE 'X'`.
- **Renommer ou supprimer** est pénible : pas de `DROP VALUE`. Il faut recréer le type
  et réécrire toutes les colonnes qui l'utilisent.
- Un `ENUM` **ne peut porter aucune colonne supplémentaire**. Pas de libellé accentué,
  pas d'ordre d'affichage, pas d'indicateur `actif`.
- Le tri par défaut suit l'ordre de déclaration, ce qui est parfois pratique
  (hiérarchie) mais se fige à la création.

D'où la répartition :

| Valeur | Choix | Raison |
|---|---|---|
| `statut_participation` (EN_ATTENTE/CONFIRME/ANNULE) | **ENUM** | Fermé, piloté par le code ([mockData.ts:154-164](lib/mockData.ts#L154-L164) contraint les transitions), jamais édité par un utilisateur |
| `role_utilisateur` | **ENUM** | Idem : les rôles sont des branches de code, pas des données |
| `continent` | **ENUM** | Géographie, 5 valeurs, immuable ([lib/continents.ts:7](lib/continents.ts#L7)) |
| `situation_famille` | **ENUM** | Fermé — mais cf. remarque ci-dessous |
| `departement` | **TABLE** | Les sigles sont incertains : *« proposés ici, à corriger si l'EDC en utilise d'autres »* ([referentiels.ts:35-36](lib/referentiels.ts#L35-L36)). Porte un libellé long. Écran d'admin à prévoir |
| `poste` | **TABLE** | Nomenclature RH évolutive, porte libellé + rang hiérarchique |
| `statut` | **TABLE** | Idem, et le rang pilote l'ordre de la pyramide ([admin/pyramide](app/admin/pyramide/page.tsx#L17-L23)) |
| `zone` | **TABLE** | 4 valeurs figées, **mais** porte `LIBELLE_ZONE`, affiché dans l'UI — impossible avec un ENUM |
| `pays` | **TABLE** | Porte la zone, qui est une **décision RH**, pas une donnée géographique |
| `motif`, `financement`, `moyen_transport` | **TEXT** pour l'instant | Champs libres aujourd'hui. Candidats à devenir des référentiels si les RH veulent normaliser |
| `ville_destination` | **TEXT** | Des milliers de valeurs, fournies par `country-state-city`. Aucun intérêt à les stocker |

### Remarque sur `situation_famille` — un piège d'accord

Le code stocke le libellé **accordé en genre** : `situationFamille: "Mariée"` pour
MAGNE, `"Célibataire"` pour NKOLO ([lib/employees.ts:41](lib/employees.ts#L41),
[:54](lib/employees.ts#L54)). Cette chaîne part telle quelle dans le `.docx`.

Si on passe à un ENUM (`CELIBATAIRE`, `MARIE`, `DIVORCE`, `VEUF`), on perd l'accord :
il faut alors connaître le **sexe** de la personne pour reconstituer « Marié » ou
« Mariée » à l'affichage. Or `sexe` n'est pas collecté aujourd'hui.

Deux options :
- **(a)** garder `situation_famille` en `TEXT` — comportement identique à aujourd'hui,
  zéro migration, mais aucune garantie d'intégrité et des filtres impossibles.
- **(b)** ENUM + nouvelle colonne `sexe` sur `employe`, libellé recalculé à l'affichage.
  Modèle correct, mais c'est une donnée de plus à saisir pour les 4 employés existants
  et dans le formulaire.

Le DDL ci-dessous retient **(b)**, avec `sexe` nullable pour ne pas bloquer la
migration : tant qu'il est `NULL`, on affiche la forme masculine. **À TRANCHER.**

---

## 5. MCD (notation Merise)

Les cardinalités se lisent côté entité : `(0,n)` = « un employé participe à zéro ou
plusieurs missions ».

```
        ┌──────────────┐                                    ┌──────────────┐
        │  DEPARTEMENT │                                    │     POSTE    │
        ├──────────────┤                                    ├──────────────┤
        │ code         │                                    │ code         │
        │ libelle      │                                    │ libelle      │
        │ actif        │                                    │ rang         │
        └──────┬───────┘                                    └──────┬───────┘
               │(0,n)                                        (0,n) │
               │                                                   │
          ╱AFFECTE_A╲                                         ╱OCCUPE╲
               │(1,1)                                        (1,1) │
               │           ┌───────────────────────┐               │
               └───────────┤        EMPLOYE        ├───────────────┘
                           ├───────────────────────┤
      ┌────────────────────┤ matricule       (ID)  ├──────────────────┐
      │             (1,1)  │ nom, prenoms          │ (1,1)            │
      │                    │ grade                 │                  │
 ╱A_POUR_STATUT╲           │ sexe                  │            ╱EST╲ │(0,1)
      │                    │ situation_famille     │                  │
      │(0,n)               │ indice                │            (0,1) │
┌─────┴────────┐           │ date_naissance        │      ┌───────────┴──────┐
│    STATUT    │           │ date_embauche         │      │   UTILISATEUR    │
├──────────────┤           └───────────┬───────────┘      ├──────────────────┤
│ code    (ID) │                       │(0,n)             │ id          (ID) │
│ libelle      │                       │                  │ email            │
│ rang         │                  ╱PARTICIPE╲             │ mot_de_passe_hash│
└─────┬────────┘                       │                  │ role             │
      │(1,n)                           │                  │ actif            │
      │            ┌───────────────────┴──────────────┐    └─────────┬────────┘
 ╱BAREME╲          │  attributs portés :              │              │(1,1)
      │  montant   │   numero_om           (unique)   │              │
      │  journalier│   statut_participation           │         ╱CREE╲
      │(1,n)       │   ─ snapshot ─                   │              │(0,n)
┌─────┴────────┐   │   nom, prenoms, grade            │              │
│     ZONE     │   │   poste, statut, departement     │              │
├──────────────┤   │   situation_famille, indice      │              │
│ code    (ID) │   │   montant_frais_fixe_journalier  │              │
│ libelle      │   │   ─ émission ─                   │              │
└─────┬────────┘   │   nom/grade/fonction_emetteur    │              │
      │(0,n)       │   lieu_emission, date_emission   │              │
      │            └───────────────────┬──────────────┘              │
 ╱CLASSE_EN╲                           │(1,n)                        │
      │(1,1)                           │                             │
┌─────┴────────┐              ┌────────┴─────────────┐               │
│     PAYS     │              │   ORDRE_MISSION      ├───────────────┘
├──────────────┤   (0,n)      ├──────────────────────┤
│ code_iso(ID) ├──╱DESTINE_A╲─┤ id              (ID) │
│ nom_fr       │       (1,1)  │ ville_destination    │
│ continent    │              │ via_passage          │
└──────────────┘              │ motif                │
                              │ financement          │
                              │ moyen_transport      │
                              │ date_depart          │
                              │ date_retour          │
                              │ chapitre, article,   │
                              │ paragraphe           │
                              │ exercice             │
                              │ cree_le              │
                              └──────────┬───────────┘
                                         │(0,n)
                                    ╱COMPORTE╲
                                         │(1,1)
                              ┌──────────┴───────────┐
                              │      ETAPE_VISA      │
                              ├──────────────────────┤
                              │ ordre           (ID) │
                              │ depart_de/_le/_heure │
                              │ arrivee_a/_le/_heure │
                              └──────────────────────┘

  ┌───────────────────┐
  │   CONFIGURATION   │   Table technique à ligne unique, hors relations.
  ├───────────────────┤
  │ age_retraite      │
  └───────────────────┘
```

### Lectures et justifications

- **`PARTICIPE` est une relation porteuse d'attributs** entre `EMPLOYE` et
  `ORDRE_MISSION`. C'est le cœur du modèle : une mission concerne N employés, chacun
  recevant **son propre document** (`numero_om` distinct, `statut_participation`
  propre), mais tous partageant l'itinéraire. C'est exactement ce que décrit
  [types/om.ts:21-22](types/om.ts#L21-L22) et [:59-61](types/om.ts#L59-L61).
- **`ETAPE_VISA` dépend de `ORDRE_MISSION`, pas de la participation** — parce que
  *« Partagée par toute la mission — tout le monde suit le même itinéraire »*
  ([types/om.ts:1-2](types/om.ts#L1-L2)). ⚠️ Sur le document papier, chaque étape est
  visée et cachetée pour **chaque voyageur**. Si un jour les visas doivent être saisis
  réellement (et pas remplis à la main), il faudra vérifier auprès des RH si un seul
  itinéraire partagé suffit. **À TRANCHER si le verso est réactivé.**
- **`ZONE` × `STATUT` → `BAREME`** : relation N-N porteuse du `montant_journalier`.
  C'est la traduction directe de `BAREME_FRAIS_FIXE: Record<statut, Record<Zone, number>>`
  ([lib/baremes.ts:6](lib/baremes.ts#L6)) — 10 statuts × 4 zones = 40 lignes.
- **`PAYS` porte la zone, pas le continent seulement.** Les deux découpages sont
  indépendants et [lib/continents.ts:3-6](lib/continents.ts#L3-L6) insiste :
  *« AUCUN rapport avec lib/zones.ts […] Deux découpages, deux besoins différents : ne
  pas les fusionner. »* Le continent sert aux rapports, la zone au barème.
- **`UTILISATEUR` ─ `EST` ─ `EMPLOYE` en (0,1)-(0,1)** : un compte *peut* correspondre
  à un employé, mais tout employé n'a pas de compte, et un compte technique
  (administrateur) peut n'être rattaché à personne.
- **`destination` n'est pas stockée.** C'est la chaîne composée « Pays, Ville » utilisée
  par le template Word ([types/om.ts:64-65](types/om.ts#L64-L65)). Elle se **dérive** de
  `pays.nom_fr` + `ville_destination`. Le code la stocke aujourd'hui en plus des deux
  champs séparés, par compatibilité avec des OM antérieurs — cette dette disparaît à la
  migration.

---

## 6. MLD — DDL PostgreSQL

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Types énumérés
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE statut_participation AS ENUM ('EN_ATTENTE', 'CONFIRME', 'ANNULE');
CREATE TYPE role_utilisateur     AS ENUM ('ADMINISTRATEUR_OM', 'UTILISATEUR_OM', 'CONSULTATION');
CREATE TYPE continent            AS ENUM ('AFRIQUE', 'AMERIQUE', 'ASIE', 'EUROPE', 'OCEANIE');
CREATE TYPE situation_famille    AS ENUM ('CELIBATAIRE', 'MARIE', 'DIVORCE', 'VEUF');
CREATE TYPE sexe                 AS ENUM ('M', 'F');

-- ═══════════════════════════════════════════════════════════════════════════
-- Référentiels
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE departement (
  code     VARCHAR(10)  PRIMARY KEY,          -- 'DEX', 'DAG', 'DSI'…
  libelle  VARCHAR(150) NOT NULL,
  actif    BOOLEAN      NOT NULL DEFAULT TRUE -- désactiver sans casser l'historique
);

CREATE TABLE poste (
  code               VARCHAR(40)  PRIMARY KEY,   -- 'CHEF_SERVICE' — stable
  libelle            VARCHAR(150) NOT NULL,      -- 'Chef de Service' — affiché
  rang               SMALLINT     NOT NULL,      -- 1 = plus élevé
  est_mandat_social  BOOLEAN      NOT NULL DEFAULT FALSE,  -- PCA, membre du CA
  actif              BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT poste_rang_unique UNIQUE (rang)
);

CREATE TABLE statut (
  code     VARCHAR(40)  PRIMARY KEY,             -- 'AGENT_MAITRISE'
  libelle  VARCHAR(150) NOT NULL,
  rang     SMALLINT     NOT NULL,                -- pilote l'ordre de la pyramide
  actif    BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT statut_rang_unique UNIQUE (rang)
);

CREATE TABLE zone (
  code     SMALLINT     PRIMARY KEY CHECK (code BETWEEN 0 AND 3),
  libelle  VARCHAR(200) NOT NULL
);

CREATE TABLE pays (
  code_iso   CHAR(2)      PRIMARY KEY,           -- ISO 3166-1 alpha-2
  nom_fr     VARCHAR(100) NOT NULL,
  continent  continent    NOT NULL,
  code_zone  SMALLINT     NOT NULL REFERENCES zone(code)
);

CREATE INDEX idx_pays_zone ON pays(code_zone);

-- Barème = relation (statut × zone) → montant. 40 lignes.
CREATE TABLE bareme_frais_fixe (
  code_statut        VARCHAR(40) NOT NULL REFERENCES statut(code),
  code_zone          SMALLINT    NOT NULL REFERENCES zone(code),
  montant_journalier INTEGER     NOT NULL CHECK (montant_journalier >= 0),  -- FCFA
  PRIMARY KEY (code_statut, code_zone)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Employés et comptes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE employe (
  matricule          VARCHAR(20)  PRIMARY KEY,   -- clé naturelle : '0001', '22P582'
  nom                VARCHAR(100) NOT NULL,
  prenoms            VARCHAR(150) NOT NULL,
  grade              VARCHAR(100) NOT NULL,      -- champ libre (dépend du corps)
  sexe               sexe         NULL,          -- pour l'accord de situation_famille
  situation_famille  situation_famille NOT NULL,
  indice             VARCHAR(10)  NULL,
  date_naissance     DATE         NOT NULL,      -- règle de départ en retraite
  date_embauche      DATE         NOT NULL,
  code_poste         VARCHAR(40)  NOT NULL REFERENCES poste(code),
  code_statut        VARCHAR(40)  NOT NULL REFERENCES statut(code),
  code_departement   VARCHAR(10)  NOT NULL REFERENCES departement(code),
  actif              BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT employe_embauche_apres_naissance CHECK (date_embauche > date_naissance)
);

CREATE INDEX idx_employe_nom        ON employe(nom);
CREATE INDEX idx_employe_statut     ON employe(code_statut);
CREATE INDEX idx_employe_departement ON employe(code_departement);

CREATE TABLE utilisateur (
  id                 BIGSERIAL    PRIMARY KEY,
  email              VARCHAR(255) NOT NULL UNIQUE,
  mot_de_passe_hash  TEXT         NOT NULL,      -- argon2id ou bcrypt, jamais en clair
  role               role_utilisateur NOT NULL,
  matricule          VARCHAR(20)  NULL UNIQUE REFERENCES employe(matricule),
  actif              BOOLEAN      NOT NULL DEFAULT TRUE,
  cree_le            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  derniere_connexion TIMESTAMPTZ  NULL
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Ordres de mission
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ordre_mission (
  id                   BIGSERIAL    PRIMARY KEY,
  code_pays            CHAR(2)      NOT NULL REFERENCES pays(code_iso),
  ville_destination    VARCHAR(120) NOT NULL,
  via_passage          VARCHAR(200) NULL,
  motif                TEXT         NOT NULL,
  financement          VARCHAR(150) NULL,
  moyen_transport      VARCHAR(100) NULL,
  date_depart          DATE         NOT NULL,
  date_retour          DATE         NOT NULL,
  -- Imputation budgétaire. Champs libres aujourd'hui ; deviendront un
  -- référentiel si l'EDC formalise sa nomenclature budgétaire.
  chapitre             VARCHAR(50)  NULL,
  article              VARCHAR(50)  NULL,
  paragraphe           VARCHAR(50)  NULL,
  exercice             VARCHAR(50)  NULL,
  exercice_annee       SMALLINT     NULL,
  cree_par             BIGINT       NOT NULL REFERENCES utilisateur(id),
  cree_le              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  modifie_le           TIMESTAMPTZ  NULL,
  CONSTRAINT om_dates_coherentes CHECK (date_retour >= date_depart)
);

CREATE INDEX idx_om_date_depart ON ordre_mission(date_depart);
CREATE INDEX idx_om_pays        ON ordre_mission(code_pays);

-- Numérotation des documents : une SÉQUENCE, pas un COUNT(*) — cf. §7.
CREATE SEQUENCE seq_numero_om START 1;

CREATE TABLE participation (
  id_ordre_mission  BIGINT      NOT NULL REFERENCES ordre_mission(id) ON DELETE CASCADE,
  matricule         VARCHAR(20) NOT NULL REFERENCES employe(matricule),

  numero_om         VARCHAR(30) NOT NULL UNIQUE,
  statut            statut_participation NOT NULL DEFAULT 'EN_ATTENTE',

  -- ── Snapshot : état de l'employé À L'ÉMISSION. Jamais recalculé. Cf. §2. ──
  nom_s                VARCHAR(100) NOT NULL,
  prenoms_s            VARCHAR(150) NOT NULL,
  grade_s              VARCHAR(100) NOT NULL,
  code_poste_s         VARCHAR(40)  NOT NULL,
  code_statut_s        VARCHAR(40)  NOT NULL,
  code_departement_s   VARCHAR(10)  NOT NULL,
  situation_famille_s  situation_famille NOT NULL,
  indice_s             VARCHAR(10)  NULL,
  montant_frais_fixe_journalier INTEGER NULL CHECK (montant_frais_fixe_journalier >= 0),

  -- ── Émission du document ──
  nom_emetteur       VARCHAR(100) NOT NULL,
  grade_emetteur     VARCHAR(100) NULL,
  fonction_emetteur  VARCHAR(150) NOT NULL,
  lieu_emission      VARCHAR(100) NOT NULL,
  date_emission      DATE         NOT NULL,

  confirme_le        TIMESTAMPTZ  NULL,
  annule_le          TIMESTAMPTZ  NULL,

  PRIMARY KEY (id_ordre_mission, matricule),

  -- Un statut daté doit porter sa date, et réciproquement.
  CONSTRAINT part_confirme_date CHECK (
    (statut = 'CONFIRME' AND confirme_le IS NOT NULL) OR (statut <> 'CONFIRME')
  ),
  CONSTRAINT part_annule_date CHECK (
    (statut = 'ANNULE' AND annule_le IS NOT NULL) OR (statut <> 'ANNULE')
  )
);

CREATE INDEX idx_part_matricule ON participation(matricule);
CREATE INDEX idx_part_statut_s  ON participation(code_statut_s);   -- pyramide
CREATE INDEX idx_part_en_attente ON participation(id_ordre_mission)
  WHERE statut = 'EN_ATTENTE';                                    -- index partiel

-- Itinéraire partagé par la mission (verso du document, tableau VISAS).
CREATE TABLE etape_visa (
  id_ordre_mission BIGINT      NOT NULL REFERENCES ordre_mission(id) ON DELETE CASCADE,
  ordre            SMALLINT    NOT NULL,          -- 1, 2, 3… séquence du trajet
  depart_de        VARCHAR(120) NULL,
  depart_le        DATE         NULL,
  depart_heure     TIME         NULL,
  arrivee_a        VARCHAR(120) NULL,
  arrivee_le       DATE         NULL,
  arrivee_heure    TIME         NULL,
  PRIMARY KEY (id_ordre_mission, ordre)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Configuration : UNE seule ligne, colonnes typées
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE configuration (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- verrou : 1 ligne max
  age_retraite SMALLINT NOT NULL CHECK (age_retraite BETWEEN 50 AND 75),
  modifie_le   TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_par  BIGINT   NULL REFERENCES utilisateur(id)
);

INSERT INTO configuration (id, age_retraite) VALUES (1, 60);
```

### Pourquoi `configuration` en colonnes typées et pas en clé/valeur

Une table `parametre(cle TEXT, valeur TEXT)` est tentante (extensible sans migration)
mais perd tout : `age_retraite` ne serait plus un entier, la borne 50–75 ne serait plus
vérifiable en base, et chaque lecture demanderait un cast plus une gestion du cas
« clé absente ». Ici le `CHECK (age_retraite BETWEEN 50 AND 75)` reproduit exactement
`AGE_RETRAITE_MIN`/`MAX` de [lib/config.ts:41-42](lib/config.ts#L41-L42), mais côté
serveur, où personne ne peut le contourner. Le `CHECK (id = 1)` garantit qu'il n'y aura
jamais deux configurations concurrentes.

### Où vit chaque règle métier

| Règle | Aujourd'hui | En base |
|---|---|---|
| `date_retour >= date_depart` | validation formulaire | **`CHECK`** — garanti |
| Âge de retraite | `verifierRetraite` | **DAL + trigger** — un `CHECK` ne peut pas lire une autre table |
| Non-chevauchement des missions | `verifierConcurrence` | **DAL**, éventuellement trigger — cf. ci-dessous |
| Transitions de statut | `confirmerParticipant` etc. | **DAL** (`CHECK` couvre juste la cohérence date/statut) |
| Un employé une seule fois par mission | non vérifié | **PK composite** — garanti |
| Barème existant pour (statut, zone) | `console.warn` en dev | **FK** vers `bareme_frais_fixe` |

Sur le non-chevauchement : PostgreSQL sait l'imposer nativement avec une contrainte
`EXCLUDE USING gist` sur un `daterange`, ce qui serait idéal. Mais les dates vivent sur
`ordre_mission` et la contrainte s'appliquerait sur `participation` — il faudrait donc
dupliquer les dates, ou passer par un trigger qui fait la jointure. Recommandation :
**garder la vérification dans la DAL** (la logique de `verifierConcurrence` est déjà
écrite, avec sa nuance avertissement/blocage que le SQL ne saurait pas exprimer), et
n'ajouter un trigger que si une garantie dure devient nécessaire.

---

## 7. Défauts du code actuel à corriger pendant la migration

**1. La numérotation des OM peut réattribuer un numéro déjà émis.**

```ts
// lib/mockData.ts:149-152
export function genererProchainNumeroOM(): string {
  const total = mockOMs.reduce((n, om) => n + om.participants.length, 0);
  return String(total + 1).padStart(4, "0");
}
```

C'est un `COUNT + 1`. Or `supprimerParticipant` supprime la mission entière quand son
dernier participant part : le total redescend, et le prochain OM créé **reprend un
numéro déjà utilisé sur un document signé**. Sur une pièce administrative, c'est grave.
La `SEQUENCE` du DDL corrige : elle ne recule jamais, même après suppression ou
transaction annulée. C'est ce que visait la note *« séquence PostgreSQL »* de
[mockData.ts:148](lib/mockData.ts#L148).

Au passage : le format actuel est `"0001"`, sans exercice ni mention de service. Les
numéros d'OM administratifs ressemblent plutôt à `0123/OM/EDC/DG/2026`. **À TRANCHER
avec les RH** — d'où `numero_om VARCHAR(30)` et non un entier.

**2. Incohérences dans les données de démonstration** (à ne pas migrer telles quelles) :

- matricule `0001` est en `DEX` dans [mockData.ts:46](lib/mockData.ts#L46) mais en `DSI`
  dans [employees.ts:40](lib/employees.ts#L40) ;
- son `montantFraisFixeJournalier: 27000` contredit le barème (Cadre × zone 0 =
  **60 000** FCFA, [baremes.ts:14](lib/baremes.ts#L14)).

**3. Cas limites de zones à valider par les RH** avant de figer la table `pays` —
[lib/zones.ts:9-14](lib/zones.ts#L9-L14) les signale déjà : Soudan en zone 1 (pas
Afrique du Nord), Turquie et Chypre en zone 2 comme Moyen-Orient (pas Europe), Sahara
occidental aligné sur le Maroc. Ces choix sont des **conventions du développeur**, pas
du barème officiel. Une erreur ici se traduit directement en euros sur un document.

**4. Références mortes à un fichier inexistant** : `AMELIORATIONS.md` est cité par
[mockData.ts:148](lib/mockData.ts#L148) et [route.ts:12](app/api/generate-om/route.ts#L12).
Le fichier n'existe pas. À remplacer par un renvoi vers le présent document.

**5. Seed des référentiels.** `pays` doit être amorcée (~250 lignes) depuis
`i18n-iso-countries` + `lib/continents.ts` + `lib/zones.ts`. Argument pour la figer en
base plutôt que de la recalculer à chaque démarrage : une mise à jour de la librairie
pourrait reclasser un pays et **changer une indemnité** sans que personne ne le voie.

---

## 8. Ce que ce modèle ne couvre pas encore

### Les frais détaillés — **À TRANCHER**

`Frais`, `fraisPrevisionnels` et `fraisReels` existent dans
[types/om.ts:14-19](types/om.ts#L14-L19) et [:55-56](types/om.ts#L55-L56), mais toute
leur interface est commentée depuis le 03/08/2026, et
`ajouterFraisPrevisionnel`/`modifierFraisPrevisionnel` sont du code mort (warnings
ESLint). Le seul frais réellement vivant est `montant_frais_fixe_journalier`, déjà dans
`participation`.

Trois options :

- **(a)** Ne rien modéliser. L'app émet des OM, le règlement des frais reste hors
  périmètre — cohérent avec le document lui-même, dont la section « RÈGLEMENT DÉFINITIF »
  est explicitement *« rempli manuellement par l'agent au retour de mission (non géré
  par l'application) »* ([OMPreview.tsx:382-383](components/OMPreview.tsx#L382-L383)).
- **(b)** Modéliser maintenant, une seule table avec discriminant :
  ```sql
  CREATE TYPE nature_frais AS ENUM ('PREVISIONNEL', 'REEL');
  CREATE TABLE frais (
    id               BIGSERIAL PRIMARY KEY,
    id_ordre_mission BIGINT      NOT NULL,
    matricule        VARCHAR(20) NOT NULL,
    nature           nature_frais NOT NULL,
    type_depense     VARCHAR(60)  NOT NULL,  -- Transport, Hébergement, Restauration…
    montant          INTEGER      NOT NULL CHECK (montant >= 0),
    description      TEXT         NULL,
    FOREIGN KEY (id_ordre_mission, matricule)
      REFERENCES participation(id_ordre_mission, matricule) ON DELETE CASCADE
  );
  ```
  Une table plutôt que deux : les colonnes sont identiques, le discriminant évite de
  dupliquer la structure et les requêtes.
- **(c)** Garder la structure documentée ici mais ne pas créer la table.

Mon avis : **(a)**, et rouvrir le sujet seulement si les RH demandent le suivi des
dépenses. Créer des tables qu'aucun écran n'alimente ajoute de la maintenance pour rien,
et le passage de (a) à (b) est une simple migration additive — aucune donnée à
reprendre, puisqu'il n'y en a pas.

### Hors périmètre, assumé

- **Journal d'audit** (qui a modifié quoi). `cree_par`, `cree_le`, `modifie_le`,
  `confirme_le`, `annule_le` donnent l'essentiel. Une vraie table d'audit se rajoute
  plus tard sans toucher au modèle.
- **Brouillons.** [contexts/brouillonContext.tsx](contexts/brouillonContext.tsx) n'est
  qu'un booléen d'UI (« il y a une saisie en cours, prévenir avant de quitter »), pas
  une donnée à persister. Si un jour un OM doit pouvoir être sauvegardé incomplet, il
  faudra un statut `BROUILLON` — et alors relâcher les `NOT NULL` de `ordre_mission`.
- **Multi-destination.** Une mission a **un** pays. Le template Word n'a qu'une balise
  `destination`, donc la contrainte vient du document lui-même. `via_passage` reste un
  texte libre. Si une mission devait couvrir plusieurs pays de zones différentes, le
  calcul de l'indemnité changerait de nature — sujet à part entière.
- **Pièces jointes** (justificatifs, billets) : aucun besoin exprimé.

---

## 9. Ordre de migration proposé

1. `docker-compose` PostgreSQL local + `.env` (`DATABASE_URL`), `.env` ignoré par git.
2. `prisma/schema.prisma` traduisant le §6, puis `prisma migrate dev`.
3. Seed des référentiels : `zone`, `pays`, `poste`, `statut`, `departement`,
   `bareme_frais_fixe`, `configuration` — **après validation RH** des zones et du barème.
4. `lib/data/` avec `import "server-only"`, en commençant par les référentiels
   (lecture seule, sans risque).
5. Bascule des pages en composants serveur, référentiels d'abord.
6. `employe` : CRUD complet (les employés sont saisis dans l'app).
7. `ordre_mission` + `participation` : la partie sensible, avec les règles métier
   déplacées dans la DAL.
8. Authentification et rôles — **avant toute mise en ligne**. Aujourd'hui `/admin` est
   ouverte à tous et `POST /api/generate-om` fabrique un document depuis n'importe quel
   JSON.
9. Retrait de `lib/mockData.ts`, `lib/employees.ts` (données), `lib/useEstMonte.ts`
   (devenu inutile), et des lectures `localStorage` de `lib/config.ts`.
