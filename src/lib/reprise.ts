"use client";

/* ====================================================================
 *  REPRISE D'UN DOSSIER EN COURS (v13.0)
 *
 *  Un garage qui démarre sur l'appli a des dossiers déjà en route, avec des
 *  factures faites AILLEURS. À l'import, il dépose plusieurs fichiers d'un
 *  coup ; ce module :
 *    · reconnaît chaque fichier (nom d'abord, IA ensuite — corrigeable) ;
 *    · range la FACTURE EXTÉRIEURE dans `documents` (origine = 'externe') :
 *      numéro et totaux D'ORIGINE, fichier d'origine conservé, jamais
 *      renumérotée ni régénérée par l'appli ;
 *    · enregistre ce qui a DÉJÀ été encaissé dessus ;
 *    · range le reste dans les pièces du dossier.
 * ==================================================================== */

import { supabase } from "./supabaseClient";
import { fetchAuth, lireReponse } from "./apiClient";
import { deposerFichier } from "./storage";
import { fichierVersPdf } from "./photoPdf";
import { estSoldee, round2 } from "./paiements";
import { majDossierSiSolde } from "./dossierSync";
import { TYPES_PIECES } from "./pieces";
import type { Document, Dossier } from "./types";

export const ORIGINE_EXTERNE = "externe";

export function estFactureExterne(doc: Pick<Document, "origine"> | null | undefined): boolean {
  return doc?.origine === ORIGINE_EXTERNE;
}

/** Types proposés pour un fichier déposé à l'import. */
export type TypeFichierImport =
  | "rapport"
  | "facture"
  | "carte_grise"
  | "constat"
  | "permis"
  | "prise_en_charge"
  | "rapport_definitif"
  | "autre";

export const TYPES_FICHIER_IMPORT: { type: TypeFichierImport; label: string }[] = [
  { type: "rapport", label: "Rapport d'expertise" },
  { type: "facture", label: "Facture déjà faite (hors appli)" },
  { type: "carte_grise", label: "Carte grise" },
  { type: "constat", label: "Constat amiable" },
  { type: "permis", label: "Permis de conduire" },
  { type: "prise_en_charge", label: "Accord de prise en charge" },
  { type: "rapport_definitif", label: "Rapport définitif de l'expert (pièce)" },
  { type: "autre", label: "Autre pièce" },
];

export function labelTypeFichier(t: TypeFichierImport): string {
  return TYPES_FICHIER_IMPORT.find((x) => x.type === t)?.label || t;
}

/** Première estimation, instantanée et gratuite, d'après le NOM du fichier. */
export function devinerTypeParNom(nom: string): TypeFichierImport {
  const n = nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // « _ » est un caractère de mot : sans ça, \b ne voit pas « cg_durand ».
    .replace(/[_.-]+/g, " ");
  if (/rapport.?def|definitif/.test(n)) return "rapport_definitif";
  if (/rapport|expertise|\bexp\b|chiffrage/.test(n)) return "rapport";
  if (/factur|\bfac[-_ ]?\d|\bfa[-_ ]?\d|invoice/.test(n)) return "facture";
  if (/carte.?grise|\bcg\b|certificat.?d.?immat|\bci\b/.test(n)) return "carte_grise";
  if (/constat/.test(n)) return "constat";
  if (/permis/.test(n)) return "permis";
  if (/prise.?en.?charge|\bpec\b|ordre.?de.?mission/.test(n)) return "prise_en_charge";
  return "autre";
}

/** Ce que l'IA lit sur une facture extérieure (en-tête + totaux, PAS les lignes). */
export type FactureLue = {
  numero: string | null;
  date_document: string | null;
  date_echeance: string | null;
  total_ht: number | null;
  total_tva: number | null;
  total_ttc: number | null;
  tva: number | null;
  immatriculation: string | null;
  marque_modele: string | null;
  client_nom: string | null;
  numero_sinistre: string | null;
  assureur: string | null;
};

export type ResultatTri = { type: TypeFichierImport; facture: FactureLue | null };

export async function trierDocument(file: File): Promise<ResultatTri> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetchAuth("/api/trier-document", { method: "POST", body: fd });
  const { ok, data, error } = await lireReponse<{ data: ResultatTri }>(res);
  if (!ok || !data?.data) throw new Error(error || "Tri automatique indisponible.");
  return data.data;
}

/* --------------------------------------------------------------------
 *  SAISIE d'une facture extérieure (champs de formulaire = chaînes)
 * ------------------------------------------------------------------ */

export type SaisieFactureExterne = {
  numero: string;
  date_document: string;
  date_echeance: string;
  total_ht: string;
  tva: string; // taux en %
  total_ttc: string;
  /** Déjà envoyée au client / à l'assurance ? (statut « Envoyé » au lieu de « Généré ») */
  deja_envoyee: boolean;
  /** Ce qui a DÉJÀ été encaissé sur cette facture avant l'arrivée dans l'appli. */
  encaisse_montant: string;
  encaisse_date: string;
  encaisse_moyen: string;
};

