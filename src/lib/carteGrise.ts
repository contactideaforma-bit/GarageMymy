// CARTE GRISE (v13.46) : nettoyage / validation des champs lus par l'IA,
// partagé entre la route d'extraction et l'interface (liste des champs
// « utiles » attendus pour créer un véhicule).

import type { FlotteVehicule } from "./types";

/** Champs renvoyés au client, après nettoyage. */
export type CarteGriseExtraite = {
  immatriculation: string | null;
  marque: string | null;
  modele: string | null;
  numero_serie: string | null;
  premiere_circulation: string | null;
  date_certificat: string | null;
  titulaire: string | null;
  cotitulaire: string | null;
  titulaire_adresse: string | null;
  energie: string | null;
  puissance_fiscale: number | null;
  puissance_kw: number | null;
  genre: string | null;
  carrosserie: string | null;
  places: number | null;
  ptac: number | null;
  couleur: string | null;
  numero_formule: string | null;
};

const CLES: (keyof CarteGriseExtraite)[] = [
  "immatriculation", "marque", "modele", "numero_serie", "premiere_circulation", "date_certificat",
  "titulaire", "cotitulaire", "titulaire_adresse", "energie", "puissance_fiscale", "puissance_kw",
  "genre", "carrosserie", "places", "ptac", "couleur", "numero_formule",
];

function texte(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s && !/^(null|n\/a|illisible|inconnu|-)$/i.test(s) ? s : null;
}
function nombre(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function dateIso(v: unknown): string | null {
  const s = texte(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const fr = s.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})/); // JJ/MM/AAAA
    if (!fr) return null;
    m = [s, fr[3], fr[2], fr[1]] as unknown as RegExpMatchArray;
  }
  const annee = Number(m[1]), mois = Number(m[2]), jour = Number(m[3]);
  if (annee < 1950 || annee > new Date().getFullYear() + 1 || mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
function immat(v: unknown): string | null {
  const s = texte(v)?.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return null;
  const siv = s.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/); // AA-123-AA
  if (siv) return `${siv[1]}-${siv[2]}-${siv[3]}`;
  const fni = s.match(/^(\d{1,4})([A-Z]{1,3})(\d{2,3})$/); // 1234 AB 56
  if (fni) return `${fni[1]} ${fni[2]} ${fni[3]}`;
  // Format inconnu (étranger…) : on garde la lecture brute, l'utilisateur corrigera.
  return texte(v)!.toUpperCase();
}
function vin(v: unknown): string | null {
  const s = texte(v)?.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return null;
  return s.length === 17 && !/[IOQ]/.test(s) ? s : null;
}
function nomPropre(v: unknown): string | null {
  const s = texte(v);
  if (!s) return null;
  return s.replace(/^(M\.?|MR|MME|MLLE|MADAME|MONSIEUR)\s+/i, "").trim() || null;
}

/** Nettoie et valide la réponse du modèle : jamais de valeur douteuse pré-remplie. */
export function nettoyerCarteGrise(brut: Record<string, unknown>): { data: CarteGriseExtraite; manquants: string[] } {
  const d = {} as Record<string, unknown>;
  for (const k of CLES) d[k] = brut?.[k] ?? null;
  const marque = texte(d.marque)?.toUpperCase() || null;
  let modele = texte(d.modele);
  if (marque && modele && modele.toUpperCase().startsWith(marque)) modele = modele.slice(marque.length).trim() || null;
  const data: CarteGriseExtraite = {
    immatriculation: immat(d.immatriculation),
    marque,
    modele,
    numero_serie: vin(d.numero_serie),
    premiere_circulation: dateIso(d.premiere_circulation),
    date_certificat: dateIso(d.date_certificat),
    titulaire: nomPropre(d.titulaire),
    cotitulaire: nomPropre(d.cotitulaire),
    titulaire_adresse: texte(d.titulaire_adresse),
    energie: texte(d.energie),
    puissance_fiscale: nombre(d.puissance_fiscale),
    puissance_kw: nombre(d.puissance_kw),
    genre: texte(d.genre)?.toUpperCase() || null,
    carrosserie: texte(d.carrosserie)?.toUpperCase() || null,
    places: nombre(d.places),
    ptac: nombre(d.ptac),
    couleur: texte(d.couleur),
    numero_formule: texte(d.numero_formule),
  };
  const manquants = (["immatriculation", "marque", "modele", "numero_serie", "premiere_circulation", "energie", "titulaire"] as const)
    .filter((k) => data[k] == null);
  return { data, manquants };
}


