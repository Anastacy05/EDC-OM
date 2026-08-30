// Vérifie que les contraintes de `localite` tiennent EN BASE, sans passer par
// l'application. Même intention que prisma/verifierMail.ts : ce qui est censé
// être garanti hors du code doit pouvoir être constaté hors du code.
//
// `npx tsx prisma/sondeLocalite.ts` — résultat attendu (vérifié le 25/08/2026) :
//
//   PASSE  ajout Nachtigal (CM)
//   REFUS  doublon NACHTIGAL (casse)      -> P2002
//   REFUS  doublon avec accent Nachtigàl  -> P2002
//   REFUS  doublon avec blanc de fin      -> P2002
//   PASSE  meme nom, autre pays (TD)
//   REFUS  nom fait de blancs             -> P2039  (localite_nom_non_vide)
//   REFUS  pays inconnu (ZZ)              -> P2003  (clé étrangère)
//   REFUS  inactif sans date de retrait   -> P2039  (localite_retrait_date)
//   PASSE  reajout apres retrait                    (index unique PARTIEL)
//
// ⚠️ La sonde VIDE la table `localite` au début et à la fin. À ne pas lancer sur
// une base de production : les localités ajoutées à la main y seraient perdues.
import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function essai(label: string, f: () => Promise<unknown>) {
  try {
    await f();
    console.log("PASSE ", label);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.log("REFUS ", label, "->", err.code ?? err.message?.slice(0, 100));
  }
}

async function main() {
  await p.$executeRawUnsafe("DELETE FROM localite");

  await essai("ajout Nachtigal (CM)", () =>
    p.localite.create({ data: { codePays: "CM", nom: "Nachtigal" } })
  );
  await essai("doublon NACHTIGAL (casse)", () =>
    p.localite.create({ data: { codePays: "CM", nom: "NACHTIGAL" } })
  );
  await essai("doublon avec accent Nachtigàl", () =>
    p.localite.create({ data: { codePays: "CM", nom: "Nachtigàl" } })
  );
  await essai("doublon avec blanc de fin", () =>
    p.localite.create({ data: { codePays: "CM", nom: "Nachtigal " } })
  );
  await essai("meme nom, autre pays (TD)", () =>
    p.localite.create({ data: { codePays: "TD", nom: "Nachtigal" } })
  );
  await essai("nom fait de blancs", () =>
    p.localite.create({ data: { codePays: "CM", nom: "   " } })
  );
  await essai("pays inconnu (ZZ)", () =>
    p.localite.create({ data: { codePays: "ZZ", nom: "Ailleurs" } })
  );
  await essai("inactif sans date de retrait", () =>
    p.localite.create({ data: { codePays: "CM", nom: "Sansdate", actif: false } })
  );

  await p.localite.updateMany({
    where: { codePays: "CM", nom: "Nachtigal" },
    data: { actif: false, retireLe: new Date() },
  });
  await essai("reajout apres retrait", () =>
    p.localite.create({ data: { codePays: "CM", nom: "Nachtigal" } })
  );

  console.log(
    "lignes :",
    await p.localite.count(),
    "| actives :",
    await p.localite.count({ where: { actif: true } })
  );

  await p.$executeRawUnsafe("DELETE FROM localite");
  await p.$disconnect();
}

main();
