-- ═══════════════════════════════════════════════════════════════════════════
-- Localités ajoutées à la main, en complément de la liste de villes du paquet
-- Décision du 25/08/2026 — cf. MODELE-DONNEES.md §18
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Strictement additive : une table, deux clés étrangères, deux index. Rien
-- d'existant n'est touché, aucune ligne n'est réécrite.
--
-- ── Le problème ─────────────────────────────────────────────────────────────
--
-- Les suggestions de ville du formulaire d'OM viennent du paquet
-- `country-state-city` (~148 000 villes, entièrement côté navigateur). Cette
-- base ne connaît que les agglomérations. Or l'EDC envoie ses agents sur des
-- SITES DE PRODUCTION : Nachtigal, Song Loulou, Memve'ele, Lom Pangar. Aucun
-- n'y figure.
--
-- Le champ est libre, donc la saisie passe — mais l'agent qui tape « Nachtigal »
-- voit « aucune suggestion » et en conclut que le champ refuse sa valeur. Il
-- écrit alors autre chose, ou l'orthographie chaque fois différemment, et les
-- rapports groupent sur trois graphies du même site.
--
-- La liste du paquet n'est pas modifiable : elle vit dans `node_modules`, donc
-- elle est réécrite à chaque `npm install`. Les ajouts doivent vivre en base.
--
-- ── Ce que cette table N'EST PAS ────────────────────────────────────────────
--
-- Ce n'est pas un référentiel de villes. `ordre_mission.ville_destination` reste
-- un VARCHAR libre, SANS clé étrangère vers ici, et c'est délibéré :
--
--   • les OM déjà émis portent des villes qui n'ont jamais été « déclarées » ;
--   • une localité retirée ne doit pas invalider l'historique qui la cite ;
--   • les 148 000 villes du paquet ne sont pas en base et n'ont pas à y être —
--     les recopier créerait une seconde source de vérité à maintenir.
--
-- Ces lignes servent uniquement à PROPOSER, en fusion avec les suggestions du
-- paquet.

CREATE TABLE "localite" (
  "id"        BIGSERIAL PRIMARY KEY,
  "code_pays" CHAR(2)      NOT NULL,
  "nom"       VARCHAR(120) NOT NULL,
  "actif"     BOOLEAN      NOT NULL DEFAULT true,
  "cree_le"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "cree_par"  BIGINT,
  "retire_le" TIMESTAMPTZ(6),
  "retire_par" BIGINT
);

-- ── Le pays : clé étrangère, celle-là oui ───────────────────────────────────
--
-- Contrairement à `ville_destination`, le pays d'une localité DOIT exister au
-- référentiel : c'est lui qui décide dans quelle liste la localité apparaît. Une
-- localité rattachée à un code de pays inconnu ne serait jamais proposée à
-- personne — une ligne morte, invisible, que rien ne signalerait.
ALTER TABLE "localite"
  ADD CONSTRAINT "localite_code_pays_fkey"
  FOREIGN KEY ("code_pays") REFERENCES "pays"("code_iso");

-- ── L'auteur : SET NULL, pas CASCADE ────────────────────────────────────────
--
-- Le compte qui a ajouté la localité peut disparaître ; la localité doit lui
-- survivre. `CASCADE` effacerait « Nachtigal » le jour où l'administrateur qui
-- l'a saisie quitte l'EDC — et ferait disparaître la suggestion de tous les
-- formulaires sans que personne ne comprenne pourquoi. Perdre l'auteur est
-- acceptable, perdre la localité ne l'est pas.
ALTER TABLE "localite"
  ADD CONSTRAINT "localite_cree_par_fkey"
  FOREIGN KEY ("cree_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL;

ALTER TABLE "localite"
  ADD CONSTRAINT "localite_retire_par_fkey"
  FOREIGN KEY ("retire_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL;

-- ── Un nom non vide, et pas seulement des blancs ────────────────────────────
--
-- `VARCHAR(120) NOT NULL` accepte la chaîne vide et « '   ' ». Une localité sans
-- nom serait proposée comme une entrée vide dans la liste : cliquable, et qui
-- vide le champ. Le CHECK le rend impossible même par un script.
ALTER TABLE "localite"
  ADD CONSTRAINT "localite_nom_non_vide" CHECK (btrim("nom") <> '');

-- ── Le retrait est daté, comme la désactivation d'un employé ────────────────
--
-- Même forme que `employe_desactivation_datee` : on ne désactive pas sans dire
-- quand. Sans cette contrainte, une ligne inactive sans date ne se distinguerait
-- pas d'un défaut d'écriture, et l'ordre des retraits serait indéterminé.
ALTER TABLE "localite"
  ADD CONSTRAINT "localite_retrait_date" CHECK ("actif" OR "retire_le" IS NOT NULL);

-- ── Pas deux fois la même localité dans le même pays ────────────────────────
--
-- Index UNIQUE d'EXPRESSION, pas sur les colonnes brutes. Trois raisons, dans
-- cet ordre :
--
--   1. `lower(sans_accent(...))` : « Memve'ele », « MEMVE'ELE » et « Memveele »
--      sont la même localité. Une unicité sur le texte brut les accepterait
--      toutes les trois, et la liste proposerait trois fois le même site.
--      `sans_accent` est `IMMUTABLE PARALLEL SAFE STRICT` (créée dans
--      20260821214330_motif_sortie_et_fondateur), donc indexable ici.
--
--   2. `btrim` : « Nachtigal » et « Nachtigal » ne diffèrent que par un blanc de
--      fin, et le second passerait.
--
--   3. `WHERE actif` : partiel. Une localité retirée ne bloque pas sa
--      réintroduction — c'est le geste attendu quand on s'est trompé de pays et
--      qu'on la remet ailleurs, puis à sa place. Sans le `WHERE`, il faudrait
--      supprimer la ligne pour la recréer, donc perdre la trace du retrait.
--
-- ⚠️ `code_pays` est un CHAR(2) : PostgreSQL le complète à droite et ignore les
-- blancs de fin en comparaison, donc pas de `btrim` à poser dessus.
CREATE UNIQUE INDEX "idx_localite_unique_par_pays"
  ON "localite" ("code_pays", lower(sans_accent(btrim("nom"))))
  WHERE "actif";

-- Lecture par pays : c'est le seul accès du formulaire d'OM (« les localités du
-- pays choisi »), et il a lieu à chaque ouverture de l'écran de création.
CREATE INDEX "idx_localite_pays" ON "localite" ("code_pays");
