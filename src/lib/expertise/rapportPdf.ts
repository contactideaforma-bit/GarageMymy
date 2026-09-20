/* ====================================================================
 *  PROCÈS-VERBAL D'EXPERTISE — PDF conforme au modèle Alliance Experts
 *  (mode expert, v13.5). jsPDF + autotable, A4 portrait.
 *
 *  Page 1 : en-tête (logo, cabinet, cartouche gris N° rapport / dates /
 *  sinistre / assuré / véhicule, silhouette), titre, Mandant / Lésé /
 *  Réparateur, Véhicule, Dommage, Expertise, Conclusions | Chiffrage,
 *  Expert + signature. Page 2+ : Détail choc, Opérations effectuées,
 *  légende. Pied : mentions + pagination.
 * ==================================================================== */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Cabinet, DossierExpert, ProfilExpert, RapportExpert, nomExpert } from "./types";
import { LEGENDE_DETAIL, LEGENDE_OPERATIONS, codeImprime, montantOperation, montantPoste, synthese } from "./chiffrage";
import { supabase } from "@/lib/supabaseClient";
import { POSITION_ZONE, zonesDeChoc } from "./zonesChoc";

const GRIS = [242, 242, 242] as const;
const GRIS_BARRE = [230, 230, 230] as const;
const NOIR = [0, 0, 0] as const;
const M = 12.7; // marge gauche/droite (mm)
const LARGEUR = 210 - 2 * M;

