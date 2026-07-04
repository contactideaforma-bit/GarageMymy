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
  "rendu",
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
  rendu: { label: "Véhicule rendu", badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
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

// ---------- Progression du dossier (barre rétro) ----------
// 100 % = dossier complet ET payé.
const PROGRESSION: Record<string, number> = {
  nouveau: 5,
  expertise: 20,
  devis: 35,
  reparation: 55,
  facture: 70,
  rendu: 85,
  paye: 100,
  cloture: 100,
  // valeurs héritées de la v0
  en_attente: 35,
  en_cours: 55,
  termine: 100,
};

export function progressionDossier(statut: string): number {
  return PROGRESSION[statut] ?? 5;
}

// Message d'erreur lisible, y compris pour les erreurs Supabase
// (objets simples, PAS des instances de Error → sinon message générique inutile).
export function messageErreur(err: unknown, fallback = "Erreur lors de l'enregistrement."): string {
  const brut =
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message || "")
        : "";
  if (!brut) return fallback;
  if (/does not exist|schema cache/i.test(brut)) {
    return `Table manquante côté Supabase — exécute la dernière migration SQL (dossier supabase/) dans SQL Editor. Détail : ${brut}`;
  }
  if (/row-level security|violates.*policy/i.test(brut)) {
    return `Accès refusé par la sécurité (RLS) — vérifie que la migration des policies a bien été exécutée. Détail : ${brut}`;
  }
  return brut;
}
