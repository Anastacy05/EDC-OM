# EDC-OM — Architecture, MCD et MLD

> Document de conception. Version du 19/08/2026 (3ᵉ révision de la journée), intégrant
> `ref.txt`, `ref2.txt` et les arbitrages qui ont suivi.
>
> **À VALIDER RH** = confirmation attendue hors du projet. **À TRANCHER** = décision
> d'implémentation attendue.
>
> **Convention du projet : on ne supprime pas de code.** Tout retrait se fait par mise
> en commentaire préfixée `COMMENTÉ (JJ/MM/AAAA)` suivie du motif. Vaut aussi pour les
> champs de types et les entités de ce document — une décision peut être revue, et
> l'historique git seul ne dit pas *pourquoi*. Conséquence acceptée : ESLint signalera
> des symboles orphelins ; ce n'est pas un défaut à « corriger » par une suppression.

---

## 1. Architecture : local-first en création, validation en ligne

Deux contraintes se combinent, et c'est leur croisement qui définit l'architecture :

> *« La création et le téléchargement d'un OM se fait par l'utilisateur comme par l'admin
> et hors ligne. »*
>
> *« Seul l'admin peut confirmer une mission […] pour confirmer il doit être connecté. »*

D'où une asymétrie nette : **créer est local, valider est central.**

| Action | Qui | Réseau |
|---|---|---|
| Créer un OM | Utilisateur **et** admin | **hors ligne possible** |
| Télécharger l'OM (docx / PDF) | Utilisateur et admin | **hors ligne possible** |
| **Confirmer / annuler** un OM | **Admin seul** | **en ligne obligatoire** |
| CRUD du personnel | Admin | en ligne obligatoire |
| Valider un congé | Admin | en ligne obligatoire |
| Demander un congé | Utilisateur | hors ligne, mis en file |
| Consulter, rapports | Tous | hors ligne (cache) |

La règle qui rend l'ensemble cohérent : **rien n'a d'effet administratif avant la
validation**, et la validation voit toujours l'état complet de la base. Un OM créé hors
ligne est une *proposition* — imprimable, mais non validée.

### Les conflits : bloqués à la validation, pas arbitrés à la synchronisation

C'est l'arbitrage retenu, et il est meilleur que la « file d'anomalies » que j'avais
proposée : au lieu de départager deux écritures, **on refuse la validation** de celle qui
crée le conflit.

> *« S'il y a conflit, on le signalera à l'utilisateur plus tard et on rendra l'OM
> impossible à valider pour la période et l'employé en particulier qui créent le conflit
> (un autre OM sur cette période avec cet employé a déjà été validé). »*

Le conflit se détecte **le plus tôt possible** — au plus tard à la validation, mais
idéalement bien avant : à la création si le poste est en ligne, sinon dès l'arrivée sur le
serveur à la synchronisation. **C'est essentiel** : le DG signe le papier *avant* que
l'admin confirme (§10), donc un conflit découvert à la validation signifierait qu'un
document déjà signé ne peut plus être validé. La notification `OM_EN_CONFLIT` doit arriver
**avant que le document ne parte à la signature**.

Portée du blocage : **par participant, pas par mission**. Un OM de cinq personnes dont une
seule est en conflit reste validable pour les quatre autres — d'où l'importance que
`statut` vive sur `participation` et non sur `ordre_mission`, ce qui est déjà le cas.

| Cas | Traitement |
|---|---|
| Deux missions qui se chevauchent pour un employé | **Blocage à la validation** du participant fautif, motif affiché. Les autres participants passent |
| Confirmer / annuler en concurrence | Les deux exigent le réseau → le serveur sérialise. Précondition sur le statut de départ (déjà dans le code) |
| OM créé pour un employé désactivé | Désactivation impossible hors ligne → à la validation, on compare `desactive_le` à `cree_le`. OM postérieur = non validable |
| Doublon de matricule | Ajout d'employé = admin en ligne → `UNIQUE` répond « existe déjà » immédiatement |
| Barème divergent | Barème figé, aucun écran d'édition |
| Congés au-delà du solde | L'employé *demande*, l'admin valide sur l'état réel. Validation ordinaire, pas un conflit |

**Aucune fusion de données, aucune résolution automatique.** Un OM non validable reste
visible avec son motif ; l'admin annule ou l'utilisateur recrée. Une seule précaution
technique : chaque OM créé hors ligne porte un **ULID** généré par le navigateur, pour
qu'un renvoi après coupure ne crée pas de doublon (idempotence).

### Ce que ça implique techniquement

L'écriture hors ligne étant réelle, il faut une base locale (**IndexedDB**) et une file
d'envoi, pas seulement un cache de lecture. Mais la synchronisation reste
**unidirectionnelle et sans fusion** : le poste pousse ses créations, le serveur renvoie
l'état validé. C'est ce qui la rend abordable.

```
lib/data/          ← DAL serveur. Seule à parler à Prisma. `import "server-only"`.
lib/actions/       ← Server Functions ("use server") : validation, CRUD admin
lib/local/         ← IndexedDB : création d'OM, file d'envoi, cache de lecture
lib/sync/          ← pousse la file, réconcilie l'état validé
```

Deux règles que la doc Next 16 embarquée impose
([data-security.md](node_modules/next/dist/docs/01-app/02-guides/data-security.md)) :

1. **`import "server-only"`** en tête de chaque module de la DAL — sinon un `import`
   depuis un composant client embarque la chaîne de connexion dans le bundle navigateur.
2. **Autorisation vérifiée dans *chaque* Server Function** :
   > *Server Functions are reachable via direct POST requests, not just through your
   > application's UI. Always verify authentication and authorization inside every
   > Server Function.*

   C'est ce qui condamne l'API actuelle : `POST /api/generate-om` fabrique un document
   Word à partir du JSON qu'on lui envoie, sans rien vérifier.

**Conséquence importante sur la génération du document :** l'OM devant être téléchargeable
hors ligne, `docxtemplater` doit tourner **dans le navigateur**, pas dans le Route Handler
actuel. La bibliothèque le permet — c'est son usage d'origine. Le PDF, lui, passe par
l'impression du navigateur (§10), donc également hors ligne.

Point de vigilance vérifié : le guide PWA recommande Serwist pour l'hors-ligne mais
précise qu'il *« currently requires webpack configuration »*, alors que Next 16 compile
en Turbopack par défaut. Service Worker écrit à la main, ou compilation `--webpack`.
**À TRANCHER** le moment venu — sans effet sur le modèle de données.

**Stack : PostgreSQL 16 + Prisma**, IndexedDB côté navigateur.

---

## 2. Décisions arbitrées

| Question | Décision | Source |
|---|---|---|
| Copie des infos employé dans l'OM | **Oui**, snapshot dans `participation` | décidé |
| Origine des employés | **Ajoutés** dans l'app (le matricule préexiste) | `ref2` |
| Référentiels | Tables *et* énumérations, selon critère §4 | décidé |
| Quota annuel de missions | **Retiré** | directeur |
| Comptes utilisateurs | Entité séparée de `employe` | décidé |
| Fonction de l'employé | **Texte libre** saisi par l'admin | `ref.txt` |
| Barème des frais | **statut × zone**, le transport n'intervient pas | `ref2` |
| Frais détaillés | **Table conservée**, mais **aucun rapport n'en dépend** (§11) | arbitrage 19/08 |
| Sexe des employés | **Non collecté** | `ref2` |
| Retirer un participant | **Oui pendant la saisie** (état de formulaire), **non après enregistrement** | arbitrage 19/08 |
| Étapes VISA (verso) | **Sorties du périmètre** — renseignées hors application | arbitrage 19/08 |
| Émetteur de l'OM | **Toujours le DG** | `ref.txt` |
| Numéro d'OM | `0042/OM/EDC/DG/2026`, plages réservées (§7) | `ref2`, **À VALIDER RH** |
| Export PDF | Impression navigateur depuis l'aperçu A4 | décidé §10 |
| Signature électronique | **Validation tracée** (qui, quand, IP) — pas de cryptographie | arbitrage 19/08 |
| Notifications | **Table en base** + mail à la reconnexion (§9) | arbitrage 19/08 |
| Congés | **Modélisés** d'après le Statut du personnel, art. 80-82 (§8) | photo 19/08 |

### Trois précisions issues des derniers échanges