/** « 4.000,00 € » (cartouche chiffrage du modèle). */
function eurosPoint(n: number): string {
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d} €`;
}
/** « 1375.00 » (tableaux du modèle). */
const dec = (n: number) => (Number(n) || 0).toFixed(2);
const dateFr = (s: string | null | undefined) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR");
};
const txt = (s: string | number | null | undefined) =>
  String(s ?? "").replace(/[    ]/g, " ").replace(/…/g, "...");

async function dataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function signatureDataUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const { data } = await supabase.storage.from("pieces").download(path);
    if (!data) return null;
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(data);
    });
  } catch {
    return null;
  }
}

type Ctx = { pdf: jsPDF; logo: string | null; voiture: string | null; cab: Cabinet | null; expert: ProfilExpert | null; d: DossierExpert; r: RapportExpert };

function barre(pdf: jsPDF, x: number, y: number, w: number, titre: string, h = 4.6) {
  pdf.setFillColor(...GRIS_BARRE);
  pdf.rect(x, y, w, h, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...NOIR);
  pdf.text(txt(titre), x + 1.5, y + 3.3);
}

function ligneLabel(pdf: jsPDF, x: number, y: number, label: string, valeur: string, largeurLabel: number, gras = false) {
  pdf.setFont("helvetica", gras ? "bold" : "normal");
  pdf.setFontSize(7.6);
  pdf.text(txt(label), x, y);
  pdf.text(":", x + largeurLabel, y);
  pdf.setFont("helvetica", gras ? "bold" : "normal");
  pdf.text(txt(valeur), x + largeurLabel + 2, y);
}

function enTete(c: Ctx) {
  const { pdf, d, r, cab } = c;
  // Logo + coordonnées du cabinet
  if (c.logo) pdf.addImage(c.logo, "PNG", M, 7.5, 33, 10.4);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.6);
  pdf.setTextColor(...NOIR);
  const coords = [cab?.adresse, [cab?.code_postal, cab?.ville].filter(Boolean).join(" "), cab?.tel, cab?.email].filter(Boolean) as string[];
  coords.forEach((l, i) => pdf.text(txt(l), M, 22.5 + i * 3.4));

  // Cartouche gris
  const bx = 82.5, by = 12.2, bw = 71, bh = 31.7;
  pdf.setFillColor(...GRIS);
  pdf.rect(bx, by, bw, bh, "F");
  const lignes: [string, string, boolean][] = [
    ["N° de rapport", r.numero, true],
    ["Date de rapport", dateFr(r.date_rapport), false],
    ["Nom société", d.mandant_nom || "", false],
    ["N° de sinistre", [d.numero_sinistre, d.date_sinistre ? `du ${dateFr(d.date_sinistre)}` : ""].filter(Boolean).join(" "), false],
    ["Date de mission", dateFr(d.date_mission), false],
    ["N° de police", d.numero_police || "", false],
    ["Nom assuré", d.assure_nom || "", true],
    ["Véhicule", d.immatriculation || "", true],
  ];
  lignes.forEach(([l, v, g], i) => ligneLabel(pdf, bx + 2.5, by + 4.2 + i * 3.6, l, v, 21, g));

  // Silhouette du véhicule + croix sur les zones de choc (v13.11)
  pdf.setFillColor(...GRIS);
  pdf.rect(164.6, 11.4, 24.5, 33, "F");
  const sx = 168.5, sy = 13, sw = 16.5, sh = 30;
  if (c.voiture) pdf.addImage(c.voiture, "PNG", sx, sy, sw, sh);
  const zones = zonesDeChoc(r.chocs || [], r.operations || []);
  if (zones.length) {
    pdf.setDrawColor(220, 38, 38);
    pdf.setLineWidth(0.55);
    const b = 1.4; // demi-branche de la croix (mm)
    for (const z of zones) {
      const [fx, fy] = POSITION_ZONE[z];
      const x = sx + fx * sw;
      const y = sy + fy * sh;
      pdf.line(x - b, y - b, x + b, y + b);
      pdf.line(x - b, y + b, x + b, y - b);
    }
    pdf.setDrawColor(...NOIR);
    pdf.setLineWidth(0.2);
  }
}

function pied(pdf: jsPDF, page: number, total: number) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...NOIR);
  pdf.text(`Page ${page}/${total}`, 210 - M, 280.5, { align: "right" });
  pdf.setFontSize(5.6);
  pdf.setTextColor(120, 120, 120);
  pdf.text("Ce document ne peut être considéré comme un ordre de réparation.", M, 287);
  pdf.text("Toute modification de cette estimation ne sera prise en compte que si l'expert en a été préalablement informé.", M, 290);
  pdf.setTextColor(...NOIR);
}

function page1(c: Ctx, signature: string | null) {
  const { pdf, d, r, cab, expert } = c;
  // v13.7 : le PV est signé au nom de l'expert CONNECTÉ (profil expert), à
  // défaut au nom de l'expert du cabinet.
  const expertNom = nomExpert(expert) || cab?.expert_nom || "";
  const expertNumero = expert?.numero_agrement || cab?.expert_numero || "";
  enTete(c);
  const reparable = d.vehicule_reparable !== false;

  // Titre
  pdf.setFillColor(...GRIS);
  pdf.rect(66.5, 52, 70, 10.2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.text("PROCÈS VERBAL D'EXPERTISE", 101.5, 56.3, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(reparable ? "Véhicule réparable" : "Véhicule économiquement irréparable", 101.5, 60.6, { align: "center" });

  // Mandant / Lésé / Réparateur
  const colW = LARGEUR / 3;
  const y0 = 62.2;
  barre(pdf, M, y0, colW - 1, "Mandant :");
  barre(pdf, M + colW, y0, colW - 1, "Lésé :");
  barre(pdf, M + 2 * colW, y0, colW, "Réparateur :");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.6);
  const ecrireBloc = (x: number, lignes: string[]) => lignes.filter(Boolean).forEach((l, i) => pdf.text(txt(l), x + 1.5, y0 + 8 + i * 3.4));
  ecrireBloc(M, [d.mandant_nom || "", ...(d.mandant_adresse || "").split("\n"), d.mandant_email || ""]);
  ecrireBloc(M + colW, [d.lese_nom || "", ...(d.lese_adresse || "").split("\n"), d.lese_email || "", d.lese_tel || ""]);
  ecrireBloc(M + 2 * colW, [d.reparateur_nom || "", ...(d.reparateur_adresse || "").split("\n"), d.reparateur_siret ? `Siret : ${d.reparateur_siret}` : ""]);

  // Véhicule
  const yv = 87.6;
  pdf.setFillColor(...GRIS_BARRE);
  pdf.rect(M, yv, LARGEUR, 4.6, "F");
  pdf.setFontSize(8.5);
  const enteteVeh = (x: number, l: string, v: string) => {
    pdf.setFont("helvetica", "bold");
    pdf.text(txt(`${l} : `), x + 1.5, yv + 3.3);
    const w = pdf.getTextWidth(txt(`${l} : `));
    pdf.setFont("helvetica", "bold");
    pdf.text(txt(v), x + 1.5 + w, yv + 3.3);
  };
  pdf.setFont("helvetica", "normal");
  enteteVeh(M, "Véhicule", d.immatriculation || "");
  pdf.setFont("helvetica", "normal");
  pdf.text("Marque : ", M + colW + 1.5, yv + 3.3);
  pdf.setFont("helvetica", "bold");
  pdf.text(txt(d.marque || ""), M + colW + 1.5 + pdf.getTextWidth("Marque : "), yv + 3.3);
  pdf.setFont("helvetica", "normal");
  pdf.text("Modèle : ", M + 2 * colW + 1.5, yv + 3.3);
  pdf.setFont("helvetica", "bold");
  pdf.text(txt(d.modele || ""), M + 2 * colW + 1.5 + pdf.getTextWidth("Modèle : "), yv + 3.3);

  const col1: [string, string][] = [
    ["Finition", d.finition || ""],
    ["N° de série", d.vin || ""],
    ["Date MEC", dateFr(d.date_mec)],
    ["Date du certificat", dateFr(d.date_certificat)],
    ["Date validité CT", dateFr(d.validite_ct)],
  ];
  const col2: [string, string][] = [
    ["Genre", d.genre || ""],
    ["Type", d.type_mine || ""],
    ["N° de formule", d.numero_formule || ""],
    ["Kilométrage relevé", d.kilometrage ? String(d.kilometrage) : ""],
    ["Etat général", d.etat_general || ""],
  ];
  const col3: [string, string][] = [
    ["Carrosserie", d.carrosserie || ""],
    ["Energie", d.energie || ""],
    ["Nombre de places", d.places ? String(d.places) : ""],
    ["Couleur", d.couleur || ""],
    ["Usure pneumatiques", ""],
  ];
  pdf.setFontSize(7.6);
  const ecrireCol = (x: number, lignes: [string, string][], lw: number) => {
    let y = yv + 8.2;
    for (const [l, v] of lignes) {
      pdf.setFont("helvetica", "normal");
      pdf.text(txt(l), x + 1.5, y);
      pdf.text(":", x + 1.5 + lw, y);
      const wrap = pdf.splitTextToSize(txt(v), colW - lw - 6);
      pdf.text(wrap, x + 1.5 + lw + 2, y);
      y += 3.4 * Math.max(1, wrap.length) + (wrap.length > 1 ? 0.6 : 0);
    }
    return y;
  };
  ecrireCol(M, col1, 27);
  ecrireCol(M + colW, col2, 27);
  const yp = ecrireCol(M + 2 * colW, col3, 27);
  pdf.text(txt(`AVG : ${d.pneu_avg || "-"}`), M + 2 * colW + 5, yp);
  pdf.text(txt(`AVD : ${d.pneu_avd || "-"}`), M + 2 * colW + 32, yp);
  pdf.text(txt(`ARG : ${d.pneu_arg || "-"}`), M + 2 * colW + 5, yp + 3.4);
  pdf.text(txt(`ARD : ${d.pneu_ard || "-"}`), M + 2 * colW + 32, yp + 3.4);

  // Dommage — la description peut être longue : le reste de la page se
  // décale d'autant (v13.11, plus de chevauchement), dans la limite de 6
  // lignes (au-delà, la description est coupée avec « … »).
  const yd = Math.max(133, yp + 8);
  barre(pdf, M, yd, LARGEUR, `Dommage : ${d.dommage_type || ""}`);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.6);
  const imput = `Dommage imputable : ${[d.dommage_imputable, d.dommage_intensite].filter(Boolean).join(", ")}${d.dommage_intensite ? "," : ""}`;
  pdf.text(txt(imput), M + 2.5, yd + 8);
  let hDesc = 0;
  if (d.dommage_description) {
    const MAX_LIGNES = 6;
    let lignes: string[] = pdf.splitTextToSize(txt(d.dommage_description), LARGEUR - 5);
    if (lignes.length > MAX_LIGNES) {
      lignes = lignes.slice(0, MAX_LIGNES);
      lignes[MAX_LIGNES - 1] = lignes[MAX_LIGNES - 1].replace(/\s*\S*$/, "") + " …";
    }
    pdf.text(lignes, M + 2.5, yd + 11.6);
    hDesc = lignes.length * 3.2;
  }

  // Expertise
  const ye = yd + 12 + Math.max(0, hDesc - 3.2) + 2.4;
  barre(pdf, M, ye, LARGEUR, `Expertise : ${reparable ? "Véhicule réparable" : "Véhicule économiquement irréparable"}`);
  pdf.setFont("helvetica", "normal");
  pdf.text(txt(d.lieu_expertise || ""), M + 2.5, ye + 8);
  pdf.text(dateFr(d.date_visite || d.date_mission), M + 62, ye + 8);
  pdf.text(txt(d.type_expertise || ""), M + 90, ye + 8);

  // Conclusions | Chiffrage
  const yc = ye + 12.5;
  const wConc = 90;
  const xChif = M + wConc + 2.5;
  const wChif = LARGEUR - wConc - 2.5;
  barre(pdf, M, yc, wConc, "Conclusions :");
  barre(pdf, xChif, yc, wChif, "Chiffrage :");
  const cc = d.conclusions || {};
  const oui = (v: boolean | null | undefined) => (v === true ? "Oui" : v === false ? "Non" : "");
  const conclusions: [string, string, boolean][] = [
    ["TVA récupérable :", oui(cc.tva_recuperable ?? false), false],
    ["Durée tech. d'immobilisation :", cc.immobilisation_jours ? `${String(cc.immobilisation_jours).replace(".", ".")} jours` : "", false],
    ["Réparabilité technique", cc.reparabilite_technique || "", false],
    ["Réparabilité économique :", cc.reparabilite_economique || "", false],
    ["Procédure VGE :", cc.procedure_vge || "", false],
    ["Accord réparateur :", oui(cc.accord_reparateur), false],
    ["Accord assuré :", oui(cc.accord_assure), false],
    ["Facture réparateur", cc.facture_reparateur || "", true],
    ["", "", false],
    ["Règlement direct accordé", oui(cc.reglement_direct ?? false), false],
    ["Montant à charge de la compagnie", cc.montant_compagnie !== null && cc.montant_compagnie !== undefined ? eurosPoint(Number(cc.montant_compagnie)) : "", false],
    ["d'assurance", "", false],
  ];
  pdf.setFontSize(7.6);
  conclusions.forEach(([l, v, g], i) => {
    pdf.setFont("helvetica", g ? "bold" : "normal");
    pdf.text(txt(l), M + 2.5, yc + 8 + i * 3.9);
    pdf.setFont("helvetica", "normal");
    pdf.text(txt(v), M + 2.5 + 47, yc + 8 + i * 3.9);
  });
  if (cc.observations) {
    pdf.setFontSize(7.2);
    pdf.text(pdf.splitTextToSize(txt(cc.observations), wConc - 5), M + 2.5, yc + 8 + conclusions.length * 3.9 + 1);
  }

  const s = synthese(r);
  const taux = (r.taux_tva ?? 20) / 100;
  const lignesChif: [string, number | null][] = [
    ["Poste", null],
    ["Forfaits", s.forfaits],
    ["Ingr. + Peinture", s.peinture],
    ["Main d'œuvre globale", s.mo],
    ["Pièces de rechange", s.pieces],
    ["Fournitures", s.fournitures],
    ["Remise", -s.remise],
    ["Total vétusté", -s.vetuste],
    ["TOTAL Réparations", s.ht],
    ["TOTAL SRGC", s.srgc],
  ];
  const xPoste = xChif + 2;
  const xHT = xChif + wChif * 0.53;
  const xTVA = xChif + wChif * 0.75;
  const xTTC = xChif + wChif - 1.5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.6);
  pdf.text("Poste", xPoste, yc + 8);
  pdf.text("Montant HT €", xHT, yc + 8, { align: "right" });
  pdf.text("TVA €", xTVA, yc + 8, { align: "right" });
  pdf.text("Montant TTC €", xTTC, yc + 8, { align: "right" });
  pdf.setFont("helvetica", "normal");
  lignesChif.slice(1).forEach(([l, m], i) => {
    const y = yc + 12.4 + i * 3.6;
    const ht = m || 0;
    const srgc = l === "TOTAL SRGC";
    const tva = srgc ? 0 : ht * taux;
    pdf.text(txt(l), xPoste, y);
    pdf.text(eurosPoint(ht), xHT, y, { align: "right" });
    pdf.text(eurosPoint(tva), xTVA, y, { align: "right" });
    pdf.text(eurosPoint(ht + tva), xTTC, y, { align: "right" });
  });

  // Expert + signature — sous le bloc Conclusions / Chiffrage, quelle que
  // soit la hauteur prise par le dommage.
  const yx = Math.max(217, yc + 12.4 + (lignesChif.length - 1) * 3.6 + 10);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.text("EXPERT :", M + 1.5, yx);
  pdf.text(txt(expertNom), M + 1.5, yx + 4.2);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.6);
  pdf.text(txt(expertNumero), M + 1.5, yx + 8);
  if (signature) {
    try {
      pdf.addImage(signature, "PNG", M + 4, yx + 12, 36, 14);
    } catch {
      /* image illisible : pas de signature */
    }
  }
}

function pagesDetail(c: Ctx) {
  const { pdf, r } = c;
  const s = synthese(r);
  const taux = (r.taux_tva ?? 20) / 100;
  pdf.addPage();
  enTete(c);
  let y = 56;

  for (const choc of r.chocs || []) {
    barre(pdf, M, y, LARGEUR, `Détail choc : ${choc.numero}${choc.libelle && !/^choc \d+$/i.test(choc.libelle) ? ` — ${choc.libelle}` : ""}`);
    y += 4.6;
    const corps: (string | { content: string; styles?: Record<string, unknown> })[][] = [];
    for (const p of choc.postes || []) {
      const ht = montantPoste(p);
      corps.push([
        txt(p.poste),
        p.forfait ? "" : dec(p.heures),
        p.forfait ? "" : dec(p.taux),
        p.forfait ? "" : dec(p.remise),
        dec(ht),
        dec(ht * taux),
        dec(ht * (1 + taux)),
      ]);
    }
    const pc = s.parChoc.find((x) => x.numero === choc.numero);
    const mo = pc ? pc.total : 0;
    // Les pièces figurent sur le premier choc (comme le modèle).
    const piecesIci = choc.numero === (r.chocs?.[0]?.numero ?? 1) ? s.pieces + s.fournitures : 0;
    const totalChoc = mo + piecesIci;
    corps.push(["Pièces", "", "", "", dec(piecesIci), dec(piecesIci * taux), dec(piecesIci * (1 + taux))]);
    corps.push(["Réparation hors ESGC", "", "", "", dec(totalChoc), dec(totalChoc * taux), dec(totalChoc * (1 + taux))]);
    corps.push(["Réparation avec ESGC", "", "", "", dec(totalChoc), dec(totalChoc * taux), dec(totalChoc * (1 + taux))]);
    autoTable(pdf, {
      startY: y,
      margin: { left: M, right: M, top: 56, bottom: 30 },
      head: [["Poste", "Nb. heures", "Taux hor. €/h", "Remise %", "Montant HT €", "Montant TVA €", "Montant TTC €"]],
      body: corps,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 7.4, cellPadding: 1.1, lineColor: [200, 200, 200], lineWidth: 0.15, textColor: [0, 0, 0] },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", halign: "left" },
      columnStyles: { 0: { cellWidth: 44 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    });
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 1;
  }

  barre(pdf, M, y, LARGEUR, "TOTAL Réparations");
  y += 4.6;
  autoTable(pdf, {
    startY: y,
    margin: { left: M, right: M },
    body: [
      ["Total remise", "", "", "", dec(s.remise), "", ""],
      ["Total vétusté", "", "", "", dec(s.vetuste), "", ""],
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.4, cellPadding: 1.1, lineColor: [200, 200, 200], lineWidth: 0.15, textColor: [0, 0, 0] },
    columnStyles: { 0: { cellWidth: 44 }, 4: { halign: "right" } },
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  pdf.setFillColor(...GRIS_BARRE);
  pdf.rect(M, y, LARGEUR, 4.6, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.text("TOTAL Global", M + 1.5, y + 3.3);
  pdf.setFontSize(7.6);
  pdf.text(dec(s.ht), M + LARGEUR * 0.66, y + 3.3, { align: "right" });
  pdf.text(dec(s.tva), M + LARGEUR * 0.83, y + 3.3, { align: "right" });
  pdf.text(dec(s.ttc), M + LARGEUR - 1.5, y + 3.3, { align: "right" });
  y += 12;

  // Opérations effectuées
  if (y > 200) {
    pdf.addPage();
    enTete(c);
    y = 56;
  }
  barre(pdf, M, y, LARGEUR, "Opérations effectuées");
  y += 4.6;
  const ops = (r.operations || []).map((o) => {
    const mo = o.qte === 0 && o.prix_unit === 0;
    const suffixe = o.qualite === "origine" ? " O" : o.qualite === "equivalente" ? " Q" : o.qualite === "reemploi" ? " R" : "";
    return [
      codeImprime(o) + (o.op === "E" && suffixe ? suffixe : ""),
      txt(o.designation) + (o.reference ? `  [${o.reference}]` : ""),
      mo ? "" : String(o.qte),
      mo ? "" : dec(o.prix_unit),
      dec(montantOperation(o)),
    ];
  });
  autoTable(pdf, {
    startY: y,
    margin: { left: M, right: M, top: 56, bottom: 30 },
    head: [["Op.", "Désignation", "Qté.", "Prix unit. €", "Mont HT €"]],
    body: ops.length ? ops : [["", "Aucune opération", "", "", ""]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.4, cellPadding: 1.1, lineColor: [200, 200, 200], lineWidth: 0.15, textColor: [0, 0, 0] },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", halign: "left" },
    columnStyles: { 0: { cellWidth: 14, halign: "center" }, 1: { cellWidth: 86 }, 2: { cellWidth: 16, halign: "right" }, 3: { cellWidth: 30, halign: "right" }, 4: { halign: "right" } },
    // En-tête répété quand le tableau déborde sur une page suivante.
    didDrawPage: (data) => { if (data.pageNumber > 1) enTete(c); },
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // v13.11 — Écarts entre le devis du réparateur et le pré-rapport, avec la
  // décision de l'expert et son commentaire (rapport définitif).
  const cmp = r.comparaison;
  if (cmp && (cmp.ecarts.length > 0 || cmp.commentaire)) {
    if (y > 230) {
      pdf.addPage();
      enTete(c);
      y = 56;
    }
    barre(pdf, M, y, LARGEUR, `Devis du réparateur${cmp.document_nom ? ` (${cmp.document_nom})` : ""} confronté au pré-rapport v${cmp.base_version} — pré-rapport ${dec(cmp.total_pre_rapport)} € HT · devis ${dec(cmp.total_devis)} € HT`);
    y += 4.6;
    const nature = { ajout: "Ajouté au devis", suppression: "Absent du devis", modification: "Modifié" } as const;
    const corps = cmp.ecarts.map((e) => [
      nature[e.nature],
      txt(e.libelle),
      txt(e.avant || "—"),
      txt(e.apres || "—"),
      dec(e.montant_apres - e.montant_avant),
      e.decision === "accepte" ? "Accepté" : "Refusé",
      txt(e.commentaire || ""),
    ]);
    autoTable(pdf, {
      startY: y,
      margin: { left: M, right: M, top: 56, bottom: 30 },
      head: [["Écart", "Poste / opération", "Pré-rapport", "Devis", "Δ HT €", "Décision", "Commentaire"]],
      body: corps.length ? corps : [["", "Aucun écart : devis conforme au pré-rapport", "", "", "", "", ""]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 6.8, cellPadding: 1, lineColor: [200, 200, 200], lineWidth: 0.15, textColor: [0, 0, 0] },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", halign: "left" },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 46 }, 2: { cellWidth: 28 }, 3: { cellWidth: 28 }, 4: { cellWidth: 16, halign: "right" }, 5: { cellWidth: 16 } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 5) data.cell.styles.fontStyle = "bold";
      },
      didDrawPage: (data) => { if (data.pageNumber > 1) enTete(c); },
    });
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
    if (cmp.commentaire) {
      pdf.setFontSize(7.4);
      pdf.setFont("helvetica", "bold");
      pdf.text("Commentaire de l'expert : ", M + 1.5, y + 3);
      pdf.setFont("helvetica", "normal");
      const lignes = pdf.splitTextToSize(txt(cmp.commentaire), LARGEUR - 3);
      pdf.text(lignes, M + 1.5, y + 6.5);
      y += 6.5 + lignes.length * 3.2;
    }
    y += 5;
  }

  // Légende : en bas de la dernière page du tableau (comme le modèle),
  // sinon sur une page suivante.
  pdf.setFontSize(5.8);
  pdf.setFont("helvetica", "normal");
  const l1 = pdf.splitTextToSize(txt(LEGENDE_OPERATIONS), LARGEUR - 6);
  const l2 = pdf.splitTextToSize(txt(LEGENDE_DETAIL), LARGEUR - 6);
  const h = (l1.length + l2.length) * 2.6 + 6;
  let yl = Math.max(y, 252);
  if (yl + h > 277) {
    pdf.addPage();
    enTete(c);
    yl = 56;
  }
  pdf.setFillColor(...GRIS);
  pdf.rect(M, yl, LARGEUR, h, "F");
  pdf.text(l1, 105, yl + 3.5, { align: "center" });
  pdf.text(l2, 105, yl + 3.5 + l1.length * 2.6 + 1.5, { align: "center" });
}

export async function construireRapportPdf(d: DossierExpert, r: RapportExpert, cab: Cabinet | null, expert: ProfilExpert | null = null): Promise<jsPDF> {
  const [logo, voiture, signature] = await Promise.all([
    dataUrl("/alliance/logo.png"),
    dataUrl("/alliance/vehicule.png"),
    signatureDataUrl(expert?.signature_path || cab?.signature_path),
  ]);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const ctx: Ctx = { pdf, logo, voiture, cab, expert, d, r };
  page1(ctx, signature);
  pagesDetail(ctx);
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    pdf.setPage(p);
    pied(pdf, p, total);
  }
  pdf.setProperties({ title: `Procès-verbal d'expertise ${r.numero}`, author: cab?.nom || "Alliance Experts" });
  return pdf;
}

export async function blobRapportPdf(d: DossierExpert, r: RapportExpert, cab: Cabinet | null, expert: ProfilExpert | null = null): Promise<Blob> {
  return (await construireRapportPdf(d, r, cab, expert)).output("blob");
}

export async function apercuRapportPdf(d: DossierExpert, r: RapportExpert, cab: Cabinet | null, expert: ProfilExpert | null = null): Promise<void> {
  const pdf = await construireRapportPdf(d, r, cab, expert);
  const url = URL.createObjectURL(pdf.output("blob"));
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function telechargerRapportPdf(d: DossierExpert, r: RapportExpert, cab: Cabinet | null, expert: ProfilExpert | null = null): Promise<void> {
  const pdf = await construireRapportPdf(d, r, cab, expert);
  pdf.save(`PV-expertise-${r.numero}${r.version > 1 ? `-v${r.version}` : ""}.pdf`);
}
