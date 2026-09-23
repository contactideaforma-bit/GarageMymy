// Accès aux données du CONTRÔLE DU DEVIS (mode expert, v13.23 — migration v87).
// Composants "use client" → Supabase direct, RLS par compte.

import { supabase } from "@/lib/supabaseClient";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import { fichierVersPdf } from "@/lib/photoPdf";
import { ajouterDocument, majDocument, telechargerBlob } from "./data";
import { Choc, DocumentExpert, DossierExpert, Operation } from "./types";
import { Chiffrage, Controle, CoteControle, EcartControle, TypeControle, journaliser } from "./controle";

/** Résultat de /api/expert/analyser (champs utiles au contrôle). */
export type LectureIA = {
  vehicule: { immatriculation: string | null; marque: string | null; modele: string | null } | null;
  reparateur: { nom: string | null; adresse: string | null; siret: string | null } | null;
  document: { numero: string | null; date: string | null; total_ht: number | null; total_tva: number | null; total_ttc: number | null } | null;
  chocs: Choc[];
  operations: Operation[];
  remarques: string | null;
  confiance: "faible" | "moyenne" | "bonne";
  /** mode=auto (dépôt groupé, v13.25) : nature du document reconnue. */
  type_document?: "pre_rapport" | "devis" | "facture" | "autre" | null;
};

/* ------------------------------ Lecture ------------------------------ */

export type ModeLecture = "rapport" | "devis" | "facture";

/** Lecture déjà faite et mémorisée sur le document (évite de repayer l'IA). */
export function lectureMemorisee(doc: DocumentExpert | null | undefined, mode: ModeLecture): LectureIA | null {
  const a = doc?.analyse_ia as { controle?: { mode?: string; data?: LectureIA } } | null | undefined;
  return a?.controle?.mode === mode && a.controle.data ? a.controle.data : null;
}

function contexte(d: DossierExpert): string {
  return [
    `Immatriculation : ${d.immatriculation || "?"}`,
    `Véhicule : ${[d.marque, d.modele, d.finition].filter(Boolean).join(" ") || "?"}`,
    d.reparateur_nom && `Réparateur : ${d.reparateur_nom}`,
  ].filter(Boolean).join("\n");
}

/**
 * Lit un pré-rapport ou un devis (PDF / photo) par l'IA. Le résultat est
 * mémorisé sur le document : une 2e ouverture est instantanée et gratuite.
 */
export async function lireDocument(args: { dossier: DossierExpert; doc: DocumentExpert; mode: ModeLecture; forcer?: boolean }): Promise<LectureIA> {
  if (!args.forcer) {
    const deja = lectureMemorisee(args.doc, args.mode);
    if (deja) return deja;
  }
  const blob = await telechargerBlob(args.doc.path);
  if (!blob) throw new Error("Document introuvable dans le stockage.");
  const form = new FormData();
  form.append("mode", args.mode);
  form.append("contexte", contexte(args.dossier));
  form.append("file", new File([blob], args.doc.nom, { type: blob.type || "application/pdf" }));
  const res = await fetchAuth("/api/expert/analyser", { method: "POST", body: form });
  const r = await lireReponse<{ data: LectureIA }>(res);
  if (!r.ok || !r.data?.data) throw new Error(r.error || "Lecture impossible.");
  const data = r.data.data;
  const precedente = (args.doc.analyse_ia || {}) as Record<string, unknown>;
  await majDocument(args.doc.id, { analyse_ia: { ...precedente, controle: { mode: args.mode, data, lu_le: new Date().toISOString() } } }).catch(() => undefined);
  return data;
}

/** Dépose un fichier dans le dossier (type pré-rapport ou devis). */
export async function deposerPourControle(dossierId: string, file: File, role: "reference" | "devis", type: TypeControle = "devis"): Promise<DocumentExpert> {
  // Photo du document → PDF (comme l'onglet Documents).
  const { blob } = await fichierVersPdf(file);
  const base = (file.name || (role === "reference" ? "Pré-rapport" : "Devis du garage")).replace(/\.[^.]+$/, "");
  return ajouterDocument({ dossierId, type: role === "reference" ? "pre_rapport" : type === "facture" ? "facture_garage" : "devis_garage", file: blob, nom: `${base}.pdf` });
}

/** Côté du contrôle à partir d'une lecture IA. */
export function coteDepuisLecture(l: LectureIA, doc: DocumentExpert): CoteControle {
  return {
    source: "pdf",
    document_id: doc.id,
    nom: doc.nom,
    numero: l.document?.numero ?? null,
    date: l.document?.date ?? null,
    total_imprime_ht: l.document?.total_ht ?? null,
    confiance: l.confiance,
    chocs: l.chocs || [],
    operations: l.operations || [],
  };
}

/* ------------------------------ Contrôles ---------------------------- */

const TABLE = "expertise_controles";

function normaliserLigne(row: Record<string, unknown>): Controle {
  const c = row as unknown as Controle;
  return { ...c, ecarts: Array.isArray(c.ecarts) ? c.ecarts : [], journal: Array.isArray(c.journal) ? c.journal : [] };
}

