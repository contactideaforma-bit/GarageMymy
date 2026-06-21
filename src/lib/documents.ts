import { DocumentLigne, DocumentType } from "./types";

export type LigneSaisie = {
  designation: string;
  quantite: string;
  prix_unitaire: string;
};

export function computeTotaux(
  lignes: { quantite: number | string | null; prix_unitaire: number | string | null }[],
  tva: number | string | null
) {
  const ht = lignes.reduce(
    (s, l) => s + (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0),
    0
  );
  const taux = Number(tva) || 0;
  const montantTva = ht * (taux / 100);
  return { ht, tva: montantTva, ttc: ht + montantTva };
}

export function genNumero(type: DocumentType): string {
  const d = new Date();
  const prefix = type === "devis" ? "DEV" : "FAC";
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${prefix}-${ym}-${String(Date.now()).slice(-5)}`;
}

export const STATUTS_DOC: Record<string, { label: string; badge: string }> = {
  brouillon: { label: "Brouillon", badge: "bg-slate-100 text-slate-700" },
  envoye: { label: "Envoyé", badge: "bg-blue-100 text-blue-700" },
  accepte: { label: "Accepté", badge: "bg-emerald-100 text-emerald-700" },
  refuse: { label: "Refusé", badge: "bg-rose-100 text-rose-700" },
  paye: { label: "Payé", badge: "bg-emerald-100 text-emerald-700" },
};

export function labelStatutDoc(s: string): string {
  return STATUTS_DOC[s]?.label || s;
}
export function badgeStatutDoc(s: string): string {
  return STATUTS_DOC[s]?.badge || "bg-slate-100 text-slate-700";
}

export function lignesToDb(lignes: LigneSaisie[]): Omit<DocumentLigne, "id" | "document_id">[] {
  return lignes
    .filter((l) => l.designation.trim() !== "")
    .map((l, i) => ({
      designation: l.designation,
      quantite: Number(l.quantite) || 0,
      prix_unitaire: Number(l.prix_unitaire) || 0,
      ordre: i,
    }));
}
