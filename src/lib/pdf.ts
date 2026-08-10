import jsPDF from "jspdf";
import autoTable, { UserOptions } from "jspdf-autotable";
import { CessionCreance, Document, DocumentLigne, Dossier, Entreprise, OrdreReparation, Restitution } from "./types";
import {
  computeTotaux,
  groupeLignes,
  labelModeReglement,
  montantRemiseLigne,
  sousTotal,
  tauxRemise,
  totalLigne,
} from "./documents";
import { AUTORISATION_OR, CESSION_OBJET, CESSION_NOTIFICATION, DECHARGE_RESTITUTION } from "./atelier";
import { supabase } from "./supabaseClient";
import { ModelePdf, themePdf } from "./pdfTheme";

const DEFAUT: Partial<Entreprise> = {
  nom: "Mon garage",
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

// Métier du compte (carrosserie | vitrage), lu depuis l'Auth pour adapter le
// libellé des documents (ordre de réparation vs ordre d'intervention).
async function getMetierPdf(): Promise<"carrosserie" | "vitrage"> {
  try {
    const { data } = await supabase.auth.getUser();
    const m =
      (data.user?.app_metadata as { metier?: string } | undefined)?.metier ??
      (data.user?.user_metadata as { metier?: string } | undefined)?.metier;
    return m === "vitrage" ? "vitrage" : "carrosserie";
  } catch {
    return "carrosserie";
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

// Ouvre un PDF dans un nouvel onglet (visualisation ; le téléchargement
// reste possible depuis la visionneuse du navigateur).
function ouvrirPdf(pdf: jsPDF) {
  const url = pdf.output("bloburl");
  window.open(String(url), "_blank", "noopener,noreferrer");
}

/* ==================================================================
 *  Apparence des PDF (v31) : en-tête selon le modèle + styles de tableau
 *  NB CONFORMITÉ : le modèle ne change QUE le style. Les mentions
 *  obligatoires (identités, n°, dates, totaux, échéance, pénalités…)
 *  sont dessinées pour TOUS les modèles.
 * ================================================================== */

type ThemePdf = { modele: ModelePdf; accent: [number, number, number] };

// En-tête commun (charte du garage), décliné selon le modèle choisi dans le
// profil. Renvoie le y où commencer le contenu.
function drawEnTete(
  pdf: jsPDF,
  ent: Partial<Entreprise>,
  logo: string | null,
  theme: ThemePdf,
  titre: string,
  sousLignes: string[]
): number {
  const pageW = pdf.internal.pageSize.getWidth();
  const M = 14;
  const right = pageW - M;
  const coordonnees = [
    ent.adresse || "",
    `${ent.code_postal || ""} ${ent.ville || ""}`.trim(),
    ent.tel ? `Tel : ${ent.tel}` : "",
    ent.email || "",
  ].filter(Boolean);

  if (theme.modele === "bandeau") {
    // Grand bandeau de couleur pleine largeur, texte blanc
    pdf.setFillColor(...theme.accent);
    pdf.rect(0, 0, pageW, 42, "F");
    let headerX = M;
    if (logo) {
      try {
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(M, 7, 28, 28, 2, 2, "F");
        pdf.addImage(logo, "PNG", M + 1, 8, 26, 26);
        headerX = M + 34;
      } catch { /* format non supporté */ }
    }
    pdf.setFontSize(15);
    pdf.setTextColor(255);
    pdf.setFont("helvetica", "bold");
    pdf.text(ent.nom || "Mon garage", headerX, 15);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.text(coordonnees.slice(0, 4), headerX, 21);
    pdf.setFontSize(titre.length > 14 ? 15 : 20);
    pdf.setFont("helvetica", "bold");
    pdf.text(titre, right, 16, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    sousLignes.forEach((l, i) => pdf.text(l, right, 24 + i * 5, { align: "right" }));
    pdf.setTextColor(30);
    return 54;
  }

  if (theme.modele === "epure") {
    // Noir & blanc, fine ligne de couleur sous l'en-tête
    let headerX = M;
    if (logo) {
      try {
        pdf.addImage(logo, "PNG", M, 12, 24, 24);
        headerX = M + 30;
      } catch { /* format non supporté */ }
    }
    pdf.setFontSize(15);
    pdf.setTextColor(30);
    pdf.setFont("helvetica", "bold");
    pdf.text(ent.nom || "Mon garage", headerX, 19);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(110);
    pdf.text(coordonnees, headerX, 25);
    pdf.setFontSize(titre.length > 14 ? 15 : 18);
    pdf.setTextColor(30);
    pdf.text(titre, right, 20, { align: "right" });
    pdf.setFontSize(9.5);
    pdf.setTextColor(110);
    sousLignes.forEach((l, i) => pdf.text(l, right, 27 + i * 5, { align: "right" }));
    pdf.setDrawColor(...theme.accent);
    pdf.setLineWidth(1.1);
    pdf.line(M, 42, right, 42);
    pdf.setLineWidth(0.3);
    pdf.setDrawColor(0);
    pdf.setTextColor(30);
    return 52;
  }

  // Classique (modèle historique)
  let headerX = M;
  if (logo) {
    try {
      pdf.addImage(logo, "PNG", M, 12, 26, 26);
      headerX = M + 32;
    } catch { /* format non supporté */ }
  }
  pdf.setFontSize(16);
  pdf.setTextColor(...theme.accent);
  pdf.text(ent.nom || "Mon garage", headerX, 19);
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  pdf.text(coordonnees, headerX, 26);
  pdf.setFontSize(titre.length > 14 ? 17 : 22);
  pdf.setTextColor(30);
  pdf.text(titre, right, 21, { align: "right" });
  pdf.setFontSize(10);
  pdf.setTextColor(90);
  sousLignes.forEach((l, i) => pdf.text(l, right, 29 + i * 5, { align: "right" }));
  return 50;
}

// Styles de tableau autoTable selon le modèle (en-tête plein de couleur,
// ou gris discret pour l'épuré).
function stylesTableau(theme: ThemePdf): {
  headStyles: UserOptions["headStyles"];
  alternateRowStyles: UserOptions["alternateRowStyles"];
} {
  if (theme.modele === "epure") {
    return {
      headStyles: { fillColor: [243, 243, 246], textColor: 30, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [255, 255, 255] },
    };
  }
  return {
    headStyles: { fillColor: theme.accent, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 244, 250] },
  };
}

/* ==================================================================
 *  Tampon du garage & mention "Acquittée"
 * ================================================================== */

// Dimensions du tampon (utilisées aussi pour les gardes de saut de page)
export const TAMPON_W = 66;
export const TAMPON_H = 34;

// Tampon AUTO-GÉNÉRÉ du garage (encre bleue, double liseré arrondi) :
// nom + adresse + tel + SIRET depuis le profil entreprise. Dessiné en bas
// des documents (facture, devis, OR, cession, restitution, RIB).
function drawTampon(pdf: jsPDF, ent: Partial<Entreprise>, x: number, y: number) {
  const ink: [number, number, number] = [37, 78, 170]; // bleu "encre de tampon"
  const w = TAMPON_W;
  const h = TAMPON_H;

  pdf.setDrawColor(...ink);
  pdf.setLineWidth(0.8);
  pdf.roundedRect(x, y, w, h, 3, 3);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(x + 1.7, y + 1.7, w - 3.4, h - 3.4, 2.2, 2.2);

  const cx = x + w / 2;
  const nom = (ent.nom || "Mon garage").toUpperCase();
  const infos = [
    ent.adresse || "",
    `${ent.code_postal || ""} ${ent.ville || ""}`.trim(),
    ent.tel ? `Tél : ${ent.tel}` : "",
    ent.siret ? `SIRET ${ent.siret}` : "",
  ].filter(Boolean);

  pdf.setTextColor(...ink);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(nom.length > 26 ? 7 : 8.5);
  // Nom éventuellement sur 2 lignes si très long
  const nomLignes = (pdf.splitTextToSize(nom, w - 8) as string[]).slice(0, 2);
  let yy = y + 7.5;
  nomLignes.forEach((l) => {
    pdf.text(l, cx, yy, { align: "center" });
    yy += 4;
  });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.6);
  // Espace restant réparti pour les lignes d'infos (max 4)
  infos.slice(0, 4).forEach((l) => {
    pdf.text(l, cx, yy, { align: "center", maxWidth: w - 6 });
    yy += 3.6;
  });

  // Reset styles pour la suite du document
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(30);
  pdf.setDrawColor(0);
}

// Tampon "ACQUITTÉE" (encre verte, légèrement incliné) apposé sur la facture
// réglée. cx/cy = centre du tampon.
function drawAcquittee(pdf: jsPDF, cx: number, cy: number) {
  const vert: [number, number, number] = [21, 128, 61];
  const w = 56;
  const h = 15;
  const deg = 8; // inclinaison visuelle (sens anti-horaire)
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Rotation anti-horaire VISUELLE dans le repère jsPDF (y vers le bas)
  const pt = (dx: number, dy: number): [number, number] => [
    cx + dx * cos + dy * sin,
    cy - dx * sin + dy * cos,
  ];
  const corners = [pt(-w / 2, -h / 2), pt(w / 2, -h / 2), pt(w / 2, h / 2), pt(-w / 2, h / 2)];
  pdf.setDrawColor(...vert);
  pdf.setLineWidth(0.9);
  for (let i = 0; i < 4; i += 1) {
    const [x1, y1] = corners[i];
    const [x2, y2] = corners[(i + 1) % 4];
    pdf.line(x1, y1, x2, y2);
  }
  pdf.setTextColor(...vert);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  const [tx, tyy] = pt(0, 1.9); // baseline centrée dans le cadre
  pdf.text("ACQUITTÉE", tx, tyy, { align: "center", angle: deg });
  // Reset
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(30);
  pdf.setDrawColor(0);
}

/* ==================================================================
 *  FACTURE / DEVIS (refonte v34)
 *
 *  Structure imposée :
 *   1. En-tête : garage, n°, date + bandeaux client / véhicule / sinistre
 *      / assurance / expert / durée de réparation.
 *   2. Tableau principal : Désignation | Qté | PU HT | Remise | Total HT
 *      (Total HT = PU HT diminué de la remise en %, multiplié par la Qté).
 *   3. Tableau des postes : T1, T2, T3, Peinture, Ingr. de peinture
 *      (ingrédients toujours au même temps que la peinture).
 *   4. Tableau des autres éléments retenus au rapport (si présents).
 *   5. Totaux + mode de règlement (choisi à la génération) + mentions
 *      légales obligatoires.
 *   6. Tampon du garage TOUJOURS en fin de document.
 *  Aucun bloc orphelin : chaque bloc réserve sa place avant d'être dessiné.
 * ================================================================== */

type Corps = NonNullable<UserOptions["body"]>;

// Nombre à la française sans espace insécable (non gérée par la police PDF)
function nombre(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })
    .format(n)
    .replace(/[  ]/g, " ");
}

