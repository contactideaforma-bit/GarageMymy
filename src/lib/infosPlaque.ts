// INFOS PLAQUE (v13.47) — types et conversions partagés client / serveur :
// « je tape la plaque, j'obtiens la carte d'identité du véhicule ».

import type { FlotteVehicule } from "./types";

/**
 * INTERRUPTEUR (v13.47) : la fonction est codée mais MASQUÉE tant qu'aucun
 * abonnement API n'est pris (service payant, facultatif). Pour l'activer :
 * passer à `true` (ou définir NEXT_PUBLIC_INFOS_PLAQUE=1 sur Vercel) et
 * renseigner PLAQUE_API_TOKEN côté serveur. Les boutons « Infos plaque »
 * disparaissent et la route /api/infos-plaque répond 404 tant que c'est masqué.
 */
export const INFOS_PLAQUE_ACTIF: boolean = process.env.NEXT_PUBLIC_INFOS_PLAQUE === "1" || false;

export type InfosPlaque = {
  immat: string;
  pays: string;
  marque: string | null;
  modele: string | null;
  version: string | null;
  energie: string | null;
  date_mise_circulation: string | null; // AAAA-MM-JJ
  vin: string | null;
  couleur: string | null;
  carrosserie: string | null;
  genre: string | null;
  boite: string | null;
  puissance_fiscale: number | null;
  puissance_ch: number | null;
  puissance_kw: number | null;
  cylindree: string | null;
  cylindres: number | null;
  places: number | null;
  co2: number | null;
  classe_env: string | null;
  poids_vide: number | null;
  ptac: number | null;
  type_mine: string | null;
};

export type ReponseInfosPlaque = {
  infos: InfosPlaque;
  depuis_cache: boolean;
  consulte_le: string;
  fournisseur: string | null;
};

export function normaliserPlaque(s: string | null | undefined): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** AA123BC → AA-123-BC pour l'affichage (ancien format laissé tel quel). */
export function formaterPlaque(s: string | null | undefined): string {
  const n = normaliserPlaque(s);
  const m = n.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : (s || "").toUpperCase();
}

/** Lignes affichées dans la fenêtre d'infos, dans l'ordre. */
export const LIGNES_INFOS: { key: keyof InfosPlaque; label: string; fmt?: (v: unknown) => string }[] = [
  { key: "marque", label: "Marque" },
  { key: "modele", label: "Modèle" },
  { key: "version", label: "Version / finition" },
  { key: "energie", label: "Énergie" },
  { key: "date_mise_circulation", label: "1ère mise en circulation", fmt: (v) => String(v).split("-").reverse().join("/") },
  { key: "vin", label: "N° de série (VIN)" },
  { key: "couleur", label: "Couleur" },
  { key: "carrosserie", label: "Carrosserie" },
  { key: "genre", label: "Genre" },
  { key: "boite", label: "Boîte de vitesses" },
  { key: "puissance_fiscale", label: "Puissance fiscale", fmt: (v) => `${v} CV` },
  { key: "puissance_ch", label: "Puissance réelle", fmt: (v) => `${v} ch` },
  { key: "puissance_kw", label: "Puissance (kW)", fmt: (v) => `${v} kW` },
  { key: "cylindree", label: "Cylindrée" },
  { key: "cylindres", label: "Cylindres" },
  { key: "places", label: "Places" },
  { key: "co2", label: "CO₂", fmt: (v) => `${v} g/km` },
  { key: "classe_env", label: "Classe environnementale" },
  { key: "poids_vide", label: "Poids à vide", fmt: (v) => `${v} kg` },
  { key: "ptac", label: "PTAC", fmt: (v) => `${v} kg` },
  { key: "type_mine", label: "Type mine (CNIT)" },
];

/** Champs d'un véhicule de la flotte que les infos plaque peuvent remplir (si vides). */
export function vehiculeDepuisInfos(i: InfosPlaque, existant: Partial<FlotteVehicule>): Partial<FlotteVehicule> {
  const vide = (v: unknown) => v == null || (typeof v === "string" && !v.trim());
  const r: Partial<FlotteVehicule> = {};
  const mm = [i.marque, i.modele].filter(Boolean).join(" ");
  if (vide(existant.marque_modele) && mm) r.marque_modele = mm;
  if (vide(existant.vin) && i.vin) r.vin = i.vin;
  if (vide(existant.carburant) && i.energie) r.carburant = i.energie;
  if (vide(existant.couleur) && i.couleur) r.couleur = i.couleur;
  if (vide(existant.date_mise_circulation) && i.date_mise_circulation) r.date_mise_circulation = i.date_mise_circulation;
  if (vide(existant.commentaire) && i.puissance_fiscale != null) r.commentaire = `${i.puissance_fiscale} CV${i.energie ? ` · ${i.energie}` : ""}${i.version ? ` · ${i.version}` : ""}`;
  return r;
}

/** Idem pour un dossier sinistre (colonnes marque_modele, numero_serie, premiere_circulation). */
export function dossierDepuisInfos(
  i: InfosPlaque,
  existant: { marque_modele?: string | null; numero_serie?: string | null; premiere_circulation?: string | null }
): { marque_modele?: string; numero_serie?: string; premiere_circulation?: string } {
  const vide = (v: unknown) => v == null || (typeof v === "string" && !v.trim());
  const r: { marque_modele?: string; numero_serie?: string; premiere_circulation?: string } = {};
  const mm = [i.marque, i.modele, i.version].filter(Boolean).join(" ");
  if (vide(existant.marque_modele) && mm) r.marque_modele = mm;
  if (vide(existant.numero_serie) && i.vin) r.numero_serie = i.vin;
  if (vide(existant.premiere_circulation) && i.date_mise_circulation) r.premiere_circulation = i.date_mise_circulation;
  return r;
}
