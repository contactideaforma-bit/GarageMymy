"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { messageErreur } from "@/lib/format";
import { Assureur } from "@/lib/types";
import RechercheSiren, { rechercherSiren, ResultatSiren } from "@/components/RechercheSiren";
import ModalShell from "@/components/ModalShell";
import CarteContact, { LigneContact, formaterTel, lienCarte, lienTelephone } from "@/components/annuaire/CarteContact";
import { BarreAnnuaire, GrilleContacts, type TriAnnuaire } from "@/components/annuaire/GrilleContacts";

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
  const [tri, setTri] = useState<TriAnnuaire>("az");
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
      <BarreAnnuaire
        q={q}
        onQ={setQ}
        placeholder="Rechercher un assureur, une ville…"
        tri={tri}
        onTri={setTri}
        total={rows.length}
        visibles={filtered.length}
        actions={
          <>
            <button onClick={completerSirens} disabled={completing} className="btn-ghost whitespace-nowrap" title="Cherche dans l'annuaire officiel le SIREN de chaque assureur qui n'en a pas encore">
              {completing ? "Recherche…" : "Compléter les SIREN"}
            </button>
            <button onClick={ouvrirAjout} className="btn-primary whitespace-nowrap">+ Assureur</button>
          </>
        }
      />

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
        <ModalShell title={editingId ? "Modifier l'assureur" : "Nouvel assureur"} onClose={() => { setShowForm(false); setEditingId(null); }} maxWidth="max-w-2xl">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="field-label !mb-0.5">Nom *</label><input className="field-input" value={form.nom} onChange={(e) => set("nom", e.target.value)} /></div>
            <div><label className="field-label !mb-0.5">Téléphone</label><input className="field-input" type="tel" value={form.tel} onChange={(e) => set("tel", e.target.value)} /></div>
            <div><label className="field-label !mb-0.5">E-mail</label><input className="field-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div className="sm:col-span-2"><label className="field-label !mb-0.5">Adresse</label><input className="field-input" value={form.adresse} onChange={(e) => set("adresse", e.target.value)} /></div>
            <div className="grid grid-cols-[7rem_1fr] gap-2 sm:col-span-2">
              <div><label className="field-label !mb-0.5">Code postal</label><input className="field-input" value={form.code_postal} onChange={(e) => set("code_postal", e.target.value)} /></div>
              <div><label className="field-label !mb-0.5">Ville</label><input className="field-input" value={form.ville} onChange={(e) => set("ville", e.target.value)} /></div>
            </div>
            <div className="sm:col-span-2">
              <label className="field-label !mb-0.5">SIREN (facture électronique, 9 chiffres)</label>
              <div className="flex gap-2">
                <input className="field-input" value={form.siren} onChange={(e) => set("siren", e.target.value)} />
                <RechercheSiren nom={form.nom} onChoisir={appliquerSiren} />
              </div>
            </div>
            <div className="sm:col-span-2"><label className="field-label !mb-0.5">Commentaire</label><textarea className="field-input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-ghost w-full sm:w-auto">Annuler</button>
            <button onClick={enregistrer} disabled={saving || !form.nom.trim()} className="btn-primary w-full sm:w-auto">{saving ? "Enregistrement…" : editingId ? "Enregistrer" : "Ajouter"}</button>
          </div>
        </ModalShell>
      )}

      <GrilleContacts
        lignes={filtered}
        nomDe={(r) => r.nom}
        tri={tri}
        loading={loading}
        vide={
          term ? (
            <>Aucun assureur ne correspond à « <strong>{q.trim()}</strong> ».</>
          ) : (
            <><strong>Aucun assureur pour l&apos;instant.</strong><br />Ils s&apos;ajoutent automatiquement à l&apos;import d&apos;un rapport — ou avec le bouton « + Assureur ».</>
          )
        }
        rendre={(r) => (
          <CarteContact
            key={r.id}
            famille="assureur"
            nom={r.nom}
            sousTitre={r.siren ? <>SIREN <span className="font-mono" style={{ color: "var(--mea-texte-2)" }}>{r.siren}</span></> : "SIREN à compléter"}
            lignes={
              <>
                <LigneContact ico="📞" href={lienTelephone(r.tel)}>{r.tel ? formaterTel(r.tel) : null}</LigneContact>
                <LigneContact ico="✉️" href={r.email ? `mailto:${r.email}` : null}>{r.email}</LigneContact>
                <LigneContact ico="📍" href={lienCarte(r.adresse, r.code_postal, r.ville)} externe>{[r.adresse, [r.code_postal, r.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null}</LigneContact>
              </>
            }
            note={r.notes}
            etiquettes={
              <>
                <span className="etiquette-contact">{r.source === "auto" ? "Créé depuis un dossier" : "Saisi à la main"}</span>
                {!r.siren && <span className="etiquette-contact warn" title="Nécessaire pour la facture électronique">SIREN manquant</span>}
              </>
            }
            onModifier={() => ouvrirEdition(r)}
            onSupprimer={() => supprimer(r.id)}
          />
        )}
      />
    </div>
  );
}