function ymd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function saisieFactureVide(): SaisieFactureExterne {
  return {
    numero: "",
    date_document: "",
    date_echeance: "",
    total_ht: "",
    tva: "20",
    total_ttc: "",
    deja_envoyee: true,
    encaisse_montant: "",
    encaisse_date: ymd(),
    encaisse_moyen: "virement",
  };
}

const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/** Pré-remplit la saisie avec ce que l'IA a lu — sans écraser ce que l'utilisateur a déjà tapé. */
export function saisieDepuisLecture(lue: FactureLue | null, actuelle?: SaisieFactureExterne): SaisieFactureExterne {
  const s = actuelle ?? saisieFactureVide();
  if (!lue) return s;
  // Taux : celui imprimé, sinon déduit des totaux, sinon 20.
  let taux = lue.tva;
  if (taux === null && lue.total_ht && lue.total_ttc && lue.total_ht > 0) {
    taux = Math.round(((lue.total_ttc - lue.total_ht) / lue.total_ht) * 1000) / 10;
  }
  return {
    ...s,
    numero: s.numero || lue.numero || "",
    date_document: s.date_document || lue.date_document || "",
    date_echeance: s.date_echeance || lue.date_echeance || "",
    total_ht: s.total_ht || str(lue.total_ht),
    tva: taux !== null && taux !== undefined ? String(taux) : s.tva,
    total_ttc: s.total_ttc || str(lue.total_ttc),
  };
}

export function saisieDepuisDocument(doc: Document): SaisieFactureExterne {
  return {
    ...saisieFactureVide(),
    numero: doc.numero || "",
    date_document: doc.date_document || "",
    date_echeance: doc.date_echeance || "",
    total_ht: str(doc.total_ht),
    tva: str(doc.tva ?? 20),
    total_ttc: str(doc.total_ttc),
    deja_envoyee: doc.statut !== "brouillon",
  };
}

