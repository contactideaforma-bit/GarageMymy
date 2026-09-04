// ====================================================================
//  HISTORIQUE DES ACTIONS (30 jours) + CORBEILLE — v12.5
//
//  « Savoir ce qui a été fait » : l'historique n'a PAS sa propre table
//  d'écriture (il aurait fallu instrumenter chaque enregistrement) ; il est
//  RECONSTITUÉ à la lecture depuis les tables qui datent déjà chaque action
//  (created_at) : dossiers, documents, paiements, emails, tâches, heures,
//  pièces, événements… puis fusionné et trié. Zéro risque d'oublier une
//  action, zéro double écriture.
//
//  « Supprimé récemment » : la table `corbeille` (migration v69) est
//  alimentée par un trigger BEFORE DELETE — chaque ligne supprimée y est
//  photographiée 30 jours et peut être RESTAURÉE (réinsérée telle quelle).
// ====================================================================

import { supabase } from "./supabaseClient";
import { LigneCorbeille } from "./types";
import { formatEuros } from "./format";
import { formatDuree } from "./heures";

export const JOURS_HISTORIQUE = 30;

export type FamilleAction =
  | "dossier" | "document" | "paiement" | "email" | "tache" | "heures" | "piece" | "evenement" | "suppression";

export const FAMILLES: { code: FamilleAction | "tout"; label: string; icone: string }[] = [
  { code: "tout", label: "Tout", icone: "" },
  { code: "dossier", label: "Dossiers", icone: "📁" },
  { code: "document", label: "Devis & factures", icone: "🧾" },
  { code: "paiement", label: "Paiements", icone: "💶" },
  { code: "email", label: "Emails", icone: "✉️" },
  { code: "tache", label: "Tâches", icone: "☑️" },
  { code: "heures", label: "Heures", icone: "⏱" },
  { code: "piece", label: "Pièces", icone: "🔩" },
  { code: "evenement", label: "Agenda & suivi", icone: "🗓" },
  { code: "suppression", label: "Suppressions", icone: "🗑" },
];

export type ActionHistorique = {
  id: string;
  quand: string;            // ISO
  famille: FamilleAction;
  titre: string;
  detail?: string | null;
  dossier_id?: string | null;
  auteur?: string | null;   // 'garage' | 'secretaire' quand connu
};

export type DossierCourt = { id: string; immatriculation: string | null; numero_sinistre: string | null; client_nom: string | null };

export function libelleDossierCourt(d: DossierCourt | undefined | null): string {
  if (!d) return "";
  return d.immatriculation || d.numero_sinistre || d.client_nom || "dossier";
}

