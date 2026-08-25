"use client";

// RECHERCHE DE SIREN (v52) — bouton « 🔍 SIREN » + liste de résultats.
// Interroge /api/siren (annuaire public des entreprises) avec le nom de la
// société ; un clic sur un résultat renvoie SIREN + adresse + TVA au parent,
// qui décide quoi remplir (jamais d'écrasement d'une adresse déjà saisie).

import { useState } from "react";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import type { ResultatSiren } from "@/app/api/siren/route";

export type { ResultatSiren };

export async function rechercherSiren(q: string): Promise<{ resultats: ResultatSiren[]; error: string | null }> {
  const res = await fetchAuth(`/api/siren?q=${encodeURIComponent(q)}`);
  const r = await lireReponse<{ resultats: ResultatSiren[] }>(res);
  return { resultats: r.data?.resultats || [], error: r.ok ? null : r.error };
}

export default function RechercheSiren({
  nom,
  onChoisir,
  compact = false,
}: {
  /** Nom de la société à chercher (le champ « Nom » du formulaire). */
  nom: string;
  onChoisir: (r: ResultatSiren) => void;
  compact?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultats, setResultats] = useState<ResultatSiren[]>([]);
  const [requete, setRequete] = useState("");

  async function chercher(q: string) {
    const terme = q.trim();
    if (!terme) return setErreur("Saisissez d'abord le nom de la société.");
    setBusy(true);
    setErreur(null);
    const r = await rechercherSiren(terme);
    setResultats(r.resultats);
    setErreur(r.error || (r.resultats.length ? null : "Aucune entreprise trouvée — essayez avec moins de mots."));
    setBusy(false);
    setOuvert(true);
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={compact ? "btn-ghost btn-compact whitespace-nowrap" : "btn-ghost whitespace-nowrap"}
        disabled={busy}
        onClick={() => { setRequete(nom); chercher(nom); }}
        title="Trouver le SIREN dans l'annuaire officiel des entreprises"
      >
        {busy ? "Recherche…" : "🔍 SIREN"}
      </button>

      {ouvert && (
        <div className="absolute right-0 z-30 mt-2 w-[min(28rem,90vw)] rounded-lg border-2 border-white/20 bg-[var(--mea-surface)] p-3 shadow-xl">
          <div className="flex gap-2">
            <input
              className="field-input field-compact flex-1"
              value={requete}
              placeholder="Nom de la société"
              onChange={(e) => setRequete(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); chercher(requete); } }}
              autoFocus
            />
            <button type="button" className="btn-ghost btn-compact" onClick={() => chercher(requete)} disabled={busy}>OK</button>
            <button type="button" className="btn-ghost btn-compact" onClick={() => setOuvert(false)} aria-label="Fermer">✕</button>
          </div>
          {erreur && <p className="mt-2 text-xs text-amber-300">{erreur}</p>}
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {resultats.map((r) => (
              <li key={r.siren}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1.5 text-left hover:bg-white/10"
                  onClick={() => { onChoisir(r); setOuvert(false); }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-white">{r.nom}</span>
                    <span className="shrink-0 font-mono text-xs text-accent-teal">{r.siren.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}</span>
                  </div>
                  <div className="truncate text-[11px] text-white/50">
                    {[r.adresse, [r.codePostal, r.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Adresse non renseignée"}
                    {!r.actif ? " · entreprise cessée" : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-white/35">Source : annuaire des entreprises (INSEE / RNE), données publiques.</p>
        </div>
      )}
    </div>
  );
}
