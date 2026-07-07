// ARCHIVAGE d'un dossier clos : rassemble TOUT (PDF des documents,
// rapport d'expertise, pièces, historique complet en texte) dans un ZIP
// téléchargé, puis PURGE les fichiers du serveur. Le dossier reste
// visible comme trace dans l'onglet Archives.

import JSZip from "jszip";
import { supabase } from "./supabaseClient";
import {
  CessionCreance,
  Document,
  Dossier,
  OrdreReparation,
  PieceDossier,
  Restitution,
} from "./types";
import {
  cessionPdfBase64,
  documentPdfBase64Auto,
  ordreReparationPdfBase64,
} from "./pdf";
import { formatDate, formatDateTime } from "./format";

function nomSur(s: string): string {
  return s.replace(/[^\w\-. ]+/g, "_").slice(0, 80);
}

export async function archiverDossier(
  dossier: Dossier,
  onProgress?: (msg: string) => void
): Promise<void> {
  const zip = new JSZip();
  const nomBase = nomSur(dossier.numero_sinistre || dossier.immatriculation || dossier.id.slice(0, 8));

  onProgress?.("Lecture du dossier…");
  const [docs, ors, cess, rests, pieces, paiements, relances, evenements, demandes, commandes] =
    await Promise.all([
      supabase.from("documents").select("*").eq("dossier_id", dossier.id),
      supabase.from("ordres_reparation").select("*").eq("dossier_id", dossier.id),
      supabase.from("cessions_creance").select("*").eq("dossier_id", dossier.id),
      supabase.from("restitutions").select("*").eq("dossier_id", dossier.id),
      supabase.from("pieces_dossier").select("*").eq("dossier_id", dossier.id),
      supabase.from("paiements").select("*").eq("dossier_id", dossier.id),
      supabase.from("relances").select("*").eq("dossier_id", dossier.id),
      supabase.from("evenements").select("*").eq("dossier_id", dossier.id).order("date_evenement"),
      supabase.from("demandes_assurance").select("*").eq("dossier_id", dossier.id),
      supabase.from("commandes_pieces").select("*").eq("dossier_id", dossier.id),
    ]);

  // 1) PDF des documents (devis, factures)
  onProgress?.("Génération des PDF…");
  for (const d of (docs.data as Document[]) || []) {
    try {
      const b64 = await documentPdfBase64Auto(d, dossier);
      zip.file(`documents/${nomSur(`${d.type}-${d.numero || d.id.slice(0, 6)}`)}.pdf`, b64, { base64: true });
    } catch { /* document illisible : on continue */ }
  }
  for (const o of (ors.data as OrdreReparation[]) || []) {
    try {
      const b64 = await ordreReparationPdfBase64(o, dossier);
      zip.file(`documents/${nomSur(o.numero || "ordre-reparation")}.pdf`, b64, { base64: true });
    } catch { /* on continue */ }
  }
  for (const c of (cess.data as CessionCreance[]) || []) {
    try {
      const b64 = await cessionPdfBase64(c, dossier);
      zip.file(`documents/cession-creance.pdf`, b64, { base64: true });
    } catch { /* on continue */ }
  }

  // 2) Rapport d'expertise + pièces (téléchargés depuis le stockage)
  onProgress?.("Récupération des pièces…");
  if (dossier.rapport_path) {
    const { data } = await supabase.storage.from("rapports").download(dossier.rapport_path);
    if (data) zip.file(`rapport/${nomSur(dossier.rapport_nom || "rapport-expertise.pdf")}`, data);
  }
  for (const p of (pieces.data as PieceDossier[]) || []) {
    const { data } = await supabase.storage.from("pieces").download(p.path);
    if (data) zip.file(`pieces/${nomSur(p.nom || `${p.type}.pdf`)}`, data);
  }

  // 3) Historique lisible + données brutes
  onProgress?.("Écriture de l'historique…");
  const lignesResume: string[] = [
    `DOSSIER ${dossier.numero_sinistre || "—"} — archivé le ${formatDateTime(new Date().toISOString())}`,
    ``,
    `Client : ${dossier.client_nom || "—"} · ${dossier.client_email || "—"} · ${dossier.client_tel || "—"}`,
    `Véhicule : ${dossier.marque_modele || "—"} (${dossier.immatriculation || "—"}) · VIN ${dossier.numero_serie || "—"}`,
    `Assureur : ${dossier.assureur || "—"} · police ${dossier.numero_police || "—"}`,
    `Expert : ${dossier.cabinet_expert || "—"} / ${dossier.expert_nom || "—"}`,
    `Sinistre du ${formatDate(dossier.date_sinistre)} · expertise du ${formatDate(dossier.date_expertise)}`,
    `Montant chiffrage : ${dossier.montant ?? "—"} € HT · statut final : ${dossier.statut}`,
    ``,
    `--- PAIEMENTS ---`,
    ...(((paiements.data as { montant: number | null; date_paiement: string | null; moyen: string }[]) || []).map(
      (p) => `${formatDate(p.date_paiement)} · ${p.montant ?? "—"} € · ${p.moyen}`
    ) || ["(aucun)"]),
    ``,
    `--- RELANCES ---`,
    ...(((relances.data as { date_relance: string | null; canal: string; notes: string | null }[]) || []).map(
      (r) => `${formatDate(r.date_relance)} · ${r.canal}${r.notes ? ` · ${r.notes}` : ""}`
    ) || ["(aucune)"]),
    ``,
    `--- HISTORIQUE ---`,
    ...(((evenements.data as { date_evenement: string; titre: string; description: string | null }[]) || []).map(
      (e) => `${formatDateTime(e.date_evenement)} · ${e.titre}${e.description ? ` — ${e.description}` : ""}`
    ) || ["(vide)"]),
  ];
  zip.file("resume.txt", lignesResume.join("\n"));
  zip.file(
    "donnees.json",
    JSON.stringify(
      {
        dossier,
        documents: docs.data,
        ordres_reparation: ors.data,
        cessions_creance: cess.data,
        restitutions: rests.data,
        pieces: pieces.data,
        paiements: paiements.data,
        relances: relances.data,
        evenements: evenements.data,
        demandes_assurance: demandes.data,
        commandes_pieces: commandes.data,
      },
      null,
      2
    )
  );

  // 4) Téléchargement du ZIP
  onProgress?.("Compression…");
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = `dossier-${nomBase}.zip`;
  a.click();
  URL.revokeObjectURL(url);

  // 5) PURGE des fichiers serveur (le ZIP est la copie de référence)
  onProgress?.("Nettoyage du serveur…");
  const cheminsPieces = (((pieces.data as PieceDossier[]) || []).map((p) => p.path)).filter(Boolean);
  if (cheminsPieces.length) await supabase.storage.from("pieces").remove(cheminsPieces);
  if (dossier.rapport_path) await supabase.storage.from("rapports").remove([dossier.rapport_path]);
  await supabase.from("pieces_dossier").delete().eq("dossier_id", dossier.id);

  // 6) Marque le dossier archivé (trace conservée)
  await supabase
    .from("dossiers")
    .update({
      archive: true,
      archive_le: new Date().toISOString(),
      rapport_path: null,
      statut: "cloture",
    })
    .eq("id", dossier.id);
}
