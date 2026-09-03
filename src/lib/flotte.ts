// Helpers Flotte du garage : alertes assurance (J+40), conformité,
// statut location/sinistre. Repris de l'idée du projet "flotte-auto".

import { Dossier, FlotteVehicule, FlotteDocument, FlotteEntretien, FlotteMiseADispo, FlottePhoto } from "./types";
import { estActif } from "./format";
import { supabase } from "./supabaseClient";
import { deposerFichier } from "./storage";

// L'alerte assurance se déclenche 40 jours après la date de souscription.
export const ALERTE_ASSURANCE_JOURS = 40;

export type AlerteAssurance = "aucune" | "ok" | "bientot" | "expiree";

export function joursAvantAlerte(dateAssurance: string | null): number | null {
  if (!dateAssurance) return null;
  const d = new Date(dateAssurance);
  if (isNaN(d.getTime())) return null;
  const alerte = new Date(d);
  alerte.setDate(alerte.getDate() + ALERTE_ASSURANCE_JOURS);
  alerte.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((alerte.getTime() - today.getTime()) / 86400000);
}

export function alerteAssurance(v: Pick<FlotteVehicule, "date_assurance">): AlerteAssurance {
  const j = joursAvantAlerte(v.date_assurance);
  if (j === null) return "aucune";
  if (j < 0) return "expiree";
  if (j <= 10) return "bientot";
  return "ok";
}

export const ALERTE_INFO: Record<AlerteAssurance, { label: string; badge: string }> = {
  aucune: { label: "—", badge: "bg-slate-100 text-slate-500" },
  ok: { label: "OK", badge: "bg-emerald-100 text-emerald-700" },
  bientot: { label: "Bientôt", badge: "bg-amber-100 text-amber-700" },
  expiree: { label: "Expirée", badge: "bg-rose-100 text-rose-700" },
};

export function estConforme(v: Pick<FlotteVehicule, "ct_ok" | "cg_ok" | "entretien_ok">): boolean {
  return v.ct_ok && v.cg_ok && v.entretien_ok;
}

/* ------------------------- Lien avec les dossiers ------------------------- */

function normaliseImmat(s: string | null | undefined): string {
  return (s || "").toUpperCase().replace(/[\s\-_.]/g, "");
}

// Dossier sinistre EN COURS correspondant à ce véhicule (par immatriculation).
export function dossierActifPourImmat(immat: string, dossiers: Dossier[]): Dossier | null {
  const cible = normaliseImmat(immat);
  if (!cible) return null;
  return (
    dossiers.find(
      (d) => normaliseImmat(d.immatriculation) === cible && estActif(d.statut)
    ) || null
  );
}

// Un véhicule est "sinistré" si un dossier actif le concerne OU si une date
// de sinistre a été saisie manuellement.
export function estSinistre(v: FlotteVehicule, dossierActif: Dossier | null): boolean {
  return Boolean(dossierActif || v.date_sinistre);
}

/* ====================================================================
   FICHE VÉHICULE, MISES À DISPOSITION, FLOTTE HORS GARAGE (v67 / v12.3)
==================================================================== */


/** Comptes qui voient l'onglet « Flotte hors garage » (véhicules au nom de tiers). */
export const COMPTES_FLOTTE_HORS_GARAGE = ["latelierdesaintjoseph@gmail.com"];

export function aFlotteHorsGarage(email?: string | null): boolean {
  if (!email) return false;
  return COMPTES_FLOTTE_HORS_GARAGE.includes(email.trim().toLowerCase());
}

export const TYPES_DOC_FLOTTE: { type: string; label: string; expire: boolean }[] = [
  { type: "carte_grise", label: "Carte grise", expire: false },
  { type: "assurance", label: "Attestation d'assurance", expire: true },
  { type: "cni", label: "Pièce d'identité (titulaire)", expire: true },
  { type: "permis", label: "Permis de conduire", expire: false },
  { type: "controle_technique", label: "Contrôle technique", expire: true },
  { type: "photo", label: "Photo du véhicule", expire: false },
  { type: "entretien", label: "Facture d'entretien", expire: false },
  { type: "contrat", label: "Contrat de prêt / location", expire: false },
  { type: "pv", label: "PV / amende reçue", expire: false },
  { type: "autre", label: "Autre document", expire: false },
];

export function labelDocFlotte(type: string): string {
  return TYPES_DOC_FLOTTE.find((t) => t.type === type)?.label || type;
}