const num = (v: string): number => {
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Totaux retenus : ceux SAISIS (la facture existe déjà) ; on ne complète que le manquant. */
export function totauxSaisie(s: SaisieFactureExterne): { ht: number; tva: number; ttc: number; taux: number } {
  const taux = s.tva === "" ? 20 : num(s.tva);
  let ht = round2(num(s.total_ht));
  let ttc = round2(num(s.total_ttc));
  if (ht > 0 && ttc <= 0) ttc = round2(ht * (1 + taux / 100));
  if (ttc > 0 && ht <= 0) ht = round2(ttc / (1 + taux / 100));
  return { ht, ttc, tva: round2(ttc - ht), taux };
}

/** Ce qui empêche d'enregistrer la facture (liste vide = OK). */
export function erreursSaisieFacture(s: SaisieFactureExterne): string[] {
  const e: string[] = [];
  const t = totauxSaisie(s);
  if (!s.numero.trim()) e.push("le numéro de la facture");
  if (!s.date_document) e.push("la date de la facture");
  if (t.ttc <= 0) e.push("le montant (HT ou TTC)");
  if (t.ttc > 0 && t.ht > t.ttc + 0.01) e.push("un TTC supérieur ou égal au HT");
  const enc = round2(num(s.encaisse_montant));
  if (enc < 0) e.push("un montant encaissé positif");
  if (enc > 0 && t.ttc > 0 && enc > t.ttc + 0.01) e.push("un « déjà encaissé » inférieur ou égal au TTC");
  if (enc > 0 && !s.encaisse_date) e.push("la date de l'encaissement");
  return e;
}

/* --------------------------------------------------------------------
 *  ENREGISTREMENT
 * ------------------------------------------------------------------ */

const nomSur = (nom: string) => nom.replace(/[^a-zA-Z0-9._-]/g, "_");

/** Dépose le fichier de la facture (image → PDF) et renvoie chemin + nom. */
async function deposerFichierFacture(dossierId: string, file: File): Promise<{ path: string; nom: string }> {
  const { blob } = await fichierVersPdf(file);
  const path = await deposerFichier("pieces", `${dossierId}/facture-externe-${Date.now()}.pdf`, blob, {
    contentType: "application/pdf",
  });
  const nom = /\.pdf$/i.test(file.name) ? file.name : file.name.replace(/\.[^.]+$/, "") + ".pdf";
  return { path, nom };
}

/**
 * Crée la facture extérieure sur le dossier (+ l'encaissement déjà reçu).
 * Échéance par défaut : date de facture + 30 j — sans échéance, les relances
 * automatiques ne se déclenchent jamais.
 */
export async function creerFactureExterne(
  dossierId: string,
  file: File,
  s: SaisieFactureExterne
): Promise<string> {
  const manques = erreursSaisieFacture(s);
  if (manques.length) throw new Error(`Facture ${s.numero || file.name} : il manque ${manques.join(", ")}.`);
  const t = totauxSaisie(s);

  // Même numéro déjà présent sur ce dossier → on refuse le doublon.
  const { data: existants } = await supabase
    .from("documents")
    .select("id")
    .eq("dossier_id", dossierId)
    .eq("type", "facture")
    .eq("numero", s.numero.trim());
  if (existants && existants.length) {
    throw new Error(`La facture ${s.numero.trim()} est déjà enregistrée sur ce dossier.`);
  }

  const { path, nom } = await deposerFichierFacture(dossierId, file);

  let echeance = s.date_echeance || null;
  if (!echeance && s.date_document) {
    const d = new Date(`${s.date_document}T12:00:00`);
    d.setDate(d.getDate() + 30);
    echeance = ymd(d);
  }
  const enc = round2(num(s.encaisse_montant));
  const soldee = enc > 0 && estSoldee(t.ttc, enc);

  const { data, error } = await supabase
    .from("documents")
    .insert({
      dossier_id: dossierId,
      type: "facture",
      origine: ORIGINE_EXTERNE,
      numero: s.numero.trim(),
      date_document: s.date_document,
      date_echeance: echeance,
      statut: soldee ? "paye" : s.deja_envoyee ? "envoye" : "brouillon",
      tva: t.taux,
      total_ht: t.ht,
      total_tva: t.tva,
      total_ttc: t.ttc,
      fichier_path: path,
      fichier_nom: nom,
      notes: "Facture émise hors My Easy Auto (reprise de dossier) — document d'origine conservé.",
    })
    .select("id")
    .single();
  if (error || !data) {
    // Le fichier déposé ne doit pas rester orphelin.
    await supabase.storage.from("pieces").remove([path]);
    const msg = error?.message || "";
    throw new Error(
      /fichier_path|fichier_nom|column/i.test(msg)
        ? "Facture extérieure non enregistrée : exécute d'abord supabase/migration_v72.sql dans Supabase."
        : `Facture extérieure non enregistrée : ${msg || "erreur inconnue"}`
    );
  }
  const docId = data.id as string;

  if (enc > 0) {
    const { error: eP } = await supabase.from("paiements").insert({
      dossier_id: dossierId,
      document_id: docId,
      montant: enc,
      date_paiement: s.encaisse_date || ymd(),
      moyen: s.encaisse_moyen || "virement",
      reference: null,
      notes: "Encaissé avant la reprise du dossier dans My Easy Auto.",
    });
    if (eP) throw new Error(`Facture enregistrée, mais PAS l'encaissement : ${eP.message}`);
    if (soldee) await majDossierSiSolde(dossierId);
  }
  return docId;
}

/** Corrige l'en-tête / les totaux d'une facture extérieure, et remplace son fichier si besoin. */
export async function majFactureExterne(doc: Document, s: SaisieFactureExterne, nouveauFichier?: File | null) {
  const manques = erreursSaisieFacture({ ...s, encaisse_montant: "" });
  if (manques.length) throw new Error(`Il manque ${manques.join(", ")}.`);
  const t = totauxSaisie(s);
  const patch: Record<string, unknown> = {
    numero: s.numero.trim(),
    date_document: s.date_document,
    date_echeance: s.date_echeance || null,
    tva: t.taux,
    total_ht: t.ht,
    total_tva: t.tva,
    total_ttc: t.ttc,
  };
  let ancien: string | null = null;
  if (nouveauFichier) {
    const { path, nom } = await deposerFichierFacture(doc.dossier_id, nouveauFichier);
    patch.fichier_path = path;
    patch.fichier_nom = nom;
    ancien = doc.fichier_path || null;
  }
  const { error } = await supabase.from("documents").update(patch).eq("id", doc.id);
  if (error) throw new Error(`Modification non enregistrée : ${error.message}`);
  if (ancien) await supabase.storage.from("pieces").remove([ancien]);
}

/** Range une pièce (carte grise, constat…) sur le dossier — image convertie en PDF. */
export async function deposerPieceImportee(dossierId: string, file: File, type: string) {
  const { blob } = await fichierVersPdf(file);
  const path = await deposerFichier("pieces", `${dossierId}/${type}-${Date.now()}-${nomSur(file.name).slice(0, 40)}.pdf`, blob, {
    contentType: "application/pdf",
  });
  const connu = TYPES_PIECES.some((t) => t.type === type);
  const { error } = await supabase.from("pieces_dossier").insert({
    dossier_id: dossierId,
    type: connu ? type : "autre",
    nom: /\.pdf$/i.test(file.name) ? file.name : file.name.replace(/\.[^.]+$/, "") + ".pdf",
    path,
  });
  if (error) throw new Error(`Pièce « ${file.name} » non rangée : ${error.message}`);
}

/** Pré-remplissage du dossier quand il n'y a PAS de rapport : on part de la facture. */
export function prefillDepuisFacture(lue: FactureLue | null, s: SaisieFactureExterne): Partial<Dossier> {
  const t = totauxSaisie(s);
  return {
    immatriculation: lue?.immatriculation || null,
    marque_modele: lue?.marque_modele || null,
    client_nom: lue?.client_nom || null,
    numero_sinistre: lue?.numero_sinistre || null,
    assureur: lue?.assureur || null,
    montant: t.ht > 0 ? t.ht : 0,
    tva: t.taux,
  };
}
