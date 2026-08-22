-- Contraintes que le langage de schéma Prisma ne sait pas exprimer.
--
-- Écrites à la main dans une migration versionnée plutôt qu'appliquées à la
-- console : elles doivent se rejouer à l'identique sur toute base du projet,
-- CI comprise. Prisma les conserve telles quelles.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Extensions — À DÉCLARER ICI, pas seulement dans prisma/init
-- ═══════════════════════════════════════════════════════════════════════════
-- `prisma migrate dev` valide chaque migration sur une BASE FANTÔME qu'il crée
-- et détruit à la volée. Cette base ne reçoit PAS les scripts de
-- docker-entrypoint-initdb.d, qui ne tournent qu'à la création du volume.
--
-- Sans ces deux lignes, la contrainte EXCLUDE plus bas échoue avec :
--   « data type smallint has no default operator class for access method gist »
-- puisque btree_gist manque dans la base fantôme. L'extension doit donc faire
-- partie de la migration.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Plages de numéros d'OM : aucun recouvrement possible
-- ═══════════════════════════════════════════════════════════════════════════
-- C'est LA garantie qui rend la création hors ligne sûre. Deux postes ne
-- peuvent pas détenir des plages qui se chevauchent pour une même année, donc
-- deux OM ne peuvent pas porter le même numéro.
--
-- int4range est fermé à gauche et OUVERT à droite, d'où `borne_max + 1` :
-- sans cela, les plages 1-50 et 51-100 seraient vues comme se touchant.
-- Vérifié : 1-50 et 51-100 coexistent, 40-60 est rejetée.
--
-- btree_gist est requis pour mélanger l'égalité sur `annee` et le
-- recouvrement sur l'intervalle dans un même index GiST (cf. prisma/init).
ALTER TABLE plage_numero
  ADD CONSTRAINT plage_numero_sans_recouvrement
  EXCLUDE USING gist (
    annee WITH =,
    int4range(borne_min, borne_max + 1) WITH &&
  );

ALTER TABLE plage_numero
  ADD CONSTRAINT plage_bornes_ordonnees CHECK (borne_max >= borne_min);

-- Le curseur reste dans les bornes ; `borne_max + 1` signale une plage épuisée.
ALTER TABLE plage_numero
  ADD CONSTRAINT plage_curseur_dans_bornes
  CHECK (prochain_numero BETWEEN borne_min AND borne_max + 1);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Configuration : une seule ligne, à jamais
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE configuration
  ADD CONSTRAINT configuration_ligne_unique CHECK (id = 1);

-- Reproduit AGE_RETRAITE_MIN / MAX de lib/config.ts, mais côté serveur, où
-- personne ne peut le contourner.
ALTER TABLE configuration
  ADD CONSTRAINT configuration_age_retraite_borne
  CHECK (age_retraite BETWEEN 50 AND 75);

ALTER TABLE configuration
  ADD CONSTRAINT configuration_taille_plage_positive
  CHECK (taille_plage_numero > 0);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Ordre de mission et participation : cohérence du cycle de vie
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE ordre_mission
  ADD CONSTRAINT om_dates_coherentes CHECK (date_retour >= date_depart);

-- Un statut daté doit porter sa date.
ALTER TABLE participation
  ADD CONSTRAINT part_confirme_date
  CHECK (statut <> 'CONFIRME' OR confirme_le IS NOT NULL);

ALTER TABLE participation
  ADD CONSTRAINT part_annule_date
  CHECK (statut <> 'ANNULE' OR annule_le IS NOT NULL);

ALTER TABLE participation
  ADD CONSTRAINT part_expire_date
  CHECK (statut <> 'EXPIRE' OR expire_le IS NOT NULL);

-- Un refus doit être MOTIVÉ et SIGNÉ : c'est précisément ce qui le distingue
-- d'une suppression, où l'information disparaissait sans que personne
-- n'en réponde.
ALTER TABLE participation
  ADD CONSTRAINT part_refuse_motive
  CHECK (statut <> 'REFUSE' OR (refuse_par IS NOT NULL AND refuse_motif IS NOT NULL));

-- Un participant en conflit de dates n'est pas confirmable. Le blocage doit
-- être détecté AVANT que le document ne parte à la signature du DG.
ALTER TABLE participation
  ADD CONSTRAINT part_blocage_interdit_confirmation
  CHECK (blocage_motif IS NULL OR statut <> 'CONFIRME');