export const TYPES_ENTRETIEN: Record<string, string> = {
  revision: "Révision",
  vidange: "Vidange",
  pneus: "Pneus",
  freins: "Freins",
  ct: "Contrôle technique",
  carrosserie: "Carrosserie",
  reparation: "Réparation",
  autre: "Autre",
};

export const TYPES_CONTRAT_ASSURANCE = ["Tous risques", "Tiers", "Tiers étendu", "Flotte", "Garage (W)", "Autre"];

export const TYPES_MAD: Record<string, { label: string; verbe: string; badge: string; role: string }> = {
  pret: { label: "Prêt", verbe: "Prêter", badge: "bg-sky-100 text-sky-700", role: "emprunteur" },
  location: { label: "Location", verbe: "Louer", badge: "bg-violet-100 text-violet-700", role: "locataire" },
};

export function labelMad(type: string): string {
  return TYPES_MAD[type]?.label || type;
}

/** Mise à disposition en cours (une seule à la fois par véhicule, normalement). */
export function madEnCours(mads: FlotteMiseADispo[]): FlotteMiseADispo | null {
  return mads.find((m) => m.statut === "en_cours") || null;
}

/** Date effective de fin : retour réel, sinon retour prévu, sinon ouverte. */
export function finEffective(m: FlotteMiseADispo): string | null {
  if (m.date_retour) return m.date_retour.slice(0, 10);
  if (m.statut === "en_cours") return null;
  return m.date_fin;
}

/**
 * QUI AVAIT LE VÉHICULE À CETTE DATE ? (PV de stationnement, radar…)
 * On cherche la mise à disposition dont la période couvre la date. Une
 * mise à disposition en cours sans date de retour couvre jusqu'à aujourd'hui.
 */
export function detenteurA(mads: FlotteMiseADispo[], date: string): FlotteMiseADispo | null {
  const jour = date.slice(0, 10);
  if (!jour) return null;
  const candidats = mads.filter((m) => {
    if (m.statut === "annulee" || !m.date_debut) return false;
    if (m.date_debut > jour) return false;
    const fin = finEffective(m);
    return !fin || fin >= jour;
  });
  // La plus récente d'abord (si deux se chevauchent par erreur de saisie).
  candidats.sort((a, b) => (b.date_debut || "").localeCompare(a.date_debut || ""));
  return candidats[0] || null;
}

/** Phrase prête à afficher / à dire par MY-MY. */
export function phraseDetenteur(immat: string, m: FlotteMiseADispo | null, date: string, formatDate: (s: string | null) => string): string {
  if (!m) return `Le ${formatDate(date)}, ${immat} n'était ni prêté ni loué : il était au garage (ou aucune mise à disposition n'a été enregistrée).`;
  const fin = finEffective(m);
  return (
    `Le ${formatDate(date)}, ${immat} était ${m.type === "location" ? "loué" : "prêté"} à ${m.conducteur_nom || "—"}` +
    `${m.conducteur_tel ? ` (tél. ${m.conducteur_tel})` : ""}, du ${formatDate(m.date_debut)} au ${fin ? formatDate(fin) : "aujourd'hui (en cours)"}` +
    `${m.km_depart != null ? ` · ${Number(m.km_depart).toLocaleString("fr-FR")} km au départ` : ""}` +
    `${m.cg_acceptees || m.signature ? " · conditions générales signées" : " · conditions générales NON signées"}.`
  );
}

/* ------------------------------ Lecture ------------------------------ */

export async function chargerFicheVehicule(vehiculeId: string): Promise<{
  vehicule: FlotteVehicule | null;
  documents: FlotteDocument[];
  entretiens: FlotteEntretien[];
  mads: FlotteMiseADispo[];
  photos: FlottePhoto[];
  migrationOk: boolean;
}> {
  const [v, d, e, m, p] = await Promise.all([
    supabase.from("flotte_vehicules").select("*").eq("id", vehiculeId).maybeSingle(),
    supabase.from("flotte_documents").select("*").eq("vehicule_id", vehiculeId).order("created_at", { ascending: false }),
    supabase.from("flotte_entretiens").select("*").eq("vehicule_id", vehiculeId).order("date_entretien", { ascending: false }),
    supabase.from("flotte_mises_a_dispo").select("*").eq("vehicule_id", vehiculeId).order("date_debut", { ascending: false }),
    supabase.from("flotte_photos").select("*").eq("vehicule_id", vehiculeId).order("prise_le", { ascending: true }),
  ]);
  return {
    vehicule: (v.data as FlotteVehicule) || null,
    documents: (d.data as FlotteDocument[]) || [],
    entretiens: (e.data as FlotteEntretien[]) || [],
    mads: (m.data as FlotteMiseADispo[]) || [],
    photos: (p.data as FlottePhoto[]) || [],
    migrationOk: !d.error && !m.error,
  };
}

