// PDF du CONTRAT D'ABONNEMENT GARAGE (v10.0) — généré dans le navigateur
// (page /vente après signature, espace éditeur). Charte « vitrine pro »
// (violet → fuchsia), indépendante du thème rétro de l'appli.

import jsPDF from "jspdf";
import { SOCIETE, ADRESSE_COMPLETE } from "@/components/vitrine/societe";
import { Formule, Parametres, grilleTarifs, tarifFormule } from "./economie";
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
  extra: { numero?: string | null; signature?: string | null; signeLe?: string | null; besoins?: Record<string, unknown> | null; signatureCommercial?: string | null; commercialNom?: string | null }
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
  if (extra.signatureCommercial) {
    pdf.setDrawColor(180);
    pdf.rect(M, yS + 3, 70, 30);
    try {
      pdf.addImage(extra.signatureCommercial, "PNG", M + 2, yS + 5, 66, 26);
    } catch {
      /* image illisible */
    }
    pdf.setFontSize(8.5);
    pdf.setTextColor(90);
    pdf.text([`Apporteur d'affaires : ${extra.commercialNom || ""}`.trim(), "Sous réserve de validation par IDEAFORMA (art. 11)."], M, yS + 39);
  } else {
    pdf.text(["Validation par email de bienvenue", "et création du compte (art. 11)."], M, yS + 8);
  }
  return pdf;
}

