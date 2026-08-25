"use client";

// SIMULATEUR DE RENTABILITÉ (v53) — « si je vends 3 Essentiel et 2 Starter
// avec un commercial + 1 Confort sans commercial, qu'est-ce que je gagne ? »
// Tous les calculs sont dans lib/admin/economie.ts ; les paramètres (grille,
// commissions, rétrocession, coûts) sont modifiables et enregistrés en base.

import { useEffect, useMemo, useState } from "react";
import AdminShell, { euros } from "@/components/admin/AdminShell";
import { enregistrerParametres, lireParametres } from "@/lib/admin/client";
import { FORMULES, Formule, LigneSimulation, PARAMETRES_DEFAUT, Parametres, simuler } from "@/lib/admin/economie";

const LIGNES_DEFAUT: LigneSimulation[] = [
  { formule: "essentiel", nombre: 3, avecCommercial: true },
  { formule: "starter", nombre: 2, avecCommercial: true },
  { formule: "confort", nombre: 1, avecCommercial: false },
  { formule: "serenite", nombre: 0, avecCommercial: true },
];

export default function SimulateurPage() {
  const [p, setP] = useState<Parametres>(PARAMETRES_DEFAUT);
  const [lignes, setLignes] = useState<LigneSimulation[]>(LIGNES_DEFAUT);
  const [paramsOuverts, setParamsOuverts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    lireParametres().then(setP).catch(() => setMessage("Paramètres par défaut (base non joignable)."));
  }, []);

  const r = useMemo(() => simuler(lignes, p), [lignes, p]);

  function majLigne(i: number, patch: Partial<LigneSimulation>) {
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function ajouterLigne() {
    setLignes((ls) => [...ls, { formule: "confort", nombre: 1, avecCommercial: true }]);
  }
  function majFormule(f: Formule, k: keyof Parametres["formules"][Formule], v: number) {
    setP((q) => ({ ...q, formules: { ...q.formules, [f]: { ...q.formules[f], [k]: v } } }));
  }
  async function sauver() {
    setSaving(true);
    try {
      const res = await enregistrerParametres(p);
      setP(res.parametres);
      setMessage("Paramètres enregistrés.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell
      titre="Simulateur de rentabilité"
      actions={<button className="btn-ghost" onClick={() => setParamsOuverts((o) => !o)}>{paramsOuverts ? "Masquer les paramètres" : "Paramètres"}</button>}
    >
      {message && <p className="text-xs text-white/60">{message}</p>}

      {/* ---------------- Ventes ---------------- */}
      <section className="glass-card p-4 sm:p-5">
        <h2 className="titre-section mb-3">Ce que je vends</h2>
        <div className="space-y-2">
          {lignes.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_auto_auto] items-center gap-2 sm:grid-cols-[14rem_6rem_1fr_auto]">
              <select className="field-input field-compact" value={l.formule} onChange={(e) => majLigne(i, { formule: e.target.value as Formule })}>
                {FORMULES.map((f) => <option key={f} value={f}>{p.formules[f].libelle} — {euros(p.formules[f].prix)}/mois</option>)}
              </select>
              <input type="number" min={0} className="field-input field-compact text-right tabular-nums" value={l.nombre} onChange={(e) => majLigne(i, { nombre: Math.max(0, Number(e.target.value) || 0) })} />
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" checked={l.avecCommercial} onChange={(e) => majLigne(i, { avecCommercial: e.target.checked })} />
                <span className="hidden sm:inline">vendu par un commercial (commission)</span>
                <span className="sm:hidden">commercial</span>
              </label>
              <button className="text-white/40 hover:text-rose-300" onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))} aria-label="Retirer">✕</button>
            </div>
          ))}
        </div>
        <button className="btn-ghost btn-compact mt-3" onClick={ajouterLigne}>+ Ajouter une ligne</button>
      </section>

      {/* ---------------- Résultats ---------------- */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tuile titre="Chiffre d'affaires / mois" valeur={euros(r.caMensuel)} sous={`${r.garages} garage${r.garages > 1 ? "s" : ""}`} />
        <Tuile titre="Marge avant commercial / mois" valeur={euros(r.margeAvantCommercialMensuelle)} sous={`après ${euros(r.retrocessionsMensuelles)} de rétrocessions et ${euros(r.techniqueMensuel)} de technique`} />
        <Tuile titre="Résultat / mois — année 1" valeur={euros(r.resultatMensuelAnnee1)} sous={`commissions ${euros(r.commissionsAnnee1)} lissées + fixes ${euros(r.coutsFixesMensuels)}`} accent />
        <Tuile titre="Résultat / mois — croisière" valeur={euros(r.resultatMensuelCroisiere)} sous="année 2 : plus de commission" />
      </section>

      <section className="glass-card overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <colgroup><col className="w-[26%]" /><col className="w-[8%]" /><col className="w-[14%]" /><col className="w-[14%]" /><col className="w-[12%]" /><col className="w-[13%]" /><col className="w-[13%]" /></colgroup>
          <thead className="text-left text-white/50">
            <tr>
              <th className="cellule font-medium">Formule</th>
              <th className="cellule text-right font-medium">Nb</th>
              <th className="cellule text-right font-medium">CA / mois</th>
              <th className="cellule text-right font-medium">Rétro / mois</th>
              <th className="cellule text-right font-medium">Commission</th>
              <th className="cellule text-right font-medium">Résultat an 1</th>
              <th className="cellule text-right font-medium">Résultat an 2</th>
            </tr>
          </thead>
          <tbody>
            {r.detail.map((d, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="cellule text-white">{p.formules[d.formule].libelle}{d.avecCommercial ? "" : <span className="ml-2 badge badge-neutral">sans commercial</span>}</td>
                <td className="cellule text-right tabular-nums">{d.nombre}</td>
                <td className="cellule text-right tabular-nums">{euros(d.ca)}</td>
                <td className="cellule text-right tabular-nums text-white/70">{d.retro ? "− " + euros(d.retro) : "—"}</td>
                <td className="cellule text-right tabular-nums text-white/70">{d.commission ? "− " + euros(d.commission) : "—"}</td>
                <td className="cellule text-right tabular-nums text-white">{euros(d.resultatA1)}</td>
                <td className="cellule text-right tabular-nums text-white">{euros(d.resultatA2)}</td>
              </tr>
            ))}
            {r.detail.length === 0 && <tr><td colSpan={7} className="px-5 py-6 text-center text-white/40">Saisissez au moins une vente.</td></tr>}
          </tbody>
          {r.detail.length > 0 && (
            <tfoot className="border-t border-white/10 font-semibold text-white">
              <tr>
                <td className="cellule">Total (hors coûts fixes {euros(r.coutsFixesMensuels)}/mois)</td>
                <td className="cellule text-right tabular-nums">{r.garages}</td>
                <td className="cellule text-right tabular-nums">{euros(r.caMensuel)}</td>
                <td className="cellule text-right tabular-nums">− {euros(r.retrocessionsMensuelles)}</td>
                <td className="cellule text-right tabular-nums">− {euros(r.commissionsAnnee1)}</td>
                <td className="cellule text-right tabular-nums">{euros(r.resultatAnnee1)}</td>
                <td className="cellule text-right tabular-nums">{euros(r.resultatAnnee2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        <p className="px-4 py-3 text-xs text-white/45">
          Commission = prime de signature + bonus engagement × {Math.round(p.tauxEngagement * 100)} %{p.formules.confort.primeFidelite > 0 ? ` + fidélité × ${Math.round(p.tauxConservationM6 * 100)} %` : ""} (versée une seule fois, vers le 2e mois).
          Résultat = CA − rétrocessions − technique − commissions − coûts fixes, avant votre rémunération et impôt.
        </p>
      </section>

      {/* ---------------- Paramètres ---------------- */}
      {paramsOuverts && (
        <section className="glass-card p-4 sm:p-5">
          <h2 className="titre-section mb-3">Paramètres</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-white/50">
                <tr>
                  <th className="cellule font-medium">Formule</th><th className="cellule font-medium">Prix HT</th><th className="cellule font-medium">Heures</th>
                  <th className="cellule font-medium">Prime signature</th><th className="cellule font-medium">Fidélité</th><th className="cellule font-medium">Bonus 12 mois</th>
                </tr>
              </thead>
              <tbody>
                {FORMULES.map((f) => (
                  <tr key={f} className="border-t border-white/5">
                    <td className="cellule text-white">{p.formules[f].libelle}</td>
                    {(["prix", "heures", "primeSignature", "primeFidelite", "bonusEngagement"] as const).map((k) => (
                      <td key={k} className="cellule">
                        <input type="number" className="field-input field-compact w-24 text-right tabular-nums" value={p.formules[f][k]} onChange={(e) => majFormule(f, k, Number(e.target.value) || 0)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Param label="Rétrocession secrétaire" value={p.tauxRetrocession * 100} suffixe="%" onChange={(v) => setP({ ...p, tauxRetrocession: v / 100 })} />
            <Param label="Coût technique / garage / mois" value={p.coutTechnique} suffixe="€" onChange={(v) => setP({ ...p, coutTechnique: v })} />
            <Param label="Coûts fixes / mois" value={p.coutsFixes} suffixe="€" onChange={(v) => setP({ ...p, coutsFixes: v })} />
            <Param label="Part engagée 12 mois" value={p.tauxEngagement * 100} suffixe="%" onChange={(v) => setP({ ...p, tauxEngagement: v / 100 })} />
            <Param label="Conservés à M6" value={p.tauxConservationM6 * 100} suffixe="%" onChange={(v) => setP({ ...p, tauxConservationM6: v / 100 })} />
            <Param label="Reprise si arrêt avant (mensualités)" value={p.mensualitesReprise} suffixe="" onChange={(v) => setP({ ...p, mensualitesReprise: v })} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={sauver} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer les paramètres"}</button>
            <button className="btn-ghost" onClick={() => setP(PARAMETRES_DEFAUT)}>Revenir aux valeurs par défaut</button>
          </div>
          <p className="mt-2 text-xs text-white/45">Ces paramètres servent aussi aux relevés de commissions et de rétrocessions.</p>
        </section>
      )}
    </AdminShell>
  );
}

function Tuile({ titre, valeur, sous, accent }: { titre: string; valeur: string; sous?: string; accent?: boolean }) {
  return (
    <div className={`glass-card p-3 sm:p-4 ${accent ? "border-accent-pink" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{titre}</div>
      <div className={`valeur-hud mt-1 font-bold ${accent ? "text-accent-pink" : "text-white"}`}>{valeur}</div>
      {sous && <div className="mt-1 text-[11px] text-white/45">{sous}</div>}
    </div>
  );
}
function Param({ label, value, suffixe, onChange }: { label: string; value: number; suffixe: string; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="field-label">{label}{suffixe ? ` (${suffixe})` : ""}</label>
      <input type="number" step="any" className="field-input field-compact text-right tabular-nums" value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}
