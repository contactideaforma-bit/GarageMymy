// Accès aux données du MODE EXPERT (tables expertise_*, migration v75).
// Composants "use client" → Supabase direct, RLS par compte.

import { supabase } from "@/lib/supabaseClient";
import { deposerFichier } from "@/lib/storage";
import { preparerImage } from "@/lib/photosEtat";
import {
  AssuranceExpert, Cabinet, Choc, ClientExpert, DocumentExpert, DossierExpert, GarageExpert, Operation, PhotoExpert, PieceExpert, ProfilExpert, RapportExpert, RdvExpert,
  StatutExpertise, TypeDocExpert, ZonePhoto,
} from "./types";
import { chocParDefaut } from "./chiffrage";

export const BUCKET_EXPERT = "pieces";

/* ------------------------------ Cabinet ------------------------------ */

export async function chargerCabinet(): Promise<Cabinet | null> {
  const { data, error } = await supabase.from("expertise_cabinet").select("*").maybeSingle();
  if (error) return null;
  if (data) return data as Cabinet;
  // Première ouverture : on crée le profil avec les valeurs par défaut (Alliance Experts).
  const { data: cree } = await supabase.from("expertise_cabinet").insert({}).select("*").maybeSingle();
  return (cree as Cabinet) || null;
}

export async function enregistrerCabinet(patch: Partial<Cabinet>): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const owner_id = u.user?.id;
  if (!owner_id) throw new Error("Session expirée.");
  const { error } = await supabase
    .from("expertise_cabinet")
    .upsert({ ...patch, owner_id, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
  if (error) throw error;
}

/** Numéro de rapport suivant (fonction SQL atomique) — repli local si la migration manque. */
export async function prochainNumero(): Promise<string> {
  const { data, error } = await supabase.rpc("expertise_prochain_numero");
  if (!error && typeof data === "string" && data) return data;
  const { count } = await supabase.from("expertise_dossiers").select("id", { count: "exact", head: true });
  return "AE" + String(34915 + (count || 0)).padStart(8, "0");
}

/* ------------------------------ Garages ------------------------------ */

export async function chargerGarages(): Promise<GarageExpert[]> {
  const { data } = await supabase.from("expertise_garages").select("*").order("nom");
  return (data as GarageExpert[]) || [];
}

export async function enregistrerGarage(g: Partial<GarageExpert>): Promise<GarageExpert> {
  const { id, owner_id: _o, created_at: _c, ...reste } = g as GarageExpert;
  const req = id
    ? supabase.from("expertise_garages").update(reste).eq("id", id)
    : supabase.from("expertise_garages").insert(reste);
  const { data, error } = await req.select("*").single();
  if (error) throw error;
  return data as GarageExpert;
}

export async function supprimerGarage(id: string): Promise<void> {
  const { error } = await supabase.from("expertise_garages").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------ Dossiers ----------------------------- */

export async function chargerDossiers(): Promise<{ dossiers: DossierExpert[]; dispo: boolean }> {
  const { data, error } = await supabase.from("expertise_dossiers").select("*").order("created_at", { ascending: false });
  if (error) return { dossiers: [], dispo: false };
  return { dossiers: (data as DossierExpert[]) || [], dispo: true };
}

export async function chargerDossier(id: string): Promise<DossierExpert | null> {
  const { data } = await supabase.from("expertise_dossiers").select("*").eq("id", id).maybeSingle();
  return (data as DossierExpert) || null;
}

export async function creerDossier(d: Partial<DossierExpert>): Promise<DossierExpert> {
  const numero = d.numero || (await prochainNumero());
  const { id: _i, owner_id: _o, created_at: _c, updated_at: _u, ...reste } = d as DossierExpert;
  const { data, error } = await supabase
    .from("expertise_dossiers")
    .insert({ ...reste, numero })
    .select("*")
    .single();
  if (error) throw error;
  return data as DossierExpert;
}

export async function majDossier(id: string, patch: Partial<DossierExpert>): Promise<DossierExpert> {
  const { id: _i, owner_id: _o, created_at: _c, ...reste } = patch as DossierExpert;
  const { data, error } = await supabase
    .from("expertise_dossiers")
    .update({ ...reste, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as DossierExpert;
}

export async function changerStatut(id: string, statut: StatutExpertise): Promise<void> {
  await majDossier(id, { statut });
}

export async function supprimerDossier(id: string): Promise<void> {
  // Fichiers : on liste puis on retire (best-effort), la base suit en cascade.
  const [{ data: photos }, { data: docs }, { data: rapports }] = await Promise.all([
    supabase.from("expertise_photos").select("path").eq("dossier_id", id),
    supabase.from("expertise_documents").select("path").eq("dossier_id", id),
    supabase.from("expertise_rapports").select("pdf_path").eq("dossier_id", id),
  ]);
  const chemins = [
    ...((photos as { path: string }[]) || []).map((p) => p.path),
    ...((docs as { path: string }[]) || []).map((p) => p.path),
    ...((rapports as { pdf_path: string | null }[]) || []).map((p) => p.pdf_path).filter((p): p is string => Boolean(p)),
  ];
  if (chemins.length) await supabase.storage.from(BUCKET_EXPERT).remove(chemins).then(() => undefined, () => undefined);
  const { error } = await supabase.from("expertise_dossiers").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------ Fichiers ----------------------------- */

export async function urlFichierExpert(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET_EXPERT).createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

export async function ouvrirFichierExpert(path: string): Promise<void> {
  const url = await urlFichierExpert(path);
  if (!url) {
    alert("Impossible d'ouvrir le fichier (connexion requise).");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function telechargerBlob(path: string): Promise<Blob | null> {
  const { data } = await supabase.storage.from(BUCKET_EXPERT).download(path);
  return data || null;
}

/* ------------------------------- Photos ------------------------------ */

export async function chargerPhotos(dossierId: string): Promise<PhotoExpert[]> {
  const { data } = await supabase.from("expertise_photos").select("*").eq("dossier_id", dossierId).order("prise_le");
  return (data as PhotoExpert[]) || [];
}

export async function ajouterPhoto(args: { dossierId: string; zone: ZonePhoto; dataUrl: string; legende?: string | null }): Promise<PhotoExpert> {
  const blob = await preparerImage(args.dataUrl, 1800);
  const path = await deposerFichier(
    BUCKET_EXPERT,
    `expertise/${args.dossierId}/photos/${args.zone}-${Date.now()}.jpg`,
    blob,
    { contentType: "image/jpeg" }
  );
  const { data, error } = await supabase
    .from("expertise_photos")
    .insert({ dossier_id: args.dossierId, zone: args.zone, legende: args.legende || null, path })
    .select("*")
    .single();
  if (error) throw error;
  return data as PhotoExpert;
}

export async function majPhoto(id: string, patch: Partial<Pick<PhotoExpert, "zone" | "legende">>): Promise<void> {
  const { error } = await supabase.from("expertise_photos").update(patch).eq("id", id);
  if (error) throw error;
}

export async function supprimerPhoto(p: PhotoExpert): Promise<void> {
  await supabase.storage.from(BUCKET_EXPERT).remove([p.path]).then(() => undefined, () => undefined);
  const { error } = await supabase.from("expertise_photos").delete().eq("id", p.id);
  if (error) throw error;
}

/** Fichier (image) → dataURL, pour la galerie du téléphone. */
export function lireDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ----------------------------- Documents ----------------------------- */

export async function chargerDocuments(dossierId: string): Promise<DocumentExpert[]> {
  const { data } = await supabase.from("expertise_documents").select("*").eq("dossier_id", dossierId).order("created_at");
  return (data as DocumentExpert[]) || [];
}

export async function ajouterDocument(args: {
  dossierId: string;
  type: TypeDocExpert;
  file: File | Blob;
  nom: string;
  analyse_ia?: Record<string, unknown> | null;
}): Promise<DocumentExpert> {
  const ext = (args.nom.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const contentType = (args.file as File).type || (ext === "pdf" ? "application/pdf" : `image/${ext}`);
  const path = await deposerFichier(
    BUCKET_EXPERT,
    `expertise/${args.dossierId}/docs/${args.type}-${Date.now()}.${ext}`,
    args.file,
    { contentType }
  );
  const { data, error } = await supabase
    .from("expertise_documents")
    .insert({ dossier_id: args.dossierId, type: args.type, nom: args.nom, path, taille: args.file.size, analyse_ia: args.analyse_ia || null })
    .select("*")
    .single();
  if (error) throw error;
  return data as DocumentExpert;
}

export async function majDocument(id: string, patch: Partial<Pick<DocumentExpert, "type" | "nom" | "analyse_ia">>): Promise<void> {
  const { error } = await supabase.from("expertise_documents").update(patch).eq("id", id);
  if (error) throw error;
}

export async function supprimerDocument(d: DocumentExpert): Promise<void> {
  await supabase.storage.from(BUCKET_EXPERT).remove([d.path]).then(() => undefined, () => undefined);
  const { error } = await supabase.from("expertise_documents").delete().eq("id", d.id);
  if (error) throw error;
}

/* ------------------------------ Rapports ----------------------------- */

export async function chargerRapports(dossierId: string): Promise<RapportExpert[]> {
  const { data } = await supabase.from("expertise_rapports").select("*").eq("dossier_id", dossierId).order("version", { ascending: false });
  return (data as RapportExpert[]) || [];
}

export async function chargerTousRapports(): Promise<RapportExpert[]> {
  const { data } = await supabase.from("expertise_rapports").select("*").order("updated_at", { ascending: false });
  return (data as RapportExpert[]) || [];
}

export async function creerRapport(args: {
  dossier: DossierExpert;
  source: RapportExpert["source"];
  chocs?: Choc[];
  operations?: Operation[];
  taux_tva?: number;
}): Promise<RapportExpert> {
  const existants = await chargerRapports(args.dossier.id);
  const version = existants.length ? Math.max(...existants.map((r) => r.version)) + 1 : 1;
  const { data, error } = await supabase
    .from("expertise_rapports")
    .insert({
      dossier_id: args.dossier.id,
      numero: args.dossier.numero,
      version,
      source: args.source,
      taux_tva: args.taux_tva ?? 20,
      chocs: args.chocs && args.chocs.length ? args.chocs : [chocParDefaut(1)],
      operations: args.operations || [],
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as RapportExpert;
}

export async function majRapport(id: string, patch: Partial<RapportExpert>): Promise<RapportExpert> {
  const { id: _i, owner_id: _o, created_at: _c, dossier_id: _d, ...reste } = patch as RapportExpert;
  const { data, error } = await supabase
    .from("expertise_rapports")
    .update({ ...reste, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as RapportExpert;
}

export async function supprimerRapport(r: RapportExpert): Promise<void> {
  if (r.pdf_path) await supabase.storage.from(BUCKET_EXPERT).remove([r.pdf_path]).then(() => undefined, () => undefined);
  const { error } = await supabase.from("expertise_rapports").delete().eq("id", r.id);
  if (error) throw error;
}

export async function deposerPdfRapport(r: RapportExpert, blob: Blob): Promise<string> {
  const path = await deposerFichier(
    BUCKET_EXPERT,
    `expertise/${r.dossier_id}/rapports/${r.numero}-v${r.version}.pdf`,
    blob,
    { contentType: "application/pdf", upsert: true }
  );
  await majRapport(r.id, { pdf_path: path });
  return path;
}

/* ------------------------------- Pièces ------------------------------ */

export async function chargerPieces(dossierId?: string | null): Promise<PieceExpert[]> {
  let req = supabase.from("expertise_pieces").select("*").order("created_at", { ascending: false });
  if (dossierId) req = req.eq("dossier_id", dossierId);
  const { data } = await req;
  return (data as PieceExpert[]) || [];
}

export async function enregistrerPiece(p: Partial<PieceExpert>): Promise<PieceExpert> {
  const { id, owner_id: _o, created_at: _c, ...reste } = p as PieceExpert;
  const req = id ? supabase.from("expertise_pieces").update(reste).eq("id", id) : supabase.from("expertise_pieces").insert(reste);
  const { data, error } = await req.select("*").single();
  if (error) throw error;
  return data as PieceExpert;
}

export async function supprimerPiece(id: string): Promise<void> {
  const { error } = await supabase.from("expertise_pieces").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------------- Base de données (v13.6) ---------------------- */

export async function chargerAssurances(): Promise<AssuranceExpert[]> {
  const { data } = await supabase.from("expertise_assurances").select("*").order("nom");
  return (data as AssuranceExpert[]) || [];
}
export async function enregistrerAssurance(a: Partial<AssuranceExpert>): Promise<AssuranceExpert> {
  const { id, owner_id: _o, created_at: _c, ...reste } = a as AssuranceExpert;
  const req = id ? supabase.from("expertise_assurances").update(reste).eq("id", id) : supabase.from("expertise_assurances").insert(reste);
  const { data, error } = await req.select("*").single();
  if (error) throw error;
  return data as AssuranceExpert;
}
export async function supprimerAssurance(id: string): Promise<void> {
  const { error } = await supabase.from("expertise_assurances").delete().eq("id", id);
  if (error) throw error;
}

export async function chargerClients(): Promise<ClientExpert[]> {
  const { data } = await supabase.from("expertise_clients").select("*").order("nom");
  return (data as ClientExpert[]) || [];
}
export async function enregistrerClient(c: Partial<ClientExpert>): Promise<ClientExpert> {
  const { id, owner_id: _o, created_at: _c, ...reste } = c as ClientExpert;
  const req = id ? supabase.from("expertise_clients").update(reste).eq("id", id) : supabase.from("expertise_clients").insert(reste);
  const { data, error } = await req.select("*").single();
  if (error) throw error;
  return data as ClientExpert;
}
export async function supprimerClient(id: string): Promise<void> {
  const { error } = await supabase.from("expertise_clients").delete().eq("id", id);
  if (error) throw error;
}

const cleNom = (s: string | null | undefined) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

/** Ajoute à l'annuaire une fiche absente (comparaison sur le nom normalisé). Best-effort, jamais bloquant. */
export async function completerAnnuaireDepuisDossier(d: Partial<DossierExpert>): Promise<void> {
  try {
    if (d.mandant_nom) {
      const liste = await chargerAssurances();
      if (!liste.some((a) => cleNom(a.nom) === cleNom(d.mandant_nom))) {
        await enregistrerAssurance({ nom: d.mandant_nom.trim(), adresse: d.mandant_adresse || null, email: d.mandant_email || null });
      }
    }
    if (d.lese_nom) {
      const liste = await chargerClients();
      if (!liste.some((c) => cleNom(c.nom) === cleNom(d.lese_nom))) {
        const lignes = (d.lese_adresse || "").split("\n").map((l) => l.trim()).filter(Boolean);
        const m = lignes.join(" ").match(/^(.*?)\s*(\d{5})\s+(.+)$/);
        await enregistrerClient({
          nom: d.lese_nom.trim(),
          type: /\b(sas|sarl|sa|eurl|sci|sasu|societe|société|transports|garage|auto)\b/i.test(d.lese_nom) ? "societe" : "particulier",
          adresse: m ? m[1] || null : lignes[0] || null,
          code_postal: m ? m[2] : null,
          ville: m ? m[3] : null,
          tel: d.lese_tel || null,
          email: d.lese_email || null,
        });
      }
    }
  } catch {
    /* annuaire indisponible (migration v76 absente) : on n'empêche pas la création du dossier */
  }
}

/* ------------------ Profil expert & agenda (v13.7) ------------------- */

export async function chargerProfilExpert(): Promise<ProfilExpert | null> {
  const { data, error } = await supabase.from("expertise_experts").select("*").maybeSingle();
  if (error) return null;
  return (data as ProfilExpert) || null;
}

export async function enregistrerProfilExpert(patch: Partial<ProfilExpert>): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const owner_id = u.user?.id;
  if (!owner_id) throw new Error("Session expirée.");
  const { error } = await supabase
    .from("expertise_experts")
    .upsert({ ...patch, owner_id, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
  if (error) throw error;
}

export async function chargerRdv(args?: { de?: string; a?: string; dossierId?: string }): Promise<{ rdv: RdvExpert[]; dispo: boolean }> {
  let req = supabase.from("expertise_rdv").select("*").order("date").order("heure");
  if (args?.de) req = req.gte("date", args.de);
  if (args?.a) req = req.lte("date", args.a);
  if (args?.dossierId) req = req.eq("dossier_id", args.dossierId);
  const { data, error } = await req;
  if (error) return { rdv: [], dispo: false };
  return { rdv: (data as RdvExpert[]) || [], dispo: true };
}

export async function enregistrerRdv(r: Partial<RdvExpert>): Promise<RdvExpert> {
  const { id, owner_id: _o, created_at: _c, ...reste } = r as RdvExpert;
  const req = id ? supabase.from("expertise_rdv").update(reste).eq("id", id) : supabase.from("expertise_rdv").insert(reste);
  const { data, error } = await req.select("*").single();
  if (error) throw error;
  const rdv = data as RdvExpert;
  // Le dossier suit : date de visite + statut « Visite planifiée » si la mission vient d'arriver.
  if (rdv.dossier_id && rdv.statut === "planifie" && (rdv.type === "visite" || rdv.type === "contradictoire" || rdv.type === "ead")) {
    const d = await chargerDossier(rdv.dossier_id);
    if (d) await majDossier(d.id, { date_visite: rdv.date, statut: d.statut === "mission" ? "visite" : d.statut });
  }
  return rdv;
}

export async function supprimerRdv(id: string): Promise<void> {
  const { error } = await supabase.from("expertise_rdv").delete().eq("id", id);
  if (error) throw error;
}
