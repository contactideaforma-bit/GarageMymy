// ============================================================
//  ESPACE CLIENTS DU COMMERCIAL (v10.2) — types, libellés, CRUD.
//  Un prospect = un garage démarché : identité (SIREN), interlocuteurs,
//  questionnaire des besoins, documents générés, vente.
// ============================================================

import { supabase } from "./supabaseClient";
import { Formule, Periodicite } from "./admin/economie";

export type ProspectStatut = "prospect" | "rdv" | "devis" | "signe" | "client" | "perdu";
export type ProspectOrigine = "portefeuille" | "connaissance" | "recommandation" | "hors_zone" | "editeur";

export type Prospect = {
  id: string;
  created_at: string;
  maj_le: string;
  owner_id: string;
  siren: string | null;
  siret: string | null;
  nom: string;
  forme_juridique: string | null;
  activite: string | null;
  tva_intra: string | null;
  adresse: string | null;
  cp: string | null;
  ville: string | null;
  gerant: string | null;
  contact_nom: string | null;
  contact_fonction: string | null;
  tel: string | null;
  email: string | null;
  site: string | null;
  effectif: number | null;
  besoins: Record<string, unknown> | null;
  statut: ProspectStatut;
  origine: ProspectOrigine;
  origine_detail: string | null;
  prochaine_action: string | null;
  prochaine_date: string | null;
  notes: string | null;
};

export type ParametresOffre = {
  formule: Formule;
  engagement_12: boolean;
  periodicite: Periodicite;
  remise_supp_pct: number;
  date_debut_souhaitee?: string | null;
  mode_paiement?: string;
  validite_jours?: number;
};

export type ProspectDocument = {
  id: string;
  created_at: string;
  owner_id: string;
  prospect_id: string;
  type: "devis" | "contrat" | "simulation" | "fiche";
  numero: string | null;
  parametres: ParametresOffre | null;
  statut: "brouillon" | "envoye" | "signe" | "accepte" | "refuse";
  signature_client: string | null;
  signataire_client: string | null;
  signature_commercial: string | null;
  signe_le: string | null;
  envoye_le: string | null;
  envoye_a: string | null;
  notes: string | null;
};

export const STATUTS_PROSPECT: Record<ProspectStatut, { label: string; badge: string; ordre: number }> = {
  prospect: { label: "Prospect", badge: "badge badge-neutral", ordre: 0 },
  rdv: { label: "RDV pris", badge: "badge badge-info", ordre: 1 },
  devis: { label: "Devis envoyé", badge: "badge badge-warn", ordre: 2 },
  signe: { label: "Contrat signé", badge: "badge badge-ok", ordre: 3 },
  client: { label: "Client actif", badge: "badge badge-ok", ordre: 4 },
  perdu: { label: "Perdu", badge: "badge badge-danger", ordre: 5 },
};

export const ORIGINES_PROSPECT: Record<ProspectOrigine, { label: string; aide: string }> = {
  portefeuille: { label: "Portefeuille / zone attribuée", aide: "Garage situé dans votre zone ou listé dans votre portefeuille." },
  connaissance: { label: "Connaissance personnelle", aide: "Exception au portefeuille : garage que vous connaissiez avant le contrat. Précisez le lien." },
  recommandation: { label: "Recommandé par un client", aide: "Exception au portefeuille : un client vous a recommandé directement à ce garage. Indiquez qui." },
  hors_zone: { label: "Hors zone (accord IDEAFORMA)", aide: "Nécessite l'accord écrit préalable d'IDEAFORMA." },
  editeur: { label: "Apporté par IDEAFORMA", aide: "Garage venu directement à l'éditeur." },
};

export const TYPES_DOCUMENT: Record<ProspectDocument["type"], string> = {
  devis: "Devis",
  contrat: "Contrat d'abonnement",
  simulation: "Simulation tarifaire",
  fiche: "Fiche client (interne)",
};

export const OFFRE_DEFAUT: ParametresOffre = { formule: "confort", engagement_12: true, periodicite: "mensuel", remise_supp_pct: 0, mode_paiement: "virement", validite_jours: 30 };

