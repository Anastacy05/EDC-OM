/**
 * Seed des référentiels d'EDC-OM.
 *
 * PRINCIPE : ce script ne recopie AUCUNE donnée. Il DÉRIVE tout des modules
 * qui font foi aujourd'hui — lib/referentiels.ts, lib/zones.ts,
 * lib/continents.ts, lib/baremes.ts, lib/config.ts. Dupliquer ces tables ici
 * garantirait leur divergence à la première modification.
 *
 * Idempotent : `upsert` partout, donc rejouable sans effet de bord.
 *
 *   npx prisma db seed
 */
import { PrismaClient } from "../lib/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Country } from "country-state-city";
import countries from "i18n-iso-countries";
import fr from "i18n-iso-countries/langs/fr.json" with { type: "json" };

import { DEPARTEMENTS, STATUTS } from "../lib/referentiels";
import { LIBELLE_ZONE, zoneDuPaysParCode, type Zone } from "../lib/zones";
import { continentDuPaysParCode } from "../lib/continents";
import { BAREME_FRAIS_FIXE } from "../lib/baremes";
import { configOM } from "../lib/config";

countries.registerLocale(fr as never);

// ⚠️ PRISMA 7 : le moteur de requêtes Rust a disparu, un ADAPTATEUR DE PILOTE
// est désormais obligatoire — `new PrismaClient()` sans argument échoue. Toute
// la future couche d'accès aux données (lib/data/) devra faire de même.
//
// DATABASE_URL est lu ici et non via prisma.config.ts : ce fichier est exécuté
// comme un script Node autonome, pas par la CLI.
const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL absente. Copier .env.example en .env.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });

/**
 * Code stable à partir d'un libellé. Le référentiel actuel utilise le libellé
 * LUI-MÊME comme valeur stockée ("Chef de Service"), ce qui interdit tout
 * renommage sans migration de données. On dérive donc un code technique.
 *
 * Corrige au passage le piège relevé dans MODELE-DONNEES.md §3 :
 * "Sous-Directeur" (POSTES) et "Sous-directeur" (STATUTS, clé du barème)
 * différaient par la casse. Normalisés, les deux donnent SOUS_DIRECTEUR.
 */
