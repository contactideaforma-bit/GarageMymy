"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { FlotteEntretien, FlotteVehicule } from "@/lib/types";
import { formatDate, formatEuros, messageErreur, ymd } from "@/lib/format";
import { TYPES_ENTRETIEN } from "@/lib/flotte";
import { usePliage } from "@/lib/pliage";
import ModalShell from "@/components/ModalShell";

/** Carnet d'entretien du véhicule (v12.3) : révisions, pneus, CT, coûts, prochain passage. */
export default function FlotteEntretiensPanel({
  vehicule,
  entretiens,
  onChanged,
}: {
  vehicule: FlotteVehicule;
  entretiens: FlotteEntretien[];
  onChanged: () => void;
}) {
  const { plie, basculerPliage } = usePliage("flotte.entretiens", false);
  const [modal, setModal] = useState<{ e?: FlotteEntretien } | null>(null);

  async function supprimer(e: FlotteEntretien) {
    if (!confirm("Supprimer cette ligne d'entretien ?")) return;
    const { error } = await supabase.from("flotte_entretiens").delete().eq("id", e.id);
    if (error) return alert(messageErreur(error));
    onChanged();
  }

  const aujourdhui = ymd();
  const prochains = entretiens.filter((e) => e.prochain_le && e.prochain_le >= aujourdhui).sort((a, b) => (a.prochain_le || "").localeCompare(b.prochain_le || ""));
  const enRetard = entretiens.filter((e) => e.prochain_le && e.prochain_le < aujourdhui && !entretiens.some((x) => x.type === e.type && (x.date_entretien || "") > (e.date_entretien || "")));
  const total = entretiens.reduce((s, e) => s + (Number(e.cout) || 0), 0);

  return (
    <section className="glass-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 sm:px-4 sm:py-2.5">
        <button onClick={basculerPliage} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={!plie}>
          <span className={`shrink-0 text-white/40 transition-transform ${plie ? "" : "rotate-90"}`} aria-hidden>▸</span>
          <h2 className="titre-bloc truncate">Entretiens</h2>
          <span className="badge">{entretiens.length}</span>
          {enRetard.length > 0 && <span className="badge badge-warn">{enRetard.length} en retard</span>}
        </button>
        {!plie && (
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <button onClick={() => setModal({})} className="btn-ghost py-1.5 px-3 text-xs">+ Entretien</button>
          </div>
        )}
      </div>

      {!plie && (
        <div className="space-y-3 px-4 py-4 sm:px-5">
          {(prochains.length > 0 || enRetard.length > 0) && (
            <div className="glass-soft px-3 py-2 text-xs text-white/70">
              {enRetard.map((e) => (
                <div key={e.id} className="text-amber-200">⚠ {TYPES_ENTRETIEN[e.type] || e.type} prévu le {formatDate(e.prochain_le)} — dépassé</div>
              ))}
              {prochains.slice(0, 3).map((e) => (
                <div key={e.id}>Prochain : {TYPES_ENTRETIEN[e.type] || e.type} le {formatDate(e.prochain_le)}{e.prochain_km ? ` ou à ${e.prochain_km.toLocaleString("fr-FR")} km` : ""}</div>
              ))}
            </div>
          )}
          {entretiens.length === 0 && (
            <p className="text-sm text-white/40">Aucun entretien enregistré. Note ici révisions, pneus, freins, contrôle technique — avec le coût et le prochain passage.</p>
          )}
          {entretiens.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-white/50">
                  <tr>
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Type</th>
                    <th className="px-2 py-2 font-medium">Détail</th>
                    <th className="px-2 py-2 font-medium">Km</th>
                    <th className="px-2 py-2 font-medium text-right">Coût</th>
                    <th className="px-2 py-2 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {entretiens.map((e) => (
                    <tr key={e.id} className="border-t border-white/5">
                      <td className="px-2 py-2 whitespace-nowrap">{formatDate(e.date_entretien)}</td>
                      <td className="px-2 py-2">{TYPES_ENTRETIEN[e.type] || e.type}</td>
                      <td className="px-2 py-2 text-white/70">
                        {e.description || "—"}
                        {e.prestataire ? <span className="text-white/40"> · {e.prestataire}</span> : null}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">{e.kilometrage != null ? e.kilometrage.toLocaleString("fr-FR") : "—"}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{e.cout != null ? formatEuros(e.cout) : "—"}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <button onClick={() => setModal({ e })} className="mr-2 text-accent-pink hover:underline">Modifier</button>
                        <button onClick={() => supprimer(e)} className="text-white/40 hover:text-rose-300">Suppr.</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {total > 0 && (
                  <tfoot>
                    <tr className="border-t border-white/10 text-white/60">
                      <td colSpan={4} className="px-2 py-2 text-xs">Total entretiens</td>
                      <td className="px-2 py-2 text-right">{formatEuros(total)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {modal && (
        <EntretienModal vehicule={vehicule} entretien={modal.e} onClose={() => setModal(null)} onSaved={() => { setModal(null); onChanged(); }} />
      )}
    </section>
  );
}

function EntretienModal({ vehicule, entretien, onClose, onSaved }: { vehicule: FlotteVehicule; entretien?: FlotteEntretien; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    date_entretien: entretien?.date_entretien || ymd(),
    type: entretien?.type || "revision",
    description: entretien?.description || "",
    kilometrage: entretien?.kilometrage != null ? String(entretien.kilometrage) : vehicule.kilometrage != null ? String(vehicule.kilometrage) : "",
    cout: entretien?.cout != null ? String(entretien.cout) : "",
    prestataire: entretien?.prestataire || "",
    prochain_le: entretien?.prochain_le || "",
    prochain_km: entretien?.prochain_km != null ? String(entretien.prochain_km) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const num = (v: string): number | null => (v.trim() === "" ? null : Number(String(v).replace(",", ".")) || 0);

  async function save() {
    setSaving(true);
    setError(null);
    const payload = {
      vehicule_id: vehicule.id,
      date_entretien: f.date_entretien || null,
      type: f.type,
      description: f.description.trim() || null,
      kilometrage: num(f.kilometrage),
      cout: num(f.cout),
      prestataire: f.prestataire.trim() || null,
      prochain_le: f.prochain_le || null,
      prochain_km: num(f.prochain_km),
    };
    const { error: e1 } = entretien
      ? await supabase.from("flotte_entretiens").update(payload).eq("id", entretien.id)
      : await supabase.from("flotte_entretiens").insert(payload);
    if (e1) { setError(messageErreur(e1, "Enregistrement impossible (migration v67 exécutée ?).")); setSaving(false); return; }
    // Le kilométrage du véhicule suit le dernier entretien saisi, et un
    // entretien enregistré remet la pastille « Entretien » au vert.
    const maj: Record<string, unknown> = { entretien_ok: true };
    const km = num(f.kilometrage);
    if (km != null && km >= (vehicule.kilometrage || 0)) maj.kilometrage = km;
    if (f.type === "ct") { maj.ct_ok = true; maj.date_ct = f.date_entretien || null; if (f.prochain_le) maj.date_prochain_ct = f.prochain_le; }
    await supabase.from("flotte_vehicules").update(maj).eq("id", vehicule.id);
    setSaving(false);
    onSaved();
  }

  return (
    <ModalShell title={entretien ? "Modifier l'entretien" : `Entretien — ${vehicule.immatriculation}`} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="field-label">Date</label><input type="date" className="field-input" value={f.date_entretien} onChange={(e) => set("date_entretien", e.target.value)} /></div>
        <div>
          <label className="field-label">Type</label>
          <select className="field-input" value={f.type} onChange={(e) => set("type", e.target.value)}>
            {Object.entries(TYPES_ENTRETIEN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2"><label className="field-label">Détail</label><input className="field-input" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Vidange + filtres, 4 pneus été…" /></div>
        <div><label className="field-label">Kilométrage</label><input inputMode="numeric" className="field-input" value={f.kilometrage} onChange={(e) => set("kilometrage", e.target.value)} /></div>
        <div><label className="field-label">Coût (€ TTC)</label><input inputMode="decimal" className="field-input" value={f.cout} onChange={(e) => set("cout", e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="field-label">Prestataire</label><input className="field-input" value={f.prestataire} onChange={(e) => set("prestataire", e.target.value)} placeholder="Garage, centre auto, en interne…" /></div>
        <div><label className="field-label">Prochain passage le</label><input type="date" className="field-input" value={f.prochain_le} onChange={(e) => set("prochain_le", e.target.value)} /></div>
        <div><label className="field-label">ou à (km)</label><input inputMode="numeric" className="field-input" value={f.prochain_km} onChange={(e) => set("prochain_km", e.target.value)} /></div>
      </div>
      {error && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</div>}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? "…" : "Enregistrer"}</button>
      </div>
    </ModalShell>
  );
}
