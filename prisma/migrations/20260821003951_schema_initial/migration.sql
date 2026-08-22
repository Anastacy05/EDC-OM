-- CreateEnum
CREATE TYPE "StatutParticipation" AS ENUM ('EN_ATTENTE', 'CONFIRME', 'ANNULE', 'REFUSE', 'EXPIRE');

-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('ADMINISTRATEUR', 'UTILISATEUR');

-- CreateEnum
CREATE TYPE "Continent" AS ENUM ('AFRIQUE', 'AMERIQUE', 'ASIE', 'EUROPE', 'OCEANIE');

-- CreateEnum
CREATE TYPE "SituationFamille" AS ENUM ('CELIBATAIRE', 'MARIE', 'DIVORCE', 'VEUF');

-- CreateEnum
CREATE TYPE "NatureFrais" AS ENUM ('PREVISIONNEL', 'REEL');

-- CreateEnum
CREATE TYPE "UniteConge" AS ENUM ('OUVRABLE', 'CALENDAIRE');

-- CreateEnum
CREATE TYPE "StatutDemande" AS ENUM ('SOUMISE', 'VALIDEE', 'REFUSEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "OrigineFerie" AS ENUM ('SAISIE_MANUELLE', 'SYNCHRONISE', 'CALCULE');

-- CreateEnum
CREATE TYPE "TypeNotification" AS ENUM ('OM_A_VALIDER', 'OM_CONFIRME', 'OM_ANNULE', 'OM_REFUSE', 'OM_EXPIRE', 'OM_EN_CONFLIT', 'CONGE_A_VALIDER', 'CONGE_VALIDE', 'CONGE_REFUSE', 'SOLDE_INSUFFISANT');

-- CreateTable
CREATE TABLE "departement" (
    "code" VARCHAR(10) NOT NULL,
    "libelle" VARCHAR(150) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "departement_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "statut" (
    "code" VARCHAR(40) NOT NULL,
    "libelle" VARCHAR(150) NOT NULL,
    "rang" SMALLINT NOT NULL,
    "est_cadre" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "statut_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "zone" (
    "code" SMALLINT NOT NULL,
    "libelle" VARCHAR(200) NOT NULL,

    CONSTRAINT "zone_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "pays" (
    "code_iso" CHAR(2) NOT NULL,
    "nom_fr" VARCHAR(100) NOT NULL,
    "continent" "Continent" NOT NULL,
    "code_zone" SMALLINT NOT NULL,

    CONSTRAINT "pays_pkey" PRIMARY KEY ("code_iso")
);

-- CreateTable
CREATE TABLE "bareme_frais_fixe" (
    "code_statut" VARCHAR(40) NOT NULL,
    "code_zone" SMALLINT NOT NULL,
    "montant_journalier" INTEGER NOT NULL,

    CONSTRAINT "bareme_frais_fixe_pkey" PRIMARY KEY ("code_statut","code_zone")
);

-- CreateTable
CREATE TABLE "employe" (
    "matricule" VARCHAR(20) NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "prenoms" VARCHAR(150) NOT NULL,
    "grade" VARCHAR(100) NOT NULL,
    "fonction" VARCHAR(200) NOT NULL,
    "situation_famille" "SituationFamille" NOT NULL,
    "indice" VARCHAR(10),
    "date_naissance" DATE NOT NULL,
    "date_embauche" DATE NOT NULL,
    "code_statut" VARCHAR(40) NOT NULL,
    "code_departement" VARCHAR(10) NOT NULL,
    "nombre_medailles" SMALLINT NOT NULL DEFAULT 0,
    "est_detache" BOOLEAN NOT NULL DEFAULT false,
    "jours_conge_origine" DECIMAL(5,1),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "desactive_le" TIMESTAMPTZ(6),

    CONSTRAINT "employe_pkey" PRIMARY KEY ("matricule")
);

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" BIGSERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "mot_de_passe_hash" TEXT,
    "role" "RoleUtilisateur" NOT NULL,
    "matricule" VARCHAR(20),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derniere_connexion" TIMESTAMPTZ(6),

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jeton_mot_de_passe" (
    "jeton_hash" TEXT NOT NULL,
    "id_utilisateur" BIGINT NOT NULL,
    "expire_le" TIMESTAMPTZ(6) NOT NULL,
    "utilise_le" TIMESTAMPTZ(6),

    CONSTRAINT "jeton_mot_de_passe_pkey" PRIMARY KEY ("jeton_hash")
);

