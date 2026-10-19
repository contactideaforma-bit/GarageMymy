// TRANSFERT DE FLOTTE (v13.46) : export d'une flotte (garage ou hors garage)
// dans un fichier ZIP autonome, puis import de ce fichier dans un AUTRE compte
// (ex. un client qui change de garage et emmène sa « flotte hors garage »).
//
// Le ZIP contient :
//   flotte.json          → véhicules, entretiens, liste des documents (format versionné)
//   flotte.csv           → les mêmes véhicules, lisibles dans Excel / Numbers
//   documents/<immat>/…  → les fichiers (carte grise, assurance, photos…) tels quels
//
// Les données restent cloisonnées : l'export ne lit que ce que le compte voit
// (RLS owner_id) et l'import recrée tout sous le compte connecté
// (owner_id = auth.uid() par défaut en base).

import JSZip from "jszip";
import { supabase } from "./supabaseClient";
import { FlotteDocument, FlotteEntretien, FlotteVehicule } from "./types";
import { deposerDocumentFlotte } from "./flotte";

export const FORMAT_TRANSFERT = "garagemymy-flotte/1";

export type ArchiveFlotte = {
  format: string;
  exporte_le: string;
  compte: string | null;
  hors_garage: boolean;
  vehicules: Array<{
    vehicule: Partial<FlotteVehicule>;
    entretiens: Partial<FlotteEntretien>[];
    documents: Array<{ type: string; nom: string | null; date_expiration: string | null; fichier: string | null }>;
  }>;
};

/** Colonnes propres au compte : jamais exportées, jamais réimportées. */
const CHAMPS_TECHNIQUES = ["id", "created_at", "owner_id"];

function sansTechnique<T extends object>(o: T): Partial<T> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!CHAMPS_TECHNIQUES.includes(k)) r[k] = v;
  return r as Partial<T>;
}

function nomSur(s: string): string {
  return s.replace(/[^\w\-. ]+/g, "_").slice(0, 60) || "fichier";
}

export function normaliserImmat(s: string | null | undefined): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* ------------------------------------------------------------------ */
/*  EXPORT                                                             */
/* ------------------------------------------------------------------ */

