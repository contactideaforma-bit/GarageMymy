// PDF des documents commerciaux (v10.3) — simulation tarifaire, devis et
// contrat d'abonnement — générés dans le navigateur (espace Clients du
// commercial, page /vente, espace éditeur). Mise en page alignée sur les
// documents du pack commercial (docs/pack-commercial/commerciaux) : charte
// « vitrine pro » violet #7C3AED → fuchsia #DB2777, logo et coordonnées de
// l'éditeur en en-tête, tableaux à en-tête violet, texte justifié, pied de
// page avec SIRET / adresse / email et numérotation.

import jsPDF from "jspdf";
import autoTable, { CellDef, RowInput, UserOptions } from "jspdf-autotable";
import { SOCIETE, ADRESSE_COMPLETE } from "@/components/vitrine/societe";
import { Formule, Parametres, grilleTarifs, tarifFormule } from "./economie";
import { ACCEPTATION_CGV, VERSION_CGV, VenteContrat, articlesCGV, conditionsParticulieres } from "./contratGarage";
import { SECTIONS_BESOINS, demandesDe, libelleQuestion, lignesSection, tauxRemplissage } from "@/lib/ficheBesoins";
import type { ContenuContrat } from "./contratCollaborateur";
import { titreContrat } from "./contratCollaborateur";
import type { Prospect } from "@/lib/prospects";

/* ------------------------------------------------------------------ */
/*  Charte                                                             */
/* ------------------------------------------------------------------ */
const VIOLET: [number, number, number] = [124, 58, 237];
const FUCHSIA: [number, number, number] = [219, 39, 119];
const VIOLET_PALE: [number, number, number] = [245, 240, 255];
const FUCHSIA_PALE: [number, number, number] = [253, 235, 244];
const GRIS_LIGNE: [number, number, number] = [226, 226, 235];
const NOIR = 31;
const GRIS = 90;
const GRIS_CLAIR = 140;

const M = 18; // marge horizontale (mm)
const HAUT = 22; // marge haute des pages suivantes
const BAS = 22; // réserve du pied de page

/* ------------------------------------------------------------------ */
/*  Logo (préchargé en mémoire, les constructeurs restent synchrones)  */
/* ------------------------------------------------------------------ */
let logoCache: string | null = null;
let logoPromesse: Promise<string | null> | null = null;

/** Charge /logo.png en data URL (une seule fois). Appelé automatiquement à
 *  l'import côté navigateur ; peut être attendu avant de générer un PDF. */
export function prechargerLogoPdf(): Promise<string | null> {
  if (logoCache) return Promise.resolve(logoCache);
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!logoPromesse) {
    logoPromesse = fetch("/logo.png")
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise<string | null>((resolve) => {
            // Réduction à 240 px de large (le PNG d'origine pèserait ~4 Mo
            // par page dans le PDF).
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
              try {
                const w = 240;
                const h = Math.round((img.height / img.width) * w);
                const cv = document.createElement("canvas");
                cv.width = w;
                cv.height = h;
                cv.getContext("2d")?.drawImage(img, 0, 0, w, h);
                resolve(cv.toDataURL("image/png"));
              } catch {
                resolve(null);
              } finally {
                URL.revokeObjectURL(url);
              }
            };
            img.onerror = () => resolve(null);
            img.src = url;
          })
      )
      .then((d) => {
        logoCache = d;
        return d;
      })
      .catch(() => null);
  }
  return logoPromesse;
}
if (typeof window !== "undefined") void prechargerLogoPdf();

/* ------------------------------------------------------------------ */
/*  Texte : les polices standard de jsPDF (WinAnsi) ne connaissent pas  */
/*  « − », « → », l'espace fine insécable… qui produisaient des glyphes  */
/*  décalés. Tout texte passe par txt().                                */
/* ------------------------------------------------------------------ */
function txt(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/[\u00a0\u202f\u2009\u2007\u2008]/g, " ")
    .replace(/−/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/…/g, "...")
    .replace(/★|☆/g, "*")
    .replace(/☐/g, "[ ]")
    .replace(/☑|☒/g, "[x]")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, "x");
}

const eurPdf = (n: number | null | undefined) =>
  txt((Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }));
const dateFr = (d?: string | number | Date | null) => new Date(d || Date.now()).toLocaleDateString("fr-FR");
const dateHeureFr = (d: string) => txt(new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }));

/* ------------------------------------------------------------------ */
/*  Contexte de page                                                   */
/* ------------------------------------------------------------------ */
type Ctx = { pdf: jsPDF; y: number; W: number; pageH: number; pageW: number; titreDoc: string; sousTitre: string };

function creer(titreDoc: string, sousTitre: string): Ctx {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  return { pdf, y: 0, W: pageW - 2 * M, pageH, pageW, titreDoc, sousTitre };
}

function reste(c: Ctx) {
  return c.pageH - BAS - c.y;
}
function nouvellePage(c: Ctx) {
  c.pdf.addPage();
  c.y = HAUT + 6;
}
function assurer(c: Ctx, hauteur: number) {
  if (reste(c) < hauteur) nouvellePage(c);
}

/** En-tête de première page : logo, surtitre fuchsia, titre violet,
 *  coordonnées de l'éditeur à droite, puis filet violet → fuchsia. */
