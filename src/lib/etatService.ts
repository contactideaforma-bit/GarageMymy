// ============================================================
//  ÉTAT DU SERVICE (v45)
//
//  Trois niveaux, un vocabulaire de garage : on ne dit pas « incident de
//  sévérité 2 », on dit ce qui ne marche pas et ce qu'on peut faire en
//  attendant.
// ============================================================

export type Incident = {
  id: string;
  created_at: string;
  titre: string;
  message: string;
  /** info | degrade | panne */
  niveau: string;
  perimetre?: string | null;
  debut: string;
  fin?: string | null;
  resolu: boolean;
  suivi?: string | null;
};

export const NIVEAUX_INCIDENT = [
  {
    code: "info",
    label: "Information",
    court: "Maintenance",
    badge: "badge badge-info",
    bandeau: "border-violet-400/50 bg-violet-500/15 text-violet-100",
    icone: "ℹ️",
  },
  {
    code: "degrade",
    label: "Service ralenti",
    court: "Ralenti",
    badge: "badge badge-warn",
    bandeau: "border-amber-400/50 bg-amber-500/15 text-amber-100",
    icone: "⚠️",
  },
  {
    code: "panne",
    label: "Panne en cours",
    court: "Panne",
    badge: "badge badge-danger",
    bandeau: "border-rose-400/60 bg-rose-500/20 text-rose-100",
    icone: "🚨",
  },
] as const;

export function infoNiveau(code?: string | null) {
  return NIVEAUX_INCIDENT.find((n) => n.code === code) || NIVEAUX_INCIDENT[0];
}

/** Le niveau le plus grave parmi les incidents ouverts. */
export function niveauLePlusGrave(incidents: Incident[]): string | null {
  const ordre = ["info", "degrade", "panne"];
  let pire: string | null = null;
  for (const i of incidents) {
    if (i.resolu) continue;
    if (pire === null || ordre.indexOf(i.niveau) > ordre.indexOf(pire)) pire = i.niveau;
  }
  return pire;
}

/** Durée écoulée en clair : « depuis 25 min », « depuis 3 h ». */
export function depuis(debut: string): string {
  const ms = Date.now() - new Date(debut).getTime();
  if (!isFinite(ms) || ms < 0) return "";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `depuis ${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `depuis ${h} h`;
  return `depuis ${Math.floor(h / 24)} j`;
}

/** Lecture publique de l'état (aucune authentification requise). */
export async function chargerEtat(): Promise<{ actifs: Incident[]; historique: Incident[] }> {
  try {
    const res = await fetch("/api/etat", { cache: "no-store" });
    if (!res.ok) return { actifs: [], historique: [] };
    const data = (await res.json()) as { actifs?: Incident[]; historique?: Incident[] };
    return { actifs: data.actifs || [], historique: data.historique || [] };
  } catch {
    // Hors ligne ou API injoignable : on n'affiche simplement rien.
    return { actifs: [], historique: [] };
  }
}