// Coupe les mots plus larges que la colonne (VIN, email, référence sans
// espace) : sans ça, `splitTextToSize` les laisse déborder et le texte
// chevauche la colonne voisine.
function couperMotsLongs(pdf: jsPDF, texte: string, largeur: number): string {
  return texte
    .split(" ")
    .map((mot) => {
      if (pdf.getTextWidth(mot) <= largeur) return mot;
      let bout = "";
      const morceaux: string[] = [];
      for (const c of mot) {
        if (pdf.getTextWidth(bout + c) > largeur) {
          morceaux.push(bout);
          bout = c;
        } else {
          bout += c;
        }
      }
      if (bout) morceaux.push(bout);
      return morceaux.join(" ");
    })
    .join(" ");
}

// Bloc d'informations en colonnes, encadré (lisibilité de l'en-tête).
// Renvoie le y de fin du bloc.
function drawColonnes(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  cols: { titre: string; lignes: string[] }[],
  accent: [number, number, number]
): number {
  const pad = 4;
  const gap = 4;
  const colW = (w - pad * 2 - gap * (cols.length - 1)) / cols.length;
  // La mesure du texte dépend de la police courante : on la fixe AVANT de
  // découper, sinon les largeurs calculées ne correspondent pas au rendu.
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  const contenu = cols.map((c) => ({
    titre: c.titre,
    lignes: c.lignes
      .filter(Boolean)
      .flatMap((l) => pdf.splitTextToSize(couperMotsLongs(pdf, l, colW), colW) as string[]),
  }));
  const maxLignes = Math.max(1, ...contenu.map((c) => c.lignes.length));
  const h = 10.5 + (maxLignes - 1) * 3.9 + 4;

  pdf.setFillColor(247, 247, 251);
  pdf.setDrawColor(224, 224, 234);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(x, y, w, h, 1.6, 1.6, "FD");

  contenu.forEach((c, i) => {
    const cx = x + pad + i * (colW + gap);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.8);
    pdf.setTextColor(...accent);
    pdf.text(c.titre.toUpperCase(), cx, y + 5.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(55);
    pdf.text(c.lignes, cx, y + 10.5);
  });

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(30);
  pdf.setDrawColor(0);
  return y + h;
}

