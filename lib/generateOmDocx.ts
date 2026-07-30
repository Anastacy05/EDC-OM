import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs";
import path from "path";
import type { OrdreMissionDocument } from "@/types/om";

// Le template balisé fourni précédemment (template_om_avec_balises.docx),
// à placer dans /templates à la racine du projet Next.js.
const TEMPLATE_PATH = path.join(process.cwd(), "templates", "template_om_avec_balises.docx");

/**
 * Génère le buffer .docx complété à partir des données d'un OM.
 * Ne touche jamais le disque en écriture : tout se passe en mémoire.
 */
export function generateOmDocx(om: OrdreMissionDocument): Buffer {
  const content = fs.readFileSync(TEMPLATE_PATH, "binary");
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // Si un champ optionnel est absent (ex. visas non renseignés),
    // on affiche une chaîne vide plutôt que de laisser docxtemplater râler.
    nullGetter: () => "",
  });

  try {
    doc.render(om);
  } catch (error) {
    console.error("Erreur docxtemplater :", error);
    throw new Error(
      "Impossible de générer l'ordre de mission — vérifie que le template et les données correspondent."
    );
  }

  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}
