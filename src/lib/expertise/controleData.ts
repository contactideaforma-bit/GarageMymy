// Accès aux données du CONTRÔLE DU DEVIS (mode expert, v13.23 — migration v87).
// Composants "use client" → Supabase direct, RLS par compte.

import { supabase } from "@/lib/supabaseClient";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import { fichierVersPdf } from "@/lib/photoPdf";
import { ajouterDocument, majDocument, telechargerBlob } from "./data";
import { Choc, DocumentExpert, DossierExpert, Operation } from "./types";
import { Chiffrage, Controle, CoteControle, EcartControle, journaliser } from "./controle";

/** Résultat de /api/expert/analyser (champs utiles au contrôle). */
export type LectureIA = {
  vehicule: { immatriculation: string | null; marque: string | null; modele: string | null } | null;
  reparateur: { nom: string | null; adresse: string | null; siret: string | null } | null;
  document: { numero: string | null; date: string | null; total_ht: number | null; total_tva: number | null; total_ttc: number | null } | null;
  chocs: Choc[];
  operations: Operation[];
  remarques: string | null;
  confiance: "faible" | "moyenne" | "bonne";
};

/* ------------------------------ Lecture ------------------------------ */

type ModeLecture = "rapport" | "devis";

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
export async function deposerPourControle(dossierId: string, file: File, role: "reference" | "devis"): Promise<DocumentExpert> {
  // Photo du document → PDF (comme l'onglet Documents).
  const { blob } = await fichierVersPdf(file);
  const base = (file.name || (role === "reference" ? "Pré-rapport" : "Devis du garage")).replace(/\.[^.]+$/, "");
  return ajouterDocument({ dossierId, type: role === "reference" ? "pre_rapport" : "devis_garage", file: blob, nom: `${base}.pdf` });
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

export async function creerControle(args: { dossierId: string; tour?: number; parentId?: string | null; reference?: CoteControle | null; devis?: CoteControle | null; ecarts?: EcartControle[]; action?: string }): Promise<Controle> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      dossier_id: args.dossierId,
      tour: args.tour ?? 1,
      parent_id: args.parentId ?? null,
      reference: args.reference ?? null,
      devis: args.devis ?? null,
      ecarts: args.ecarts ?? [],
      journal: journaliser([], args.action || (args.tour && args.tour > 1 ? `Tour ${args.tour} ouvert (devis rectifié)` : "Contrôle ouvert")),
    })
    .select("*")
    .single();
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
