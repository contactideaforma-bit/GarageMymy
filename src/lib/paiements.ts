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

// ---------- Relances graduées ----------
// Niveau 1 : courtoise · Niveau 2 : ferme · Niveau 3+ : mise en demeure.
export function templateRelance(
  niveau: number,
  f: { numero?: string | null; total_ttc?: number | null; date_echeance?: string | null },
  d: { numero_sinistre?: string | null; client_nom?: string | null }
): { subject: string; body: string } {
  const montant = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    Number(f.total_ttc) || 0
  );
  const ech = f.date_echeance
    ? ` (échéance du ${new Date(f.date_echeance).toLocaleDateString("fr-FR")})`
    : "";
  const ref = `facture ${f.numero || ""} — sinistre ${d.numero_sinistre || "—"}${
    d.client_nom ? ` (${d.client_nom})` : ""
  }`;

  if (niveau <= 1) {
    return {
      subject: `Relance — ${ref}`,
      body: `Bonjour,\n\nSauf erreur de notre part, la ${ref}, d'un montant de ${montant}, reste à ce jour impayée${ech}.\n\nNous vous remercions de bien vouloir procéder à son règlement, ou de nous indiquer la date de mise en paiement prévue.\n\nRestant à votre disposition,\nCordialement.`,
    };
  }
  if (niveau === 2) {
    return {
      subject: `Relance n°2 — ${ref}`,
      body: `Bonjour,\n\nMalgré notre précédente relance, la ${ref}, d'un montant de ${montant}, demeure impayée${ech}.\n\nNous vous demandons de procéder à son règlement sous 8 jours, ou à défaut de nous communiquer par retour le motif du blocage et la date de mise en paiement.\n\nDans cette attente,\nCordialement.`,
    };
  }
  return {
    subject: `MISE EN DEMEURE — ${ref}`,
    body: `Bonjour,\n\nMalgré nos relances restées sans effet, la ${ref}, d'un montant de ${montant}, demeure impayée${ech}.\n\nPar la présente, nous vous mettons en demeure de procéder à son règlement sous HUIT (8) JOURS à compter de la réception de ce courriel.\n\nÀ défaut, des pénalités de retard ainsi que l'indemnité forfaitaire de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce) seront exigibles, et nous nous réservons le droit d'engager toute action en recouvrement.\n\nCordialement.`,
  };
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
