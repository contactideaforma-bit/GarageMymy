"use client";

// DEMANDES DES COLLABORATEURS (v53) : ce qu'ils vous demandent (avance,
// changement de zone, question sur un relevé…), avec statut et réponse.

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell, { ChampAdmin, dateFr } from "@/components/admin/AdminShell";
import ModalShell from "@/components/ModalShell";
import { Collaborateur, Demande, lireTable, nomCollab, supprimerLigne, upsertLigne } from "@/lib/admin/client";

export default function DemandesPage() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [collabs, setCollabs] = useState<Collaborateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<"ouvertes" | "toutes">("ouvertes");
  const [form, setForm] = useState<Partial<Demande> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([lireTable<Demande>("collaborateur_demandes"), lireTable<Collaborateur>("collaborateurs")]);
      setDemandes(d); setCollabs(c); setErreur(null);
    } catch (e) { setErreur(e instanceof Error ? e.message : "Lecture impossible."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const parCollab = useMemo(() => new Map(collabs.map((c) => [c.id, c])), [collabs]);
  const visibles = demandes.filter((d) => filtre === "toutes" || d.statut !== "close");

  async function enregistrer() {
    if (!form?.collaborateur_id || !form.objet?.trim()) return alert("Collaborateur et objet sont obligatoires.");
    setBusy(true);
    try {
      const patch: Partial<Demande> = { ...form };
      if (form.reponse && form.statut === "close" && !form.repondu_le) patch.repondu_le = new Date().toISOString();
      await upsertLigne<Demande>("collaborateur_demandes", patch); setForm(null); load();
    } catch (e) { alert(e instanceof Error ? e.message : "Impossible."); }
    finally { setBusy(false); }
  }
  async function supprimer(d: Demande) {
    if (!confirm("Supprimer cette demande ?")) return;
    try { await supprimerLigne("collaborateur_demandes", d.id); load(); } catch (e) { alert(e instanceof Error ? e.message : "Impossible."); }
  }
  const set = <K extends keyof Demande>(k: K, v: Demande[K]) => setForm((f) => ({ ...(f || {}), [k]: v }));
  const badge = (s: Demande["statut"]) => s === "ouverte" ? "badge-warn" : s === "en_cours" ? "badge-info" : "badge-ok";
  const libelle = (s: Demande["statut"]) => s === "ouverte" ? "Ouverte" : s === "en_cours" ? "En cours" : "Close";

  return (
    <AdminShell titre="Demandes des collaborateurs" actions={<button className="btn-primary" onClick={() => setForm({ collaborateur_id: "", objet: "", contenu: "", statut: "ouverte", reponse: "" })}>+ Demande</button>}>
      {erreur && <p className="badge badge-danger">{erreur}</p>}
      <div className="segment">
        <button className={`segment-btn ${filtre === "ouvertes" ? "actif" : ""}`} onClick={() => setFiltre("ouvertes")}>À traiter</button>
        <button className={`segment-btn ${filtre === "toutes" ? "actif" : ""}`} onClick={() => setFiltre("toutes")}>Toutes</button>
      </div>
      <div className="space-y-2">
        {loading && <p className="text-sm text-white/40">Chargement…</p>}
        {!loading && visibles.length === 0 && <p className="text-sm text-white/40">Aucune demande.</p>}
        {visibles.map((d) => (
          <div key={d.id} className="glass-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{d.objet}</span>
                  <span className={`badge ${badge(d.statut)}`}>{libelle(d.statut)}</span>
                </div>
                <div className="mt-1 text-xs text-white/50">{nomCollab(parCollab.get(d.collaborateur_id))} · {dateFr(d.created_at)}</div>
                {d.contenu && <p className="mt-2 whitespace-pre-wrap text-sm text-white/75">{d.contenu}</p>}
                {d.reponse && <p className="mt-2 rounded-md border-l-4 border-accent-teal bg-white/5 px-3 py-2 text-sm text-white/80"><span className="text-[11px] font-semibold uppercase text-accent-teal">Réponse</span><br />{d.reponse}</p>}
              </div>
              <div className="flex gap-3 text-sm">
                <button className="text-accent-pink hover:underline" onClick={() => setForm({ ...d })}>Traiter</button>
                <button className="text-white/40 hover:text-rose-300" onClick={() => supprimer(d)}>Suppr.</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {form && (
        <ModalShell title={form.id ? "Traiter la demande" : "Nouvelle demande"} onClose={() => setForm(null)} maxWidth="max-w-xl">
          <div className="space-y-3">
            <ChampAdmin label="Collaborateur *"><select className="field-input" value={form.collaborateur_id || ""} onChange={(e) => set("collaborateur_id", e.target.value)}><option value="">—</option>{collabs.map((c) => <option key={c.id} value={c.id}>{nomCollab(c)}</option>)}</select></ChampAdmin>
            <ChampAdmin label="Objet *"><input className="field-input" value={form.objet || ""} onChange={(e) => set("objet", e.target.value)} /></ChampAdmin>
            <ChampAdmin label="Détail"><textarea className="field-input" rows={3} value={form.contenu || ""} onChange={(e) => set("contenu", e.target.value)} /></ChampAdmin>
            <ChampAdmin label="Statut"><select className="field-input" value={form.statut} onChange={(e) => set("statut", e.target.value as Demande["statut"])}><option value="ouverte">Ouverte</option><option value="en_cours">En cours</option><option value="close">Close</option></select></ChampAdmin>
            <ChampAdmin label="Réponse"><textarea className="field-input" rows={3} value={form.reponse || ""} onChange={(e) => set("reponse", e.target.value)} /></ChampAdmin>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setForm(null)}>Annuler</button>
            <button className="btn-primary" disabled={busy} onClick={enregistrer}>Enregistrer</button>
          </div>
        </ModalShell>
      )}
    </AdminShell>
  );
}
