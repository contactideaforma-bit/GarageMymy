"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Document, DocumentLigne, DocumentType, Dossier } from "@/lib/types";
import { formatEuros, formatDate } from "@/lib/format";
import { badgeStatutDoc, labelStatutDoc } from "@/lib/documents";
import { apercuDocumentPdf } from "@/lib/pdf";
import ConfigBanner from "@/components/ConfigBanner";

type DocWithDossier = Document & { dossier: Dossier | null };

type Tri = "date_desc" | "date_asc" | "montant_desc" | "montant_asc" | "client" | "statut";

const TRIS: { key: Tri; label: string }[] = [
  { key: "date_desc", label: "Date (récent d'abord)" },
  { key: "date_asc", label: "Date (ancien d'abord)" },
  { key: "montant_desc", label: "Montant (décroissant)" },
  { key: "montant_asc", label: "Montant (croissant)" },
  { key: "client", label: "Client (A → Z)" },
  { key: "statut", label: "Statut" },
];

export default function DocumentsView({ type }: { type: DocumentType }) {
  const titre = type === "devis" ? "Devis" : "Factures";
  const [docs, setDocs] = useState<DocWithDossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [tri, setTri] = useState<Tri>("date_desc");

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
    await apercuDocumentPdf(doc, (data as DocumentLigne[]) || [], doc.dossier);
  }

  // Étoile : les favoris remontent en tête de liste
  async function toggleFavori(doc: DocWithDossier) {
    const next = !doc.favori;
    setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, favori: next } : d)));
    const { error } = await supabase.from("documents").update({ favori: next }).eq("id", doc.id);
    if (error) {
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, favori: !next } : d)));
      alert("Impossible d'enregistrer le favori (migration v22 exécutée ?).");
    }
  }

  // Recherche multi-critères : n°, client, immatriculation, véhicule,
  // n° sinistre, statut, montant…
  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    let out = docs;
    if (q) {
      out = docs.filter((d) =>
        [
          d.numero,
          d.dossier?.client_nom,
          d.dossier?.immatriculation,
          d.dossier?.marque_modele,
          d.dossier?.numero_sinistre,
          d.dossier?.assureur,
          labelStatutDoc(d.statut),
          d.total_ttc != null ? String(d.total_ttc) : "",
          d.date_document ? formatDate(d.date_document) : "",
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }
    const parTri = [...out].sort((a, b) => {
      switch (tri) {
        case "date_asc":
          return (a.date_document || a.created_at).localeCompare(b.date_document || b.created_at);
        case "montant_desc":
          return (Number(b.total_ttc) || 0) - (Number(a.total_ttc) || 0);
        case "montant_asc":
          return (Number(a.total_ttc) || 0) - (Number(b.total_ttc) || 0);
        case "client":
          return (a.dossier?.client_nom || "").localeCompare(b.dossier?.client_nom || "");
        case "statut":
          return a.statut.localeCompare(b.statut);
        default:
          return (b.date_document || b.created_at).localeCompare(a.date_document || a.created_at);
      }
    });
    // Favoris toujours en tête
    return [...parTri.filter((d) => d.favori), ...parTri.filter((d) => !d.favori)];
  }, [docs, recherche, tri]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white mb-6">{titre}</h1>
      <ConfigBanner />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="field-input max-w-sm"
          placeholder="Rechercher (n°, client, immat, sinistre, montant…)"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <select className="field-input w-auto" value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
          {TRIS.map((t) => (
            <option key={t.key} value={t.key}>Trier : {t.label}</option>
          ))}
        </select>
        <span className="text-xs text-white/40">
          {filtres.length} {titre.toLowerCase()}
        </span>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/50">
            <tr>
              <th className="px-3 py-3 font-medium" title="Favori"> </th>
              <th className="px-4 py-3 font-medium">N°</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Véhicule</th>
              <th className="px-4 py-3 font-medium">Immat</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium text-right">Total TTC</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>
            )}
            {!loading && filtres.length === 0 && (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-white/40">
                {docs.length === 0
                  ? `Aucun ${type}. Crée-le depuis la fiche d'un dossier.`
                  : "Aucun résultat pour cette recherche."}
              </td></tr>
            )}
            {filtres.map((d) => (
              <tr key={d.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-3 py-3">
                  <button
                    onClick={() => toggleFavori(d)}
                    className={`text-lg leading-none ${d.favori ? "text-amber-400" : "text-white/25 hover:text-amber-300"}`}
                    title={d.favori ? "Retirer des favoris" : "Marquer en favori"}
                    aria-pressed={Boolean(d.favori)}
                  >
                    {d.favori ? "★" : "☆"}
                  </button>
                </td>
                <td className="px-4 py-3 font-medium text-white">{d.numero || "—"}</td>
                <td className="px-4 py-3 text-white/80 whitespace-nowrap">{formatDate(d.date_document)}</td>
                <td className="px-4 py-3 text-white/80">{d.dossier?.client_nom || "—"}</td>
                <td className="px-4 py-3 text-white/80 hidden md:table-cell">{d.dossier?.marque_modele || "—"}</td>
                <td className="px-4 py-3 text-white/80 whitespace-nowrap">{d.dossier?.immatriculation || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeStatutDoc(d.statut)}`}>
                    {labelStatutDoc(d.statut)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-white/90 whitespace-nowrap">{formatEuros(d.total_ttc)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
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