function codeDepuisLibelle(libelle: string): string {
  return libelle
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les accents
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Art. 81-4 du Statut du personnel : les cadres ont 30 jours calendaires.
 * Arbitré le 19/08/2026 : est cadre tout statut « Cadre ou hiérarchiquement
 * au-dessus ». STATUTS étant déjà ordonné du plus élevé au plus bas, cela
 * revient à tout ce qui précède « Agent de maîtrise ».
 *
 * On calcule la frontière à partir de la POSITION de "Cadre" dans le
 * référentiel, plutôt que d'écrire « les 8 premiers » : si un statut est
 * inséré au-dessus, la frontière suit toute seule.
 */
const INDEX_CADRE = STATUTS.findIndex((s) => s.valeur === "Cadre");
if (INDEX_CADRE === -1) {
  throw new Error(
    "Le statut « Cadre » est introuvable dans STATUTS : impossible de situer la " +
      "frontière du collège cadres (art. 81-4). Vérifier lib/referentiels.ts."
  );
}

async function seedZones() {
  for (const code of [0, 1, 2, 3] as Zone[]) {
    await prisma.zone.upsert({
      where: { code },
      update: { libelle: LIBELLE_ZONE[code] },
      create: { code, libelle: LIBELLE_ZONE[code] },
    });
  }
  console.log("zone                  : 4");
}

async function seedDepartements() {
  for (const d of DEPARTEMENTS) {
    await prisma.departement.upsert({
      where: { code: d.valeur },
      update: { libelle: d.libelle },
      create: { code: d.valeur, libelle: d.libelle, actif: true },
    });
  }
  console.log(`departement           : ${DEPARTEMENTS.length}`);
}

async function seedStatuts() {
  let cadres = 0;
  for (const [i, s] of STATUTS.entries()) {
    const estCadre = i <= INDEX_CADRE;
    if (estCadre) cadres++;
    await prisma.statut.upsert({
      where: { code: codeDepuisLibelle(s.valeur) },
      update: { libelle: s.libelle, rang: i + 1, estCadre },
      create: {
        code: codeDepuisLibelle(s.valeur),
        libelle: s.libelle,
        rang: i + 1, // 1 = plus élevé, ordre du référentiel
        estCadre,
        actif: true,
      },
    });
  }
  console.log(`statut                : ${STATUTS.length} (dont ${cadres} cadres)`);
}

async function seedPays() {
  const tous = Country.getAllCountries();
  let sansContinent = 0;

  for (const c of tous) {
    const nomFr = countries.getName(c.isoCode, "fr") ?? c.name;
    const continent = continentDuPaysParCode(c.isoCode);
    const zone = zoneDuPaysParCode(c.isoCode);

    // continentDuPaysParCode renvoie null pour ce qui n'est dans aucune de ses
    // listes (territoires, dépendances). On les compte pour ne pas les perdre
    // silencieusement : ils restent destinables, seuls les RAPPORTS par
    // continent les ignorent.
    if (!continent) {
      sansContinent++;
      continue;
    }

    const continentEnum = continent
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase() as "AFRIQUE" | "AMERIQUE" | "ASIE" | "EUROPE" | "OCEANIE";

    await prisma.pays.upsert({
      where: { codeIso: c.isoCode },
      update: { nomFr, continent: continentEnum, codeZone: zone },
      create: { codeIso: c.isoCode, nomFr, continent: continentEnum, codeZone: zone },
    });
  }

  const total = await prisma.pays.count();
  console.log(`pays                  : ${total} sur ${tous.length}`);
  if (sansContinent > 0) {
    console.log(
      `  ⚠️  ${sansContinent} pays/territoires ignorés : absents des listes de ` +
        `lib/continents.ts. Ils ne sont donc PAS destinables. Cf. rapport ci-dessous.`
    );
  }
}

async function seedBareme() {
  let lignes = 0;
  const statutsSansBareme: string[] = [];

  for (const s of STATUTS) {
    const parZone = BAREME_FRAIS_FIXE[s.valeur];
    if (!parZone) {
      statutsSansBareme.push(s.valeur);
      continue;
    }
    for (const code of [0, 1, 2, 3] as Zone[]) {
      const montant = parZone[code];
      if (montant === undefined) continue;
      await prisma.baremeFraisFixe.upsert({
        where: {
          codeStatut_codeZone: { codeStatut: codeDepuisLibelle(s.valeur), codeZone: code },
        },
        update: { montantJournalier: montant },
        create: {
          codeStatut: codeDepuisLibelle(s.valeur),
          codeZone: code,
          montantJournalier: montant,
        },
      });
      lignes++;
    }
  }

  console.log(`bareme_frais_fixe     : ${lignes} (attendu ${STATUTS.length * 4})`);
  if (statutsSansBareme.length > 0) {
    // Un statut sans barème produirait un montant manquant sur un document
    // réel, silencieusement. C'est ce que le console.warn de lib/baremes.ts
    // signalait en dev ; ici on le rend bloquant.
    throw new Error(
      `Statuts sans barème : ${statutsSansBareme.join(", ")}. ` +
        "Un OM émis pour ces statuts n'aurait aucune indemnité calculée."
    );
  }
}

/**
 * Types de congé. ⚠️ Liste PROVISOIRE : la DRH n'a pas encore fourni la
 * nomenclature (MODELE-DONNEES.md §9). Seul ANNUEL est documenté par le Statut
 * du personnel (art. 80-82) ; les autres sont les cas usuels du Code du
 * travail camerounais, à faire confirmer.
 */
const TYPES_CONGE = [
  { code: "ANNUEL", libelle: "Congé annuel", decompteSolde: true },
  { code: "MATERNITE", libelle: "Congé de maternité", decompteSolde: false },
  { code: "MALADIE", libelle: "Congé de maladie", decompteSolde: false },
  { code: "SANS_SOLDE", libelle: "Congé sans solde", decompteSolde: false },
  { code: "EXCEPTIONNEL", libelle: "Permission exceptionnelle (événement familial)", decompteSolde: false },
];

async function seedTypesConge() {
  for (const t of TYPES_CONGE) {
    await prisma.typeConge.upsert({
      where: { code: t.code },
      update: { libelle: t.libelle, decompteSolde: t.decompteSolde },
      create: { ...t, actif: true },
    });
  }
  console.log(`type_conge            : ${TYPES_CONGE.length} (À VALIDER DRH)`);
}

async function seedConfiguration() {
  // La ligne unique est garantie par CHECK (id = 1) côté base.
  await prisma.configuration.upsert({
    where: { id: 1 },
    update: {}, // ne JAMAIS écraser une valeur réglée depuis /admin
    create: { id: 1, ageRetraite: configOM.ageRetraite, taillePlageNumero: 50 },
  });
  const c = await prisma.configuration.findUnique({ where: { id: 1 } });
  console.log(`configuration         : age_retraite=${c?.ageRetraite}, plage=${c?.taillePlageNumero}`);
}

/** Répartition obtenue, pour contrôle visuel du classement en zones. */
async function rapport() {
  const parZone = await prisma.pays.groupBy({
    by: ["codeZone"],
    _count: true,
    orderBy: { codeZone: "asc" },
  });
  console.log("\nRépartition des pays par zone :");
  for (const z of parZone) {
    const libelle = LIBELLE_ZONE[z.codeZone as Zone];
    console.log(`  zone ${z.codeZone} : ${String(z._count).padStart(3)} pays  — ${libelle}`);
  }

  // Les six conventions posées par le développeur, à faire valider par les RH
  // (MODELE-DONNEES.md §8). Affichées pour qu'elles soient VUES, pas enfouies.
  const aVerifier = ["SD", "TR", "CY", "EH", "EE", "LV", "LT", "RU"];
  const lignes = await prisma.pays.findMany({
    where: { codeIso: { in: aVerifier } },
    orderBy: { codeIso: "asc" },
  });
  console.log("\nConventions à valider RH (choix du développeur, pas du barème) :");
  for (const p of lignes) {
    console.log(`  ${p.codeIso}  zone ${p.codeZone}  ${p.nomFr}`);
  }
}

async function main() {
  console.log("Seed des référentiels EDC-OM\n");
  // Ordre imposé par les clés étrangères : zone avant pays et barème,
  // statut avant barème.
  await seedZones();
  await seedDepartements();
  await seedStatuts();
  await seedPays();
  await seedBareme();
  await seedTypesConge();
  await seedConfiguration();
  await rapport();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("\n✔ Seed terminé.");
  })
  .catch(async (e) => {
    console.error("\n✖ Seed interrompu :", e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
