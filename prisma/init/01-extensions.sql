-- Extensions requises par le modèle. Exécuté automatiquement à la CRÉATION du
-- volume PostgreSQL (docker-entrypoint-initdb.d), donc une seule fois.
--
-- Rejouable à la main si le volume existe déjà :
--   docker compose exec db psql -U edc -d edc_om -f /docker-entrypoint-initdb.d/01-extensions.sql

-- btree_gist : indispensable à la contrainte EXCLUDE des plages de numéros d'OM
-- (MODELE-DONNEES.md §7). Un index GiST ne sait pas indexer l'égalité sur un
-- SMALLINT nativement ; cette extension ajoute les classes d'opérateurs qui
-- permettent de mélanger `annee WITH =` et `int4range(...) WITH &&` dans un même
-- index. Sans elle, la contrainte est refusée à la création.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- unaccent : recherche insensible aux accents. Nécessaire dès que la fonction
-- de l'employé devient un champ texte libre (MODELE-DONNEES.md §3) : sans ça,
-- chercher « SOUS DIRECTEUR » ne trouverait pas « SOUS-DIRECTEUR DU BUDGET »
-- saisi avec un accent, et « Yaounde » ne trouverait pas « Yaoundé ».
CREATE EXTENSION IF NOT EXISTS unaccent;
