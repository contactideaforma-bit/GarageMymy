"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Document, DocumentLigne, DocumentType, Dossier } from "@/lib/types";
import { formatEuros, formatDate } from "@/lib/format";
import { badgeStatutDoc, labelStatutDoc } from "@/lib/documents";
import { generateDocumentPdf } from "@/lib/pdf";
import ConfigBanner from "@/components/ConfigBanner";

type DocWithDossier = Document & { dossier: Dossier | null };

export default function DocumentsView({ type }: { type: DocumentType }) {
  const titre = type === "devis" ? "Devis" : "Factures";
  const [docs, setDocs] = useState<DocWithDossier[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("documents")
      .select("*, dossier:dossiers(*)")
      .eq("type", type)
      .order("created_at", { ascending: false });
    if (data) setDocs(data as DocWithDossier[]);
    setLoading(false);
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  async function exportPdf(doc: DocWithDossier) {
    if (!doc.dossier) return;
    const { data } = await supabase
      .from("document_lignes")
      .select("*")
      .eq("document_id", doc.id)
      .order("ordre", { ascending: true });
    generateDocumentPdf(doc, (data as DocumentLigne[]) || [], doc.dossier);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white mb-6">{titre}</h1>
      <ConfigBanner />

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/50">
            <tr>
              <th className="px-5 py-3 font-medium">N°</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Véhicule</th>
              <th className="px-5 py-3 font-medium">Statut</th>
              <th className="px-5 py-3 font-medium text-right">Total TTC</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>
            )}
            {!loading && docs.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-white/40">
                Aucun {type}. Crée-le depuis la fiche d&apos;un dossier.
              </td></tr>
            )}
            {docs.map((d) => (
              <tr key={d.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-5 py-3 font-medium text-white">{d.numero || "—"}</td>
                <td className="px-5 py-3 text-white/80">{formatDate(d.date_document)}</td>
                <td className="px-5 py-3 text-white/80">{d.dossier?.client_nom || "—"}</td>
                <td className="px-5 py-3 text-white/80">
                  {d.dossier?.marque_modele || "—"}
                  {d.dossier?.immatriculation ? ` (${d.dossier.immatriculation})` : ""}
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeStatutDoc(d.statut)}`}>
                    {labelStatutDoc(d.statut)}
                  </span>
                </td>
                <td className="px-5 py-3 text-right text-white/90">{formatEuros(d.total_ttc)}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <button onClick={() => exportPdf(d)} className="text-accent-teal hover:underline mr-3">
                    PDF
                  </button>
                  {d.dossier && (
                    <Link href={`/sinistres/${d.dossier.id}`} className="text-accent-pink hover:underline">
                      Dossier
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
