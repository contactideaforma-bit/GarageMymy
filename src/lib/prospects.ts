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
  // v12.9 — suivi du démarchage (dérivé du journal des contacts)
  nb_appels?: number;
  dernier_contact?: string | null;
  dernier_resultat?: ResultatContact | null;
  motif_refus?: MotifRefus | null;
  motif_refus_detail?: string | null;
  rdv_le?: string | null;
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

/* --------------------------- Rappels (alertes) --------------------------- */
// Le rappel du commercial = prochaine_action + prochaine_date de la fiche :
// « le client souhaite être recontacté à telle date / dans tel délai ».

export const DELAIS_RAPPEL: { label: string; jours: number }[] = [
  { label: "3 jours", jours: 3 },
  { label: "1 semaine", jours: 7 },
  { label: "2 semaines", jours: 14 },
  { label: "1 mois", jours: 30 },
  { label: "2 mois", jours: 61 },
];

export function dateDansJours(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export type EtatRappel = "echu" | "aujourdhui" | "bientot" | "planifie";

/** État du rappel d'un prospect (null si aucun rappel ou dossier clos). */
export function etatRappel(p: Prospect): EtatRappel | null {
  if (!p.prochaine_date || p.statut === "perdu") return null;
  const auj = new Date().toISOString().slice(0, 10);
  if (p.prochaine_date < auj) return "echu";
  if (p.prochaine_date === auj) return "aujourdhui";
  if (p.prochaine_date <= dateDansJours(7)) return "bientot";
  return "planifie";
}

/* ------------------------ Démarchage (v12.9) ------------------------ */
// Le JOURNAL des contacts : chaque appel / SMS / email / visite est noté avec
// son résultat. La fiche prospect en dérive : nb d'appels, dernier contact,
// statut, rappel programmé, motif du refus.

export type CanalContact = "appel" | "sms" | "email" | "visite" | "note";
export type ResultatContact = "pas_repondu" | "messagerie" | "rappeler" | "interesse" | "rdv" | "refus" | "injoignable" | "autre";
export type MotifRefus = "deja_equipe" | "pas_besoin" | "trop_cher" | "reseau" | "mefiance" | "concurrent" | "ferme" | "autre";

export type ProspectInteraction = {
  id: string;
  created_at: string;
  owner_id: string;
  prospect_id: string;
  canal: CanalContact;
  resultat: ResultatContact;
  motif_refus: MotifRefus | null;
  commentaire: string | null;
  prochaine_date: string | null;
  rdv_le: string | null;
};

export const CANAUX_CONTACT: Record<CanalContact, { label: string; icone: string }> = {
  appel: { label: "Appel", icone: "📞" },
  sms: { label: "SMS", icone: "💬" },
  email: { label: "Email", icone: "✉️" },
  visite: { label: "Visite", icone: "🚗" },
  note: { label: "Note", icone: "📝" },
};

/** Résultats possibles d'un contact, avec l'effet automatique sur la fiche. */
export const RESULTATS_CONTACT: Record<ResultatContact, { label: string; aide: string; badge: string; rappelJours: number | null; action: string | null }> = {
  pas_repondu: { label: "Pas de réponse", aide: "Rappel automatique dans 2 jours.", badge: "badge badge-neutral", rappelJours: 2, action: "Rappeler (pas de réponse)" },
  messagerie: { label: "Message laissé", aide: "Rappel automatique dans 3 jours.", badge: "badge badge-neutral", rappelJours: 3, action: "Rappeler (message laissé)" },
  rappeler: { label: "À rappeler", aide: "Il demande à être rappelé : choisissez la date.", badge: "badge badge-warn", rappelJours: 7, action: "Rappeler à sa demande" },
  interesse: { label: "Intéressé", aide: "Envoyez la présentation, rappel dans 3 jours pour fixer le RDV.", badge: "badge badge-info", rappelJours: 3, action: "Fixer le RDV (présentation envoyée)" },
  rdv: { label: "RDV pris", aide: "La fiche passe en « RDV pris ». Notez la date et l'heure.", badge: "badge badge-ok", rappelJours: null, action: null },
  refus: { label: "Non", aide: "Notez le motif : c'est ce qui fait progresser le discours.", badge: "badge badge-danger", rappelJours: null, action: null },
  injoignable: { label: "Injoignable", aide: "Numéro faux, garage fermé… la fiche passe en perdu.", badge: "badge badge-danger", rappelJours: null, action: null },
  autre: { label: "Autre", aide: "Simple note, sans effet sur le statut.", badge: "badge badge-neutral", rappelJours: null, action: null },
};

export const MOTIFS_REFUS: Record<MotifRefus, string> = {
  deja_equipe: "Déjà équipé d'un logiciel",
  pas_besoin: "Pas de besoin / gère lui-même",
  trop_cher: "Trop cher",
  reseau: "Réseau intégré / décision au siège",
  mefiance: "Méfiance / mauvaise expérience passée",
  concurrent: "Parti chez un concurrent",
  ferme: "Cesse ou vend l'activité",
  autre: "Autre motif",
};

/** Le prospect n'a jamais été contacté. */
export function jamaisContacte(p: Prospect): boolean {
  return (p.nb_appels || 0) === 0 && !p.dernier_contact && p.statut === "prospect";
}

/** Ce que le contact change sur la fiche (statut, rappel, compteurs). */
export function patchApresInteraction(p: Prospect, i: { canal: CanalContact; resultat: ResultatContact; motif_refus?: MotifRefus | null; commentaire?: string | null; prochaine_date?: string | null; rdv_le?: string | null }): Partial<Prospect> {
  const r = RESULTATS_CONTACT[i.resultat];
  const patch: Partial<Prospect> = {
    nb_appels: (p.nb_appels || 0) + (i.canal === "appel" ? 1 : 0),
    dernier_contact: new Date().toISOString(),
    dernier_resultat: i.resultat,
  };
  if (i.resultat === "rdv") {
    Object.assign(patch, { statut: p.statut === "prospect" || p.statut === "perdu" ? "rdv" : p.statut, rdv_le: i.rdv_le || null, prochaine_action: "RDV à l'atelier", prochaine_date: i.rdv_le ? i.rdv_le.slice(0, 10) : p.prochaine_date, motif_refus: null, motif_refus_detail: null });
  } else if (i.resultat === "refus" || i.resultat === "injoignable") {
    Object.assign(patch, { statut: "perdu", motif_refus: i.resultat === "injoignable" ? "autre" : i.motif_refus || "autre", motif_refus_detail: i.resultat === "injoignable" ? "Injoignable" : i.commentaire || null, prochaine_action: null, prochaine_date: null });
  } else if (r.rappelJours != null) {
    const d = i.prochaine_date || dateDansJours(r.rappelJours);
    Object.assign(patch, { prochaine_action: i.commentaire ? `${r.action} — ${i.commentaire}` : r.action, prochaine_date: d });
    if (p.statut === "perdu") patch.statut = "prospect";
  }
  return patch;
}

export async function chargerInteractions(prospectId: string): Promise<ProspectInteraction[]> {
  const { data, error } = await supabase.from("prospect_interactions").select("*").eq("prospect_id", prospectId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ProspectInteraction[]) || [];
}

/** Journal du commercial (tous prospects) sur N jours — pour les statistiques d'activité. */
export async function chargerInteractionsRecentes(jours = 30): Promise<ProspectInteraction[]> {
  const depuis = new Date();
  depuis.setDate(depuis.getDate() - jours);
  const { data, error } = await supabase.from("prospect_interactions").select("*").gte("created_at", depuis.toISOString()).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ProspectInteraction[]) || [];
}

