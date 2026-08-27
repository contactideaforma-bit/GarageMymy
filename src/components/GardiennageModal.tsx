"use client";

// FACTURE DE GARDIENNAGE (v54 / v9.9) — étape 1 : les éléments du parc
// (entrée, sortie, enlèvement, tarif journalier, jours offerts). Étape 2 :
// l'éditeur de facture habituel s'ouvre pré-rempli — libellés, prix et
// mentions y restent modifiables avant enregistrement.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, Entreprise } from "@/lib/types";
import { formatEuros } from "@/lib/format";
import ModalShell from "@/components/ModalShell";
import {
  ParametresGardiennage,
  defautsGardiennage,
  joursGardiennage,
  lignesGardiennage,
  mentionsGardiennage,
  totalGardiennageHt,
} from "@/lib/gardiennage";
import type { LigneSource } from "@/components/DocumentEditor";

export default function GardiennageModal({
  dossier,
  onClose,
  onValider,
}: {
  dossier: Dossier;
  onClose: () => void;
  onValider: (lignes: LigneSource[], notes: string) => void;
}) {
  const [ent, setEnt] = useState<Partial<Entreprise> | null>(null);
  const [p, setP] = useState<ParametresGardiennage>(() => defautsGardiennage(null, dossier));
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    supabase
      .from("entreprise")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const e = (data as Entreprise | null) || null;
        setEnt(e);
        setP(defautsGardiennage(e, dossier));
        setCharge(true);
      });
  }, [dossier]);

  const set = <K extends keyof ParametresGardiennage>(k: K, v: ParametresGardiennage[K]) => setP((x) => ({ ...x, [k]: v }));
  const num = (v: string) => Number(String(v).replace(",", ".")) || 0;
  const jours = joursGardiennage(p);
  const total = totalGardiennageHt(p);
  const sansTarif = charge && !(Number(ent?.gard_tarif_jour) > 0);

  return (
    <ModalShell title="Facture de gardiennage" onClose={onClose} maxWidth="max-w-2xl">
      <p className="text-xs text-white/50">
        Renseigne les éléments du parc ; la facture s&apos;ouvre ensuite dans l&apos;éditeur habituel, où tu peux modifier
        chaque libellé, chaque prix et les mentions avant d&apos;enregistrer.
        {sansTarif && (
          <span className="mt-1 block text-amber-300">
            Aucun tarif de gardiennage n&apos;est enregistré dans <b>Profil du garage</b> : saisis-les ici (ils ne seront pas mémorisés).
          </span>
        )}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Entrée de parc le</label>
          <input type="date" className="field-input" value={p.date_entree} onChange={(e) => set("date_entree", e.target.value)} />
        </div>
        <div>
          <label className="field-label">Sortie de parc le</label>
          <input type="date" className="field-input" value={p.date_sortie} onChange={(e) => set("date_sortie", e.target.value)} />
        </div>
        <div>
          <label className="field-label">Tarif gardiennage € HT / jour</label>
          <input inputMode="decimal" className="field-input" value={String(p.tarif_jour)} onChange={(e) => set("tarif_jour", num(e.target.value))} />
        </div>
        <div>
          <label className="field-label">Jours offerts (non facturés)</label>
          <input inputMode="numeric" className="field-input" value={String(p.jours_franchise)} onChange={(e) => set("jours_franchise", num(e.target.value))} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-3 glass-soft px-3 py-2">
          <input type="checkbox" className="h-4 w-4 accent-pink-500" checked={p.avec_entree} onChange={(e) => set("avec_entree", e.target.checked)} />
          <span className="flex-1 text-sm text-white/85">Frais d&apos;entrée de parc</span>
          <input inputMode="decimal" className="field-input field-compact w-24 text-right" value={String(p.frais_entree)} onChange={(e) => set("frais_entree", num(e.target.value))} disabled={!p.avec_entree} />
          <span className="text-xs text-white/50">€ HT</span>
        </label>
        <label className="flex items-center gap-3 glass-soft px-3 py-2">
          <input type="checkbox" className="h-4 w-4 accent-pink-500" checked={p.avec_sortie} onChange={(e) => set("avec_sortie", e.target.checked)} />
          <span className="flex-1 text-sm text-white/85">Frais de sortie de parc</span>
          <input inputMode="decimal" className="field-input field-compact w-24 text-right" value={String(p.frais_sortie)} onChange={(e) => set("frais_sortie", num(e.target.value))} disabled={!p.avec_sortie} />
          <span className="text-xs text-white/50">€ HT</span>
        </label>
        <label className="flex flex-wrap items-center gap-3 glass-soft px-3 py-2">
          <input type="checkbox" className="h-4 w-4 accent-pink-500" checked={p.avec_enlevement} onChange={(e) => set("avec_enlevement", e.target.checked)} />
          <span className="flex-1 text-sm text-white/85">Enlèvement / remorquage</span>
          <input type="date" className="field-input field-compact w-36" value={p.date_enlevement} onChange={(e) => set("date_enlevement", e.target.value)} disabled={!p.avec_enlevement} />
          <input inputMode="decimal" className="field-input field-compact w-24 text-right" value={String(p.frais_enlevement)} onChange={(e) => set("frais_enlevement", num(e.target.value))} disabled={!p.avec_enlevement} />
          <span className="text-xs text-white/50">€ HT</span>
        </label>
      </div>

      <div className="glass-soft px-3 py-2 text-sm text-white/80">
        {jours} jour(s) facturé(s) × {formatEuros(p.tarif_jour)} → <b className="text-white">{formatEuros(total)} HT</b> au total (TVA en sus)
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button
          onClick={() => onValider(lignesGardiennage(p), mentionsGardiennage(p, dossier, ent))}
          disabled={!p.date_entree || !p.date_sortie}
          className="btn-primary"
        >
          Préparer la facture →
        </button>
      </div>
    </ModalShell>
  );
}
