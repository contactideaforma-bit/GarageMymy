"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Client } from "@/lib/types";
import { formatDate } from "@/lib/format";
import ConfigBanner from "@/components/ConfigBanner";

const EMPTY = { nom: "", email: "", telephone: "", adresse: "", code_postal: "", ville: "", notes: "" };

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (data) setClients(data as Client[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function ajouter() {
    if (!form.nom.trim()) return;
    setSaving(true);
    await supabase.from("clients").insert({ ...form, source: "manuel" });
    setForm({ ...EMPTY });
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

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Clients</h1>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">+ Ajouter un client</button>
      </div>

      <ConfigBanner />

      {showForm && (
        <div className="glass-card p-5 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input className="field-input" placeholder="Nom et prénom *" value={form.nom} onChange={(e) => set("nom", e.target.value)} />
            <input className="field-input" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            <input className="field-input" placeholder="Téléphone" value={form.telephone} onChange={(e) => set("telephone", e.target.value)} />
            <input className="field-input" placeholder="Adresse" value={form.adresse} onChange={(e) => set("adresse", e.target.value)} />
            <input className="field-input" placeholder="Code postal" value={form.code_postal} onChange={(e) => set("code_postal", e.target.value)} />
            <input className="field-input" placeholder="Ville" value={form.ville} onChange={(e) => set("ville", e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setShowForm(false)} className="btn-ghost">Annuler</button>
            <button onClick={ajouter} disabled={saving} className="btn-primary">
              {saving ? "Ajout…" : "Ajouter"}
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
              <th className="px-5 py-3 font-medium">Origine</th>
              <th className="px-5 py-3 font-medium">Ajouté le</th>
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
                <td className="px-5 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    c.source === "auto" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"
                  }`}>
                    {c.source === "auto" ? "Auto" : "Manuel"}
                  </span>
                </td>
                <td className="px-5 py-3 text-white/80">{formatDate(c.created_at)}</td>
                <td className="px-5 py-3 text-right">
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
