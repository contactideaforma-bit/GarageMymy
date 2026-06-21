import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Document, DocumentLigne, Dossier, Entreprise } from "./types";
import { computeTotaux } from "./documents";
import { supabase } from "./supabaseClient";

const DEFAUT: Partial<Entreprise> = {
  nom: "GarageMYMY",
  adresse: "",
  code_postal: "",
  ville: "",
  tel: "",
  email: "",
  siret: "",
  tva_intra: "",
  iban: "",
  bic: "",
  mentions: "",
};

function euros(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
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
  const titre = doc.type === "devis" ? "DEVIS" : "FACTURE";
  const accent: [number, number, number] = [139, 92, 246];

  // Logo (optionnel)
  let headerX = 14;
  if (logo) {
    try {
      pdf.addImage(logo, "PNG", 14, 12, 28, 28);
      headerX = 48;
    } catch {
      /* format non supporté : on ignore */
    }
  }

  // En-tête entreprise
  pdf.setFontSize(16);
  pdf.setTextColor(...accent);
  pdf.text(ent.nom || "GarageMYMY", headerX, 20);
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  pdf.text(
    [
      ent.adresse || "",
      `${ent.code_postal || ""} ${ent.ville || ""}`.trim(),
      ent.tel ? `Tél : ${ent.tel}` : "",
      ent.email || "",
    ].filter(Boolean),
    headerX,
    27
  );

  // Titre document (droite)
  pdf.setFontSize(22);
  pdf.setTextColor(30);
  pdf.text(titre, 196, 22, { align: "right" });
  pdf.setFontSize(10);
  pdf.setTextColor(90);
  pdf.text(`N° ${doc.numero || "—"}`, 196, 30, { align: "right" });
  pdf.text(`Date : ${dateFr(doc.date_document)}`, 196, 35, { align: "right" });

  // Client
  const y = 52;
  pdf.setFontSize(10);
  pdf.setTextColor(30);
  pdf.text("Client", 14, y);
  pdf.setTextColor(70);
  pdf.text(
    [
      dossier.client_nom || "—",
      dossier.client_adresse || "",
      `${dossier.client_code_postal || ""} ${dossier.client_ville || ""}`.trim(),
    ].filter(Boolean),
    14,
    y + 5
  );

  // Véhicule / sinistre
  pdf.setTextColor(30);
  pdf.text("Véhicule & sinistre", 120, y);
  pdf.setTextColor(70);
  pdf.text(
    [
      `${dossier.marque_modele || "—"}`,
      `Immat. : ${dossier.immatriculation || "—"}`,
      `N° sinistre : ${dossier.numero_sinistre || "—"}`,
      `Assureur : ${dossier.assureur || "—"}`,
    ],
    120,
    y + 5
  );

  // Tableau lignes
  const totaux = computeTotaux(lignes, doc.tva);
  autoTable(pdf, {
    startY: y + 30,
    head: [["Désignation", "Qté", "PU HT", "Total HT"]],
    body: lignes.map((l) => [
      l.designation || "",
      String(l.quantite ?? 0),
      euros(Number(l.prix_unitaire) || 0),
      euros((Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0)),
    ]),
    headStyles: { fillColor: accent, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });

  const afterTable =
    (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 60;
  let ty = afterTable + 10;
  const right = 196;
  pdf.setFontSize(10);
  pdf.setTextColor(70);
  pdf.text("Total HT", 150, ty, { align: "right" });
  pdf.text(euros(totaux.ht), right, ty, { align: "right" });
  ty += 6;
  pdf.text(`TVA (${doc.tva ?? 0}%)`, 150, ty, { align: "right" });
  pdf.text(euros(totaux.tva), right, ty, { align: "right" });
  ty += 7;
  pdf.setFontSize(12);
  pdf.setTextColor(...accent);
  pdf.text("Total TTC", 150, ty, { align: "right" });
  pdf.text(euros(totaux.ttc), right, ty, { align: "right" });

  // Notes
  if (doc.notes) {
    ty += 14;
    pdf.setFontSize(9);
    pdf.setTextColor(90);
    pdf.text("Notes :", 14, ty);
    pdf.text(pdf.splitTextToSize(doc.notes, 180), 14, ty + 5);
  }

  // Pied de page : coordonnées légales
  const pied = [
    [ent.nom, ent.siret ? `SIRET ${ent.siret}` : "", ent.tva_intra ? `TVA ${ent.tva_intra}` : ""]
      .filter(Boolean)
      .join(" · "),
    [ent.iban ? `IBAN ${ent.iban}` : "", ent.bic ? `BIC ${ent.bic}` : ""].filter(Boolean).join(" · "),
    ent.mentions || "",
  ].filter(Boolean);
  pdf.setFontSize(8);
  pdf.setTextColor(150);
  pdf.text(pied, 105, 282, { align: "center" });

  pdf.save(`${doc.numero || titre}.pdf`);
}
