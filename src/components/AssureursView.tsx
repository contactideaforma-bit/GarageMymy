"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { messageErreur } from "@/lib/format";
import { Assureur } from "@/lib/types";
import RechercheSiren, { rechercherSiren, ResultatSiren } from "@/components/RechercheSiren";

const EMPTY = { nom: "", adresse: "", code_postal: "", ville: "", tel: "", email: "", siren: "", notes: "" };
type FormA = typeof EMPTY;

export default function AssureursView() {
  const [rows, setRows] = useState<Assureur[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormA>({ ...EMPTY });
  // v52 — complétion automatique des SIREN manquants : propositions à valider.
  const [propositions, setPropositions] = useState<Record<string, ResultatSiren | null>>({});
  const [completing, setCompleting] = useState(false);

  /** Remplit le formulaire depuis un résultat de l'annuaire (jamais d'écrasement). */
  function appliquerSiren(r: ResultatSiren) {
    setForm((f) => ({
      ...f,
      siren: r.siren,
      adresse: f.adresse || r.adresse,
      code_postal: f.code_postal || r.codePostal,
      ville: f.ville || r.ville,
    }));
  }

  /** Cherche, pour chaque assureur sans SIREN, la meilleure correspondance. */
  async function completerSirens() {
    const manquants = rows.filter((r) => !r.siren && r.nom);
    if (!manquants.length) return alert("Tous les assureurs ont déjà un SIREN.");
    setCompleting(true);
    const props: Record<string, ResultatSiren | null> = {};
    for (const a of manquants) {
      const { resultats } = await rechercherSiren(a.nom!);
      // Premier résultat ACTIF dont le nom contient le premier mot saisi (ex. « AXA »).
      const mot = (a.nom || "").split(/\s+/)[0]?.toLowerCase() || "";
      props[a.id] = resultats.find((r) => r.actif && r.nom.toLowerCase().includes(mot)) || resultats[0] || null;
    }
    setPropositions(props);
    setCompleting(false);
  }

  async function validerProposition(a: Assureur, r: ResultatSiren) {
    const maj: Record<string, string> = { siren: r.siren };
    if (!a.adresse && r.adresse) maj.adresse = r.adresse;
    if (!a.code_postal && r.codePostal) maj.code_postal = r.codePostal;
    if (!a.ville && r.ville) maj.ville = r.ville;
    const { error } = await supabase.from("assureurs").update(maj).eq("id", a.id);
    if (error) return alert(messageErreur(error, "Enregistrement impossible."));
    setPropositions((p) => { const n = { ...p }; delete n[a.id]; return n; });
    load();
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("assureurs").select("*").order("created_at", { ascending: false });
    if (data) setRows(data as Assureur[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: keyof FormA, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function ouvrirAjout() { setEditingId(null); setForm({ ...EMPTY }); setShowForm(true); }
  function ouvrirEdition(r: Assureur) {
    setEditingId(r.id);
    setForm({
      nom: r.nom ?? "", adresse: r.adresse ?? "", code_postal: r.code_postal ?? "",
      ville: r.ville ?? "", tel: r.tel ?? "", email: r.email ?? "", siren: r.siren ?? "", notes: r.notes ?? "",
    });
    setShowForm(true);
  }
  async function enregistrer() {
    if (!form.nom.trim() || saving) return; // garde anti double-clic (sinon 2 fiches identiques)
    setSaving(true);
    const { error } = editingId
      ? await supabase.from("assureurs").update(form).eq("id", editingId)
      : await supabase.from("assureurs").insert({ ...form, source: "manuel" });
    setSaving(false);
    if (error) return alert(messageErreur(error, "Enregistrement impossible."));
    setShowForm(false); setEditingId(null); setForm({ ...EMPTY }); load();
  }
  async function supprimer(id: string) {
    if (!confirm("Supprimer cet assureur ?")) return;
    const { error } = await supabase.from("assureurs").delete().eq("id", id);
    if (error) return alert(messageErreur(error, "Suppression impossible."));
    load();
  }

  const term = q.trim().toLowerCase();
  const filtered = term
    ? rows.filter((r) => [r.nom, r.ville, r.email].filter(Boolean).some((v) => (v as string).toLowerCase().includes(term)))
    : rows;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <input className="field-input max-w-sm" placeholder="Rechercher un assureur…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-2">
          <button
            onClick={completerSirens}
            disabled={completing}
            className="btn-ghost"
            title="Cherche dans l'annuaire officiel le SIREN de chaque assureur qui n'en a pas encore"
          >
            {completing ? "Recherche…" : "Compléter les SIREN"}
          </button>
          <button onClick={ouvrirAjout} className="btn-primary">+ Assureur</button>
        </div>
      </div>

      {Object.keys(propositions).length > 0 && (
        <div className="glass-card p-5 mb-5">
          <h3 className="font-semibold text-white mb-1">SIREN proposés — à valider</h3>
          <p className="text-xs text-white/50 mb-3">
            Vérifiez que la société correspond bien (les assureurs ont souvent plusieurs entités : IARD, Vie, Assistance…).
          </p>
          <ul className="space-y-2">
            {rows.filter((a) => a.id in propositions).map((a) => {
              const r = propositions[a.id];
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{a.nom}</div>
                    {r ? (
                      <div className="truncate text-xs text-white/60">
                        → {r.nom} · <span className="font-mono text-accent-teal">{r.siren}</span>
                        {r.ville ? ` · ${r.ville}` : ""}
                      </div>
                    ) : (
                      <div className="text-xs text-amber-300">Aucune correspondance — utilisez « Modifier » puis 🔍 SIREN.</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {r && <button className="btn-primary btn-compact" onClick={() => validerProposition(a, r)}>Valider</button>}
                    <button className="btn-ghost btn-compact" onClick={() => setPropositions((p) => { const n = { ...p }; delete n[a.id]; return n; })}>Ignorer</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showForm && (
        <div className="glass-card p-5 mb-5">
          <h3 className="font-semibold text-white mb-3">{editingId ? "Modifier l'assureur" : "Nouvel assureur"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input className="field-input" placeholder="Nom *" value={form.nom} onChange={(e) => set("nom", e.target.value)} />
            <input className="field-input" placeholder="Téléphone" value={form.tel} onChange={(e) => set("tel", e.target.value)} />
            <input className="field-input" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            <input className="field-input" placeholder="Adresse" value={form.adresse} onChange={(e) => set("adresse", e.target.value)} />
            <input className="field-input" placeholder="Code postal" value={form.code_postal} onChange={(e) => set("code_postal", e.target.value)} />
            <input className="field-input" placeholder="Ville" value={form.ville} onChange={(e) => set("ville", e.target.value)} />
            <div className="flex gap-2">
              <input className="field-input" placeholder="SIREN (facture électronique, 9 chiffres)" value={form.siren} onChange={(e) => set("siren", e.target.value)} />
              <RechercheSiren nom={form.nom} onChoisir={appliquerSiren} />
            </div>
          </div>
          <textarea className="field-input mt-3" rows={2} placeholder="Commentaire" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-ghost">Annuler</button>
            <button onClick={enregistrer} disabled={saving} className="btn-primary">{saving ? "Enregistrement…" : editingId ? "Enregistrer" : "Ajouter"}</button>
          </div>
        </div>
      )}

      {/* v52 : tableau à colonnes FIXES (le SIREN avait poussé les actions hors
          cadre). Email / téléphone / origine masqués sur écran étroit. */}
      <div className="glass-card overflow-x-auto">
        <table className="w-full min-w-[44rem] table-fixed text-sm">
          <colgroup>
            <col className="w-[34%] md:w-[26%]" />
            <col className="hidden w-[13%] md:table-column" />
            <col className="hidden w-[20%] lg:table-column" />
            <col className="w-[22%] md:w-[15%]" />
            <col className="w-[24%] md:w-[13%]" />
            <col className="hidden w-[9%] md:table-column" />
            <col className="w-[20%] md:w-[13%]" />
          </colgroup>
          <thead className="text-left text-white/50">
            <tr>
              <th className="cellule font-medium">Assureur</th>
              <th className="cellule hidden font-medium md:table-cell">Téléphone</th>
              <th className="cellule hidden font-medium lg:table-cell">Email</th>
              <th className="cellule font-medium">Ville</th>
              <th className="cellule font-medium">SIREN</th>
              <th className="cellule hidden font-medium md:table-cell">Origine</th>
              <th className="cellule text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-white/40">Aucun assureur. Ils s&apos;ajoutent automatiquement depuis les dossiers.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="cellule font-medium text-white">
                  <div className="truncate" title={r.nom || ""}>{r.nom || "—"}</div>
                  <div className="truncate text-[11px] font-normal text-white/45 md:hidden">{r.tel || ""}</div>
                </td>
                <td className="cellule hidden truncate text-white/80 md:table-cell">{r.tel || "—"}</td>
                <td className="cellule hidden truncate text-white/80 lg:table-cell" title={r.email || ""}>{r.email || "—"}</td>
                <td className="cellule truncate text-white/80" title={r.ville || ""}>{r.ville || "—"}</td>
                <td className="cellule font-mono text-xs">
                  {r.siren ? <span className="text-white/80">{r.siren}</span> : <span className="badge badge-warn">manquant</span>}
                </td>
                <td className="cellule hidden md:table-cell">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${r.source === "auto" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"}`}>
                    {r.source === "auto" ? "Auto" : "Manuel"}
                  </span>
                </td>
                <td className="cellule text-right whitespace-nowrap">
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