export async function exporterFlotte(args: {
  horsGarage: boolean;
  /** Restreindre à certains véhicules (sinon toute la liste de l'onglet). */
  vehiculeIds?: string[];
  onProgress?: (msg: string) => void;
}): Promise<{ nbVehicules: number; nbDocuments: number; nbDocumentsManques: number }> {
  const { onProgress } = args;
  onProgress?.("Lecture des véhicules…");
  let q = supabase.from("flotte_vehicules").select("*").eq("hors_garage", args.horsGarage).order("created_at", { ascending: true });
  if (args.vehiculeIds?.length) q = q.in("id", args.vehiculeIds);
  const { data: vData, error } = await q;
  if (error) throw error;
  const vehicules = (vData as FlotteVehicule[]) || [];
  if (!vehicules.length) throw new Error("Aucun véhicule à exporter dans cet onglet.");
  const ids = vehicules.map((v) => v.id);

  const [ent, docs, user] = await Promise.all([
    supabase.from("flotte_entretiens").select("*").in("vehicule_id", ids),
    supabase.from("flotte_documents").select("*").in("vehicule_id", ids),
    supabase.auth.getUser(),
  ]);
  const entretiens = (ent.data as FlotteEntretien[]) || [];
  const documents = (docs.data as FlotteDocument[]) || [];

  const zip = new JSZip();
  const archive: ArchiveFlotte = {
    format: FORMAT_TRANSFERT,
    exporte_le: new Date().toISOString(),
    compte: user.data.user?.email || null,
    hors_garage: args.horsGarage,
    vehicules: [],
  };

  let nbDocs = 0;
  let manques = 0;
  for (const v of vehicules) {
    const dossier = `documents/${nomSur(v.immatriculation)}`;
    const docsV = documents.filter((d) => d.vehicule_id === v.id);
    const docsArchive: ArchiveFlotte["vehicules"][number]["documents"] = [];
    for (const d of docsV) {
      onProgress?.(`Documents de ${v.immatriculation}…`);
      const ext = d.path.split(".").pop() || "bin";
      const nomFichier = `${dossier}/${nomSur(`${d.type}-${d.id.slice(0, 8)}`)}.${ext.toLowerCase()}`;
      const { data: blob } = await supabase.storage.from("pieces").download(d.path);
      if (blob) {
        zip.file(nomFichier, blob);
        nbDocs++;
        docsArchive.push({ type: d.type, nom: d.nom, date_expiration: d.date_expiration, fichier: nomFichier });
      } else {
        manques++;
        docsArchive.push({ type: d.type, nom: d.nom, date_expiration: d.date_expiration, fichier: null });
      }
    }
    archive.vehicules.push({
      vehicule: sansTechnique(v),
      entretiens: entretiens.filter((e) => e.vehicule_id === v.id).map((e) => {
        const r = sansTechnique(e) as Partial<FlotteEntretien> & { vehicule_id?: string };
        delete r.vehicule_id;
        return r;
      }),
      documents: docsArchive,
    });
  }

  zip.file("flotte.json", JSON.stringify(archive, null, 2));
  zip.file("flotte.csv", csvFlotte(vehicules));
  zip.file(
    "LISEZMOI.txt",
    [
      `Export ${args.horsGarage ? "FLOTTE HORS GARAGE" : "FLOTTE DU GARAGE"} — My Easy Auto`,
      `Compte : ${archive.compte || "?"} — le ${new Date().toLocaleString("fr-FR")}`,
      `${vehicules.length} véhicule(s), ${nbDocs} document(s).`,
      "",
      "Pour l'importer dans un autre compte My Easy Auto : onglet Flotte → « Transférer » → « Importer un fichier » → choisir ce ZIP.",
      "flotte.csv s'ouvre dans Excel / Numbers pour une simple lecture.",
    ].join("\n")
  );

  onProgress?.("Compression…");
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  const jour = new Date().toISOString().slice(0, 10);
  a.download = `${args.horsGarage ? "flotte-hors-garage" : "flotte-garage"}-${jour}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { nbVehicules: vehicules.length, nbDocuments: nbDocs, nbDocumentsManques: manques };
}

const COLONNES_CSV: (keyof FlotteVehicule)[] = [
  "immatriculation", "marque_modele", "vin", "couleur", "carburant", "date_mise_circulation", "kilometrage",
  "titulaire_cg", "titulaire_cg_tel", "assurance", "type_contrat_assurance", "numero_police",
  "date_debut_contrat", "date_fin_contrat", "date_assurance", "assureur_tel", "assureur_email",
  "date_ct", "date_prochain_ct", "conducteur", "conducteur_tel", "loue", "locataire", "prix_jour",
  "ct_ok", "cg_ok", "entretien_ok", "commentaire", "notes",
];

function csvFlotte(vehicules: FlotteVehicule[]): string {
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "boolean" ? (v ? "oui" : "non") : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lignes = [COLONNES_CSV.join(";")];
  for (const v of vehicules) lignes.push(COLONNES_CSV.map((c) => esc(v[c])).join(";"));
  // BOM pour qu'Excel lise bien les accents.
  return "﻿" + lignes.join("\n");
}

/* ------------------------------------------------------------------ */
/*  IMPORT                                                             */
/* ------------------------------------------------------------------ */

export type ArchiveLue = { archive: ArchiveFlotte; zip: JSZip | null };

/** Lit un ZIP d'export (ou un flotte.json nu) et vérifie son format. */
export async function lireArchiveFlotte(file: File): Promise<ArchiveLue> {
  let archive: ArchiveFlotte;
  let zip: JSZip | null = null;
  if (file.name.toLowerCase().endsWith(".json")) {
    archive = JSON.parse(await file.text());
  } else {
    zip = await JSZip.loadAsync(file);
    const entree = zip.file("flotte.json");
    if (!entree) throw new Error("Ce ZIP ne contient pas de flotte.json : ce n'est pas un export de flotte My Easy Auto.");
    archive = JSON.parse(await entree.async("string"));
  }
  if (!archive || typeof archive.format !== "string" || !archive.format.startsWith("garagemymy-flotte/")) {
    throw new Error("Format de fichier non reconnu.");
  }
  if (!Array.isArray(archive.vehicules)) throw new Error("Fichier incomplet (aucun véhicule).");
  return { archive, zip };
}

export type ResultatImport = {
  crees: number;
  ignores: string[]; // immatriculations déjà présentes
  documents: number;
  entretiens: number;
  erreurs: string[];
};

/**
 * Recrée les véhicules de l'archive sous le compte connecté. Un véhicule dont
 * l'immatriculation existe déjà dans le compte est ignoré (jamais écrasé).
 */
export async function importerFlotte(args: {
  lu: ArchiveLue;
  /** Les véhicules importés vont dans cet onglet (hors garage ou flotte du garage). */
  horsGarage: boolean;
  /** Ne garder que ces immatriculations (normalisées) — sinon tout. */
  immatsChoisies?: Set<string>;
  onProgress?: (msg: string) => void;
}): Promise<ResultatImport> {
  const { lu, horsGarage, onProgress } = args;
  const res: ResultatImport = { crees: 0, ignores: [], documents: 0, entretiens: 0, erreurs: [] };

  const { data: existants } = await supabase.from("flotte_vehicules").select("immatriculation");
  const dejaLa = new Set(((existants as { immatriculation: string }[]) || []).map((e) => normaliserImmat(e.immatriculation)));

  for (const item of lu.archive.vehicules) {
    const immat = (item.vehicule.immatriculation || "").trim().toUpperCase();
    if (!immat) continue;
    const cle = normaliserImmat(immat);
    if (args.immatsChoisies && !args.immatsChoisies.has(cle)) continue;
    if (dejaLa.has(cle)) { res.ignores.push(immat); continue; }
    onProgress?.(`Véhicule ${immat}…`);
    try {
      const payload = { ...sansTechnique(item.vehicule), immatriculation: immat, hors_garage: horsGarage };
      const { data, error } = await supabase.from("flotte_vehicules").insert(payload).select("id").single();
      if (error) throw error;
      const id = (data as { id: string }).id;
      dejaLa.add(cle);
      res.crees++;

      if (item.entretiens?.length) {
        const { error: e2 } = await supabase
          .from("flotte_entretiens")
          .insert(item.entretiens.map((e) => ({ ...sansTechnique(e), vehicule_id: id })));
        if (!e2) res.entretiens += item.entretiens.length;
        else res.erreurs.push(`${immat} : entretiens non importés (${e2.message})`);
      }

      for (const d of item.documents || []) {
        if (!d.fichier || !lu.zip) continue;
        const entree = lu.zip.file(d.fichier);
        if (!entree) continue;
        onProgress?.(`${immat} : ${d.nom || d.type}…`);
        try {
          const blob = await entree.async("blob");
          const nomFichier = d.fichier.split("/").pop() || "document";
          const fichier = new File([blob], nomFichier, { type: typeMime(nomFichier) });
          await deposerDocumentFlotte({ vehiculeId: id, type: d.type, fichier, nom: d.nom, dateExpiration: d.date_expiration });
          res.documents++;
        } catch (err) {
          res.erreurs.push(`${immat} : document « ${d.nom || d.type} » non importé (${(err as Error).message})`);
        }
      }
    } catch (err) {
      res.erreurs.push(`${immat} : ${(err as Error).message}`);
    }
  }
  return res;
}

function typeMime(nom: string): string {
  const ext = nom.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}
