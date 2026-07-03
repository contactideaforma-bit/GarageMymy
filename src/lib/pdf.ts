import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { CessionCreance, Document, DocumentLigne, Dossier, Entreprise, OrdreReparation, Restitution } from "./types";
import { computeTotaux } from "./documents";
import { AUTORISATION_OR, CESSION_OBJET, CESSION_NOTIFICATION, DECHARGE_RESTITUTION } from "./atelier";
import { supabase } from "./supabaseClient";

const DEFAUT: Partial<Entreprise> = {
  nom: "GarageMYMY",
  adresse: "", code_postal: "", ville: "", tel: "", email: "",
  siret: "", tva_intra: "", iban: "", bic: "", mentions: "",
};

// Format monétaire SANS espace insécable (la police PDF ne la gère pas) :
// espace normale pour les milliers, virgule décimale, "EUR" suffixe.
function euros(n: number): string {
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(2);
  const [intPart, dec] = fixed.split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${withSep},${dec} €`;
}

function dateFr(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR");
}

async function getEntreprise(): Promise<Partial<Entreprise>> {
  try {
    const { data } = await supabase.from("entreprise").select("*").limit(1).maybeSingle();
    return data ? (data as Entreprise) : DEFAUT;
  } catch {
    return DEFAUT;
  }
}

// Réduit une image (dataURL) à maxDim px de côté max, ré-encodée en PNG.
// Évite d'embarquer un logo pleine résolution qui ferait exploser la taille
// du PDF (et donc dépasser la limite de 4,5 Mo des requêtes Vercel à l'envoi).
async function downscaleDataUrl(dataUrl: string, maxDim: number): Promise<string> {
  try {
    if (typeof document === "undefined") return dataUrl; // SSR : on ne touche pas
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    if (scale >= 1) return dataUrl; // déjà assez petit
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return dataUrl;
  }
}

async function logoDataUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const { data } = supabase.storage.from("entreprise").getPublicUrl(path);
    const res = await fetch(data.publicUrl);
    const blob = await res.blob();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
    if (!dataUrl) return null;
    return await downscaleDataUrl(dataUrl, 256);
  } catch {
    return null;
  }
}

export async function generateDocumentPdf(
  doc: Document,
  lignes: DocumentLigne[],
  dossier: Dossier
) {
  const pdf = await buildDocumentPdf(doc, lignes, dossier);
  const titre = doc.type === "devis" ? "DEVIS" : "FACTURE";
  pdf.save(`${doc.numero || titre}.pdf`);
}

// Renvoie le PDF encodé en base64 (sans préfixe data:), pour pièce jointe email.
export async function documentPdfBase64(
  doc: Document,
  lignes: DocumentLigne[],
  dossier: Dossier
): Promise<string> {
  const pdf = await buildDocumentPdf(doc, lignes, dossier);
  const uri = pdf.output("datauristring"); // data:application/pdf;...;base64,XXXX
  return uri.substring(uri.indexOf(",") + 1);
}

async function buildDocumentPdf(
  doc: Document,
  lignes: DocumentLigne[],
  dossier: Dossier
): Promise<jsPDF> {
  const ent = await getEntreprise();
  const logo = await logoDataUrl(ent.logo_path);

  const pdf = new jsPDF();
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 14; // marge gauche/droite
  const right = pageW - M;
  const titre = doc.type === "devis" ? "DEVIS" : "FACTURE";
  const accent: [number, number, number] = [124, 92, 246];

  // Pied de page (dessiné sur chaque page)
  const pied = [
    [ent.nom, ent.siret ? `SIRET ${ent.siret}` : "", ent.tva_intra ? `TVA ${ent.tva_intra}` : ""]
      .filter(Boolean).join("  -  "),
    [ent.iban ? `IBAN ${ent.iban}` : "", ent.bic ? `BIC ${ent.bic}` : ""].filter(Boolean).join("  -  "),
    ent.mentions || "",
  ].filter(Boolean);

  function drawFooter() {
    pdf.setFontSize(7.5);
    pdf.setTextColor(150);
    pied.forEach((line, i) => {
      pdf.text(line, pageW / 2, pageH - 14 + i * 4, { align: "center" });
    });
  }

  // ---------- En-tête (page 1) ----------
  let headerX = M;
  if (logo) {
    try {
      pdf.addImage(logo, "PNG", M, 12, 26, 26);
      headerX = M + 32;
    } catch { /* format non supporté */ }
  }
  pdf.setFontSize(16);
  pdf.setTextColor(...accent);
  pdf.text(ent.nom || "GarageMYMY", headerX, 19);
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  pdf.text(
    [
      ent.adresse || "",
      `${ent.code_postal || ""} ${ent.ville || ""}`.trim(),
      ent.tel ? `Tel : ${ent.tel}` : "",
      ent.email || "",
    ].filter(Boolean),
    headerX,
    26
  );

  pdf.setFontSize(22);
  pdf.setTextColor(30);
  pdf.text(titre, right, 21, { align: "right" });
  pdf.setFontSize(10);
  pdf.setTextColor(90);
  pdf.text(`N° ${doc.numero || "—"}`, right, 29, { align: "right" });
  pdf.text(`Date : ${dateFr(doc.date_document)}`, right, 34, { align: "right" });

  // ---------- Blocs client / véhicule ----------
  const yBlocs = 50;
  pdf.setFontSize(10);
  pdf.setTextColor(30);
  pdf.text("Client", M, yBlocs);
  pdf.text("Véhicule & sinistre", pageW / 2 + 6, yBlocs);
  pdf.setTextColor(70);
  pdf.setFontSize(9);
  pdf.text(
    [
      dossier.client_nom || "—",
      dossier.client_adresse || "",
      `${dossier.client_code_postal || ""} ${dossier.client_ville || ""}`.trim(),
    ].filter(Boolean),
    M, yBlocs + 6
  );
  pdf.text(
    [
      dossier.marque_modele || "—",
      `Immat. : ${dossier.immatriculation || "—"}`,
      `N° sinistre : ${dossier.numero_sinistre || "—"}`,
      `Assureur : ${dossier.assureur || "—"}`,
    ],
    pageW / 2 + 6, yBlocs + 6
  );

  // ---------- Tableau des lignes ----------
  const totaux = computeTotaux(lignes, doc.tva);
  autoTable(pdf, {
    startY: yBlocs + 32,
    margin: { top: 20, left: M, right: M, bottom: 26 },
    tableWidth: pageW - M * 2,
    head: [["Désignation", "Qté", "PU HT", "Total HT"]],
    body: lignes.map((l) => {
      const total = (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0);
      // Lignes à 0 € = opérations du rapport (D, R, P, G…) comprises dans la
      // main d'œuvre : on les affiche quand même, marquées "Inclus".
      return [
        l.designation || "",
        String(l.quantite ?? 0),
        total === 0 ? "—" : euros(Number(l.prix_unitaire) || 0),
        total === 0 ? "Inclus" : euros(total),
      ];
    }),
    headStyles: { fillColor: accent, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 2.5, overflow: "linebreak", valign: "middle" },
    alternateRowStyles: { fillColor: [245, 244, 250] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 16, halign: "right" },
      2: { cellWidth: 32, halign: "right" },
      3: { cellWidth: 34, halign: "right" },
    },
    didDrawPage: () => drawFooter(),
  });

  // ---------- Totaux (sans orphelin : saut de page si trop bas) ----------
  let ty = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yBlocs + 60) + 10;
  if (ty > pageH - 50) {
    pdf.addPage();
    drawFooter();
    ty = 25;
  }

  const labelX = right - 45;
  pdf.setFontSize(10);
  pdf.setTextColor(70);
  pdf.text("Total HT", labelX, ty, { align: "right" });
  pdf.text(euros(totaux.ht), right, ty, { align: "right" });
  ty += 6;
  pdf.text(`TVA (${doc.tva ?? 0}%)`, labelX, ty, { align: "right" });
  pdf.text(euros(totaux.tva), right, ty, { align: "right" });
  ty += 8;
  pdf.setDrawColor(...accent);
  pdf.setLineWidth(0.4);
  pdf.line(labelX - 5, ty - 5, right, ty - 5);
  pdf.setFontSize(12);
  pdf.setTextColor(...accent);
  pdf.text("Total TTC", labelX, ty, { align: "right" });
  pdf.text(euros(totaux.ttc), right, ty, { align: "right" });

  // ---------- Notes ----------
  if (doc.notes) {
    ty += 14;
    if (ty > pageH - 30) { pdf.addPage(); drawFooter(); ty = 25; }
    pdf.setFontSize(9);
    pdf.setTextColor(90);
    pdf.text("Notes :", M, ty);
    pdf.text(pdf.splitTextToSize(doc.notes, pageW - M * 2), M, ty + 5);
  }

  return pdf;
}

/* ==================================================================
 *  Atelier : ordre de réparation & PV de restitution
 * ================================================================== */

type AttestationCtx = {
  pdf: jsPDF;
  pageW: number;
  pageH: number;
  M: number;
  right: number;
  y: number;
  ent: Partial<Entreprise>;
};

// En-tête commun (charte entreprise) + pied de page, pour les documents
// "attestation" (OR, PV de restitution). Renvoie le contexte de dessin.
async function startAttestationPdf(
  titre: string,
  numero: string | null,
  date: string | null
): Promise<AttestationCtx> {
  const ent = await getEntreprise();
  const logo = await logoDataUrl(ent.logo_path);

  const pdf = new jsPDF();
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 14;
  const right = pageW - M;
  const accent: [number, number, number] = [124, 92, 246];

  const pied = [
    [ent.nom, ent.siret ? `SIRET ${ent.siret}` : "", ent.tva_intra ? `TVA ${ent.tva_intra}` : ""]
      .filter(Boolean).join("  -  "),
    ent.mentions || "",
  ].filter(Boolean);
  pdf.setFontSize(7.5);
  pdf.setTextColor(150);
  pied.forEach((line, i) => {
    pdf.text(line, pageW / 2, pageH - 14 + i * 4, { align: "center" });
  });

  let headerX = M;
  if (logo) {
    try {
      pdf.addImage(logo, "PNG", M, 12, 26, 26);
      headerX = M + 32;
    } catch { /* format non supporté */ }
  }
  pdf.setFontSize(16);
  pdf.setTextColor(...accent);
  pdf.text(ent.nom || "GarageMYMY", headerX, 19);
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  pdf.text(
    [
      ent.adresse || "",
      `${ent.code_postal || ""} ${ent.ville || ""}`.trim(),
      ent.tel ? `Tel : ${ent.tel}` : "",
      ent.email || "",
    ].filter(Boolean),
    headerX,
    26
  );

  pdf.setFontSize(17);
  pdf.setTextColor(30);
  pdf.text(titre, right, 21, { align: "right" });
  pdf.setFontSize(10);
  pdf.setTextColor(90);
  if (numero) pdf.text(`N° ${numero}`, right, 29, { align: "right" });
  pdf.text(`Date : ${dateFr(date)}`, right, numero ? 34 : 29, { align: "right" });

  return { pdf, pageW, pageH, M, right, y: 50, ent };
}

// Blocs client / véhicule (mêmes infos que devis/factures).
function drawBlocsClientVehicule(ctx: AttestationCtx, dossier: Dossier) {
  const { pdf, pageW, M } = ctx;
  pdf.setFontSize(10);
  pdf.setTextColor(30);
  pdf.text("Client", M, ctx.y);
  pdf.text("Véhicule & sinistre", pageW / 2 + 6, ctx.y);
  pdf.setTextColor(70);
  pdf.setFontSize(9);
  pdf.text(
    [
      dossier.client_nom || "—",
      dossier.client_adresse || "",
      `${dossier.client_code_postal || ""} ${dossier.client_ville || ""}`.trim(),
    ].filter(Boolean),
    M, ctx.y + 6
  );
  pdf.text(
    [
      dossier.marque_modele || "—",
      `Immat. : ${dossier.immatriculation || "—"}`,
      `N° sinistre : ${dossier.numero_sinistre || "—"}`,
      `Assureur : ${dossier.assureur || "—"}`,
    ],
    pageW / 2 + 6, ctx.y + 6
  );
  ctx.y += 34;
}

// Paragraphe avec titre. Avance y.
function drawParagraphe(ctx: AttestationCtx, titre: string | null, texte: string) {
  const { pdf, pageW, M } = ctx;
  if (titre) {
    pdf.setFontSize(10);
    pdf.setTextColor(30);
    pdf.text(titre, M, ctx.y);
    ctx.y += 6;
  }
  pdf.setFontSize(9);
  pdf.setTextColor(70);
  const lines = pdf.splitTextToSize(texte, pageW - M * 2) as string[];
  pdf.text(lines, M, ctx.y);
  ctx.y += lines.length * 4.2 + 8;
}

// Cadre signature (image si signée) + nom + date. Avance y.
function drawSignatureBloc(
  ctx: AttestationCtx,
  signataire: string | null,
  signature: string | null,
  signeLe: string | null
) {
  const { pdf, right } = ctx;
  const w = 70;
  const h = 32;
  const x = right - w;
  pdf.setFontSize(9);
  pdf.setTextColor(30);
  pdf.text("Signature du client :", x, ctx.y);
  pdf.setDrawColor(180);
  pdf.setLineWidth(0.3);
  pdf.rect(x, ctx.y + 3, w, h);
  if (signature) {
    try {
      pdf.addImage(signature, "PNG", x + 2, ctx.y + 5, w - 4, h - 4);
    } catch { /* dataURL invalide */ }
  }
  pdf.setFontSize(8.5);
  pdf.setTextColor(90);
  const infos = [
    signataire ? `Nom : ${signataire}` : "",
    signeLe ? `Signé le ${dateFr(signeLe)}` : "",
  ].filter(Boolean);
  if (infos.length) pdf.text(infos, x, ctx.y + h + 8);
  ctx.y += h + 18;
}

export async function generateOrdreReparationPdf(or: OrdreReparation, dossier: Dossier) {
  const ctx = await startAttestationPdf("ORDRE DE RÉPARATION", or.numero, or.date_or);
  drawBlocsClientVehicule(ctx, dossier);

  drawParagraphe(ctx, "Travaux à réaliser", or.travaux || "Réparations selon devis accepté et rapport d'expertise.");

  const details = [
    or.date_debut ? `Début prévu : ${dateFr(or.date_debut)}` : "",
    or.date_fin ? `Fin prévue : ${dateFr(or.date_fin)}` : "",
    dossier.reparateur ? `Réparateur : ${dossier.reparateur}` : "",
    or.montant_ht != null ? `Montant estimé HT : ${euros(Number(or.montant_ht) || 0)}` : "",
  ].filter(Boolean);
  if (details.length) drawParagraphe(ctx, "Conditions", details.join("   ·   "));

  drawParagraphe(ctx, "Autorisation", AUTORISATION_OR);
  drawSignatureBloc(ctx, or.signataire_nom, or.signature, or.signe_le);

  ctx.pdf.save(`${or.numero || "ordre-reparation"}.pdf`);
}

export async function generateCessionPdf(cession: CessionCreance, dossier: Dossier) {
  const pdf = await buildCessionPdf(cession, dossier);
  pdf.save(`cession-creance-${dossier.numero_sinistre || dossier.immatriculation || "dossier"}.pdf`);
}

// Base64 (sans préfixe data:) pour pièce jointe email.
export async function cessionPdfBase64(cession: CessionCreance, dossier: Dossier): Promise<string> {
  const pdf = await buildCessionPdf(cession, dossier);
  const uri = pdf.output("datauristring");
  return uri.substring(uri.indexOf(",") + 1);
}

async function buildCessionPdf(cession: CessionCreance, dossier: Dossier): Promise<jsPDF> {
  const ctx = await startAttestationPdf("CESSION DE CRÉANCE", null, cession.date_cession);
  const { ent } = ctx;
  drawBlocsClientVehicule(ctx, dossier);

  const cedant = [
    dossier.client_nom || "—",
    [dossier.client_adresse, `${dossier.client_code_postal || ""} ${dossier.client_ville || ""}`.trim()]
      .filter(Boolean).join(", "),
  ].filter(Boolean).join(" — ");
  const cessionnaire = [
    ent.nom || "—",
    [ent.adresse, `${ent.code_postal || ""} ${ent.ville || ""}`.trim()].filter(Boolean).join(", "),
    ent.siret ? `SIRET ${ent.siret}` : "",
  ].filter(Boolean).join(" — ");
  const debiteur = [
    dossier.assureur || "—",
    dossier.assureur_adresse || "",
    dossier.numero_police ? `Police n° ${dossier.numero_police}` : "",
  ].filter(Boolean).join(" — ");

  drawParagraphe(
    ctx,
    "Parties",
    `Cédant (client) : ${cedant}\nCessionnaire (réparateur) : ${cessionnaire}\nDébiteur cédé (assureur) : ${debiteur}`
  );

  const objet =
    `Sinistre n° ${dossier.numero_sinistre || "—"}` +
    (dossier.date_sinistre ? ` du ${dateFr(dossier.date_sinistre)}` : "") +
    (cession.montant != null ? ` — créance cédée : ${euros(Number(cession.montant) || 0)} TTC` : "") +
    ".\n" + CESSION_OBJET;
  drawParagraphe(ctx, "Objet de la cession", objet);
  drawParagraphe(ctx, "Notification au débiteur cédé", CESSION_NOTIFICATION);

  drawSignatureBloc(ctx, cession.signataire_nom, cession.signature, cession.signe_le);

  return ctx.pdf;
}

export async function generateRestitutionPdf(rest: Restitution, dossier: Dossier) {
  const ctx = await startAttestationPdf("PV DE RESTITUTION", null, rest.date_restitution);
  drawBlocsClientVehicule(ctx, dossier);

  const details = [
    `Date de restitution : ${dateFr(rest.date_restitution)}`,
    rest.kilometrage != null ? `Kilométrage : ${Number(rest.kilometrage).toLocaleString("fr-FR")} km` : "",
  ].filter(Boolean);
  drawParagraphe(ctx, "Restitution du véhicule", details.join("   ·   "));

  if (rest.observations) drawParagraphe(ctx, "Observations", rest.observations);

  drawParagraphe(ctx, "Décharge", DECHARGE_RESTITUTION);
  drawSignatureBloc(ctx, rest.signataire_nom, rest.signature, rest.signe_le);

  ctx.pdf.save(`restitution-${dossier.immatriculation || dossier.numero_sinistre || "vehicule"}.pdf`);
}
