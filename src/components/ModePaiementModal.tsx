"use client";

import { useState } from "react";
import ModalShell from "./ModalShell";
import { MODES_REGLEMENT } from "@/lib/documents";

/**
 * Choix du MODE DE PAIEMENT au moment de générer la facture (v34).
 *
 * Le mode retenu est imprimé sur le PDF (encadré « Règlement » + mentions
 * obligatoires) et mémorisé sur la facture pour les envois suivants.
 */
export default function ModePaiementModal({
  defaut,
  titre = "Générer la facture",
  alerte,
  onClose,
  onValider,
}: {
  defaut: string;
  titre?: string;
  /** Incohérence détectée avec le rapport d'expertise (v7.5). */
  alerte?: string | null;
  onClose: () => void;
  onValider: (mode: string) => void | Promise<void>;
}) {
  const [mode, setMode] = useState(defaut in MODES_REGLEMENT ? defaut : "virement");
  const [busy, setBusy] = useState(false);

  return (
    <ModalShell title={titre} onClose={onClose}>
      {alerte && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
          <span className="font-semibold">⚠ À vérifier — </span>
          {alerte}
          <span className="mt-1 block text-xs text-amber-100/70">
            Tu peux générer quand même, mais la facture ne correspondra pas au rapport.
          </span>
        </div>
      )}
      <div>
        <label className="field-label">Mode de paiement affiché sur la facture</label>
        <select className="field-input" value={mode} onChange={(e) => setMode(e.target.value)}>
          {Object.entries(MODES_REGLEMENT).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <p className="text-xs text-white/40 mt-2">
          {mode === "virement" || mode === "prelevement" || mode === "assurance"
            ? "L'IBAN et le BIC du garage (profil) seront imprimés dans l'encadré « Règlement »."
            : mode === "cheque"
              ? "Le nom du garage sera imprimé comme ordre du chèque."
              : "Le mode choisi est imprimé dans l'encadré « Règlement » et dans les mentions légales."}
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-1">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button
          className="btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onValider(mode);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Génération…" : "Générer le PDF"}
        </button>
      </div>
    </ModalShell>
  );
}
