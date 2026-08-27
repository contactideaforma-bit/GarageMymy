"use client";

// COLLABORATEURS (v53) : commerciaux et secrétaires — fiches, garages
// rattachés, solde dû / payé, demandes ouvertes.

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell, { ChampAdmin, dateFr, euros } from "@/components/admin/AdminShell";
import ModalShell from "@/components/ModalShell";
import { Abonnement, Collaborateur, Demande, Reglement, lireTable, nomCollab, supprimerLigne, upsertLigne } from "@/lib/admin/client";

const VIDE: Partial<Collaborateur> = { type: "commercial", nom: "", prenom: "", email: "", tel: "", siret: "", adresse: "", statut: "actif", date_debut: "", date_fin: "", iban: "", taux_retrocession: null, taux_horaire: null, notes: "", code_apporteur: "" };

/** Code apporteur lisible : 2 lettres du nom + 4 chiffres (ex. DU4821). */
function genererCode(nom: string): string {
  const lettres = (nom || "XX").normalize("NFD").replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase().padEnd(2, "X");
  return `${lettres}${String(Math.floor(1000 + Math.random() * 9000))}`;
}

export default function CollaborateursPage() {
  const [collabs, setCollabs] = useState<Collaborateur[]>([]);
  const [abos, setAbos] = useState<Abonnement[]>([]);
  const [regs, setRegs] = useState<Reglement[]>([]);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<"tous" | "commercial" | "secretaire">("tous");
  const [form, setForm] = useState<Partial<Collaborateur> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, a, r, d] = await Promise.all([
        lireTable<Collaborateur>("collaborateurs"), lireTable<Abonnement>("abonnements"),
        lireTable<Reglement>("collaborateur_reglements"), lireTable<Demande>("collaborateur_demandes"),
      ]);
      setCollabs(c); setAbos(a); setRegs(r); setDemandes(d); setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Lecture impossible.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const m = new Map<string, { garages: number; actifs: number; du: number; paye: number; demandes: number }>();
    for (const c of collabs) m.set(c.id, { garages: 0, actifs: 0, du: 0, paye: 0, demandes: 0 });
    for (const a of abos) for (const id of [a.commercial_id, a.secretaire_id]) {
      const s = id ? m.get(id) : null;
      if (s) { s.garages += 1; if (a.statut === "actif") s.actifs += 1; }
    }
    for (const r of regs) {
      const s = m.get(r.collaborateur_id);
      if (!s) continue;
      if (r.statut === "a_payer") s.du += Number(r.montant) || 0;
      if (r.statut === "paye") s.paye += Number(r.montant) || 0;
    }
    for (const d of demandes) { const s = m.get(d.collaborateur_id); if (s && d.statut !== "close") s.demandes += 1; }
    return m;
  }, [collabs, abos, regs, demandes]);

  const visibles = collabs.filter((c) => filtre === "tous" || c.type === filtre);

  async function enregistrer() {
    if (!form?.nom?.trim()) return alert("Le nom est obligatoire.");
    setSaving(true);
    try {
      await upsertLigne<Collaborateur>("collaborateurs", { ...form, taux_horaire: form.taux_horaire == null || form.taux_horaire === ("" as unknown) ? null : Number(form.taux_horaire) });
      setForm(null); load();
    } catch (e) { alert(e instanceof Error ? e.message : "Enregistrement impossible."); }
    finally { setSaving(false); }
  }
  async function supprimer(c: Collaborateur) {
    if (!confirm(`Supprimer ${nomCollab(c)} ? Ses relevés et demandes seront effacés.`)) return;
    try { await supprimerLigne("collaborateurs", c.id); load(); } catch (e) { alert(e instanceof Error ? e.message : "Suppression impossible."); }
  }
  const set = <K extends keyof Collaborateur>(k: K, v: Collaborateur[K]) => setForm((f) => ({ ...(f || {}), [k]: v }));

  return (
    <AdminShell titre="Collaborateurs" actions={<button className="btn-primary" onClick={() => setForm({ ...VIDE })}>+ Collaborateur</button>}>
      {erreur && <p className="badge badge-danger">{erreur}</p>}
      <div className="segment">
        {([["tous", "Tous"], ["commercial", "Commerciaux"], ["secretaire", "Secrétaires"]] as const).map(([v, l]) => (
          <button key={v} className={`segment-btn ${filtre === v ? "actif" : ""}`} onClick={() => setFiltre(v)}>{l}</button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading && <p className="text-sm text-white/40">Chargement…</p>}
        {!loading && visibles.length === 0 && <p className="text-sm text-white/40">Aucun collaborateur.</p>}
        {visibles.map((c) => {
          const s = stats.get(c.id)!;
          return (
            <div key={c.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{nomCollab(c)}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className={`badge ${c.type === "commercial" ? "badge-info" : "badge-ok"}`}>{c.type === "commercial" ? "Commercial" : "Secrétaire"}</span>
                    <span className={`badge ${c.statut === "actif" ? "badge-ok" : c.statut === "pause" ? "badge-warn" : "badge-neutral"}`}>{c.statut === "actif" ? "Actif" : c.statut === "pause" ? "En pause" : "Terminé"}</span>
                    {s.demandes > 0 && <span className="badge badge-warn">{s.demandes} demande{s.demandes > 1 ? "s" : ""}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2 text-sm">
                  <button className="text-accent-pink hover:underline" onClick={() => setForm({ ...c })}>Modifier</button>
                  <button className="text-white/40 hover:text-rose-300" onClick={() => supprimer(c)}>Suppr.</button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><div className="valeur-hud text-white">{s.actifs}<span className="text-xs text-white/40">/{s.garages}</span></div><div className="text-[11px] text-white/45">garages actifs</div></div>
                <div><div className="valeur-hud text-amber-300">{euros(s.du)}</div><div className="text-[11px] text-white/45">à payer</div></div>
                <div><div className="valeur-hud text-emerald-300">{euros(s.paye)}</div><div className="text-[11px] text-white/45">déjà payé</div></div>
              </div>
              <div className="mt-3 space-y-0.5 text-xs text-white/60">
                {c.email && <div className="truncate">{c.email}</div>}
                {c.tel && <div>{c.tel}</div>}
                {c.siret && <div>SIRET {c.siret}</div>}
                {c.type === "secretaire" && <div>Taux horaire : {c.taux_horaire != null ? `${Number(c.taux_horaire)} €/h` : "17 €/h (défaut)"}</div>}
                {c.type === "commercial" && (
                  <div>
                    Code apporteur :{" "}
                    {c.code_apporteur ? <b className="font-mono text-white">{c.code_apporteur}</b> : <span className="text-amber-300">à définir (page /vente)</span>}
                  </div>
                )}
                {c.date_debut && <div>Depuis le {dateFr(c.date_debut)}{c.date_fin ? ` · fin le ${dateFr(c.date_fin)}` : ""}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {form && (
        <ModalShell title={form.id ? "Modifier le collaborateur" : "Nouveau collaborateur"} onClose={() => setForm(null)} maxWidth="max-w-2xl">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChampAdmin label="Type"><select className="field-input" value={form.type} onChange={(e) => set("type", e.target.value as Collaborateur["type"])}><option value="commercial">Commercial (apporteur d&apos;affaires)</option><option value="secretaire">Secrétaire</option></select></ChampAdmin>
            <ChampAdmin label="Statut"><select className="field-input" value={form.statut} onChange={(e) => set("statut", e.target.value as Collaborateur["statut"])}><option value="actif">Actif</option><option value="pause">En pause</option><option value="termine">Terminé</option></select></ChampAdmin>
            <ChampAdmin label="Nom *"><input className="field-input" value={form.nom || ""} onChange={(e) => set("nom", e.target.value)} /></ChampAdmin>
            <ChampAdmin label="Prénom"><input className="field-input" value={form.prenom || ""} onChange={(e) => set("prenom", e.target.value)} /></ChampAdmin>
            <ChampAdmin label="Email"><input className="field-input" type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} /></ChampAdmin>
            <ChampAdmin label="Téléphone"><input className="field-input" value={form.tel || ""} onChange={(e) => set("tel", e.target.value)} /></ChampAdmin>
            <ChampAdmin label="SIRET"><input className="field-input" value={form.siret || ""} onChange={(e) => set("siret", e.target.value)} /></ChampAdmin>
            {form.type === "commercial" && (
              <ChampAdmin label="Code apporteur (saisi sur /vente)">
                <div className="flex gap-2">
                  <input className="field-input font-mono uppercase" value={form.code_apporteur || ""} onChange={(e) => set("code_apporteur", e.target.value.toUpperCase())} />
                  <button type="button" className="btn-ghost btn-compact shrink-0" onClick={() => set("code_apporteur", genererCode(form.nom || ""))}>Générer</button>
                </div>
              </ChampAdmin>
            )}
            <ChampAdmin label="IBAN (pour les virements)"><input className="field-input" value={form.iban || ""} onChange={(e) => set("iban", e.target.value)} /></ChampAdmin>
            <ChampAdmin label="Adresse"><input className="field-input" value={form.adresse || ""} onChange={(e) => set("adresse", e.target.value)} /></ChampAdmin>
            {form.type === "secretaire" && (
              <ChampAdmin label="Taux horaire négocié, € HT / heure (vide = 17 € par défaut)"><input className="field-input" type="number" step="0.5" min="0" placeholder="17" value={form.taux_horaire ?? ""} onChange={(e) => set("taux_horaire", e.target.value === "" ? null : Number(e.target.value))} /></ChampAdmin>
            )}
            <ChampAdmin label="Début de collaboration"><input className="field-input" type="date" value={form.date_debut || ""} onChange={(e) => set("date_debut", e.target.value)} /></ChampAdmin>
            <ChampAdmin label="Fin (le cas échéant)"><input className="field-input" type="date" value={form.date_fin || ""} onChange={(e) => set("date_fin", e.target.value)} /></ChampAdmin>
          </div>
          <ChampAdmin label="Notes"><textarea className="field-input mt-3" rows={2} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></ChampAdmin>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setForm(null)}>Annuler</button>
            <button className="btn-primary" disabled={saving} onClick={enregistrer}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </ModalShell>
      )}
    </AdminShell>
  );
}
