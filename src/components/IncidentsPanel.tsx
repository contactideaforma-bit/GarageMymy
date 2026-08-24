"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { Incident, NIVEAUX_INCIDENT, chargerEtat, depuis, infoNiveau } from "@/lib/etatService";

/**
 * PUBLICATION D'UN INCIDENT (v45) — console de l'éditeur.
 *
 * Deux gestes seulement : publier (titre + une phrase + niveau) et
 * clore. Entre les deux, on peut pousser une note de suivi, qui remplace
 * le message dans le bandeau des garages.
 */
export default function IncidentsPanel() {
  const [actifs, setActifs] = useState<Incident[]>([]);
  const [historique, setHistorique] = useState<Incident[]>([]);
  const [ouvertFormulaire, setOuvertFormulaire] = useState(false);
  const [titre, setTitre] = useState("");
  const [message, setMessage] = useState("");
  const [perimetre, setPerimetre] = useState("");
  const [niveau, setNiveau] = useState("degrade");
  const [suivis, setSuivis] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const e = await chargerEtat();
    setActifs(e.actifs);
    setHistorique(e.historique);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function appeler(corps: Record<string, unknown>) {
    setBusy(true);
    setErreur(null);
    const res = await fetchAuth("/api/etat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    const { ok, error } = await lireReponse(res);
    if (!ok) setErreur(error);
    else await charger();
    setBusy(false);
    return ok;
  }

  async function publier() {
    if (!titre.trim() || !message.trim()) {
      setErreur("Un titre et une phrase d'explication sont obligatoires.");
      return;
    }
    const ok = await appeler({ titre, message, niveau, perimetre });
    if (ok) {
      setTitre("");
      setMessage("");
      setPerimetre("");
      setOuvertFormulaire(false);
    }
  }

  return (
    <section className="glass-card p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="titre-section">
          État du service
          {actifs.length > 0 && <span className="badge badge-danger ml-2">{actifs.length} en cours</span>}
        </h2>
        <div className="flex items-center gap-2">
          <Link href="/etat" target="_blank" className="text-xs text-white/45 hover:text-white hover:underline">
            Voir la page publique ↗
          </Link>
          <button onClick={() => setOuvertFormulaire((v) => !v)} className="btn-ghost btn-compact">
            {ouvertFormulaire ? "Annuler" : "Publier un incident"}
          </button>
        </div>
      </div>

      {ouvertFormulaire && (
        <div className="glass-soft mb-3 space-y-3 rounded-lg p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="field-label">Titre (vu par tous les garages)</label>
              <input
                className="field-input"
                placeholder="Ex. : l'analyse des rapports est indisponible"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Niveau</label>
              <select className="field-input" value={niveau} onChange={(e) => setNiveau(e.target.value)}>
                {NIVEAUX_INCIDENT.map((n) => (
                  <option key={n.code} value={n.code}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">Ce qui est touché (facultatif)</label>
            <input
              className="field-input"
              placeholder="Analyse des rapports · Envoi des emails · Signature à distance…"
              value={perimetre}
              onChange={(e) => setPerimetre(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Une phrase claire + ce qu&apos;on peut faire en attendant</label>
            <textarea
              className="field-input min-h-[80px]"
              placeholder="Notre fournisseur d'analyse est en panne. Les dossiers peuvent être saisis à la main en attendant ; rien n'est perdu."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <button onClick={publier} disabled={busy} className="btn-primary btn-compact">
            Publier maintenant
          </button>
        </div>
      )}

      {erreur && (
        <div className="mb-3 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
          {erreur}
        </div>
      )}

      {actifs.length === 0 ? (
        <p className="py-2 text-sm text-emerald-300/80">
          Aucun incident publié — les garages voient « tout fonctionne normalement ».
        </p>
      ) : (
        <div className="space-y-2">
          {actifs.map((i) => (
            <div key={i.id} className="carte-liste p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{i.titre}</p>
                  <p className="text-[11px] text-white/45">
                    {i.perimetre ? `${i.perimetre} · ` : ""}
                    {depuis(i.debut)} · publié le {formatDateTime(i.debut)}
                  </p>
                </div>
                <span className={infoNiveau(i.niveau).badge}>{infoNiveau(i.niveau).label}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  className="field-input field-compact flex-1"
                  placeholder="Note de suivi (remplace le message dans le bandeau)…"
                  value={suivis[i.id] ?? ""}
                  onChange={(e) => setSuivis((s) => ({ ...s, [i.id]: e.target.value }))}
                />
                <button
                  onClick={() => appeler({ id: i.id, suivi: suivis[i.id] || "" })}
                  disabled={busy}
                  className="btn-ghost btn-compact"
                >
                  Mettre à jour
                </button>
                <button
                  onClick={() => appeler({ id: i.id, resoudre: true })}
                  disabled={busy}
                  className="btn-ghost btn-compact"
                  title="Marquer l'incident comme résolu"
                >
                  ✅ Clore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {historique.length > 0 && (
        <p className="mt-3 text-[11px] text-white/35">
          {historique.length} incident{historique.length > 1 ? "s" : ""} résolu
          {historique.length > 1 ? "s" : ""} dans l&apos;historique public.
        </p>
      )}
    </section>
  );
}
