/* ====================================================================
 *  DOCUMENTS DU CONTRÔLE DU DEVIS (mode expert, v13.23) — jsPDF, A4.
 *
 *  · Courrier au garage : demande de mise en conformité (écarts refusés,
 *    motifs, modifications acceptées, montant HT attendu).
 *  · Note de contrôle : tous les écarts avec la décision de l'expert,
 *    totaux pré-rapport / devis / retenu.
 *  · Chiffrage définitif : les SEULES lignes à reporter dans le logiciel
 *    de l'expert, puis le chiffrage retenu complet.
 *
 *  Fond blanc, encadrés à bordure noire (charte des documents imprimés).
 * ==================================================================== */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Cabinet, DossierExpert, ProfilExpert, nomExpert } from "./types";
import { codeImprime, montantOperation, montantPoste } from "./chiffrage";
import { dataUrl, signatureDataUrl } from "./rapportPdf";
import {
  Controle, LIBELLE_CONCLUSION, LIBELLE_DECISION, LIBELLE_NATURE_CONTROLE, appliquerControle, lignesARessaisir, resumer,
} from "./controle";

const M = 14;
const L = 210 - 2 * M;
const NOIR = [0, 0, 0] as const;
const GRIS_TEXTE = [90, 90, 90] as const;

export type CtxControlePdf = { dossier: DossierExpert; cabinet: Cabinet | null; expert: ProfilExpert | null; controle: Controle };