export async function generateDocumentPdf(
  doc: Document,
  lignes: DocumentLigne[],
  dossier: Dossier,
  modePaiement?: string | null
) {
  const pdf = await buildDocumentPdf(doc, lignes, dossier, modePaiement);
  const titre = doc.type === "devis" ? "DEVIS" : "FACTURE";
  pdf.save(`${doc.numero || titre}.pdf`);
}

// Visualisation dans le navigateur (sans téléchargement forcé)
export async function apercuDocumentPdf(
  doc: Document,
  lignes: DocumentLigne[],
  dossier: Dossier,
  modePaiement?: string | null
) {
  ouvrirPdf(await buildDocumentPdf(doc, lignes, dossier, modePaiement));
}

// Renvoie le PDF encodé en base64 (sans préfixe data:), pour pièce jointe email.
export async function documentPdfBase64(
  doc: Document,
  lignes: DocumentLigne[],
  dossier: Dossier,
  modePaiement?: string | null
): Promise<string> {
  const pdf = await buildDocumentPdf(doc, lignes, dossier, modePaiement);
  const uri = pdf.output("datauristring"); // data:application/pdf;...;base64,XXXX
  return uri.substring(uri.indexOf(",") + 1);
}

async function buildDocumentPdf(
  doc: Document,
  lignes: DocumentLigne[],
  dossier: Dossier,
  modePaiement?: string | null
): Promise<jsPDF> {
  const ent = await getEntreprise();
  const logo = await logoDataUrl(ent.logo_path);

  const pdf = new jsPDF();
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 14; // marge gauche/droite
  const W = pageW - M * 2;
  const right = pageW - M;
  const BAS = 26; // hauteur réservée au pied de page
  const estFacture = doc.type === "facture";
  const titre = estFacture ? "FACTURE" : "DEVIS";
  const theme = themePdf(ent);
  const accent = theme.accent;
  const mode = modePaiement || doc.mode_paiement || "virement";

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
    pdf.setTextColor(30);
  }

  // ---------- En-tête (page 1, selon le modèle du profil) ----------
  let ty = drawEnTete(pdf, ent, logo, theme, titre, [
    `N° ${doc.numero || "—"}`,
    `Date : ${dateFr(doc.date_document)}`,
  ]);
  drawFooter();

  // Réserve la hauteur d'un bloc : passe à la page suivante plutôt que de
  // laisser un titre, un tableau ou un total orphelin en bas de page.
  function reserver(h: number) {
    if (ty + h > pageH - BAS) {
      pdf.addPage();
      drawFooter();
      ty = 22;
    }
  }

  // ---------- Bandeaux d'informations ----------
  ty = drawColonnes(pdf, M, ty - 4, W, [
    {
      titre: estFacture ? "Facturé à" : "Client",
      lignes: [
        dossier.client_nom || "—",
        dossier.client_adresse || "",
        `${dossier.client_code_postal || ""} ${dossier.client_ville || ""}`.trim(),
        dossier.client_tel ? `Tél. ${dossier.client_tel}` : "",
        dossier.client_email || "",
      ],
    },
    {
      titre: "Véhicule",
      lignes: [
        dossier.marque_modele || "—",
        `Immat. : ${dossier.immatriculation || "—"}`,
        dossier.numero_serie ? `VIN : ${dossier.numero_serie}` : "",
        dossier.premiere_circulation ? `1re mise en circ. : ${dateFr(dossier.premiere_circulation)}` : "",
      ],
    },
    {
      titre: "Sinistre & assurance",
      lignes: [
        `N° sinistre : ${dossier.numero_sinistre || "—"}`,
        `Date du sinistre : ${dateFr(dossier.date_sinistre)}`,
        dossier.numero_police ? `Police n° ${dossier.numero_police}` : "",
        `Assureur : ${dossier.assureur || "—"}`,
        dossier.assureur_tel ? `Tél. ${dossier.assureur_tel}` : "",
      ],
    },
  ], accent) + 4;

  // v7.5 : plus de bandeau « Réparation » (dates d'entrée/sortie et durée
  // d'immobilisation retirés à la demande du garage).
  ty = drawColonnes(pdf, M, ty, W, [
    {
      titre: "Expertise",
      lignes: [
        `Cabinet : ${dossier.cabinet_expert || "—"}`,
        dossier.expert_nom ? `Expert : ${dossier.expert_nom}` : "",
      ],
    },
    {
      titre: "Références",
      lignes: [
        `Date d'expertise : ${dateFr(dossier.date_expertise)}`,
        dossier.reparateur ? `Réparateur : ${dossier.reparateur}` : "",
      ],
    },
  ], accent) + 7;

  // ---------- Tableaux ----------
  const { pieces, mo, autres } = groupeLignes(lignes);
  const totaux = computeTotaux(lignes, doc.tva);
  const tauxTva = Number(doc.tva) || 0;
  const remisesTotal = lignes.reduce((s, l) => s + montantRemiseLigne(l), 0);

  const finTableau = () =>
    (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? ty;

  // Un tableau = un titre + un en-tête + les lignes + un sous-total.
  // On ne le démarre que s'il reste la place pour son titre, son en-tête et
  // au moins deux lignes (sinon : page suivante).
  function drawTableau(
    titreTableau: string,
    entetes: [string, string, string, string, string],
    items: DocumentLigne[],
    libelleSousTotal: string,
    avecRemise: boolean
  ) {
    if (items.length === 0) return;
    reserver(34);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...accent);
    pdf.text(titreTableau, M, ty);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(30);

    const head = avecRemise
      ? [[entetes[0], entetes[1], entetes[2], entetes[3], entetes[4]]]
      : [[entetes[0], entetes[1], entetes[2], entetes[4]]];

    const body: Corps = items.map((l) => {
      const total = totalLigne(l);
      const pu = Number(l.prix_unitaire) || 0;
      const r = tauxRemise(l.remise);
      // Lignes à 0 € = opérations du rapport (D, R, P, G…) comprises dans la
      // main d'œuvre : on les affiche quand même, marquées "Inclus".
      const incluse = pu === 0 && total === 0;
      const cellules = [
        l.designation || "",
        nombre(Number(l.quantite) || 0),
        incluse ? "—" : euros(pu),
        r > 0 ? `${nombre(r)} %` : "—",
        incluse ? "Inclus" : euros(total),
      ];
      return avecRemise ? cellules : [cellules[0], cellules[1], cellules[2], cellules[4]];
    });

    const st = sousTotal(items);
    const foot: Corps = [
      [
        { content: libelleSousTotal, colSpan: avecRemise ? 4 : 3, styles: { halign: "right" } },
        { content: euros(st), styles: { halign: "right" } },
      ],
    ] as unknown as Corps;

    const colonnes: UserOptions["columnStyles"] = avecRemise
      ? {
          0: { cellWidth: "auto" },
          1: { cellWidth: 16, halign: "right" },
          2: { cellWidth: 28, halign: "right" },
          3: { cellWidth: 20, halign: "right" },
          4: { cellWidth: 30, halign: "right" },
        }
      : {
          0: { cellWidth: "auto" },
          1: { cellWidth: 16, halign: "right" },
          2: { cellWidth: 28, halign: "right" },
          3: { cellWidth: 30, halign: "right" },
        };

    autoTable(pdf, {
      startY: ty + 2.5,
      margin: { top: 22, left: M, right: M, bottom: BAS },
      tableWidth: W,
      head,
      body,
      foot,
      showHead: "everyPage",
      showFoot: "lastPage",
      rowPageBreak: "avoid", // aucune ligne coupée en deux pages
      ...stylesTableau(theme),
      footStyles: { fillColor: [238, 238, 245], textColor: 30, fontStyle: "bold" },
      styles: {
        fontSize: 8.6,
        cellPadding: 2.2,
        overflow: "linebreak",
        valign: "middle",
        lineColor: [222, 222, 232],
        lineWidth: 0.1,
      },
      columnStyles: colonnes,
      didDrawPage: () => drawFooter(),
    });

    ty = finTableau() + 8;
  }

  // 1. Tableau principal — toujours avec la colonne Remise
  drawTableau(
    "Pièces, fournitures & prestations",
    ["Désignation", "Qté", "PU HT", "Remise", "Total HT"],
    pieces,
    "Sous-total HT",
    true
  );

  // 2. Postes de main d'œuvre : T1, T2, T3, Peinture, Ingr. de peinture
  drawTableau(
    "Main d'œuvre & peinture",
    ["Poste", "Temps (h)", "Taux horaire HT", "Remise", "Total HT"],
    mo,
    "Sous-total HT",
    mo.some((l) => tauxRemise(l.remise) > 0)
  );

  // 3. Autres éléments retenus au rapport
  drawTableau(
    "Autres éléments retenus au rapport",
    ["Désignation", "Qté", "PU HT", "Remise", "Total HT"],
    autres,
    "Sous-total HT",
    autres.some((l) => tauxRemise(l.remise) > 0)
  );

  // ---------- Totaux + règlement (bloc insécable) ----------
  const lignesTotaux: [string, string][] = [["Total HT", euros(totaux.ht)]];
  if (remisesTotal > 0) {
    lignesTotaux.push(["Dont remises accordées", `- ${euros(remisesTotal)}`]);
  }
  lignesTotaux.push([
    tauxTva > 0 ? `TVA (${nombre(tauxTva)} %)` : "TVA (non applicable)",
    euros(totaux.tva),
  ]);

  const hBloc = 8 + lignesTotaux.length * 5.4 + 14;
  reserver(hBloc + 6);
  const yBloc = ty;
  const xTot = M + W - 84;

  // Encadré des totaux (à droite)
  pdf.setFillColor(247, 247, 251);
  pdf.setDrawColor(...accent);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(xTot, yBloc, 84, hBloc, 1.6, 1.6, "FD");
  pdf.setFontSize(9);
  lignesTotaux.forEach((l, i) => {
    const yl = yBloc + 8 + i * 5.4;
    pdf.setTextColor(70);
    pdf.text(l[0], xTot + 4, yl);
    pdf.text(l[1], xTot + 80, yl, { align: "right" });
  });
  const ySep = yBloc + 8 + lignesTotaux.length * 5.4;
  pdf.setDrawColor(...accent);
  pdf.setLineWidth(0.4);
  pdf.line(xTot + 4, ySep, xTot + 80, ySep);
  pdf.setFontSize(11.5);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...accent);
  pdf.text(estFacture ? "NET À PAYER TTC" : "TOTAL TTC", xTot + 4, ySep + 7);
  pdf.text(euros(totaux.ttc), xTot + 80, ySep + 7, { align: "right" });
  pdf.setFont("helvetica", "normal");

  // Encadré règlement (à gauche, même hauteur)
  const wReg = W - 90;
  pdf.setFillColor(252, 252, 254);
  pdf.setDrawColor(224, 224, 234);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(M, yBloc, wReg, hBloc, 1.6, 1.6, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.8);
  pdf.setTextColor(...accent);
  pdf.text(estFacture ? "RÈGLEMENT" : "VALIDITÉ", M + 4, yBloc + 5.5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(55);

  const infosReglement = estFacture
    ? [
        `Mode de règlement : ${labelModeReglement(mode)}`,
        `Échéance : ${doc.date_echeance ? dateFr(doc.date_echeance) : "à réception de la facture"}`,
        mode === "cheque" ? `Chèque à l'ordre de ${ent.nom || "—"}` : "",
        mode === "virement" || mode === "prelevement" || mode === "assurance"
          ? [ent.iban ? `IBAN ${ent.iban}` : "", ent.bic ? `BIC ${ent.bic}` : ""].filter(Boolean).join("   ·   ")
          : "",
        mode === "assurance"
          ? "Facture réglée directement par l'assureur (cession de créance / prise en charge)."
          : "",
      ]
    : [
        "Devis gratuit, valable 30 jours à compter de sa date d'émission.",
        "Bon pour accord : date, signature et mention « Bon pour accord ».",
      ];
  const txtReg = (infosReglement.filter(Boolean).join("\n") || "—");
  pdf.text(pdf.splitTextToSize(txtReg, wReg - 8) as string[], M + 4, yBloc + 10.5);

  ty = yBloc + hBloc + 8;

  // ---------- Mention "Acquittée" (facture réglée, case cochée) ----------
  if (estFacture && doc.acquitte) {
    reserver(20);
    drawAcquittee(pdf, M + 34, ty + 5);
    ty += 18;
  }

  // ---------- Mentions obligatoires ----------
  // Toujours imprimées, QUEL QUE SOIT le modèle choisi : échéance, pénalités
  // de retard, indemnité forfaitaire de recouvrement, escompte, et art. 293 B
  // du CGI si la facture est établie sans TVA (franchise en base).
  const mentionsObligatoires = estFacture
    ? [
        `Travaux exécutés conformément au rapport d'expertise${dossier.cabinet_expert ? ` du cabinet ${dossier.cabinet_expert}` : ""} et à l'ordre de réparation signé par le client.`,
        `Échéance de paiement : ${doc.date_echeance ? dateFr(doc.date_echeance) : "à réception de la facture"} — mode de règlement : ${labelModeReglement(mode)}.`,
        tauxTva === 0 ? "TVA non applicable, art. 293 B du CGI." : "",
        "En cas de retard de paiement : pénalités exigibles au taux de trois fois le taux d'intérêt légal (art. L441-10 C. com.) et, pour les clients professionnels, indemnité forfaitaire de recouvrement de 40 € (art. D441-5 C. com.).",
        "Escompte pour paiement anticipé : néant. Les remises éventuelles figurent, poste par poste, dans la colonne « Remise » des tableaux ci-dessus.",
        "Réserve de propriété : les pièces fournies restent la propriété du garage jusqu'au complet paiement de la facture (loi n° 80-335 du 12 mai 1980).",
      ].filter(Boolean)
    : ["Devis gratuit, valable 30 jours à compter de sa date d'émission. Tous travaux supplémentaires feront l'objet d'un accord préalable."];

  {
    const txtMentions = pdf.splitTextToSize(mentionsObligatoires.join("\n"), W) as string[];
    reserver(txtMentions.length * 3.6 + 6);
    pdf.setFontSize(7.6);
    pdf.setTextColor(115);
    pdf.text(txtMentions, M, ty);
    ty += txtMentions.length * 3.6 + 4;
  }

  // ---------- Notes ----------
  if (doc.notes) {
    const lignesNotes = pdf.splitTextToSize(doc.notes, W) as string[];
    reserver(lignesNotes.length * 4.2 + 12);
    pdf.setFontSize(9);
    pdf.setTextColor(90);
    pdf.text("Notes :", M, ty);
    pdf.text(lignesNotes, M, ty + 5);
    ty += 5 + lignesNotes.length * 4.2 + 6;
  }

  // ---------- Tampon du garage + signature ----------
  // v7.5 : le tampon suit IMMÉDIATEMENT les mentions de fin. Il était épinglé
  // en bas de page, ce qui laissait un grand vide au milieu de la facture.
  reserver(TAMPON_H + 20);
  const yFin = ty + 4;
  drawTampon(pdf, ent, M, yFin);

  if (doc.signature) {
    const w = 70;
    const h = 30;
    const x = right - w;
    pdf.setFontSize(9);
    pdf.setTextColor(30);
    pdf.text("Signature du client :", x, yFin - 2);
    pdf.setDrawColor(180);
    pdf.setLineWidth(0.3);
    pdf.rect(x, yFin, w, h);
    try {
      pdf.addImage(doc.signature, "PNG", x + 2, yFin + 2, w - 4, h - 4);
    } catch { /* dataURL invalide */ }
    pdf.setFontSize(7.5);
    pdf.setTextColor(90);
    const infosSig = [
      doc.signataire_nom ? `Nom : ${doc.signataire_nom}` : "",
      doc.signe_le ? `Signé le ${dateFr(doc.signe_le)}` : "",
    ].filter(Boolean).join("   ·   ");
    if (infosSig) pdf.text(infosSig, x, yFin + h + 4);
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
  const theme = themePdf(ent);

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

  const sousLignes = [
    ...(numero ? [`N° ${numero}`] : []),
    `Date : ${dateFr(date)}`,
  ];
  const y = drawEnTete(pdf, ent, logo, theme, titre, sousLignes);

  return { pdf, pageW, pageH, M, right, y, ent };
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
// Dessine aussi le tampon auto-généré du garage à gauche.
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
  drawTampon(pdf, ctx.ent, ctx.M, ctx.y + 3);
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
  const pdf = await buildOrdreReparationPdf(or, dossier);
  pdf.save(`${or.numero || "ordre-reparation"}.pdf`);
}

export async function apercuOrdreReparationPdf(or: OrdreReparation, dossier: Dossier) {
  ouvrirPdf(await buildOrdreReparationPdf(or, dossier));
}

// Comme documentPdfBase64, mais va chercher les lignes tout seul
// (pour joindre facilement d'AUTRES documents du dossier à un email).
export async function documentPdfBase64Auto(doc: Document, dossier: Dossier): Promise<string> {
  const { data } = await supabase
    .from("document_lignes")
    .select("*")
    .eq("document_id", doc.id)
    .order("ordre", { ascending: true });
  return documentPdfBase64(doc, (data as DocumentLigne[]) || [], dossier);
}

// RIB du garage (coordonnées bancaires du profil) en PDF, pour pièce jointe.
export async function ribPdfBase64(): Promise<string> {
  const ent = await getEntreprise();

  // RIB OFFICIEL uploadé dans le Profil du garage → prioritaire sur le RIB
  // généré depuis IBAN/BIC (v26). Depuis la v33 il vit dans le bucket PRIVÉ
  // 'prive' (le bucket 'entreprise' est public → un RIB y était accessible
  // par simple URL) ; repli sur 'entreprise' pour les anciens fichiers.
  if (ent.rib_path) {
    try {
      let { data } = await supabase.storage.from("prive").download(ent.rib_path);
      if (!data) {
        ({ data } = await supabase.storage.from("entreprise").download(ent.rib_path));
      }
      if (data) {
        const bytes = new Uint8Array(await data.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 1) {
          bin += String.fromCharCode(bytes[i]);
        }
        return btoa(bin);
      }
    } catch {
      /* fichier introuvable → on retombe sur le RIB généré */
    }
  }

  const logo = await logoDataUrl(ent.logo_path);
  const pdf = new jsPDF();
  const pageW = pdf.internal.pageSize.getWidth();
  const M = 14;
  const accentRib = themePdf(ent).accent;

  let headerX = M;
  if (logo) {
    try {
      pdf.addImage(logo, "PNG", M, 12, 26, 26);
      headerX = M + 32;
    } catch { /* format non supporté */ }
  }
  pdf.setFontSize(16);
  pdf.setTextColor(...accentRib);
  pdf.text(ent.nom || "Mon garage", headerX, 19);
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  pdf.text(
    [
      ent.adresse || "",
      `${ent.code_postal || ""} ${ent.ville || ""}`.trim(),
      ent.siret ? `SIRET ${ent.siret}` : "",
    ].filter(Boolean),
    headerX,
    26
  );

  pdf.setFontSize(15);
  pdf.setTextColor(30);
  pdf.text("RELEVÉ D'IDENTITÉ BANCAIRE", pageW / 2, 60, { align: "center" });

  pdf.setDrawColor(...accentRib);
  pdf.setLineWidth(0.5);
  pdf.rect(M + 10, 70, pageW - (M + 10) * 2, 46);

  pdf.setFontSize(10);
  pdf.setTextColor(90);
  pdf.text("Titulaire :", M + 18, 82);
  pdf.text("IBAN :", M + 18, 92);
  pdf.text("BIC :", M + 18, 102);
  pdf.setFontSize(11);
  pdf.setTextColor(30);
  pdf.text(ent.nom || "—", M + 48, 82);
  pdf.text(ent.iban || "—", M + 48, 92);
  pdf.text(ent.bic || "—", M + 48, 102);

  pdf.setFontSize(8.5);
  pdf.setTextColor(120);
  pdf.text("Merci d'utiliser ces coordonnées pour vos règlements par virement.", pageW / 2, 126, { align: "center" });

  // Tampon auto-généré du garage (authentifie le RIB)
  drawTampon(pdf, ent, (pageW - TAMPON_W) / 2, 136);

  const uri = pdf.output("datauristring");
  return uri.substring(uri.indexOf(",") + 1);
}

// Base64 (sans préfixe data:) pour pièce jointe email.
export async function ordreReparationPdfBase64(or: OrdreReparation, dossier: Dossier): Promise<string> {
  const pdf = await buildOrdreReparationPdf(or, dossier);
  const uri = pdf.output("datauristring");
  return uri.substring(uri.indexOf(",") + 1);
}

// Le champ travaux généré par l'appli est structuré :
// "- DÉSIGNATION (xN) — 123.45 € HT". On le re-parse pour dresser un vrai
// tableau ; les lignes libres restent en paragraphe.
function lignesDepuisTravaux(travaux: string | null): {
  intro: string;
  lignes: { designation: string; montant: number | null }[];
  libre: string;
} {
  const intro: string[] = [];
  const lignes: { designation: string; montant: number | null }[] = [];
  const libre: string[] = [];
  // Tolère - – — comme séparateur et « € » avec ou sans « HT »
  const regex = /^[-•]\s*(.+?)\s*(?:[—–-]\s*([\d\s.,]+)\s*€(?:\s*HT)?)?\s*$/;
  for (const brute of (travaux || "").split("\n")) {
    const t = brute.trim();
    if (!t) continue;
    // Même famille de puces que la regex ci-dessus (- ou •) — l'ancien
    // startsWith("-") ignorait les lignes à puce « • ».
    if (!/^[-•]/.test(t)) {
      (lignes.length === 0 ? intro : libre).push(t);
      continue;
    }
    const m = t.match(regex);
    if (m) {
      // Parse FR robuste : "1 234,56" et "1.234,56" OK ; si le résultat
      // n'est pas un nombre fini, on n'imprime PAS "NaN €" sur l'OR.
      let montant: number | null = null;
      if (m[2]) {
        let brut = m[2].replace(/\s/g, "");
        if (brut.includes(",")) brut = brut.replace(/\./g, "").replace(",", ".");
        const n = Number(brut);
        montant = Number.isFinite(n) ? n : null;
      }
      lignes.push({ designation: m[1].trim(), montant });
    } else {
      libre.push(t.replace(/^[-•]\s*/, ""));
    }
  }
  return { intro: intro.join(" "), lignes, libre: libre.join("\n") };
}

// ORDRE DE RÉPARATION : mise en page calquée sur la facture — charte du
// garage, tableau du chiffrage, total, conditions, autorisation légale et
// signature, avec sauts de page propres (aucun bloc orphelin).
async function buildOrdreReparationPdf(or: OrdreReparation, dossier: Dossier): Promise<jsPDF> {
  const ent = await getEntreprise();
  const estVitrage = (await getMetierPdf()) === "vitrage";
  const titreDoc = estVitrage ? "ORDRE D'INTERVENTION" : "ORDRE DE RÉPARATION";
  const logo = await logoDataUrl(ent.logo_path);

  const pdf = new jsPDF();
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 14;
  const right = pageW - M;
  const theme = themePdf(ent);
  const accent = theme.accent;

  const pied = [
    [ent.nom, ent.siret ? `SIRET ${ent.siret}` : "", ent.tva_intra ? `TVA ${ent.tva_intra}` : ""]
      .filter(Boolean).join("  -  "),
    ent.mentions || "",
  ].filter(Boolean);

  function drawFooter() {
    pdf.setFontSize(7.5);
    pdf.setTextColor(150);
    pied.forEach((line, i) => {
      pdf.text(line, pageW / 2, pageH - 14 + i * 4, { align: "center" });
    });
  }

  // ---------- En-tête (charte du garage, selon le modèle du profil) ----------
  const yBlocs = drawEnTete(pdf, ent, logo, theme, titreDoc, [
    `N° ${or.numero || "—"}`,
    `Date : ${dateFr(or.date_or)}`,
  ]);
  pdf.setFontSize(10);
  pdf.setTextColor(30);
  pdf.text("Client (donneur d'ordre)", M, yBlocs);
  pdf.text("Véhicule & sinistre", pageW / 2 + 6, yBlocs);
  pdf.setTextColor(70);
  pdf.setFontSize(9);
  pdf.text(
    [
      dossier.client_nom || "—",
      dossier.client_adresse || "",
      `${dossier.client_code_postal || ""} ${dossier.client_ville || ""}`.trim(),
      dossier.client_tel ? `Tel : ${dossier.client_tel}` : "",
    ].filter(Boolean),
    M, yBlocs + 6
  );
  pdf.text(
    [
      dossier.marque_modele || "—",
      `Immat. : ${dossier.immatriculation || "—"}`,
      `N° sinistre : ${dossier.numero_sinistre || "—"}`,
      `Assureur : ${dossier.assureur || "—"}`,
      dossier.reparateur ? `Réparateur attitré : ${dossier.reparateur}` : "",
    ].filter(Boolean),
    pageW / 2 + 6, yBlocs + 6
  );

  // ---------- Tableau des travaux (conforme au chiffrage) ----------
  const { intro, lignes, libre } = lignesDepuisTravaux(or.travaux);
  let ty: number;

  if (lignes.length > 0) {
    autoTable(pdf, {
      startY: yBlocs + 34,
      margin: { top: 20, left: M, right: M, bottom: 26 },
      tableWidth: pageW - M * 2,
      head: [["Désignation des travaux", "Montant HT"]],
      // Montants EXACTS du chiffrage ; pas de montant → cellule vide
      body: lignes.map((l) => [l.designation, l.montant != null ? euros(l.montant) : ""]),
      ...stylesTableau(theme),
      styles: { fontSize: 9, cellPadding: 2.5, overflow: "linebreak", valign: "middle" },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 36, halign: "right" },
      },
      didDrawPage: () => drawFooter(),
    });
    ty = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yBlocs + 60) + 8;
    if (intro) {
      if (ty > pageH - 40) { pdf.addPage(); drawFooter(); ty = 25; }
      pdf.setFontSize(8.5);
      pdf.setTextColor(110);
      pdf.text(intro, M, ty);
      ty += 8;
    }
  } else {
    // Travaux en texte libre (OR réécrit à la main)
    drawFooter();
    pdf.setFontSize(10);
    pdf.setTextColor(30);
    pdf.text("Travaux à réaliser", M, yBlocs + 34);
    pdf.setFontSize(9);
    pdf.setTextColor(70);
    const txt = pdf.splitTextToSize(or.travaux || "Réparations selon rapport d'expertise.", pageW - M * 2) as string[];
    pdf.text(txt, M, yBlocs + 41);
    ty = yBlocs + 41 + txt.length * 4.2 + 8;
  }

  if (libre) {
    if (ty > pageH - 45) { pdf.addPage(); drawFooter(); ty = 25; }
    pdf.setFontSize(9);
    pdf.setTextColor(70);
    const txt = pdf.splitTextToSize(libre, pageW - M * 2) as string[];
    pdf.text(txt, M, ty);
    ty += txt.length * 4.2 + 6;
  }

  // ---------- Total (jamais orphelin) ----------
  const totalHt = or.montant_ht != null
    ? Number(or.montant_ht) || 0
    : lignes.reduce((s, l) => s + (l.montant || 0), 0);
  if (ty > pageH - 50) { pdf.addPage(); drawFooter(); ty = 25; }
  const labelX = right - 55;
  pdf.setDrawColor(...accent);
  pdf.setLineWidth(0.4);
  pdf.line(labelX - 5, ty, right, ty);
  pdf.setFontSize(12);
  pdf.setTextColor(...accent);
  pdf.text("Total HT", labelX, ty + 6, { align: "right" });
  pdf.text(euros(totalHt), right, ty + 6, { align: "right" });
  pdf.setFontSize(8);
  pdf.setTextColor(110);
  pdf.text(
    estVitrage
      ? "Montant conforme au devis. TVA en sus — détail sur la facture."
      : "Montant conforme au chiffrage du rapport d'expertise. TVA en sus — détail sur la facture.",
    right,
    ty + 12,
    { align: "right" }
  );
  ty += 20;

  // ---------- Conditions ----------
  const conditions = [
    or.date_debut ? `Début prévu des travaux : ${dateFr(or.date_debut)}` : "",
    or.date_fin ? `Fin prévue : ${dateFr(or.date_fin)}` : "",
    "Tous travaux supplémentaires feront l'objet d'un accord préalable du client.",
    "Le véhicule sera restitué contre signature d'un procès-verbal de restitution.",
  ].filter(Boolean);
  if (ty + 6 + conditions.length * 4.6 > pageH - 30) { pdf.addPage(); drawFooter(); ty = 25; }
  pdf.setFontSize(10);
  pdf.setTextColor(30);
  pdf.text("Conditions", M, ty);
  pdf.setFontSize(9);
  pdf.setTextColor(70);
  pdf.text(conditions, M, ty + 6);
  ty += 6 + conditions.length * 4.6 + 8;

  // ---------- Autorisation + signature : BLOC INSÉCABLE ----------
  const autorisation = pdf.splitTextToSize(AUTORISATION_OR, pageW - M * 2) as string[];
  const hBloc = 6 + autorisation.length * 4.2 + 8 + 52;
  if (ty + hBloc > pageH - 26) { pdf.addPage(); drawFooter(); ty = 25; }
  pdf.setFontSize(10);
  pdf.setTextColor(30);
  pdf.text("Autorisation du client", M, ty);
  pdf.setFontSize(9);
  pdf.setTextColor(70);
  pdf.text(autorisation, M, ty + 6);
  ty += 6 + autorisation.length * 4.2 + 8;

  const w = 70;
  const h = 32;
  const x = right - w;
  pdf.setFontSize(9);
  pdf.setTextColor(30);
  pdf.text("Bon pour accord — signature du client :", M, ty + 8);
  // Tampon auto-généré du garage, sous le libellé, face à la signature
  drawTampon(pdf, ent, M, ty + 12);
  pdf.setDrawColor(180);
  pdf.setLineWidth(0.3);
  pdf.rect(x, ty + 3, w, h);
  if (or.signature) {
    try {
      pdf.addImage(or.signature, "PNG", x + 2, ty + 5, w - 4, h - 4);
    } catch { /* dataURL invalide */ }
  }
  pdf.setFontSize(8.5);
  pdf.setTextColor(90);
  const infosSig = [
    or.signataire_nom ? `Nom : ${or.signataire_nom}` : "",
    or.signe_le ? `Signé le ${dateFr(or.signe_le)}` : "",
  ].filter(Boolean);
  if (infosSig.length) pdf.text(infosSig, x, ty + h + 8);

  return pdf;
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
  const pdf = await buildRestitutionPdf(rest, dossier);
  pdf.save(`restitution-${dossier.immatriculation || dossier.numero_sinistre || "vehicule"}.pdf`);
}

export async function apercuRestitutionPdf(rest: Restitution, dossier: Dossier) {
  ouvrirPdf(await buildRestitutionPdf(rest, dossier));
}

export async function apercuCessionPdf(cession: CessionCreance, dossier: Dossier) {
  ouvrirPdf(await buildCessionPdf(cession, dossier));
}

async function buildRestitutionPdf(rest: Restitution, dossier: Dossier): Promise<jsPDF> {
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

  return ctx.pdf;
}