ALTER TABLE participation
  ADD CONSTRAINT part_montant_positif
  CHECK (montant_frais_fixe_journalier IS NULL OR montant_frais_fixe_journalier >= 0);

-- Index partiels : la liste des OM à traiter et celle des OM bloqués sont des
-- écrans fréquents, mais ne concernent qu'une fraction des lignes.
CREATE INDEX idx_part_en_attente ON participation (id_ordre_mission)
  WHERE statut = 'EN_ATTENTE';

CREATE INDEX idx_part_bloquees ON participation (matricule)
  WHERE blocage_motif IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Employé et barème
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE employe
  ADD CONSTRAINT employe_embauche_apres_naissance
  CHECK (date_embauche > date_naissance);

ALTER TABLE employe
  ADD CONSTRAINT employe_desactivation_datee
  CHECK (actif OR desactive_le IS NOT NULL);

-- Art. 81-6 : un détaché doit avoir un droit d'origine renseigné, sinon la
-- règle « au moins celui de son administration » est incalculable.
ALTER TABLE employe
  ADD CONSTRAINT employe_detache_a_un_droit
  CHECK (NOT est_detache OR jours_conge_origine IS NOT NULL);

ALTER TABLE employe
  ADD CONSTRAINT employe_medailles_positives CHECK (nombre_medailles >= 0);

ALTER TABLE zone
  ADD CONSTRAINT zone_code_valide CHECK (code BETWEEN 0 AND 3);

ALTER TABLE bareme_frais_fixe
  ADD CONSTRAINT bareme_montant_positif CHECK (montant_journalier >= 0);

ALTER TABLE frais
  ADD CONSTRAINT frais_montant_positif CHECK (montant >= 0);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Congés
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE solde_conge
  ADD CONSTRAINT solde_jours_positifs
  CHECK (jours_acquis >= 0 AND jours_pris >= 0
         AND majoration_manuelle >= 0 AND jours_reportes >= 0);

-- On ne peut pas prendre plus que son droit, report et majoration compris.
ALTER TABLE solde_conge
  ADD CONSTRAINT solde_pris_dans_le_droit
  CHECK (jours_pris <= jours_acquis + majoration_manuelle + jours_reportes);

-- Une majoration accordée sans motif serait intraçable : l'art. 81-3 renvoie à
-- une réglementation extérieure, il faut donc pouvoir justifier chaque cas.
ALTER TABLE solde_conge
  ADD CONSTRAINT solde_majoration_motivee
  CHECK (majoration_manuelle = 0 OR majoration_motif IS NOT NULL);

-- Art. 80-1 : le report exige l'autorisation EXPRESSE du Directeur Général.
ALTER TABLE solde_conge
  ADD CONSTRAINT solde_report_autorise
  CHECK (jours_reportes = 0 OR report_autorise_par IS NOT NULL);

ALTER TABLE demande_conge
  ADD CONSTRAINT demande_dates_coherentes CHECK (date_fin >= date_debut);

ALTER TABLE demande_conge
  ADD CONSTRAINT demande_jours_positifs CHECK (nombre_jours > 0);

ALTER TABLE demande_conge
  ADD CONSTRAINT demande_validee_tracee
  CHECK (statut <> 'VALIDEE' OR (valide_par IS NOT NULL AND valide_le IS NOT NULL));

ALTER TABLE demande_conge
  ADD CONSTRAINT demande_refus_motive
  CHECK (statut <> 'REFUSEE' OR motif_refus IS NOT NULL);

CREATE INDEX idx_demande_a_valider ON demande_conge (soumise_le)
  WHERE statut = 'SOUMISE';

-- Un férié saisi à la main doit être signé : c'est ce qui le rend protégé
-- contre l'écrasement par une synchronisation ultérieure.
ALTER TABLE jour_ferie
  ADD CONSTRAINT ferie_manuel_signe
  CHECK (origine <> 'SAISIE_MANUELLE' OR saisi_par IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Notifications
-- ═══════════════════════════════════════════════════════════════════════════
-- Index partiel : la pastille ne compte que les non lues, qui sont une petite
-- minorité des lignes à mesure que l'historique grossit.
CREATE INDEX idx_notif_non_lues ON notification (id_destinataire, cree_le DESC)
  WHERE lu_le IS NULL;

CREATE INDEX idx_mail_a_envoyer ON mail_en_attente (cree_le)
  WHERE envoye_le IS NULL;