const txt = (s: string | number | null | undefined) => String(s ?? "").replace(/[    ]/g, " ").replace(/…/g, "...").replace(/→/g, "->").replace(/−/g, "-");
const eur = (n: number) => {
  const [i, d] = Math.abs(Number(n) || 0).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${d} €`;
};
const signe = (n: number) => (n > 0 ? "+" : "") + eur(n);
const dateFr = (d: Date = new Date()) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const derniereY = (pdf: jsPDF) => (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

const STYLE_TABLE = {
  theme: "grid" as const,
  styles: { font: "helvetica", fontSize: 8, cellPadding: 1.4, lineColor: [0, 0, 0] as [number, number, number], lineWidth: 0.15, textColor: [0, 0, 0] as [number, number, number], valign: "middle" as const },
  headStyles: { fillColor: [255, 255, 255] as [number, number, number], textColor: [0, 0, 0] as [number, number, number], fontStyle: "bold" as const, lineWidth: 0.3 },
  margin: { left: M, right: M, top: 20, bottom: 22 },
};

/** Logo + coordonnées du cabinet + titre encadré. Renvoie le y suivant. */
async function entete(pdf: jsPDF, c: CtxControlePdf, titre: string, sousTitre?: string): Promise<number> {
  const logo = await dataUrl("/alliance/logo.png");
  if (logo) pdf.addImage(logo, "PNG", M, 10, 36, 11.3);
  else { pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.text(txt(c.cabinet?.nom || "Alliance Experts"), M, 17); }
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.8);
  pdf.setTextColor(...NOIR);
  const cab = c.cabinet;
  [cab?.nom, cab?.adresse, [cab?.code_postal, cab?.ville].filter(Boolean).join(" "), [cab?.tel, cab?.email].filter(Boolean).join(" · ")]
    .filter((x) => x && String(x).trim())
    .forEach((l, i) => pdf.text(txt(l as string), M, 26 + i * 3.6));

  // Titre encadré (bordure noire, fond blanc)
  const bx = 112, bw = 210 - M - bx;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  const lignesTitre: string[] = pdf.splitTextToSize(txt(titre), bw - 6);
  const hTitre = 7 + lignesTitre.length * 4.4 + (sousTitre ? 4.5 : 0);
  pdf.setDrawColor(...NOIR);
  pdf.setLineWidth(0.5);
  pdf.rect(bx, 10, bw, hTitre);
  pdf.text(lignesTitre, bx + bw / 2, 15.5, { align: "center" });
  if (sousTitre) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(txt(sousTitre), bx + bw / 2, 15.5 + lignesTitre.length * 4.4 + 1.2, { align: "center" });
  }
  return Math.max(44, 10 + hTitre + 8);
}

/** Cartouche « Dossier » encadré. */
function cartouche(pdf: jsPDF, c: CtxControlePdf, y: number): number {
  const d = c.dossier;
  const ctl = c.controle;
  const lignes: [string, string][] = [
    ["Dossier", `${d.numero}${ctl.tour > 1 ? ` — contrôle tour ${ctl.tour}` : ""}`],
    ["Véhicule", [d.immatriculation, [d.marque, d.modele].filter(Boolean).join(" ")].filter(Boolean).join(" — ")],
    ["Sinistre", [d.numero_sinistre, d.mandant_nom].filter(Boolean).join(" — ")],
    ["Lésé / assuré", d.lese_nom || d.assure_nom || ""],
    ["Réparateur", d.reparateur_nom || ""],
    ["Pré-rapport", ctl.reference?.nom || ""],
    ["Devis contrôlé", [ctl.devis?.nom, ctl.devis?.numero && !String(ctl.devis?.nom || "").includes(ctl.devis.numero) ? `n° ${ctl.devis.numero}` : null].filter(Boolean).join(" — ")],
  ].filter(([, v]) => v) as [string, string][];
  const h = 4 + lignes.length * 4.1;
  pdf.setDrawColor(...NOIR);
  pdf.setLineWidth(0.3);
  pdf.rect(M, y, L, h);
  pdf.setFontSize(8);
  lignes.forEach(([k, v], i) => {
    pdf.setFont("helvetica", "bold");
    pdf.text(txt(k), M + 3, y + 5 + i * 4.1);
    pdf.setFont("helvetica", "normal");
    pdf.text(txt(v).slice(0, 110), M + 32, y + 5 + i * 4.1);
  });
  return y + h + 6;
}

/** Quatre totaux encadrés côte à côte. */
function totaux(pdf: jsPDF, c: CtxControlePdf, y: number): number {
  const r = resumer(c.controle);
  const cases: [string, string][] = [
    ["Pré-rapport HT", eur(r.totalReference)],
    ["Devis du garage HT", eur(r.totalDevis)],
    ["Retenu par l'expert HT", eur(r.totalRetenu)],
    ["Non retenu (devis − retenu)", eur(r.economie)],
  ];
  const w = (L - 3 * 3) / 4;
  cases.forEach(([k, v], i) => {
    const x = M + i * (w + 3);
    pdf.setDrawColor(...NOIR);
    pdf.setLineWidth(i === 2 ? 0.7 : 0.3);
    pdf.rect(x, y, w, 14);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.text(txt(k), x + w / 2, y + 4.8, { align: "center" });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.text(txt(v), x + w / 2, y + 11, { align: "center" });
  });
  return y + 20;
}

function paragraphe(pdf: jsPDF, texte: string, y: number, opts: { gras?: boolean; taille?: number } = {}): number {
  pdf.setFont("helvetica", opts.gras ? "bold" : "normal");
  pdf.setFontSize(opts.taille ?? 9);
  const lignes = pdf.splitTextToSize(txt(texte), L);
  if (y + lignes.length * 4.3 > 272) { pdf.addPage(); y = 20; }
  pdf.text(lignes, M, y);
  return y + lignes.length * 4.3 + 2;
}

function titreSection(pdf: jsPDF, titre: string, y: number): number {
  if (y > 255) { pdf.addPage(); y = 20; }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text(txt(titre), M, y);
  pdf.setLineWidth(0.4);
  pdf.line(M, y + 1.4, M + L, y + 1.4);
  return y + 5;
}

async function signatureExpert(pdf: jsPDF, c: CtxControlePdf, y: number): Promise<number> {
  const sig = await signatureDataUrl(c.expert?.signature_path || c.cabinet?.signature_path);
  if (y + (sig ? 30 : 12) > 278) { pdf.addPage(); y = 20; }
  const nom = nomExpert(c.expert) || c.cabinet?.expert_nom || "";
  const x = 210 - M - 70;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(txt(`Fait le ${dateFr()}${c.cabinet?.ville ? `, à ${c.cabinet.ville}` : ""}`), x, y);
  pdf.setFont("helvetica", "bold");
  pdf.text(txt(nom || "L'expert"), x, y + 5);
  const num = c.expert?.numero_agrement || c.cabinet?.expert_numero;
  if (num) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.text(txt(`N° d'identification : ${num}`), x, y + 9); }
  if (sig) { try { pdf.addImage(sig, "PNG", x, y + 11, 40, 16); } catch { /* signature illisible : ignorée */ } }
  return y + 30;
}

