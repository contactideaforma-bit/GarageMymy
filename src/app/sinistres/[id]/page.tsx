"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, Evenement, Document, DocumentLigne, DocumentType } from "@/lib/types";
import { formatEuros, formatDate, formatDateTime } from "@/lib/format";
import { badgeStatutDoc, labelStatutDoc } from "@/lib/documents";
import { generateDocumentPdf } from "@/lib/pdf";
import StatutBadge from "@/components/StatutBadge";
import StatutPipeline from "@/components/StatutPipeline";
import DossierForm from "@/components/DossierForm";
import DocumentEditor from "@/components/DocumentEditor";
import ConfigBanner from "@/components/ConfigBanner";

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-white/50">{label}</span>
      <span className="text-sm font-medium text-white text-right">{value || "—"}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass-card">
      <div className="px-5 py-3 border-b border-white/10">
        <h2 className="font-semibold text-white">{title}</h2>
      </div>
      <div className="px-5 py-2">{children}</div>
    </section>
  );
}

export default function DossierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  // éditeur de document
  const [editor, setEditor] = useState<
    { type: DocumentType; document?: Document | null; lignes?: DocumentLigne[] } | null
  >(null);

  // mini-form événement
  const [evTitre, setEvTitre] = useState("");
  const [evDate, setEvDate] = useState("");
  const [evDesc, setEvDesc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [d, e, docs] = await Promise.all([
      supabase.from("dossiers").select("*").eq("id", id).single(),
      supabase.from("evenements").select("*").eq("dossier_id", id).order("date_evenement", { ascending: true }),
      supabase.from("documents").select("*").eq("dossier_id", id).order("created_at", { ascending: false }),
    ]);
    if (d.data) setDossier(d.data as Dossier);
    if (e.data) setEvenements(e.data as Evenement[]);
    if (docs.data) setDocuments(docs.data as Document[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatut(s: string) {
    if (!dossier) return;
    setDossier({ ...dossier, statut: s });
    await supabase.from("dossiers").update({ statut: s }).eq("id", dossier.id);
  }

  async function supprimer() {
    if (!dossier) return;
    if (!confirm("Supprimer définitivement ce dossier ?")) return;
    await supabase.from("dossiers").delete().eq("id", dossier.id);
    router.push("/sinistres");
  }

  async function ajouterEvenement(e: React.FormEvent) {
    e.preventDefault();
    if (!evTitre || !evDate) return;
    await supabase.from("evenements").insert({
      dossier_id: id, titre: evTitre, description: evDesc || null,
      date_evenement: new Date(evDate).toISOString(),
    });
    setEvTitre(""); setEvDate(""); setEvDesc("");
    load();
  }

  async function ouvrirEdition(doc: Document) {
    const { data } = await supabase
      .from("document_lignes").select("*").eq("document_id", doc.id).order("ordre", { ascending: true });
    setEditor({ type: doc.type, document: doc, lignes: (data as DocumentLigne[]) || [] });
  }

  async function exporterPdf(doc: Document) {
    if (!dossier) return;
    const { data } = await supabase
      .from("document_lignes").select("*").eq("document_id", doc.id).order("ordre", { ascending: true });
    generateDocumentPdf(doc, (data as DocumentLigne[]) || [], dossier);
  }

  async function supprimerDoc(doc: Document) {
    if (!confirm("Supprimer ce document ?")) return;
    await supabase.from("documents").delete().eq("id", doc.id);
    load();
  }

  function rapportUrl(path: string | null): string | null {
    if (!path) return null;
    const { data } = supabase.storage.from("rapports").getPublicUrl(path);
    return data.publicUrl;
  }

  if (loading) return <p className="text-white/40">Chargement…</p>;

  if (!dossier) {
    return (
      <div>
        <ConfigBanner />
        <p className="text-white/70">
          Dossier introuvable.{" "}
          <Link href="/sinistres" className="text-accent-pink hover:underline">Retour à la liste</Link>
        </p>
      </div>
    );
  }

  const url = rapportUrl(dossier.rapport_path);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <Link href="/sinistres" className="text-sm text-accent-pink hover:underline">← Sinistres</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white">
              Dossier {dossier.numero_sinistre || "sans numéro"}
            </h1>
            <StatutBadge statut={dossier.statut} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowEdit(true)} className="btn-ghost">Modifier</button>
            <button onClick={supprimer} className="btn-danger">Supprimer</button>
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <section className="glass-card p-5">
        <div className="mb-4 text-sm font-medium text-white/60">Avancement du dossier</div>
        <StatutPipeline statut={dossier.statut} onChange={changeStatut} />
        <p className="mt-3 text-xs text-white/40">Clique sur une étape pour mettre à jour le statut.</p>
      </section>

      {/* Infos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Véhicule">
          <InfoRow label="Immatriculation" value={dossier.immatriculation} />
          <InfoRow label="Marque et modèle" value={dossier.marque_modele} />
          <InfoRow label="N° de série (VIN)" value={dossier.numero_serie} />
          <InfoRow label="1ère mise en circulation" value={formatDate(dossier.premiere_circulation)} />
        </Card>

        <Card title="Sinistre">
          <InfoRow label="Date du sinistre" value={formatDate(dossier.date_sinistre)} />
          <InfoRow label="N° de sinistre" value={dossier.numero_sinistre} />
          <InfoRow label="Cabinet d'expert" value={dossier.cabinet_expert} />
          <InfoRow label="Date d'expertise" value={formatDate(dossier.date_expertise)} />
          <InfoRow label="N° police" value={dossier.numero_police} />
          <InfoRow label="Assureur" value={dossier.assureur} />
        </Card>

        <Card title="Client">
          <InfoRow label="Nom et prénom" value={dossier.client_nom} />
          <InfoRow label="Adresse" value={dossier.client_adresse} />
          <InfoRow label="Code postal" value={dossier.client_code_postal} />
          <InfoRow label="Ville" value={dossier.client_ville} />
        </Card>

        <Card title="Suivi & documents">
          <InfoRow label="Montant" value={formatEuros(dossier.montant)} />
          <InfoRow label="Créé le" value={formatDate(dossier.created_at)} />
          <div className="flex justify-between gap-4 py-2">
            <span className="text-sm text-white/50">Rapport d&apos;expertise</span>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-accent-teal hover:underline">
                📄 {dossier.rapport_nom || "Voir le PDF"}
              </a>
            ) : (
              <span className="text-sm text-white/40">Aucun</span>
            )}
          </div>
        </Card>
      </div>

      {/* Devis & Factures */}
      <section className="glass-card">
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">Devis & Factures</h2>
          <div className="flex gap-2">
            <button onClick={() => setEditor({ type: "devis" })} className="btn-ghost py-1.5 px-3 text-xs">+ Devis</button>
            <button onClick={() => setEditor({ type: "facture" })} className="btn-primary py-1.5 px-3 text-xs">+ Facture</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-white/50">
              <tr>
                <th className="px-5 py-2 font-medium">Type</th>
                <th className="px-5 py-2 font-medium">N°</th>
                <th className="px-5 py-2 font-medium">Date</th>
                <th className="px-5 py-2 font-medium">Statut</th>
                <th className="px-5 py-2 font-medium text-right">Total TTC</th>
                <th className="px-5 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-white/40">
                  Aucun document. Génère un devis ou une facture.
                </td></tr>
              )}
              {documents.map((doc) => (
                <tr key={doc.id} className="border-t border-white/5">
                  <td className="px-5 py-3 capitalize text-white/80">{doc.type}</td>
                  <td className="px-5 py-3 font-medium text-white">{doc.numero || "—"}</td>
                  <td className="px-5 py-3 text-white/80">{formatDate(doc.date_document)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeStatutDoc(doc.statut)}`}>
                      {labelStatutDoc(doc.statut)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-white/90">{formatEuros(doc.total_ttc)}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button onClick={() => exporterPdf(doc)} className="text-accent-teal hover:underline mr-3">PDF</button>
                    <button onClick={() => ouvrirEdition(doc)} className="text-accent-pink hover:underline mr-3">Modifier</button>
                    <button onClick={() => supprimerDoc(doc)} className="text-white/40 hover:text-rose-300">Suppr.</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Événements liés */}
      <Card title="Événements liés à ce dossier">
        <form onSubmit={ajouterEvenement} className="grid grid-cols-1 sm:grid-cols-4 gap-3 py-3">
          <input className="field-input" placeholder="Titre (ex. RDV expertise)" value={evTitre} onChange={(e) => setEvTitre(e.target.value)} />
          <input type="datetime-local" className="field-input" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
          <input className="field-input" placeholder="Description (optionnel)" value={evDesc} onChange={(e) => setEvDesc(e.target.value)} />
          <button type="submit" className="btn-primary">+ Ajouter</button>
        </form>
        <ul className="divide-y divide-white/10">
          {evenements.length === 0 && <li className="py-3 text-sm text-white/40">Aucun événement.</li>}
          {evenements.map((ev) => (
            <li key={ev.id} className="py-3 flex justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-white">{ev.titre}</div>
                {ev.description && <div className="text-sm text-white/60">{ev.description}</div>}
              </div>
              <div className="text-xs text-white/40 whitespace-nowrap">{formatDateTime(ev.date_evenement)}</div>
            </li>
          ))}
        </ul>
      </Card>

      {showEdit && (
        <DossierForm dossier={dossier} onClose={() => setShowEdit(false)} onSaved={load} />
      )}
      {editor && (
        <DocumentEditor
          dossier={dossier}
          type={editor.type}
          document={editor.document}
          lignes={editor.lignes}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
