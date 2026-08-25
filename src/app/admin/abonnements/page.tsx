"use client";

// ABONNEMENTS DES GARAGES (v53) : formule, commercial et secrétaire
// rattachés, mensualités à pointer. C'est la source des relevés.

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell, { ChampAdmin, dateFr, euros, moisFr } from "@/components/admin/AdminShell";
import ModalShell from "@/components/ModalShell";
import { Abonnement, Collaborateur, Mensualite, genererMensualites, lireParametres, lireTable, nomCollab, supprimerLigne, upsertLigne } from "@/lib/admin/client";
import { FORMULES, Formule, PARAMETRES_DEFAUT, Parametres } from "@/lib/admin/economie";

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export default function AbonnementsPage() {
  const [p, setP] = useState<Parametres>(PARAMETRES_DEFAUT);
  const [abos, setAbos] = useState<Abonnement[]>([]);
  const [mens, setMens] = useState<Mensualite[]>([]);
  const [collabs, setCollabs] = useState<Collaborateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<"actif" | "tous">("actif");
  const [form, setForm] = useState<Partial<Abonnement> | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null); // abonnement déplié (mensualités)
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, m, c, pp] = await Promise.all([lireTable<Abonnement>("abonnements"), lireTable<Mensualite>("abonnement_mensualites"), lireTable<Collaborateur>("collaborateurs"), lireParametres()]);
      setAbos(a); setMens(m); setCollabs(c); setP(pp); setErreur(null);
    } catch (e) { setErreur(e instanceof Error ? e.message : "Lecture impossible."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const parCollab = useMemo(() => new Map(collabs.map((c) => [c.id, c])), [collabs]);
  const commerciaux = collabs.filter((c) => c.type === "commercial");
  const secretaires = collabs.filter((c) => c.type === "secretaire");
  const visibles = abos.filter((a) => filtre === "tous" || a.statut === "actif");

  function nouveau() {
    setForm({ garage_nom: "", garage_email: "", formule: "confort", prix_ht: p.formules.confort.prix, remise_pct: 0, periodicite: "mensuel", montant_annuel: null, heures: p.formules.confort.heures, date_signature: aujourdhui(), date_debut: aujourdhui(), engagement_12: true, statut: "actif", commercial_id: null, secretaire_id: null, notes: "" });
  }
  const set = <K extends keyof Abonnement>(k: K, v: Abonnement[K]) => setForm((f) => ({ ...(f || {}), [k]: v }));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  function changerFormule(f: Formule) {
    setForm((x) => {
      const remise = Number(x?.remise_pct) || 0;
      return { ...(x || {}), formule: f, prix_ht: r2(p.formules[f].prix * (1 - remise / 100)), heures: p.formules[f].heures };
    });
  }
  // Remise en % → prix net ; prix net saisi → remise recalculée. Les deux restent cohérents.
  function changerRemise(remise: number) {
    setForm((x) => {
      const f = (x?.formule || "confort") as Formule;
      const pct = Math.min(100, Math.max(0, remise));
      return { ...(x || {}), remise_pct: pct, prix_ht: r2(p.formules[f].prix * (1 - pct / 100)) };
    });
  }
  // FORFAIT ANNUEL payé en une fois : on saisit le montant de l'année,
  // l'équivalent mensuel (prix_ht) et la remise en découlent.
  function changerAnnuel(total: number) {
    setForm((x) => {
      const f = (x?.formule || "confort") as Formule;
      const base = p.formules[f].prix * 12;
      const mensuel = r2(total / 12);
      const pct = base > 0 ? r2(Math.max(0, (1 - total / base) * 100)) : 0;
      return { ...(x || {}), montant_annuel: total, prix_ht: mensuel, remise_pct: pct };
    });
  }
  function changerPeriodicite(per: Abonnement["periodicite"]) {
    setForm((x) => {
      const f = (x?.formule || "confort") as Formule;
      if (per === "annuel") {
        // Proposition par défaut : 10 mois payés pour 12 (≈ 2 mois offerts).
        const total = Number(x?.montant_annuel) || r2(p.formules[f].prix * 10);
        return { ...(x || {}), periodicite: per, montant_annuel: total, prix_ht: r2(total / 12), remise_pct: r2(Math.max(0, (1 - total / (p.formules[f].prix * 12)) * 100)) };
      }
      return { ...(x || {}), periodicite: per, montant_annuel: null, prix_ht: r2(p.formules[f].prix * (1 - (Number(x?.remise_pct) || 0) / 100)) };
    });
  }
  function changerPrix(prix: number) {
    setForm((x) => {
      const f = (x?.formule || "confort") as Formule;
      const base = p.formules[f].prix;
      const pct = base > 0 ? r2(Math.max(0, (1 - prix / base) * 100)) : 0;
      return { ...(x || {}), prix_ht: prix, remise_pct: pct };
    });
  }
  async function enregistrer() {
    if (!form?.garage_nom?.trim()) return alert("Le nom du garage est obligatoire.");
    setSaving(true);
    try {
      const res = await upsertLigne<Abonnement>("abonnements", { ...form, prix_ht: Number(form.prix_ht) || 0, remise_pct: Number(form.remise_pct) || 0, montant_annuel: form.periodicite === "annuel" ? Number(form.montant_annuel) || 0 : null, heures: Number(form.heures) || 0 });
      // Les mensualités du 1er mois à aujourd'hui sont créées d'office (à pointer).
      if (res.row?.id) await genererMensualites(res.row.id);
      setForm(null); load();
    } catch (e) { alert(e instanceof Error ? e.message : "Enregistrement impossible."); }
    finally { setSaving(false); }
  }
  async function supprimer(a: Abonnement) {
    if (!confirm(`Supprimer l'abonnement de ${a.garage_nom} et ses mensualités ?`)) return;
    try { await supprimerLigne("abonnements", a.id); load(); } catch (e) { alert(e instanceof Error ? e.message : "Suppression impossible."); }
  }
  async function pointer(m: Mensualite, payee: boolean) {
    try {
      await upsertLigne<Mensualite>("abonnement_mensualites", { id: m.id, abonnement_id: m.abonnement_id, periode: m.periode, montant_ht: m.montant_ht, payee_le: payee ? aujourdhui() : null });
      setMens((ms) => ms.map((x) => (x.id === m.id ? { ...x, payee_le: payee ? aujourdhui() : null } : x)));
    } catch (e) { alert(e instanceof Error ? e.message : "Pointage impossible."); }
  }
  async function pointerAnnee(a: Abonnement, payee: boolean) {
    const ms = mens.filter((m) => m.abonnement_id === a.id);
    try {
      for (const m of ms) {
        await upsertLigne<Mensualite>("abonnement_mensualites", { id: m.id, abonnement_id: m.abonnement_id, periode: m.periode, montant_ht: m.montant_ht, payee_le: payee ? aujourdhui() : null });
      }
      setMens((all) => all.map((x) => (x.abonnement_id === a.id ? { ...x, payee_le: payee ? aujourdhui() : null } : x)));
    } catch (e) { alert(e instanceof Error ? e.message : "Pointage impossible."); }
  }
  async function completerMois(a: Abonnement) {
    try { const r = await genererMensualites(a.id); alert(`${r.ajoutees} mensualité(s) vérifiée(s).`); load(); } catch (e) { alert(e instanceof Error ? e.message : "Impossible."); }
  }

  const caMensuel = visibles.filter((a) => a.statut === "actif").reduce((s, a) => s + Number(a.prix_ht), 0);
  const impayees = mens.filter((m) => !m.payee_le && new Date(m.periode) <= new Date());

  return (
    <AdminShell titre="Abonnements des garages" actions={<button className="btn-primary" onClick={nouveau}>+ Abonnement</button>}>
      {erreur && <p className="badge badge-danger">{erreur}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titre="Garages actifs" valeur={String(abos.filter((a) => a.statut === "actif").length)} />
        <Kpi titre="CA mensuel récurrent" valeur={euros(caMensuel)} />
        <Kpi titre="Mensualités à encaisser" valeur={euros(impayees.reduce((s, m) => s + Number(m.montant_ht), 0))} sous={`${impayees.length} mois échus non pointés`} />
        <Kpi titre="Engagés 12 mois" valeur={`${abos.filter((a) => a.engagement_12 && a.statut === "actif").length}`} />
      </div>
      <div className="segment">
        <button className={`segment-btn ${filtre === "actif" ? "actif" : ""}`} onClick={() => setFiltre("actif")}>Actifs</button>
        <button className={`segment-btn ${filtre === "tous" ? "actif" : ""}`} onClick={() => setFiltre("tous")}>Tous</button>
      </div>

      <div className="space-y-2">
        {loading && <p className="text-sm text-white/40">Chargement…</p>}
        {!loading && visibles.length === 0 && <p className="text-sm text-white/40">Aucun abonnement.</p>}
        {visibles.map((a) => {
          const ms = mens.filter((m) => m.abonnement_id === a.id).sort((x, y) => x.periode.localeCompare(y.periode));
          const payees = ms.filter((m) => m.payee_le).length;
          const retard = ms.filter((m) => !m.payee_le && new Date(m.periode) <= new Date()).length;
          return (
            <div key={a.id} className="glass-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-white">{a.garage_nom}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="badge badge-info">{p.formules[a.formule].libelle} · {euros(a.prix_ht)}/mois</span>
                    {a.periodicite === "annuel" && <span className="badge badge-ok">forfait annuel {euros(a.montant_annuel)}</span>}
                    {Number(a.remise_pct) > 0 && <span className="badge badge-warn">remise {Number(a.remise_pct)} %</span>}
                    <span className={`badge ${a.statut === "actif" ? "badge-ok" : a.statut === "suspendu" ? "badge-warn" : "badge-neutral"}`}>{a.statut === "actif" ? "Actif" : a.statut === "suspendu" ? "Suspendu" : "Résilié"}</span>
                    {a.engagement_12 && <span className="badge badge-neutral">12 mois</span>}
                    {retard > 0 && <span className="badge badge-danger">{retard} mensualité{retard > 1 ? "s" : ""} en retard</span>}
                  </div>
                  <div className="mt-2 text-xs text-white/60">
                    Signé le {dateFr(a.date_signature)} · {payees} mensualité{payees > 1 ? "s" : ""} payée{payees > 1 ? "s" : ""}
                    {a.commercial_id && <> · Commercial : {nomCollab(parCollab.get(a.commercial_id))}</>}
                    {a.secretaire_id && <> · Secrétaire : {nomCollab(parCollab.get(a.secretaire_id))}</>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  <button className="text-accent-teal hover:underline" onClick={() => setOuvert(ouvert === a.id ? null : a.id)}>{ouvert === a.id ? "Masquer" : "Mensualités"}</button>
                  <button className="text-accent-pink hover:underline" onClick={() => setForm({ ...a })}>Modifier</button>
                  <button className="text-white/40 hover:text-rose-300" onClick={() => supprimer(a)}>Suppr.</button>
                </div>
              </div>
              {ouvert === a.id && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  {a.periodicite === "annuel" && (
                    <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-white/80">
                      <input type="checkbox" checked={ms.length > 0 && ms.every((m) => m.payee_le)} onChange={(e) => pointerAnnee(a, e.target.checked)} />
                      Forfait annuel de {euros(a.montant_annuel)} encaissé (pointe les 12 mois)
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {ms.map((m) => (
                      <label key={m.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-xs ${m.payee_le ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : new Date(m.periode) <= new Date() ? "border-rose-400/40 bg-rose-500/10 text-rose-200" : "border-white/15 text-white/60"}`}>
                        <input type="checkbox" checked={Boolean(m.payee_le)} onChange={(e) => pointer(m, e.target.checked)} />
                        {moisFr(m.periode)} · {euros(m.montant_ht)}
                      </label>
                    ))}
                  </div>
                  <button className="btn-ghost btn-compact mt-2" onClick={() => completerMois(a)}>Ajouter les mois manquants</button>
                  <p className="mt-1 text-[11px] text-white/40">Cochez une mensualité quand elle est encaissée : c&apos;est ce pointage qui déclenche primes et rétrocessions.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {form && (
        <ModalShell title={form.id ? "Modifier l'abonnement" : "Nouvel abonnement"} onClose={() => setForm(null)} maxWidth="max-w-2xl">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChampAdmin label="Garage *"><input className="field-input" value={form.garage_nom || ""} onChange={(e) => set("garage_nom", e.target.value)} /></ChampAdmin>
            <ChampAdmin label="Email du garage"><input className="field-input" type="email" value={form.garage_email || ""} onChange={(e) => set("garage_email", e.target.value)} /></ChampAdmin>
            <ChampAdmin label="Formule"><select className="field-input" value={form.formule} onChange={(e) => changerFormule(e.target.value as Formule)}>{FORMULES.map((f) => <option key={f} value={f}>{p.formules[f].libelle} — {euros(p.formules[f].prix)}</option>)}</select></ChampAdmin>
            <ChampAdmin label="Périodicité de paiement">
              <select className="field-input" value={form.periodicite || "mensuel"} onChange={(e) => changerPeriodicite(e.target.value as Abonnement["periodicite"])}>
                <option value="mensuel">Mensuel</option>
                <option value="annuel">Annuel, payé en une fois</option>
              </select>
            </ChampAdmin>
            {form.periodicite === "annuel" && (
              <ChampAdmin label={`Montant annuel HT payé en une fois — grille ${euros(p.formules[(form.formule || "confort") as Formule].prix * 12)}`}>
                <input className="field-input text-right tabular-nums" type="number" step="1" value={form.montant_annuel ?? ""} onChange={(e) => changerAnnuel(Number(e.target.value) || 0)} />
              </ChampAdmin>
            )}
            <ChampAdmin label={`Remise commerciale (%) — grille ${euros(p.formules[(form.formule || "confort") as Formule].prix)}`}>
              <input className="field-input text-right tabular-nums" type="number" step="0.5" min="0" max="100" value={form.remise_pct ?? 0} disabled={form.periodicite === "annuel"} onChange={(e) => changerRemise(Number(e.target.value) || 0)} />
            </ChampAdmin>
            <ChampAdmin label={form.periodicite === "annuel" ? "Équivalent mensuel HT (calculé)" : "Mensualité HT facturée (remise déduite)"}>
              <input className="field-input text-right tabular-nums" type="number" step="0.01" value={form.prix_ht ?? ""} disabled={form.periodicite === "annuel"} onChange={(e) => changerPrix(Number(e.target.value) || 0)} />
            </ChampAdmin>
            <ChampAdmin label="Date de signature"><input className="field-input" type="date" value={form.date_signature || ""} onChange={(e) => set("date_signature", e.target.value)} /></ChampAdmin>
            <ChampAdmin label="1re mensualité"><input className="field-input" type="date" value={form.date_debut || ""} onChange={(e) => set("date_debut", e.target.value)} /></ChampAdmin>
            <ChampAdmin label="Commercial"><select className="field-input" value={form.commercial_id || ""} onChange={(e) => set("commercial_id", e.target.value || null)}><option value="">— sans commercial —</option>{commerciaux.map((c) => <option key={c.id} value={c.id}>{nomCollab(c)}</option>)}</select></ChampAdmin>
            <ChampAdmin label="Secrétaire"><select className="field-input" value={form.secretaire_id || ""} onChange={(e) => set("secretaire_id", e.target.value || null)}><option value="">— aucune —</option>{secretaires.map((c) => <option key={c.id} value={c.id}>{nomCollab(c)}</option>)}</select></ChampAdmin>
            <ChampAdmin label="Statut"><select className="field-input" value={form.statut} onChange={(e) => set("statut", e.target.value as Abonnement["statut"])}><option value="actif">Actif</option><option value="suspendu">Suspendu</option><option value="resilie">Résilié</option></select></ChampAdmin>
            <ChampAdmin label="Date de fin (si résilié)"><input className="field-input" type="date" value={form.date_fin || ""} onChange={(e) => set("date_fin", e.target.value)} /></ChampAdmin>
          </div>
          {form.periodicite === "annuel" && (
            <p className="mt-2 text-xs text-white/60">
              Forfait annuel : les 12 mois sont créés d&apos;avance ; cocher « encaissé » les pointe tous d&apos;un coup, ce qui déclenche immédiatement la prime du commercial (le garage a payé l&apos;année).
            </p>
          )}
          {Number(form.remise_pct) > 0 && (
            <p className="mt-2 text-xs text-amber-200/80">
              Avec {Number(form.remise_pct)} % de remise, la prime du commercial est réduite dans la même proportion
              (plancher ESSENTIEL conservé) ; la rétrocession de la secrétaire est calculée sur le montant réellement facturé.
            </p>
          )}
          <label className="mt-3 flex items-center gap-2 text-sm text-white/80"><input type="checkbox" checked={Boolean(form.engagement_12)} onChange={(e) => set("engagement_12", e.target.checked)} />Engagement 12 mois (mise en service offerte, bonus commercial)</label>
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

function Kpi({ titre, valeur, sous }: { titre: string; valeur: string; sous?: string }) {
  return (
    <div className="glass-card p-3 sm:p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{titre}</div>
      <div className="valeur-hud mt-1 font-bold text-white">{valeur}</div>
      {sous && <div className="mt-1 text-[11px] text-white/45">{sous}</div>}
    </div>
  );
}