function pieds(pdf: jsPDF, mention: string) {
  const n = pdf.getNumberOfPages();
  for (let p = 1; p <= n; p += 1) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...GRIS_TEXTE);
    pdf.text(txt(mention), M, 289);
    pdf.text(`Page ${p}/${n}`, 210 - M, 289, { align: "right" });
    pdf.setTextColor(...NOIR);
  }
}

/* ------------------------ Courrier au garage ------------------------- */

export async function pdfCourrierGarage(c: CtxControlePdf): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const d = c.dossier;
  const ctl = c.controle;
  let y = await entete(pdf, c, "DEMANDE DE MISE EN CONFORMITÉ DU DEVIS", `Dossier ${d.numero}`);

  // Destinataire (à droite, comme un courrier)
  const dest = [d.reparateur_nom, ...(d.reparateur_adresse || "").split(/\n|, /)].filter((x) => x && x.trim()) as string[];
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  dest.forEach((l, i) => { pdf.setFont("helvetica", i === 0 ? "bold" : "normal"); pdf.text(txt(l), 118, y + i * 4.4); });
  y += Math.max(dest.length, 1) * 4.4 + 6;
  pdf.setFont("helvetica", "normal");
  pdf.text(txt(`Le ${dateFr()}`), 118, y);
  y += 8;

  y = cartouche(pdf, c, y);
  const r = resumer(ctl);
  const refuses = ctl.ecarts.filter((e) => e.decision === "refuse");
  const acceptes = ctl.ecarts.filter((e) => e.decision === "accepte");

  y = paragraphe(pdf, "Madame, Monsieur,", y);
  y = paragraphe(pdf, `Après examen de votre devis${ctl.devis?.nom ? ` « ${ctl.devis.nom} »` : ""} au regard de notre pré-rapport, nous ne pouvons pas le valider en l'état. Nous vous remercions de bien vouloir le mettre en conformité sur ${refuses.length === 1 ? "le point suivant" : `les ${refuses.length} points suivants`} :`, y + 1);

  autoTable(pdf, {
    ...STYLE_TABLE,
    startY: y,
    head: [["#", "Poste / opération", "Votre devis", "Retenu par l'expert", "Motif"]],
    body: refuses.map((e, i) => [String(i + 1), txt(`${e.libelle}${e.precision ? `\n(${e.precision})` : ""}`), txt(e.apres || "ligne absente"), txt(e.avant || "ligne non retenue"), txt(e.motif || "")]),
    columnStyles: { 0: { cellWidth: 7, halign: "center" }, 1: { cellWidth: 52 }, 2: { cellWidth: 36 }, 3: { cellWidth: 36, fontStyle: "bold" } },
  });
  y = derniereY(pdf) + 6;

  if (acceptes.length) {
    y = titreSection(pdf, `Modifications de votre devis acceptées (${acceptes.length})`, y);
    autoTable(pdf, {
      ...STYLE_TABLE,
      startY: y,
      head: [["Poste / opération", "Valeur acceptée", "Écart HT"]],
      body: acceptes.map((e) => [txt(e.libelle), txt(e.apres || "ligne retirée"), txt(signe(e.montant_apres - e.montant_avant))]),
      columnStyles: { 0: { cellWidth: 80 }, 2: { cellWidth: 28, halign: "right" } },
    });
    y = derniereY(pdf) + 6;
  }

  // Montant attendu encadré
  if (y > 250) { pdf.addPage(); y = 20; }
  pdf.setLineWidth(0.7);
  pdf.rect(M, y, L, 11);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(txt(`Montant HT attendu après mise en conformité : ${eur(r.totalRetenu)}`), M + L / 2, y + 7.2, { align: "center" });
  y += 17;

  if (ctl.commentaire) y = paragraphe(pdf, ctl.commentaire, y);
  y = paragraphe(pdf, "Dans l'attente de votre devis rectifié, que nous contrôlerons à réception, nous restons à votre disposition. Nous vous prions d'agréer, Madame, Monsieur, nos salutations distinguées.", y + 1);
  await signatureExpert(pdf, c, y + 4);
  pieds(pdf, `${c.cabinet?.nom || "Alliance Experts"} — Toute modification du devis doit être validée par l'expert avant travaux.`);
  pdf.setProperties({ title: `Demande de mise en conformité — ${d.numero}`, author: c.cabinet?.nom || "Alliance Experts" });
  return pdf;
}

