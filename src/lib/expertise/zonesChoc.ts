// ====================================================================
//  ZONES DE CHOC SUR LA SILHOUETTE (mode expert, v13.11)
//
//  Le PV imprime une vue de dessus du véhicule (avant en haut). Les zones
//  touchées y sont marquées d'une croix, déduites automatiquement du
//  chiffrage : libellés des chocs (« Choc avant gauche ») et désignations
//  des opérations (« AILE AVG. », « HAYON », « PARE-BRISE »…).
// ====================================================================

import { Choc, Operation } from "./types";

export type ZoneChoc =
  | "avant" | "arriere" | "avg" | "avd" | "arg" | "ard"
  | "lateral_g" | "lateral_d" | "capot" | "hayon" | "pare_brise" | "lunette" | "toit"
  | "porte_avg" | "porte_avd" | "porte_arg" | "porte_ard";

/** Position (fraction de la largeur / hauteur de la silhouette, avant en haut). */
export const POSITION_ZONE: Record<ZoneChoc, [number, number]> = {
  avant: [0.5, 0.07], arriere: [0.5, 0.93],
  avg: [0.2, 0.2], avd: [0.8, 0.2], arg: [0.2, 0.8], ard: [0.8, 0.8],
  lateral_g: [0.1, 0.5], lateral_d: [0.9, 0.5],
  capot: [0.5, 0.2], hayon: [0.5, 0.8], pare_brise: [0.5, 0.33], lunette: [0.5, 0.68], toit: [0.5, 0.5],
  porte_avg: [0.13, 0.42], porte_avd: [0.87, 0.42], porte_arg: [0.13, 0.62], porte_ard: [0.87, 0.62],
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\bavant\b/g, "av").replace(/\barriere\b/g, "ar").replace(/\bgauche\b/g, "g").replace(/\bdroite?\b/g, "d")
    .replace(/[^a-z0-9]+/g, " ").replace(/\b(av|ar)\s+(g|d)\b/g, "$1$2").trim();

/** Côté (avg/avd/arg/ard/av/ar/g/d) lu dans un libellé normalisé. */
function cote(t: string): "avg" | "avd" | "arg" | "ard" | "av" | "ar" | "g" | "d" | null {
  const m = /\b(avg|avd|arg|ard|av|ar|g|d)\b/.exec(t);
  return (m?.[1] as ReturnType<typeof cote>) || null;
}

function zonesDunLibelle(libelle: string): ZoneChoc[] {
  const t = norm(libelle);
  if (!t) return [];
  const c = cote(t);
  const z: ZoneChoc[] = [];
  const porte = /\bporte\b/.test(t);
  if (/\bcapot\b/.test(t)) z.push("capot");
  if (/\b(hayon|coffre|malle)\b/.test(t)) z.push("hayon");
  if (/\bpare ?brise\b/.test(t)) z.push("pare_brise");
  if (/\blunette\b/.test(t)) z.push("lunette");
  if (/\b(toit|pavillon)\b/.test(t)) z.push("toit");
  if (porte) {
    if (c === "avg") z.push("porte_avg"); else if (c === "avd") z.push("porte_avd");
    else if (c === "arg") z.push("porte_arg"); else if (c === "ard") z.push("porte_ard");
    else if (c === "g") z.push("porte_avg"); else if (c === "d") z.push("porte_avd");
  }
  if (/\b(bouclier|pare ?chocs?|calandre|face av|traverse av|optique|phare|projecteur|radiateur)\b/.test(t) && !/\bar\b|\bard\b|\barg\b/.test(t)) {
    if (c === "avg") z.push("avg"); else if (c === "avd") z.push("avd"); else z.push("avant");
  }
  if (/\b(bouclier ar|pare ?chocs? ar|feu ar|face ar|panneau ar|traverse ar)\b/.test(t) || (/\b(bouclier|pare ?chocs?|feu|panneau)\b/.test(t) && /\b(ar|arg|ard)\b/.test(t))) {
    if (c === "arg") z.push("arg"); else if (c === "ard") z.push("ard"); else z.push("arriere");
  }
  if (/\baile\b/.test(t) || /\b(bas de caisse|retroviseur|retro)\b/.test(t) || /\blateral\b/.test(t) || /\bchoc\b/.test(t)) {
    if (c === "avg") z.push("avg"); else if (c === "avd") z.push("avd");
    else if (c === "arg") z.push("arg"); else if (c === "ard") z.push("ard");
    else if (c === "g") z.push("lateral_g"); else if (c === "d") z.push("lateral_d");
    else if (c === "av" && /\bchoc\b/.test(t)) z.push("avant");
    else if (c === "ar" && /\bchoc\b/.test(t)) z.push("arriere");
  }
  return z;
}

/** Zones touchées, sans doublon, à partir du chiffrage du rapport. */
export function zonesDeChoc(chocs: Choc[], operations: Operation[]): ZoneChoc[] {
  const set = new Set<ZoneChoc>();
  for (const c of chocs || []) for (const z of zonesDunLibelle(c.libelle || "")) set.add(z);
  for (const o of operations || []) for (const z of zonesDunLibelle(o.designation || "")) set.add(z);
  return Array.from(set);
}
