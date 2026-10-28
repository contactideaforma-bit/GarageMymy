"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { messageErreur } from "@/lib/format";
import { Expert } from "@/lib/types";
import BandeauReferencementExperts from "@/components/experts/BandeauReferencementExperts";
import ModalShell from "@/components/ModalShell";
import CarteContact, { LigneContact, formaterTel, lienCarte, lienTelephone } from "@/components/annuaire/CarteContact";
import { BarreAnnuaire, GrilleContacts, type TriAnnuaire } from "@/components/annuaire/GrilleContacts";
import Ico from "@/components/Ico";

const EMPTY = {
  cabinet: "", adresse: "", code_postal: "", ville: "", tel: "", email: "",
  expert_nom: "", expert_tel: "", expert_email: "", notes: "",
};
type FormE = typeof EMPTY;

export default function ExpertsView() {
  const [rows, setRows] = useState<Expert[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormE>({ ...EMPTY });
  const [tri, setTri] = useState<TriAnnuaire>("az");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("experts").select("*").order("created_at", { ascending: false });
    if (data) setRows(data as Expert[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: keyof FormE, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function ouvrirAjout() { setEditingId(null); setForm({ ...EMPTY }); setShowForm(true); }
  function ouvrirEdition(r: Expert) {
    setEditingId(r.id);
    setForm({
      cabinet: r.cabinet ?? "", adresse: r.adresse ?? "", code_postal: r.code_postal ?? "",
      ville: r.ville ?? "", tel: r.tel ?? "", email: r.email ?? "",
      expert_nom: r.expert_nom ?? "", expert_tel: r.expert_tel ?? "", expert_email: r.expert_email ?? "",
      notes: r.notes ?? "",
    });
    setShowForm(true);
  }
  async function enregistrer() {
    if (!form.cabinet.trim() || saving) return; // garde anti double-clic (sinon 2 fiches identiques)
    setSaving(true);
    const { error } = editingId
      ? await supabase.from("experts").update(form).eq("id", editingId)
      : await supabase.from("experts").insert({ ...form, source: "manuel" });
    setSaving(false);
    if (error) return alert(messageErreur(error, "Enregistrement impossible."));
    setShowForm(false); setEditingId(null); setForm({ ...EMPTY }); load();
  }
  async function supprimer(id: string) {
    if (!confirm("Supprimer ce cabinet ?")) return;
    const { error } = await supabase.from("experts").delete().eq("id", id);
    if (error) return alert(messageErreur(error, "Suppression impossible."));
    load();
  }

  const term = q.trim().toLowerCase();
  const filtered = term
    ? rows.filter((r) => [r.cabinet, r.expert_nom, r.ville, r.email].filter(Boolean).some((v) => (v as string).toLowerCase().includes(term)))
    : rows;

  return (
    <div>
      {/* v13.40 — se faire référencer auprès de tous les cabinets */}
      <BandeauReferencementExperts experts={rows} onChange={load} />

      <BarreAnnuaire
        q={q}
        onQ={setQ}
        placeholder="Rechercher un cabinet, un expert, une ville…"
        tri={tri}
        onTri={setTri}
        total={rows.length}
        visibles={filtered.length}
        actions={<button onClick={ouvrirAjout} className="btn-primary whitespace-nowrap">+ Cabinet</button>}
      />

      {showForm && (
        <ModalShell title={editingId ? "Modifier le cabinet" : "Nouveau cabinet"} onClose={() => { setShowForm(false); setEditingId(null); }} maxWidth="max-w-2xl">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="field-label !mb-0.5">Cabinet *</label><input className="field-input" value={form.cabinet} onChange={(e) => set("cabinet", e.target.value)} /></div>
            <div><label className="field-label !mb-0.5">Téléphone du cabinet</label><input className="field-input" type="tel" value={form.tel} onChange={(e) => set("tel", e.target.value)} /></div>
            <div><label className="field-label !mb-0.5">E-mail du cabinet</label><input className="field-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div className="sm:col-span-2"><label className="field-label !mb-0.5">Adresse</label><input className="field-input" value={form.adresse} onChange={(e) => set("adresse", e.target.value)} /></div>
            <div className="grid grid-cols-[7rem_1fr] gap-2 sm:col-span-2">
              <div><label className="field-label !mb-0.5">Code postal</label><input className="field-input" value={form.code_postal} onChange={(e) => set("code_postal", e.target.value)} /></div>
              <div><label className="field-label !mb-0.5">Ville</label><input className="field-input" value={form.ville} onChange={(e) => set("ville", e.target.value)} /></div>
            </div>
            <div className="sm:col-span-2 mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--mea-texte-3)" }}>Expert référent</div>
            <div className="sm:col-span-2"><label className="field-label !mb-0.5">Nom de l&apos;expert</label><input className="field-input" value={form.expert_nom} onChange={(e) => set("expert_nom", e.target.value)} /></div>
            <div><label className="field-label !mb-0.5">Téléphone de l&apos;expert</label><input className="field-input" type="tel" value={form.expert_tel} onChange={(e) => set("expert_tel", e.target.value)} /></div>
            <div><label className="field-label !mb-0.5">E-mail de l&apos;expert</label><input className="field-input" type="email" value={form.expert_email} onChange={(e) => set("expert_email", e.target.value)} /></div>
            <div className="sm:col-span-2"><label className="field-label !mb-0.5">Commentaire</label><textarea className="field-input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-ghost w-full sm:w-auto">Annuler</button>
            <button onClick={enregistrer} disabled={saving || !form.cabinet.trim()} className="btn-primary w-full sm:w-auto">{saving ? "Enregistrement…" : editingId ? "Enregistrer" : "Ajouter"}</button>
          </div>
        </ModalShell>
      )}

      <GrilleContacts
        lignes={filtered}
        nomDe={(r) => r.cabinet}
        tri={tri}
        loading={loading}
        vide={
          term ? (
            <>Aucun cabinet ne correspond à « <strong>{q.trim()}</strong> ».</>
          ) : (
            <><strong>Aucun cabinet d&apos;expertise pour l&apos;instant.</strong><br />Ils s&apos;ajoutent automatiquement à l&apos;import d&apos;un rapport — ou avec le bouton « + Cabinet ».</>
          )
        }
        rendre={(r) => (
          <CarteContact
            key={r.id}
            famille="expert"
            nom={r.cabinet}
            sousTitre={r.expert_nom ? <>Expert : <span style={{ color: "var(--mea-texte-2)" }}>{r.expert_nom}</span></> : "Expert non renseigné"}
            lignes={
              <>
                <LigneContact ico="phone" href={lienTelephone(r.tel || r.expert_tel)}>{r.tel ? formaterTel(r.tel) : r.expert_tel ? `${formaterTel(r.expert_tel)} (expert)` : null}</LigneContact>
                <LigneContact ico="mail" href={r.email || r.expert_email ? `mailto:${r.email || r.expert_email}` : null}>{r.email || r.expert_email}</LigneContact>
                {r.expert_nom && (r.expert_tel || r.expert_email) && (r.tel || r.email) && (
                  <LigneContact ico="user" href={r.expert_tel ? lienTelephone(r.expert_tel) : r.expert_email ? `mailto:${r.expert_email}` : null}>
                    {[r.expert_tel ? formaterTel(r.expert_tel) : null, r.expert_email].filter(Boolean).join(" · ")}
                  </LigneContact>
                )}
                <LigneContact ico="map-pin" href={lienCarte(r.adresse, r.code_postal, r.ville)} externe>{[r.adresse, [r.code_postal, r.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null}</LigneContact>
              </>
            }
            note={r.notes}
            etiquettes={
              <>
                <span className="etiquette-contact">{r.source === "auto" ? "Créé depuis un dossier" : r.source === "mutualise" ? "Base mutualisée" : "Saisi à la main"}</span>
                {r.declaration_envoyee_le ? (
                  <span className="etiquette-contact ok" title="Déclaration du garage envoyée à ce cabinet"><Ico n="check" /> Référencé le {new Date(r.declaration_envoyee_le).toLocaleDateString("fr-FR")}</span>
                ) : (
                  <span className="etiquette-contact warn" title="Ce cabinet n'a pas encore reçu la déclaration du garage">Pas encore référencé</span>
                )}
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
