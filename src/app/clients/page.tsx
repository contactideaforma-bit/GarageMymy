"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Client } from "@/lib/types";
import { formatDate } from "@/lib/format";
import ConfigBanner from "@/components/ConfigBanner";

const EMPTY = { nom: "", email: "", telephone: "", adresse: "", code_postal: "", ville: "", notes: "" };
type FormC = typeof EMPTY;

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormC>({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (data) setClients(data as Client[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function ouvrirAjout() {
    setEditingId(null);
    setForm({ ...EMPTY });
    setShowForm(true);
  }
  function ouvrirEdition(c: Client) {
    setEditingId(c.id);
    setForm({
      nom: c.nom ?? "", email: c.email ?? "", telephone: c.telephone ?? "",
      adresse: c.adresse ?? "", code_postal: c.code_postal ?? "", ville: c.ville ?? "",
      notes: c.notes ?? "",
    });
    setShowForm(true);
  }

  async function enregistrer() {
    if (!form.nom.trim()) return;
    setSaving(true);
    if (editingId) {
      await supabase.from("clients").update(form).eq("id", editingId);
    } else {
      await supabase.from("clients").insert({ ...form, source: "manuel" });
    }
    setForm({ ...EMPTY });
    setEditingId(null);
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function supprimer(id: string) {
    if (!confirm("Supprimer ce client ?")) return;
    await supabase.from("clients").delete().eq("id", id);
    load();
  }

  const term = q.trim().toLowerCase();
  const filtered = term
    ? clients.filter((c) =>
        [c.nom, c.email, c.telephone, c.ville].filter(Boolean).some((v) => (v as string).toLowerCase().includes(term))
      )
    : clients;

  const set = (k: keyof FormC, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Clients</h1>
        <button onClick={ouvrirAjout} className="btn-primary">+ Ajouter un client</button>
      </div>

      <ConfigBanner />

      {showForm && (
        <div className="glass-card p-5 mb-5">
          <h2 className="font-semibold text-white mb-3">{editingId ? "Modifier le client" : "Nouveau client"}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input className="field-input" placeholder="Nom et prénom *" value={form.nom} onChange={(e) => set("nom", e.target.value)} />
            <input className="field-input" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            <input className="field-input" placeholder="Téléphone" value={form.telephone} onChange={(e) => set("telephone", e.target.value)} />
            <input className="field-input" placeholder="Adresse" value={form.adresse} onChange={(e) => set("adresse", e.target.value)} />
            <input className="field-input" placeholder="Code postal" value={form.code_postal} onChange={(e) => set("code_postal", e.target.value)} />
            <input className="field-input" placeholder="Ville" value={form.ville} onChange={(e) => set("ville", e.target.value)} />
          </div>
          <div className="mt-3">
            <label className="field-label">Commentaire</label>
            <textarea className="field-input" rows={2} value={form.notes}
              onChange={(e) => set("notes", e.target.value)} placeholder="Notes internes, préférences, historique…" />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-ghost">Annuler</button>
            <button onClick={enregistrer} disabled={saving} className="btn-primary">
              {saving ? "Enregistrement…" : editingId ? "Enregistrer" : "Ajouter"}
            </button>
          </div>
        </div>
      )}

      <div className="mb-4">
        <input className="field-input max-w-sm" placeholder="Rechercher un client…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/50">
            <tr>
              <th className="px-5 py-3 font-medium">Nom</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Téléphone</th>
              <th className="px-5 py-3 font-medium">Ville</th>
              <th className="px-5 py-3 font-medium">Commentaire</th>
              <th className="px-5 py-3 font-medium">Origine</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-white/40">
                Aucun client. Ils s&apos;ajoutent automatiquement à la création d&apos;un dossier.
              </td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-5 py-3 font-medium text-white">{c.nom || "—"}</td>
                <td className="px-5 py-3 text-white/80">{c.email || "—"}</td>
                <td className="px-5 py-3 text-white/80">{c.telephone || "—"}</td>
                <td className="px-5 py-3 text-white/80">{c.ville || "—"}</td>
                <td className="px-5 py-3 text-white/60 max-w-[16rem] truncate" title={c.notes || ""}>{c.notes || "—"}</td>
                <td className="px-5 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    c.source === "auto" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"
                  }`}>
                    {c.source === "auto" ? "Auto" : "Manuel"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <button onClick={() => ouvrirEdition(c)} className="text-accent-pink hover:underline mr-3">Modifier</button>
                  <button onClick={() => supprimer(c.id)} className="text-white/40 hover:text-rose-300">Suppr.</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
