// ============================================================
//  SAUVEGARDE DU GARAGE (v46)
//
//  Une plateforme qui détient toute la vie d'une carrosserie doit rendre
//  ses données RÉCUPÉRABLES sans intermédiaire. Cette sauvegarde produit
//  un ZIP que le garage peut ouvrir sur n'importe quel ordinateur, même
//  s'il quitte My Easy Auto demain :
//
//    LISEZ-MOI.txt          ce que contient l'archive
//    suivi-dossiers.xlsx    tous les dossiers, lisibles dans Excel
//    factures.xlsx          toutes les factures et leur encaissement
//    donnees/*.json         copie brute de chaque table (restauration)
//    factures/*.pdf         les PDF eux-mêmes (option « complète »)
//
//  Cela répond aussi à l'obligation de conservation (10 ans pour les
//  pièces comptables).
// ============================================================

import JSZip from "jszip";
import { supabase } from "./supabaseClient";
import { construireXlsx } from "./excel";
import { documentPdfBase64Auto } from "./pdf";
import { formatDate, formatDateTime, labelStatut, ymd } from "./format";
import { totalPaye, resteAPayer } from "./paiements";
import { Document, Dossier, Entreprise, Paiement } from "./types";

/** Tables copiées à l'identique. Une table absente est simplement ignorée. */
const TABLES = [
  "dossiers",
  "documents",
  "document_lignes",
  "paiements",
  "relances",
  "evenements",
  "clients",
  "experts",
  "assureurs",
  "vehicules",
  "flotte_vehicules",
  "pieces_dossier",
  "ordres_reparation",
  "restitutions",
  "cessions_creance",
  "demandes_assurance",
  "commandes_pieces",
  "particularites",
  "dossier_particularites",
  "ardoise",
  "bank_transactions",
  "entreprise",
];

export type OptionsSauvegarde = {
  /** Inclure les PDF des factures (plus long, mais complet). */
  avecPdf?: boolean;
  onProgress?: (message: string, pourcent: number) => void;
};

function nomSur(s: string): string {
  return s.replace(/[^\w\-. ]+/g, "_").slice(0, 80);
}

/**
 * Construit et télécharge la sauvegarde. Renvoie un petit compte rendu
 * (nombre de dossiers, de factures, poids) affiché à l'utilisateur.
 */
