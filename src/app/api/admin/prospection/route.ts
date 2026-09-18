import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { estAdminServeur } from "@/lib/supportServeur";
import { ACTIVITES_RECHERCHE, TypeEtablissement, interpreterZone, tvaDepuisSiren, typeEtablissement } from "@/lib/admin/zones";

// ============================================================
//  PROSPECTION — ESPACE ÉDITEUR (v13.1)
//
//  GET  ?vue=suivi                     → toutes les fiches prospects (tous commerciaux)
//  GET  ?vue=journal&prospect_id=     → journal des contacts + documents d'une fiche
//  GET  ?zone=&nom=&siret=&activite=&page=
//       → garages trouvés dans l'annuaire des entreprises (API publique de
//         l'État, gratuite, sans clé), au niveau ÉTABLISSEMENT (un garage =
//         une adresse), chacun marqué « déjà attribué à … » s'il existe
//         déjà comme fiche prospect chez un commercial.
//  POST { action: "attribuer", owner_id, garages: [...] }
//       → crée les fiches prospects chez le commercial (doublons ignorés).
//  POST { action: "reattribuer", owner_id, prospect_ids: [...] }
//       → change le commercial (fiche + journal + documents suivent).
//  POST { action: "retirer", prospect_ids: [...] }
//       → supprime des fiches JAMAIS travaillées (aucun contact, aucun document).
//
//  Réservé à ADMIN_EMAILS ; écrit avec le service role (les fiches
//  appartiennent au commercial, la RLS ne laisserait pas l'éditeur écrire).
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 30;

const PAR_PAGE = 25; // maximum accepté par l'annuaire
const MAX_LOT = 200;

export type GarageTrouve = {
  siren: string;
  siret: string;
  nom: string;            // enseigne si elle existe, sinon raison sociale
  raison_sociale: string;
  adresse: string;
  cp: string;
  ville: string;
  activite: string;
  dirigeant: string;
  est_siege: boolean;
  /** v13.3 : carrosserie / garage / autre, déduit du nom et des enseignes. */
  type: TypeEtablissement;
  /** Déjà une fiche prospect quelque part ? */
  deja: { prospect_id: string; owner_id: string; proprietaire: string; statut: string } | null;
};

type Etab = {
  siret?: string; adresse?: string; code_postal?: string; libelle_commune?: string; activite_principale?: string;
  etat_administratif?: string; est_siege?: boolean; liste_enseignes?: string[] | null; nom_commercial?: string | null;
};
type Brut = {
  siren?: string; nom_complet?: string; nom_raison_sociale?: string; etat_administratif?: string; activite_principale?: string;
  siege?: Etab; matching_etablissements?: Etab[];
  dirigeants?: { nom?: string; prenoms?: string; qualite?: string; denomination?: string; type_dirigeant?: string }[];
};

type Garde = { erreur: NextResponse; admin: null; userId: null } | { erreur: null; admin: SupabaseClient; userId: string };

/** Ligne d'une liste importée (Excel / CSV d'une collaboratrice) — v13.4. */
type LigneImportee = {
  nom: string; adresse?: string | null; cp?: string | null; ville?: string | null; tel?: string | null; email?: string | null;
  gerant?: string | null; commentaire?: string | null;
  date_appel?: string | null; repondu?: boolean; pas_interesse?: boolean; date_rappel?: string | null; rdv?: boolean; date_rdv?: string | null;
};