export async function chargerControles(): Promise<{ controles: Controle[]; dispo: boolean }> {
  const { data, error } = await supabase.from(TABLE).select("*").order("updated_at", { ascending: false });
  if (error) return { controles: [], dispo: false };
  return { controles: ((data as Record<string, unknown>[]) || []).map(normaliserLigne), dispo: true };
}

export async function chargerControlesDossier(dossierId: string): Promise<{ controles: Controle[]; dispo: boolean }> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("dossier_id", dossierId).order("tour", { ascending: true }).order("created_at", { ascending: true });
  if (error) return { controles: [], dispo: false };
  return { controles: ((data as Record<string, unknown>[]) || []).map(normaliserLigne), dispo: true };
}

export async function creerControle(args: { dossierId: string; tour?: number; parentId?: string | null; reference?: CoteControle | null; devis?: CoteControle | null; ecarts?: EcartControle[]; action?: string; type?: TypeControle }): Promise<Controle> {
  const ligne: Record<string, unknown> = {
    dossier_id: args.dossierId,
    tour: args.tour ?? 1,
    parent_id: args.parentId ?? null,
    reference: args.reference ?? null,
    devis: args.devis ?? null,
    ecarts: args.ecarts ?? [],
    journal: journaliser([], args.action || (args.tour && args.tour > 1 ? `Tour ${args.tour} ouvert (document rectifié)` : args.type === "facture" ? "Contrôle de la facture ouvert" : "Contrôle ouvert")),
  };
  // Colonne « type » (migration v88) : envoyée seulement pour une facture,
  // pour qu'un contrôle de devis reste possible sans la migration.
  if (args.type === "facture") ligne.type = "facture";
  const { data, error } = await supabase.from(TABLE).insert(ligne).select("*").single();
  if (error) throw error;
  return normaliserLigne(data as Record<string, unknown>);
}

export async function majControle(id: string, patch: Partial<Controle>): Promise<Controle> {
  const { id: _i, owner_id: _o, created_at: _c, dossier_id: _d, ...reste } = patch as Controle;
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...reste, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return normaliserLigne(data as Record<string, unknown>);
}

export async function supprimerControle(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Côté « référence » depuis un rapport chiffré dans l'appli. */
export function coteDepuisRapport(r: { id: string; version: number; numero: string; chocs: Choc[]; operations: Operation[] }): CoteControle {
  return { source: "rapport", rapport_id: r.id, rapport_version: r.version, nom: `Rapport ${r.numero} v${r.version}`, chocs: r.chocs || [], operations: r.operations || [] };
}

/** Côté « référence » d'un 2e tour : le chiffrage attendu après le 1er. */
export function coteAttendu(parent: Controle, attendu: Chiffrage): CoteControle {
  return { source: "tour_precedent", nom: `Chiffrage attendu (tour ${parent.tour})`, chocs: attendu.chocs, operations: attendu.operations };
}

/* ----------------------- v13.25 — lien, relances, dépôt ---------------- */

/** Jeton aléatoire non devinable (192 bits, base64url). */
function nouveauJeton(): string {
  const o = new Uint8Array(24);
  crypto.getRandomValues(o);
  let b = "";
  for (let i = 0; i < o.length; i += 1) b += String.fromCharCode(o[i]);
  return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function urlReponseGarage(token: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "https://myeasyauto.fr";
  return `${base}/reponse-garage/${token}`;
}

/**
 * UN SEUL lien par contrôle : créé à la 1re demande au garage, puis réutilisé
 * (relances, nouvelle conclusion). Validité prolongée à 90 jours.
 */
export async function assurerLien(c: Controle): Promise<Controle> {
  const expire = new Date(Date.now() + 90 * 86_400_000).toISOString();
  if (c.lien_token) {
    if (c.lien_expire_le && new Date(c.lien_expire_le).getTime() > Date.now() + 30 * 86_400_000) return c;
    return majControle(c.id, { lien_expire_le: expire });
  }
  return majControle(c.id, { lien_token: nouveauJeton(), lien_expire_le: expire });
}

export async function marquerRelance(c: Controle): Promise<Controle> {
  const n = (Number(c.nb_relances) || 0) + 1;
  return majControle(c.id, { derniere_relance: new Date().toISOString(), nb_relances: n, journal: journaliser(c.journal, `Relance n° ${n} envoyée au garage`) });
}

/** Dépôt groupé : lecture + reconnaissance du type de document (mode=auto). */
export async function analyserFichierAuto(file: File): Promise<LectureIA> {
  const form = new FormData();
  form.append("mode", "auto");
  form.append("file", file);
  const res = await fetchAuth("/api/expert/analyser", { method: "POST", body: form });
  const r = await lireReponse<{ data: LectureIA }>(res);
  if (!r.ok || !r.data?.data) throw new Error(r.error || "Lecture impossible.");
  return r.data.data;
}

/** Mémorise une lecture déjà faite sur un document (le contrôle ne relira pas). */
export async function memoriserLecture(doc: DocumentExpert, mode: ModeLecture, data: LectureIA): Promise<DocumentExpert> {
  const analyse_ia = { ...((doc.analyse_ia || {}) as Record<string, unknown>), controle: { mode, data, lu_le: new Date().toISOString() } };
  await majDocument(doc.id, { analyse_ia });
  return { ...doc, analyse_ia };
}
