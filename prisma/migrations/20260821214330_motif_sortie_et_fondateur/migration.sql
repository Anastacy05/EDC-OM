-- CreateEnum
CREATE TYPE "MotifSortie" AS ENUM ('RETRAITE', 'DECES', 'DEMISSION', 'LICENCIEMENT', 'FIN_DE_CONTRAT', 'DETACHEMENT', 'SUSPENSION', 'AUTRE');

-- AlterTable
ALTER TABLE "employe" ADD COLUMN     "motif_sortie" "MotifSortie",
ADD COLUMN     "note_sortie" TEXT;

-- AlterTable
ALTER TABLE "utilisateur" ADD COLUMN     "est_fondateur" BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════════════════════════
-- Recherche insensible aux accents
-- ═══════════════════════════════════════════════════════════════════════════
--
-- « Les humains sont paresseux » : chercher « mballa » doit trouver « MBALLA »,
-- et « rene » doit trouver « RENÉ ». La casse est déjà réglée par ILIKE ; les
-- accents non.
--
-- ⚠️ PIÈGE VÉRIFIÉ le 21/08/2026. Un index direct échoue :
--
--     CREATE INDEX ... ON employe (unaccent(nom));
--     ERROR:  functions in index expression must be marked IMMUTABLE
--
-- Parce que `unaccent(text)` est déclarée STABLE et non IMMUTABLE : dans cette
-- forme à un argument, elle résout le dictionnaire par le chemin de recherche,
-- qui peut changer d'une session à l'autre. PostgreSQL refuse donc de figer son
-- résultat dans un index.
--
-- Le contournement n'est pas un mensonge : en NOMMANT explicitement le
-- dictionnaire (`unaccent('public.unaccent', $1)`), le résultat ne dépend plus
-- d'aucun état de session, et la fonction est légitimement immuable.
--
-- Reste une réserve honnête : si le dictionnaire `unaccent.rules` était modifié
-- sur le serveur, les index deviendraient faux et il faudrait les reconstruire
-- (REINDEX). C'est le prix du procédé, et il est documenté comme tel par
-- PostgreSQL.
CREATE OR REPLACE FUNCTION sans_accent(text) RETURNS text AS
$$ SELECT public.unaccent('public.unaccent', $1) $$
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- Index sur la forme normalisée : minuscules ET sans accent, exactement la
-- transformation que fera la requête. Un index qui ne reproduit pas
-- littéralement l'expression de recherche n'est jamais utilisé.
CREATE INDEX idx_employe_nom_sans_accent
  ON employe (lower(sans_accent(nom)));

CREATE INDEX idx_employe_prenoms_sans_accent
  ON employe (lower(sans_accent(prenoms)));

-- ⚠️ Ces deux index accélèrent les préfixes (`LIKE 'mball%'`), PAS les
-- sous-chaînes (`LIKE '%mball%'`), qu'un index B-tree ne sait pas servir. Pour
-- 400 employés, le parcours séquentiel reste de l'ordre de la milliseconde ;
-- au-delà de quelques dizaines de milliers de lignes, il faudrait passer à
-- pg_trgm et à un index GIN.

-- ═══════════════════════════════════════════════════════════════════════════
-- Un seul compte fondateur
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Index UNIQUE PARTIEL : la contrainte ne porte que sur les lignes où
-- `est_fondateur` est vrai. Un `UNIQUE(est_fondateur)` ordinaire interdirait
-- d'avoir deux comptes non-fondateurs, ce qui serait absurde.
--
-- Ce que ça garantit : on ne peut pas désigner un second fondateur par accident,
-- et le transfert du droit doit être explicite — retirer avant d'attribuer.
CREATE UNIQUE INDEX idx_utilisateur_fondateur_unique
  ON utilisateur (est_fondateur)
  WHERE est_fondateur;

-- Un fondateur est nécessairement administrateur : lui laisser le rôle
-- UTILISATEUR créerait un compte capable de nommer des administrateurs sans en
-- être un.
ALTER TABLE utilisateur
  ADD CONSTRAINT utilisateur_fondateur_est_admin
  CHECK (NOT est_fondateur OR role = 'ADMINISTRATEUR');

-- ═══════════════════════════════════════════════════════════════════════════
-- Cohérence du motif de sortie
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le motif est FACULTATIF (décision du 21/08/2026), mais il n'a aucun sens sur
-- une fiche active : on ne sort pas quelqu'un qui est présent.
ALTER TABLE employe
  ADD CONSTRAINT employe_motif_sortie_si_inactif
  CHECK (actif IS FALSE OR (motif_sortie IS NULL AND note_sortie IS NULL));
