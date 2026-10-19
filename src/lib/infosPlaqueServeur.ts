// INFOS PLAQUE — côté serveur (v13.47) : appel du fournisseur choisi par
// variables d'environnement, normalisation, cache partagé `infos_plaque`.
//
//   PLAQUE_API_TOKEN        clé / token du fournisseur (obligatoire)
//   PLAQUE_API_FOURNISSEUR  "api-plaque-immatriculation" (défaut)
//                           → GET https://www.api.api-plaque-immatriculation.com/api/v1/fr?plaque=…&token=…
//                           "apiplaqueimmatriculation"
//                           → POST https://api.apiplaqueimmatriculation.com/plaque?immatriculation=…&token=…&pays=FR
//
// Les deux renvoient des champs proches mais pas identiques : chaque adaptateur
// produit le même objet InfosPlaque. Ajouter un fournisseur = un adaptateur.

import { getAdminClient } from "./supabaseAdmin";
import { InfosPlaque, normaliserPlaque, formaterPlaque } from "./infosPlaque";

export const DUREE_CACHE_JOURS = 180;

export type Fournisseur = "api-plaque-immatriculation" | "apiplaqueimmatriculation";

export function fournisseurConfigure(): Fournisseur {
  const f = (process.env.PLAQUE_API_FOURNISSEUR || "api-plaque-immatriculation").trim();
  return f === "apiplaqueimmatriculation" ? "apiplaqueimmatriculation" : "api-plaque-immatriculation";
}

export class ErreurInfosPlaque extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

/* ---------------------- utilitaires de normalisation ---------------------- */

type Brut = Record<string, unknown>;