/* ====================================================================
   DEVIS D'ABONNEMENT (v10.2) — proposition chiffrée pour un prospect.
==================================================================== */
export function construireDevisPdf(
  v: VenteContrat,
  p: Parametres,
  extra: { numero?: string | null; validiteJours?: number; signature?: string | null; signeLe?: string | null; signatureCommercial?: string | null; commercialNom?: string | null; date?: string | null }
): jsPDF {
  const pdf = new jsPDF();
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 16;
  const c: Ctx = { pdf, y: 0, M, W: pageW - 2 * M, pageH, pageW, page: 1 };
  const t = tarifFormule(v.formule, p);
  const date = new Date(extra.date || Date.now());
  const validite = new Date(date);
  validite.setDate(validite.getDate() + (extra.validiteJours || 30));

  pdf.setFillColor(219, 39, 119);
  pdf.rect(0, 0, pageW, 26, "F");
  pdf.setTextColor(255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("DEVIS D'ABONNEMENT", M, 11);
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text(`${SOCIETE.produit} by ${SOCIETE.editeur}${extra.numero ? ` — n° ${extra.numero}` : ""}`, M, 18);
  pdf.text(`Le ${date.toLocaleDateString("fr-FR")} · valable jusqu'au ${validite.toLocaleDateString("fr-FR")}`, pageW - M, 18, { align: "right" });
  pied(c);
  c.y = 36;

  titre(c, "Pour");
  pdf.setFontSize(9);
  pdf.setTextColor(60);
  pdf.text(
    [v.garage_nom, v.garage_siret ? `SIRET ${v.garage_siret}` : "", [v.garage_adresse, `${v.garage_cp || ""} ${v.garage_ville || ""}`.trim()].filter(Boolean).join(", "), [v.contact_nom, v.contact_email, v.contact_tel].filter(Boolean).join(" · ")].filter(Boolean),
    M,
    c.y
  );
  c.y += 22;

  titre(c, `Formule ${t.libelle}${t.heures ? ` — application + ${t.heures} h de secrétariat par mois` : " — application seule"}`);
  const engage = v.engagement_12 || v.periodicite === "annuel";
  const lignes: [string, string][] = [
    ["Prix catalogue (sans engagement)", `${eurPdf(t.mensuel)} HT / mois`],
    ...(engage ? [["Remise engagement 12 mois", `− ${t.remiseEngagementPct} % → ${eurPdf(t.mensuelEngage)} HT / mois`] as [string, string]] : []),
    ...(Number(v.remise_supp_pct) > 0 ? [["Remise commerciale exceptionnelle (sous validation IDEAFORMA)", `− ${v.remise_supp_pct} %`] as [string, string]] : []),
    v.periodicite === "annuel"
      ? ["Année payée en une fois (12 mois)", `${eurPdf(v.montant_annuel_ht)} HT — ${t.bonusAnnuelLibelle}`]
      : ["Mensualité retenue", `${eurPdf(v.prix_mensuel_ht)} HT / mois`],
    ["Mise en service (paramétrage, import, formation)", engage ? "Offerte" : `${eurPdf(v.mise_en_service_ht ?? p.miseEnService)} HT, une fois`],
    ["Heure de secrétariat hors forfait", `${eurPdf(p.heureHorsForfait)} HT`],
    ["TVA", "en sus, au taux en vigueur"],
    ["Engagement", engage ? "12 mois fermes (CGV art. 2), puis mois par mois" : "Aucun — préavis d'un mois"],
    ["Total sur 12 mois", `${eurPdf(v.periodicite === "annuel" ? v.montant_annuel_ht || 0 : v.prix_mensuel_ht * 12 + (engage ? 0 : p.miseEnService))} HT`],
  ];
  pdf.setDrawColor(220);
  for (const [a, b] of lignes) {
    pdf.setFontSize(9);
    pdf.setTextColor(60);
    pdf.text(a, M, c.y);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30);
    pdf.text(b, pageW - M, c.y, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.line(M, c.y + 2, pageW - M, c.y + 2);
    c.y += 7;
  }
  c.y += 4;
  para(c, "Ce que comprend la formule : dossiers sinistres illimités, lecture des rapports d'expertise, devis et factures conformes au rapport, relances, cession de créance, planning, véhicules de prêt, gardiennage, portail client, assistant MY-MY, sauvegardes, assistance." + (t.heures ? ` Secrétariat externalisé : ${t.heures} h par mois (saisie, envois, relances, appels assurances et experts), heures non consommées reportables à 50 %.` : ""), 9, 70);
  para(c, "Devis établi selon la grille tarifaire en vigueur ; la souscription se fait par la signature du contrat d'abonnement et de ses conditions générales (jointes ou disponibles sur demande). Le contrat n'est définitif qu'après validation par IDEAFORMA.", 8.5, 110);

  if (c.y + 55 > pageH - 20) nouvellePage(c);
  titre(c, "Bon pour accord");
  const yS = c.y;
  pdf.setFontSize(9);
  pdf.setTextColor(30);
  pdf.text(`Pour ${SOCIETE.editeur}${extra.commercialNom ? ` — ${extra.commercialNom}` : ""} :`, M, yS);
  pdf.text("Le client — « bon pour accord » :", pageW / 2 + 4, yS);
  pdf.setDrawColor(180);
  pdf.rect(M, yS + 3, 70, 30);
  pdf.rect(pageW / 2 + 4, yS + 3, 70, 30);
  for (const [img, x] of [[extra.signatureCommercial, M], [extra.signature, pageW / 2 + 4]] as [string | null | undefined, number][]) {
    if (img) {
      try {
        pdf.addImage(img, "PNG", x + 2, yS + 5, 66, 26);
      } catch {
        /* image illisible */
      }
    }
  }
  pdf.setFontSize(8.5);
  pdf.setTextColor(90);
  if (v.signataire_nom || extra.signeLe) pdf.text([v.signataire_nom ? `Nom : ${v.signataire_nom}` : "", extra.signeLe ? `Signé le ${new Date(extra.signeLe).toLocaleString("fr-FR")}` : ""].filter(Boolean), pageW / 2 + 4, yS + 39);
  return pdf;
}

/* ====================================================================
   SIMULATION TARIFAIRE (v10.2) — les 3 façons de payer, pour la formule
   retenue et les autres, sur une page.
==================================================================== */
export function construireSimulationPdf(garageNom: string, formuleRetenue: Formule | null, p: Parametres, extra: { numero?: string | null; commercialNom?: string | null }): jsPDF {
  const pdf = new jsPDF();
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 16;
  const c: Ctx = { pdf, y: 0, M, W: pageW - 2 * M, pageH, pageW, page: 1 };
  pdf.setFillColor(124, 58, 237);
  pdf.rect(0, 0, pageW, 26, "F");
  pdf.setTextColor(255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("SIMULATION TARIFAIRE", M, 11);
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text(`${SOCIETE.produit} by ${SOCIETE.editeur} — pour ${garageNom}${extra.numero ? ` — ${extra.numero}` : ""}`, M, 18);
  pdf.text(new Date().toLocaleDateString("fr-FR"), pageW - M, 18, { align: "right" });
  pied(c);
  c.y = 36;
  para(c, "Prix hors taxes, TVA en sus. Trois façons de souscrire chaque formule : sans engagement, avec engagement de 12 mois (remise), ou en payant l'année en une fois (remise + avantage). La mise en service (paramétrage, import, formation) est offerte dès qu'il y a engagement.", 9, 70);
  for (const t of grilleTarifs(p)) {
    const retenue = t.formule === formuleRetenue;
    if (c.y + 40 > pageH - 20) nouvellePage(c);
    if (retenue) {
      pdf.setFillColor(252, 231, 243);
      pdf.rect(M - 2, c.y - 5, c.W + 4, 36, "F");
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(retenue ? 219 : 124, retenue ? 39 : 58, retenue ? 119 : 237);
    pdf.text(`${t.libelle}${t.heures ? ` — application + ${t.heures} h de secrétariat par mois` : " — application seule"}${retenue ? "   ← formule proposée" : ""}`, M, c.y);
    pdf.setFont("helvetica", "normal");
    c.y += 6;
    const cols = [
      ["Sans engagement", `${eurPdf(t.mensuel)} / mois`, `+ mise en service ${eurPdf(p.miseEnService)}`, `${eurPdf(t.mensuel * 12 + p.miseEnService)} la 1re année`],
      ["Engagement 12 mois", `${eurPdf(t.mensuelEngage)} / mois`, `− ${t.remiseEngagementPct} %, mise en service offerte`, `${eurPdf(t.annuelBase)} sur 12 mois`],
      ["Année en une fois", `${eurPdf(t.annuelUnique)}`, `${t.bonusAnnuelLibelle} en plus`, `économie ${eurPdf(t.economieAnnuel)} vs sans engagement`],
    ];
    const w = c.W / 3;
    cols.forEach((col, i) => {
      const x = M + i * w;
      pdf.setFontSize(8.5);
      pdf.setTextColor(110);
      pdf.text(col[0], x, c.y);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(30);
      pdf.text(col[1], x, c.y + 6);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(90);
      pdf.text(col[2], x, c.y + 11);
      pdf.text(col[3], x, c.y + 15.5);
    });
    c.y += 30;
  }
  para(c, `Heure de secrétariat hors forfait : ${eurPdf(p.heureHorsForfait)} HT. Heures non consommées reportables à 50 % sur le mois suivant. Changement de formule possible à tout moment vers le haut ; vers le bas selon les conditions générales (art. 12).${extra.commercialNom ? ` Votre interlocuteur : ${extra.commercialNom}.` : ""}`, 8.5, 110);
  return pdf;
}

const eurPdf = (n: number | null | undefined) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).replace(/\u202f|\u00a0/g, " ");

export function telechargerContratPdf(v: VenteContrat, p: Parametres, extra: Parameters<typeof construireContratPdf>[2]) {
  const pdf = construireContratPdf(v, p, extra);
  pdf.save(`contrat-${(extra.numero || v.garage_nom).replace(/[^a-z0-9-]+/gi, "_")}.pdf`);
}
