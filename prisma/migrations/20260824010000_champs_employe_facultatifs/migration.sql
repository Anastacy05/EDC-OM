-- ═══════════════════════════════════════════════════════════════════════════
-- Champs facultatifs de la fiche employé et de l'ordre de mission
-- Décisions du 24/08/2026 — cf. MODELE-DONNEES.md §18
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Permissive et additive : on retire des `NOT NULL`, on n'en pose aucun, et on
-- n'écrit aucune valeur. Une base en service l'absorbe sans perdre une ligne, et
-- toutes les lignes existantes restent valides.
--
-- ── Pourquoi ces champs cessent d'être obligatoires ────────────────────────
--
-- Ils l'étaient parce qu'ils figurent sur le document imprimé. Le raisonnement
-- était faux : le gabarit imprime une LIGNE À COMPLÉTER, et une ligne vide se
-- remplit au stylo. Exiger la valeur à la saisie ne rendait pas le document plus
-- complet — ça poussait à inventer (« Célibataire » par défaut, « N/A » en
-- grade), donc à imprimer une contrevérité sur une pièce signée.
--
-- L'absence est représentée par NULL et non par une chaîne vide : « on ne sait
-- pas » et « c'est vide » ne sont pas le même fait, et seul NULL dit le premier.

ALTER TABLE employe
  ALTER COLUMN grade DROP NOT NULL,
  ALTER COLUMN situation_famille DROP NOT NULL,
  ALTER COLUMN code_departement DROP NOT NULL,
  ADD COLUMN departement_libre VARCHAR(150),
  ADD COLUMN email_contact VARCHAR(255);

-- ── L'adresse de courriel de la FICHE, distincte de celle du COMPTE ─────────
--
-- `utilisateur.email` est un identifiant de connexion : il n'existe que si
-- l'employé a un compte, et il est UNIQUE. `employe.email_contact` est une
-- donnée de la fiche, saisie à l'embauche, qui sert à préremplir la création du
-- compte le jour où elle a lieu — éventuellement jamais.
--
-- Pas d'unicité, délibérément : deux fiches peuvent pointer une même adresse de
-- service. C'est `utilisateur.email` qui tranche, au moment du compte.

-- ── La direction : l'un des deux, jamais aucun ─────────────────────────────
--
-- `code_departement` devient nullable pour laisser place à `departement_libre`,
-- pas pour autoriser une fiche SANS direction : elle s'imprime sur l'ordre de
-- mission (« Affectation »), et les rapports groupent dessus.
--
-- Sans ce CHECK, la seule chose qui l'imposerait serait `validerEmploye()` —
-- donc rien, dès qu'une ligne est écrite par un script ou une reprise de
-- données. La règle appartient à la base parce qu'elle doit tenir sans le code.
--
-- ⚠️ `NOT VALID` : la contrainte s'applique aux écritures futures sans parcourir
-- les lignes existantes. Elle ne peut de toute façon pas les invalider — elles
-- portent toutes un `code_departement`, la colonne était `NOT NULL` jusqu'ici —
-- mais l'écrire ainsi évite un balayage complet de la table et rend la migration
-- insensible à une reprise de données partielle.
ALTER TABLE employe
  ADD CONSTRAINT employe_direction_renseignee
  CHECK (code_departement IS NOT NULL OR departement_libre IS NOT NULL)
  NOT VALID;

ALTER TABLE ordre_mission
  ALTER COLUMN ville_destination DROP NOT NULL,
  ALTER COLUMN motif DROP NOT NULL;

-- ── L'instantané suit la fiche ──────────────────────────────────────────────
--
-- `participation` recopie la situation de l'employé à l'émission. Si la fiche
-- peut ne pas avoir de grade, l'instantané doit pouvoir enregistrer ce fait,
-- sinon la création d'un OM échouerait sur un `NOT NULL` pour un employé
-- parfaitement valide — le défaut se serait déclaré en production, à la première
-- mission d'un contractuel.
--
-- `code_departement_s` passe à 150 caractères parce qu'il reçoit désormais soit
-- un code de département (10), soit un `departement_libre`, qui est un libellé
-- complet. Élargir un VARCHAR ne réécrit pas la table.
ALTER TABLE participation
  ALTER COLUMN grade_s DROP NOT NULL,
  ALTER COLUMN situation_famille_s DROP NOT NULL,
  ALTER COLUMN code_departement_s TYPE VARCHAR(150);
