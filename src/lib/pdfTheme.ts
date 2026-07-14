// Apparence des PDF (v31) : modèle de mise en page + couleur d'accent,
// choisis dans le Profil du garage et appliqués par lib/pdf.ts.
//
// IMPORTANT — CONFORMITÉ : le modèle ne change QUE le style (en-tête, tableau,
// couleurs). Les mentions obligatoires d'une facture (identité des parties,
// n° et date, détail des lignes, totaux HT/TVA/TTC, échéance, pénalités de
// retard, indemnité de recouvrement, escompte…) sont dessinées dans pdf.ts
// pour TOUS les modèles, sans exception.

import { Entreprise } from "./types";

export type ModelePdf = "classique" | "bandeau" | "epure";

export const MODELES_PDF: { code: ModelePdf; label: string; description: string }[] = [
  {
    code: "classique",
    label: "Classique",
    description: "Logo et coordonnées à gauche, titre à droite. Le modèle historique.",
  },
  {
    code: "bandeau",
    label: "Bandeau",
    description: "Grand bandeau de couleur en tête, texte blanc. Moderne et affirmé.",
  },
  {
    code: "epure",
    label: "Épuré",
    description: "Noir et blanc, fine ligne de couleur, tableau discret. Sobre et élégant.",
  },
];

export const COULEURS_PDF: { hex: string; label: string }[] = [
  { hex: "#7c5cf6", label: "Violet" },
  { hex: "#2563eb", label: "Bleu" },
  { hex: "#0d9488", label: "Turquoise" },
  { hex: "#16a34a", label: "Vert" },
  { hex: "#d97706", label: "Ambre" },
  { hex: "#dc2626", label: "Rouge" },
  { hex: "#db2777", label: "Rose" },
  { hex: "#334155", label: "Anthracite" },
];

export const MODELE_PDF_DEFAUT: ModelePdf = "classique";
export const COULEUR_PDF_DEFAUT = "#7c5cf6";

export function hexToRgb(hex: string | null | undefined): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return hexToRgb(COULEUR_PDF_DEFAUT);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Thème résolu depuis le profil entreprise (défauts sûrs si colonnes absentes).
export function themePdf(ent: Partial<Entreprise>): {
  modele: ModelePdf;
  accent: [number, number, number];
  accentHex: string;
} {
  const modele: ModelePdf =
    ent.modele_pdf === "bandeau" || ent.modele_pdf === "epure" ? ent.modele_pdf : MODELE_PDF_DEFAUT;
  const accentHex = /^#?[0-9a-f]{6}$/i.test((ent.couleur_pdf || "").trim())
    ? (ent.couleur_pdf as string)
    : COULEUR_PDF_DEFAUT;
  return { modele, accent: hexToRgb(accentHex), accentHex };
}
