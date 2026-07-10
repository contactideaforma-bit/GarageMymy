"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchAuth } from "@/lib/apiClient";
import { Dossier } from "@/lib/types";
import { STATUTS_ORDRE, addJoursOuvres, libelleStatut } from "@/lib/format";
import { genNumeroOR } from "@/lib/atelier";
import { useMetier } from "@/components/MetierProvider";
import { termes } from "@/lib/metier";
import { TYPES_VITRAGE, NATURES_INTERVENTION } from "@/lib/vitrage";
import BarreChargement from "@/components/BarreChargement";
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
  client_email: string;
  client_tel: string;
  reparation_debut: string;
  reparation_fin: string;
  reparateur: string;
  montant: string;
  statut: string;
  // Vitrage (métier vitrage)
  type_vitrage: string;
  nature_intervention: string;
  franchise: string;
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
    client_email: d?.client_email ?? "",
    client_tel: d?.client_tel ?? "",
    reparation_debut: d?.reparation_debut ?? "",
    reparation_fin: d?.reparation_fin ?? "",
    reparateur: d?.reparateur ?? "",
    montant: d?.montant != null ? String(d.montant) : "",
    statut: d?.statut ?? "nouveau",
    type_vitrage: d?.type_vitrage ?? "",
    nature_intervention: d?.nature_intervention ?? "",
    franchise: d?.franchise != null ? String(d.franchise) : "",
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
  // Reçoit l'id du dossier créé/modifié (pour ouvrir sa fiche directement)
  onSaved: (id?: string) => void;
  dossier?: Dossier | null;
  prefill?: Partial<Dossier> | null;
  prefillFile?: File | null;
  prefillLignes?: LigneExtraite[] | null;
  prefillTva?: number | null;
}) {
  const isEdit = Boolean(dossier);
  const { metier } = useMetier();
  const t = termes(metier);
  const estVitrage = metier === "vitrage";
  const [form, setForm] = useState<FormState>(toForm(dossier ?? prefill));
  // Calibrage ADAS (booléens gérés à part du FormState texte)
  const [calibrageRequis, setCalibrageRequis] = useState<boolean>(
    Boolean(dossier?.calibrage_requis ?? prefill?.calibrage_requis)
  );
  const [calibrageFait, setCalibrageFait] = useState<boolean>(
    Boolean(dossier?.calibrage_fait ?? prefill?.calibrage_fait)
  );
  // En vitrage, l'expert est rare : sections masquées sauf si déjà renseignées.
  const [expertOuvert, setExpertOuvert] = useState<boolean>(
    !estVitrage ||
      Boolean(dossier?.cabinet_expert || dossier?.expert_nom || dossier?.date_expertise)
  );
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

  // Alimente / complète l'annuaire (clients, experts, assureurs) depuis le
  // dossier — SANS doublon : si la fiche existe, on ne remplit que les champs
  // vides (jamais d'écrasement).
  async function synchroniserAnnuaire() {
    // Client (doublon par nom, insensible à la casse)
    if (form.client_nom) {
      const { data: existing } = await supabase
        .from("clients")
        .select("id,email,telephone,adresse,code_postal,ville")
        .ilike("nom", form.client_nom.trim())
        .limit(1)
        .maybeSingle();
      if (!existing) {
        await supabase.from("clients").insert({
          nom: form.client_nom.trim(),
          email: form.client_email || null,
          telephone: form.client_tel || null,
          adresse: form.client_adresse || null,
          code_postal: form.client_code_postal || null,
          ville: form.client_ville || null,
          source: "auto",
        });
      } else {
        const maj: Record<string, string> = {};
        if (form.client_email && !existing.email) maj.email = form.client_email;
        if (form.client_tel && !existing.telephone) maj.telephone = form.client_tel;
        if (form.client_adresse && !existing.adresse) maj.adresse = form.client_adresse;
        if (form.client_code_postal && !existing.code_postal) maj.code_postal = form.client_code_postal;
        if (form.client_ville && !existing.ville) maj.ville = form.client_ville;
        if (Object.keys(maj).length) await supabase.from("clients").update(maj).eq("id", existing.id);
      }
    }

    // Expert (doublon par cabinet)
    if (form.cabinet_expert) {
      const { data: ex } = await supabase
        .from("experts")
        .select("id,adresse,tel,email,expert_nom,expert_tel,expert_email")
        .ilike("cabinet", form.cabinet_expert.trim())
        .limit(1)
        .maybeSingle();
      if (!ex) {
        await supabase.from("experts").insert({
          cabinet: form.cabinet_expert.trim(),
          adresse: form.cabinet_adresse || null,
          tel: form.cabinet_tel || null,
          email: form.cabinet_email || null,
          expert_nom: form.expert_nom || null,
          expert_tel: form.expert_tel || null,
          expert_email: form.expert_email || null,
          source: "auto",
        });
      } else {
        const maj: Record<string, string> = {};
        if (form.cabinet_adresse && !ex.adresse) maj.adresse = form.cabinet_adresse;
        if (form.cabinet_tel && !ex.tel) maj.tel = form.cabinet_tel;
        if (form.cabinet_email && !ex.email) maj.email = form.cabinet_email;
        if (form.expert_nom && !ex.expert_nom) maj.expert_nom = form.expert_nom;
        if (form.expert_tel && !ex.expert_tel) maj.expert_tel = form.expert_tel;
        if (form.expert_email && !ex.expert_email) maj.expert_email = form.expert_email;
        if (Object.keys(maj).length) await supabase.from("experts").update(maj).eq("id", ex.id);
      }
    }

    // Assureur (doublon par nom)
    if (form.assureur) {
      const { data: as } = await supabase
        .from("assureurs")
        .select("id,adresse,tel,email")
        .ilike("nom", form.assureur.trim())
        .limit(1)
        .maybeSingle();
      if (!as) {
        await supabase.from("assureurs").insert({
          nom: form.assureur.trim(),
          adresse: form.assureur_adresse || null,
          tel: form.assureur_tel || null,
          email: form.assureur_email || null,
          source: "auto",
        });
      } else {
        const maj: Record<string, string> = {};
        if (form.assureur_adresse && !as.adresse) maj.adresse = form.assureur_adresse;
        if (form.assureur_tel && !as.tel) maj.tel = form.assureur_tel;
        if (form.assureur_email && !as.email) maj.email = form.assureur_email;
        if (Object.keys(maj).length) await supabase.from("assureurs").update(maj).eq("id", as.id);
      }
    }
  }

  async function analyser() {
    if (!file) return;
    setAnalyzing(true);
    setAnalyzeMsg(null);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetchAuth("/api/extract-rapport", { method: "POST", body: fd });
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
        "✓ Dossier pré-rempli. Devis, facture, ordre de réparation et cession de créance seront générés automatiquement à l'enregistrement, conformes au chiffrage."
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
        client_email: form.client_email || null,
        client_tel: form.client_tel || null,
        client_code_postal: form.client_code_postal || null,
        client_ville: form.client_ville || null,
        reparation_debut: form.reparation_debut || null,
        reparation_fin: form.reparation_fin || null,
        reparateur: form.reparateur || null,
        montant: form.montant ? Number(form.montant) : 0,
        statut: form.statut,
        // Vitrage (renseigné pour les comptes vitrage, vide sinon)
        type_vitrage: form.type_vitrage || null,
        nature_intervention: form.nature_intervention || null,
        franchise: form.franchise ? Number(form.franchise) : null,
        calibrage_requis: calibrageRequis,
        calibrage_fait: calibrageFait,
        rapport_path,
        rapport_nom,
      };

      let idFinal: string | undefined;
      if (isEdit && dossier) {
        const { error: updErr } = await supabase.from("dossiers").update(payload).eq("id", dossier.id);
        if (updErr) throw updErr;
        idFinal = dossier.id;
        await synchroniserAnnuaire();
      } else {
        const { data: created, error: insErr } = await supabase
          .from("dossiers")
          .insert(payload)
          .select("id")
          .single();
        if (insErr) throw insErr;
        const newId = created?.id as string | undefined;
        idFinal = newId;

        await synchroniserAnnuaire();

        // NOUVEAU PROCESSUS : à réception du chiffrage (pré-rapport), on émet
        // un ORDRE DE RÉPARATION strictement conforme au chiffrage + la facture
        // (brouillon), et on programme le rappel d'envoi à J+3 OUVRÉS.
        if (newId && analysed) {
          const lignes = normaliseLignes(
            autoLignes,
            form.montant ? Number(form.montant) : null
          );
          if (lignes.length) {
            const totalHt = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
            const travaux =
              "Conforme au chiffrage du rapport d'expertise :\n" +
              lignes
                .map((l) => {
                  const total = l.quantite * l.prix_unitaire;
                  return `- ${l.designation}${l.quantite !== 1 ? ` (x${l.quantite})` : ""}${
                    total > 0 ? ` — ${total.toFixed(2)} € HT` : ""
                  }`;
                })
                .join("\n");
            await supabase.from("ordres_reparation").insert({
              dossier_id: newId,
              numero: genNumeroOR(),
              date_or: new Date().toISOString().slice(0, 10),
              travaux,
              montant_ht: totalHt,
              signataire_nom: form.client_nom || null,
            });
            await creerDocument("devis", newId, lignes, autoTva);
            await creerDocument("facture", newId, lignes, autoTva);
            // Cession de créance prête à signer (montant = TTC du chiffrage)
            const totauxAuto = computeTotaux(lignes, autoTva);
            await supabase.from("cessions_creance").insert({
              dossier_id: newId,
              date_cession: new Date().toISOString().slice(0, 10),
              montant: Math.round(totauxAuto.ttc * 100) / 100,
              signataire_nom: form.client_nom || null,
            });

            // Rappel automatique : envoyer la facture 3 jours ouvrés plus tard
            const dateEnvoi = addJoursOuvres(new Date(), 3);
            await supabase.from("evenements").insert({
              dossier_id: newId,
              titre: "Envoyer la facture",
              description:
                "Rappel automatique : 3 jours ouvrés après réception du chiffrage, envoyer la facture à l'expert et au client (ou à l'expert et à l'assurance si cession de créance).",
              date_evenement: dateEnvoi.toISOString(),
              categorie: "autre",
            });
          }
        }
      }

      onSaved(idFinal);
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
            <label className="field-label">
              {t.rapport} (PDF{estVitrage ? ", optionnel" : ""}) — analyse IA + enregistrement
            </label>
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
                {analyzing ? "Analyse en cours…" : "Analyser et pré-remplir"}
              </button>
            </div>
            <BarreChargement actif={analyzing} />
            {analyzeMsg && <p className="text-xs text-emerald-300 mt-2">{analyzeMsg}</p>}
            {analysed && !analyzeMsg && (
              <p className="text-xs text-emerald-300 mt-2">
                Devis, facture, ordre de réparation et cession de créance seront générés
                automatiquement à l&apos;enregistrement, conformes au chiffrage.
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

          {estVitrage && (
            <section>
              <h3 className="text-sm font-semibold text-accent-teal mb-3">Vitrage & intervention</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Vitrage concerné</label>
                  <select className="field-input" value={form.type_vitrage} onChange={(e) => set("type_vitrage", e.target.value)}>
                    <option value="">—</option>
                    {TYPES_VITRAGE.map((v) => (
                      <option key={v.key} value={v.key}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Nature de l&apos;intervention</label>
                  <select className="field-input" value={form.nature_intervention} onChange={(e) => set("nature_intervention", e.target.value)}>
                    <option value="">—</option>
                    {NATURES_INTERVENTION.map((n) => (
                      <option key={n.key} value={n.key}>{n.label}</option>
                    ))}
                  </select>
                </div>
                <Field label="Franchise client (€)" name="franchise" value={form.franchise} onChange={set} type="number" />
                <div className="flex flex-col justify-center gap-2 pt-1">
                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input type="checkbox" checked={calibrageRequis} onChange={(e) => setCalibrageRequis(e.target.checked)} />
                    Calibrage ADAS nécessaire
                  </label>
                  {calibrageRequis && (
                    <label className="flex items-center gap-2 text-sm text-white/80">
                      <input type="checkbox" checked={calibrageFait} onChange={(e) => setCalibrageFait(e.target.checked)} />
                      Calibrage réalisé
                    </label>
                  )}
                </div>
              </div>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-accent-pink mb-3">
              {estVitrage ? "2. Sinistre & assurance" : "2. Informations du sinistre"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={estVitrage ? "Date du bris de glace" : "Date du sinistre"} name="date_sinistre" value={form.date_sinistre} onChange={set} type="date" />
              <Field label="N° de dossier / sinistre" name="numero_sinistre" value={form.numero_sinistre} onChange={set} />
              {!estVitrage && (
                <Field label="Cabinet d'expert" name="cabinet_expert" value={form.cabinet_expert} onChange={set} />
              )}
              {!estVitrage && (
                <Field label="Date de l'expertise" name="date_expertise" value={form.date_expertise} onChange={set} type="date" />
              )}
              <Field label="N° police d'assurance" name="numero_police" value={form.numero_police} onChange={set} />
              <Field label="Assureur" name="assureur" value={form.assureur} onChange={set} />
            </div>
          </section>

          {estVitrage && !expertOuvert && (
            <button
              type="button"
              onClick={() => setExpertOuvert(true)}
              className="text-sm text-accent-teal hover:underline"
            >
              + Ce dossier passe par un expert (optionnel)
            </button>
          )}

          {expertOuvert && (
            <section>
              <h3 className="text-sm font-semibold text-accent-pink mb-3">Cabinet d&apos;expert & expert</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {estVitrage && (
                  <Field label="Cabinet d'expert" name="cabinet_expert" value={form.cabinet_expert} onChange={set} />
                )}
                {estVitrage && (
                  <Field label="Date de l'expertise" name="date_expertise" value={form.date_expertise} onChange={set} type="date" />
                )}
                <Field label="Adresse du cabinet" name="cabinet_adresse" value={form.cabinet_adresse} onChange={set} />
                <Field label="Téléphone cabinet" name="cabinet_tel" value={form.cabinet_tel} onChange={set} />
                <Field label="Email cabinet" name="cabinet_email" value={form.cabinet_email} onChange={set} />
                <Field label="Nom de l'expert" name="expert_nom" value={form.expert_nom} onChange={set} />
                <Field label="Téléphone expert" name="expert_tel" value={form.expert_tel} onChange={set} />
                <Field label="Email expert" name="expert_email" value={form.expert_email} onChange={set} />
              </div>
            </section>
          )}

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
              <Field label="Email" name="client_email" value={form.client_email} onChange={set} type="email" />
              <Field label="Téléphone" name="client_tel" value={form.client_tel} onChange={set} />
              <Field label="Adresse postale" name="client_adresse" value={form.client_adresse} onChange={set} />
              <Field label="Code postal" name="client_code_postal" value={form.client_code_postal} onChange={set} />
              <Field label="Ville" name="client_ville" value={form.client_ville} onChange={set} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-accent-pink mb-3">{t.reparation} (planning)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={`Début ${t.reparation.toLowerCase()}`} name="reparation_debut" value={form.reparation_debut} onChange={set} type="date" />
              <Field label={`Fin ${t.reparation.toLowerCase()}`} name="reparation_fin" value={form.reparation_fin} onChange={set} type="date" />
              <Field label={`${t.reparateur} attitré`} name="reparateur" value={form.reparateur} onChange={set} />
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
                    <option key={s} value={s}>{libelleStatut(s, metier)}</option>
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
