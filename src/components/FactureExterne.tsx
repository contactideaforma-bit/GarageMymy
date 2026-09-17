"use client";

/* ====================================================================
 *  FACTURE EXTÉRIEURE (v13.0) — facture émise HORS appli
 *
 *  · <ChampsFactureExterne> : les champs (numéro, dates, totaux, déjà
 *    encaissé), partagés entre la page Import et la fiche dossier ;
 *  · <FactureExterneModal>  : ajout / correction depuis la fiche dossier.
 *
 *  Règle : l'appli ne renumérote pas et ne régénère pas cette facture — on
 *  recopie ce qui est imprimé sur le document d'origine, qui est conservé.
 * ==================================================================== */

import { useState } from "react";
import ModalShell from "./ModalShell";
import FilePicker from "./FilePicker";
import BarreChargement from "./BarreChargement";
import { MOYENS } from "@/lib/paiements";
import { controlerRapport } from "@/lib/documents";
import { formatEuros, messageErreur } from "@/lib/format";
import {
  SaisieFactureExterne,
  creerFactureExterne,
  erreursSaisieFacture,
  majFactureExterne,
  saisieDepuisDocument,
  saisieDepuisLecture,
  saisieFactureVide,
  totauxSaisie,
  trierDocument,
} from "@/lib/reprise";
import type { Document, Dossier } from "@/lib/types";