function depuisIso(jours = JOURS_HISTORIQUE): string {
  return new Date(Date.now() - jours * 86400000).toISOString();
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

/** Charge, fusionne et trie (récent → ancien) toutes les actions des 30 derniers jours. */
export async function chargerHistorique(): Promise<{ actions: ActionHistorique[]; dossiers: Map<string, DossierCourt> }> {
  const depuis = depuisIso();
  const lit = (table: string, colDate = "created_at", select = "*") =>
    supabase.from(table).select(select).gte(colDate, depuis).order(colDate, { ascending: false }).limit(400)
      .then((r) => (r.error ? [] : ((r.data as unknown as Row[]) || [])));

  const [dossiers, documents, paiements, emails, ardoise, heures, pieces, evenements, corbeille, tousDossiers] = await Promise.all([
    lit("dossiers", "created_at", "id,created_at,immatriculation,numero_sinistre,client_nom,statut"),
    lit("documents", "created_at", "id,created_at,dossier_id,type,numero,montant_ht,statut,acquitte"),
    lit("paiements"),
    lit("emails", "created_at", "id,created_at,dossier_id,destinataire,objet,statut"),
    lit("ardoise", "created_at", "id,created_at,texte,fait,fait_le,dossier_id,auteur,pour"),
    lit("heures_secretariat"),
    lit("commandes_pieces"),
    lit("evenements", "created_at", "id,created_at,dossier_id,titre,description,categorie,date_evenement"),
    lit("corbeille", "supprime_le", "id,supprime_le,table_name,ligne_id,libelle,dossier_id"),
    supabase.from("dossiers").select("id,immatriculation,numero_sinistre,client_nom").then((r) => ((r.data as DossierCourt[]) || [])),
  ]);

  const actions: ActionHistorique[] = [];

  for (const d of dossiers) {
    actions.push({
      id: `dos-${d.id}`, quand: s(d.created_at), famille: "dossier",
      titre: "Dossier créé",
      detail: [s(d.immatriculation), s(d.client_nom)].filter(Boolean).join(" — ") || null,
      dossier_id: s(d.id),
    });
  }
  for (const doc of documents) {
    const type = doc.type === "devis" ? "Devis" : "Facture";
    actions.push({
      id: `doc-${doc.id}`, quand: s(doc.created_at), famille: "document",
      titre: `${type} ${s(doc.numero)} créé${doc.type === "devis" ? "" : "e"}`,
      detail: doc.montant_ht != null ? `${formatEuros(Number(doc.montant_ht))} HT` : null,
      dossier_id: s(doc.dossier_id) || null,
    });
  }
  for (const p of paiements) {
    actions.push({
      id: `pai-${p.id}`, quand: s(p.created_at), famille: "paiement",
      titre: `Paiement enregistré — ${formatEuros(Number(p.montant) || 0)}`,
      detail: [s(p.moyen), s(p.reference)].filter(Boolean).join(" · ") || null,
      dossier_id: s(p.dossier_id) || null,
    });
  }
  for (const m of emails) {
    actions.push({
      id: `mail-${m.id}`, quand: s(m.created_at), famille: "email",
      titre: m.statut === "echec" ? `Email en ÉCHEC → ${s(m.destinataire)}` : `Email envoyé → ${s(m.destinataire)}`,
      detail: s(m.objet) || null,
      dossier_id: s(m.dossier_id) || null,
    });
  }
  for (const t of ardoise) {
    actions.push({
      id: `tac-${t.id}`, quand: s(t.created_at), famille: "tache",
      titre: `Tâche ajoutée${t.pour ? ` pour ${t.pour === "garage" ? "le garage" : "la secrétaire"}` : ""}`,
      detail: s(t.texte) || null, dossier_id: s(t.dossier_id) || null, auteur: s(t.auteur) || null,
    });
    if (t.fait && t.fait_le && s(t.fait_le) >= depuis) {
      actions.push({
        id: `tacf-${t.id}`, quand: s(t.fait_le), famille: "tache",
        titre: "Tâche terminée", detail: s(t.texte) || null, dossier_id: s(t.dossier_id) || null,
      });
    }
  }
  for (const h of heures) {
    const ids = Array.isArray(h.dossier_ids) && (h.dossier_ids as string[]).length ? (h.dossier_ids as string[]) : (h.dossier_id ? [s(h.dossier_id)] : []);
    actions.push({
      id: `heu-${h.id}`, quand: s(h.created_at), famille: "heures",
      titre: `Temps déclaré : ${formatDuree(Number(h.minutes) || 0)}`,
      detail: s(h.description) || null, dossier_id: ids[0] || null, auteur: s(h.auteur) || null,
    });
  }
  for (const c of pieces) {
    actions.push({
      id: `pie-${c.id}`, quand: s(c.created_at), famille: "piece",
      titre: "Pièce ajoutée à la commande",
      detail: [s(c.designation), s(c.reference)].filter(Boolean).join(" · ") || null,
      dossier_id: s(c.dossier_id) || null,
    });
  }
  for (const e of evenements) {
    actions.push({
      id: `evt-${e.id}`, quand: s(e.created_at), famille: "evenement",
      titre: s(e.titre) || "Événement", detail: s(e.description) || null, dossier_id: s(e.dossier_id) || null,
    });
  }
  for (const c of corbeille) {
    if (c.table_name === "document_lignes") continue; // restaurées avec leur document
    actions.push({
      id: `sup-${c.id}`, quand: s(c.supprime_le), famille: "suppression",
      titre: `Supprimé : ${labelTable(s(c.table_name))}`, detail: s(c.libelle) || null, dossier_id: s(c.dossier_id) || null,
    });
  }

  // Dédoublonnage : un « Facture envoyée » écrit dans `evenements` par
  // l'envoi d'email doublonne l'email lui-même — on garde les deux, ce sont
  // deux faits (l'email est parti ; le dossier l'a noté). Tri simple.
  actions.sort((a, b) => b.quand.localeCompare(a.quand));

  const map = new Map<string, DossierCourt>();
  for (const d of tousDossiers) map.set(d.id, d);
  return { actions, dossiers: map };
}

/** Regroupe par jour (AAAA-MM-JJ local) en conservant l'ordre. */
export function grouperParJour(actions: ActionHistorique[]): { jour: string; actions: ActionHistorique[] }[] {
  const groupes: { jour: string; actions: ActionHistorique[] }[] = [];
  for (const a of actions) {
    const d = new Date(a.quand);
    const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.jour === jour) dernier.actions.push(a);
    else groupes.push({ jour, actions: [a] });
  }
  return groupes;
}

