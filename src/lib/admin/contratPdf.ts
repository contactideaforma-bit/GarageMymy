// PDF du CONTRAT D'ABONNEMENT GARAGE (v10.0) — généré dans le navigateur
// (page /vente après signature, espace éditeur). Charte « vitrine pro »
// (violet → fuchsia), indépendante du thème rétro de l'appli.

import jsPDF from "jspdf";
import { SOCIETE, ADRESSE_COMPLETE } from "@/components/vitrine/societe";
import { Parametres } from "./economie";
import { ACCEPTATION_CGV, VenteContrat, articlesCGV, conditionsParticulieres } from "./contratGarage";

type Ctx = { pdf: jsPDF; y: number; M: number; W: number; pageH: number; pageW: number; page: number };

function pied(c: Ctx) {
  c.pdf.setFontSize(7.5);
  c.pdf.setTextColor(140);
  c.pdf.text(`${SOCIETE.editeur} — SIRET ${SOCIETE.siret} — ${ADRESSE_COMPLETE} — ${SOCIETE.email}`, c.pageW / 2, c.pageH - 10, { align: "center" });
  c.pdf.text(`Page ${c.page}`, c.pageW - c.M, c.pageH - 10, { align: "right" });
}
function nouvellePage(c: Ctx) {
  c.pdf.addPage();
  c.page += 1;
  pied(c);
  c.y = 20;
}
function titre(c: Ctx, t: string, taille = 11) {
  if (c.y + 12 > c.pageH - 20) nouvellePage(c);
  c.pdf.setFont("helvetica", "bold");
  c.pdf.setFontSize(taille);
  c.pdf.setTextColor(124, 58, 237);
  c.pdf.text(t, c.M, c.y);
  c.y += taille * 0.55;
  c.pdf.setFont("helvetica", "normal");
}
function para(c: Ctx, texte: string, taille = 9, couleur = 60) {
  c.pdf.setFontSize(taille);
  c.pdf.setTextColor(couleur);
  const lignes = c.pdf.splitTextToSize(texte, c.W) as string[];
  for (const l of lignes) {
    if (c.y + 4.5 > c.pageH - 20) nouvellePage(c);
    c.pdf.text(l, c.M, c.y);
    c.y += taille * 0.5;
  }
  c.y += 2.5;
}

export function construireContratPdf(
  v: VenteContrat,
  p: Parametres,
  extra: { numero?: string | null; signature?: string | null; signeLe?: string | null; besoins?: Record<string, unknown> | null }
): jsPDF {
  const pdf = new jsPDF();
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 16;
  const c: Ctx = { pdf, y: 0, M, W: pageW - 2 * M, pageH, pageW, page: 1 };

  // Bandeau
  pdf.setFillColor(124, 58, 237);
  pdf.rect(0, 0, pageW, 26, "F");
  pdf.setTextColor(255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("CONTRAT D'ABONNEMENT", M, 11);
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text(`${SOCIETE.produit} by ${SOCIETE.editeur}${extra.numero ? ` — n° ${extra.numero}` : ""}`, M, 18);
  pdf.text(new Date(extra.signeLe || Date.now()).toLocaleDateString("fr-FR"), pageW - M, 18, { align: "right" });
  pied(c);
  c.y = 36;

  // Parties
  titre(c, "Entre les parties");
  pdf.setFontSize(9);
  pdf.setTextColor(60);
  const g1 = [
    `Le prestataire : ${SOCIETE.editeur}`,
    `SIRET ${SOCIETE.siret}`,
    ADRESSE_COMPLETE,
    SOCIETE.email,
  ];
  const g2 = [
    `Le client : ${v.garage_nom}`,
    v.garage_siret ? `SIRET ${v.garage_siret}` : "",
    [v.garage_adresse, `${v.garage_cp || ""} ${v.garage_ville || ""}`.trim()].filter(Boolean).join(", "),
    [v.contact_nom, v.contact_fonction].filter(Boolean).join(", "),
    [v.contact_tel, v.contact_email].filter(Boolean).join(" · "),
  ].filter(Boolean);
  pdf.text(g1, M, c.y);
  pdf.text(g2, pageW / 2 + 4, c.y);
  c.y += Math.max(g1.length, g2.length) * 4.5 + 6;
  if (v.code_apporteur) para(c, `Présenté par l'apporteur d'affaires code ${v.code_apporteur}, mandaté par ${SOCIETE.editeur}.`, 8.5, 110);

  // Conditions particulières
  titre(c, "Conditions particulières");
  for (const l of conditionsParticulieres(v, p)) para(c, "• " + l, 9.5, 30);

  // Fiche de renseignement (annexe courte)
  if (extra.besoins && Object.keys(extra.besoins).length) {
    titre(c, "Annexe — Fiche de renseignement du garage", 10);
    for (const [k, val] of Object.entries(extra.besoins)) {
      const t = Array.isArray(val) ? val.join(", ") : String(val ?? "");
      if (t) para(c, `${k} : ${t}`, 8.5, 80);
    }
  }

  // CGV
  titre(c, "Conditions générales de vente");
  for (const a of articlesCGV(p)) {
    if (c.y + 14 > pageH - 20) nouvellePage(c);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(30);
    pdf.text(a.titre, M, c.y);
    c.y += 4.5;
    pdf.setFont("helvetica", "normal");
    para(c, a.texte, 8.5, 70);
  }

  // Signatures
  if (c.y + 55 > pageH - 20) nouvellePage(c);
  titre(c, "Signatures");
  para(c, ACCEPTATION_CGV, 8.5, 60);
  const yS = c.y;
  pdf.setFontSize(9);
  pdf.setTextColor(30);
  pdf.text(`Pour ${SOCIETE.editeur} :`, M, yS);
  pdf.text("Pour le client (lu et approuvé) :", pageW / 2 + 4, yS);
  pdf.setDrawColor(180);
  pdf.rect(pageW / 2 + 4, yS + 3, 70, 30);
  if (extra.signature) {
    try {
      pdf.addImage(extra.signature, "PNG", pageW / 2 + 6, yS + 5, 66, 26);
    } catch {
      /* image illisible */
    }
  }
  pdf.setFontSize(8.5);
  pdf.setTextColor(90);
  const infos = [
    v.signataire_nom ? `Nom : ${v.signataire_nom}${v.signataire_qualite ? ` (${v.signataire_qualite})` : ""}` : "",
    extra.signeLe ? `Signé le ${new Date(extra.signeLe).toLocaleString("fr-FR")}` : "",
  ].filter(Boolean);
  if (infos.length) pdf.text(infos, pageW / 2 + 4, yS + 39);
  pdf.text(["Validation par email de bienvenue", "et création du compte (art. 11)."], M, yS + 8);
  return pdf;
}

export function telechargerContratPdf(v: VenteContrat, p: Parametres, extra: Parameters<typeof construireContratPdf>[2]) {
  const pdf = construireContratPdf(v, p, extra);
  pdf.save(`contrat-${(extra.numero || v.garage_nom).replace(/[^a-z0-9-]+/gi, "_")}.pdf`);
}
