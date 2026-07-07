"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dossier } from "@/lib/types";
import { LigneExtraite } from "@/lib/documents";
import DossierForm from "@/components/DossierForm";
import ConfigBanner from "@/components/ConfigBanner";
import { fetchAuth } from "@/lib/apiClient";
import BarreChargement from "@/components/BarreChargement";

type Extraction = Partial<Dossier> & { lignes?: LigneExtraite[]; tva?: number | null };

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [analyse, setAnalyse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Extraction | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function analyser() {
    if (!file) return;
    setAnalyse(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetchAuth("/api/extract-rapport", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec de l'analyse.");
      setPrefill(json.data as Extraction);
      setShowForm(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setAnalyse(false);
    }
  }

  function saisieManuelle() {
    setPrefill(null);
    setShowForm(true);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-white mb-2">Importer un rapport d&apos;expertise</h1>
      <p className="text-white/60 mb-6">
        Dépose le rapport reçu du cabinet d&apos;expert. L&apos;IA en extrait les informations
        (véhicule, sinistre, client, expert, assurance) et pré-remplit un dossier complet.
      </p>

      <ConfigBanner />

      <div className="glass-card p-6">
        <label className="field-label">Rapport d&apos;expertise (PDF ou image)</label>
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
        />
        {file && <p className="text-xs text-white/60 mt-2">Sélectionné : {file.name}</p>}

        {error && (
          <div className="mt-4 rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={analyser} disabled={!file || analyse} className="btn-primary">
            {analyse ? "Analyse en cours…" : "Analyser le rapport"}
          </button>
          <button onClick={saisieManuelle} className="btn-ghost">
            Saisie manuelle
          </button>
        </div>

        <BarreChargement actif={analyse} />
      </div>

      {showForm && (
        <DossierForm
          prefill={prefill}
          prefillFile={file}
          prefillLignes={prefill?.lignes}
          prefillTva={prefill?.tva ?? null}
          onClose={() => setShowForm(false)}
          onSaved={(id) => router.push(id ? `/sinistres/${id}` : "/sinistres")}
        />
      )}
    </div>
  );
}