/** Lien signé (1 h) pour un fichier de la flotte (bucket privé « pieces »). */
export async function urlFichierFlotte(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("pieces").createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

/* ------------------------------ Écriture ----------------------------- */

export async function deposerDocumentFlotte(args: {
  vehiculeId: string;
  type: string;
  fichier: File | Blob;
  nom?: string | null;
  dateExpiration?: string | null;
}): Promise<FlotteDocument> {
  const ext = args.fichier instanceof File ? args.fichier.name.split(".").pop() || "bin" : "jpg";
  const path = await deposerFichier(
    "pieces",
    `flotte/${args.vehiculeId}/${args.type}-${Date.now()}.${ext.toLowerCase()}`,
    args.fichier,
    { contentType: args.fichier.type || undefined }
  );
  const { data, error } = await supabase
    .from("flotte_documents")
    .insert({
      vehicule_id: args.vehiculeId,
      type: args.type,
      nom: args.nom || (args.fichier instanceof File ? args.fichier.name : null),
      path,
      date_expiration: args.dateExpiration || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as FlotteDocument;
}

export async function supprimerDocumentFlotte(doc: FlotteDocument): Promise<void> {
  const { error } = await supabase.from("flotte_documents").delete().eq("id", doc.id);
  if (error) throw error;
  await supabase.storage.from("pieces").remove([doc.path]);
}

export async function enregistrerPhotoFlotte(args: {
  vehiculeId: string;
  madId: string | null;
  moment: string;
  angle: string;
  blob: Blob;
  kilometrage?: number | null;
  commentaire?: string | null;
  ancienne?: FlottePhoto | null;
}): Promise<FlottePhoto> {
  const path = await deposerFichier(
    "pieces",
    `flotte/${args.vehiculeId}/photos/${args.madId || "fiche"}-${args.moment}-${args.angle}-${Date.now()}.jpg`,
    args.blob,
    { contentType: "image/jpeg" }
  );
  const { data, error } = await supabase
    .from("flotte_photos")
    .insert({
      vehicule_id: args.vehiculeId,
      mise_a_dispo_id: args.madId,
      moment: args.moment,
      angle: args.angle,
      path,
      kilometrage: args.kilometrage ?? null,
      commentaire: args.commentaire || null,
      prise_le: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  if (args.ancienne) {
    await supabase.storage.from("pieces").remove([args.ancienne.path]);
    await supabase.from("flotte_photos").delete().eq("id", args.ancienne.id);
  }
  return data as FlottePhoto;
}

export async function supprimerPhotoFlotte(photo: FlottePhoto): Promise<void> {
  const { error } = await supabase.from("flotte_photos").delete().eq("id", photo.id);
  if (error) throw error;
  await supabase.storage.from("pieces").remove([photo.path]);
}

/**
 * Synchronise les colonnes « historiques » du véhicule (loue, locataire…)
 * avec la mise à disposition en cours : la liste et le panneau « Véhicule
 * de prêt » de la fiche dossier continuent de fonctionner sans changement.
 */
export async function synchroniserStatutVehicule(vehiculeId: string): Promise<void> {
  const { data } = await supabase
    .from("flotte_mises_a_dispo")
    .select("*")
    .eq("vehicule_id", vehiculeId)
    .eq("statut", "en_cours")
    .order("date_debut", { ascending: false })
    .limit(1);
  const m = ((data as FlotteMiseADispo[]) || [])[0];
  await supabase
    .from("flotte_vehicules")
    .update(
      m
        ? {
            loue: true,
            locataire: m.conducteur_nom,
            locataire_tel: m.conducteur_tel,
            location_debut: m.date_debut,
            location_fin: m.date_fin,
            ...(m.type === "location" && m.tarif_jour != null ? { prix_jour: m.tarif_jour } : {}),
          }
        : { loue: false, locataire: null, locataire_tel: null, location_debut: null, location_fin: null }
    )
    .eq("id", vehiculeId);
}
