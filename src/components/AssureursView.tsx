"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Assureur } from "@/lib/types";

const EMPTY = { nom: "", adresse: "", code_postal: "", ville: "", tel: "", email: "", notes: "" };
type FormA = typeof EMPTY;

export default function AssureursView() {
  const [rows, setRows] = useState<Assureur[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormA>({ ...EMPTY });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("assureurs").select("*").order("created_at", { ascending: false });
    if (data) setRows(data as Assureur[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: keyof FormA, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function ouvrirAjout() { setEditingId(null); setForm({ ...EMPTY }); setShowForm(true); }
  function ouvrirEdition(r: Assureur) {
    setEditingId(r.id);
    setForm({
      nom: r.nom ?? "", adresse: r.adresse ?? "", code_postal: r.code_postal ?? "",
      ville: r.ville ?? "", tel: r.tel ?? "", email: r.email ?? "", notes: r.notes ?? "",
    });
    setShowForm(true);
  }
  async function enregistrer() {
    if (!form.nom.trim()) return;
    if (editingId) await supabase.from("assureurs").update(form).eq("id", editingId);
    else await supabase.from("assureurs").insert({ ...form, source: "manuel" });
    setShowForm(false); setEditingId(null); setForm({ ...EMPTY }); load();
  }
  async function supprimer(id: string) {
    if (!confirm("Supprimer cet assureur ?")) return;
    await supabase.from("assureurs").delete().eq("id", id); load();
  }

  const term = q.trim().toLowerCase();
  const filtered = term
    ? rows.filter((r) => [r.nom, r.ville, r.email].filter(Boolean).some((v) => (v as string).toLowerCase().includes(term)))
    : rows;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <input className="field-input max-w-sm" placeholder="Rechercher un assureur…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={ouvrirAjout} className="btn-primary">+ Assureur</button>
      </div>

      {showForm && (
        <div className="glass-card p-5 mb-5">
          <h3 className="font-semibold text-white mb-3">{editingId ? "Modifier l'assureur" : "Nouvel assureur"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input className="field-input" placeholder="Nom *" value={form.nom} onChange={(e) => set("nom", e.target.value)} />
            <input className="field-input" placeholder="Téléphone" value={form.tel} onChange={(e) => set("tel", e.target.value)} />
            <input className="field-input" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            <input className="field-input" placeholder="Adresse" value={form.adresse} onChange={(e) => set("adresse", e.target.value)} />
            <input className="field-input" placeholder="Code postal" value={form.code_postal} onChange={(e) => set("code_postal", e.target.value)} />
            <input className="field-input" placeholder="Ville" value={form.ville} onChange={(e) => set("ville", e.target.value)} />
          </div>
          <textarea className="field-input mt-3" rows={2} placeholder="Commentaire" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-ghost">Annuler</button>
            <button onClick={enregistrer} className="btn-primary">{editingId ? "Enregistrer" : "Ajouter"}</button>
          </div>
        </div>
      )}

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/50">
            <tr>
              <th className="px-5 py-3 font-medium">Assureur</th>
              <th className="px-5 py-3 font-medium">Téléphone</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Ville</th>
              <th className="px-5 py-3 font-medium">Origine</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-white/40">Aucun assureur. Ils s&apos;ajoutent automatiquement depuis les dossiers.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-5 py-3 font-medium text-white">{r.nom || "—"}</td>
                <td className="px-5 py-3 text-white/80">{r.tel || "—"}</td>
                <td className="px-5 py-3 text-white/80">{r.email || "—"}</td>
                <td className="px-5 py-3 text-white/80">{r.ville || "—"}</td>
                <td className="px-5 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${r.source === "auto" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"}`}>
                    {r.source === "auto" ? "Auto" : "Manuel"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <button onClick={() => ouvrirEdition(r)} className="text-accent-pink hover:underline mr-3">Modifier</button>
                  <button onClick={() => supprimer(r.id)} className="text-white/40 hover:text-rose-300">Suppr.</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