-- CreateTable
CREATE TABLE "ordre_mission" (
    "id" BIGSERIAL NOT NULL,
    "ulid" CHAR(26) NOT NULL,
    "code_pays" CHAR(2) NOT NULL,
    "ville_destination" VARCHAR(120) NOT NULL,
    "via_passage" VARCHAR(200),
    "motif" TEXT NOT NULL,
    "financement" VARCHAR(150),
    "moyen_transport" VARCHAR(100),
    "date_depart" DATE NOT NULL,
    "date_retour" DATE NOT NULL,
    "chapitre" VARCHAR(50),
    "article" VARCHAR(50),
    "paragraphe" VARCHAR(50),
    "exercice" VARCHAR(50),
    "exercice_annee" SMALLINT,
    "cree_par" BIGINT NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL,
    "synchronise_le" TIMESTAMPTZ(6),

    CONSTRAINT "ordre_mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plage_numero" (
    "id" BIGSERIAL NOT NULL,
    "annee" SMALLINT NOT NULL,
    "id_utilisateur" BIGINT NOT NULL,
    "borne_min" INTEGER NOT NULL,
    "borne_max" INTEGER NOT NULL,
    "prochain_numero" INTEGER NOT NULL,
    "reservee_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plage_numero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participation" (
    "id_ordre_mission" BIGINT NOT NULL,
    "matricule" VARCHAR(20) NOT NULL,
    "numero_om" VARCHAR(40) NOT NULL,
    "statut" "StatutParticipation" NOT NULL DEFAULT 'EN_ATTENTE',
    "blocage_motif" TEXT,
    "blocage_detecte_le" TIMESTAMPTZ(6),
    "nom_s" VARCHAR(100) NOT NULL,
    "prenoms_s" VARCHAR(150) NOT NULL,
    "grade_s" VARCHAR(100) NOT NULL,
    "fonction_s" VARCHAR(200) NOT NULL,
    "code_statut_s" VARCHAR(40) NOT NULL,
    "code_departement_s" VARCHAR(10) NOT NULL,
    "situation_famille_s" "SituationFamille" NOT NULL,
    "indice_s" VARCHAR(10),
    "montant_frais_fixe_journalier" INTEGER,
    "nom_emetteur" VARCHAR(100) NOT NULL,
    "grade_emetteur" VARCHAR(100),
    "fonction_emetteur" VARCHAR(150) NOT NULL,
    "lieu_emission" VARCHAR(100) NOT NULL,
    "date_emission" DATE NOT NULL,
    "confirme_le" TIMESTAMPTZ(6),
    "confirme_par" BIGINT,
    "confirme_depuis_ip" INET,
    "annule_le" TIMESTAMPTZ(6),
    "annule_par" BIGINT,
    "annule_depuis_ip" INET,
    "refuse_le" TIMESTAMPTZ(6),
    "refuse_par" BIGINT,
    "refuse_depuis_ip" INET,
    "refuse_motif" TEXT,
    "expire_le" TIMESTAMPTZ(6),

    CONSTRAINT "participation_pkey" PRIMARY KEY ("id_ordre_mission","matricule")
);

-- CreateTable
CREATE TABLE "frais" (
    "id" BIGSERIAL NOT NULL,
    "id_ordre_mission" BIGINT NOT NULL,
    "matricule" VARCHAR(20) NOT NULL,
    "nature" "NatureFrais" NOT NULL,
    "type_depense" VARCHAR(60) NOT NULL,
    "montant" INTEGER NOT NULL,
    "description" TEXT,
    "saisi_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "frais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "type_conge" (
    "code" VARCHAR(30) NOT NULL,
    "libelle" VARCHAR(150) NOT NULL,
    "decompte_solde" BOOLEAN NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "type_conge_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "jour_ferie" (
    "date_ferie" DATE NOT NULL,
    "libelle" VARCHAR(150) NOT NULL,
    "origine" "OrigineFerie" NOT NULL,
    "est_mobile" BOOLEAN NOT NULL DEFAULT false,
    "synchronise_le" TIMESTAMPTZ(6),
    "saisi_par" BIGINT,

    CONSTRAINT "jour_ferie_pkey" PRIMARY KEY ("date_ferie")
);

-- CreateTable
CREATE TABLE "synchronisation_ferie" (
    "id" BIGSERIAL NOT NULL,
    "annee" SMALLINT NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "nombre_importes" SMALLINT NOT NULL,
    "nombre_ignores_manuels" SMALLINT NOT NULL,
    "recalcul_requis_depuis" DATE,
    "execute_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "synchronisation_ferie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solde_conge" (
    "matricule" VARCHAR(20) NOT NULL,
    "annee" SMALLINT NOT NULL,
    "unite" "UniteConge" NOT NULL,
    "jours_acquis" DECIMAL(5,1) NOT NULL,
    "jours_pris" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "majoration_manuelle" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "majoration_motif" TEXT,
    "majoration_par" BIGINT,
    "jours_reportes" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "report_autorise_par" BIGINT,
    "report_autorise_le" TIMESTAMPTZ(6),
    "prescrit_le" DATE,

    CONSTRAINT "solde_conge_pkey" PRIMARY KEY ("matricule","annee")
);

-- CreateTable
CREATE TABLE "demande_conge" (
    "id" CHAR(26) NOT NULL,
    "matricule" VARCHAR(20) NOT NULL,
    "code_type" VARCHAR(30) NOT NULL,
    "date_debut" DATE NOT NULL,
    "date_fin" DATE NOT NULL,
    "nombre_jours" DECIMAL(5,1) NOT NULL,
    "unite" "UniteConge" NOT NULL,
    "motif" TEXT,
    "statut" "StatutDemande" NOT NULL DEFAULT 'SOUMISE',
    "soumise_le" TIMESTAMPTZ(6) NOT NULL,
    "synchronise_le" TIMESTAMPTZ(6),
    "valide_par" BIGINT,
    "valide_le" TIMESTAMPTZ(6),
    "valide_depuis_ip" INET,
    "motif_refus" TEXT,

    CONSTRAINT "demande_conge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" BIGSERIAL NOT NULL,
    "id_destinataire" BIGINT NOT NULL,
    "type" "TypeNotification" NOT NULL,
    "message" TEXT NOT NULL,
    "lien" VARCHAR(300),
    "lu_le" TIMESTAMPTZ(6),
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_en_attente" (
    "id" BIGSERIAL NOT NULL,
    "destinataire" VARCHAR(255) NOT NULL,
    "sujet" VARCHAR(300) NOT NULL,
    "corps" TEXT NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "envoye_le" TIMESTAMPTZ(6),
    "tentatives" SMALLINT NOT NULL DEFAULT 0,
    "derniere_erreur" TEXT,

    CONSTRAINT "mail_en_attente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuration" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "age_retraite" SMALLINT NOT NULL,
    "taille_plage_numero" SMALLINT NOT NULL DEFAULT 50,
    "modifie_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_par" BIGINT,

    CONSTRAINT "configuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "statut_rang_key" ON "statut"("rang");

-- CreateIndex
CREATE INDEX "idx_pays_zone" ON "pays"("code_zone");

-- CreateIndex
CREATE INDEX "idx_employe_nom" ON "employe"("nom");

-- CreateIndex
CREATE INDEX "idx_employe_statut" ON "employe"("code_statut");

-- CreateIndex
CREATE INDEX "idx_employe_departement" ON "employe"("code_departement");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_matricule_key" ON "utilisateur"("matricule");

-- CreateIndex
CREATE UNIQUE INDEX "ordre_mission_ulid_key" ON "ordre_mission"("ulid");

-- CreateIndex
CREATE INDEX "idx_om_date_depart" ON "ordre_mission"("date_depart");

-- CreateIndex
CREATE INDEX "idx_om_pays" ON "ordre_mission"("code_pays");

-- CreateIndex
CREATE INDEX "idx_plage_annee_utilisateur" ON "plage_numero"("annee", "id_utilisateur");

-- CreateIndex
CREATE UNIQUE INDEX "participation_numero_om_key" ON "participation"("numero_om");

-- CreateIndex
CREATE INDEX "idx_part_matricule" ON "participation"("matricule");

-- CreateIndex
CREATE INDEX "idx_part_statut_s" ON "participation"("code_statut_s");

-- CreateIndex
CREATE INDEX "idx_frais_participation" ON "frais"("id_ordre_mission", "matricule");

-- CreateIndex
CREATE INDEX "idx_demande_matricule" ON "demande_conge"("matricule", "date_debut");

-- CreateIndex
CREATE INDEX "idx_notif_destinataire" ON "notification"("id_destinataire", "cree_le");

-- AddForeignKey
ALTER TABLE "pays" ADD CONSTRAINT "pays_code_zone_fkey" FOREIGN KEY ("code_zone") REFERENCES "zone"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bareme_frais_fixe" ADD CONSTRAINT "bareme_frais_fixe_code_statut_fkey" FOREIGN KEY ("code_statut") REFERENCES "statut"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bareme_frais_fixe" ADD CONSTRAINT "bareme_frais_fixe_code_zone_fkey" FOREIGN KEY ("code_zone") REFERENCES "zone"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employe" ADD CONSTRAINT "employe_code_statut_fkey" FOREIGN KEY ("code_statut") REFERENCES "statut"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employe" ADD CONSTRAINT "employe_code_departement_fkey" FOREIGN KEY ("code_departement") REFERENCES "departement"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_matricule_fkey" FOREIGN KEY ("matricule") REFERENCES "employe"("matricule") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jeton_mot_de_passe" ADD CONSTRAINT "jeton_mot_de_passe_id_utilisateur_fkey" FOREIGN KEY ("id_utilisateur") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordre_mission" ADD CONSTRAINT "ordre_mission_code_pays_fkey" FOREIGN KEY ("code_pays") REFERENCES "pays"("code_iso") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordre_mission" ADD CONSTRAINT "ordre_mission_cree_par_fkey" FOREIGN KEY ("cree_par") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plage_numero" ADD CONSTRAINT "plage_numero_id_utilisateur_fkey" FOREIGN KEY ("id_utilisateur") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participation" ADD CONSTRAINT "participation_id_ordre_mission_fkey" FOREIGN KEY ("id_ordre_mission") REFERENCES "ordre_mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participation" ADD CONSTRAINT "participation_matricule_fkey" FOREIGN KEY ("matricule") REFERENCES "employe"("matricule") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participation" ADD CONSTRAINT "participation_confirme_par_fkey" FOREIGN KEY ("confirme_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participation" ADD CONSTRAINT "participation_annule_par_fkey" FOREIGN KEY ("annule_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participation" ADD CONSTRAINT "participation_refuse_par_fkey" FOREIGN KEY ("refuse_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frais" ADD CONSTRAINT "frais_id_ordre_mission_matricule_fkey" FOREIGN KEY ("id_ordre_mission", "matricule") REFERENCES "participation"("id_ordre_mission", "matricule") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jour_ferie" ADD CONSTRAINT "jour_ferie_saisi_par_fkey" FOREIGN KEY ("saisi_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solde_conge" ADD CONSTRAINT "solde_conge_matricule_fkey" FOREIGN KEY ("matricule") REFERENCES "employe"("matricule") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solde_conge" ADD CONSTRAINT "solde_conge_majoration_par_fkey" FOREIGN KEY ("majoration_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solde_conge" ADD CONSTRAINT "solde_conge_report_autorise_par_fkey" FOREIGN KEY ("report_autorise_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_conge" ADD CONSTRAINT "demande_conge_matricule_fkey" FOREIGN KEY ("matricule") REFERENCES "employe"("matricule") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_conge" ADD CONSTRAINT "demande_conge_code_type_fkey" FOREIGN KEY ("code_type") REFERENCES "type_conge"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_conge" ADD CONSTRAINT "demande_conge_valide_par_fkey" FOREIGN KEY ("valide_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_id_destinataire_fkey" FOREIGN KEY ("id_destinataire") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuration" ADD CONSTRAINT "configuration_modifie_par_fkey" FOREIGN KEY ("modifie_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
