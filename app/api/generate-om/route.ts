import { NextRequest, NextResponse } from "next/server";
import { generateOmDocx } from "@/lib/generateOmDocx";
import type { OrdreMission } from "@/types/om";

// Obligatoire : docxtemplater/pizzip ont besoin de Node (fs, buffers), pas d'Edge.
export const runtime = "nodejs";

// Le front envoie l'OM qu'il a déjà (mock data pour l'instant, Spring Boot plus
// tard) — cette route ne fait AUCUN appel réseau, elle se contente de générer
// le fichier à partir de ce qu'on lui donne.
export async function POST(request: NextRequest) {
  const om: OrdreMission = await request.json();

  let buffer: Buffer;
  try {
    buffer = generateOmDocx(om);
  } catch {
    return NextResponse.json(
      { error: "Échec de la génération du document" },
      { status: 500 }
    );
  }

  const filename = `ordre_mission_${om.matricule ?? "om"}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
