"use client";

// RELEVÉS & PAIEMENTS (v53) : lignes dues aux collaborateurs, générées
// depuis les abonnements pointés (bouton « Générer le relevé »), lignes
// manuelles (bonus de volume, avance, autre), passage en « payé ».

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell, { ChampAdmin, dateFr, euros, moisFr } from "@/components/admin/AdminShell";
import ModalShell from "@/components/ModalShell";
import { Collaborateur, LIBELLE_TYPE, Reglement, genererReleve, lireTable, nomCollab, supprimerLigne, upsertLigne } from "@/lib/admin/client";

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export default function ReglementsPage() {
  const [regs, setRegs] = useState<Reglement[]>([]);
  const [collabs, setCollabs] = useState<Collaborateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [collabFiltre, setCollabFiltre] = useState<string>("");
  const [statutFiltre, setStatutFiltre] = useState<"a_payer" | "paye" | "tous">("a_payer");
  const [form, setForm] = useState<Partial<Reglement> | null>(null);
  const [paiement, setPaiement] = useState<{ ids: string[]; facture: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([lireTable<Reglement>("collaborateur_reglements"), lireTable<Collaborateur>("collaborateurs")]);
      setRegs(r); setCollabs(c); setErreur(null);
    } catch (e) { setErreur(e instanceof Error ? e.message : "Lecture impossible."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const parCollab = useMemo(() => new Map(collabs.map((c) => [c.id, c])), [collabs]);
  const visibles = regs.filter((r) => (!collabFiltre || r.collaborateur_id === collabFiltre) && (statutFiltre === "tous" || r.statut === statutFiltre));
  const totalVisible = visibles.reduce((s, r) => s + Number(r.montant), 0);
  const totalAPayer = regs.filter((r) => r.statut === "a_payer").reduce((s, r) => s + Number(r.montant), 0);
  const totalPayeMois = regs.filter((r) => r.statut === "paye" && r.paye_le && r.paye_le.slice(0, 7) === aujourdhui().slice(0, 7)).reduce((s, r) => s + Number(r.montant), 0);

  async function generer() {
    setBusy(true);
    try { const r = await genererReleve(); alert(`${r.ajoutees} nouvelle(s) ligne(s) sur ${r.total} due(s).`); load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Génération impossible."); }
    finally { setBusy(false); }
  }
  async function marquerPayees() {
    if (!paiement) return;
    setBusy(true);
    try {
      for (const id of paiement.ids) {
        const r = regs.find((x) => x.id === id)!;
        await upsertLigne<Reglement>("collaborateur_reglements", { ...r, statut: "paye", paye_le: aujourdhui(), facture_ref: paiement.facture || r.facture_ref });
      }
      setPaiement(null); setSelection(new Set()); load();
    } catch (e) { alert(e instanceof Error ? e.message : "Impossible."); }
    finally { setBusy(false); }
  }
  async function annuler(r: Reglement) {
    if (!confirm("Annuler cette ligne ? (elle reste visible, barrée)")) return;
    try { await upsertLigne<Reglement>("collaborateur_reglements", { ...r, statut: "annule" }); load(); } catch (e) { alert(e instanceof Error ? e.message : "Impossible."); }
  }
  async function supprimer(r: Reglement) {
    if (!confirm("Supprimer définitivement cette ligne ?")) return;
    try { await supprimerLigne("collaborateur_reglements", r.id); load(); } catch (e) { alert(e instanceof Error ? e.message : "Impossible."); }
  }
  async function enregistrerManuel() {
    if (!form?.collaborateur_id || !form.libelle?.trim() || !form.montant) return alert("Collaborateur, libellé et montant sont obligatoires.");
    setBusy(true);
    try { await upsertLigne<Reglement>("collaborateur_reglements", { ...form, montant: Number(form.montant), statut: "a_payer" }); setForm(null); load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Impossible."); }
    finally { setBusy(false); }
  }
  const set = <K extends keyof Reglement>(k: K, v: Reglement[K]) => setForm((f) => ({ ...(f || {}), [k]: v }));
  const basculer = (id: string) => setSelection((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <AdminShell
      titre="Relevés & paiements"
      actions={<>
        <button className="btn-ghost" onClick={() => setForm({ collaborateur_id: collabFiltre || "", type: "bonus", libelle: "", montant: 0, periode: aujourdhui().slice(0, 8) + "01", notes: "" })}>+ Ligne manuelle</button>
        <button className="btn-primary" disabled={busy} onClick={generer} title="Calcule les primes et rétrocessions dues d'après les mensualités pointées">{busy ? "Calcul…" : "Générer le relevé"}</button>
      </>}
    >
      {erreur && <p className="badge badge-danger">{erreur}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi titre="Total à payer" valeur={euros(totalAPayer)} />
        <Kpi titre="Payé ce mois" valeur={euros(totalPayeMois)} />
        <Kpi titre="Sélection" valeur={euros(regs.filter((r) => selection.has(r.id)).reduce((s, r) => s + Number(r.montant), 0))} sous={`${selection.size} ligne${selection.size > 1 ? "s" : ""}`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="field-input field-compact w-auto" value={collabFiltre} onChange={(e) => setCollabFiltre(e.target.value)}>
          <option value="">Tous les collaborateurs</option>
          {collabs.map((c) => <option key={c.id} value={c.id}>{nomCollab(c)} ({c.type === "commercial" ? "com." : "secr."})</option>)}
        </select>
        <div className="segment">
          {([["a_payer", "À payer"], ["paye", "Payés"], ["tous", "Tous"]] as const).map(([v, l]) => (
            <button key={v} className={`segment-btn ${statutFiltre === v ? "actif" : ""}`} onClick={() => setStatutFiltre(v)}>{l}</button>
          ))}
        </div>
        {selection.size > 0 && (
          <button className="btn-primary btn-compact" onClick={() => setPaiement({ ids: Array.from(selection), facture: "" })}>Marquer payé ({selection.size})</button>
        )}
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <colgroup><col className="w-8" /><col className="w-[22%]" /><col className="w-[36%]" /><col className="hidden w-[12%] md:table-column" /><col className="w-[16%]" /><col className="w-[14%]" /></colgroup>
          <thead className="text-left text-white/50">
            <tr>
              <th className="cellule"></th>
              <th className="cellule font-medium">Collaborateur</th>
              <th className="cellule font-medium">Libellé</th>
              <th className="cellule hidden font-medium md:table-cell">Période</th>
              <th className="cellule text-right font-medium">Montant</th>
              <th className="cellule text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>}
            {!loading && visibles.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-white/40">Aucune ligne. Pointez des mensualités puis « Générer le relevé ».</td></tr>}
            {visibles.map((r) => (
              <tr key={r.id} className={`border-t border-white/5 ${r.statut === "annule" ? "opacity-50 line-through" : ""}`}>
                <td className="cellule">{r.statut === "a_payer" && <input type="checkbox" checked={selection.has(r.id)} onChange={() => basculer(r.id)} />}</td>
                <td className="cellule truncate text-white">{nomCollab(parCollab.get(r.collaborateur_id))}</td>
                <td className="cellule">
                  <div className="truncate" title={r.libelle}>{r.libelle}</div>
                  <div className="text-[11px] text-white/45">
                    {LIBELLE_TYPE[r.type]}{r.statut === "paye" ? ` · payé le ${dateFr(r.paye_le)}${r.facture_ref ? ` · ${r.facture_ref}` : ""}` : ""}
                  </div>
                </td>
                <td className="cellule hidden text-white/70 md:table-cell">{moisFr(r.periode)}</td>
                <td className={`cellule text-right tabular-nums ${Number(r.montant) < 0 ? "text-rose-300" : "text-white"}`}>{euros(r.montant)}</td>
                <td className="cellule text-right whitespace-nowrap text-xs">
                  {r.statut === "a_payer" && <button className="text-accent-teal hover:underline mr-2" onClick={() => setPaiement({ ids: [r.id], facture: "" })}>Payé</button>}
                  {r.statut === "a_payer" && <button className="text-white/40 hover:text-amber-300 mr-2" onClick={() => annuler(r)}>Annuler</button>}
                  <button className="text-white/40 hover:text-rose-300" onClick={() => supprimer(r)}>Suppr.</button>
                </td>
              </tr>
            ))}
          </tbody>
          {visibles.length > 0 && (
            <tfoot className="border-t border-white/10 font-semibold text-white"><tr><td className="cellule" colSpan={4}>Total affiché</td><td className="cellule text-right tabular-nums">{euros(totalVisible)}</td><td /></tr></tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-white/45">
        Règles appliquées : prime de signature à la 2e mensualité payée, bonus engagement avec elle, reprise si résiliation avant la 3e (la prime de fidélité est à 0 dans la grille v1.2) ; rétrocession secrétaire pour chaque mensualité payée d&apos;une formule avec heures. Les bonus de volume trimestriels se saisissent en ligne manuelle.
      </p>

      {paiement && (
        <ModalShell title={`Marquer ${paiement.ids.length} ligne${paiement.ids.length > 1 ? "s" : ""} payée${paiement.ids.length > 1 ? "s" : ""}`} onClose={() => setPaiement(null)}>
          <p className="text-sm text-white/70">Montant : <strong className="text-white">{euros(regs.filter((r) => paiement.ids.includes(r.id)).reduce((s, r) => s + Number(r.montant), 0))}</strong>, payé aujourd&apos;hui.</p>
          <ChampAdmin label="Référence de la facture du collaborateur (facultatif)"><input className="field-input mt-1" value={paiement.facture} onChange={(e) => setPaiement({ ...paiement, facture: e.target.value })} /></ChampAdmin>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setPaiement(null)}>Annuler</button>
            <button className="btn-primary" disabled={busy} onClick={marquerPayees}>Confirmer</button>
          </div>
        </ModalShell>
      )}

      {form && (
        <ModalShell title="Ligne manuelle" onClose={() => setForm(null)}>
          <div className="space-y-3">
            <ChampAdmin label="Collaborateur *"><select className="field-input" value={form.collaborateur_id || ""} onChange={(e) => set("collaborateur_id", e.target.value)}><option value="">—</option>{collabs.map((c) => <option key={c.id} value={c.id}>{nomCollab(c)}</option>)}</select></ChampAdmin>
            <ChampAdmin label="Type"><select className="field-input" value={form.type} onChange={(e) => set("type", e.target.value as Reglement["type"])}>{(Object.keys(LIBELLE_TYPE) as Reglement["type"][]).map((t) => <option key={t} value={t}>{LIBELLE_TYPE[t]}</option>)}</select></ChampAdmin>
            <ChampAdmin label="Libellé *"><input className="field-input" value={form.libelle || ""} onChange={(e) => set("libelle", e.target.value)} placeholder="ex. Bonus de volume T4 2026 — 5 contrats" /></ChampAdmin>
            <div className="grid grid-cols-2 gap-3">
              <ChampAdmin label="Montant (négatif = retenue)"><input className="field-input text-right tabular-nums" type="number" step="0.01" value={form.montant ?? ""} onChange={(e) => set("montant", Number(e.target.value))} /></ChampAdmin>
              <ChampAdmin label="Mois concerné"><input className="field-input" type="date" value={form.periode || ""} onChange={(e) => set("periode", e.target.value)} /></ChampAdmin>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setForm(null)}>Annuler</button>
            <button className="btn-primary" disabled={busy} onClick={enregistrerManuel}>Ajouter</button>
          </div>
        </ModalShell>
      )}
    </AdminShell>
  );
}

function Kpi({ titre, valeur, sous }: { titre: string; valeur: string; sous?: string }) {
  return (
    <div className="glass-card p-3 sm:p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{titre}</div>
      <div className="valeur-hud mt-1 font-bold text-white">{valeur}</div>
      {sous && <div className="mt-1 text-[11px] text-white/45">{sous}</div>}
    </div>
  );
}