export function ChampsFactureExterne({
  value,
  onChange,
  montantRapport,
  avecEncaissement = true,
  disabled = false,
}: {
  value: SaisieFactureExterne;
  onChange: (s: SaisieFactureExterne) => void;
  /** Montant HT retenu au rapport — sert UNIQUEMENT à signaler un écart. */
  montantRapport?: number | null;
  avecEncaissement?: boolean;
  disabled?: boolean;
}) {
  const set = <K extends keyof SaisieFactureExterne>(k: K, v: SaisieFactureExterne[K]) =>
    onChange({ ...value, [k]: v });
  const t = totauxSaisie(value);
  const controle = t.ht > 0 ? controlerRapport(t.ht, montantRapport) : null;
  const encaisse = Number(String(value.encaisse_montant).replace(",", ".")) || 0;
  const reste = Math.max(0, Math.round((t.ttc - encaisse) * 100) / 100);
  const num = "field-input px-2 text-right tabular-nums";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="field-label">N° de la facture (d&apos;origine)</label>
          <input className="field-input" value={value.numero} disabled={disabled}
            onChange={(e) => set("numero", e.target.value)} placeholder="ex. FA-2026-0148" />
        </div>
        <div>
          <label className="field-label">Date de la facture</label>
          <input type="date" className="field-input" value={value.date_document} disabled={disabled}
            onChange={(e) => set("date_document", e.target.value)} />
        </div>
        <div>
          <label className="field-label">Échéance</label>
          <input type="date" className="field-input" value={value.date_echeance} disabled={disabled}
            onChange={(e) => set("date_echeance", e.target.value)} />
          <p className="mt-1 text-[11px] text-white/40">Vide = date de facture + 30 jours.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="field-label">Total HT</label>
          <input inputMode="decimal" className={num} value={value.total_ht} disabled={disabled}
            onChange={(e) => set("total_ht", e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="field-label">TVA %</label>
          <input inputMode="decimal" className={num} value={value.tva} disabled={disabled}
            onChange={(e) => set("tva", e.target.value)} />
        </div>
        <div>
          <label className="field-label">Total TTC</label>
          <input inputMode="decimal" className={num} value={value.total_ttc} disabled={disabled}
            onChange={(e) => set("total_ttc", e.target.value)} placeholder={t.ttc > 0 ? t.ttc.toFixed(2) : "0.00"} />
        </div>
      </div>

      {/* On SIGNALE l'écart avec le rapport, on ne bloque pas : la facture
          existe déjà, elle a peut-être même été envoyée. */}
      {controle && controle.montantRapport !== null && (
        <p className={`rounded-lg px-3 py-2 text-xs ${
          controle.coherent ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200"
        }`}>
          {controle.coherent
            ? `✓ Rapport : ${formatEuros(controle.montantRapport)} HT · cette facture : ${formatEuros(t.ht)} HT`
            : `⚠ Rapport : ${formatEuros(controle.montantRapport)} HT · cette facture : ${formatEuros(t.ht)} HT — écart de ${formatEuros(Math.abs(controle.ecart))}. Simple information : la facture d'origine est conservée telle quelle.`}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-white/80">
        <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={value.deja_envoyee} disabled={disabled}
          onChange={(e) => set("deja_envoyee", e.target.checked)} />
        Cette facture a déjà été envoyée (client, expert ou assurance)
      </label>

      {avecEncaissement && (
        <div className="glass-soft p-3">
          <div className="mb-2 text-xs font-semibold text-white/80">Déjà encaissé sur cette facture ?</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="field-label">Montant reçu (TTC)</label>
              <input inputMode="decimal" className={num} value={value.encaisse_montant} disabled={disabled}
                onChange={(e) => set("encaisse_montant", e.target.value)} placeholder="0 = rien reçu" />
            </div>
            <div>
              <label className="field-label">Reçu le</label>
              <input type="date" className="field-input" value={value.encaisse_date} disabled={disabled || encaisse <= 0}
                onChange={(e) => set("encaisse_date", e.target.value)} />
            </div>
            <div>
              <label className="field-label">Moyen</label>
              <select className="field-input" value={value.encaisse_moyen} disabled={disabled || encaisse <= 0}
                onChange={(e) => set("encaisse_moyen", e.target.value)}>
                {Object.entries(MOYENS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>
          {t.ttc > 0 && (
            <p className="mt-2 text-xs text-white/60">
              Reste dû : <b className="text-white">{formatEuros(reste)}</b>
              {encaisse > 0 && reste <= 0.01 ? " — facture soldée, le dossier passera en « Payé »." : " — c'est ce montant qui sera suivi et relancé."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function FactureExterneModal({
  dossier,
  document,
  onClose,
  onSaved,
}: {
  dossier: Dossier;
  /** Absent = ajout ; présent = correction d'une facture extérieure existante. */
  document?: Document | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const edition = Boolean(document);
  const [file, setFile] = useState<File | null>(null);
  const [saisie, setSaisie] = useState<SaisieFactureExterne>(
    document ? saisieDepuisDocument(document) : saisieFactureVide()
  );
  const [lecture, setLecture] = useState(false);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dès qu'un fichier est choisi (en AJOUT), on lit son en-tête et ses
  // totaux. Échec = on laisse saisir à la main, sans bloquer.
  async function choisir(f: File | null) {
    setFile(f);
    setError(null);
    setInfo(null);
    if (!f || edition) return;
    setLecture(true);
    try {
      const r = await trierDocument(f);
      if (r.facture) {
        setSaisie((s) => saisieDepuisLecture(r.facture, s));
        setInfo("Numéro, date et totaux lus sur la facture — vérifie-les avant d'enregistrer.");
      } else {
        setInfo("Ce document n'a pas été reconnu comme une facture : renseigne les champs à la main.");
      }
    } catch (err) {
      setInfo(`${messageErreur(err, "Lecture automatique indisponible.")} Renseigne les champs à la main.`);
    } finally {
      setLecture(false);
    }
  }

  async function enregistrer() {
    setError(null);
    const manques = erreursSaisieFacture(edition ? { ...saisie, encaisse_montant: "" } : saisie);
    if (!edition && !file) manques.unshift("le fichier de la facture");
    if (manques.length) {
      setError(`Il manque ${manques.join(", ")}.`);
      return;
    }
    setSaving(true);
    try {
      if (document) await majFactureExterne(document, saisie, file);
      else await creerFactureExterne(dossier.id, file as File, saisie);
      onSaved();
      onClose();
    } catch (err) {
      setError(messageErreur(err, "Enregistrement impossible."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={edition ? `Facture extérieure ${document?.numero || ""}` : "Ajouter une facture déjà faite (hors appli)"}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <p className="text-sm text-white/60">
        Facture émise avec un autre outil : son <b>numéro</b> et ses <b>montants</b> sont repris tels quels, et le
        document d&apos;origine est conservé — c&apos;est lui qui sera ouvert et joint aux emails. Elle se suit ensuite
        comme les autres (encaissements, relances, retard de paiement).
      </p>

      <div>
        <label className="field-label mb-2 block">
          {edition ? "Remplacer le fichier (facultatif)" : "Fichier de la facture"}
        </label>
        <FilePicker
          value={file}
          onChange={choisir}
          disabled={saving || lecture}
          label="Choisir la facture"
          aide="PDF, JPG ou PNG — ou glisse la facture ici"
        />
        {edition && !file && document?.fichier_nom && (
          <p className="mt-1 text-xs text-white/40">Fichier actuel : {document.fichier_nom}</p>
        )}
        <BarreChargement actif={lecture} />
        {info && <p className="mt-2 text-xs text-emerald-300">{info}</p>}
      </div>

      <ChampsFactureExterne
        value={saisie}
        onChange={setSaisie}
        montantRapport={dossier.montant}
        avecEncaissement={!edition}
        disabled={saving}
      />

      {error && (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}

      <div className="flex justify-end gap-3 pt-1">
        <button onClick={onClose} className="btn-ghost" disabled={saving}>Annuler</button>
        <button onClick={enregistrer} className="btn-primary" disabled={saving || lecture}>
          {saving ? "Enregistrement…" : edition ? "Enregistrer" : "Ajouter au dossier"}
        </button>
      </div>
    </ModalShell>
  );
}