/** Note un contact ET met la fiche à jour (compteurs, statut, rappel). Retourne la fiche à jour. */
export async function enregistrerInteraction(p: Prospect, i: { canal: CanalContact; resultat: ResultatContact; motif_refus?: MotifRefus | null; commentaire?: string | null; prochaine_date?: string | null; rdv_le?: string | null }): Promise<{ prospect: Prospect; interaction: ProspectInteraction }> {
  const { data, error } = await supabase
    .from("prospect_interactions")
    .insert({ prospect_id: p.id, canal: i.canal, resultat: i.resultat, motif_refus: i.resultat === "refus" ? i.motif_refus || "autre" : null, commentaire: i.commentaire || null, prochaine_date: i.prochaine_date || null, rdv_le: i.rdv_le || null })
    .select("*")
    .single();
  if (error) throw error;
  const prospect = await enregistrerProspect({ ...p, ...patchApresInteraction(p, i) });
  return { prospect, interaction: data as ProspectInteraction };
}

export async function supprimerInteraction(id: string): Promise<void> {
  const { error } = await supabase.from("prospect_interactions").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Pipeline : où en est mon travail ? ---------------- */

export type EtapePipeline = "a_appeler" | "en_cours" | "rdv" | "devis" | "signe" | "client" | "perdu";
export const ETAPES_PIPELINE: Record<EtapePipeline, { label: string; couleur: string }> = {
  a_appeler: { label: "À appeler", couleur: "bg-white/25" },
  en_cours: { label: "Contactés", couleur: "bg-accent-violet" },
  rdv: { label: "RDV", couleur: "bg-sky-400" },
  devis: { label: "Devis", couleur: "bg-amber-300" },
  signe: { label: "Signés", couleur: "bg-accent-teal" },
  client: { label: "Clients", couleur: "bg-emerald-400" },
  perdu: { label: "Perdus", couleur: "bg-rose-400" },
};

export function etapeDe(p: Prospect): EtapePipeline {
  if (p.statut === "prospect") return jamaisContacte(p) ? "a_appeler" : "en_cours";
  return p.statut;
}

export type StatsPipeline = { parEtape: Record<EtapePipeline, number>; contactes: number; tauxRdv: number | null; tauxSignature: number | null; motifs: { motif: MotifRefus; n: number }[] };

export function statsPipeline(liste: Prospect[]): StatsPipeline {
  const parEtape = { a_appeler: 0, en_cours: 0, rdv: 0, devis: 0, signe: 0, client: 0, perdu: 0 } as Record<EtapePipeline, number>;
  for (const p of liste) parEtape[etapeDe(p)]++;
  const contactes = liste.length - parEtape.a_appeler;
  const rdvPlus = parEtape.rdv + parEtape.devis + parEtape.signe + parEtape.client;
  const signes = parEtape.signe + parEtape.client;
  const motifsMap = new Map<MotifRefus, number>();
  for (const p of liste) if (p.statut === "perdu" && p.motif_refus) motifsMap.set(p.motif_refus, (motifsMap.get(p.motif_refus) || 0) + 1);
  const motifs = Array.from(motifsMap.entries()).map(([motif, n]) => ({ motif, n })).sort((a, b) => b.n - a.n);
  return { parEtape, contactes, tauxRdv: contactes ? Math.round((rdvPlus / contactes) * 100) : null, tauxSignature: rdvPlus ? Math.round((signes / rdvPlus) * 100) : null, motifs };
}

/** File d'appels du jour : rappels en retard / du jour, puis jamais contactés, puis rappels à venir. */
export function fileAppels(liste: Prospect[]): Prospect[] {
  const poids = (p: Prospect): number => {
    const e = etatRappel(p);
    if (e === "echu") return 0;
    if (e === "aujourdhui") return 1;
    if (jamaisContacte(p)) return 2;
    if (e === "bientot") return 3;
    return 9;
  };
  return liste
    .filter((p) => p.statut === "prospect" || (p.statut === "rdv" && etatRappel(p) === "echu"))
    .filter((p) => poids(p) < 9)
    .sort((a, b) => poids(a) - poids(b) || (a.prochaine_date || "9").localeCompare(b.prochaine_date || "9"));
}

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
