// ============================================================
//  ZONE GÉOGRAPHIQUE D'UNE RECHERCHE DE PROSPECTS (v13.1)
//
//  L'éditeur tape ce qui lui vient : « 13014 », « 13014, 13015 », « 13 »,
//  « Marseille 14e », « Aubagne ». Ce module (PUR, sans réseau) traduit ça
//  en filtre pour l'annuaire des entreprises. Seul le cas « nom de ville »
//  demande ensuite un appel réseau (geo.api.gouv.fr), fait par la route.
// ============================================================

export type ZoneInterpretee =
  | { type: "cp"; codes: string[]; libelle: string }
  | { type: "departement"; code: string; libelle: string }
  | { type: "ville"; nom: string; libelle: string };

/** Villes à arrondissements : préfixe du code postal + nombre d'arrondissements. */
const VILLES_ARRONDISSEMENTS: Record<string, { prefixe: string; max: number }> = {
  marseille: { prefixe: "130", max: 16 },
  paris: { prefixe: "750", max: 20 },
  lyon: { prefixe: "6900", max: 9 },
};

function sansAccents(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function interpreterZone(saisie: string): ZoneInterpretee | null {
  const brut = (saisie || "").trim();
  if (!brut) return null;

  // Un ou plusieurs codes postaux : « 13014 », « 13014, 13015 », « 13014 13015 »
  const morceaux = brut.split(/[\s,;/]+/).filter(Boolean);
  if (morceaux.length && morceaux.every((m) => /^\d{5}$/.test(m))) {
    const codes = Array.from(new Set(morceaux)).slice(0, 20);
    return { type: "cp", codes, libelle: codes.length === 1 ? `Code postal ${codes[0]}` : `Codes postaux ${codes.join(", ")}` };
  }

  // Département : « 13 », « 2A », « 974 », « dept 13 »
  const dep = sansAccents(brut).toUpperCase().replace(/^(DEPARTEMENT|DEPT|DEP)\.?\s*/, "");
  if (/^(\d{2,3}|2A|2B)$/.test(dep)) return { type: "departement", code: dep, libelle: `Département ${dep}` };

  // « Marseille 14 », « marseille 14e », « Paris 8ème arrondissement », « Lyon 3 »
  const m = sansAccents(brut)
    .toLowerCase()
    .match(/^(marseille|paris|lyon)\s*(\d{1,2})\s*(?:er|e|eme|ieme|nd|nde)?(?:\s*arr(?:ondissement|dt|\.)?)?$/);
  if (m) {
    const ville = VILLES_ARRONDISSEMENTS[m[1]];
    const n = Number(m[2]);
    if (n >= 1 && n <= ville.max) {
      const cp = ville.prefixe + String(n).padStart(5 - ville.prefixe.length, "0");
      // Paris 16e : deux codes postaux (75016 et 75116).
      const codes = m[1] === "paris" && n === 16 ? ["75016", "75116"] : [cp];
      const nomVille = m[1].charAt(0).toUpperCase() + m[1].slice(1);
      return { type: "cp", codes, libelle: `${nomVille} ${n}${n === 1 ? "er" : "e"} (${codes.join(", ")})` };
    }
  }

  // Sinon : un nom de commune, à résoudre en codes postaux.
  return { type: "ville", nom: brut.slice(0, 80), libelle: brut };
}

/** N° de TVA intracommunautaire français déduit du SIREN. */
export function tvaDepuisSiren(siren: string): string {
  if (!/^\d{9}$/.test(siren)) return "";
  const cle = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(cle).padStart(2, "0")}${siren}`;
}

/** Activités proposées dans la recherche (codes NAF de l'annuaire). */
export const ACTIVITES_RECHERCHE: Record<string, { label: string; naf: string[] }> = {
  garages: { label: "Garages & carrosseries (45.20A, 45.20B)", naf: ["45.20A", "45.20B"] },
  garages_vente: { label: "Garages + vente de véhicules (45.11Z, 45.19Z)", naf: ["45.20A", "45.20B", "45.11Z", "45.19Z"] },
  toutes: { label: "Toutes activités", naf: [] },
};

export const LIBELLES_NAF: Record<string, string> = {
  "45.20A": "Entretien et réparation de véhicules légers",
  "45.20B": "Entretien et réparation d'autres véhicules",
  "45.11Z": "Commerce de voitures et véhicules légers",
  "45.19Z": "Commerce d'autres véhicules",
  "45.32Z": "Commerce de détail d'équipements automobiles",
};
