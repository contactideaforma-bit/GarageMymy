"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dossier } from "@/lib/types";
import { STATUTS_ORDRE, STATUTS_INFO } from "@/lib/format";
import {
  computeTotaux,
  genNumero,
  normaliseLignes,
  LigneExtraite,
  LigneNum,
} from "@/lib/documents";

type FormState = {
  immatriculation: string;
  marque_modele: string;
  numero_serie: string;
  premiere_circulation: string;
  date_sinistre: string;
  numero_sinistre: string;
  cabinet_expert: string;
  date_expertise: string;
  numero_police: string;
  assureur: string;
  cabinet_adresse: string;
  cabinet_tel: string;
  cabinet_email: string;
  expert_nom: string;
  expert_tel: string;
  expert_email: string;
  assureur_adresse: string;
  assureur_tel: string;
  assureur_email: string;
  client_nom: string;
  client_adresse: string;
  client_code_postal: string;
  client_ville: string;
  reparation_debut: string;
  reparation_fin: string;
  reparateur: string;
  montant: string;
  statut: string;
};

function toForm(d?: Partial<Dossier> | null): FormState {
  return {
    immatriculation: d?.immatriculation ?? "",
    marque_modele: d?.marque_modele ?? "",
    numero_serie: d?.numero_serie ?? "",
    premiere_circulation: d?.premiere_circulation ?? "",
    date_sinistre: d?.date_sinistre ?? "",
    numero_sinistre: d?.numero_sinistre ?? "",
    cabinet_expert: d?.cabinet_expert ?? "",
    date_expertise: d?.date_expertise ?? "",
    numero_police: d?.numero_police ?? "",
    assureur: d?.assureur ?? "",
    cabinet_adresse: d?.cabinet_adresse ?? "",
    cabinet_tel: d?.cabinet_tel ?? "",
    cabinet_email: d?.cabinet_email ?? "",
    expert_nom: d?.expert_nom ?? "",
    expert_tel: d?.expert_tel ?? "",
    expert_email: d?.expert_email ?? "",
    assureur_adresse: d?.assureur_adresse ?? "",
    assureur_tel: d?.assureur_tel ?? "",
    assureur_email: d?.assureur_email ?? "",
    client_nom: d?.client_nom ?? "",
    client_adresse: d?.client_adresse ?? "",
    client_code_postal: d?.client_code_postal ?? "",
    client_ville: d?.client_ville ?? "",
    reparation_debut: d?.reparation_debut ?? "",
    reparation_fin: d?.reparation_fin ?? "",
    reparateur: d?.reparateur ?? "",
    montant: d?.montant != null ? String(d.montant) : "",
    statut: d?.statut ?? "nouveau",
  };
}