function txt(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s && s !== "-" && s.toLowerCase() !== "null" ? s : null;
}
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function dateIso(v: unknown): string | null {
  const s = txt(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}
/** Première valeur non vide parmi plusieurs clés possibles (casse ignorée). */
function pick(b: Brut, ...cles: string[]): unknown {
  const lower = new Map(Object.keys(b).map((k) => [k.toLowerCase(), k]));
  for (const c of cles) {
    const k = lower.get(c.toLowerCase());
    if (k !== undefined && b[k] != null && b[k] !== "") return b[k];
  }
  return null;
}
const ENERGIES: Record<string, string> = {
  "1": "Essence", "2": "Diesel", "3": "GPL", "4": "Électrique", "5": "Hybride", "6": "Hybride rechargeable",
  ES: "Essence", GO: "Diesel", EL: "Électrique", EE: "Hybride essence", EH: "Hybride essence", GH: "Hybride diesel",
  GL: "Hybride diesel", GP: "GPL", GN: "GNV", FE: "Essence + E85", H2: "Hydrogène",
  ESSENCE: "Essence", DIESEL: "Diesel", GAZOLE: "Diesel", ELECTRIQUE: "Électrique", "ÉLECTRIQUE": "Électrique",
  HYBRIDE: "Hybride", "ELECTRICITE": "Électrique",
};
function energie(...v: unknown[]): string | null {
  for (const x of v) {
    const s = txt(x);
    if (!s) continue;
    const cle = s.toUpperCase();
    if (ENERGIES[cle]) return ENERGIES[cle];
    if (/^\d$/.test(cle)) continue; // code numérique inconnu : on essaie la valeur suivante
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  return null;
}
function boite(v: unknown): string | null {
  const s = txt(v);
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === "M" || u.startsWith("MAN") || u.startsWith("MÉCA") || u.startsWith("MECA")) return "Manuelle";
  if (u === "A" || u.startsWith("AUTO")) return "Automatique";
  return s;
}

/** Réponse de n'importe quel fournisseur → InfosPlaque. */
export function normaliserReponse(d: Brut, immat: string): InfosPlaque {
  return {
    immat: formaterPlaque(immat),
    pays: txt(pick(d, "pays", "country")) || "FR",
    marque: txt(pick(d, "marque", "make", "brand"))?.toUpperCase() || null,
    modele: txt(pick(d, "modele", "model")),
    version: txt(pick(d, "version", "finition", "trim", "sra_commercial")),
    energie: energie(pick(d, "energieNGC", "energie_libelle", "carburant", "fuel"), pick(d, "energie", "energy")),
    date_mise_circulation: dateIso(pick(d, "date1erCir_us", "date_mise_en_circulation", "date1erCir_fr", "date_1er_cir", "first_registration")),
    vin: txt(pick(d, "vin", "VIN", "numero_serie"))?.toUpperCase() || null,
    couleur: txt(pick(d, "couleur", "color")),
    carrosserie: txt(pick(d, "carrosserie", "carrosserieCG", "body")),
    genre: txt(pick(d, "genre", "genreVCG", "genre_vcg")),
    boite: boite(pick(d, "boite_vitesse", "boite", "gearbox", "transmission")),
    puissance_fiscale: num(pick(d, "puisFisc", "puissance_fiscale", "puissanceFiscale")),
    puissance_ch: num(pick(d, "puisFiscReelCH", "puissance_ch", "puissance_reelle_ch", "puissance_din")),
    puissance_kw: num(pick(d, "puisFiscReelKW", "puissance_kw", "puissance_reelle_kw")),
    cylindree: txt(pick(d, "ccm", "cylindree", "displacement")),
    cylindres: num(pick(d, "cylindres", "cylinders", "nb_cylindres")),
    places: num(pick(d, "nr_passagers", "places", "nb_places", "seats", "nbPlaces")),
    co2: num(pick(d, "co2", "emission_co_2", "emissions_co2")),
    classe_env: txt(pick(d, "env_class", "classe_environnementale", "euro", "norme_euro", "critair")),
    poids_vide: num(pick(d, "poids_vide", "poidsVide", "masse_vide", "weight")),
    ptac: num(pick(d, "ptac", "PTAC", "poids_total", "masse_max")),
    type_mine: txt(pick(d, "type_mine", "typeMine", "cnit", "type_variante_version")),
  };
}

/* ------------------------------ fournisseurs ------------------------------ */

async function appelerFournisseur(immat: string, token: string, f: Fournisseur): Promise<{ infos: InfosPlaque; brut: Brut }> {
  const plaque = formaterPlaque(immat);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    let res: Response;
    if (f === "apiplaqueimmatriculation") {
      const url = `https://api.apiplaqueimmatriculation.com/plaque?immatriculation=${encodeURIComponent(plaque)}&token=${encodeURIComponent(token)}&pays=FR`;
      res = await fetch(url, { method: "POST", headers: { accept: "application/json" }, signal: ctrl.signal, cache: "no-store" });
    } else {
      const url = `https://www.api.api-plaque-immatriculation.com/api/v1/fr?plaque=${encodeURIComponent(plaque)}&token=${encodeURIComponent(token)}`;
      res = await fetch(url, { method: "GET", headers: { accept: "application/json" }, signal: ctrl.signal, cache: "no-store" });
    }
    const texte = await res.text();
    let json: Brut = {};
    try { json = JSON.parse(texte); } catch { /* réponse non JSON */ }
    if (res.status === 401 || res.status === 403) throw new ErreurInfosPlaque("Clé API plaque refusée par le fournisseur (PLAQUE_API_TOKEN).", 502);
    if (res.status === 402 || res.status === 429) throw new ErreurInfosPlaque("Quota de requêtes du fournisseur atteint : réessaie plus tard ou augmente le pack.", 503);
    const data = (json.data as Brut | undefined) || json;
    const erreur = txt((data as Brut).erreur) || (json.error === true ? txt(json.message) : null);
    const codeErreur = num(json.code_erreur ?? json.code);
    if (!res.ok || erreur || (codeErreur != null && codeErreur !== 200)) {
      const msg = erreur || txt(json.message) || `Fournisseur indisponible (HTTP ${res.status}).`;
      const inconnu = /introuvable|not found|inconnu|aucun|no data|invalide|invalid/i.test(msg) || res.status === 404;
      throw new ErreurInfosPlaque(inconnu ? `Aucun véhicule trouvé pour ${plaque}. Vérifie la plaque.` : msg, inconnu ? 404 : 502);
    }
    const infos = normaliserReponse(data as Brut, immat);
    if (!infos.marque && !infos.modele && !infos.vin) {
      throw new ErreurInfosPlaque(`Aucun véhicule trouvé pour ${plaque}. Vérifie la plaque.`, 404);
    }
    return { infos, brut: json };
  } catch (err) {
    if (err instanceof ErreurInfosPlaque) throw err;
    if ((err as Error).name === "AbortError") throw new ErreurInfosPlaque("Le fournisseur ne répond pas (délai dépassé).", 504);
    throw new ErreurInfosPlaque((err as Error).message || "Erreur réseau vers le fournisseur.", 502);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------- cache ---------------------------------- */

export async function obtenirInfosPlaque(args: {
  immat: string;
  ownerId: string;
  forcer?: boolean;
}): Promise<{ infos: InfosPlaque; depuis_cache: boolean; consulte_le: string; fournisseur: string | null }> {
  const cle = normaliserPlaque(args.immat);
  if (cle.length < 4) throw new ErreurInfosPlaque("Immatriculation incomplète.", 400);
  const admin = getAdminClient();

  // 1) Cache partagé (jamais payant).
  if (admin && !args.forcer) {
    const { data } = await admin.from("infos_plaque").select("donnees, consulte_le, fournisseur").eq("immat", cle).maybeSingle();
    if (data) {
      const age = (Date.now() - new Date(data.consulte_le as string).getTime()) / 86400000;
      if (age <= DUREE_CACHE_JOURS) {
        await Promise.all([
          admin.from("infos_plaque_requetes").insert({ owner_id: args.ownerId, immat: cle, depuis_cache: true }),
        ]);
        return { infos: data.donnees as InfosPlaque, depuis_cache: true, consulte_le: data.consulte_le as string, fournisseur: (data.fournisseur as string) || null };
      }
    }
  }

  // 2) Appel du fournisseur.
  const token = process.env.PLAQUE_API_TOKEN;
  if (!token) {
    throw new ErreurInfosPlaque("Service « infos plaque » non configuré : ajoute PLAQUE_API_TOKEN (et PLAQUE_API_FOURNISSEUR) dans les variables d'environnement Vercel / .env.local.", 501);
  }
  const f = fournisseurConfigure();
  const { infos, brut } = await appelerFournisseur(args.immat, token, f);
  const maintenant = new Date().toISOString();

  if (admin) {
    await Promise.all([
      admin.from("infos_plaque").upsert({ immat: cle, pays: infos.pays, fournisseur: f, donnees: infos, brut, consulte_le: maintenant }, { onConflict: "immat" }),
      admin.from("infos_plaque_requetes").insert({ owner_id: args.ownerId, immat: cle, depuis_cache: false }),
    ]);
  }
  return { infos, depuis_cache: false, consulte_le: maintenant, fournisseur: f };
}