/* --------------------------- Note de contrôle ------------------------- */

export async function pdfNoteControle(c: CtxControlePdf): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const ctl = c.controle;
  let y = await entete(pdf, c, "NOTE DE CONTRÔLE DU DEVIS", ctl.conclusion ? LIBELLE_CONCLUSION[ctl.conclusion] : "Contrôle en cours");
  y = cartouche(pdf, c, y);
  y = totaux(pdf, c, y);

  const r = resumer(ctl);
  y = titreSection(pdf, `Écarts relevés entre le devis et le pré-rapport : ${r.total} (${r.acceptes} accepté(s), ${r.refuses} refusé(s)${r.aTrancher ? `, ${r.aTrancher} à trancher` : ""})`, y);
  autoTable(pdf, {
    ...STYLE_TABLE,
    startY: y,
    styles: { ...STYLE_TABLE.styles, fontSize: 7.3 },
    head: [["Écart", "Poste / opération", "Pré-rapport", "Devis", "Écart HT", "Décision", "Motif"]],
    body: ctl.ecarts.length
      ? ctl.ecarts.map((e) => [txt(LIBELLE_NATURE_CONTROLE[e.nature]), txt(`${e.libelle}${e.precision ? `\n(${e.precision})` : ""}`), txt(e.avant || "—"), txt(e.apres || "—"), txt(signe(e.montant_apres - e.montant_avant)), txt(LIBELLE_DECISION[e.decision]), txt(e.motif || "")])
      : [["", "Aucun écart : le devis est conforme au pré-rapport.", "", "", "", "", ""]],
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 40 }, 2: { cellWidth: 26 }, 3: { cellWidth: 26 }, 4: { cellWidth: 18, halign: "right" }, 5: { cellWidth: 16, fontStyle: "bold" } },
  });
  y = derniereY(pdf) + 6;

  if (ctl.commentaire) {
    y = titreSection(pdf, "Commentaire de l'expert", y);
    y = paragraphe(pdf, ctl.commentaire, y + 1);
  }
  if (ctl.conclusion) {
    y = titreSection(pdf, "Conclusion", y + 2);
    y = paragraphe(pdf, `${LIBELLE_CONCLUSION[ctl.conclusion]}${ctl.cloture_le ? ` le ${dateFr(new Date(ctl.cloture_le))}` : ""}. Montant HT retenu : ${eur(r.totalRetenu)}.`, y + 1, { gras: true });
  }
  await signatureExpert(pdf, c, y + 6);
  pieds(pdf, `${c.cabinet?.nom || "Alliance Experts"} — Note de contrôle du devis, dossier ${c.dossier.numero}`);
  pdf.setProperties({ title: `Note de contrôle du devis — ${c.dossier.numero}`, author: c.cabinet?.nom || "Alliance Experts" });
  return pdf;
}

/* ------------------------- Chiffrage définitif ------------------------ */