function Field({
  label, name, value, onChange, type = "text",
}: {
  label: string;
  name: keyof FormState;
  value: string;
  onChange: (name: keyof FormState, value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input type={type} className="field-input" value={value} onChange={(e) => onChange(name, e.target.value)} />
    </div>
  );
}

export default function DossierForm({
  onClose,
  onSaved,
  dossier,
  prefill,
  prefillFile,
  prefillLignes,
  prefillTva,
}: {
  onClose: () => void;
  onSaved: () => void;
  dossier?: Dossier | null;
  prefill?: Partial<Dossier> | null;
  prefillFile?: File | null;
  prefillLignes?: LigneExtraite[] | null;
  prefillTva?: number | null;
}) {
  const isEdit = Boolean(dossier);
  const [form, setForm] = useState<FormState>(toForm(dossier ?? prefill));
  const [file, setFile] = useState<File | null>(prefillFile ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);

  // Lignes du chiffrage extraites du rapport → devis/facture auto
  const [autoLignes, setAutoLignes] = useState<LigneExtraite[]>(prefillLignes ?? []);
  const [autoTva, setAutoTva] = useState<number>(prefillTva ?? 20);
  const [analysed, setAnalysed] = useState<boolean>(Boolean(prefillLignes));

  async function creerDocument(
    type: "devis" | "facture",
    dossierId: string,
    lignes: LigneNum[],
    tvaTaux: number
  ) {
    const totaux = computeTotaux(lignes, tvaTaux);
    const { data } = await supabase
      .from("documents")
      .insert({
        dossier_id: dossierId,
        type,
        numero: genNumero(type),
        date_document: new Date().toISOString().slice(0, 10),
        statut: "brouillon",
        tva: tvaTaux,
        total_ht: totaux.ht,
        total_tva: totaux.tva,
        total_ttc: totaux.ttc,
      })
      .select("id")
      .single();
    if (!data) return;
    const rows = lignes.map((l, i) => ({
      document_id: data.id as string,
      designation: l.designation,
      quantite: l.quantite,
      prix_unitaire: l.prix_unitaire,
      ordre: i,
    }));
    if (rows.length) await supabase.from("document_lignes").insert(rows);
  }

  const set = (name: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [name]: value }));

  async function analyser() {
    if (!file) return;
    setAnalyzing(true);
    setAnalyzeMsg(null);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-rapport", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec de l'analyse.");
      const d = json.data as Partial<Dossier> & {
        lignes?: LigneExtraite[];
        tva?: number | null;
      };
      // ne remplit que les champs renvoyés (sans écraser par du vide)
      setForm((f) => {
        const next = { ...f };
        (Object.keys(toForm(d)) as (keyof FormState)[]).forEach((k) => {
          const v = (d as Record<string, unknown>)[k as string];
          if (v !== null && v !== undefined && v !== "") {
            next[k] = String(v);
          }
        });
        return next;
      });
      setAutoLignes(Array.isArray(d.lignes) ? d.lignes : []);
      if (d.tva) setAutoTva(Number(d.tva) || 20);
      setAnalysed(true);
      setAnalyzeMsg(
        "✓ Dossier pré-rempli. Un devis et une facture seront générés automatiquement à l'enregistrement."
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur d'analyse.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let rapport_path = dossier?.rapport_path ?? null;
      let rapport_nom = dossier?.rapport_nom ?? null;

      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from("rapports").upload(path, file);
        if (upErr) throw upErr;
        rapport_path = path;
        rapport_nom = file.name;
      }

      const payload = {
        immatriculation: form.immatriculation || null,
        marque_modele: form.marque_modele || null,
        numero_serie: form.numero_serie || null,
        premiere_circulation: form.premiere_circulation || null,
        date_sinistre: form.date_sinistre || null,
        numero_sinistre: form.numero_sinistre || null,
        cabinet_expert: form.cabinet_expert || null,
        date_expertise: form.date_expertise || null,
        numero_police: form.numero_police || null,
        assureur: form.assureur || null,
        cabinet_adresse: form.cabinet_adresse || null,
        cabinet_tel: form.cabinet_tel || null,
        cabinet_email: form.cabinet_email || null,
        expert_nom: form.expert_nom || null,
        expert_tel: form.expert_tel || null,
        expert_email: form.expert_email || null,
        assureur_adresse: form.assureur_adresse || null,
        assureur_tel: form.assureur_tel || null,
        assureur_email: form.assureur_email || null,
        client_nom: form.client_nom || null,
        client_adresse: form.client_adresse || null,
        client_code_postal: form.client_code_postal || null,
        client_ville: form.client_ville || null,
        reparation_debut: form.reparation_debut || null,
        reparation_fin: form.reparation_fin || null,
        reparateur: form.reparateur || null,
        montant: form.montant ? Number(form.montant) : 0,
        statut: form.statut,
        rapport_path,
        rapport_nom,
      };

      if (isEdit && dossier) {
        const { error: updErr } = await supabase.from("dossiers").update(payload).eq("id", dossier.id);
        if (updErr) throw updErr;
      } else {
        const { data: created, error: insErr } = await supabase
          .from("dossiers")
          .insert(payload)
          .select("id")
          .single();
        if (insErr) throw insErr;
        const newId = created?.id as string | undefined;

        // Alimente automatiquement la base Clients (sans doublon nom+CP)
        if (form.client_nom) {
          const { data: existing } = await supabase
            .from("clients")
            .select("id")
            .eq("nom", form.client_nom)
            .eq("code_postal", form.client_code_postal || "")
            .maybeSingle();
          if (!existing) {
            await supabase.from("clients").insert({
              nom: form.client_nom,
              adresse: form.client_adresse || null,
              code_postal: form.client_code_postal || null,
              ville: form.client_ville || null,
              source: "auto",
            });
          }
        }

        // Alimente l'annuaire Experts (sans doublon cabinet)
        if (form.cabinet_expert) {
          const { data: ex } = await supabase
            .from("experts").select("id").eq("cabinet", form.cabinet_expert).maybeSingle();
          if (!ex) {
            await supabase.from("experts").insert({
              cabinet: form.cabinet_expert,
              adresse: form.cabinet_adresse || null,
              tel: form.cabinet_tel || null,
              email: form.cabinet_email || null,
              expert_nom: form.expert_nom || null,
              expert_tel: form.expert_tel || null,
              expert_email: form.expert_email || null,
              source: "auto",
            });
          }
        }

        // Alimente l'annuaire Assureurs (sans doublon nom)
        if (form.assureur) {
          const { data: existingAs } = await supabase
            .from("assureurs").select("id").eq("nom", form.assureur).maybeSingle();
          if (!existingAs) {
            await supabase.from("assureurs").insert({
              nom: form.assureur,
              adresse: form.assureur_adresse || null,
              tel: form.assureur_tel || null,
              email: form.assureur_email || null,
              source: "auto",
            });
          }
        }

        // Génère automatiquement un devis + une facture depuis le rapport
        if (newId && analysed) {
          const lignes = normaliseLignes(
            autoLignes,
            form.montant ? Number(form.montant) : null
          );
          if (lignes.length) {
            await creerDocument("devis", newId, lignes, autoTva);
            await creerDocument("facture", newId, lignes, autoTva);
          }
        }
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto backdrop-blur-sm">
      <div className="w-full max-w-2xl glass-card my-8 modal-panel">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? "Modifier le dossier" : "Nouveau dossier"}
          </h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">
          <div className="glass-soft p-4">
            <label className="field-label">Rapport d&apos;expertise (PDF) — analyse IA + enregistrement</label>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setAnalyzeMsg(null); }}
              className="text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white"
            />
            {file && <p className="text-xs text-white/60 mt-2">Fichier : {file.name}</p>}
            {!file && isEdit && dossier?.rapport_nom && (
              <p className="text-xs text-white/60 mt-2">Fichier actuel : {dossier.rapport_nom}</p>
            )}
            <div className="mt-3">
              <button
                type="button"
                onClick={analyser}
                disabled={!file || analyzing}
                className="btn-primary py-1.5 px-3 text-xs"
              >
                {analyzing ? "Analyse en cours…" : "✨ Analyser et pré-remplir"}
              </button>
            </div>
            {analyzeMsg && <p className="text-xs text-emerald-300 mt-2">{analyzeMsg}</p>}
            {analysed && !analyzeMsg && (
              <p className="text-xs text-emerald-300 mt-2">
                Un devis et une facture seront générés automatiquement à l&apos;enregistrement.
              </p>
            )}
          </div>

          <section>
            <h3 className="text-sm font-semibold text-accent-pink mb-3">1. Informations du véhicule</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Immatriculation" name="immatriculation" value={form.immatriculation} onChange={set} />
              <Field label="Marque et modèle" name="marque_modele" value={form.marque_modele} onChange={set} />
              <Field label="N° de série (VIN)" name="numero_serie" value={form.numero_serie} onChange={set} />
              <Field label="1ère mise en circulation" name="premiere_circulation" value={form.premiere_circulation} onChange={set} type="date" />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-accent-pink mb-3">2. Informations du sinistre</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Date du sinistre" name="date_sinistre" value={form.date_sinistre} onChange={set} type="date" />
              <Field label="N° de sinistre" name="numero_sinistre" value={form.numero_sinistre} onChange={set} />
              <Field label="Cabinet d'expert" name="cabinet_expert" value={form.cabinet_expert} onChange={set} />
              <Field label="Date de l'expertise" name="date_expertise" value={form.date_expertise} onChange={set} type="date" />
              <Field label="N° police d'assurance" name="numero_police" value={form.numero_police} onChange={set} />
              <Field label="Assureur" name="assureur" value={form.assureur} onChange={set} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-accent-pink mb-3">Cabinet d&apos;expert & expert</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Adresse du cabinet" name="cabinet_adresse" value={form.cabinet_adresse} onChange={set} />
              <Field label="Téléphone cabinet" name="cabinet_tel" value={form.cabinet_tel} onChange={set} />
              <Field label="Email cabinet" name="cabinet_email" value={form.cabinet_email} onChange={set} />
              <Field label="Nom de l'expert" name="expert_nom" value={form.expert_nom} onChange={set} />
              <Field label="Téléphone expert" name="expert_tel" value={form.expert_tel} onChange={set} />
              <Field label="Email expert" name="expert_email" value={form.expert_email} onChange={set} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-accent-pink mb-3">Coordonnées assurance</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Adresse assureur" name="assureur_adresse" value={form.assureur_adresse} onChange={set} />
              <Field label="Téléphone assureur" name="assureur_tel" value={form.assureur_tel} onChange={set} />
              <Field label="Email assureur" name="assureur_email" value={form.assureur_email} onChange={set} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-accent-pink mb-3">3. Informations du client</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nom et prénom" name="client_nom" value={form.client_nom} onChange={set} />
              <Field label="Adresse postale" name="client_adresse" value={form.client_adresse} onChange={set} />
              <Field label="Code postal" name="client_code_postal" value={form.client_code_postal} onChange={set} />
              <Field label="Ville" name="client_ville" value={form.client_ville} onChange={set} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-accent-pink mb-3">Réparation (planning)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Début réparation" name="reparation_debut" value={form.reparation_debut} onChange={set} type="date" />
              <Field label="Fin réparation" name="reparation_fin" value={form.reparation_fin} onChange={set} type="date" />
              <Field label="Réparateur attitré" name="reparateur" value={form.reparateur} onChange={set} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-accent-pink mb-3">Suivi</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Montant (€)" name="montant" value={form.montant} onChange={set} type="number" />
              <div>
                <label className="field-label">Statut</label>
                <select className="field-input" value={form.statut} onChange={(e) => set("statut", e.target.value)}>
                  {STATUTS_ORDRE.map((s) => (
                    <option key={s} value={s}>{STATUTS_INFO[s].label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {error && (
            <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Annuler</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer le dossier"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
