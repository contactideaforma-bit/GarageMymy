"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Dossier } from "@/lib/types";
import { formatDate } from "@/lib/format";
import DossierForm from "@/components/DossierForm";
import ModalShell from "@/components/ModalShell";
import ConfigBanner from "@/components/ConfigBanner";

/* ------------------------------ Dates ------------------------------ */

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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${j}`;
}
const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// Couleur stable par dossier (palette rétro)
const PALETTE = ["#ec4899", "#8b5cf6", "#2dd4bf", "#f59e0b", "#3b82f6", "#10b981"];
function couleurDossier(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

/* ------------------------------ Page ------------------------------ */

export default function PlanningPage() {
  const router = useRouter();
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [mois, setMois] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
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

  // Grille du mois : commence le lundi de la 1ère semaine, finit le dimanche de la dernière
  const semaines = useMemo(() => {
    const debut = lundi(mois);
    const finMois = new Date(mois.getFullYear(), mois.getMonth() + 1, 0);
    const out: Date[][] = [];
    let cur = debut;
    while (cur <= finMois || out.length === 0) {
      out.push(Array.from({ length: 7 }, (_, i) => addDays(cur, i)));
      cur = addDays(cur, 7);
    }
    return out;
  }, [mois]);

  function reparationsDuJour(d: Date): Dossier[] {
    const key = ymd(d);
    return dossiers.filter((x) => {
      if (!x.reparation_debut) return false;
      const fin = x.reparation_fin || x.reparation_debut;
      return x.reparation_debut <= key && key <= fin;
    });
  }

  // Réparations qui touchent le mois affiché (pour la liste sous le calendrier)
  const moisDebut = ymd(mois);
  const moisFin = ymd(new Date(mois.getFullYear(), mois.getMonth() + 1, 0));
  const duMois = dossiers
    .filter((d) => {
      if (!d.reparation_debut) return false;
      const fin = d.reparation_fin || d.reparation_debut;
      return d.reparation_debut <= moisFin && fin >= moisDebut;
    })
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

  const aujourdHui = ymd(new Date());
  const labelMois = mois.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-white">Planning atelier</h1>
        <div className="flex gap-2">
          <button onClick={() => ouvrirPlan()} className="btn-ghost">Planifier</button>
          <button onClick={() => setShowDossier(true)} className="btn-primary">+ Nouveau dossier</button>
        </div>
      </div>

      <ConfigBanner />

      {/* Calendrier du mois */}
      <div className="glass-card p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setMois((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="btn-ghost py-1.5 px-4">
            ← Mois préc.
          </button>
          <div className="text-center">
            <div className="font-pixel text-[0.7rem] text-white capitalize">{labelMois}</div>
            <button
              onClick={() => { const d = new Date(); setMois(new Date(d.getFullYear(), d.getMonth(), 1)); }}
              className="mt-1 text-xs text-accent-pink hover:underline"
            >
              Revenir à aujourd&apos;hui
            </button>
          </div>
          <button onClick={() => setMois((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="btn-ghost py-1.5 px-4">
            Mois suiv. →
          </button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[840px]">
            {/* En-têtes des jours */}
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {JOURS_COURTS.map((j) => (
                <div key={j} className="px-2 py-1 text-center text-xs font-semibold uppercase tracking-wider text-white/45">
                  {j}
                </div>
              ))}
            </div>
            {/* Semaines */}
            {semaines.map((sem, si) => (
              <div key={si} className="grid grid-cols-7 gap-1.5 mb-1.5">
                {sem.map((jour) => {
                  const dansMois = jour.getMonth() === mois.getMonth();
                  const estAujourdhui = ymd(jour) === aujourdHui;
                  const items = reparationsDuJour(jour);
                  return (
                    <div
                      key={ymd(jour)}
                      className={`glass-soft p-1.5 min-h-[6.5rem] ${dansMois ? "" : "opacity-40"} ${
                        estAujourdhui ? "outline outline-2 outline-accent-pink" : ""
                      }`}
                    >
                      <div className={`mb-1 text-xs font-bold ${estAujourdhui ? "text-accent-pink" : "text-white/60"}`}>
                        {jour.getDate()}
                        {estAujourdhui && <span className="ml-1 font-pixel text-[0.45rem]">AUJ.</span>}
                      </div>
                      <div className="space-y-1">
                        {items.slice(0, 3).map((d) => (
                          <button
                            key={d.id}
                            onClick={() => router.push(`/sinistres/${d.id}`)}
                            className="block w-full truncate rounded-sm px-1.5 py-0.5 text-left text-[11px] font-medium text-white hover:brightness-110"
                            style={{ backgroundColor: couleurDossier(d.id), boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.25)" }}
                            title={`${d.marque_modele || ""} ${d.immatriculation || ""} — ${d.reparateur || "sans réparateur"} (du ${formatDate(d.reparation_debut)} au ${formatDate(d.reparation_fin || d.reparation_debut)})`}
                          >
                            {d.immatriculation || d.marque_modele || d.numero_sinistre || "Dossier"}
                          </button>
                        ))}
                        {items.length > 3 && (
                          <div className="px-1 text-[10px] text-white/50">+ {items.length - 3} autre{items.length - 3 > 1 ? "s" : ""}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-white/40">
          Chaque couleur = un véhicule. Clique sur un véhicule pour ouvrir son dossier, ou sur « Planifier » pour ajouter une réparation.
        </p>
      </div>

      {/* Réparations du mois */}
      <div className="glass-card overflow-x-auto">
        <div className="px-5 py-3 border-b border-white/10">
          <h2 className="font-semibold text-white">Réparations — {labelMois}</h2>
        </div>
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
            {!loading && duMois.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-white/40">
                Aucune réparation ce mois-ci. Clique sur « Planifier » pour en ajouter une.
              </td></tr>
            )}
            {duMois.map((d) => (
              <tr key={d.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-5 py-3 text-white">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ backgroundColor: couleurDossier(d.id) }} />
                  {d.marque_modele || "—"}{d.immatriculation ? ` (${d.immatriculation})` : ""}
                </td>
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
        <ModalShell title="Planifier une réparation" onClose={() => setPlanOpen(false)}>
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
        </ModalShell>
      )}

      {showDossier && (
        <DossierForm
          onClose={() => setShowDossier(false)}
          onSaved={(id) => (id ? router.push(`/sinistres/${id}`) : load())}
        />
      )}
    </div>
  );
}
