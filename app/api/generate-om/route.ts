import { NextRequest, NextResponse } from "next/server";
import { generateOmDocx } from "@/lib/generateOmDocx";
import type { OrdreMissionDocument } from "@/types/om";

// Obligatoire : docxtemplater/pizzip ont besoin de Node (fs, buffers), pas d'Edge.
export const runtime = "nodejs";

// Le front envoie l'OM qu'il a déjà (mock data pour l'instant, base
// PostgreSQL via Prisma plus tard) — cette route ne fait AUCUN appel
// réseau, elle se contente de générer le fichier à partir de ce qu'on lui
// donne.
//
// ⚠️ AUCUNE authentification ni revalidation des règles métier ici. La doc
// Next 16 est explicite sur ce risque pour les Server Functions, et il vaut
// autant pour un Route Handler : « reachable via direct POST requests, not
// just through your application's UI ». N'importe qui peut donc obtenir un
// document Word au contenu de son choix.
//
// À corriger quand la base sera branchée : la route devra recevoir un
// IDENTIFIANT d'OM et lire les données EN BASE, au lieu de faire confiance au
// corps de la requête. Cf. MODELE-DONNEES.md §1 et §13 (étape 8).
//
// ⚠️ Cette route devra aussi migrer côté navigateur : l'OM doit être
// téléchargeable HORS LIGNE (MODELE-DONNEES.md §1), ce qu'un Route Handler ne
// permet pas. docxtemplater fonctionne dans le navigateur — c'est son usage
// d'origine. Les deux exigences se rejoignent mal : lecture en base (serveur)
// contre téléchargement hors ligne (client). À trancher à l'étape 10.
export async function POST(request: NextRequest) {
  const om: OrdreMissionDocument = await request.json();

  let buffer: Buffer;
  try {
    buffer = generateOmDocx(om);
  } catch {
    return NextResponse.json(
      { error: "Échec de la génération du document" },
      { status: 500 }
    );
  }

  // `om` vient tel quel du JSON envoyé par le client — on ne fait pas
  // confiance à matricule pour construire un header HTTP sans le nettoyer
  // (guillemets, retours à la ligne, etc. pourraient corrompre l'en-tête).
  const matriculeSanitise = (om.matricule ?? "om").replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `ordre_mission_${matriculeSanitise || "om"}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