export async function pdfChiffrageDefinitif(c: CtxControlePdf): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const ctl = c.controle;
  let y = await entete(pdf, c, "CHIFFRAGE DÉFINITIF", "Lignes à reporter dans votre logiciel d'expertise");
  y = cartouche(pdf, c, y);
  y = totaux(pdf, c, y);

  const aReporter = lignesARessaisir(ctl.ecarts);
  y = titreSection(pdf, aReporter.length ? `1. Modifications à reporter sur le pré-rapport (${aReporter.length})` : "1. Aucune modification : le pré-rapport reste inchangé", y);
  if (aReporter.length) {
    autoTable(pdf, {
      ...STYLE_TABLE,
      startY: y,
      head: [["Action", "Poste / opération", "Pré-rapport", "Nouvelle valeur", "Écart HT"]],
      body: aReporter.map((l) => [l.action, txt(l.libelle), txt(l.avant || "—"), txt(l.valeur || "à retirer"), txt(signe(l.delta))]),
      columnStyles: { 0: { cellWidth: 20, fontStyle: "bold" }, 1: { cellWidth: 54 }, 3: { fontStyle: "bold" }, 4: { cellWidth: 24, halign: "right" } },
    });
    y = derniereY(pdf) + 7;
  } else y += 3;

  const retenu = ctl.resultat || (ctl.reference ? appliquerControle(ctl.reference, ctl.ecarts) : { chocs: [], operations: [] });
  y = titreSection(pdf, "2. Chiffrage retenu complet — main-d'œuvre", y);
  const postes = retenu.chocs.flatMap((ch) => ch.postes.filter((p) => Number(p.heures) > 0 || Number(p.forfait) > 0).map((p) => [
    txt(ch.libelle || `Choc ${ch.numero}`), txt(p.poste), p.forfait ? "forfait" : String(p.heures).replace(".", ","), p.forfait ? "" : eur(p.taux), p.remise ? `${p.remise} %` : "", eur(montantPoste(p)),
  ]));
  autoTable(pdf, {
    ...STYLE_TABLE,
    startY: y,
    head: [["Choc", "Poste", "Heures", "Taux", "Remise", "Montant HT"]],
    body: postes.length ? postes : [["", "Aucun poste", "", "", "", ""]],
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } },
  });
  y = derniereY(pdf) + 7;

  y = titreSection(pdf, "3. Chiffrage retenu complet — opérations et pièces", y);
  autoTable(pdf, {
    ...STYLE_TABLE,
    startY: y,
    head: [["Op.", "Désignation", "Qté", "Prix unit. HT", "Remise", "Montant HT"]],
    body: retenu.operations.length ? retenu.operations.map((o) => [codeImprime(o), txt(`${o.designation}${o.qualite === "reemploi" ? " (R)" : o.qualite === "equivalente" ? " (Q)" : o.qualite === "origine" ? " (O)" : ""}`), o.qte ? String(o.qte).replace(".", ",") : "", o.prix_unit ? eur(o.prix_unit) : "", Number(o.remise) ? `${o.remise} %` : "", o.prix_unit ? eur(montantOperation(o)) : ""]) : [["", "Aucune opération", "", "", "", ""]],
    columnStyles: { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: 78 }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } },
  });
  y = derniereY(pdf) + 6;
  pieds(pdf, `${c.cabinet?.nom || "Alliance Experts"} — Chiffrage définitif après contrôle du devis, dossier ${c.dossier.numero}`);
  pdf.setProperties({ title: `Chiffrage définitif — ${c.dossier.numero}`, author: c.cabinet?.nom || "Alliance Experts" });
  return pdf;
}

/* ------------------------------ Sorties ------------------------------ */

export function ouvrirPdf(pdf: jsPDF) {
  const url = URL.createObjectURL(pdf.output("blob"));
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function nomFichier(type: "courrier" | "note" | "chiffrage", c: CtxControlePdf): string {
  const base = { courrier: "Demande-conformite", note: "Note-controle-devis", chiffrage: "Chiffrage-definitif" }[type];
  return `${base}-${c.dossier.numero}${c.controle.tour > 1 ? `-tour${c.controle.tour}` : ""}.pdf`;
}
