import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Document, DocumentLigne, Dossier, Entreprise } from "./types";
import { computeTotaux } from "./documents";
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

async function logoDataUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const { data } = supabase.storage.from("entreprise").getPublicUrl(path);
    const res = await fetch(data.publicUrl);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateDocumentPdf(
  doc: Document,
  lignes: DocumentLigne[],
  dossier: Dossier
) {
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
    body: lignes.map((l) => [
      l.designation || "",
      String(l.quantite ?? 0),
      euros(Number(l.prix_unitaire) || 0),
      euros((Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0)),
    ]),
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

  pdf.save(`${doc.numero || titre}.pdf`);
}
