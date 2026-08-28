// Lecture SERVEUR des documents du pack commercial (v10.6) : les PDF de
// docs/pack-commercial sont embarqués dans les fonctions concernées via
// next.config.mjs (outputFileTracingIncludes).
import { promises as fs } from "fs";
import path from "path";
import { DocPack, docParCle } from "./packDocs";

export async function lireDocPack(cle: string): Promise<{ doc: DocPack; contenu: Buffer } | null> {
  const doc = docParCle(cle);
  if (!doc) return null;
  try {
    const contenu = await fs.readFile(path.join(process.cwd(), "docs", "pack-commercial", doc.fichier));
    return { doc, contenu };
  } catch {
    return null;
  }
}
