"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Client } from "@/lib/types";
import RechercheSiren from "@/components/RechercheSiren";
import ModalShell from "@/components/ModalShell";
import CarteContact, { LigneContact, formaterTel, lienCarte, lienTelephone } from "@/components/annuaire/CarteContact";
import { BarreAnnuaire, GrilleContacts, type TriAnnuaire } from "@/components/annuaire/GrilleContacts";

const EMPTY = { nom: "", email: "", telephone: "", adresse: "", code_postal: "", ville: "", siren: "", notes: "" };
type FormC = typeof EMPTY;

export default function ClientsView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormC>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [tri, setTri] = useState<TriAnnuaire>("az");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (data) setClients(data as Client[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: keyof FormC, v: string) => setForm((f) => ({ ...f, [k]: v }));
  function ouvrirAjout() { setEditingId(null); setForm({ ...EMPTY }); setShowForm(true); }
  function ouvrirEdition(c: Client) {
    setEditingId(c.id);
    setForm({
      nom: c.nom ?? "", email: c.email ?? "", telephone: c.telephone ?? "",
      adresse: c.adresse ?? "", code_postal: c.code_postal ?? "", ville: c.ville ?? "", siren: c.siren ?? "", notes: c.notes ?? "",
    });
    setShowForm(true);
  }
  async function enregistrer() {
    if (!form.nom.trim()) return;
    setSaving(true);
    if (editingId) await supabase.from("clients").update(form).eq("id", editingId);
    else await supabase.from("clients").insert({ ...form, source: "manuel" });
    setForm({ ...EMPTY }); setEditingId(null); setShowForm(false); setSaving(false); load();
  }
  async function supprimer(id: string) {
    if (!confirm("Supprimer ce client ?")) return;
    await supabase.from("clients").delete().eq("id", id); load();
  }

  const term = q.trim().toLowerCase();
  const filtered = term
    ? clients.filter((c) => [c.nom, c.email, c.telephone, c.ville].filter(Boolean).some((v) => (v as string).toLowerCase().includes(term)))
    : clients;

  return (
    <div>
      <BarreAnnuaire
        q={q}
        onQ={setQ}
        placeholder="Rechercher un client : nom, e-mail, téléphone, ville…"
        tri={tri}
        onTri={setTri}
        total={clients.length}
        visibles={filtered.length}
        actions={<button onClick={ouvrirAjout} className="btn-primary whitespace-nowrap">+ Client</button>}
      />

      {showForm && (
        <ModalShell title={editingId ? "Modifier le client" : "Nouveau client"} onClose={() => { setShowForm(false); setEditingId(null); }} maxWidth="max-w-2xl">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="field-label !mb-0.5">Nom et prénom *</label><input className="field-input" value={form.nom} onChange={(e) => set("nom", e.target.value)} /></div>
            <div><label className="field-label !mb-0.5">E-mail</label><input className="field-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div><label className="field-label !mb-0.5">Téléphone</label><input className="field-input" type="tel" value={form.telephone} onChange={(e) => set("telephone", e.target.value)} /></div>
            <div className="sm:col-span-2"><label className="field-label !mb-0.5">Adresse</label><input className="field-input" value={form.adresse} onChange={(e) => set("adresse", e.target.value)} /></div>
            <div className="grid grid-cols-[7rem_1fr] gap-2 sm:col-span-2">
              <div><label className="field-label !mb-0.5">Code postal</label><input className="field-input" value={form.code_postal} onChange={(e) => set("code_postal", e.target.value)} /></div>
              <div><label className="field-label !mb-0.5">Ville</label><input className="field-input" value={form.ville} onChange={(e) => set("ville", e.target.value)} /></div>
            </div>
            <div className="sm:col-span-2">
              <label className="field-label !mb-0.5">SIREN (si professionnel)</label>
              <div className="flex gap-2">
                <input className="field-input" value={form.siren} onChange={(e) => set("siren", e.target.value)} />
                <RechercheSiren nom={form.nom} onChoisir={(r) => setForm((f) => ({ ...f, siren: r.siren, adresse: f.adresse || r.adresse, code_postal: f.code_postal || r.codePostal, ville: f.ville || r.ville }))} />
              </div>
            </div>
            <div className="sm:col-span-2"><label className="field-label !mb-0.5">Commentaire</label><textarea className="field-input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes internes…" /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-ghost w-full sm:w-auto">Annuler</button>
            <button onClick={enregistrer} disabled={saving || !form.nom.trim()} className="btn-primary w-full sm:w-auto">{saving ? "Enregistrement…" : editingId ? "Enregistrer" : "Ajouter"}</button>
          </div>
        </ModalShell>
      )}

      <GrilleContacts
        lignes={filtered}
        nomDe={(c) => c.nom}
        tri={tri}
        loading={loading}
        vide={
          term ? (
            <>Aucun client ne correspond à « <strong>{q.trim()}</strong> ».</>
          ) : (
            <><strong>Aucun client pour l&apos;instant.</strong><br />Ils s&apos;ajoutent automatiquement à la création d&apos;un dossier — ou avec le bouton « + Client ».</>
          )
        }
        rendre={(c) => (
          <CarteContact
            key={c.id}
            famille="client"
            nom={c.nom}
            sousTitre={c.siren ? `Professionnel · SIREN ${c.siren}` : "Particulier"}
            lignes={
              <>
                <LigneContact ico="📞" href={lienTelephone(c.telephone)}>{c.telephone ? formaterTel(c.telephone) : null}</LigneContact>
                <LigneContact ico="✉️" href={c.email ? `mailto:${c.email}` : null}>{c.email}</LigneContact>
                <LigneContact ico="📍" href={lienCarte(c.adresse, c.code_postal, c.ville)} externe>{[c.adresse, [c.code_postal, c.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null}</LigneContact>
              </>
            }
            note={c.notes}
            etiquettes={<span className="etiquette-contact">{c.source === "auto" ? "Créé depuis un dossier" : "Saisi à la main"}</span>}
            onModifier={() => ouvrirEdition(c)}
            onSupprimer={() => supprimer(c.id)}
          />
        )}
      />
    </div>
  );
}