export function libelleJour(jour: string): string {
  const [a, m, j] = jour.split("-").map(Number);
  const d = new Date(a, m - 1, j);
  const auj = new Date();
  const hier = new Date(); hier.setDate(auj.getDate() - 1);
  const meme = (x: Date) => x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
  if (meme(auj)) return "Aujourd'hui";
  if (meme(hier)) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

/* ------------------------------ Corbeille ------------------------------ */

const LABELS_TABLE: Record<string, string> = {
  dossiers: "Dossier sinistre",
  documents: "Devis / facture",
  document_lignes: "Ligne de document",
  emails: "Email",
  evenements: "Événement / rendez-vous",
  paiements: "Paiement",
  relances: "Relance",
  ardoise: "Tâche",
  commandes_pieces: "Pièce à commander",
  pieces_dossier: "Pièce du dossier",
  ordres_reparation: "Ordre de réparation",
  cessions_creance: "Cession de créance",
  restitutions: "PV de restitution",
  demandes_assurance: "Demande assurance",
  heures_secretariat: "Heures de secrétariat",
  clients: "Client",
  vehicules: "Véhicule",
  conversation_messages: "Message de conversation",
  transferts_garantie: "Transfert de garantie",
  photos_etat: "Photo d'état",
  flotte_vehicules: "Véhicule de flotte",
};

export function labelTable(table: string): string {
  return LABELS_TABLE[table] || table;
}

/** Tables visibles dans « Supprimé récemment » (les lignes de document suivent leur document). */
export function corbeilleVisible(l: LigneCorbeille): boolean {
  return l.table_name !== "document_lignes";
}

export async function chargerCorbeille(): Promise<LigneCorbeille[]> {
  const { data, error } = await supabase
    .from("corbeille")
    .select("*")
    .gte("supprime_le", depuisIso())
    .order("supprime_le", { ascending: false })
    .limit(800);
  if (error) throw error;
  return (data as LigneCorbeille[]) || [];
}

// Ordre de réinsertion : les parents avant les enfants (clés étrangères).
const ORDRE_RESTAURATION = [
  "clients", "vehicules", "flotte_vehicules", "dossiers", "documents", "document_lignes", "evenements",
  "ardoise", "paiements", "relances", "emails", "commandes_pieces", "pieces_dossier", "ordres_reparation",
  "cessions_creance", "restitutions", "demandes_assurance", "heures_secretariat", "conversation_messages",
  "transferts_garantie", "photos_etat",
];
const rang = (t: string) => { const i = ORDRE_RESTAURATION.indexOf(t); return i < 0 ? 99 : i; };

/**
 * Restaure une ligne — et tout ce qui a disparu avec elle : un dossier
 * ramène ses documents, paiements, tâches… (même dossier_id dans la
 * corbeille) ; un document ramène ses lignes. Renvoie le nombre de lignes
 * remises en place. Une ligne déjà présente (doublon) est ignorée.
 */
export async function restaurerDepuisCorbeille(cible: LigneCorbeille, toutes: LigneCorbeille[]): Promise<number> {
  let groupe: LigneCorbeille[] = [cible];
  if (cible.table_name === "dossiers") {
    groupe = toutes.filter((x) => x.id === cible.id || (x.dossier_id === cible.ligne_id && x.table_name !== "dossiers"));
  }
  const idsDocs = new Set(groupe.filter((x) => x.table_name === "documents").map((x) => x.ligne_id));
  if (idsDocs.size) {
    for (const x of toutes) {
      if (x.table_name === "document_lignes" && idsDocs.has(String(x.donnees.document_id)) && !groupe.includes(x)) groupe.push(x);
    }
  }
  groupe.sort((a, b) => rang(a.table_name) - rang(b.table_name) || a.supprime_le.localeCompare(b.supprime_le));

  let n = 0;
  const restaurees: string[] = [];
  for (const l of groupe) {
    const { error } = await supabase.from(l.table_name).insert(l.donnees);
    if (error && error.code !== "23505") {
      // 23505 = existe déjà (restauration partielle antérieure) : on passe.
      throw new Error(`${labelTable(l.table_name)} « ${l.libelle || ""} » : ${error.message}`);
    }
    if (!error) n += 1;
    restaurees.push(l.id);
  }
  if (restaurees.length) await supabase.from("corbeille").delete().in("id", restaurees);
  return n;
}

/** Supprime définitivement une entrée de la corbeille (et ce qui l'accompagne). */
export async function purgerDeCorbeille(cible: LigneCorbeille, toutes: LigneCorbeille[]): Promise<void> {
  let ids = [cible.id];
  if (cible.table_name === "dossiers") ids = toutes.filter((x) => x.id === cible.id || x.dossier_id === cible.ligne_id).map((x) => x.id);
  const { error } = await supabase.from("corbeille").delete().in("id", ids);
  if (error) throw error;
}