export async function sauvegarderGarage(
  options: OptionsSauvegarde = {}
): Promise<{ dossiers: number; factures: number; pdf: number; rapports: number; octets: number; fichier: string }> {
  const { avecPdf = true, onProgress } = options;
  const zip = new JSZip();
  const avance = (m: string, p: number) => onProgress?.(m, p);

  // ---------- 1. Copie brute des tables ----------
  avance("Lecture des données…", 5);
  const contenu: Record<string, unknown[]> = {};
  for (let i = 0; i < TABLES.length; i += 1) {
    const table = TABLES[i];
    const { data, error } = await supabase.from(table).select("*");
    if (error) continue; // table absente sur cette base : on passe
    contenu[table] = (data as unknown[]) || [];
    zip.file(`donnees/${table}.json`, JSON.stringify(contenu[table], null, 2));
    avance(`Lecture des données… (${table})`, 5 + Math.round((i / TABLES.length) * 25));
  }

  const dossiers = (contenu.dossiers as Dossier[]) || [];
  const documents = (contenu.documents as Document[]) || [];
  const paiements = (contenu.paiements as Paiement[]) || [];
  const entreprise = ((contenu.entreprise as Entreprise[]) || [])[0];
  const factures = documents.filter((d) => d.type === "facture");

  // ---------- 2. Classeur « suivi des dossiers » ----------
  avance("Construction du tableau des dossiers…", 35);
  const parId = new Map(dossiers.map((d) => [d.id, d]));
  const feuilleDossiers = await construireXlsx(
    "Dossiers",
    [
      { key: "numero", header: "N° sinistre", width: 16 },
      { key: "date_sinistre", header: "Date du sinistre", width: 14 },
      { key: "client", header: "Client", width: 24 },
      { key: "vehicule", header: "Véhicule", width: 22 },
      { key: "immat", header: "Immatriculation", width: 14 },
      { key: "assureur", header: "Assurance", width: 20 },
      { key: "cabinet", header: "Cabinet d'expertise", width: 20 },
      { key: "statut", header: "Statut", width: 16 },
      { key: "montant", header: "Montant HT", width: 13, type: "euro" },
      { key: "creele", header: "Créé le", width: 14 },
    ],
    dossiers.map((d) => ({
      numero: d.numero_sinistre || "",
      date_sinistre: formatDate(d.date_sinistre),
      client: d.client_nom || "",
      vehicule: d.marque_modele || "",
      immat: d.immatriculation || "",
      assureur: d.assureur || "",
      cabinet: d.cabinet_expert || "",
      statut: labelStatut(d.statut),
      montant: Number(d.montant) || 0,
      creele: formatDate(d.created_at),
    }))
  );
  zip.file("suivi-dossiers.xlsx", feuilleDossiers);

  // ---------- 3. Classeur « factures & encaissement » ----------
  avance("Construction du tableau des factures…", 45);
  const feuilleFactures = await construireXlsx(
    "Factures",
    [
      { key: "numero", header: "N° facture", width: 16 },
      { key: "date", header: "Date", width: 12 },
      { key: "client", header: "Client", width: 24 },
      { key: "dossier", header: "N° sinistre", width: 16 },
      { key: "ht", header: "Total HT", width: 12, type: "euro" },
      { key: "ttc", header: "Total TTC", width: 12, type: "euro" },
      { key: "paye", header: "Encaissé", width: 12, type: "euro" },
      { key: "reste", header: "Reste dû", width: 12, type: "euro" },
      { key: "statut", header: "Statut", width: 14 },
    ],
    factures.map((f) => {
      const d = f.dossier_id ? parId.get(f.dossier_id) : undefined;
      const encaisse = totalPaye(paiements.filter((p) => p.document_id === f.id));
      return {
        numero: f.numero || "",
        date: formatDate(f.date_document || f.created_at),
        client: d?.client_nom || "",
        dossier: d?.numero_sinistre || "",
        ht: Number(f.total_ht) || 0,
        ttc: Number(f.total_ttc) || 0,
        paye: encaisse,
        reste: resteAPayer(f.total_ttc, encaisse),
        statut: f.statut || "",
      };
    })
  );
  zip.file("factures.xlsx", feuilleFactures);

  // ---------- 4. PDF des factures (option) ----------
  let pdfOk = 0;
  if (avecPdf && factures.length > 0) {
    for (let i = 0; i < factures.length; i += 1) {
      const f = factures[i];
      const d = f.dossier_id ? parId.get(f.dossier_id) : undefined;
      if (!d) continue;
      try {
        const b64 = await documentPdfBase64Auto(f, d);
        zip.file(`factures/${nomSur(f.numero || f.id.slice(0, 8))}.pdf`, b64, { base64: true });
        pdfOk += 1;
      } catch {
        // Une facture illisible ne doit pas faire échouer toute la sauvegarde.
      }
      avance(
        `Génération des PDF… (${i + 1}/${factures.length})`,
        50 + Math.round((i / factures.length) * 40)
      );
    }
  }

  // ---------- 4 bis. RAPPORTS D'EXPERTISE (v10.1) ----------
  // Les factures seules ne suffisent pas au comptable ni à un contrôle :
  // le rapport d'expertise justifie le montant facturé. Chaque rapport
  // conservé sur le serveur est joint tel quel (rapports/<n° sinistre>-…).
  let rapportsOk = 0;
  const avecRapport = dossiers.filter((d) => d.rapport_path);
  if (avecPdf && avecRapport.length > 0) {
    for (let i = 0; i < avecRapport.length; i += 1) {
      const d = avecRapport[i];
      try {
        const { data } = await supabase.storage.from("rapports").download(d.rapport_path!);
        if (data) {
          const nom = `${d.numero_sinistre || d.immatriculation || d.id.slice(0, 8)}-${d.rapport_nom || "rapport-expertise.pdf"}`;
          zip.file(`rapports/${nomSur(nom)}`, data);
          rapportsOk += 1;
        }
      } catch {
        // Un rapport illisible ne bloque pas la sauvegarde.
      }
      avance(`Rapports d'expertise… (${i + 1}/${avecRapport.length})`, 90 + Math.round((i / avecRapport.length) * 2));
    }
  }

  // ---------- 5. Mode d'emploi ----------
  const lisezMoi = [
    "SAUVEGARDE MY EASY AUTO",
    "=======================",
    "",
    `Garage        : ${entreprise?.nom || "—"}`,
    `Date          : ${formatDateTime(new Date().toISOString())}`,
    `Dossiers      : ${dossiers.length}`,
    `Factures      : ${factures.length}${avecPdf ? ` (dont ${pdfOk} PDF joints)` : " (PDF non inclus)"}`,
    `Rapports      : ${avecRapport.length} rapport(s) d'expertise${avecPdf ? ` (${rapportsOk} joints)` : " (non inclus)"}`,
    "",
    "CONTENU",
    "-------",
    "suivi-dossiers.xlsx  Tous vos dossiers, ouvrable dans Excel ou LibreOffice.",
    "factures.xlsx        Toutes vos factures avec l'encaissement et le reste dû.",
    "donnees/*.json       Copie brute de chaque table (sert à une restauration).",
    avecPdf ? "factures/*.pdf       Les factures au format PDF, telles qu'envoyées." : "",
    avecPdf ? "rapports/*.pdf       Les rapports d'expertise, nommés par n° de sinistre (justificatif des factures)." : "",
    "",
    "À QUOI ÇA SERT",
    "--------------",
    "Ces fichiers sont LISIBLES SANS My Easy Auto. Conservez-les hors de",
    "l'ordinateur du garage (clé USB, disque externe, espace de stockage en",
    "ligne). Les pièces comptables doivent être conservées 10 ans.",
    "",
    "RESTAURATION",
    "------------",
    "Les fichiers donnees/*.json reprennent exactement la structure des",
    "tables. Transmettez-les au support pour une remise en service.",
  ]
    .filter(Boolean)
    .join("\n");
  zip.file("LISEZ-MOI.txt", lisezMoi);

  // ---------- 6. Téléchargement ----------
  avance("Compression…", 92);
  const blob = await zip.generateAsync({ type: "blob" });
  const fichier = `sauvegarde-my-easy-auto-${ymd()}.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Révocation différée : un revoke immédiat avorte le téléchargement des
  // gros fichiers sur Firefox / Safari.
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  // ---------- 7. Date mémorisée ----------
  if (entreprise?.id) {
    await supabase
      .from("entreprise")
      .update({ derniere_sauvegarde: new Date().toISOString() })
      .eq("id", entreprise.id);
  }

  avance("Sauvegarde terminée.", 100);
  return {
    dossiers: dossiers.length,
    factures: factures.length,
    pdf: pdfOk,
    rapports: rapportsOk,
    octets: blob.size,
    fichier,
  };
}

/* ------------------------ Rappel tous les 15 jours ------------------------ */

/** Au-delà de ce délai, l'appli réclame une nouvelle sauvegarde (v13.29 : 15 j, avant 35). */
export const DELAI_SAUVEGARDE_JOURS = 15;

export function joursDepuisSauvegarde(date?: string | null): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/** La plus récente de deux dates ISO (null si aucune). */
function plusRecente(a?: string | null, b?: string | null): string | null {
  const ta = a ? new Date(a).getTime() : NaN;
  const tb = b ? new Date(b).getTime() : NaN;
  if (isNaN(ta) && isNaN(tb)) return null;
  if (isNaN(ta)) return b || null;
  if (isNaN(tb)) return a || null;
  return ta >= tb ? a! : b!;
}

/**
 * true = il est temps de refaire une sauvegarde (ou il n'y en a jamais eu).
 * `ignoreeLe` (v13.29) : le garage a choisi de PASSER la sauvegarde → le
 * compteur repart de cette date, sans modifier la date de la dernière vraie
 * sauvegarde.
 */
export function sauvegardeARefaire(date?: string | null, ignoreeLe?: string | null): boolean {
  const j = joursDepuisSauvegarde(plusRecente(date, ignoreeLe));
  return j === null || j >= DELAI_SAUVEGARDE_JOURS;
}

/** Date du prochain rappel (null = rappel dû dès maintenant). */
export function prochainRappelSauvegarde(date?: string | null, ignoreeLe?: string | null): Date | null {
  const ref = plusRecente(date, ignoreeLe);
  if (!ref) return null;
  const d = new Date(new Date(ref).getTime() + DELAI_SAUVEGARDE_JOURS * 86400000);
  return d.getTime() <= Date.now() ? null : d;
}

export type EtatSauvegarde = { id: string | null; derniere: string | null; ignoreeLe: string | null; migration: boolean };

/** Lit l'état de sauvegarde du garage (repli propre si la migration v91 n'est pas passée). */
export async function lireEtatSauvegarde(): Promise<EtatSauvegarde | null> {
  const r = await supabase.from("entreprise").select("id,derniere_sauvegarde,sauvegarde_ignoree_le").limit(1).maybeSingle();
  if (!r.error) {
    const e = r.data as { id?: string; derniere_sauvegarde?: string | null; sauvegarde_ignoree_le?: string | null } | null;
    return { id: e?.id || null, derniere: e?.derniere_sauvegarde || null, ignoreeLe: e?.sauvegarde_ignoree_le || null, migration: true };
  }
  const r2 = await supabase.from("entreprise").select("id,derniere_sauvegarde").limit(1).maybeSingle();
  if (r2.error) return null; // migration v46 absente : on ne dit rien
  const e = r2.data as { id?: string; derniere_sauvegarde?: string | null } | null;
  return { id: e?.id || null, derniere: e?.derniere_sauvegarde || null, ignoreeLe: null, migration: false };
}

/** « Passer cette sauvegarde » : le rappel se tait jusqu'à la prochaine échéance. Renvoie un message d'erreur ou null. */
export async function passerSauvegarde(entrepriseId: string | null): Promise<string | null> {
  if (!entrepriseId) return "Renseigne d'abord le profil du garage.";
  const { error } = await supabase.from("entreprise").update({ sauvegarde_ignoree_le: new Date().toISOString() }).eq("id", entrepriseId);
  if (error) return /sauvegarde_ignoree_le|column/i.test(error.message) ? "Exécute supabase/migration_v91.sql dans Supabase pour activer cette option." : error.message;
  return null;
}

export function poidsLisible(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}
