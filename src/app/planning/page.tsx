"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Dossier } from "@/lib/types";
import { formatDate } from "@/lib/format";
import DossierForm from "@/components/DossierForm";
import ConfigBanner from "@/components/ConfigBanner";

// Lundi de la semaine contenant `d`
function lundi(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0 = lundi
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export default function PlanningPage() {
  const router = useRouter();
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showDossier, setShowDossier] = useState(false);

  // modal planification
  const [planOpen, setPlanOpen] = useState(false);
  const [planId, setPlanId] = useState("");
  const [planDebut, setPlanDebut] = useState("");
  const [planFin, setPlanFin] = useState("");
  const [planRep, setPlanRep] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("dossiers").select("*").order("created_at", { ascending: false });
    if (data) setDossiers(data as Dossier[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const base = lundi(addDays(new Date(), weekOffset * 7));
  const jours = Array.from({ length: 7 }, (_, i) => addDays(base, i));

  function dossiersDuJour(d: Date): Dossier[] {
    const key = ymd(d);
    return dossiers.filter(
      (x) => x.reparation_debut && x.reparation_fin && x.reparation_debut <= key && key <= x.reparation_fin
    );
  }

  const planifies = dossiers
    .filter((d) => d.reparation_debut)
    .sort((a, b) => (a.reparation_debut || "").localeCompare(b.reparation_debut || ""));

  function ouvrirPlan(d?: Dossier) {
    setPlanId(d?.id || "");
    setPlanDebut(d?.reparation_debut || "");
    setPlanFin(d?.reparation_fin || "");
    setPlanRep(d?.reparateur || "");
    setPlanOpen(true);
  }

  async function enregistrerPlan() {
    if (!planId) return;
    await supabase.from("dossiers").update({
      reparation_debut: planDebut || null,
      reparation_fin: planFin || null,
      reparateur: planRep || null,
    }).eq("id", planId);
    setPlanOpen(false);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Planning de réparations</h1>
        <div className="flex gap-2">
          <button onClick={() => ouvrirPlan()} className="btn-ghost">＋ Planifier</button>
          <button onClick={() => setShowDossier(true)} className="btn-primary">+ Nouveau dossier</button>
        </div>
      </div>

      <ConfigBanner />

      {/* Navigation semaine */}
      <div className="glass-card p-4 mb-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setWeekOffset((w) => w - 1)} className="btn-ghost py-1 px-3 text-sm">‹ Préc.</button>
          <div className="text-center">
            <div className="font-semibold text-white">
              {base.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })} —{" "}
              {addDays(base, 6).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
            </div>
            <button onClick={() => setWeekOffset(0)} className="text-xs text-accent-pink hover:underline">Aujourd&apos;hui</button>
          </div>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="btn-ghost py-1 px-3 text-sm">Suiv. ›</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {jours.map((j, i) => {
            const items = dossiersDuJour(j);
            const isToday = ymd(j) === ymd(new Date());
            return (
              <div key={i} className={`glass-soft p-2 min-h-[7rem] ${isToday ? "ring-1 ring-accent-violet" : ""}`}>
                <div className="text-xs font-semibold text-white/70 mb-2">
                  {JOURS[i]} <span className="text-white/40">{j.getDate()}</span>
                </div>
                <div className="space-y-1">
                  {items.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => router.push(`/sinistres/${d.id}`)}
                      className="w-full text-left rounded-md bg-gradient-to-r from-accent-violet/30 to-accent-pink/30 px-2 py-1 text-[11px] text-white hover:from-accent-violet/50 hover:to-accent-pink/50"
                    >
                      <div className="font-medium truncate">{d.marque_modele || d.numero_sinistre || "Dossier"}</div>
                      {d.reparateur && <div className="text-white/60 truncate">{d.reparateur}</div>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Liste des réparations planifiées */}
      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/50">
            <tr>
              <th className="px-5 py-3 font-medium">Véhicule</th>
              <th className="px-5 py-3 font-medium">N° sinistre</th>
              <th className="px-5 py-3 font-medium">Début</th>
              <th className="px-5 py-3 font-medium">Fin</th>
              <th className="px-5 py-3 font-medium">Réparateur</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>}
            {!loading && planifies.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-white/40">Aucune réparation planifiée.</td></tr>
            )}
            {planifies.map((d) => (
              <tr key={d.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-5 py-3 text-white">{d.marque_modele || "—"}{d.immatriculation ? ` (${d.immatriculation})` : ""}</td>
                <td className="px-5 py-3 text-white/80">{d.numero_sinistre || "—"}</td>
                <td className="px-5 py-3 text-white/80">{formatDate(d.reparation_debut)}</td>
                <td className="px-5 py-3 text-white/80">{formatDate(d.reparation_fin)}</td>
                <td className="px-5 py-3 text-white/80">{d.reparateur || "—"}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <button onClick={() => ouvrirPlan(d)} className="text-accent-pink hover:underline mr-3">Modifier</button>
                  <button onClick={() => router.push(`/sinistres/${d.id}`)} className="text-accent-teal hover:underline">Ouvrir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal planification */}
      {planOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto backdrop-blur-sm">
          <div className="w-full max-w-lg glass-card my-8 modal-panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Planifier une réparation</h2>
              <button onClick={() => setPlanOpen(false)} className="text-white/50 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="field-label">Dossier</label>
                <select className="field-input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  <option value="">— Choisir un dossier —</option>
                  {dossiers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {(d.marque_modele || "Dossier")}{d.immatriculation ? ` (${d.immatriculation})` : ""} · {d.numero_sinistre || "—"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Début</label>
                  <input type="date" className="field-input" value={planDebut} onChange={(e) => setPlanDebut(e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Fin</label>
                  <input type="date" className="field-input" value={planFin} onChange={(e) => setPlanFin(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="field-label">Réparateur attitré</label>
                <input className="field-input" value={planRep} onChange={(e) => setPlanRep(e.target.value)} placeholder="Nom du réparateur" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setPlanOpen(false)} className="btn-ghost">Annuler</button>
                <button onClick={enregistrerPlan} disabled={!planId} className="btn-primary">Enregistrer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDossier && <DossierForm onClose={() => setShowDossier(false)} onSaved={load} />}
    </div>
  );
}
