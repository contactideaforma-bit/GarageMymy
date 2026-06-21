import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Document, DocumentLigne, Dossier } from "./types";
import { computeTotaux } from "./documents";

// Coordonnées de l'entreprise (à rendre configurable plus tard via Paramètres)
export const ENTREPRISE = {
  nom: "GarageMYMY",
  adresse: "—",
  cp_ville: "—",
  tel: "—",
  email: "contact@garagemymy.fr",
  siret: "—",
};

function euros(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
}

function dateFr(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR");
}

export function generateDocumentPdf(
  doc: Document,
  lignes: DocumentLigne[],
  dossier: Dossier
) {
  const pdf = new jsPDF();
  const titre = doc.type === "devis" ? "DEVIS" : "FACTURE";
  const accent: [number, number, number] = [139, 92, 246]; // violet

  // En-tête entreprise
  pdf.setFontSize(18);
  pdf.setTextColor(...accent);
  pdf.text(ENTREPRISE.nom, 14, 20);
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  pdf.text(
    [ENTREPRISE.adresse, ENTREPRISE.cp_ville, `Tél : ${ENTREPRISE.tel}`, ENTREPRISE.email],
    14,
    27
  );

  // Bloc titre document (droite)
  pdf.setFontSize(22);
  pdf.setTextColor(30);
  pdf.text(titre, 196, 22, { align: "right" });
  pdf.setFontSize(10);
  pdf.setTextColor(90);
  pdf.text(`N° ${doc.numero || "—"}`, 196, 30, { align: "right" });
  pdf.text(`Date : ${dateFr(doc.date_document)}`, 196, 35, { align: "right" });

  // Bloc client
  let y = 50;
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

  // Bloc véhicule / sinistre
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

  // Tableau des lignes
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
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  // Totaux
  const afterTable =
    (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
    y + 60;
  let ty = afterTable + 10;
  const right = 196;
  pdf.setFontSize(10);
  pdf.setTextColor(70);
  pdf.text(`Total HT`, 150, ty, { align: "right" });
  pdf.text(euros(totaux.ht), right, ty, { align: "right" });
  ty += 6;
  pdf.text(`TVA (${doc.tva ?? 0}%)`, 150, ty, { align: "right" });
  pdf.text(euros(totaux.tva), right, ty, { align: "right" });
  ty += 7;
  pdf.setFontSize(12);
  pdf.setTextColor(...accent);
  pdf.text(`Total TTC`, 150, ty, { align: "right" });
  pdf.text(euros(totaux.ttc), right, ty, { align: "right" });

  // Notes
  if (doc.notes) {
    ty += 14;
    pdf.setFontSize(9);
    pdf.setTextColor(90);
    pdf.text("Notes :", 14, ty);
    pdf.text(pdf.splitTextToSize(doc.notes, 180), 14, ty + 5);
  }

  // Pied de page
  pdf.setFontSize(8);
  pdf.setTextColor(150);
  pdf.text(
    `${ENTREPRISE.nom} · SIRET ${ENTREPRISE.siret}`,
    105,
    287,
    { align: "center" }
  );

  pdf.save(`${doc.numero || titre}.pdf`);
}
