"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, Vehicule } from "@/lib/types";
import ConfigBanner from "@/components/ConfigBanner";

type Row = {
  kind: "dossier" | "libre";
  id: string;
  immatriculation: string;
  marque_modele: string;
  proprietaire: string;
  au_garage: boolean;
  dossierId?: string;
};

const EMPTY = { immatriculation: "", marque_modele: "", proprietaire: "", notes: "" };

export default function VehiculesPage() {
  const router = useRouter();
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [libres, setLibres] = useState<Vehicule[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "presents" | "absents">("tous");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  const load = useCallback(async () => {
    setLoading(true);
    const [d, v] = await Promise.all([
      supabase.from("dossiers").select("*").order("created_at", { ascending: false }),
      supabase.from("vehicules").select("*").order("created_at", { ascending: false }),
    ]);
    if (d.data) setDossiers(d.data as Dossier[]);
    if (v.data) setLibres(v.data as Vehicule[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows: Row[] = [
    ...dossiers.map((d) => ({
      kind: "dossier" as const,
      id: d.id,
      immatriculation: d.immatriculation || "—",
      marque_modele: d.marque_modele || "—",
      proprietaire: d.client_nom || "—",
      au_garage: !!d.au_garage,
      dossierId: d.id,
    })),
    ...libres.map((v) => ({
      kind: "libre" as const,
      id: v.id,
      immatriculation: v.immatriculation || "—",
      marque_modele: v.marque_modele || "—",
      proprietaire: v.proprietaire || "—",
      au_garage: v.au_garage,
    })),
  ];

  const presentsCount = rows.filter((r) => r.au_garage).length;

  async function toggle(r: Row) {
    const next = !r.au_garage;
    if (r.kind === "dossier") {
      setDossiers((arr) => arr.map((d) => (d.id === r.id ? { ...d, au_garage: next } : d)));
      await supabase.from("dossiers").update({ au_garage: next }).eq("id", r.id);
    } else {
      setLibres((arr) => arr.map((v) => (v.id === r.id ? { ...v, au_garage: next } : v)));
      await supabase.from("vehicules").update({ au_garage: next }).eq("id", r.id);
    }
  }

  async function ajouter() {
    if (!form.immatriculation.trim() && !form.marque_modele.trim()) return;
    await supabase.from("vehicules").insert({ ...form, au_garage: true });
    setForm({ ...EMPTY });
    setShowForm(false);
    load();
  }

  async function supprimerLibre(id: string) {
    if (!confirm("Supprimer ce véhicule ?")) return;
    await supabase.from("vehicules").delete().eq("id", id);
    load();
  }

  const term = q.trim().toLowerCase();
  const filtered = rows
    .filter((r) => (filtre === "tous" ? true : filtre === "presents" ? r.au_garage : !r.au_garage))
    .filter((r) =>
      term ? [r.immatriculation, r.marque_modele, r.proprietaire].some((v) => v.toLowerCase().includes(term)) : true
    );

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Véhicules</h1>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">+ Véhicule (hors dossier)</button>
      </div>

      <ConfigBanner />

      {showForm && (
        <div className="glass-card p-5 mb-5">
          <h3 className="font-semibold text-white mb-3">Nouveau véhicule (hors dossier sinistre)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input className="field-input" placeholder="Immatriculation" value={form.immatriculation} onChange={(e) => set("immatriculation", e.target.value)} />
            <input className="field-input" placeholder="Marque et modèle" value={form.marque_modele} onChange={(e) => set("marque_modele", e.target.value)} />
            <input className="field-input" placeholder="Propriétaire" value={form.proprietaire} onChange={(e) => set("proprietaire", e.target.value)} />
          </div>
          <textarea className="field-input mt-3" rows={2} placeholder="Notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setShowForm(false)} className="btn-ghost">Annuler</button>
            <button onClick={ajouter} className="btn-primary">Ajouter (au garage)</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
          {([["tous", "Tous"], ["presents", "Présents"], ["absents", "Absents"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFiltre(k)}
              className={`rounded-lg px-3 py-1 text-sm ${filtre === k ? "bg-white/15 text-white font-medium" : "text-white/60 hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>
        <input className="field-input max-w-xs" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-sm text-white/50 ml-auto">🚗 {presentsCount} présent{presentsCount > 1 ? "s" : ""} au garage</span>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/50">
            <tr>
              <th className="px-5 py-3 font-medium">Au garage</th>
              <th className="px-5 py-3 font-medium">Immatriculation</th>
              <th className="px-5 py-3 font-medium">Véhicule</th>
              <th className="px-5 py-3 font-medium">Propriétaire</th>
              <th className="px-5 py-3 font-medium">Origine</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-white/40">Aucun véhicule.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={`${r.kind}-${r.id}`} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-5 py-3">
                  <label className="inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={r.au_garage} onChange={() => toggle(r)} className="sr-only peer" />
                    <span className="relative h-5 w-9 rounded-full bg-white/20 peer-checked:bg-accent-violet transition-colors">
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${r.au_garage ? "left-[1.15rem]" : "left-0.5"}`} />
                    </span>
                  </label>
                </td>
                <td className="px-5 py-3 font-medium text-white">{r.immatriculation}</td>
                <td className="px-5 py-3 text-white/80">{r.marque_modele}</td>
                <td className="px-5 py-3 text-white/80">{r.proprietaire}</td>
                <td className="px-5 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${r.kind === "dossier" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"}`}>
                    {r.kind === "dossier" ? "Sinistre" : "Hors dossier"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  {r.kind === "dossier" ? (
                    <button onClick={() => router.push(`/sinistres/${r.dossierId}`)} className="text-accent-pink hover:underline">Dossier</button>
                  ) : (
                    <button onClick={() => supprimerLibre(r.id)} className="text-white/40 hover:text-rose-300">Suppr.</button>
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
