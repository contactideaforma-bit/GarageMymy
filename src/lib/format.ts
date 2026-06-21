export function formatEuros(value: number | null | undefined): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR");
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------- Pipeline de statut du dossier ----------
export const STATUTS_ORDRE = [
  "nouveau",
  "expertise",
  "devis",
  "reparation",
  "facture",
  "paye",
  "cloture",
] as const;

export type StatutKey = (typeof STATUTS_ORDRE)[number];

export const STATUTS_INFO: Record<
  string,
  { label: string; badge: string; dot: string }
> = {
  nouveau: { label: "Nouveau", badge: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  expertise: { label: "Expertise", badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  devis: { label: "Devis", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  reparation: { label: "Réparation", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  facture: { label: "Facturé", badge: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-500" },
  paye: { label: "Payé", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  cloture: { label: "Clôturé", badge: "bg-slate-200 text-slate-500", dot: "bg-slate-400" },
  // valeurs héritées de la v0
  en_cours: { label: "En cours", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  en_attente: { label: "En attente", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  termine: { label: "Terminé", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
};

export function labelStatut(statut: string): string {
  return STATUTS_INFO[statut]?.label || statut;
}

export function badgeStatut(statut: string): string {
  return STATUTS_INFO[statut]?.badge || "bg-slate-100 text-slate-700";
}

// Un dossier est "actif" tant qu'il n'est pas clôturé
export function estActif(statut: string): boolean {
  return statut !== "cloture";
}
