-- ═══════════════════════════════════════════════════════════════════════════
-- Péremption avec délai de grâce, et régularisation d'un OM périmé
-- Décisions du 23/08/2026 — cf. MODELE-DONNEES.md §17
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Purement additive : aucune colonne retirée, aucune valeur réécrite. Une base
-- déjà en service l'absorbe sans perdre une ligne.
--
-- ── Le problème que ces quatre changements règlent ──────────────────────────
--
-- §7 veut qu'un OM jamais confirmé dont la date de retour est passée devienne
-- `EXPIRE` automatiquement, « pour que personne n'ait à faire le ménage ». Pris
-- au pied de la lettre, ça bascule l'OM dès le lendemain du retour — or le cas
-- le plus fréquent n'est pas l'OM abandonné, c'est **l'OM confirmé sur le papier
-- dont personne n'a cliqué « Confirmer »**. La mission a eu lieu, le DG a signé,
-- et l'application la déclare caduque.
--
-- D'où deux ajouts qui vont ensemble :
--
--   1. un DÉLAI DE GRÂCE après la date de retour, pendant lequel on NOTIFIE au
--      lieu de basculer — l'oubli est rattrapable sans rien perdre ;
--   2. la RÉGULARISATION, qui permet de confirmer après coup un OM déjà périmé.
--      `EXPIRE` cesse d'être un cul-de-sac.

-- ── 1. Notification d'approche de péremption ────────────────────────────────
--
-- ⚠️ Le type s'appelle "TypeNotification" et non `type_notification` : Prisma
-- nomme les types énumérés d'après le modèle, en PascalCase entre guillemets.
-- MODELE-DONNEES.md §6 écrit la forme SQL en minuscules — elle n'existe pas en
-- base, et un `ALTER TYPE type_notification` échouerait sur « type does not
-- exist ». Vérifié dans 20260821003951_schema_initial/migration.sql:26.
--
-- ⚠️ `ADD VALUE` est permis dans une transaction depuis PostgreSQL 12, mais la
-- valeur ajoutée **ne peut pas être utilisée avant que la transaction ne soit
-- validée**. Prisma exécute chaque migration dans une transaction : cette
-- migration se contente donc d'ajouter la valeur, elle n'en écrit aucune.
ALTER TYPE "TypeNotification" ADD VALUE 'OM_BIENTOT_EXPIRE';

-- ── 2. Le délai de grâce, en configuration et non en constante ──────────────
--
-- Le critère du §4 s'applique : une valeur que les RH peuvent vouloir ajuster
-- n'a pas sa place dans le code. 15 jours est un point de départ, pas une
-- vérité — si la confirmation prend d'ordinaire trois semaines, l'admin corrige
-- sans redéploiement.
--
-- Le CHECK interdit 0 : un délai nul ferait basculer l'OM le lendemain du
-- retour, ce qui est exactement le comportement qu'on cherche à éviter.
ALTER TABLE "configuration"
  ADD COLUMN "delai_peremption_jours" SMALLINT NOT NULL DEFAULT 15;

ALTER TABLE "configuration"
  ADD CONSTRAINT configuration_delai_peremption_positif
  CHECK ("delai_peremption_jours" > 0);

-- ── 3. Motif de régularisation — FACULTATIF, et c'est délibéré ──────────────
--
-- Aucun CHECK ne l'exige, contrairement à `refuse_motif` que
-- `part_refuse_motive` rend obligatoire. La différence est de nature : un refus
-- ÔTE quelque chose à quelqu'un, donc il se justifie ; une régularisation
-- CONSTATE un fait déjà acquis (le papier est signé), donc elle se documente.
--
-- Exiger un motif ici aurait un coût réel : l'admin qui rattrape trente OM
-- oubliés saisirait trente fois la même phrase, ou renoncerait. On préfère la
-- trace des dates — toujours présente — à un champ que personne ne remplit.
--
-- Pas de `regularise_le` ni `regularise_par` : la régularisation se lit déjà
-- sans ambiguïté à `statut = 'CONFIRME' AND expire_le IS NOT NULL`, et
-- `confirme_par` / `confirme_le` disent qui et quand.
ALTER TABLE "participation" ADD COLUMN "regularisation_motif" TEXT;

-- ── 4. L'index que §6 croyait déjà posé ────────────────────────────────────
--
-- MODELE-DONNEES.md §6 écrit, à propos du balayage de péremption :
-- « L'index porte sur ordre_mission(date_retour), déjà créé plus haut. » Il ne
-- l'était pas — vérifié dans les deux migrations précédentes, qui n'indexent
-- que `date_depart` et `code_pays`. Le balayage cherche les missions terminées,
-- donc il filtre sur `date_retour` : sans cet index, il parcourt toute la table
-- à chaque connexion.
CREATE INDEX "idx_om_date_retour" ON "ordre_mission"("date_retour");
