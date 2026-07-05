// Conversion des photos en PDF (A4) : toute image capturée ou choisie est
// enregistrée en PDF dans le dossier, pour des pièces uniformes et lisibles.

import jsPDF from "jspdf";

// dataURL (jpeg/png) → Blob PDF A4, image ajustée à la page avec marges.
export async function imageDataUrlVersPdf(dataUrl: string): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });

  // Portrait ou paysage selon la photo
  const paysage = img.width > img.height;
  const pdf = new jsPDF({ orientation: paysage ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 8;

  const ratio = Math.min((pageW - M * 2) / img.width, (pageH - M * 2) / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  const type = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
  pdf.addImage(dataUrl, type, (pageW - w) / 2, (pageH - h) / 2, w, h);
  return pdf.output("blob");
}

// Fichier image → Blob PDF ; un PDF passe tel quel.
export async function fichierVersPdf(file: File): Promise<{ blob: Blob; ext: "pdf" }> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return { blob: file, ext: "pdf" };
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  return { blob: await imageDataUrlVersPdf(dataUrl), ext: "pdf" };
}
