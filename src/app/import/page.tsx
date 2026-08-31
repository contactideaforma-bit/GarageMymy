"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { analyserRapport, type Extraction } from "@/lib/extraction";
import DossierForm from "@/components/DossierForm";
import ConfigBanner from "@/components/ConfigBanner";
import FilePicker from "@/components/FilePicker";
import BarreChargement from "@/components/BarreChargement";
import { useMetier } from "@/components/MetierProvider";

export default function ImportPage() {
  const router = useRouter();
  const { metier } = useMetier();
  const estVitrage = metier === "vitrage";
  const [file, setFile] = useState<File | null>(null);
  const [analyse, setAnalyse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Extraction | null>(null);
  const [showForm, setShowForm] = useState(false);
  // Analyse partielle : une des deux moitiés a abouti, pas l'autre.
  const [avertissement, setAvertissement] = useState<string | null>(null);

  async function analyser() {
    if (!file) return;
    setAnalyse(true);
    setError(null);
    setAvertissement(null);
    try {
      // Identités et chiffrage sont demandés EN PARALLÈLE : deux requêtes,
      // donc deux budgets de temps, et deux fois moins de texte à produire
      // par requête (c'est ce qui faisait expirer l'analyse des scans).
      const { data, avertissement: avert } = await analyserRapport(file);
      setPrefill(data);
      setAvertissement(avert);
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
      <h1 className="titre-page mb-2">
        {estVitrage ? "Importer une prise en charge" : "Importer un rapport d'expertise"}
      </h1>
      <p className="text-white/60 mb-6">
        {estVitrage
          ? "Dépose un document reçu de l'assureur (ordre de mission, accord de prise en charge). L'IA en extrait les informations (véhicule, client, assurance) et pré-remplit un dossier. Tu peux aussi partir d'une saisie manuelle."
          : "Dépose le rapport reçu du cabinet d'expert. L'IA en extrait les informations (véhicule, sinistre, client, expert, assurance) et pré-remplit un dossier complet."}
      </p>

      <ConfigBanner />

      <div className="glass-card p-6">
        <label className="field-label mb-2 block">
          {estVitrage ? "Document de prise en charge" : "Rapport d'expertise"}
        </label>

        {/* Vrai bouton de sélection + glisser-déposer + photo (v6.7) */}
        <FilePicker
          value={file}
          onChange={(f) => { setFile(f); setError(null); }}
          disabled={analyse}
          label={estVitrage ? "Choisir le document" : "Choisir le rapport"}
          aide={
            estVitrage
              ? "PDF, JPG ou PNG — ou glisse le document de prise en charge ici"
              : "PDF, JPG ou PNG — ou glisse le rapport d'expertise ici"
          }
        />

        {error && (
          <div className="mt-4 rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}
        {avertissement && (
          <div className="mt-4 rounded-lg bg-amber-500/15 border border-amber-400/30 px-3 py-2 text-sm text-amber-100">
            {avertissement}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={analyser} disabled={!file || analyse} className="btn-primary">
            {analyse ? "Analyse en cours…" : estVitrage ? "Analyser le document" : "Analyser le rapport"}
          </button>
          <button onClick={saisieManuelle} disabled={analyse} className="btn-ghost">
            Saisie manuelle
          </button>
        </div>
        {!file && (
          <p className="mt-2 text-xs text-white/40">
            Choisis d&apos;abord un fichier pour lancer l&apos;analyse — ou passe en saisie manuelle.
          </p>
        )}

        <BarreChargement actif={analyse} />
      </div>

      {showForm && (
        <DossierForm
          prefill={prefill}
          prefillFile={file}
          prefillLignes={prefill?.lignes}
          prefillMentions={prefill?.mentions ?? null}
          prefillTva={prefill?.tva ?? null}
          onClose={() => setShowForm(false)}
          onSaved={(id) => router.push(id ? `/sinistres/${id}` : "/sinistres")}
        />
      )}
    </div>
  );
}
