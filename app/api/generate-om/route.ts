import { NextRequest, NextResponse } from "next/server";
import { generateOmDocx } from "@/lib/generateOmDocx";
import type { OrdreMissionDocument } from "@/types/om";

// Obligatoire : docxtemplater/pizzip ont besoin de Node (fs, buffers), pas d'Edge.
export const runtime = "nodejs";

// Le front envoie l'OM qu'il a déjà (mock data pour l'instant, base
// PostgreSQL via Prisma plus tard) — cette route ne fait AUCUN appel
// réseau, elle se contente de générer le fichier à partir de ce qu'on lui
// donne. Aucune revalidation des règles métier ici pour l'instant (voir
// AMELIORATIONS.md #2) : à faire une fois Prisma branché, avant génération.
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