function cleTel(t: string | null | undefined): string {
  const d = (t || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
}
function cleNom(nom: string | null | undefined, cp: string | null | undefined): string {
  const n = (nom || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(sarl|sas|sasu|eurl|carrosserie|garage|auto|automobile|automobiles|de|du|des|la|le|les|l|d)\b/g, " ").replace(/\s+/g, " ").trim();
  return n ? `${n}|${cp || ""}` : "";
}
async function garde(req: Request): Promise<Garde> {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return { erreur: NextResponse.json(REPONSE_401, { status: 401 }), admin: null, userId: null };
  if (!estAdminServeur(user.email)) {
    return { erreur: NextResponse.json({ error: "Accès réservé à l'éditeur de l'application." }, { status: 403 }), admin: null, userId: null };
  }
  const admin = getAdminClient();
  if (!admin) return { erreur: NextResponse.json({ error: "Service non configuré (SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 }), admin: null, userId: null };
  return { erreur: null, admin, userId: user.id };
}

const ENTETES = { Accept: "application/json", "User-Agent": "MyEasyAuto/1.0 (contact@myeasyauto.fr)" };

function titre(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

/** « 12 RUE DES LILAS 13014 MARSEILLE » → « 12 RUE DES LILAS » */
function voie(adresse: string, cp: string): string {
  const a = titre(adresse || "");
  return cp && a.includes(cp) ? a.slice(0, a.indexOf(cp)).trim() : a;
}

function dirigeantDe(r: Brut): string {
  const d = (r.dirigeants || []).find((x) => x.nom) || (r.dirigeants || [])[0];
  if (!d) return "";
  if (d.nom) return titre(`${(d.prenoms || "").split(/[ ,]+/)[0] || ""} ${d.nom}`);
  return titre(d.denomination || "");
}

/** Nom de commune → codes postaux (geo.api.gouv.fr, gratuit, sans clé). */
async function codesPostauxDe(ville: string): Promise<{ codes: string[]; libelle: string } | null> {
  const u = new URL("https://geo.api.gouv.fr/communes");
  u.searchParams.set("nom", ville);
  u.searchParams.set("fields", "nom,code,codesPostaux,population");
  u.searchParams.set("boost", "population");
  u.searchParams.set("limit", "5");
  const res = await fetch(u.toString(), { headers: ENTETES, signal: AbortSignal.timeout(8_000), cache: "no-store" });
  if (!res.ok) return null;
  const liste = (await res.json()) as { nom?: string; codesPostaux?: string[] }[];
  const c = liste.find((x) => (x.codesPostaux || []).length);
  if (!c) return null;
  const codes = (c.codesPostaux || []).slice(0, 25);
  return { codes, libelle: `${c.nom} (${codes.length > 3 ? `${codes[0]} … ${codes[codes.length - 1]}` : codes.join(", ")})` };
}

/** owner_id → nom affichable (fiche collaborateur, sinon « éditeur »). */
async function nomsProprietaires(admin: SupabaseClient): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const { data } = await admin.from("collaborateurs").select("owner_id,nom,prenom").not("owner_id", "is", null);
  for (const c of (data as { owner_id: string; nom: string; prenom: string | null }[]) || []) {
    m.set(c.owner_id, [c.prenom, c.nom].filter(Boolean).join(" "));
  }
  return m;
}

/* ------------------------------ RECHERCHE ------------------------------ */

export async function GET(req: Request) {
  const g = await garde(req);
  if (g.erreur) return g.erreur;
  const { admin, userId } = g;

  const sp = new URL(req.url).searchParams;

  // ---- SUIVI : toutes les fiches de tous les commerciaux (lecture par
  // tranches : PostgREST plafonne à 1000 lignes par requête).
  if (sp.get("vue") === "suivi") {
    const prospects: unknown[] = [];
    for (let debut = 0; debut < 20_000; debut += 1000) {
      const { data, error } = await admin
        .from("prospects")
        .select("*")
        .order("maj_le", { ascending: false })
        .range(debut, debut + 999);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      prospects.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return NextResponse.json({ prospects, moi: userId });
  }
  // ---- JOURNAL d'une fiche (chargé à la demande)
  if (sp.get("vue") === "journal") {
    const id = sp.get("prospect_id") || "";
    if (!id) return NextResponse.json({ error: "Fiche manquante." }, { status: 400 });
    const [inter, docs] = await Promise.all([
      admin.from("prospect_interactions").select("*").eq("prospect_id", id).order("created_at", { ascending: false }).limit(200),
      admin.from("prospect_documents").select("id,type,numero,statut,created_at,signe_le,envoye_le").eq("prospect_id", id).order("created_at", { ascending: false }),
    ]);
    if (inter.error) return NextResponse.json({ error: inter.error.message }, { status: 500 });
    return NextResponse.json({ interactions: inter.data || [], documents: docs.data || [] });
  }

  const zoneSaisie = (sp.get("zone") || "").trim().slice(0, 120);
  const nom = (sp.get("nom") || "").trim().slice(0, 120);
  const siret = (sp.get("siret") || "").replace(/\D/g, "");
  const activite = ACTIVITES_RECHERCHE[sp.get("activite") || "garages"] || ACTIVITES_RECHERCHE.garages;
  const page = Math.min(400, Math.max(1, Number(sp.get("page")) || 1));

  if (siret && siret.length !== 9 && siret.length !== 14) {
    return NextResponse.json({ error: "Un SIREN compte 9 chiffres, un SIRET 14." }, { status: 400 });
  }
  if (!zoneSaisie && !nom && !siret) {
    return NextResponse.json({ error: "Indiquez une zone, un nom de garage ou un SIRET." }, { status: 400 });
  }

  try {
    // 1. La zone → filtre de l'annuaire
    let cps: string[] = [];
    let departement = "";
    let zoneLibelle = "";
    if (zoneSaisie && !siret) {
      const z = interpreterZone(zoneSaisie);
      if (z?.type === "cp") { cps = z.codes; zoneLibelle = z.libelle; }
      else if (z?.type === "departement") { departement = z.code; zoneLibelle = z.libelle; }
      else if (z?.type === "ville") {
        const r = await codesPostauxDe(z.nom);
        if (!r) return NextResponse.json({ error: `Commune « ${z.nom} » introuvable. Essayez un code postal (13014) ou un département (13).` }, { status: 404 });
        cps = r.codes; zoneLibelle = r.libelle;
      }
    }

    // 2. Appel de l'annuaire
    const cible = new URL("https://recherche-entreprises.api.gouv.fr/search");
    if (siret) cible.searchParams.set("q", siret);
    else {
      // v13.3 : « carrosseries uniquement » sans nom → on cherche le mot dans
      // l'annuaire (le NAF 45.20A mélange garages et carrosseries), puis on
      // filtre encore sur le nom / les enseignes.
      if (nom) cible.searchParams.set("q", nom);
      else if (activite.carrosseriesSeulement) cible.searchParams.set("q", "carrosserie");
      if (cps.length) cible.searchParams.set("code_postal", cps.join(","));
      if (departement) cible.searchParams.set("departement", departement);
      if (activite.naf.length) cible.searchParams.set("activite_principale", activite.naf.join(","));
      cible.searchParams.set("etat_administratif", "A");
    }
    cible.searchParams.set("limite_matching_etablissements", "10");
    cible.searchParams.set("per_page", String(PAR_PAGE));
    cible.searchParams.set("page", String(page));

    const res = await fetch(cible.toString(), { headers: ENTETES, signal: AbortSignal.timeout(12_000), cache: "no-store" });
    if (res.status === 429) return NextResponse.json({ error: "L'annuaire des entreprises limite les appels : réessayez dans quelques secondes." }, { status: 429 });
    if (!res.ok) return NextResponse.json({ error: `Annuaire des entreprises indisponible (HTTP ${res.status}).` }, { status: 502 });
    const data = (await res.json()) as { results?: Brut[]; total_results?: number; total_pages?: number };

    // 3. Une ligne par ÉTABLISSEMENT ouvert dans la zone (un garage = une adresse)
    const garages: GarageTrouve[] = [];
    const vus = new Set<string>();
    for (const r of data.results || []) {
      if (!r.siren) continue;
      const raison = titre(r.nom_raison_sociale || r.nom_complet || "");
      let etabs = (r.matching_etablissements || []).filter((e) => e.siret && (e.etat_administratif || "A") === "A");
      if (siret.length === 14) etabs = etabs.filter((e) => e.siret === siret);
      if (cps.length) etabs = etabs.filter((e) => cps.includes(e.code_postal || ""));
      if (departement) etabs = etabs.filter((e) => (e.code_postal || "").startsWith(departement.length === 3 ? departement : departement.replace(/^2[AB]$/, "20")));
      // Repli sur le SIÈGE : pas de filtre de zone, ou siège lui-même dans la zone
      // (l'annuaire ne détaille pas toujours les établissements correspondants).
      if (!etabs.length && r.siege?.siret && (r.siege.etat_administratif || "A") === "A") {
        const cpSiege = r.siege.code_postal || "";
        const prefixe = departement.length === 3 ? departement : departement.replace(/^2[AB]$/, "20");
        const dansLaZone = cps.length ? cps.includes(cpSiege) : departement ? cpSiege.startsWith(prefixe) : true;
        if (dansLaZone && (siret.length !== 14 || r.siege.siret === siret)) etabs = [{ ...r.siege, est_siege: true }];
      }
      for (const e of etabs.slice(0, 5)) {
        if (!e.siret || vus.has(e.siret)) continue;
        vus.add(e.siret);
        const cp = e.code_postal || "";
        const enseigne = titre((e.liste_enseignes || [])[0] || e.nom_commercial || "");
        const type = typeEtablissement(enseigne, raison, r.nom_complet, ...(e.liste_enseignes || []), e.nom_commercial);
        if (activite.carrosseriesSeulement && type !== "carrosserie") continue;
        garages.push({
          siren: r.siren,
          siret: e.siret,
          nom: enseigne || raison,
          raison_sociale: raison,
          adresse: voie(e.adresse || "", cp),
          cp,
          ville: titre(e.libelle_commune || ""),
          activite: e.activite_principale || r.activite_principale || "",
          dirigeant: dirigeantDe(r),
          est_siege: Boolean(e.est_siege),
          type,
          deja: null,
        });
      }
    }

    // 4. Déjà attribué ? (par SIRET, sinon par SIREN quand la fiche n'a pas de SIRET)
    if (garages.length) {
      const sirets = garages.map((x) => x.siret);
      const sirens = Array.from(new Set(garages.map((x) => x.siren)));
      const [parSiret, parSiren, noms] = await Promise.all([
        admin.from("prospects").select("id,owner_id,statut,siret,siren").in("siret", sirets),
        admin.from("prospects").select("id,owner_id,statut,siret,siren").in("siren", sirens),
        nomsProprietaires(admin),
      ]);
      type L = { id: string; owner_id: string; statut: string; siret: string | null; siren: string | null };
      const lignes = [...((parSiret.data as L[]) || []), ...((parSiren.data as L[]) || [])];
      for (const x of garages) {
        const l = lignes.find((p) => p.siret === x.siret) || lignes.find((p) => !p.siret && p.siren === x.siren);
        if (l) {
          x.deja = {
            prospect_id: l.id,
            owner_id: l.owner_id,
            proprietaire: noms.get(l.owner_id) || (l.owner_id === userId ? "vous (éditeur)" : "un autre compte"),
            statut: l.statut,
          };
        }
      }
    }

    return NextResponse.json({
      garages,
      zone: zoneLibelle,
      page,
      totalPages: Math.min(400, data.total_pages || 1),
      totalEntreprises: data.total_results || 0,
    });
  } catch (err) {
    const delai = err instanceof Error && err.name === "TimeoutError";
    return NextResponse.json({ error: delai ? "L'annuaire des entreprises ne répond pas : réessayez." : "Recherche impossible." }, { status: 502 });
  }
}

/* ------------------------------ ATTRIBUTION ------------------------------ */

function messageColonne(msg: string): string {
  return /attribue_|source|column/i.test(msg)
    ? "Attribution impossible : exécutez d'abord supabase/migration_v73.sql dans Supabase."
    : msg;
}

/** Le compte visé est-il un commercial (fiche rattachée) ou l'éditeur lui-même ? */
async function cibleValide(admin: SupabaseClient, ownerId: string, userId: string): Promise<boolean> {
  if (ownerId === userId) return true;
  const { data } = await admin.from("collaborateurs").select("id").eq("owner_id", ownerId).eq("type", "commercial").limit(1);
  return Boolean(data && data.length);
}

export async function POST(req: Request) {
  const g = await garde(req);
  if (g.erreur) return g.erreur;
  const { admin, userId } = g;

  let body: { action?: string; owner_id?: string; garages?: Partial<GarageTrouve>[]; prospect_ids?: string[]; lignes?: LigneImportee[]; fichier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  if (body.action === "attribuer") {
    const ownerId = body.owner_id || "";
    const lot = (body.garages || []).filter((x) => x && x.nom && (x.siret || x.siren)).slice(0, MAX_LOT);
    if (!ownerId || !lot.length) return NextResponse.json({ error: "Choisissez un commercial et au moins un garage." }, { status: 400 });
    if (!(await cibleValide(admin, ownerId, userId))) {
      return NextResponse.json({ error: "Ce compte n'est pas celui d'un commercial (fiche collaborateur rattachée à un compte)." }, { status: 400 });
    }

    // Revérifie les doublons AU MOMENT d'écrire (deux onglets, deux éditeurs…).
    const sirets = lot.map((x) => x.siret).filter(Boolean) as string[];
    const { data: existants } = sirets.length
      ? await admin.from("prospects").select("siret").in("siret", sirets)
      : { data: [] as { siret: string }[] };
    const pris = new Set(((existants as { siret: string }[]) || []).map((x) => x.siret));

    const maintenant = new Date().toISOString();
    const ignores: string[] = [];
    const lignes = [];
    const dansLeLot = new Set<string>();
    for (const x of lot) {
      const cle = x.siret || x.siren || "";
      if ((x.siret && pris.has(x.siret)) || dansLeLot.has(cle)) {
        ignores.push(String(x.nom));
        continue;
      }
      dansLeLot.add(cle);
      const siren = (x.siren || (x.siret || "").slice(0, 9)).replace(/\D/g, "");
      const enseigneDifferente = x.raison_sociale && x.raison_sociale !== x.nom;
      lignes.push({
        owner_id: ownerId,
        siren: siren || null,
        siret: x.siret || null,
        nom: String(x.nom).slice(0, 200),
        activite: x.activite || null,
        tva_intra: tvaDepuisSiren(siren) || null,
        adresse: x.adresse || null,
        cp: x.cp || null,
        ville: x.ville || null,
        gerant: x.dirigeant || null,
        statut: "prospect",
        origine: "portefeuille",
        notes: enseigneDifferente ? `Raison sociale : ${x.raison_sociale}` : null,
        attribue_par: userId,
        attribue_le: maintenant,
        source: "annuaire",
      });
    }
    if (lignes.length) {
      const { error } = await admin.from("prospects").insert(lignes);
      if (error) return NextResponse.json({ error: messageColonne(error.message) }, { status: 500 });
    }
    return NextResponse.json({ ok: true, crees: lignes.length, ignores });
  }

  if (body.action === "reattribuer") {
    const ownerId = body.owner_id || "";
    const ids = (body.prospect_ids || []).slice(0, MAX_LOT);
    if (!ownerId || !ids.length) return NextResponse.json({ error: "Choisissez un commercial et au moins une fiche." }, { status: 400 });
    if (!(await cibleValide(admin, ownerId, userId))) {
      return NextResponse.json({ error: "Ce compte n'est pas celui d'un commercial." }, { status: 400 });
    }
    // Une fiche SIGNÉE ou CLIENTE porte une vente et des primes : on n'y touche pas d'ici.
    const { data: fiches } = await admin.from("prospects").select("id,statut,owner_id").in("id", ids);
    const liste = (fiches as { id: string; statut: string; owner_id: string }[]) || [];
    const bloquees = liste.filter((p) => p.statut === "signe" || p.statut === "client").length;
    const aDeplacer = liste.filter((p) => p.statut !== "signe" && p.statut !== "client" && p.owner_id !== ownerId).map((p) => p.id);
    if (aDeplacer.length) {
      const { error } = await admin
        .from("prospects")
        .update({ owner_id: ownerId, attribue_par: userId, attribue_le: new Date().toISOString(), maj_le: new Date().toISOString() })
        .in("id", aDeplacer);
      if (error) return NextResponse.json({ error: messageColonne(error.message) }, { status: 500 });
      // Le journal et les documents SUIVENT la fiche : sans ça, la RLS les
      // cacherait au nouveau commercial (il repartirait de zéro).
      await admin.from("prospect_interactions").update({ owner_id: ownerId }).in("prospect_id", aDeplacer);
      await admin.from("prospect_documents").update({ owner_id: ownerId }).in("prospect_id", aDeplacer);
    }
    return NextResponse.json({ ok: true, deplaces: aDeplacer.length, bloquees });
  }

  if (body.action === "retirer") {
    const ids = (body.prospect_ids || []).slice(0, MAX_LOT);
    if (!ids.length) return NextResponse.json({ error: "Aucune fiche sélectionnée." }, { status: 400 });
    // On ne retire QUE ce qui n'a jamais été travaillé : le travail d'un
    // commercial ne s'efface pas d'un clic depuis l'espace éditeur.
    const [{ data: fiches }, { data: inter }, { data: docs }] = await Promise.all([
      admin.from("prospects").select("id,statut").in("id", ids),
      admin.from("prospect_interactions").select("prospect_id").in("prospect_id", ids),
      admin.from("prospect_documents").select("prospect_id").in("prospect_id", ids),
    ]);
    const travaillees = new Set<string>([
      ...(((inter as { prospect_id: string }[]) || []).map((x) => x.prospect_id)),
      ...(((docs as { prospect_id: string }[]) || []).map((x) => x.prospect_id)),
    ]);
    const supprimables = ((fiches as { id: string; statut: string }[]) || [])
      .filter((p) => p.statut === "prospect" && !travaillees.has(p.id))
      .map((p) => p.id);
    if (supprimables.length) {
      const { error } = await admin.from("prospects").delete().in("id", supprimables);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, retires: supprimables.length, conserves: ids.length - supprimables.length });
  }

  /* ---------------- IMPORT D'UNE LISTE (v13.4) ----------------
     Fiches créées chez le commercial choisi, source « import ». Doublons
     écartés par téléphone, sinon par nom + code postal, contre TOUTES les
     fiches existantes (tous commerciaux). Si la liste porte déjà un suivi
     (répondu / pas intéressé / rappel / RDV), on crée le contact dans le
     journal et on pose le statut correspondant. */
  if (body.action === "importer") {
    const ownerId = body.owner_id || "";
    const lot = (body.lignes || []).filter((x) => x && typeof x.nom === "string" && x.nom.trim()).slice(0, 2000);
    if (!ownerId || !lot.length) return NextResponse.json({ error: "Choisissez un commercial et un fichier contenant au moins un garage." }, { status: 400 });
    if (!(await cibleValide(admin, ownerId, userId))) {
      return NextResponse.json({ error: "Ce compte n'est pas celui d'un commercial (fiche collaborateur rattachée à un compte)." }, { status: 400 });
    }

    // Toutes les fiches existantes (tel + nom/cp), par tranches de 1000.
    const existants = new Set<string>();
    for (let debut = 0; debut < 20_000; debut += 1000) {
      const { data, error } = await admin.from("prospects").select("nom,tel,cp").range(debut, debut + 999);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      for (const p of (data as { nom: string; tel: string | null; cp: string | null }[]) || []) {
        const t = cleTel(p.tel); if (t) existants.add(`tel:${t}`);
        const n = cleNom(p.nom, p.cp); if (n) existants.add(`nom:${n}`);
      }
      if (!data || data.length < 1000) break;
    }

    const maintenant = new Date().toISOString();
    const fichier = (body.fichier || "").slice(0, 120);
    const ignores: string[] = [];
    const lignes: Record<string, unknown>[] = [];
    const suivis: { index: number; l: LigneImportee }[] = [];
    for (const x of lot) {
      const t = cleTel(x.tel);
      const n = cleNom(x.nom, x.cp);
      const cles = [t ? `tel:${t}` : "", n ? `nom:${n}` : ""].filter(Boolean);
      if (cles.some((c) => existants.has(c))) { ignores.push(x.nom.trim()); continue; }
      cles.forEach((c) => existants.add(c));

      // Suivi déjà noté dans le fichier → statut / rappel / RDV
      let statut = "prospect";
      let prochaine_action: string | null = null;
      let prochaine_date: string | null = null;
      let rdv_le: string | null = null;
      let motif_refus: string | null = null;
      let dernier_resultat: string | null = null;
      if (x.rdv || x.date_rdv) { statut = "rdv"; rdv_le = x.date_rdv || null; prochaine_action = "RDV à l'atelier"; prochaine_date = x.date_rdv || null; dernier_resultat = "rdv"; }
      else if (x.pas_interesse) { statut = "perdu"; motif_refus = "autre"; dernier_resultat = "refus"; }
      else if (x.date_rappel) { prochaine_action = "Rappeler (liste importée)"; prochaine_date = x.date_rappel; dernier_resultat = "rappeler"; }
      else if (x.repondu || x.date_appel) { dernier_resultat = "autre"; }
      const contacte = Boolean(x.repondu || x.pas_interesse || x.date_rappel || x.rdv || x.date_rdv || x.date_appel);

      const notes = [x.commentaire?.trim() || "", fichier ? `Importé de « ${fichier} »` : "Liste importée"].filter(Boolean).join("\n");
      lignes.push({
        owner_id: ownerId,
        nom: x.nom.trim().slice(0, 200),
        adresse: x.adresse || null,
        cp: x.cp || null,
        ville: x.ville || null,
        tel: x.tel || null,
        email: x.email || null,
        gerant: x.gerant || null,
        statut,
        origine: "portefeuille",
        notes,
        prochaine_action,
        prochaine_date,
        rdv_le,
        motif_refus,
        motif_refus_detail: x.pas_interesse ? "Pas intéressé (liste importée)" : null,
        nb_appels: contacte ? 1 : 0,
        dernier_contact: contacte ? (x.date_appel ? `${x.date_appel}T12:00:00.000Z` : maintenant) : null,
        dernier_resultat,
        attribue_par: userId,
        attribue_le: maintenant,
        source: "import",
      });
      if (contacte) suivis.push({ index: lignes.length - 1, l: x });
    }

    let crees = 0;
    if (lignes.length) {
      const { data, error } = await admin.from("prospects").insert(lignes).select("id");
      if (error) return NextResponse.json({ error: messageColonne(error.message) }, { status: 500 });
      crees = data?.length || 0;
      // Journal des contacts pour les lignes déjà travaillées (même ordre que l'insert).
      const ids = ((data as { id: string }[]) || []).map((d) => d.id);
      const inter = suivis.filter((s) => ids[s.index]).map((s) => ({
        owner_id: ownerId,
        prospect_id: ids[s.index],
        canal: "appel",
        resultat: lignes[s.index].dernier_resultat || "autre",
        motif_refus: lignes[s.index].motif_refus || null,
        commentaire: s.l.commentaire || "Contact noté dans la liste importée",
        prochaine_date: lignes[s.index].prochaine_date || null,
        rdv_le: lignes[s.index].rdv_le || null,
        created_at: lignes[s.index].dernier_contact || maintenant,
      }));
      if (inter.length) await admin.from("prospect_interactions").insert(inter); // best-effort
    }
    return NextResponse.json({ ok: true, crees, ignores, sansTel: lignes.filter((l) => !l.tel).length });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
