"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { FlotteVehicule } from "@/lib/types";
import { messageErreur } from "@/lib/format";
import { TYPES_CONTRAT_ASSURANCE } from "@/lib/flotte";
import ModalShell from "@/components/ModalShell";

/**
 * Création / modification d'un véhicule de la flotte (v12.3) : identité,
 * assurance (type de contrat, n° de police, dates), contrôle technique,
 * kilométrage, notes — et le cas « hors garage » (immatriculé au nom d'un
 * tiers) pour les comptes qui y ont droit.
 */
export default function VehiculeForm({
  vehicule,
  prefill,
  horsGarage = false,
  onClose,
  onSaved,
}: {
  vehicule?: FlotteVehicule;
  prefill?: Partial<FlotteVehicule>;
  /** Le formulaire est ouvert depuis l'onglet « Flotte hors garage ». */
  horsGarage?: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const base = { ...(prefill || {}), ...(vehicule || {}) } as Partial<FlotteVehicule>;
  const [f, setF] = useState({
    immatriculation: base.immatriculation || "",
    marque_modele: base.marque_modele || "",
    vin: base.vin || "",
    couleur: base.couleur || "",
    carburant: base.carburant || "",
    date_mise_circulation: base.date_mise_circulation || "",
    kilometrage: base.kilometrage != null ? String(base.kilometrage) : "",
    assurance: base.assurance || "",
    type_contrat_assurance: base.type_contrat_assurance || "",
    numero_police: base.numero_police || "",
    date_debut_contrat: base.date_debut_contrat || "",
    date_fin_contrat: base.date_fin_contrat || "",
    date_assurance: base.date_assurance || "",
    assureur_tel: base.assureur_tel || "",
    assureur_email: base.assureur_email || "",
    date_ct: base.date_ct || "",
    date_prochain_ct: base.date_prochain_ct || "",
    date_sinistre: base.date_sinistre || "",
    conducteur: base.conducteur || "",
    conducteur_tel: base.conducteur_tel || "",
    prix_jour: base.prix_jour != null ? String(base.prix_jour) : "",
    commentaire: base.commentaire || "",
    notes: base.notes || "",
    hors_garage: base.hors_garage ?? horsGarage,
    titulaire_cg: base.titulaire_cg || "",
    titulaire_cg_tel: base.titulaire_cg_tel || "",
    ct_ok: base.ct_ok ?? false,
    cg_ok: base.cg_ok ?? false,
    entretien_ok: base.entretien_ok ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const num = (v: string): number | null => (v.trim() === "" ? null : Number(String(v).replace(",", ".")) || 0);
  const txt = (v: string) => (v.trim() ? v.trim() : null);

  async function save() {
    if (!f.immatriculation.trim()) { setError("L'immatriculation est obligatoire."); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        immatriculation: f.immatriculation.trim().toUpperCase(),
        marque_modele: txt(f.marque_modele),
        vin: txt(f.vin),
        couleur: txt(f.couleur),
        carburant: txt(f.carburant),
        date_mise_circulation: f.date_mise_circulation || null,
        kilometrage: num(f.kilometrage),
        assurance: txt(f.assurance),
        type_contrat_assurance: txt(f.type_contrat_assurance),
        numero_police: txt(f.numero_police),
        date_debut_contrat: f.date_debut_contrat || null,
        date_fin_contrat: f.date_fin_contrat || null,
        // L'alerte J+40 historique se base sur la date de souscription ; à
        // défaut on reprend le début du contrat.
        date_assurance: f.date_assurance || f.date_debut_contrat || null,
        assureur_tel: txt(f.assureur_tel),
        assureur_email: txt(f.assureur_email),
        date_ct: f.date_ct || null,
        date_prochain_ct: f.date_prochain_ct || null,
        date_sinistre: f.date_sinistre || null,
        conducteur: txt(f.conducteur),
        conducteur_tel: txt(f.conducteur_tel),
        prix_jour: num(f.prix_jour),
        commentaire: txt(f.commentaire),
        notes: txt(f.notes),
        hors_garage: Boolean(f.hors_garage),
        titulaire_cg: txt(f.titulaire_cg),
        titulaire_cg_tel: txt(f.titulaire_cg_tel),
        ct_ok: f.ct_ok,
        cg_ok: f.cg_ok,
        entretien_ok: f.entretien_ok,
      };
      if (vehicule) {
        const { error: e1 } = await supabase.from("flotte_vehicules").update(payload).eq("id", vehicule.id);
        if (e1) throw e1;
        onSaved(vehicule.id);
      } else {
        const { data, error: e1 } = await supabase.from("flotte_vehicules").insert(payload).select("id").single();
        if (e1) throw e1;
        onSaved((data as { id: string }).id);
      }
    } catch (err: unknown) {
      setError(messageErreur(err, "Enregistrement impossible (migration v67 exécutée ?)."));
    } finally {
      setSaving(false);
    }
  }

  // Fonction (pas un composant) : un composant défini dans le rendu serait
  // recréé à chaque frappe et le champ perdrait le focus.
  const champ = (k: keyof typeof f, label: string, type = "text", placeholder?: string) => (
    <div key={k}>
      <label className="field-label">{label}</label>
      <input type={type} className="field-input" value={String(f[k] ?? "")} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} />
    </div>
  );

  return (
    <ModalShell title={vehicule ? `Modifier ${vehicule.immatriculation}` : horsGarage ? "Ajouter un véhicule hors garage" : "Ajouter un véhicule à la flotte"} onClose={onClose} maxWidth="max-w-3xl">
      <Section titre="Identité">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {champ("immatriculation", "Immatriculation *", "text", "AB-123-CD")}
          {champ("marque_modele", "Marque et modèle", "text", "Renault Clio V")}
          {champ("vin", "N° de série (VIN)")}
          {champ("couleur", "Couleur")}
          {champ("carburant", "Énergie", "text", "Essence, Diesel, Électrique…")}
          {champ("date_mise_circulation", "1ère mise en circulation", "date")}
          {champ("kilometrage", "Kilométrage actuel", "text", "km")}
          {champ("prix_jour", "Tarif location (€ HT / jour)", "text", "pour les locations")}
        </div>
      </Section>

      <Section titre="Titulaire de la carte grise">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {champ("titulaire_cg", "Nom sur la carte grise", "text", "si différent du garage")}
          {champ("titulaire_cg_tel", "Téléphone du titulaire")}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" checked={Boolean(f.hors_garage)} onChange={(e) => set("hors_garage", e.target.checked)} />
          Véhicule « hors garage » (au nom d&apos;un tiers, suivi dans l&apos;onglet dédié)
        </label>
      </Section>

      <Section titre="Assurance">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {champ("assurance", "Compagnie / courtier")}
          <div>
            <label className="field-label">Type de contrat</label>
            <input list="types-contrat-assurance" className="field-input" value={f.type_contrat_assurance} onChange={(e) => set("type_contrat_assurance", e.target.value)} placeholder="Tous risques, tiers…" />
            <datalist id="types-contrat-assurance">
              {TYPES_CONTRAT_ASSURANCE.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          {champ("numero_police", "N° de police")}
          {champ("date_debut_contrat", "Début du contrat", "date")}
          {champ("date_fin_contrat", "Échéance du contrat", "date")}
          {champ("date_assurance", "Date de souscription (alerte J+40)", "date")}
          {champ("assureur_tel", "Téléphone assureur")}
          {champ("assureur_email", "Email assureur", "email")}
        </div>
      </Section>

      <Section titre="Contrôle technique, conducteur, sinistre">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {champ("date_ct", "Dernier contrôle technique", "date")}
          {champ("date_prochain_ct", "Prochain contrôle technique", "date")}
          {champ("conducteur", "Conducteur habituel")}
          {champ("conducteur_tel", "Téléphone conducteur")}
          {champ("date_sinistre", "Date de sinistre (si sinistré)", "date")}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-white/80">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.ct_ok} onChange={(e) => set("ct_ok", e.target.checked)} /> CT à jour</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.cg_ok} onChange={(e) => set("cg_ok", e.target.checked)} /> Carte grise OK</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.entretien_ok} onChange={(e) => set("entretien_ok", e.target.checked)} /> Entretien à jour</label>
        </div>
      </Section>

      <Section titre="Notes">
        <div>
          <label className="field-label">Commentaire court (affiché dans la liste)</label>
          <input className="field-input" value={f.commentaire} onChange={(e) => set("commentaire", e.target.value)} />
        </div>
        <div className="mt-3">
          <label className="field-label">Notes libres</label>
          <textarea className="field-input" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Particularités, clés, accessoires, historique…" />
        </div>
      </Section>

      {error && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</div>}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </ModalShell>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="glass-soft p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">{titre}</div>
      {children}
    </div>
  );
}
