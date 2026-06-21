"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Document, DocumentLigne, DocumentType, Dossier } from "@/lib/types";
import {
  LigneSaisie,
  computeTotaux,
  genNumero,
  lignesToDb,
} from "@/lib/documents";
import { formatEuros } from "@/lib/format";

export default function DocumentEditor({
  dossier,
  type,
  document,
  lignes,
  onClose,
  onSaved,
}: {
  dossier: Dossier;
  type: DocumentType;
  document?: Document | null;
  lignes?: DocumentLigne[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(document);
  const titre = type === "devis" ? "Devis" : "Facture";

  const [numero, setNumero] = useState(document?.numero || genNumero(type));
  const [dateDoc, setDateDoc] = useState(
    document?.date_document || new Date().toISOString().slice(0, 10)
  );
  const [statut, setStatut] = useState(document?.statut || "brouillon");
  const [tva, setTva] = useState(String(document?.tva ?? 20));
  const [notes, setNotes] = useState(document?.notes || "");
  const [items, setItems] = useState<LigneSaisie[]>(
    lignes && lignes.length
      ? lignes.map((l) => ({
          designation: l.designation || "",
          quantite: String(l.quantite ?? 1),
          prix_unitaire: String(l.prix_unitaire ?? 0),
        }))
      : [{ designation: "", quantite: "1", prix_unitaire: "0" }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totaux = computeTotaux(items, tva);

  function setItem(i: number, key: keyof LigneSaisie, val: string) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)));
  }
  function addLine() {
    setItems((arr) => [...arr, { designation: "", quantite: "1", prix_unitaire: "0" }]);
  }
  function removeLine(i: number) {
    setItems((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        dossier_id: dossier.id,
        type,
        numero,
        date_document: dateDoc,
        statut,
        tva: Number(tva) || 0,
        notes: notes || null,
        total_ht: totaux.ht,
        total_tva: totaux.tva,
        total_ttc: totaux.ttc,
      };

      let docId = document?.id;

      if (isEdit && document) {
        const { error: e1 } = await supabase
          .from("documents")
          .update(payload)
          .eq("id", document.id);
        if (e1) throw e1;
        await supabase.from("document_lignes").delete().eq("document_id", document.id);
      } else {
        const { data, error: e1 } = await supabase
          .from("documents")
          .insert(payload)
          .select("id")
          .single();
        if (e1) throw e1;
        docId = data!.id;
      }

      const rows = lignesToDb(items).map((l) => ({ ...l, document_id: docId! }));
      if (rows.length) {
        const { error: e2 } = await supabase.from("document_lignes").insert(rows);
        if (e2) throw e2;
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto backdrop-blur-sm">
      <div className="w-full max-w-3xl glass-card my-8 bg-[#15122b]/90">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? `Modifier ${titre.toLowerCase()}` : `Nouveau ${titre.toLowerCase()}`}
          </h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="field-label">N° {titre.toLowerCase()}</label>
              <input className="field-input" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Date</label>
              <input type="date" className="field-input" value={dateDoc} onChange={(e) => setDateDoc(e.target.value)} />
            </div>
            <div>
              <label className="field-label">TVA (%)</label>
              <input type="number" className="field-input" value={tva} onChange={(e) => setTva(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Statut</label>
              <select className="field-input" value={statut} onChange={(e) => setStatut(e.target.value)}>
                <option value="brouillon">Brouillon</option>
                <option value="envoye">Envoyé</option>
                <option value="accepte">Accepté</option>
                <option value="refuse">Refusé</option>
                <option value="paye">Payé</option>
              </select>
            </div>
          </div>

          {/* Lignes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white/70">Prestations / pièces</span>
              <button onClick={addLine} className="btn-ghost py-1 px-3 text-xs">+ Ligne</button>
            </div>
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-12 gap-2 text-xs text-white/40 px-1">
                <span className="col-span-6">Désignation</span>
                <span className="col-span-2 text-right">Qté</span>
                <span className="col-span-2 text-right">PU HT</span>
                <span className="col-span-2 text-right">Total</span>
              </div>
              {items.map((it, i) => {
                const total = (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      className="field-input col-span-12 sm:col-span-6"
                      placeholder="Désignation"
                      value={it.designation}
                      onChange={(e) => setItem(i, "designation", e.target.value)}
                    />
                    <input
                      type="number"
                      className="field-input col-span-4 sm:col-span-2 text-right"
                      value={it.quantite}
                      onChange={(e) => setItem(i, "quantite", e.target.value)}
                    />
                    <input
                      type="number"
                      className="field-input col-span-4 sm:col-span-2 text-right"
                      value={it.prix_unitaire}
                      onChange={(e) => setItem(i, "prix_unitaire", e.target.value)}
                    />
                    <div className="col-span-3 sm:col-span-1 text-right text-sm text-white/80">
                      {formatEuros(total)}
                    </div>
                    <button
                      onClick={() => removeLine(i)}
                      className="col-span-1 text-white/40 hover:text-rose-300"
                      title="Supprimer"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="field-label">Notes</label>
            <textarea
              className="field-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Conditions, délais, mentions…"
            />
          </div>

          {/* Totaux */}
          <div className="flex justify-end">
            <div className="w-full sm:w-64 space-y-1 text-sm">
              <div className="flex justify-between text-white/70">
                <span>Total HT</span><span>{formatEuros(totaux.ht)}</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>TVA ({tva || 0}%)</span><span>{formatEuros(totaux.tva)}</span>
              </div>
              <div className="flex justify-between text-white font-semibold text-base pt-1 border-t border-white/10">
                <span>Total TTC</span><span>{formatEuros(totaux.ttc)}</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="btn-ghost">Annuler</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
