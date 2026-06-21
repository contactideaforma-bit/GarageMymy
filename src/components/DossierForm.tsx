"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dossier } from "@/lib/types";
import { STATUTS_ORDRE, STATUTS_INFO } from "@/lib/format";

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
  client_nom: string;
  client_adresse: string;
  client_code_postal: string;
  client_ville: string;
  montant: string;
  statut: string;
};

function toForm(d?: Dossier | null): FormState {
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
    client_nom: d?.client_nom ?? "",
    client_adresse: d?.client_adresse ?? "",
    client_code_postal: d?.client_code_postal ?? "",
    client_ville: d?.client_ville ?? "",
    montant: d?.montant != null ? String(d.montant) : "",
    statut: d?.statut ?? "nouveau",
  };
}

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
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
      <input
        type={type}
        className="field-input"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
      />
    </div>
  );
}

export default function DossierForm({
  onClose,
  onSaved,
  dossier,
}: {
  onClose: () => void;
  onSaved: () => void;
  dossier?: Dossier | null;
}) {
  const isEdit = Boolean(dossier);
  const [form, setForm] = useState<FormState>(toForm(dossier));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (name: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [name]: value }));

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
        const { error: upErr } = await supabase.storage
          .from("rapports")
          .upload(path, file);
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
        client_nom: form.client_nom || null,
        client_adresse: form.client_adresse || null,
        client_code_postal: form.client_code_postal || null,
        client_ville: form.client_ville || null,
        montant: form.montant ? Number(form.montant) : 0,
        statut: form.statut,
        rapport_path,
        rapport_nom,
      };

      if (isEdit && dossier) {
        const { error: updErr } = await supabase
          .from("dossiers")
          .update(payload)
          .eq("id", dossier.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from("dossiers").insert(payload);
        if (insErr) throw insErr;
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Erreur lors de l'enregistrement.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-line">
          <h2 className="text-lg font-semibold text-ink">
            {isEdit ? "Modifier le dossier" : "Nouveau dossier"}
          </h2>
          <button
            onClick={onClose}
            className="text-ink-faint hover:text-ink text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">
          <div className="rounded-lg border border-dashed border-surface-line bg-surface-muted p-4">
            <label className="field-label">
              Rapport d&apos;expertise (PDF) — enregistré dans la base
            </label>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-sm"
            />
            {isEdit && dossier?.rapport_nom && !file && (
              <p className="text-xs text-ink-soft mt-2">
                Fichier actuel : {dossier.rapport_nom}
              </p>
            )}
            <p className="text-xs text-ink-faint mt-2">
              Le fichier est stocké et lié au dossier. (L&apos;extraction
              automatique des champs sera ajoutée plus tard.)
            </p>
          </div>

          <section>
            <h3 className="text-sm font-semibold text-brand mb-3">
              1. Informations du véhicule
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Immatriculation" name="immatriculation" value={form.immatriculation} onChange={set} />
              <Field label="Marque et modèle" name="marque_modele" value={form.marque_modele} onChange={set} />
              <Field label="N° de série (VIN)" name="numero_serie" value={form.numero_serie} onChange={set} />
              <Field label="1ère mise en circulation" name="premiere_circulation" value={form.premiere_circulation} onChange={set} type="date" />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-brand mb-3">
              2. Informations du sinistre
            </h3>
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
            <h3 className="text-sm font-semibold text-brand mb-3">
              3. Informations du client
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nom et prénom" name="client_nom" value={form.client_nom} onChange={set} />
              <Field label="Adresse postale" name="client_adresse" value={form.client_adresse} onChange={set} />
              <Field label="Code postal" name="client_code_postal" value={form.client_code_postal} onChange={set} />
              <Field label="Ville" name="client_ville" value={form.client_ville} onChange={set} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-brand mb-3">Suivi</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Montant (€)" name="montant" value={form.montant} onChange={set} type="number" />
              <div>
                <label className="field-label">Statut</label>
                <select
                  className="field-input"
                  value={form.statut}
                  onChange={(e) => set("statut", e.target.value)}
                >
                  {STATUTS_ORDRE.map((s) => (
                    <option key={s} value={s}>
                      {STATUTS_INFO[s].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-surface-line px-4 py-2 text-sm text-ink-soft hover:bg-surface-muted"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer le dossier"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