/* ------------------------------ CRUD ------------------------------ */

export async function chargerProspects(): Promise<Prospect[]> {
  const { data, error } = await supabase.from("prospects").select("*").order("maj_le", { ascending: false });
  if (error) throw error;
  return (data as Prospect[]) || [];
}

export async function chargerProspect(id: string): Promise<{ prospect: Prospect | null; documents: ProspectDocument[] }> {
  const [p, d] = await Promise.all([
    supabase.from("prospects").select("*").eq("id", id).maybeSingle(),
    supabase.from("prospect_documents").select("*").eq("prospect_id", id).order("created_at", { ascending: false }),
  ]);
  return { prospect: (p.data as Prospect) || null, documents: (d.data as ProspectDocument[]) || [] };
}

export async function enregistrerProspect(p: Partial<Prospect> & { nom: string }): Promise<Prospect> {
  const { id, created_at, owner_id, ...reste } = p;
  void created_at;
  void owner_id;
  const ligne = { ...reste, maj_le: new Date().toISOString() };
  const q = id ? supabase.from("prospects").update(ligne).eq("id", id) : supabase.from("prospects").insert(ligne);
  const { data, error } = await q.select("*").single();
  if (error) throw error;
  return data as Prospect;
}

export async function supprimerProspect(id: string): Promise<void> {
  const { error } = await supabase.from("prospects").delete().eq("id", id);
  if (error) throw error;
}

export function genNumeroDoc(type: ProspectDocument["type"]): string {
  const d = new Date();
  const prefix = type === "devis" ? "DEV" : type === "contrat" ? "CTR" : type === "simulation" ? "SIM" : "FIC";
  return `${prefix}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${String(Date.now()).slice(-5)}`;
}

export async function creerDocument(prospectId: string, type: ProspectDocument["type"], parametres: ParametresOffre | null): Promise<ProspectDocument> {
  const { data, error } = await supabase
    .from("prospect_documents")
    .insert({ prospect_id: prospectId, type, numero: genNumeroDoc(type), parametres, statut: "brouillon" })
    .select("*")
    .single();
  if (error) throw error;
  return data as ProspectDocument;
}

export async function majDocument(id: string, patch: Partial<ProspectDocument>): Promise<void> {
  const { error } = await supabase.from("prospect_documents").update(patch).eq("id", id);
  if (error) throw error;
}

export async function supprimerDocument(id: string): Promise<void> {
  const { error } = await supabase.from("prospect_documents").delete().eq("id", id);
  if (error) throw error;
}

/** Texte lisible d'une réponse du questionnaire. */
export function reponseTexte(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v == null || v === "") return "";
  return String(v);
}

/** Fiche prospect → contrat (VenteContrat de contratGarage.ts). */
export function prospectVersContrat(p: Prospect, offre: ParametresOffre, prix: { mensualite: number; montantAnnuel: number | null; miseEnService: number }, code?: string | null) {
  return {
    garage_nom: p.nom,
    garage_siret: p.siret || p.siren,
    garage_adresse: p.adresse,
    garage_cp: p.cp,
    garage_ville: p.ville,
    contact_nom: p.contact_nom || p.gerant,
    contact_fonction: p.contact_fonction || (p.gerant && !p.contact_nom ? "Gérant(e)" : null),
    contact_email: p.email || "",
    contact_tel: p.tel,
    formule: offre.formule,
    engagement_12: offre.engagement_12 || offre.periodicite === "annuel",
    periodicite: offre.periodicite,
    remise_supp_pct: offre.remise_supp_pct,
    prix_mensuel_ht: prix.mensualite,
    montant_annuel_ht: prix.montantAnnuel,
    mise_en_service_ht: prix.miseEnService,
    mode_paiement: offre.mode_paiement || "virement",
    date_debut_souhaitee: offre.date_debut_souhaitee || null,
    signataire_nom: p.contact_nom || p.gerant,
    signataire_qualite: p.contact_fonction || "Gérant(e)",
    code_apporteur: code || null,
  };
}
