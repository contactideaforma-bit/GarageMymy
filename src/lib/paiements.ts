import { Document, Paiement } from "./types";

export const MOYENS: Record<string, string> = {
  virement: "Virement",
  cheque: "Chèque",
  cb: "Carte bancaire",
  especes: "Espèces",
  autre: "Autre",
};

export const CANAUX: Record<string, string> = {
  email: "Email",
  telephone: "Téléphone",
  courrier: "Courrier",
  autre: "Autre",
};

export function labelMoyen(m: string | null): string {
  return (m && MOYENS[m]) || m || "—";
}
export function labelCanal(c: string | null): string {
  return (c && CANAUX[c]) || c || "—";
}

export type StatutPaiementKey = "impaye" | "partiel" | "paye";

export const STATUT_PAIEMENT: Record<StatutPaiementKey, { label: string; badge: string }> = {
  impaye: { label: "Impayé", badge: "bg-rose-100 text-rose-700" },
  partiel: { label: "Partiel", badge: "bg-amber-100 text-amber-700" },
  paye: { label: "Payé", badge: "bg-emerald-100 text-emerald-700" },
};

// Somme des paiements d'une facture
export function totalPaye(paiements: Paiement[]): number {
  return paiements.reduce((s, p) => s + (Number(p.montant) || 0), 0);
}

// Statut d'encaissement dérivé du total TTC et du montant reçu
export function statutPaiement(totalTtc: number | null, paye: number): StatutPaiementKey {
  const ttc = Number(totalTtc) || 0;
  if (paye <= 0) return "impaye";
  if (paye + 0.01 < ttc) return "partiel"; // tolérance d'arrondi
  return "paye";
}

export function resteAPayer(totalTtc: number | null, paye: number): number {
  return Math.max(0, (Number(totalTtc) || 0) - paye);
}

// Une facture est en retard si une échéance est dépassée et qu'il reste à payer
export function enRetard(doc: Pick<Document, "date_echeance">, reste: number): boolean {
  if (reste <= 0) return false;
  if (!doc.date_echeance) return false;
  const ech = new Date(doc.date_echeance);
  if (isNaN(ech.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return ech < today;
}