**Retirer un participant.** J'avais mal compris `ref2.txt`. La distinction est nette :
pendant la **saisie** d'un OM, on ajoute et retire des participants librement — c'est un
état de formulaire, il n'y a rien à modéliser. Après **enregistrement**, un participant
ne se retire plus : au pire son OM n'est jamais confirmé, ou il est annulé. Le bouton
« Supprimer » de [app/om/[id]/page.tsx:102-111](app/om/[id]/page.tsx#L102-L111), qui agit
sur un OM déjà enregistré, est donc à commenter.

**Étapes VISA.** Elles sont renseignées à la main, hors application. L'entité
`ETAPE_VISA` sort du modèle, et côté code sont à commenter : `VisaLeg` dans
[types/om.ts:1-10](types/om.ts#L1-L10), le champ `visas`, le tableau du verso dans
[OMPreview.tsx](components/OMPreview.tsx), et la propagation dans
[buildDocument.ts](lib/buildDocument.ts). Le verso reste **imprimé vierge**, à remplir
au stylo — ce qui est déjà le cas pour la section « RÈGLEMENT DÉFINITIF ».

**Frais.** `ref2.txt` demandait de les modéliser « pour les rapports et l'audit », mais
l'arbitrage suivant constate que personne ne les saisira. La table reste dans le modèle —
elle ne coûte rien et l'ajouter plus tard serait une migration purement additive — mais
**aucun rapport ne s'appuie dessus** (§11). Tension assumée, tranchée dans ce sens.
**À TRANCHER** si tu préfères la retirer franchement.

### Pourquoi le snapshot reste indispensable

`ref2.txt` précise que le barème ne bougera pas (*« montants figés appartenant au code de
l'entreprise »*) et que l'âge de retraite non plus. On pourrait en conclure que la copie
des données dans l'OM devient inutile. **C'est faux, et pour une autre raison** : ce
n'est pas le barème qui change, c'est **la personne**.

Si un agent passe de « Chef de Bureau » à « Directeur » en novembre, l'OM émis en mars
doit continuer d'afficher « Chef de Bureau » et l'indemnité correspondante. Une jointure
vers `employe` afficherait la situation d'aujourd'hui et **falsifierait une pièce
signée**. Le snapshot protège contre l'évolution de la carrière, pas contre celle du
barème.

C'est déjà écrit dans [types/om.ts:48-52](types/om.ts#L48-L52) et ça reste vrai.

---

## 3. Les trois axes, et la suppression du référentiel POSTES

`ref.txt` tranche : *« Un employé a un statut et une fonction »*, avec des exemples sans
ambiguïté (« Agent de Maîtrise » / « ASSISTANTE DIRECTION », « Sous-Directeur » /
« SOUS-DIRECTEUR DU BUDGET ET DU CONTRÔLE DE GESTION »).

| Axe | Nature | Stockage |
|---|---|---|
| **GRADE** | Titre statutaire attaché à la *personne*, lié à l'indice, ne bouge pas en cas de mutation | texte libre |
| **STATUT** | Rang hiérarchique qui, croisé avec la zone, **détermine l'indemnité** | **table de référence** |
| **FONCTION** | Intitulé précis du poste occupé dans l'organigramme | **texte libre** |

Le référentiel `POSTES` de [lib/referentiels.ts:53-67](lib/referentiels.ts#L53-L67)
**disparaît** : son contenu dupliquait `STATUTS` à quatre valeurs près, et ce que
`ref.txt` appelle « fonction » n'est pas une liste fermée de onze intitulés mais une
désignation précise, propre à chaque poste de l'organigramme.

Deux conséquences dans le code existant, à traiter à la migration :

- Le filtre « Tous les postes » de [app/om/page.tsx](app/om/page.tsx) s'appuie sur
  `POSTES`. Il basculera sur `STATUTS` (fiable, fermé), et la fonction deviendra une
  **recherche textuelle**. C'est le compromis accepté : `"CHEF DE SERVICE"` et
  `"Chef de service"` ne se filtreront pas ensemble.
- `Participant.poste` et `Employee.poste` deviennent `fonction`.

Nettoyage à ne pas oublier : `"Sous-Directeur"` (POSTES) contre `"Sous-directeur"`
(STATUTS et clé du barème, [lib/baremes.ts:11](lib/baremes.ts#L11)) — casse différente
sur la même notion. Sans effet aujourd'hui car les référentiels sont disjoints, mais
`BAREME_FRAIS_FIXE["Sous-Directeur"]` renverrait `undefined` **silencieusement**. La
migration doit normaliser : `code` stable (`SOUS_DIRECTEUR`) distinct du `libelle`
affiché.

---

## 4. Énumération PostgreSQL ou table de référence ?

Le critère n'est pas la taille de la liste, ce sont trois questions :

1. La liste peut-elle changer sans redéploiement (les RH doivent-ils l'éditer) ?
2. La valeur porte-t-elle des attributs propres (libellé, ordre, actif) ?
3. La valeur a-t-elle un sens dans la logique du code (`if statut === …`) ?

Ce qu'il faut savoir des `ENUM` PostgreSQL : ajouter une valeur est facile
(`ALTER TYPE … ADD VALUE`), **renommer ou supprimer est pénible** (pas de `DROP VALUE` :
il faut recréer le type et réécrire les colonnes), et un ENUM **ne porte aucune colonne
supplémentaire** — donc pas de libellé accentué, pas d'ordre d'affichage, pas
d'indicateur `actif`.

| Valeur | Choix | Raison |
|---|---|---|
| `statut_participation` | **ENUM** | Fermé, piloté par le code, jamais édité |
| `role_utilisateur` | **ENUM** | Les rôles sont des branches de code |
| `continent` | **ENUM** | Géographie, 5 valeurs, immuable |
| `situation_famille` | **ENUM** | Fermé — cf. remarque ci-dessous |
| `nature_frais` | **ENUM** | Prévisionnel / réel, fermé |
| `statut_demande` | **ENUM** | Workflow de la demande de congé |
| `departement` | **TABLE** | Sigles incertains (*« proposés ici, à corriger »*), libellé long, écran d'admin à prévoir |
| `statut` | **TABLE** | Nomenclature RH, porte libellé + rang (qui pilote la pyramide) |
| `zone` | **TABLE** | 4 valeurs figées, **mais** porte un libellé affiché — impossible en ENUM |
| `pays` | **TABLE** | Porte la zone, qui est une décision RH |
| `motif`, `financement`, `moyen_transport` | **TEXT** | Champs libres ; candidats à devenir des référentiels si les RH normalisent |
| `ville_destination` | **TEXT** | Des milliers de valeurs, fournies par `country-state-city` |
| `fonction` | **TEXT** | Décision explicite (§3) |

### `situation_famille` sans le sexe

Le code stocke aujourd'hui le libellé **accordé** (`"Mariée"` pour MAGNE,
[lib/employees.ts:54](lib/employees.ts#L54)) et l'envoie tel quel dans le `.docx`.
`ref2.txt` écarte la collecte du sexe.

Solution retenue, qui est celle des formulaires administratifs français :
**ENUM + libellé entre parenthèses.**

| Valeur stockée | Libellé affiché et imprimé |
|---|---|
| `CELIBATAIRE` | Célibataire |
| `MARIE` | Marié(e) |
| `DIVORCE` | Divorcé(e) |
| `VEUF` | Veuf(ve) |

On garde l'intégrité et le filtrage d'un ENUM, sans avoir besoin du sexe. Le document
imprimera « Marié(e) », ce qui est la forme usuelle sur une pièce administrative.

---

## 5. MCD (notation Merise)

Les cardinalités se lisent côté entité : `(0,n)` = « un employé participe à zéro ou
plusieurs missions ».

```
        ┌──────────────┐                              ┌──────────────────┐
        │  DEPARTEMENT │                              │   UTILISATEUR    │
        ├──────────────┤                              ├──────────────────┤
        │ code    (ID) │                              │ id          (ID) │
        │ libelle      │                              │ email            │
        │ actif        │                              │ mot_de_passe_hash│
        └──────┬───────┘                              │ role             │
               │(0,n)                                 │ actif            │
               │                                      └────┬────────┬────┘
          ╱AFFECTE_A╲                                 (0,1)│        │(1,1)
               │(1,1)                                      │        │
               │            ┌──────────────────────┐  ╱EST╲│   ╱CREE╲
               └────────────┤       EMPLOYE        ├───────┘        │(0,n)
                            ├──────────────────────┤ (0,1)          │
      ┌─────────────────────┤ matricule       (ID) │                │
      │              (1,1)  │ nom, prenoms         │                │
      │                     │ grade                │                │
 ╱A_POUR_STATUT╲            │ fonction             │                │
      │                     │ situation_famille    │                │
      │(0,n)                │ indice               │                │
┌─────┴────────┐            │ date_naissance       │                │
│    STATUT    │            │ date_embauche        │                │
├──────────────┤            │ actif                │                │
│ code    (ID) │            └──────┬───────────────┘                │
│ libelle      │                   │(0,n)                           │
│ rang         │                   │                                │
└─────┬────────┘              ╱PARTICIPE╲                           │
      │(1,n)                       │                                │
      │           ┌────────────────┴─────────────────┐              │
 ╱BAREME╲         │  attributs portés :              │              │
      │ montant_  │   numero_om           (unique)   │              │
      │ journalier│   statut_participation           │              │
      │(1,n)      │   ─ snapshot à l'émission ─      │              │
┌─────┴────────┐  │   nom, prenoms, grade, fonction  │              │
│     ZONE     │  │   code_statut, code_departement  │              │
├──────────────┤  │   situation_famille, indice      │              │
│ code    (ID) │  │   montant_frais_fixe_journalier  │              │
│ libelle      │  │   ─ émission ─                   │              │
└─────┬────────┘  │   nom/grade/fonction_emetteur    │              │
      │(0,n)      │   lieu_emission, date_emission   │              │
      │           └────┬───────────────────────┬─────┘              │
 ╱CLASSE_EN╲           │(1,n)                  │(0,n)               │
      │(1,1)           │                       │                    │
┌─────┴────────┐  ┌────┴──────────────┐   ╱ENGAGE╲                  │
│     PAYS     │  │  ORDRE_MISSION    │        │(1,1)               │
├──────────────┤  ├───────────────────┤  ┌─────┴──────────┐         │
│ code_iso(ID) │  │ id           (ID) │  │     FRAIS      │         │
│ nom_fr       ├──┤ ville_destination │  ├────────────────┤         │
│ continent    │  │ via_passage       │  │ id        (ID) │         │
└──────────────┘  │ motif             │  │ nature         │         │
      (0,n)       │ financement       │  │ type_depense   │         │
   ╱DESTINE_A╲    │ moyen_transport   │  │ montant        │         │
      (1,1)       │ date_depart       │  │ description    │         │
                  │ date_retour       │  └────────────────┘         │
                  │ chapitre, article,│                             │
                  │ paragraphe        │                             │
                  │ exercice, annee   ├─────────────────────────────┘
                  │ cree_le, ulid     │
                  └───────────────────┘

  COMMENTÉ (19/08/2026) — ETAPE_VISA retirée : le tableau VISAS du verso est
  renseigné à la main, hors application. Le verso est imprimé vierge.
  ┌───────────────────┐
  │    ETAPE_VISA     │   ordre (ID), depart_de/_le/_heure,
  └───────────────────┘   arrivee_a/_le/_heure — dépendait de ORDRE_MISSION (1,1)

  ┌───────────────────┐   ┌──────────────────┐   ┌─────────────────────┐
  │   CONFIGURATION   │   │  PLAGE_NUMERO    │   │    NOTIFICATION     │
  ├───────────────────┤   ├──────────────────┤   ├─────────────────────┤
  │ age_retraite      │   │ id          (ID) │   │ id             (ID) │
  └───────────────────┘   │ annee            │   │ id_destinataire     │
   Ligne unique.          │ borne_min/max    │   │ type, message, lien │
                          │ id_utilisateur   │   │ lu_le, cree_le      │
                          │ prochain_numero  │   └─────────────────────┘
                          └──────────────────┘    Table, pas un état d'UI (§9)
                           Réservation, cf. §7

  ── CONGÉS (§8) ────────────────────────────────────────────────────────────
                  ┌──────────────────────┐
                  │  DEMANDE_CONGE       │        ┌────────────────────┐
                  ├──────────────────────┤        │   SOLDE_CONGE      │
                  │ id (ULID)       (ID) │        ├────────────────────┤
                  │ matricule            │        │ matricule     (ID) │
                  │ date_debut, date_fin │        │ annee         (ID) │
                  │ nombre_jours         │        │ jours_acquis       │
                  │ unite                │        │ unite              │
                  │ statut               │        │ jours_pris         │
                  │ soumise_le           │        │ jours_reportes     │
                  │ valide_par / _le     │        │ report_autorise_par│
                  │ motif_refus          │        │ prescrit_le        │
                  └──────────────────────┘        └────────────────────┘
                   (1,1) vers EMPLOYE              (1,1) vers EMPLOYE

                  ┌──────────────────────┐        ┌────────────────────┐
                  │   JOUR_FERIE         │        │  TYPE_CONGE        │
                  ├──────────────────────┤        ├────────────────────┤
                  │ date            (ID) │        │ code          (ID) │
                  │ libelle              │        │ libelle            │
                  └──────────────────────┘        │ decompte_solde     │
                   Nécessaire au calcul            └────────────────────┘
                   des jours ouvrables              Décidé par la DRH
```

### Lectures et justifications

- **`PARTICIPE` est une relation porteuse d'attributs.** C'est le cœur du modèle : une
  mission concerne N employés, chacun recevant **son propre document** (`numero_om`
  distinct, statut propre) — exactement ce que décrivent
  [types/om.ts:21-22](types/om.ts#L21-L22) et [:59-61](types/om.ts#L59-L61).
- **La clé primaire de `PARTICIPE` est (id_om, matricule)**, ce qui garantit
  structurellement qu'un employé ne figure qu'une fois par mission — règle aujourd'hui
  non vérifiée.
- **C'est `PARTICIPE` qui porte `statut`, pas `ORDRE_MISSION`**, et c'est ce qui rend
  possible le blocage de validation par participant décrit au §1 : sur une mission de
  cinq personnes dont une est en conflit, les quatre autres restent validables.
- **`FRAIS` dépend de la participation, pas de la mission** : une dépense est engagée par
  une personne. Table conservée, mais aucun rapport n'en dépend (§2, §11).
- **`ETAPE_VISA` est retirée** : le verso est renseigné hors application.
- **`ZONE` × `STATUT` → `BAREME`** : traduction directe de
  `Record<statut, Record<Zone, number>>` ([lib/baremes.ts:6](lib/baremes.ts#L6)),
  10 × 4 = 40 lignes. Le barème étant figé, **aucun écran d'administration** : seed
  uniquement, lecture seule depuis l'app.
- **`PAYS` porte la zone.** Les deux découpages sont indépendants et
  [lib/continents.ts:3-6](lib/continents.ts#L3-L6) insiste : *« AUCUN rapport avec
  lib/zones.ts […] ne pas les fusionner. »* Le continent sert aux rapports, la zone au
  barème.
- **`UTILISATEUR` ─ `EST` ─ `EMPLOYE` en (0,1)-(0,1)** : `ref.txt` prévoit « admin,
  simple user **ou aucun** » à l'ajout d'un employé. « Aucun » n'est pas une valeur de
  rôle, c'est **l'absence de ligne** dans `utilisateur`. D'où le `(0,1)` côté employé.
- **`destination` n'est pas stockée** : la chaîne « Pays, Ville » attendue par le
  template Word ([types/om.ts:64-65](types/om.ts#L64-L65)) se dérive de `pays.nom_fr` +
  `ville_destination`.
- **Pas de retrait de participant après enregistrement.** Un OM non voulu reste
  non confirmé, ou est annulé. Le retrait pendant la saisie est un état de formulaire.

### `chapitre`, `article`, `paragraphe`, `exercice` — l'imputation budgétaire

Ces quatre champs ne sont pas une invention du modèle : ils viennent du **document
officiel**. L'en-tête de l'OM porte un cadre intitulé « IMPUTATION BUDGÉTAIRE »
([OMPreview.tsx:279-292](components/OMPreview.tsx#L279-L292)) qui imprime :

```
        IMPUTATION BUDGETAIRE
    Chap. 65   Art. 12   Parag. 03
         Exercice 2026
```

C'est la **nomenclature budgétaire publique camerounaise** : elle dit sur quelle ligne du
budget la dépense de la mission est imputée. Du plus large au plus fin :

| Champ | Ce qu'il désigne |
|---|---|
| **Chapitre** | L'entité budgétaire — le ministère ou l'organisme qui porte la dépense |
| **Article** | La nature de la dépense à l'intérieur du chapitre |
| **Paragraphe** | La subdivision la plus fine, celle qui identifie la ligne exacte |
| **Exercice** | L'année budgétaire d'imputation (distincte de la date de mission) |

C'est ce qui permet à la DFCC de rattacher chaque OM à une ligne de crédit et de vérifier
qu'elle n'est pas dépassée. Sans imputation, un OM est un engagement de dépense sans
origine budgétaire — ce qu'un contrôleur financier refuserait.

`exerciceAnnee` est un **doublon d'affichage**, pas une donnée : le formulaire papier
imprime « 20 » en dur suivi de deux cases, d'où un champ ne contenant que `"26"`
([OMPreview.tsx:290-291](components/OMPreview.tsx#L290-L291)). Dans le modèle, une seule
colonne `exercice_annee SMALLINT` (2026) suffit ; les deux derniers chiffres se dérivent
à l'impression.

⚠️ **Rien dans le formulaire actuel ne permet de saisir ces quatre champs** — ils ne sont
alimentés que par les données de démonstration de `OMPreview`. Si le cadre est sur le
papier, quelqu'un doit le remplir. **À VALIDER auprès de la DFCC** : qui fournit
l'imputation, et existe-t-il une nomenclature fermée dont on pourrait faire un
référentiel plutôt que des champs libres ?

---

## 6. MLD — DDL PostgreSQL

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Types énumérés
-- ═══════════════════════════════════════════════════════════════════════════

-- 5 états, chacun avec un sens distinct (cf. §7, cycle de vie) :
--   EN_ATTENTE : créé, pas encore tranché
--   CONFIRME   : validé par l'admin, en ligne
--   ANNULE     : était confirmé, annulé ensuite par l'admin
--   REFUSE     : écarté par l'admin AVANT confirmation, avec motif
--   EXPIRE     : date_fin passée sans confirmation — posé automatiquement
CREATE TYPE statut_participation AS ENUM (
  'EN_ATTENTE', 'CONFIRME', 'ANNULE', 'REFUSE', 'EXPIRE'
);
CREATE TYPE role_utilisateur     AS ENUM ('ADMINISTRATEUR', 'UTILISATEUR');
CREATE TYPE continent            AS ENUM ('AFRIQUE','AMERIQUE','ASIE','EUROPE','OCEANIE');
CREATE TYPE situation_famille    AS ENUM ('CELIBATAIRE','MARIE','DIVORCE','VEUF');
CREATE TYPE nature_frais         AS ENUM ('PREVISIONNEL', 'REEL');
-- Congés (§8)
CREATE TYPE statut_demande       AS ENUM ('SOUMISE','VALIDEE','REFUSEE','ANNULEE');
CREATE TYPE unite_conge          AS ENUM ('OUVRABLE','CALENDAIRE');
-- Notifications (§9)
CREATE TYPE type_notification    AS ENUM (
  'OM_A_VALIDER','OM_CONFIRME','OM_ANNULE','OM_REFUSE','OM_EXPIRE','OM_EN_CONFLIT',
  'CONGE_A_VALIDER','CONGE_VALIDE','CONGE_REFUSE','SOLDE_INSUFFISANT'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Référentiels
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE departement (
  code     VARCHAR(10)  PRIMARY KEY,           -- 'DEX', 'DAG', 'DSI'…
  libelle  VARCHAR(150) NOT NULL,
  actif    BOOLEAN      NOT NULL DEFAULT TRUE  -- désactiver sans casser l'historique
);

CREATE TABLE statut (
  code       VARCHAR(40)  PRIMARY KEY,           -- 'SOUS_DIRECTEUR' — stable
  libelle    VARCHAR(150) NOT NULL,              -- 'Sous-directeur' — affiché
  rang       SMALLINT     NOT NULL,              -- 1 = plus élevé ; ordre de la pyramide
  -- Art. 81(4) : « les cadres bénéficient exceptionnellement de trente (30) jours
  -- calendaires », majorations d'ancienneté et de maternité exclues.
  --
  -- Règle arbitrée le 19/08/2026 : est cadre tout statut « Cadre ou
  -- hiérarchiquement au-dessus », soit les rangs 1 à 8 — donc 8 statuts sur 10.
  -- Seuls « Agent de maîtrise » et « Agent d'exécution » ne sont PAS cadres.
  --
  -- Colonne STOCKÉE et non dérivée de `rang` : si un statut était un jour inséré
  -- au rang 8, « Cadre » glisserait au rang 9 et basculerait silencieusement en
  -- non-cadre — ce qui changerait le droit à congé de tout le personnel concerné
  -- sans que personne ne le voie. Un booléen explicite ne peut pas faire ça.
  est_cadre  BOOLEAN      NOT NULL DEFAULT FALSE,
  actif      BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT statut_rang_unique UNIQUE (rang)
);

CREATE TABLE zone (
  code     SMALLINT     PRIMARY KEY CHECK (code BETWEEN 0 AND 3),
  libelle  VARCHAR(200) NOT NULL
);

CREATE TABLE pays (
  code_iso   CHAR(2)      PRIMARY KEY,         -- ISO 3166-1 alpha-2
  nom_fr     VARCHAR(100) NOT NULL,
  continent  continent    NOT NULL,
  code_zone  SMALLINT     NOT NULL REFERENCES zone(code)
);
CREATE INDEX idx_pays_zone ON pays(code_zone);

-- Barème = relation (statut × zone) → montant. 40 lignes, figées. Seed uniquement.
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
  -- Clé naturelle venue de l'extérieur : l'employé est AJOUTÉ, pas créé (ref2).
  matricule          VARCHAR(20)  PRIMARY KEY,
  nom                VARCHAR(100) NOT NULL,
  prenoms            VARCHAR(150) NOT NULL,
  grade              VARCHAR(100) NOT NULL,     -- champ libre (dépend du corps)
  fonction           VARCHAR(200) NOT NULL,     -- texte libre (ref.txt)
  situation_famille  situation_famille NOT NULL,
  indice             VARCHAR(10)  NULL,
  date_naissance     DATE         NOT NULL,     -- règle de départ en retraite
  date_embauche      DATE         NOT NULL,     -- base du calcul des congés
  code_statut        VARCHAR(40)  NOT NULL REFERENCES statut(code),
  code_departement   VARCHAR(10)  NOT NULL REFERENCES departement(code),
  -- Art. 81(5) : « majoration d'un jour de congé annuel par médaille » (Médailles
  -- d'Honneur du Travail). Donnée non collectée aujourd'hui — cf. §8.
  nombre_medailles   SMALLINT     NOT NULL DEFAULT 0 CHECK (nombre_medailles >= 0),
  -- Art. 81(6) : les fonctionnaires détachés gardent au moins le droit à congé de
  -- leur administration d'origine. Cf. §8, cas limite.
  est_detache        BOOLEAN      NOT NULL DEFAULT FALSE,
  jours_conge_origine NUMERIC(5,1) NULL,        -- droit de l'administration d'origine
  actif              BOOLEAN      NOT NULL DEFAULT TRUE,
  desactive_le       TIMESTAMPTZ  NULL,
  CONSTRAINT employe_embauche_apres_naissance CHECK (date_embauche > date_naissance),
  CONSTRAINT employe_desactivation_datee CHECK (actif OR desactive_le IS NOT NULL),
  CONSTRAINT employe_detache_a_un_droit CHECK (
    NOT est_detache OR jours_conge_origine IS NOT NULL
  )
);
CREATE INDEX idx_employe_nom         ON employe(nom);
CREATE INDEX idx_employe_statut      ON employe(code_statut);
CREATE INDEX idx_employe_departement ON employe(code_departement);

-- « admin, simple user ou aucun » : « aucun » = pas de ligne ici.
CREATE TABLE utilisateur (
  id                 BIGSERIAL    PRIMARY KEY,
  email              VARCHAR(255) NOT NULL UNIQUE,
  mot_de_passe_hash  TEXT         NULL,         -- NULL tant que non défini par l'employé
  role               role_utilisateur NOT NULL,
  matricule          VARCHAR(20)  NULL UNIQUE REFERENCES employe(matricule),
  actif              BOOLEAN      NOT NULL DEFAULT TRUE,
  cree_le            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  derniere_connexion TIMESTAMPTZ  NULL
);

-- Jeton d'initialisation / réinitialisation du mot de passe, envoyé par mail.
CREATE TABLE jeton_mot_de_passe (
  jeton_hash      TEXT        PRIMARY KEY,      -- on stocke le HACHÉ, jamais le jeton
  id_utilisateur  BIGINT      NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  expire_le       TIMESTAMPTZ NOT NULL,
  utilise_le      TIMESTAMPTZ NULL              -- usage unique
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Ordres de mission
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ordre_mission (
  id                BIGSERIAL    PRIMARY KEY,
  -- ULID généré par le NAVIGATEUR à la création, y compris hors ligne. Sert de clé
  -- d'idempotence : un renvoi après coupure réseau ne crée pas de doublon.
  ulid              CHAR(26)     NOT NULL UNIQUE,
  code_pays         CHAR(2)      NOT NULL REFERENCES pays(code_iso),
  ville_destination VARCHAR(120) NOT NULL,
  via_passage       VARCHAR(200) NULL,
  motif             TEXT         NOT NULL,
  financement       VARCHAR(150) NULL,
  moyen_transport   VARCHAR(100) NULL,
  date_depart       DATE         NOT NULL,
  date_retour       DATE         NOT NULL,
  -- Imputation budgétaire (cf. §5) : nomenclature budgétaire publique. Champs
  -- libres pour l'instant, référentiel possible après validation DFCC.
  chapitre          VARCHAR(50)  NULL,
  article           VARCHAR(50)  NULL,
  paragraphe        VARCHAR(50)  NULL,
  exercice          VARCHAR(50)  NULL,
  exercice_annee    SMALLINT     NULL,
  cree_par          BIGINT       NOT NULL REFERENCES utilisateur(id),
  -- Date de création LOCALE, telle que vue par le poste émetteur (peut précéder la
  -- synchronisation de plusieurs jours). Distincte de synchronise_le.
  cree_le           TIMESTAMPTZ  NOT NULL,
  synchronise_le    TIMESTAMPTZ  NULL,
  CONSTRAINT om_dates_coherentes CHECK (date_retour >= date_depart)
);
CREATE INDEX idx_om_date_depart ON ordre_mission(date_depart);
CREATE INDEX idx_om_pays        ON ordre_mission(code_pays);

-- Plages de numéros réservées par poste, pour la création hors ligne. Cf. §7.
CREATE TABLE plage_numero (
  id              BIGSERIAL PRIMARY KEY,
  annee           SMALLINT  NOT NULL,
  id_utilisateur  BIGINT    NOT NULL REFERENCES utilisateur(id),
  borne_min       INTEGER   NOT NULL,
  borne_max       INTEGER   NOT NULL,
  prochain_numero INTEGER   NOT NULL,   -- avance à mesure que le poste consomme
  reservee_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plage_bornes_ordonnees CHECK (borne_max >= borne_min),
  CONSTRAINT plage_curseur_dans_bornes
    CHECK (prochain_numero BETWEEN borne_min AND borne_max + 1),
  -- Deux plages de la même année ne peuvent pas se recouvrir. int4range est fermé
  -- à gauche, ouvert à droite, d'où borne_max + 1.
  EXCLUDE USING gist (
    annee WITH =,
    int4range(borne_min, borne_max + 1) WITH &&
  )
);
-- L'EXCLUDE ci-dessus exige : CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE participation (
  id_ordre_mission  BIGINT      NOT NULL REFERENCES ordre_mission(id),
  matricule         VARCHAR(20) NOT NULL REFERENCES employe(matricule),

  numero_om         VARCHAR(40) NOT NULL UNIQUE,  -- '0042/OM/EDC/DG/2026'
  statut            statut_participation NOT NULL DEFAULT 'EN_ATTENTE',

  -- ── Blocage de validation (§1). Renseignés par le serveur quand un conflit est
  --    détecté : l'OM reste consultable et imprimable, mais non validable.
  blocage_motif     TEXT         NULL,
  blocage_detecte_le TIMESTAMPTZ NULL,

  -- ── Snapshot : situation de l'employé À L'ÉMISSION. Jamais recalculé (§2). ──
  nom_s               VARCHAR(100) NOT NULL,
  prenoms_s           VARCHAR(150) NOT NULL,
  grade_s             VARCHAR(100) NOT NULL,
  fonction_s          VARCHAR(200) NOT NULL,
  code_statut_s       VARCHAR(40)  NOT NULL,
  code_departement_s  VARCHAR(10)  NOT NULL,
  situation_famille_s situation_famille NOT NULL,
  indice_s            VARCHAR(10)  NULL,
  montant_frais_fixe_journalier INTEGER NULL
    CHECK (montant_frais_fixe_journalier >= 0),

  -- ── Émission : toujours le DG (ref.txt), mais figé ici par sécurité ──
  nom_emetteur      VARCHAR(100) NOT NULL,
  grade_emetteur    VARCHAR(100) NULL,
  fonction_emetteur VARCHAR(150) NOT NULL,
  lieu_emission     VARCHAR(100) NOT NULL,
  date_emission     DATE         NOT NULL,

  -- ── Validation tracée (§12) : c'est la « signature électronique » retenue ──
  confirme_le       TIMESTAMPTZ  NULL,
  confirme_par      BIGINT       NULL REFERENCES utilisateur(id),
  confirme_depuis_ip INET        NULL,
  annule_le         TIMESTAMPTZ  NULL,
  annule_par        BIGINT       NULL REFERENCES utilisateur(id),
  annule_depuis_ip  INET         NULL,
  -- Refus par l'admin AVANT confirmation (§7) : remplace la suppression.
  refuse_le         TIMESTAMPTZ  NULL,
  refuse_par        BIGINT       NULL REFERENCES utilisateur(id),
  refuse_depuis_ip  INET         NULL,
  refuse_motif      TEXT         NULL,
  -- Péremption automatique : date_fin passée sans confirmation (§7).
  expire_le         TIMESTAMPTZ  NULL,

  -- Garantit qu'un employé ne figure qu'une fois par mission.
  PRIMARY KEY (id_ordre_mission, matricule),

  CONSTRAINT part_confirme_date CHECK (statut <> 'CONFIRME' OR confirme_le IS NOT NULL),
  CONSTRAINT part_annule_date   CHECK (statut <> 'ANNULE'   OR annule_le   IS NOT NULL),
  -- Un refus doit être motivé ET signé : c'est ce qui le distingue d'une
  -- suppression, où l'information disparaît sans que personne en réponde.
  CONSTRAINT part_refuse_motive CHECK (
    statut <> 'REFUSE' OR (refuse_par IS NOT NULL AND refuse_motif IS NOT NULL)
  ),
  CONSTRAINT part_expire_date   CHECK (statut <> 'EXPIRE'   OR expire_le  IS NOT NULL),
  -- Un participant bloqué ne peut pas être confirmé.
  CONSTRAINT part_blocage_interdit_confirmation
    CHECK (blocage_motif IS NULL OR statut <> 'CONFIRME')
);
CREATE INDEX idx_part_matricule  ON participation(matricule);
CREATE INDEX idx_part_statut_s   ON participation(code_statut_s);  -- pyramide
CREATE INDEX idx_part_en_attente ON participation(id_ordre_mission)
  WHERE statut = 'EN_ATTENTE';
CREATE INDEX idx_part_bloquees ON participation(matricule)
  WHERE blocage_motif IS NOT NULL;
-- Balayage de péremption : trouver les EN_ATTENTE dont la mission est terminée.
-- L'index porte sur ordre_mission(date_retour), déjà créé plus haut.

-- Frais : table conservée (ref2) mais AUCUN rapport n'en dépend — cf. §2 et §11.
CREATE TABLE frais (
  id               BIGSERIAL    PRIMARY KEY,
  id_ordre_mission BIGINT       NOT NULL,
  matricule        VARCHAR(20)  NOT NULL,
  nature           nature_frais NOT NULL,
  type_depense     VARCHAR(60)  NOT NULL,   -- Transport, Hébergement, Restauration…
  montant          INTEGER      NOT NULL CHECK (montant >= 0),
  description      TEXT         NULL,
  saisi_le         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  FOREIGN KEY (id_ordre_mission, matricule)
    REFERENCES participation(id_ordre_mission, matricule) ON DELETE CASCADE
);
CREATE INDEX idx_frais_participation ON frais(id_ordre_mission, matricule);

/* COMMENTÉ (19/08/2026) — les étapes VISA du verso sont renseignées à la main,
   hors application. Le verso est imprimé vierge. Table conservée ici en
   commentaire au cas où la saisie du verso reviendrait au périmètre ; il faudrait
   alors trancher si l'itinéraire est partagé par la mission (comme modélisé) ou
   propre à chaque voyageur (comme sur le papier, où chaque étape est visée et
   cachetée individuellement).

-- Itinéraire partagé (verso du document, tableau VISAS).
CREATE TABLE etape_visa (
  id_ordre_mission BIGINT       NOT NULL REFERENCES ordre_mission(id) ON DELETE CASCADE,
  ordre            SMALLINT     NOT NULL,   -- 1, 2, 3… séquence du trajet
  depart_de        VARCHAR(120) NULL,
  depart_le        DATE         NULL,
  depart_heure     TIME         NULL,
  arrivee_a        VARCHAR(120) NULL,
  arrivee_le       DATE         NULL,
  arrivee_heure    TIME         NULL,
  PRIMARY KEY (id_ordre_mission, ordre)
);
   FIN DU BLOC COMMENTÉ (etape_visa) */

-- ═══════════════════════════════════════════════════════════════════════════
-- Notifications (§9) — une TABLE, pas un état d'interface
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE notification (
  id              BIGSERIAL         PRIMARY KEY,
  id_destinataire BIGINT            NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  type            type_notification NOT NULL,
  message         TEXT              NOT NULL,
  lien            VARCHAR(300)      NULL,     -- route interne à ouvrir au clic
  lu_le           TIMESTAMPTZ       NULL,
  cree_le         TIMESTAMPTZ       NOT NULL DEFAULT now()
);
-- Index partiel : la pastille ne compte que les non lues.
CREATE INDEX idx_notif_non_lues ON notification(id_destinataire, cree_le DESC)
  WHERE lu_le IS NULL;

-- File des mails à envoyer. Un mail déclenché hors ligne part À LA RECONNEXION,
-- envoyé par le SERVEUR — jamais par le navigateur (§9).
CREATE TABLE mail_en_attente (
  id           BIGSERIAL   PRIMARY KEY,
  destinataire VARCHAR(255) NOT NULL,
  sujet        VARCHAR(300) NOT NULL,
  corps        TEXT        NOT NULL,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
  envoye_le    TIMESTAMPTZ NULL,
  tentatives   SMALLINT    NOT NULL DEFAULT 0,
  derniere_erreur TEXT     NULL
);
CREATE INDEX idx_mail_a_envoyer ON mail_en_attente(cree_le)
  WHERE envoye_le IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Configuration : UNE seule ligne, colonnes typées
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE configuration (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- verrou : 1 ligne max
  age_retraite SMALLINT NOT NULL CHECK (age_retraite BETWEEN 50 AND 75),
  -- Taille des plages de numéros réservées par poste (§7).
  taille_plage_numero SMALLINT NOT NULL DEFAULT 50 CHECK (taille_plage_numero > 0),
  modifie_le   TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_par  BIGINT   NULL REFERENCES utilisateur(id)
);
INSERT INTO configuration (id, age_retraite) VALUES (1, 60);
```

**Pourquoi `configuration` en colonnes typées et non en clé/valeur** : une table
`parametre(cle, valeur)` perdrait le type (`age_retraite` deviendrait du texte) et la
borne 50–75 ne serait plus vérifiable en base. Ici le `CHECK` reproduit
`AGE_RETRAITE_MIN`/`MAX` de [lib/config.ts:41-42](lib/config.ts#L41-L42) côté serveur,
où personne ne peut le contourner. Le `CHECK (id = 1)` interdit deux configurations
concurrentes.

### Où vit chaque règle métier

| Règle | Aujourd'hui | Demain |
|---|---|---|
| `date_retour >= date_depart` | formulaire | **`CHECK`** — garanti |
| Un employé une fois par mission | non vérifié | **PK composite** — garanti |
| Unicité du matricule | non vérifié | **PK** — garanti, message immédiat |
| Unicité du numéro d'OM | non garantie (§7) | **`UNIQUE`** + plages sans recouvrement (`EXCLUDE`) |
| Plages de numéros disjointes | inexistant | **`EXCLUDE USING gist`** — garanti |
| Barème existant pour (statut, zone) | `console.warn` en dev | **FK** |
| Un participant bloqué n'est pas confirmable | inexistant | **`CHECK`** — garanti |
| Âge de retraite | `verifierRetraite` | **DAL** (un `CHECK` ne lit pas une autre table) |
| Non-chevauchement | `verifierConcurrence` | **DAL, à la validation** — fiable car en ligne |
| Transitions de statut | `confirmerParticipant` | **DAL** + `CHECK` de cohérence date/statut |
| Confirmation réservée à l'admin | inexistant | **DAL** — vérification de rôle |
| Validation en ligne obligatoire | inexistant | **DAL** — par construction, c'est le serveur |

---

## 7. Numérotation des OM

### Le défaut actuel

```ts
// lib/mockData.ts:149-152
export function genererProchainNumeroOM(): string {
  const total = mockOMs.reduce((n, om) => n + om.participants.length, 0);
  return String(total + 1).padStart(4, "0");
}
```

C'est un `COUNT + 1`. Deux façons de le casser : d'une part `supprimerParticipant`
détruit la mission entière quand son dernier participant s'en va, faisant redescendre le
total ; d'autre part — et c'est désormais le cas dominant — **deux postes hors ligne
calculent le même total et émettent donc le même numéro**. Sur une pièce administrative,
réattribuer un numéro déjà émis est grave.

### La solution retenue : plages réservées

`ref2.txt` fixe le format : **`0042/OM/EDC/DG/2026`** — compteur sur 4 chiffres, année en
suffixe, donc **remise à zéro annuelle**. **À VALIDER RH.**

La création se faisant **hors ligne** (§1), un compteur central est hors de question : le
poste ne peut demander le numéro suivant à personne. Et renuméroter à la synchronisation
est inacceptable — le document est signé par le DG à la main, or **signer un papier portant
un numéro qui changera ensuite dissocie la pièce signée de son enregistrement**.

Le numéro doit donc être **définitif dès la création**. D'où la réservation de plages,
mécanisme classique de la facturation hors ligne :

1. **Quand le poste est connecté**, l'app réserve silencieusement un lot de numéros
   (`taille_plage_numero`, 50 par défaut) : une ligne dans `plage_numero` avec
   `borne_min`, `borne_max`, et un curseur `prochain_numero`.
2. **Hors ligne**, chaque OM créé consomme le curseur local. Numéro définitif,
   imprimable immédiatement.
3. **À la reconnexion**, le poste pousse ses OM et recharge sa réserve si elle s'épuise.

L'intégrité repose sur une contrainte native, pas sur du code applicatif :

```sql
EXCLUDE USING gist (
  annee WITH =,
  int4range(borne_min, borne_max + 1) WITH &&
)
```

Deux plages de la même année ne peuvent pas se recouvrir — PostgreSQL le refuse au niveau
du stockage. Combinée au `UNIQUE` sur `numero_om`, la collision devient structurellement
impossible. (Nécessite `CREATE EXTENSION btree_gist`, pour mélanger l'égalité sur `annee`
et le recouvrement sur l'intervalle dans un même index.)

Le numéro complet se compose : `lpad(numero, 4, '0') || '/OM/EDC/DG/' || annee`.

### Le prix à payer, à assumer explicitement

**La série peut comporter des trous** : un poste qui n'épuise pas sa réserve laisse des
numéros non émis. C'est auditable (les plages sont enregistrées, on sait qui détenait
quoi), mais ce n'est pas une série continue.

L'arbitrage appartient aux RH, et il est binaire :

| Priorité | Conséquence |
|---|---|
| **Imprimer hors ligne** | Plages réservées → trous possibles dans la série |
| **Série strictement continue** | Numérotation à la synchronisation → pas d'impression avant reconnexion |

Le modèle retient la première. **À VALIDER RH.**

### Cycle de vie d'un OM : pourquoi rien ne se supprime

Deux besoins ont été exprimés le 19/08 : l'admin veut écarter les OM non confirmés
« à sa guise », et l'utilisateur veut pouvoir retirer un OM périmé jamais confirmé.
Les deux sont légitimes. **Mais aucun ne doit être une suppression**, et c'est la
numérotation qui l'interdit.

**L'argument décisif.** Chaque OM consomme un numéro **définitif dès la création** (§7),
tiré d'une plage réservée, et il est **imprimable immédiatement**. Supprimer
l'enregistrement ne rend pas le numéro. Si `0042/OM/EDC/DG/2026` a été imprimé puis
supprimé, le numéro existe **sur papier mais plus en base** — précisément le défaut de
traçabilité que la numérotation par plages devait éliminer. On aurait payé une contrainte
`EXCLUDE` pour rien.

Trois raisons secondaires vont dans le même sens :

- **L'audit.** « Pourquoi cet agent a-t-il créé douze OM jamais confirmés ? » est une
  question de gestion légitime. Supprimer efface la réponse. Un OM non confirmé est une
  information, pas un déchet.
- **La convention du projet.** On ne supprime pas de code, on le commente avec la raison.
  La même logique vaut a fortiori pour une pièce administrative numérotée.
- **Le hors-ligne.** Une suppression hors ligne devient une pierre tombale à propager et
  réintroduit la course « supprimer contre confirmer » que tes règles avaient justement
  éliminée. On rouvrirait un cas de conflit déjà fermé.

**La solution : deux nouveaux statuts, aucune suppression.**

```
                    ┌──────────────┐
     création  ───► │  EN_ATTENTE  │
                    └──┬────┬────┬─┘
        admin, en ligne│    │    │automatique
                       │    │    │(date_fin dépassée)
              ┌────────┘    │    └────────┐
              ▼             ▼             ▼
        ┌───────────┐  ┌─────────┐  ┌─────────┐
        │ CONFIRME  │  │ REFUSE  │  │ EXPIRE  │
        └─────┬─────┘  └─────────┘  └─────────┘
              │ admin, en ligne
              ▼
        ┌───────────┐
        │  ANNULE   │
        └───────────┘
```

| Statut | Qui | Quand | Remplace |
|---|---|---|---|
| `REFUSE` | **Admin**, en ligne, **avec motif** | Il ne veut pas de cet OM | le bouton « Supprimer » |
| `EXPIRE` | **Le système**, automatiquement | `date_fin` passée et toujours `EN_ATTENTE` | la suppression par l'utilisateur |

`REFUSE` ne coûte aucun travail supplémentaire : c'est la transition qui manquait.
`annulerParticipant` n'accepte aujourd'hui que `CONFIRME → ANNULE`, donc un OM en attente
ne peut être qu'effacé — **faute d'alternative, pas par choix**. `REFUSE` est symétrique du
workflow des congés (`SOUMISE → REFUSEE` + `motif_refus`) et déclenche une notification à
l'auteur, avec la raison : ce qu'une suppression silencieuse ne fait pas.

**`EXPIRE` est automatique, et c'est le point important.** Un OM dont la date de fin est
passée sans confirmation est **caduc par définition** : il n'y a rien à décider, donc rien
à demander à un humain. Ton propre argument sur les frais s'applique ici — *« vu comme les
humains sont paresseux ils ne viendront certainement pas remplir »* : personne ne fera le
ménage. Le système le fait, la liste reste propre sans action, et le rapport n° 7 (« OM en
attente vieillissants ») devient un outil de pilotage au lieu d'une corvée.

**Conséquence : ni l'admin ni l'utilisateur n'ont besoin d'un bouton « Supprimer ».** Le
besoin est couvert, la traçabilité intacte, et le hors-ligne ne gagne aucun cas de conflit.

⚠️ **Un risque à traiter par ailleurs** : le document imprimé ne porte aujourd'hui aucune
marque de statut. Un OM refusé ou expiré, imprimé, a l'apparence d'une pièce valide. Le
traitement retenu est une **mention sur le document** pour ces états — mais pas pour
`EN_ATTENTE`, qui est justement le document destiné à la signature. Voir §10.

---

## 8. Zones : mes choix, à faire valider par les RH

`ref.txt` dit *« 3 zones parfois fonction du continent »*, le code en définit quatre
(0 à 3). Les deux se réconcilient : **la zone 0, c'est le Cameroun** — une mission
nationale, pas une zone étrangère. Il y a donc bien **trois zones à l'étranger**, plus le
cas national. À confirmer, mais c'est très probablement ce que dit le barème.

| Zone | Périmètre | Indemnité (Cadre, repère) |
|---|---|---|
| **0** | Cameroun (siège) | 60 000 F |
| **1** | Afrique, **sauf** Afrique du Nord et Afrique du Sud | 110 000 F |
| **2** | Afrique du Nord + Afrique du Sud, Moyen/Proche-Orient, Europe **sauf** DE/AT/CH et ex-URSS | 130 000 F |
| **3** | Allemagne, Autriche, Suisse, ex-URSS, Amériques, Asie hors Moyen-Orient, Océanie | 150 000 F |

### Les six choix que j'ai posés et qui ne viennent pas du barème

Ce sont des conventions de développement. Une erreur ici se lit **en FCFA sur un document
signé**.

1. **Soudan (SD) → zone 1**, traité comme l'Afrique subsaharienne et non comme l'Afrique
   du Nord.
2. **Turquie (TR) et Chypre (CY) → zone 2** au titre du Moyen-Orient, et non de l'Europe,
   du fait de leur position transcontinentale. Chypre est membre de l'UE — si le barème
   raisonne en termes politiques plutôt que géographiques, elle relèverait de l'Europe
   (même zone 2 en pratique, donc **sans conséquence financière** ici).
3. **Sahara occidental (EH) → zone 2**, aligné sur le Maroc.
4. **Pays baltes (Estonie, Lettonie, Lituanie) → zone 3** au titre de l'ex-URSS, alors
   qu'ils sont membres de l'UE et de la zone euro. **C'est le choix le plus discutable** :
   il change l'indemnité de 130 000 à 150 000 F pour un Cadre. Si le barème visait
   « l'ex-bloc soviétique » au sens politique de son époque de rédaction, c'est cohérent ;
   s'il visait « les pays de l'Est aujourd'hui », ce ne l'est pas.
5. **Russie (RU) → zone 3**, ex-URSS, alors qu'elle figure aussi dans la liste Europe.
   L'ordre des tests fait gagner l'ex-URSS.
6. **Reste du monde → zone 3 par défaut** : tout pays non listé (Asie hors Moyen-Orient,
   Océanie) tombe en zone 3. C'est un choix de repli, pas une règle explicite du barème.

Le point 4 est celui que je soumettrais en premier aux RH : c'est le seul qui a un impact
chiffré non ambigu.

---

## 9. Congés (« permissions ») — d'après le Statut du personnel, art. 80-82

Vocabulaire : « **permission** » désigne une **absence autorisée**, pas un droit d'accès
applicatif. Les droits d'accès, ce sont « admin, simple user ou aucun ».

Source : **Statut du personnel de la société EDC, chapitre III, articles 80 à 82** (p. 39).
Le module n'est pas implémenté à ce stade, mais le modèle est posé pour ne pas être à
refondre.

### Les règles telles qu'écrites

**Art. 80 — Droit au congé**
- Le congé annuel est **obligatoire**. Il doit être pris chaque année, **au plus tard après
  deux ans**. Le report d'un congé acquis n'est possible que **sur autorisation expresse du
  Directeur Général**.
- Ouvert au personnel justifiant d'une **période continue de travail d'au moins 12 mois**.
- Le droit est **prescrit 3 ans** à compter du jour de cessation de travail prévu pour la
  période de congé.

**Art. 81 — Durée**

| Alinéa | Règle | Modélisation |
|---|---|---|
| (1) | **1,5 jour ouvrable par mois** de service effectif | base : 12 mois → **18 jours ouvrables** |
| (2) | **+2 jours ouvrables par tranche de 5 ans** d'ancienneté | dérivé de `date_embauche` |
| (3) | Majoration pour les **mères salariées**, « conformément à la réglementation en vigueur » | ⚠️ non implémentable — voir ci-dessous |
| (4) | Les **cadres** ont **30 jours calendaires**, et les majorations (2) et (3) **ne s'appliquent pas** | `statut.est_cadre` + `unite = CALENDAIRE` |
| (5) | **+1 jour par Médaille d'Honneur du Travail** | `employe.nombre_medailles` |
| (6) | **Fonctionnaires détachés** : au moins le droit de leur administration d'origine | `est_detache` + `jours_conge_origine` |

**Art. 82 — Indemnité compensatrice**
- Versée en cas de cessation de contrat avant jouissance des congés acquis.
- Versée aussi à l'employé n'ayant pas pu partir **pour nécessités de service**, sur
  production d'une **attestation de non-jouissance**.
- ⚠️ Le même alinéa rappelle que *« la jouissance du droit au congé est obligatoire et
  l'octroi d'une indemnité en lieu et place du congé est formellement interdit par
  l'article 92 (5) du Code du Travail »*. L'indemnité est donc une **exception encadrée**,
  pas une option offerte au salarié. L'application ne doit pas la proposer comme un choix.

### Le piège central : jours ouvrables contre jours calendaires

**Les deux unités coexistent et ne sont pas convertibles l'une dans l'autre.** Un
non-cadre acquiert des **jours ouvrables** (art. 81.1), un cadre reçoit **30 jours
calendaires** (art. 81.4). 18 jours ouvrables ne « valent » pas 18 jours calendaires.

Conséquences directes sur le modèle :

- `solde_conge.unite` et `demande_conge.unite` sont **obligatoires** — un nombre de jours
  sans son unité est inexploitable.
- Décompter une absence exige de savoir compter les jours ouvrables entre deux dates,
  donc de connaître les **jours fériés** → table `jour_ferie`, à alimenter chaque année
  avec le calendrier camerounais.
- **Un jour ouvrable, c'est quoi ?** La formule 1,5 j/mois × 12 = 18 jours correspond à
  **3 semaines de 6 jours** (lundi-samedi), convention classique en droit du travail
  d'Afrique francophone. Si le samedi ne comptait pas, 18 jours feraient 3,6 semaines, ce
  qui ne correspond à aucun usage. **Je retiens donc lundi-samedi, mais c'est une
  déduction, pas une lecture — À VALIDER RH.** L'écart change chaque calcul de date de
  retour.

### Deux points tranchés le 19/08/2026

**1. « Les cadres » = statut Cadre ou au-dessus.** Soit, dans l'ordre hiérarchique du
référentiel, **8 statuts sur 10** :

| Rang | Statut | Cadre ? | Droit à congé |
|---|---|---|---|
| 1 | Administrateur | ✅ | 30 jours calendaires |
| 2 | Directeur Général | ✅ | 30 jours calendaires |
| 3 | Directeur Général Adjoint | ✅ | 30 jours calendaires |
| 4 | Directeur | ✅ | 30 jours calendaires |
| 5 | Sous-directeur | ✅ | 30 jours calendaires |
| 6 | Chef de Service | ✅ | 30 jours calendaires |
| 7 | Chef de Bureau | ✅ | 30 jours calendaires |
| 8 | Cadre | ✅ | 30 jours calendaires |
| 9 | Agent de maîtrise | ❌ | 1,5 j ouvrable/mois + majorations |
| 10 | Agent d'exécution | ❌ | 1,5 j ouvrable/mois + majorations |

Conséquence contre-intuitive à connaître : **les majorations d'ancienneté ne bénéficient
qu'aux deux statuts les plus bas.** Un Agent de maîtrise à 20 ans d'ancienneté obtient
18 + 8 = 26 jours ouvrables, tandis qu'un Cadre en obtient 30 calendaires quelle que soit
son ancienneté. Les deux unités n'étant pas comparables, on ne peut pas dire lequel est
« mieux servi » sans fixer la définition du jour ouvrable — d'où l'importance du point
ci-dessous.

`est_cadre` est une **colonne stockée, pas un test sur `rang`** : si un statut était
inséré au rang 8, « Cadre » glisserait au rang 9 et perdrait silencieusement son droit à
30 jours. Un booléen explicite ne peut pas régresser sans qu'on le veuille.

**2. Majoration « mères salariées » : saisie déclarative dans le formulaire de demande.**
La recommandation est retenue, avec une précision de ta part : le formulaire comportera
une case « je suis mère » et un champ « nombre d'enfants ». Le sexe n'est donc **pas
collecté sur la fiche employé** — c'est la salariée qui déclare sa situation au moment de
la demande, ce qui est à la fois plus juste (la donnée n'existe que là où elle sert) et
moins intrusif.

⚠️ La forme exacte du formulaire n'est pas arrêtée, **rien n'est implémenté**. Le modèle
prévoit `solde_conge.majoration_manuelle` + `majoration_motif` + `majoration_par` pour
recevoir la majoration une fois accordée. Il manque toujours **le barème de la majoration
elle-même** : l'art. 81.3 renvoie à « la réglementation en vigueur », dont le contenu n'est
pas dans la page fournie. **À VALIDER RH.**

### Jours fériés : synchronisation en ligne, mais pas de source complète

Ton intuition est juste — les fêtes musulmanes (Aïd el-Fitr à la fin du Ramadan, Aïd
el-Kébir) suivent le calendrier lunaire, leur date **varie d'une année sur l'autre** et
n'est confirmée qu'à quelques jours près. Les figer en dur obligerait à un déploiement
chaque année.

**Mais j'ai vérifié, et aucune source publique ne suffit à elle seule.** L'API la plus
courante (`date.nager.at`) renvoie pour le Cameroun 2026 **huit jours fériés
seulement** — Nouvel An, Fête de la Jeunesse (11 février), Vendredi Saint, Fête du
Travail, Ascension, Fête Nationale (20 mai), Assomption, Noël — et **aucune fête
musulmane**. Le Cameroun compte pourtant une population musulmane importante, et l'Aïd y
est férié. La source est donc incomplète précisément là où le besoin est le plus fort.

D'où le modèle en **trois niveaux**, du plus fiable au moins fiable :

| Origine | Ce qu'elle couvre | Fiabilité |
|---|---|---|
| `SAISIE_MANUELLE` | Ce que l'admin ajoute ou corrige | Fait toujours autorité |
| `SYNCHRONISE` | Les 8 fériés civils et chrétiens, récupérés en ligne | Bonne, mais incomplète |
| `CALCULE` | Dates fixes du calendrier camerounais | Bonne pour les dates fixes uniquement |

Trois principes qui découlent de la vérification :

1. **La saisie manuelle l'emporte toujours sur la synchronisation.** Une date corrigée par
   l'admin ne doit jamais être écrasée par un import ultérieur — d'où la colonne `origine`
   et la règle de fusion qui protège `SAISIE_MANUELLE`.
2. **L'Aïd est saisi à la main**, chaque année, dès que la date est officiellement annoncée.
   Ce n'est pas un défaut de conception, c'est la conséquence de l'absence de source
   fiable ; autant l'assumer et le rendre facile (un écran d'admin « jours fériés » avec
   les dates manquantes signalées).
3. **Un recalcul suit chaque modification du calendrier.** Ajouter un férié dans une
   période déjà décomptée change le solde des employés concernés — d'où
   `recalcul_requis_depuis`, qui marque la date à partir de laquelle les soldes sont à
   refaire. C'est exactement ce que tu décrivais : « une synchronisation et un recalcul des
   jours restants à chacun ».

⚠️ **Le recalcul ne concerne que les non-cadres.** Les cadres comptent en jours
calendaires (art. 81.4) : un férié tombant pendant leur congé ne leur rend pas un jour.
C'est une conséquence directe des deux unités, facile à oublier à l'implémentation.

⚠️ **Une correction de férié peut porter sur une demande déjà validée.** Le modèle
conserve alors le décompte tel qu'il a été validé (`demande_conge.nombre_jours` est un
instantané, comme les autres champs figés du projet) et n'ajuste que le **solde**. Sinon
une demande signée changerait de contenu après coup. **À VALIDER RH** si le rattrapage
doit plutôt rouvrir la demande.

```sql
CREATE TYPE origine_ferie AS ENUM ('SAISIE_MANUELLE', 'SYNCHRONISE', 'CALCULE');

CREATE TABLE jour_ferie (
  date_ferie DATE          PRIMARY KEY,
  libelle    VARCHAR(150)  NOT NULL,
  -- SAISIE_MANUELLE l'emporte toujours : un import ne doit jamais écraser une
  -- date corrigée à la main (typiquement l'Aïd, absent des sources publiques).
  origine    origine_ferie NOT NULL,
  -- Vrai pour les fêtes lunaires : signale que la date a pu bouger et qu'elle
  -- mérite une vérification annuelle.
  est_mobile BOOLEAN       NOT NULL DEFAULT FALSE,
  synchronise_le TIMESTAMPTZ NULL,
  saisi_par  BIGINT        NULL REFERENCES utilisateur(id),
  CONSTRAINT ferie_manuel_signe
    CHECK (origine <> 'SAISIE_MANUELLE' OR saisi_par IS NOT NULL)
);

-- Trace des synchronisations, et surtout : à partir de quelle date les soldes de
-- congés doivent être recalculés. Un férié ajouté dans une période déjà décomptée
-- change le solde des NON-CADRES (les cadres comptent en jours calendaires).
CREATE TABLE synchronisation_ferie (
  id                     BIGSERIAL   PRIMARY KEY,
  annee                  SMALLINT    NOT NULL,
  source                 VARCHAR(100) NOT NULL,
  nombre_importes        SMALLINT    NOT NULL,
  nombre_ignores_manuels SMALLINT    NOT NULL,  -- protégés car saisis à la main
  recalcul_requis_depuis DATE        NULL,
  execute_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**À TRANCHER** : quelle source pour la synchronisation ? Aucune n'est complète, donc le
choix porte sur ce qu'on accepte de saisir à la main. Si l'EDC ou le MINFOPRA publie un
calendrier officiel annuel, c'est évidemment la meilleure source — dis-moi s'il existe.

### Formule de calcul retenue

```
SI statut.est_cadre :                       -- rangs 1 à 8 (Cadre et au-dessus)
    jours_acquis = 30                       (unité CALENDAIRE)
                 + nombre_medailles          (art. 81.5, non exclu par 81.4)
    -- pas de majoration d'ancienneté ni de maternité (art. 81.4)

SINON :
    jours_acquis = 1,5 × mois_de_service_effectif        (art. 81.1)
                 + 2 × floor(anciennete_annees / 5)      (art. 81.2)
                 + nombre_medailles                      (art. 81.5)
                 + majoration_manuelle                   (art. 81.3 / 81.6)
                                            (unité OUVRABLE)

SI est_detache :
    jours_acquis = max(jours_acquis, jours_conge_origine)  (art. 81.6)

Éligibilité : anciennete >= 12 mois continus              (art. 80.2)
Report      : autorisé 1 an max, sur accord du DG         (art. 80.1)
Prescription: 3 ans                                       (art. 80.3)
```

⚠️ **Point d'interprétation** : l'art. 81.4 exclut les majorations « prévues aux alinéas 2
et 3 », donc l'ancienneté et la maternité — **mais pas l'alinéa 5** (les médailles). Un
cadre médaillé cumule donc 30 jours + ses médailles. C'est la lecture littérale du texte ;
**À VALIDER RH** si ce n'est pas l'intention.

Contrainte d'architecture : **la validation exige que l'admin soit en ligne** (`ref2`). La
demande, elle, se crée hors ligne et part à la reconnexion, avec son ULID d'idempotence.

### Ce qu'il me manque encore

- Les **types de congé** décidés par la DRH (payé, sans solde, maladie, maternité…) →
  table `type_conge`, avec un indicateur `decompte_solde`.
- Le **calendrier des jours fériés** camerounais.
- La réglementation référencée par l'art. 81.3.

---

## 10. Ce qui reste ouvert

| Sujet | État |
|---|---|
| Police de caractères | **Décidé et appliqué** : Inter via `next/font` (auto-hébergée, 7 fichiers `.woff2` servis en propre, aucune requête Google) |
| Signature électronique | **Décidé** : validation tracée (qui, quand, IP) + verrouillage. Pas de cryptographie — cf. §12 |
| Notifications | **Décidé** : table `notification` en base + `mail_en_attente` envoyé à la reconnexion — cf. §12 |
| Rapports | **Spécifiés** au §11 |
| Suppression d'un OM | **Décidé** : aucune. `REFUSE` (admin, motivé) et `EXPIRE` (automatique) — cf. §7 |
| Quels statuts sont « cadres » | **Décidé** : Cadre et au-dessus, soit 8 statuts sur 10 (§9) |
| Majoration « mères salariées » | **Décidé** : déclarée dans le formulaire de demande, majoration tracée. Barème encore manquant (§9) |
| **Téléchargement d'un OM non confirmé** | **Décidé** : toujours permis. Le processus l'exige — voir ci-dessous |
| Source des jours fériés | Aucune source complète : l'Aïd est absent des API publiques. **À TRANCHER** (§9) |
| Recalcul sur demande déjà validée | Décompte figé, solde ajusté — **À VALIDER RH** (§9) |
| Service Worker | Serwist (exige webpack) vs écrit à la main (compatible Turbopack) — **À TRANCHER** |
| Génération docx côté navigateur | `docxtemplater` doit migrer du Route Handler vers le client (hors ligne) — **À TRANCHER** |
| Jour ouvrable = lundi-samedi ? | Déduction de la formule 1,5 j/mois — **À VALIDER RH** (§9) |
| Cadre médaillé : 30 j + médailles ? | Lecture littérale de l'art. 81.4/81.5 — **À VALIDER RH** (§9) |
| Types de congé | Liste à fournir par la DRH (§9) |
| Numéro d'OM | Format + trous dans la série acceptés — **À VALIDER RH** (§7) |
| Zones | Six conventions à valider (§8) |
| Imputation budgétaire | Non saisissable aujourd'hui ; qui la fournit ? — **À VALIDER DFCC** (§5) |
| Table `frais` | Conservée mais inexploitée — **À TRANCHER** (§2) |

### Téléchargement et mention de statut : ce que la signature manuscrite implique

Le processus réel est arbitré (19/08) :

```
1. création                          → EN_ATTENTE
2. impression / téléchargement          ← INDISPENSABLE À CETTE ÉTAPE
3. signature manuscrite du DG (papier)
4. confirmation par l'admin, en ligne   → CONFIRME
```

**Donc le téléchargement est toujours permis**, sans condition de statut. Le restreindre
empêcherait purement et simplement d'obtenir la signature. La réimpression d'un exemplaire
perdu reste possible après confirmation.

**Ce que ça change au sens de « confirmer ».** La confirmation n'est pas une autorisation
de partir : **c'est l'enregistrement du fait que le papier est signé.** La validité vient
de la main du DG, l'application en conserve la trace. C'est cohérent avec la « signature
électronique » retenue au §12 — validation tracée, pas cryptographie : on n'a pas à
recréer numériquement une validité qui existe déjà sur le papier.

**Je corrige ma proposition de mention sur ce point.** J'avais suggéré de marquer
« EN ATTENTE DE CONFIRMATION — SANS VALEUR » les documents non confirmés. C'était faux :
on demanderait au DG de **signer un papier portant la mention « sans valeur »**, ce qui est
contradictoire. Un OM `EN_ATTENTE` est précisément le document destiné à être signé.

Par ailleurs le document se distingue déjà tout seul dans ce cas : **un OM non signé se
voit** — l'emplacement de signature est vide. La mention n'est nécessaire que pour les
états où le document ne doit **jamais** circuler comme valide :

| Statut | Mention sur le document |
|---|---|
| `EN_ATTENTE` | **aucune** — c'est le document à faire signer |
| `CONFIRME` | aucune — la signature manuscrite fait foi |
| `REFUSE` | « REFUSÉ — SANS VALEUR » |
| `EXPIRE` | « EXPIRÉ — SANS VALEUR » |
| `ANNULE` | « ANNULÉ » |

### Conséquence importante : le conflit doit être détecté AVANT l'impression

Le §1 prévoit la détection de conflit **à la validation**. Avec l'ordre confirmé ci-dessus,
la validation intervient **après** la signature du DG — donc un conflit découvert à ce
moment-là signifie qu'**un papier déjà signé ne peut plus être validé**. On aurait fait
signer le DG pour rien.

Il faut donc remonter la détection le plus tôt possible, sans changer le modèle :

| Moment | Ce qui se passe |
|---|---|
| **À la création, si en ligne** | Contrôle immédiat de concurrence — l'utilisateur est averti avant même d'imprimer |
| **À la synchronisation, si créé hors ligne** | Contrôle dès l'arrivée sur le serveur → notification `OM_EN_CONFLIT` à l'auteur, **avant qu'il porte le document au DG** |
| **À la validation** | Dernier filet de sécurité, plus une découverte |

La notification `OM_EN_CONFLIT` n'est donc pas un constat après coup : **c'est un
avertissement qui doit arriver avant la signature.** Elle change de nature — et de
priorité d'implémentation.

Et le document d'un OM en conflit mérite sa propre mention, pour éviter qu'il parte à la
signature : « CONFLIT DE PÉRIODE — À RÉGULARISER AVANT SIGNATURE ».

### Défauts du code à corriger à la migration

1. **Bouton « Supprimer »** ([app/om/[id]/page.tsx:102-111](app/om/[id]/page.tsx#L102-L111))
   et `supprimerParticipant` ([lib/mockData.ts:177](lib/mockData.ts#L177)) : à **commenter**
   — un participant ne se retire plus après enregistrement.
2. **Étapes VISA** : `VisaLeg` et `visas` dans [types/om.ts](types/om.ts), le tableau du
   verso dans [OMPreview.tsx](components/OMPreview.tsx), la propagation dans
   [buildDocument.ts](lib/buildDocument.ts) : à **commenter**. Le verso s'imprime vierge.
3. **Incohérences des données de démonstration** : matricule `0001` est en `DEX` dans
   [mockData.ts:46](lib/mockData.ts#L46) mais en `DSI` dans
   [employees.ts:40](lib/employees.ts#L40) ; son `montantFraisFixeJournalier: 27000`
   contredit le barème (Cadre × zone 0 = **60 000**,
   [baremes.ts:14](lib/baremes.ts#L14)).
4. **Références mortes à `AMELIORATIONS.md`** ([mockData.ts:148](lib/mockData.ts#L148),
   [route.ts:12](app/api/generate-om/route.ts#L12)) — fichier inexistant. À faire pointer
   vers le présent document.
5. **`POST /api/generate-om` sans revalidation ni authentification** : doit lire l'OM en
   base par son identifiant.
5. **Seed de `pays`** (~250 lignes) depuis `i18n-iso-countries` + `lib/continents.ts` +
   `lib/zones.ts`. À figer en base plutôt qu'à recalculer : une mise à jour de la
   librairie pourrait reclasser un pays et **changer une indemnité** sans que personne ne
   le voie.

---

### DDL des congés

```sql
-- Types de congé, décidés par la DRH. À VALIDER RH pour la liste exacte.
CREATE TABLE type_conge (
  code            VARCHAR(30)  PRIMARY KEY,   -- 'ANNUEL', 'SANS_SOLDE', 'MATERNITE'…
  libelle         VARCHAR(150) NOT NULL,
  decompte_solde  BOOLEAN      NOT NULL,      -- ce type ampute-t-il le solde annuel ?
  actif           BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Nécessaire au décompte des jours ouvrables (§9). Voir la sous-section
-- « Jours fériés » pour le DDL complet, avec origine et recalcul.

CREATE TABLE solde_conge (
  matricule       VARCHAR(20)  NOT NULL REFERENCES employe(matricule),
  annee           SMALLINT     NOT NULL,
  -- Art. 81 : unité OBLIGATOIRE — un cadre compte en jours calendaires, un
  -- non-cadre en jours ouvrables, et les deux ne sont pas convertibles.
  unite           unite_conge  NOT NULL,
  jours_acquis    NUMERIC(5,1) NOT NULL CHECK (jours_acquis >= 0),
  jours_pris      NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (jours_pris >= 0),
  -- Art. 81(3) et 81(6) : majorations dont le droit vient de l'extérieur
  -- (maternité, administration d'origine). Saisie tracée, cf. §9.
  majoration_manuelle NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (majoration_manuelle >= 0),
  majoration_motif    TEXT     NULL,
  majoration_par      BIGINT   NULL REFERENCES utilisateur(id),
  -- Art. 80(1) : report d'un an maximum, sur autorisation expresse du DG.
  jours_reportes      NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (jours_reportes >= 0),
  report_autorise_par BIGINT   NULL REFERENCES utilisateur(id),
  report_autorise_le  TIMESTAMPTZ NULL,
  -- Art. 80(3) : prescription à 3 ans.
  prescrit_le     DATE         NULL,
  PRIMARY KEY (matricule, annee),
  CONSTRAINT solde_pris_dans_le_droit
    CHECK (jours_pris <= jours_acquis + majoration_manuelle + jours_reportes),
  CONSTRAINT solde_majoration_motivee
    CHECK (majoration_manuelle = 0 OR majoration_motif IS NOT NULL),
  CONSTRAINT solde_report_autorise
    CHECK (jours_reportes = 0 OR report_autorise_par IS NOT NULL)
);

CREATE TABLE demande_conge (
  -- ULID généré par le NAVIGATEUR : la demande peut être créée hors ligne, et un
  -- renvoi après coupure ne doit pas produire de doublon.
  id              CHAR(26)     PRIMARY KEY,
  matricule       VARCHAR(20)  NOT NULL REFERENCES employe(matricule),
  code_type       VARCHAR(30)  NOT NULL REFERENCES type_conge(code),
  date_debut      DATE         NOT NULL,
  date_fin        DATE         NOT NULL,
  -- Calculé selon l'unité de l'employé, jours fériés déduits pour les ouvrables.
  nombre_jours    NUMERIC(5,1) NOT NULL CHECK (nombre_jours > 0),
  unite           unite_conge  NOT NULL,
  motif           TEXT         NULL,
  statut          statut_demande NOT NULL DEFAULT 'SOUMISE',
  soumise_le      TIMESTAMPTZ  NOT NULL,      -- date LOCALE de soumission
  synchronise_le  TIMESTAMPTZ  NULL,
  -- Validation tracée (§12) — l'admin doit être EN LIGNE.
  valide_par      BIGINT       NULL REFERENCES utilisateur(id),
  valide_le       TIMESTAMPTZ  NULL,
  valide_depuis_ip INET        NULL,
  motif_refus     TEXT         NULL,
  CONSTRAINT demande_dates_coherentes CHECK (date_fin >= date_debut),
  CONSTRAINT demande_validee_tracee
    CHECK (statut <> 'VALIDEE' OR (valide_par IS NOT NULL AND valide_le IS NOT NULL)),
  CONSTRAINT demande_refus_motive
    CHECK (statut <> 'REFUSEE' OR motif_refus IS NOT NULL)
);
CREATE INDEX idx_demande_matricule ON demande_conge(matricule, date_debut);
CREATE INDEX idx_demande_a_valider ON demande_conge(soumise_le)
  WHERE statut = 'SOUMISE';

/* Art. 82 — Indemnité compensatrice. NON MODÉLISÉE pour l'instant : l'article
   rappelle lui-même que « l'octroi d'une indemnité en lieu et place du congé est
   formellement interdit par l'article 92 (5) du Code du Travail », l'indemnité
   étant une exception encadrée (cessation de contrat, ou nécessités de service
   avec attestation de non-jouissance). Modéliser cela demanderait le mode de
   calcul de l'indemnité, absent du document fourni. À VALIDER RH. */
```

---

## 11. Rapports

Structurés selon une méthode explicite : **la forme découle du travail que le lecteur doit
faire**, la couleur vient en dernier, et les palettes sont **mesurées, pas estimées**.

### La contrainte que tu as posée

> *« Vu comme les humains sont paresseux ils ne viendront certainement pas remplir les
> frais plus tard. »*

Donc **aucun rapport ne dépend de la table `frais`**. Les trois rapports que j'avais
proposés dessus (prévisionnel contre réel, dépenses par nature, missions sans
justificatif) sont retirés.

Ce qui reste exploitable est en revanche **fiable par construction** : l'indemnité
journalière est calculée automatiquement à la création
([lib/baremes.ts](lib/baremes.ts) × [lib/zones.ts](lib/zones.ts)) et figée dans
`participation.montant_frais_fixe_journalier`. Personne n'a à la saisir, donc elle est
toujours présente et cohérente.

⚠️ **Mais elle ne couvre pas tout le coût** : ni le transport, ni l'hébergement. Le
montant affiché est donc un **plancher, pas un coût complet**. Chaque écran de rapport
financier doit porter cette mention — un chiffre partiel pris pour un budget est une
erreur qui se propage vite.

### Catalogue

`Coût` = `montant_frais_fixe_journalier × durée en jours`, sommé.

| # | Rapport | Travail du lecteur | Forme | Couleur |
|---|---|---|---|---|
| 1 | **Indicateurs de tête** | Lire 4 chiffres | **Rangée de tuiles** (valeur + variation) | aucune |
| 2 | **Coût par période** | Tendance | **Colonnes** (mois) ou ligne (années) | 1 teinte |
| 3 | **Coût par direction** | Comparer des magnitudes | **Barres horizontales triées** | 1 teinte |
| 4 | **Top destinations** | Comparer, palmarès | **Barres horizontales triées**, top 10 + « Autres » | 1 teinte |
| 5 | **Répartition par zone** | Comparer 4 classes **ordonnées** | **Colonnes** | rampe **ordinale** |
| 6 | **Suivi du processus** | Voir des parts d'un tout | **Barre empilée unique** | **statuts** |
| 7 | **OM en attente vieillissants** | Agir sur des lignes | **Tableau** trié par ancienneté | statut |
| 8 | **Missions par employé** | Chercher, trier, exporter | **Tableau** paginé | aucune |
| 9 | **Jours d'absence par direction** | Comparer | **Barres horizontales** | 1 teinte |
| 10 | **Carte du monde** *(existe)* | Repérer géographiquement | **Choroplèthe** | rampe séquentielle |
| 11 | **Frise chronologique** *(existe)* | Tendance annuelle | **Colonnes** | 1 teinte |
| 12 | **Pyramide par statut** *(existe)* | Voir la structure hiérarchique | **Barres, largeur par rang** | 1 teinte |

### Pourquoi ces formes, et pas d'autres

- **Aucun camembert.** Pour comparer des valeurs proches, l'œil lit mal les angles. La
  seule part-à-tout du catalogue (n° 6) est une **barre empilée**, plus lisible.
- **Aucun double axe.** Jamais deux échelles verticales sur un même graphique : leur
  alignement est arbitraire et **fabrique une corrélation qui n'existe pas**. Nombre de
  missions et coût sont deux mesures d'échelles différentes → deux graphiques.
- **Le n° 1 n'est pas un graphique.** Quatre chiffres de tête (missions confirmées, coût
  total, jours cumulés, OM en attente) se lisent en tuiles. Un graphique à une barre est
  toujours une erreur de forme.
- **Les n° 7 et 8 sont des tableaux, pas des graphiques.** Au-delà de ~7 classes
  porteuses de sens, un graphique devient illisible : les 11 directions du référentiel et
  les centaines d'employés appellent un tableau triable.
- **Le n° 3 utilise une seule teinte pour toutes les barres.** Colorer chaque direction
  d'une couleur différente serait doublement faux : ça encode la longueur de la barre une
  seconde fois dans la teinte, et ça gaspille le seul canal libre.
- **Le n° 5 est le seul à mériter une rampe**, parce que les zones 0→3 sont **ordonnées**
  (une échelle de distance et de coût), pas des catégories nominales.

### Couleurs : mesurées contre la vraie surface de l'app

La surface des cartes de l'app est `bg-white/70` sur `bg-blue-50`, soit **`#fafcff`** après
composition. C'est contre cette valeur que j'ai validé, pas contre une surface générique.

**Rampe ordinale des 4 zones — validée :**

| Zone | Teinte Tailwind | Hex |
|---|---|---|
| 0 | `blue-400` | `#51a2ff` |
| 1 | `blue-500` | `#2b7fff` |
| 2 | `blue-700` | `#1447e6` |
| 3 | `blue-900` | `#1c398e` |

Contrôles passés : luminosité monotone, écarts entre paliers visibles, teinte unique
(dispersion 12°), et **extrémité claire à 2,57:1** contre la surface. Le premier candidat
testé (`blue-300` = `#8ec5ff`) **échouait à 1,76:1** — trop proche du fond pour que la
zone 0 se distingue d'une case vide.

**Statuts d'OM — le résultat important, et il est négatif :**

| Statut | Couleur | Rôle |
|---|---|---|
| En attente | `amber-600` | avertissement |
| Confirmé | `green-600` | favorable |
| Annulé | `red-600` | critique |

La mesure : **rouge ↔ vert, ΔE 4,7 en deutéranopie** — très en dessous du plancher de 6.
Assombrir n'y change rien (variante 700 : ΔE 4,1). C'est la forme la plus répandue du
daltonisme, environ 8 % des hommes.

**Conclusion : les statuts ne peuvent jamais être portés par la couleur seule.** Trois
mesures obligatoires, pas optionnelles :

1. **Une icône par statut**, distincte de forme — pas seulement de couleur. C'est aussi ce
   que demandait `ref.txt` (« ajout des icônes, important pour l'intuitivité »).
2. **Le libellé texte visible** partout où le statut apparaît, y compris dans la barre
   empilée du n° 6.
3. **Un écart de 2 px** entre les segments de la barre empilée, laissant voir la surface —
   plutôt qu'une bordure, qui alourdit.

C'est une contrainte à respecter dans l'implémentation, pas une préférence esthétique.

### Règles communes à tous les rapports

- **Une seule barre de filtres**, au-dessus de tous les graphiques, jamais un filtre par
  carte. Tous se recalculent sur la même tranche.
- **La couleur suit l'entité, jamais son rang.** Filtrer ne doit pas repeindre les survivants.
- **Jamais de valeur sur chaque point.** Étiqueter l'extrême et les extrémités, laisser
  l'axe et l'infobulle porter le reste.
- **Chaque graphique a son équivalent tableau** — c'est la version accessible, et celle
  qui s'exporte.
- **Traits fins, grilles en filet discret**, pas d'aplats saturés massifs.
- **Chiffres alignés** (`tabular-nums`) dans les colonnes de tableaux et les graduations,
  mais **pas** sur les grands nombres des tuiles, où la largeur fixe fait « respirer »
  les chiffres de travers.
- **Au rechargement**, maintenir l'affichage précédent en opacité réduite plutôt
  qu'afficher un squelette : pas de saut de mise en page.

### Exports

**XLSX pour les tableaux, PDF pour les synthèses.** La DFCC voudra retravailler les
chiffres, pas les contempler : un PDF de tableau est un cul-de-sac.

| Format | Contenu | Technique |
|---|---|---|
| **XLSX** | Rapports 3, 4, 5, 7, 8, 9 + tableau de tout graphique | `exceljs` dans le navigateur (~200 Ko) — fonctionne **hors ligne** |
| **PDF** | Rapports 1, 2, 6 et synthèses graphiques | Impression navigateur + `@media print` — **hors ligne**, zéro dépendance |

Même logique que pour l'OM : tout se génère côté client, donc tout reste disponible sans
réseau. L'export XLSX doit inclure une ligne d'en-tête avec la **période filtrée** et la
mention du plancher de coût — un fichier qui circule par mail perd son contexte d'écran.

---

## 12. Signature électronique et notifications

### Signature : validation tracée

Retenue parmi quatre niveaux. Ce qui l'emporte : **la signature qui fait foi est
manuscrite, sur le papier imprimé** — le DG signe l'OM à la main, l'application ne
remplace pas ce geste. Ce qu'il faut garantir côté logiciel, c'est **qui a validé quoi et
quand**, de façon non répudiable en interne.

Concrètement, déjà dans le DDL : `confirme_par`, `confirme_le`, `confirme_depuis_ip` sur
`participation` (et les colonnes `annule_*` symétriques, `valide_*` sur `demande_conge`),
plus l'immuabilité de l'enregistrement après validation.

Les deux options plus fortes ont été écartées, pour des raisons différentes :

- **Signature manuscrite numérisée** (image apposée sur le PDF) : **valeur probante
  faible** — une image se copie. Ça rassure visuellement sans rien prouver.
- **Signature cryptographique du PDF** : techniquement forte, mais elle exige une **clé
  privée**, qui ne peut pas vivre dans un navigateur. Elle imposerait de générer le PDF
  côté serveur, donc en ligne — ce qui est compatible avec la validation (déjà en ligne)
  mais pas avec le téléchargement hors ligne. Chantier à part, à rouvrir si le besoin
  juridique apparaît. Le palier supérieur (certificat qualifié, ANTIC au Cameroun) ne se
  justifie que si un OM doit être opposable devant un tiers.

### Notifications : deux canaux, pas un choix

Le hors-ligne impose la distinction : **aucun mail ne part sans réseau.**

| Canal | Hors ligne | Usage |
|---|---|---|
| **En-app** (pastille + liste) | ✅ | OM à valider, OM confirmé/annulé, **conflit détecté**, congé validé/refusé |
| **Mail** | ❌ mis en file | Définition du mot de passe, demande de congé à l'admin, alerte DRH sur solde insuffisant |
| **Push navigateur** | ⚠️ | Écarté pour l'instant |

Le push est écarté sciemment : clés VAPID, Service Worker dédié, gestion des abonnements
et des révocations — et **iOS ne l'autorise que si l'app est installée sur l'écran
d'accueil**. Beaucoup de plomberie pour un gain faible tant que les utilisateurs sont sur
poste fixe.

Deux points structurants, reflétés dans le DDL :

1. **Une notification est une ligne en base** (`notification`), pas un état d'interface.
   Sinon un rechargement de page fait disparaître l'information. La pastille lit un index
   partiel sur `lu_le IS NULL`.
2. **Un mail déclenché hors ligne part à la reconnexion, envoyé par le serveur** — jamais
   par le navigateur. D'où `mail_en_attente` : le mail devient un effet de bord de la
   synchronisation, avec compteur de tentatives et dernière erreur. Il faut un fournisseur
   SMTP (Resend, Brevo, ou le serveur de messagerie EDC). **À TRANCHER.**

En repli, si l'EDC n'expose aucun SMTP : l'admin génère un code temporaire remis de la
main à la main, et les notifications restent purement en-app.

---

## 13. Ordre de migration

L'ordre n'est pas indifférent : chaque étape n'exige que ce que les précédentes ont posé.

1. **Nettoyage du code** — commenter (avec motif) le bouton « Supprimer », les étapes
   VISA, et corriger les incohérences des données de démonstration (§10). Sans base à
   installer : ça allège ce qui va être migré.
2. `docker-compose` PostgreSQL local + `.env` (`DATABASE_URL`), ignoré par git.
   `CREATE EXTENSION btree_gist` — nécessaire à l'`EXCLUDE` des plages de numéros (§7).
3. `prisma/schema.prisma` traduisant le §6, puis `prisma migrate dev`.
4. **Seed des référentiels — après validation RH** des zones (§8) et du drapeau
   `est_cadre` (§9) : `zone`, `pays`, `statut`, `departement`, `bareme_frais_fixe`,
   `type_conge`, `jour_ferie`, `configuration`.
5. `lib/data/` avec `import "server-only"`, en commençant par les référentiels —
   lecture seule, aucun risque, et ça valide le motif d'accès.
6. **Authentification et rôles. Avant toute écriture.** La validation d'un OM est
   réservée à l'admin connecté : sans rôles, la règle centrale du §1 n'existe pas.
   Aujourd'hui `/admin` est ouverte à tous.
7. `employe` : CRUD admin, plus l'envoi du mail de définition du mot de passe
   (`jeton_mot_de_passe` + `mail_en_attente`).
8. `ordre_mission` + `participation` : création, puis **validation avec détection de
   conflit** (§1) — c'est le cœur métier, et il dépend de tout ce qui précède.
9. Bascule des pages admin en composants serveur. `lib/useEstMonte.ts` devient inutile.
10. **Migration du `.docx` vers le navigateur** : `docxtemplater` quitte le Route
    Handler, condition du téléchargement hors ligne (§1).
11. **PWA** : Service Worker, IndexedDB, création hors ligne, plages de numéros,
    file d'envoi. C'est l'étape la plus délicate — la faire quand le modèle en ligne
    est stable et vérifiable.
12. Rapports (§11), avec les exports XLSX et PDF.
13. Module congés (§9), une fois les données manquantes fournies.
14. Commenter `lib/mockData.ts`, les données de `lib/employees.ts` et les lectures
    `localStorage` de `lib/config.ts`.

**Table `frais` :** créée à l'étape 3 mais alimentée par aucun écran, et exploitée par
aucun rapport (§2, §11). À rouvrir seulement si la saisie devient une exigence.

