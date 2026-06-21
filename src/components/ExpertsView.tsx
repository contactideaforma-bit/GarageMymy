"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Expert } from "@/lib/types";

const EMPTY = {
  cabinet: "", adresse: "", code_postal: "", ville: "", tel: "", email: "",
  expert_nom: "", expert_tel: "", expert_email: "", notes: "",
};
type FormE = typeof EMPTY;

export default function ExpertsView() {
  const [rows, setRows] = useState<Expert[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormE>({ ...EMPTY });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("experts").select("*").order("created_at", { ascending: false });
    if (data) setRows(data as Expert[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: keyof FormE, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function ouvrirAjout() { setEditingId(null); setForm({ ...EMPTY }); setShowForm(true); }
  function ouvrirEdition(r: Expert) {
    setEditingId(r.id);
    setForm({
      cabinet: r.cabinet ?? "", adresse: r.adresse ?? "", code_postal: r.code_postal ?? "",
      ville: r.ville ?? "", tel: r.tel ?? "", email: r.email ?? "",
      expert_nom: r.expert_nom ?? "", expert_tel: r.expert_tel ?? "", expert_email: r.expert_email ?? "",
      notes: r.notes ?? "",
    });
    setShowForm(true);
  }
  async function enregistrer() {
    if (!form.cabinet.trim()) return;
    if (editingId) await supabase.from("experts").update(form).eq("id", editingId);
    else await supabase.from("experts").insert({ ...form, source: "manuel" });
    setShowForm(false); setEditingId(null); setForm({ ...EMPTY }); load();
  }
  async function supprimer(id: string) {
    if (!confirm("Supprimer ce cabinet ?")) return;
    await supabase.from("experts").delete().eq("id", id); load();
  }

  const term = q.trim().toLowerCase();
  const filtered = term
    ? rows.filter((r) => [r.cabinet, r.expert_nom, r.ville, r.email].filter(Boolean).some((v) => (v as string).toLowerCase().includes(term)))
    : rows;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <input className="field-input max-w-sm" placeholder="Rechercher un cabinet / expert…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={ouvrirAjout} className="btn-primary">+ Cabinet</button>
      </div>

      {showForm && (
        <div className="glass-card p-5 mb-5">
          <h3 className="font-semibold text-white mb-3">{editingId ? "Modifier le cabinet" : "Nouveau cabinet"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input className="field-input" placeholder="Cabinet *" value={form.cabinet} onChange={(e) => set("cabinet", e.target.value)} />
            <input className="field-input" placeholder="Téléphone cabinet" value={form.tel} onChange={(e) => set("tel", e.target.value)} />
            <input className="field-input" placeholder="Email cabinet" value={form.email} onChange={(e) => set("email", e.target.value)} />
            <input className="field-input" placeholder="Adresse" value={form.adresse} onChange={(e) => set("adresse", e.target.value)} />
            <input className="field-input" placeholder="Code postal" value={form.code_postal} onChange={(e) => set("code_postal", e.target.value)} />
            <input className="field-input" placeholder="Ville" value={form.ville} onChange={(e) => set("ville", e.target.value)} />
            <input className="field-input" placeholder="Nom de l'expert" value={form.expert_nom} onChange={(e) => set("expert_nom", e.target.value)} />
            <input className="field-input" placeholder="Téléphone expert" value={form.expert_tel} onChange={(e) => set("expert_tel", e.target.value)} />
            <input className="field-input" placeholder="Email expert" value={form.expert_email} onChange={(e) => set("expert_email", e.target.value)} />
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
              <th className="px-5 py-3 font-medium">Cabinet</th>
              <th className="px-5 py-3 font-medium">Expert</th>
              <th className="px-5 py-3 font-medium">Téléphone</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Ville</th>
              <th className="px-5 py-3 font-medium">Origine</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-white/40">Aucun cabinet. Ils s&apos;ajoutent automatiquement depuis les dossiers.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-5 py-3 font-medium text-white">{r.cabinet || "—"}</td>
                <td className="px-5 py-3 text-white/80">{r.expert_nom || "—"}</td>
                <td className="px-5 py-3 text-white/80">{r.tel || r.expert_tel || "—"}</td>
                <td className="px-5 py-3 text-white/80">{r.email || r.expert_email || "—"}</td>
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