/* ------------------------------------------------------------------ */
/*  Côté interface : carte grise → véhicule, champs à compléter        */
/* ------------------------------------------------------------------ */


/** Transforme la lecture de la carte grise en véhicule prêt à enregistrer. */
export function vehiculeDepuisCarteGrise(d: CarteGriseExtraite, opts: { horsGarage: boolean }): Partial<FlotteVehicule> {
  // Tout ce qui n'a pas de champ dédié va dans les notes, pour ne rien perdre.
  const notes = [
    d.titulaire ? `Titulaire carte grise : ${d.titulaire}${d.cotitulaire ? ` (co-titulaire ${d.cotitulaire})` : ""}` : "",
    d.titulaire_adresse ? `Adresse titulaire : ${d.titulaire_adresse}` : "",
    d.puissance_fiscale != null ? `${d.puissance_fiscale} CV fiscaux` : "",
    d.puissance_kw != null ? `${d.puissance_kw} kW` : "",
    d.genre ? `Genre ${d.genre}` : "",
    d.carrosserie ? `Carrosserie ${d.carrosserie}` : "",
    d.places != null ? `${d.places} places` : "",
    d.ptac != null ? `PTAC ${d.ptac} kg` : "",
    d.date_certificat ? `Carte grise établie le ${d.date_certificat}` : "",
    d.numero_formule ? `N° de formule ${d.numero_formule}` : "",
  ].filter(Boolean).join("\n");
  return {
    immatriculation: d.immatriculation || "",
    marque_modele: [d.marque, d.modele].filter(Boolean).join(" ") || null,
    vin: d.numero_serie || null,
    date_mise_circulation: d.premiere_circulation || null,
    carburant: d.energie || null,
    couleur: d.couleur || null,
    titulaire_cg: d.titulaire || null,
    cg_ok: Boolean(d.immatriculation),
    hors_garage: opts.horsGarage,
    commentaire: d.puissance_fiscale != null ? `${d.puissance_fiscale} CV${d.energie ? ` · ${d.energie}` : ""}` : null,
    notes: notes || null,
  };
}

/** Champs qu'on propose de compléter à la main après la création par carte grise. */
export const CHAMPS_A_COMPLETER: { key: keyof FlotteVehicule; label: string; carteGrise: boolean }[] = [
  { key: "immatriculation", label: "Immatriculation", carteGrise: true },
  { key: "marque_modele", label: "Marque et modèle", carteGrise: true },
  { key: "vin", label: "N° de série (VIN)", carteGrise: true },
  { key: "date_mise_circulation", label: "1ère mise en circulation", carteGrise: true },
  { key: "carburant", label: "Énergie", carteGrise: true },
  { key: "titulaire_cg", label: "Nom sur la carte grise", carteGrise: true },
  { key: "couleur", label: "Couleur", carteGrise: false },
  { key: "kilometrage", label: "Kilométrage", carteGrise: false },
  { key: "assurance", label: "Assurance", carteGrise: false },
  { key: "numero_police", label: "N° de police", carteGrise: false },
  { key: "date_fin_contrat", label: "Échéance du contrat", carteGrise: false },
  { key: "date_prochain_ct", label: "Prochain contrôle technique", carteGrise: false },
  { key: "conducteur", label: "Conducteur habituel", carteGrise: false },
];

export function champsManquants(v: Partial<FlotteVehicule>): (keyof FlotteVehicule)[] {
  return CHAMPS_A_COMPLETER.filter((c) => {
    const val = v[c.key];
    return val == null || (typeof val === "string" && !val.trim());
  }).map((c) => c.key);
}
