// Helpers Pièces du dossier : types attendus + complétude.

import { Dossier, PieceDossier } from "./types";

export const TYPES_PIECES: { type: string; label: string; essentiel: boolean }[] = [
  { type: "carte_grise", label: "Carte grise", essentiel: true },
  { type: "constat", label: "Constat amiable", essentiel: true },
  { type: "permis", label: "Permis de conduire", essentiel: false },
  { type: "rapport_definitif", label: "Rapport définitif de l'expert", essentiel: false },
  // Accord de prise en charge : affiché uniquement si le dossier est en mode
  // prise en charge (filtré dans PiecesPanel via dossier.mode_pec).
  { type: "prise_en_charge", label: "Accord de prise en charge (rempli)", essentiel: false },
  { type: "autre", label: "Autres pièces", essentiel: false },
];

// L'accord de prise en charge rempli est-il joint au dossier ?
export function accordPecJoint(pieces: Pick<PieceDossier, "type">[]): boolean {
  return pieces.some((p) => p.type === "prise_en_charge");
}

export function labelPiece(type: string): string {
  return TYPES_PIECES.find((t) => t.type === type)?.label || type;
}

// Pièces essentielles : carte grise + constat + rapport d'expertise
// (le rapport initial vit sur dossier.rapport_path).
export function completudePieces(
  dossier: Pick<Dossier, "rapport_path">,
  pieces: Pick<PieceDossier, "type">[]
): { presentes: number; total: number; manquantes: string[] } {
  const manquantes: string[] = [];
  if (!pieces.some((p) => p.type === "carte_grise")) manquantes.push("carte grise");
  if (!pieces.some((p) => p.type === "constat")) manquantes.push("constat amiable");
  if (!dossier.rapport_path) manquantes.push("rapport d'expertise");
  const total = 3;
  return { presentes: total - manquantes.length, total, manquantes };
}
