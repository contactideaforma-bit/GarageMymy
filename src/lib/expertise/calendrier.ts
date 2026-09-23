// OUTILS DU CALENDRIER « RDV expert » (v13.24) — purs, sans accès réseau.
// Dates manipulées en heure LOCALE (jamais toISOString : décalage UTC).

import { RdvExpert, TypeRdv } from "./types";

export type VueCalendrier = "jour" | "semaine" | "mois" | "annee";

export const HEURE_DEBUT = 7;
export const HEURE_FIN = 20;
export const PX_HEURE = 56;

export const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const depuisYmd = (s: string) => { const [a, m, j] = s.split("-").map(Number); return new Date(a, (m || 1) - 1, j || 1); };
export const ajouterJours = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const lundiDe = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return ajouterJours(x, -((x.getDay() + 6) % 7)); };

/** N° de semaine ISO 8601. */
export function numeroSemaine(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const jour = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - jour);
  const debut = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - debut.getTime()) / 86400000 + 1) / 7);
}

/** Période affichée par une vue autour d'une date de référence. */
export function periode(vue: VueCalendrier, ref: Date): { de: Date; a: Date } {
  if (vue === "jour") return { de: ref, a: ref };
  if (vue === "semaine") { const l = lundiDe(ref); return { de: l, a: ajouterJours(l, 6) }; }
  if (vue === "mois") { const l = lundiDe(new Date(ref.getFullYear(), ref.getMonth(), 1)); return { de: l, a: ajouterJours(l, 41) }; }
  return { de: new Date(ref.getFullYear(), 0, 1), a: new Date(ref.getFullYear(), 11, 31) };
}

/** Avance / recule d'une période. */
export function decaler(vue: VueCalendrier, ref: Date, sens: 1 | -1): Date {
  if (vue === "jour") return ajouterJours(ref, sens);
  if (vue === "semaine") return ajouterJours(ref, 7 * sens);
  if (vue === "mois") return new Date(ref.getFullYear(), ref.getMonth() + sens, 1);
  return new Date(ref.getFullYear() + sens, ref.getMonth(), 1);
}

export function titrePeriode(vue: VueCalendrier, ref: Date): string {
  if (vue === "jour") { const s = ref.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); return s.charAt(0).toUpperCase() + s.slice(1); }
  if (vue === "semaine") {
    const { de, a } = periode("semaine", ref);
    const memeMois = de.getMonth() === a.getMonth();
    return `Semaine ${numeroSemaine(de)} · ${de.getDate()}${memeMois ? "" : ` ${MOIS[de.getMonth()].slice(0, 4).toLowerCase()}.`} – ${a.getDate()} ${MOIS[a.getMonth()].toLowerCase()} ${a.getFullYear()}`;
  }
  if (vue === "mois") return `${MOIS[ref.getMonth()]} ${ref.getFullYear()}`;
  return String(ref.getFullYear());
}

/** « 09:30:00 » → minutes depuis minuit (null si pas d'heure). */
export const minutes = (h: string | null | undefined) => { if (!h) return null; const [a, b] = h.split(":").map(Number); return (a || 0) * 60 + (b || 0); };
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Position dans la grille horaire (px) ; un RDV sans heure est posé à 8 h. */
export function positionRdv(r: RdvExpert): { top: number; hauteur: number; debut: number; fin: number } {
  const debut = minutes(r.heure) ?? 8 * 60;
  const fin = debut + (Number(r.duree_min) || 45);
  const top = Math.max(0, ((debut - HEURE_DEBUT * 60) / 60) * PX_HEURE);
  const hauteur = Math.max(22, ((fin - debut) / 60) * PX_HEURE - 2);
  return { top, hauteur, debut, fin };
}

/**
 * Colonnes des RDV qui se chevauchent le même jour (affichage côte à côte).
 * Renvoie pour chaque id : { col, nb } (nb = colonnes du groupe).
 */
export function colonnes(liste: RdvExpert[]): Record<string, { col: number; nb: number }> {
  const tries = [...liste].sort((a, b) => positionRdv(a).debut - positionRdv(b).debut);
  const res: Record<string, { col: number; nb: number }> = {};
  let groupe: { id: string; fin: number; col: number }[] = [];
  let finGroupe = -1;
  const clore = () => { const nb = Math.max(1, ...groupe.map((g) => g.col + 1)); groupe.forEach((g) => { res[g.id] = { col: g.col, nb }; }); groupe = []; };
  for (const r of tries) {
    const { debut, fin } = positionRdv(r);
    if (groupe.length && debut >= finGroupe) clore();
    const occupees = new Set(groupe.filter((g) => g.fin > debut).map((g) => g.col));
    let col = 0;
    while (occupees.has(col)) col += 1;
    groupe.push({ id: r.id, fin, col });
    finGroupe = Math.max(finGroupe, fin);
  }
  if (groupe.length) clore();
  return res;
}

/** RDV qui chevauchent un créneau (garde-fou à la planification). */
export function conflits(liste: RdvExpert[], r: { id?: string | null; date?: string | null; heure?: string | null; duree_min?: number | null }): RdvExpert[] {
  if (!r.date || !r.heure) return [];
  const d = minutes(r.heure)!;
  const f = d + (Number(r.duree_min) || 45);
  return liste.filter((x) => x.id !== r.id && x.date === r.date && x.statut !== "annule" && x.heure && (() => { const p = positionRdv(x); return p.debut < f && d < p.fin; })());
}

/** Couleur par type (bordure gauche + fond léger, lisible sur fond clair). */
export const COULEUR_TYPE: Record<TypeRdv, { bord: string; fond: string; texte: string }> = {
  visite: { bord: "#0b3fc4", fond: "#e6edff", texte: "#041e7f" },
  contradictoire: { bord: "#7c3aed", fond: "#f1eaff", texte: "#4c1d95" },
  controle: { bord: "#d97706", fond: "#fef3c7", texte: "#78350f" },
  ead: { bord: "#0d9488", fond: "#dcfaf5", texte: "#134e4a" },
  autre: { bord: "#6b7280", fond: "#f1f2f4", texte: "#1f2937" },
};
export const couleurRdv = (t: string | null | undefined) => COULEUR_TYPE[(t as TypeRdv) || "autre"] || COULEUR_TYPE.autre;