function entete(c: Ctx, lignesDroite: string[]) {
  const { pdf, pageW } = c;
  const yTop = 14;
  let xTexte = M;
  if (logoCache) {
    try {
      pdf.addImage(logoCache, "PNG", M, yTop - 2, 16, 14.3, undefined, "FAST");
      xTexte = M + 20;
    } catch {
      /* logo illisible : en-tête sans image */
    }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...FUCHSIA);
  pdf.text(txt(c.sousTitre).toUpperCase(), xTexte, yTop + 1);
  pdf.setFontSize(17);
  pdf.setTextColor(...VIOLET);
  pdf.text(txt(c.titreDoc), xTexte, yTop + 8.5);

  // Bloc coordonnées à droite
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(GRIS);
  const coord = [SOCIETE.editeur, ADRESSE_COMPLETE, `SIRET ${SOCIETE.siret}`, SOCIETE.email, SOCIETE.site.replace(/^https?:\/\//, "")].map(txt);
  pdf.text(coord, pageW - M, yTop - 1, { align: "right", lineHeightFactor: 1.35 });

  // Filet dégradé
  const yF = yTop + 13;
  const n = 40;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pdf.setFillColor(Math.round(VIOLET[0] + (FUCHSIA[0] - VIOLET[0]) * t), Math.round(VIOLET[1] + (FUCHSIA[1] - VIOLET[1]) * t), Math.round(VIOLET[2] + (FUCHSIA[2] - VIOLET[2]) * t));
    pdf.rect(M + (c.W / n) * i, yF, c.W / n + 0.2, 1.1, "F");
  }
  // Références du document (n°, date…) sous le filet, à droite
  pdf.setFontSize(8.5);
  pdf.setTextColor(GRIS);
  if (lignesDroite.length) pdf.text(lignesDroite.map(txt), pageW - M, yF + 5.5, { align: "right", lineHeightFactor: 1.35 });
  c.y = yF + 5.5 + lignesDroite.length * 4.3 + 4;
}

/** Pied de page + rappel du titre sur les pages suivantes (appelé une fois
 *  à la fin, quand le nombre de pages est connu). */
function finaliser(c: Ctx): jsPDF {
  const { pdf, pageW, pageH } = c;
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    if (i > 1) {
      pdf.setFillColor(...VIOLET);
      pdf.rect(0, 0, pageW, 1.6, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(...VIOLET);
      pdf.text(txt(`${c.titreDoc}`).toUpperCase(), M, 9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(GRIS_CLAIR);
      pdf.text(txt(c.sousTitre), pageW - M, 9, { align: "right" });
    }
    pdf.setDrawColor(...GRIS_LIGNE);
    pdf.setLineWidth(0.2);
    pdf.line(M, pageH - 15, pageW - M, pageH - 15);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(GRIS_CLAIR);
    pdf.text(txt(`${SOCIETE.editeur} - SIRET ${SOCIETE.siret} - ${ADRESSE_COMPLETE} - ${SOCIETE.email}`), M, pageH - 10.5);
    pdf.text(`Page ${i} / ${total}`, pageW - M, pageH - 10.5, { align: "right" });
  }
  pdf.setPage(total);
  return pdf;
}

/* ------------------------------------------------------------------ */
/*  Briques de mise en page                                            */
/* ------------------------------------------------------------------ */
function h2(c: Ctx, t: string) {
  assurer(c, 18);
  c.y += 2;
  c.pdf.setFont("helvetica", "bold");
  c.pdf.setFontSize(11.5);
  c.pdf.setTextColor(...VIOLET);
  c.pdf.text(txt(t), M, c.y);
  c.pdf.setDrawColor(...VIOLET);
  c.pdf.setLineWidth(0.5);
  c.pdf.line(M, c.y + 1.8, M + 14, c.y + 1.8);
  c.y += 7;
  c.pdf.setFont("helvetica", "normal");
}
function h3(c: Ctx, t: string) {
  assurer(c, 14);
  c.pdf.setFont("helvetica", "bold");
  c.pdf.setFontSize(9.5);
  c.pdf.setTextColor(NOIR);
  c.pdf.text(txt(t), M, c.y);
  c.y += 4.8;
  c.pdf.setFont("helvetica", "normal");
}

/** Paragraphe justifié, avec saut de page ligne à ligne. */
function para(c: Ctx, texte: string, opts: { taille?: number; couleur?: number; x?: number; largeur?: number; apres?: number; gras?: boolean } = {}) {
  const taille = opts.taille ?? 9;
  const x = opts.x ?? M;
  const largeur = opts.largeur ?? c.W - (x - M);
  const interligne = taille * 0.48;
  c.pdf.setFont("helvetica", opts.gras ? "bold" : "normal");
  c.pdf.setFontSize(taille);
  c.pdf.setTextColor(opts.couleur ?? GRIS);
  const lignes = c.pdf.splitTextToSize(txt(texte), largeur) as string[];
  let i = 0;
  while (i < lignes.length) {
    if (reste(c) < interligne) nouvellePage(c);
    const nb = Math.max(1, Math.min(lignes.length - i, Math.floor(reste(c) / interligne)));
    const bloc = lignes.slice(i, i + nb);
    // Justification par segments : une ligne sans espace (mot isolé) ne
    // peut pas être justifiée par jsPDF (division par zéro).
    let k = 0;
    while (k < bloc.length) {
      if (!bloc[k].includes(" ")) {
        c.pdf.text(bloc[k], x, c.y);
        c.y += interligne;
        k += 1;
        continue;
      }
      let fin = k;
      while (fin < bloc.length && bloc[fin].includes(" ")) fin += 1;
      const seg = bloc.slice(k, fin);
      c.pdf.text(seg, x, c.y, { maxWidth: largeur, align: "justify", lineHeightFactor: interligne / (taille * 0.3528) });
      c.y += seg.length * interligne;
      k = fin;
    }
    i += nb;
  }
  c.y += opts.apres ?? 2.5;
  c.pdf.setFont("helvetica", "normal");
}

/** Liste à puces (puce violette, texte justifié). */
function puce(c: Ctx, texte: string, taille = 9) {
  assurer(c, taille * 0.48 + 1);
  c.pdf.setFillColor(...VIOLET);
  c.pdf.circle(M + 1.2, c.y - 1.1, 0.7, "F");
  para(c, texte, { taille, couleur: 55, x: M + 5, apres: 1.6 });
}

/** Encadré coloré (titre + paragraphes) : ne se coupe pas s'il tient sur
 *  une page. */
function encadre(c: Ctx, titre: string, paragraphes: string[], fond: [number, number, number] = VIOLET_PALE, couleurTitre: [number, number, number] = VIOLET) {
  const pad = 4;
  const largeur = c.W - 2 * pad;
  c.pdf.setFontSize(8.8);
  const hauteurs = paragraphes.map((p) => (c.pdf.splitTextToSize(txt(p), largeur) as string[]).length * 8.8 * 0.48 + 1.5);
  const hTotal = pad + 5 + hauteurs.reduce((a, b) => a + b, 0) + pad;
  if (hTotal <= c.pageH - BAS - HAUT - 6) assurer(c, hTotal + 2);
  const y0 = c.y - 3;
  c.pdf.setFillColor(...fond);
  c.pdf.roundedRect(M, y0, c.W, Math.min(hTotal, reste(c) + 3), 1.5, 1.5, "F");
  c.pdf.setFillColor(...couleurTitre);
  c.pdf.rect(M, y0, 1.4, Math.min(hTotal, reste(c) + 3), "F");
  c.y = y0 + pad + 2.5;
  c.pdf.setFont("helvetica", "bold");
  c.pdf.setFontSize(9.5);
  c.pdf.setTextColor(...couleurTitre);
  c.pdf.text(txt(titre), M + pad, c.y);
  c.y += 5;
  for (const p of paragraphes) para(c, p, { taille: 8.8, couleur: 55, x: M + pad, largeur, apres: 1.5 });
  c.y = Math.max(c.y, y0 + hTotal) + 4;
}

/** Tableau autoTable à la charte (en-tête violet, lignes alternées). */
function tableau(c: Ctx, head: string[], body: RowInput[], opts: { largeurs?: number[]; taille?: number; droite?: number[]; options?: Partial<UserOptions> } = {}) {
  const columnStyles: UserOptions["columnStyles"] = {};
  const somme = opts.largeurs ? opts.largeurs.reduce((a, b) => a + b, 0) : 0;
  head.forEach((_, i) => {
    columnStyles[i] = {
      ...(opts.largeurs ? { cellWidth: (opts.largeurs[i] / somme) * c.W } : {}),
      ...(opts.droite?.includes(i) ? { halign: "right" } : {}),
    };
  });
  const nettoyer = (r: RowInput): RowInput =>
    Array.isArray(r) ? r.map((cell) => (typeof cell === "object" && cell !== null && "content" in cell ? { ...(cell as CellDef), content: txt(String((cell as CellDef).content ?? "")) } : txt(String(cell ?? "")))) : r;
  autoTable(c.pdf, {
    startY: c.y,
    margin: { left: M, right: M, top: HAUT + 4, bottom: BAS },
    head: [head.map(txt)],
    body: body.map(nettoyer),
    theme: "grid",
    styles: { font: "helvetica", fontSize: opts.taille ?? 8.8, cellPadding: 2.2, textColor: 45, lineColor: GRIS_LIGNE, lineWidth: 0.2, valign: "top", overflow: "linebreak" },
    headStyles: { fillColor: VIOLET, textColor: 255, fontStyle: "bold", halign: "left" },
    alternateRowStyles: { fillColor: [250, 248, 255] },
    columnStyles,
    ...opts.options,
  });
  c.y = ((c.pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? c.y) + 6;
}

/** Deux blocs de signature côte à côte (image éventuelle, mentions). */
function blocsSignature(c: Ctx, gauche: { titre: string; image?: string | null; lignes: string[] }, droite: { titre: string; image?: string | null; lignes: string[] }) {
  const h = 34;
  assurer(c, h + 26);
  const w = (c.W - 6) / 2;
  const blocs = [
    { ...gauche, x: M },
    { ...droite, x: M + w + 6 },
  ];
  for (const b of blocs) {
    c.pdf.setFillColor(...VIOLET);
    c.pdf.rect(b.x, c.y, w, 6.5, "F");
    c.pdf.setFont("helvetica", "bold");
    c.pdf.setFontSize(8.8);
    c.pdf.setTextColor(255);
    c.pdf.text(txt(b.titre), b.x + 2.5, c.y + 4.4);
    c.pdf.setDrawColor(...GRIS_LIGNE);
    c.pdf.setLineWidth(0.2);
    c.pdf.rect(b.x, c.y + 6.5, w, h, "S");
    if (b.image) {
      try {
        c.pdf.addImage(b.image, "PNG", b.x + (w - 60) / 2, c.y + 9, 60, 26);
      } catch {
        /* image illisible */
      }
    }
    c.pdf.setFont("helvetica", "normal");
    c.pdf.setFontSize(8);
    c.pdf.setTextColor(GRIS);
    const lignes = b.lignes.filter(Boolean).flatMap((l) => c.pdf.splitTextToSize(txt(l), w - 4) as string[]);
    if (lignes.length) c.pdf.text(lignes, b.x + 2, c.y + h + 11, { lineHeightFactor: 1.35 });
  }
  c.y += h + 11 + 4 * 3.8 + 4;
}

/* ------------------------------------------------------------------ */
/*  Données communes                                                   */
/* ------------------------------------------------------------------ */
function libelleFormule(t: { libelle: string; heures: number }) {
  return `${t.libelle}${t.heures ? ` - application + ${t.heures} h de secrétariat / mois` : " - application seule"}`;
}
function identifiantEntreprise(siret: string | null | undefined) {
  const brut = String(siret || "").replace(/\D/g, "");
  if (!brut) return "";
  return `${brut.length >= 14 ? "SIRET" : "SIREN"} ${siret}`;
}
function blocClient(v: VenteContrat): string {
  return [
    v.garage_nom,
    identifiantEntreprise(v.garage_siret),
    [v.garage_adresse, `${v.garage_cp || ""} ${v.garage_ville || ""}`.trim()].filter(Boolean).join("\n"),
    [v.contact_nom, v.contact_fonction].filter(Boolean).join(", "),
    [v.contact_tel, v.contact_email].filter(Boolean).join(" - "),
  ]
    .filter(Boolean)
    .join("\n");
}
function blocEditeur(commercialNom?: string | null, codeApporteur?: string | null): string {
  return [
    SOCIETE.editeur,
    `SIRET ${SOCIETE.siret}`,
    ADRESSE_COMPLETE,
    SOCIETE.email,
    commercialNom ? `Votre interlocuteur : ${commercialNom}${codeApporteur ? ` (code ${codeApporteur})` : ""}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ====================================================================
   CONTRAT D'ABONNEMENT
==================================================================== */
export function construireContratPdf(
  v: VenteContrat,
  p: Parametres,
  extra: { numero?: string | null; signature?: string | null; signeLe?: string | null; besoins?: Record<string, unknown> | null; signatureCommercial?: string | null; commercialNom?: string | null }
): jsPDF {
  const c = creer("Contrat d'abonnement", `${SOCIETE.produit} by ${SOCIETE.editeur}`);
  entete(c, [extra.numero ? `Contrat n° ${extra.numero}` : "", `Établi le ${dateFr(extra.signeLe)}`, `CGV ${VERSION_CGV}`].filter(Boolean));

  h2(c, "Entre les parties");
  tableau(c, ["Le prestataire", "Le client (garage)"], [[blocEditeur(extra.commercialNom, v.code_apporteur), blocClient(v)]], { largeurs: [1, 1.3], taille: 9 });
  if (v.code_apporteur) para(c, `Contrat présenté par l'apporteur d'affaires code ${v.code_apporteur}, mandaté par ${SOCIETE.editeur} (CGV, article 11).`, { taille: 8.5, couleur: GRIS_CLAIR });

  h2(c, "Conditions particulières");
  for (const l of conditionsParticulieres(v, p)) puce(c, l, 9.2);
  c.y += 2;

  if (extra.besoins && Object.keys(extra.besoins).length) {
    h2(c, "Annexe - fiche de renseignement du garage");
    const b = extra.besoins;
    const lignes: RowInput[] = SECTIONS_BESOINS.filter((s) => !s.interne).flatMap((s) => lignesSection(s, b));
    // Réponses hors référentiel (anciennes clés) : libellé brut.
    for (const [k, val] of Object.entries(b)) {
      if (k === "demandes" || k === "agrements_liste" || k === "agrements_detail" || libelleQuestion(k) !== k) continue;
      const v = Array.isArray(val) ? val.join(", ") : String(val ?? "");
      if (v) lignes.push([k, v]);
    }
    for (const d of demandesDe(b)) lignes.push(["Demande particulière", [d.titre, d.detail].filter(Boolean).join(" — ")]);
    if (lignes.length) tableau(c, ["Question", "Réponse"], lignes, { largeurs: [1, 1.6], taille: 8.5 });
  }

  h2(c, "Conditions générales de vente");
  for (const a of articlesCGV(p)) {
    assurer(c, 16);
    h3(c, a.titre);
    para(c, a.texte, { taille: 8.6, couleur: 70, apres: 3 });
  }

  assurer(c, 80);
  h2(c, "Signatures");
  para(c, ACCEPTATION_CGV, { taille: 9, couleur: 45 });
  blocsSignature(
    c,
    {
      titre: `Pour ${SOCIETE.editeur}`,
      image: extra.signatureCommercial,
      lignes: extra.signatureCommercial
        ? [`Apporteur d'affaires : ${extra.commercialNom || ""}`.trim(), "Sous réserve de validation par IDEAFORMA (art. 11)."]
        : ["Validation par email de bienvenue et création du compte (art. 11)."],
    },
    {
      titre: "Pour le client - « lu et approuvé »",
      image: extra.signature,
      lignes: [
        v.signataire_nom ? `Nom : ${v.signataire_nom}${v.signataire_qualite ? ` (${v.signataire_qualite})` : ""}` : "Nom, qualité :",
        extra.signeLe ? `Signé le ${dateHeureFr(extra.signeLe)}` : "Date :",
      ],
    }
  );
  return finaliser(c);
}

/* ====================================================================
   DEVIS D'ABONNEMENT — proposition chiffrée pour un prospect.
==================================================================== */
export function construireDevisPdf(
  v: VenteContrat,
  p: Parametres,
  extra: { numero?: string | null; validiteJours?: number; signature?: string | null; signeLe?: string | null; signatureCommercial?: string | null; commercialNom?: string | null; date?: string | null }
): jsPDF {
  const c = creer("Devis d'abonnement", `${SOCIETE.produit} by ${SOCIETE.editeur}`);
  const t = tarifFormule(v.formule, p);
  const date = new Date(extra.date || Date.now());
  const validite = new Date(date);
  validite.setDate(validite.getDate() + (extra.validiteJours || 30));
  entete(c, [extra.numero ? `Devis n° ${extra.numero}` : "", `Établi le ${dateFr(date)}`, `Valable jusqu'au ${dateFr(validite)}`].filter(Boolean));

  tableau(c, ["Client", "Établi par"], [[blocClient(v), blocEditeur(extra.commercialNom, v.code_apporteur)]], { largeurs: [1.3, 1], taille: 9 });

  h2(c, `Formule ${libelleFormule(t)}`);
  const engage = v.engagement_12 || v.periodicite === "annuel";
  const total12 = v.periodicite === "annuel" ? v.montant_annuel_ht || 0 : v.prix_mensuel_ht * 12 + (engage ? 0 : v.mise_en_service_ht ?? p.miseEnService);
  const gras = (s: string): CellDef => ({ content: s, styles: { fontStyle: "bold", textColor: NOIR } });
  const lignes: RowInput[] = [
    ["Prix catalogue (sans engagement)", `${eurPdf(t.mensuel)} HT / mois`],
    ...(engage ? [[`Remise engagement 12 mois (- ${t.remiseEngagementPct} %)`, `${eurPdf(t.mensuelEngage)} HT / mois`]] : []),
    ...(Number(v.remise_supp_pct) > 0 ? [["Remise commerciale exceptionnelle (sous validation IDEAFORMA)", `- ${v.remise_supp_pct} %`]] : []),
    v.periodicite === "annuel"
      ? ["Année payée en une fois (12 mois d'abonnement)", gras(`${eurPdf(v.montant_annuel_ht)} HT  (${t.bonusAnnuelLibelle})`)]
      : ["Mensualité retenue", gras(`${eurPdf(v.prix_mensuel_ht)} HT / mois`)],
    ["Mise en service (paramétrage, import des données, formation)", engage ? "Offerte" : `${eurPdf(v.mise_en_service_ht ?? p.miseEnService)} HT, facturée une fois`],
    ["Heure de secrétariat hors forfait", `${eurPdf(p.heureHorsForfait)} HT`],
    ["TVA", "En sus, au taux en vigueur"],
    ["Engagement", engage ? "12 mois fermes (CGV art. 2), puis mois par mois" : "Aucun - préavis d'un mois (fin de mois)"],
    [gras("Total sur 12 mois"), gras(`${eurPdf(total12)} HT`)],
  ];
  tableau(c, ["Désignation", "Montant / condition"], lignes, {
    largeurs: [1.35, 1],
    taille: 9.2,
    droite: [1],
    options: {
      didParseCell: (d) => {
        if (d.section === "body" && d.row.index === lignes.length - 1) d.cell.styles.fillColor = VIOLET_PALE;
      },
    },
  });

  encadre(c, "Ce que comprend la formule", [
    "Application My Easy Auto : dossiers sinistres illimités, lecture des rapports d'expertise, devis et factures conformes au rapport, relances, cession de créance, planning, véhicules de prêt, gardiennage, portail client, assistant MY-MY, sauvegardes et assistance.",
    ...(t.heures
      ? [`Secrétariat externalisé : ${t.heures} h / mois (saisie des dossiers, envoi des devis et factures, relances, appels aux assurances et aux experts). Les heures non consommées sont reportables à 50 % sur le mois suivant.`]
      : []),
  ]);
  para(
    c,
    "Devis établi selon la grille tarifaire en vigueur. La souscription se fait par la signature du contrat d'abonnement et de ses conditions générales de vente (jointes ou disponibles sur demande). Le contrat n'est définitif qu'après validation par IDEAFORMA, qui crée le compte et adresse l'email de bienvenue.",
    { taille: 8.5, couleur: GRIS_CLAIR }
  );

  assurer(c, 72);
  h2(c, "Bon pour accord");
  blocsSignature(
    c,
    { titre: `Pour ${SOCIETE.editeur}${extra.commercialNom ? ` - ${extra.commercialNom}` : ""}`, image: extra.signatureCommercial, lignes: [] },
    {
      titre: "Le client - « bon pour accord »",
      image: extra.signature,
      lignes: [v.signataire_nom ? `Nom : ${v.signataire_nom}` : "Nom, qualité :", extra.signeLe ? `Signé le ${dateHeureFr(extra.signeLe)}` : "Date :"],
    }
  );
  return finaliser(c);
}

/* ====================================================================
   SIMULATION TARIFAIRE — les trois façons de payer, pour chaque formule,
   avec la formule proposée mise en avant.
==================================================================== */
export function construireSimulationPdf(garageNom: string, formuleRetenue: Formule | null, p: Parametres, extra: { numero?: string | null; commercialNom?: string | null }): jsPDF {
  const c = creer("Simulation tarifaire", `${SOCIETE.produit} by ${SOCIETE.editeur}`);
  entete(c, [extra.numero ? `Simulation ${extra.numero}` : "", `Établie le ${dateFr()}`, `Pour ${garageNom}`].filter(Boolean));

  para(
    c,
    "Prix hors taxes, TVA en sus. Chaque formule peut être souscrite de trois façons : sans engagement, avec un engagement de 12 mois (remise sur la mensualité), ou en payant l'année en une fois (remise d'engagement et avantage supplémentaire). La mise en service - paramétrage, import des données, formation à distance - est offerte dès qu'il y a engagement.",
    { taille: 9.2, couleur: GRIS }
  );

  const grille = grilleTarifs(p);
  const idx = grille.findIndex((t) => t.formule === formuleRetenue);
  const body: RowInput[] = grille.map((t) => [
    `${t.libelle}\n${t.heures ? `application + ${t.heures} h / mois` : "application seule"}${t.formule === formuleRetenue ? "\n* formule proposée" : ""}`,
    `${eurPdf(t.mensuel)} / mois\n+ mise en service ${eurPdf(p.miseEnService)}\n${eurPdf(t.mensuel * 12 + p.miseEnService)} la 1re année`,
    `${eurPdf(t.mensuelEngage)} / mois\n- ${t.remiseEngagementPct} %, mise en service offerte\n${eurPdf(t.annuelBase)} sur 12 mois`,
    `${eurPdf(t.annuelUnique)} pour 12 mois\n${t.bonusAnnuelLibelle} en plus\nmise en service offerte`,
    `${eurPdf(t.economieEngagement)} engagé\n${eurPdf(t.economieAnnuel)} année en une fois`,
  ]);
  h2(c, "Les trois prix de chaque formule");
  tableau(c, ["Formule", "Sans engagement", "Engagement 12 mois", "Année payée en une fois", "Économie sur 12 mois"], body, {
    largeurs: [1.05, 1.25, 1.3, 1.3, 1.0],
    taille: 8.2,
    droite: [4],
    options: {
      didParseCell: (d) => {
        if (d.section !== "body") return;
        if (d.column.index === 0) {
          d.cell.styles.fontStyle = "bold";
          d.cell.styles.textColor = VIOLET;
        }
        if (d.row.index === idx) {
          d.cell.styles.fillColor = FUCHSIA_PALE;
          if (d.column.index === 0) d.cell.styles.textColor = FUCHSIA;
        }
      },
    },
  });

  if (idx >= 0) {
    const t = grille[idx];
    encadre(
      c,
      `Formule proposée : ${libelleFormule(t)}`,
      [
        `Sans engagement : ${eurPdf(t.mensuel)} HT par mois, mise en service ${eurPdf(p.miseEnService)} HT facturée une fois, soit ${eurPdf(t.mensuel * 12 + p.miseEnService)} HT la première année. Résiliable à tout moment avec un préavis d'un mois.`,
        `Engagement 12 mois : ${eurPdf(t.mensuelEngage)} HT par mois (remise de ${t.remiseEngagementPct} %), mise en service offerte, soit ${eurPdf(t.annuelBase)} HT sur 12 mois - une économie de ${eurPdf(t.economieEngagement)} par rapport au sans engagement.`,
        `Année payée en une fois : ${eurPdf(t.annuelUnique)} HT pour 12 mois (${t.bonusAnnuelLibelle} en plus de la remise d'engagement), mise en service offerte - une économie de ${eurPdf(t.economieAnnuel)} par rapport au sans engagement.`,
      ],
      FUCHSIA_PALE,
      FUCHSIA
    );
  }

  h2(c, "Ce qui est compris, ce qui se facture en plus");
  tableau(
    c,
    ["Élément", "Règle"],
    [
      ["Mise en service", `Paramétrage, import des données, formation à distance : ${eurPdf(p.miseEnService)} HT, facturée une fois. Offerte avec engagement 12 mois ou année payée en une fois.`],
      ["Heures de secrétariat", `Incluses dans la formule ; heure supplémentaire ${eurPdf(p.heureHorsForfait)} HT ; heures non consommées reportables à 50 % sur le mois suivant.`],
      ["Utilisateurs, dossiers, documents, stockage", "Illimités. Analyses IA (rapports d'expertise, cartes grises) incluses dans un usage raisonnable."],
      ["Changement de formule", "Montée en gamme à tout moment, engagement conservé. Descente en gamme : préavis d'un mois sans engagement ; avec engagement, au terme ou après 6 mensualités réglées (CGV art. 12)."],
      ["Résiliation", "Sans engagement : préavis d'un mois (fin de mois). Engagé 12 mois : les mensualités restantes sont dues. Données exportables 90 jours après la fin du contrat."],
    ],
    { largeurs: [1, 2.4], taille: 8.5 }
  );
  para(c, `Simulation indicative établie selon la grille tarifaire en vigueur, sans valeur contractuelle ; seul le devis puis le contrat d'abonnement engagent les parties.${extra.commercialNom ? ` Votre interlocuteur : ${extra.commercialNom} - ${SOCIETE.email}.` : ` Contact : ${SOCIETE.email}.`}`, { taille: 8.5, couleur: GRIS_CLAIR });
  return finaliser(c);
}

/* ====================================================================
   FICHE CLIENT — document interne : identité du garage, réponses de la
   fiche d'identification des besoins, demandes particulières, synthèse.
   Destinée à la secrétaire qui prendra le garage en charge.
==================================================================== */
export function construireFichePdf(
  p: Prospect,
  extra: { numero?: string | null; date?: string | null; commercialNom?: string | null; codeApporteur?: string | null }
): jsPDF {
  const b = p.besoins || {};
  const c = creer("Fiche client", `${SOCIETE.produit} by ${SOCIETE.editeur} - document interne`);
  entete(c, [extra.numero ? `Fiche n° ${extra.numero}` : "", `Établie le ${dateFr(extra.date)}`, extra.commercialNom ? `Par ${extra.commercialNom}` : ""].filter(Boolean));

  para(c, "Document interne IDEAFORMA - ne pas transmettre au garage. Il reprend l'entretien de découverte et les demandes particulières du client afin que la secrétaire en charge dispose de tout le contexte avant la mise en service.", { taille: 8.6, couleur: GRIS_CLAIR, apres: 4 });

  h2(c, "1. Identité du garage");
  const contact = [p.contact_nom, p.contact_fonction].filter(Boolean).join(", ");
  const identite: RowInput[] = (
    [
      ["Raison sociale", p.nom],
      ["Enseigne / nom commercial", String(b.enseigne ?? "")],
      ["Forme juridique / activité", [p.forme_juridique, p.activite].filter(Boolean).join(" - ")],
      ["Adresse", [p.adresse, `${p.cp || ""} ${p.ville || ""}`.trim()].filter(Boolean).join(", ")],
      [(p.siret || p.siren || "").replace(/\D/g, "").length >= 14 ? "SIRET" : "SIREN", p.siret || p.siren || ""],
      ["TVA intracommunautaire", p.tva_intra || ""],
      ["Gérant(e)", p.gerant || ""],
      ["Contact (nom, fonction)", contact],
      ["Téléphone / e-mail", [p.tel, p.email].filter(Boolean).join(" - ")],
      ["Site internet", p.site || ""],
      ["Effectif déclaré", p.effectif != null ? String(p.effectif) : ""],
      ["Statut commercial", `${p.statut}${p.origine ? ` - origine : ${p.origine}${p.origine_detail ? ` (${p.origine_detail})` : ""}` : ""}`],
      ["Date de l'entretien / interlocuteur", [String(b.date_entretien ?? ""), String(b.interlocuteur_ideaforma ?? extra.commercialNom ?? "")].filter(Boolean).join(" / ")],
    ] as [string, string][]
  ).filter((l) => l[1]);
  tableau(c, ["Champ", "Valeur"], identite, { largeurs: [1, 1.8], taille: 8.8 });

  let n = 2;
  for (const s of SECTIONS_BESOINS.filter((x) => x.cle !== "entretien" && !x.interne)) {
    const lignes = lignesSection(s, b);
    h2(c, `${n}. ${s.titre}`);
    n++;
    if (s.cle === "taches") {
      const cochees = Array.isArray(b.taches) ? (b.taches as string[]) : [];
      const autre = String(b.taches_autre ?? "");
      if (!cochees.length && !autre) {
        para(c, "Aucune tâche cochée.", { taille: 8.8, couleur: GRIS_CLAIR });
        continue;
      }
      for (const t of cochees) puce(c, t, 9);
      if (autre) puce(c, `Autre : ${autre}`, 9);
      c.y += 2;
      continue;
    }
    if (!lignes.length) {
      para(c, "Non renseigné.", { taille: 8.8, couleur: GRIS_CLAIR });
      continue;
    }
    tableau(c, ["Question", "Réponse"], lignes, { largeurs: [1, 1.6], taille: 8.6 });
  }

  h2(c, `${n}. Demandes particulières du client`);
  n++;
  const demandes = demandesDe(b);
  if (!demandes.length) para(c, "Aucune demande particulière enregistrée.", { taille: 8.8, couleur: GRIS_CLAIR });
  else {
    encadre(
      c,
      `${demandes.length} demande${demandes.length > 1 ? "s" : ""} à prendre en compte à la mise en service`,
      demandes.map((d, i) => `${i + 1}. ${d.titre}${d.detail ? ` - ${d.detail}` : ""}`),
      FUCHSIA_PALE,
      FUCHSIA
    );
  }

  const synth = SECTIONS_BESOINS.find((x) => x.cle === "synthese")!;
  h2(c, `${n}. ${synth.titre}`);
  const ls = lignesSection(synth, b);
  if (ls.length) tableau(c, ["Point", "Décision"], ls, { largeurs: [1, 1.6], taille: 8.6 });
  else para(c, "Synthèse à compléter après l'entretien.", { taille: 8.8, couleur: GRIS_CLAIR });

  if (p.notes) {
    h2(c, `${n + 1}. Notes du commercial`);
    para(c, p.notes, { taille: 8.8, couleur: 55 });
  }

  para(c, `Questionnaire rempli à ${tauxRemplissage(b)} %.${extra.commercialNom ? ` Commercial : ${extra.commercialNom}${extra.codeApporteur ? ` (code ${extra.codeApporteur})` : ""}.` : ""} Fiche régénérable à tout moment depuis l'espace Clients : elle reflète toujours la dernière version du questionnaire.`, { taille: 8.2, couleur: GRIS_CLAIR });
  return finaliser(c);
}

export function telechargerContratPdf(v: VenteContrat, p: Parametres, extra: Parameters<typeof construireContratPdf>[2]) {
  const pdf = construireContratPdf(v, p, extra);
  pdf.save(`contrat-${(extra.numero || v.garage_nom).replace(/[^a-z0-9-]+/gi, "_")}.pdf`);
}

/* ====================================================================
   CONTRAT DE COLLABORATION (v10.6) — apporteur d'affaires (commercial)
   ou prestation de services (secrétaire). Le contenu vient de
   collaborateur_documents.contenu : tout est régénérable à l'identique.
==================================================================== */
export function construireContratCollaborateurPdf(
  contenu: ContenuContrat,
  extra: { nomCollaborateur?: string | null; signatureEditeur?: string | null; signatureCollaborateur?: string | null; signeLe?: string | null } = {}
): jsPDF {
  const apporteur = contenu.modele === "apporteur";
  const partieEditeur = apporteur ? "Le Mandant" : "Le Donneur d'ordre";
  const partieCollab = apporteur ? "L'Apporteur" : "Le Prestataire";
  const c = creer(titreContrat(contenu.modele), contenu.sousTitre || `${SOCIETE.produit} by ${SOCIETE.editeur}`);
  entete(c, [contenu.version ? `Modèle ${contenu.version}` : "", `Établi le ${dateFr(contenu.date)}`].filter(Boolean));

  h2(c, "Entre les soussignés");
  tableau(c, [`${partieEditeur} — ${SOCIETE.editeur}`, partieCollab], [[contenu.blocEditeur, contenu.blocCollaborateur]], { largeurs: [1, 1], taille: 9 });
  if (contenu.intro) para(c, contenu.intro, { taille: 9, couleur: 55, apres: 4 });

  contenu.articles.forEach((a, i) => {
    assurer(c, 16);
    h3(c, a.titre);
    for (const ligne of a.texte.split("\n").filter((l) => l.trim())) para(c, ligne, { taille: 8.8, couleur: 60, apres: 2 });
    if (contenu.table && contenu.table.apresArticle === i) {
      tableau(c, contenu.table.tete, contenu.table.lignes as RowInput[], { largeurs: [2, 1, 1], taille: 8.6, droite: [1, 2] });
    }
    c.y += 1.5;
  });

  // Rendu d'une annexe : « ▸ » = sous-titre, « · » (même indenté) = puce.
  const rendreAnnexe = (titre: string, texte: string) => {
    assurer(c, 20);
    h2(c, titre);
    for (const brut of texte.split("\n")) {
      const ligne = brut.trim();
      if (!ligne) { c.y += 1.5; continue; }
      if (ligne.startsWith("▸")) { h3(c, ligne.slice(1).trim()); continue; }
      if (ligne.startsWith("·")) { puce(c, ligne.slice(1).trim(), 8.8); continue; }
      para(c, ligne, { taille: 8.8, couleur: 60, apres: 2 });
    }
  };

  if (contenu.annexeTexte) rendreAnnexe(contenu.annexeTitre || "Annexe 1", contenu.annexeTexte);
  // Annexes 2, 3, 4… (v11.3) : périmètre des tâches, moyens, rappel brut/net.
  for (const a of contenu.annexes || []) {
    if (a && a.texte) rendreAnnexe(a.titre, a.texte);
  }

  assurer(c, 85);
  h2(c, "Signatures");
  para(c, `Fait à ${contenu.lieu || "________"}, le ${dateFr(contenu.date)}, en deux exemplaires originaux.`, { taille: 9, couleur: 45 });
  blocsSignature(
    c,
    {
      titre: `Pour ${SOCIETE.editeur}`,
      image: extra.signatureEditeur,
      lignes: ["Nom, qualité : représentant légal", extra.signeLe ? `Signé le ${dateHeureFr(extra.signeLe)}` : "Date :"],
    },
    {
      titre: `${partieCollab} — « lu et approuvé »`,
      image: extra.signatureCollaborateur,
      lignes: [
        extra.nomCollaborateur ? `Nom : ${extra.nomCollaborateur}` : "Nom :",
        extra.signeLe ? `Signé le ${dateHeureFr(extra.signeLe)}` : "Date :",
      ],
    }
  );
  if (contenu.avertissement) para(c, contenu.avertissement, { taille: 7.8, couleur: GRIS_CLAIR });
  return finaliser(c);
}

export function telechargerContratCollaborateurPdf(contenu: ContenuContrat, extra: Parameters<typeof construireContratCollaborateurPdf>[1], nom: string) {
  const pdf = construireContratCollaborateurPdf(contenu, extra);
  pdf.save(`${titreContrat(contenu.modele).toLowerCase().replace(/[^a-z0-9]+/gi, "-")}-${nom.replace(/[^a-z0-9-]+/gi, "_") || "collaborateur"}.pdf`);
}
