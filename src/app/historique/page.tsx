"use client";

// ====================================================================
//  HISTORIQUE (v12.5) — « qu'est-ce qui a été fait ces 30 derniers jours ? »
//
//  Deux volets :
//   · Actions : journal reconstitué (dossiers, devis/factures, paiements,
//     emails, tâches, heures, pièces, agenda, suppressions), filtrable par
//     famille et par texte, regroupé par jour.
//   · Supprimé récemment : la corbeille (migration v69), avec RESTAURER.
// ====================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ConfigBanner from "@/components/ConfigBanner";
import StatCard from "@/components/StatCard";
import { LigneCorbeille } from "@/lib/types";
import { formatDateTime, messageErreur } from "@/lib/format";
import {
  ActionHistorique, DossierCourt, FAMILLES, FamilleAction, JOURS_HISTORIQUE, chargerCorbeille, chargerHistorique,
  corbeilleVisible, grouperParJour, labelTable, libelleDossierCourt, libelleJour, purgerDeCorbeille, restaurerDepuisCorbeille,
} from "@/lib/historique";

type Volet = "actions" | "corbeille";

const COULEUR_FAMILLE: Record<FamilleAction, string> = {
  dossier: "bg-violet-500/20 text-violet-100 border-violet-400/30",
  document: "bg-sky-500/20 text-sky-100 border-sky-400/30",
  paiement: "bg-emerald-500/20 text-emerald-100 border-emerald-400/30",
  email: "bg-pink-500/20 text-pink-100 border-pink-400/30",
  tache: "bg-amber-500/20 text-amber-100 border-amber-400/30",
  heures: "bg-teal-500/20 text-teal-100 border-teal-400/30",
  piece: "bg-orange-500/20 text-orange-100 border-orange-400/30",
  evenement: "bg-indigo-500/20 text-indigo-100 border-indigo-400/30",
  suppression: "bg-rose-500/20 text-rose-100 border-rose-400/30",
};

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function HistoriquePage() {
  const [volet, setVolet] = useState<Volet>("actions");
  const [actions, setActions] = useState<ActionHistorique[]>([]);
  const [dossiers, setDossiers] = useState<Map<string, DossierCourt>>(new Map());
  const [corbeille, setCorbeille] = useState<LigneCorbeille[]>([]);
  const [corbeilleDispo, setCorbeilleDispo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [famille, setFamille] = useState<FamilleAction | "tout">("tout");
  const [recherche, setRecherche] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    const [h, c] = await Promise.all([
      chargerHistorique(),
      chargerCorbeille().then((l) => { setCorbeilleDispo(true); return l; }).catch(() => { setCorbeilleDispo(false); return [] as LigneCorbeille[]; }),
    ]);
    setActions(h.actions);
    setDossiers(h.dossiers);
    setCorbeille(c);
    setLoading(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return actions.filter((a) => {
      if (famille !== "tout" && a.famille !== famille) return false;
      if (!q) return true;
      const d = a.dossier_id ? dossiers.get(a.dossier_id) : null;
      const texte = `${a.titre} ${a.detail || ""} ${d ? `${d.immatriculation || ""} ${d.numero_sinistre || ""} ${d.client_nom || ""}` : ""}`.toLowerCase();
      return texte.includes(q);
    });
  }, [actions, famille, recherche, dossiers]);

  const groupes = useMemo(() => grouperParJour(visibles), [visibles]);
  const corbeilleVisibles = useMemo(() => corbeille.filter(corbeilleVisible), [corbeille]);

  const compte = (f: FamilleAction) => actions.filter((a) => a.famille === f).length;

  async function restaurer(l: LigneCorbeille) {
    const enfants = l.table_name === "dossiers" ? corbeille.filter((x) => x.dossier_id === l.ligne_id && x.table_name !== "dossiers").length : 0;
    const question = l.table_name === "dossiers"
      ? `Restaurer le dossier « ${l.libelle || ""} »${enfants ? ` et les ${enfants} éléments supprimés avec lui (documents, paiements, tâches…)` : ""} ?`
      : `Restaurer « ${labelTable(l.table_name)} — ${l.libelle || ""} » ?`;
    if (!confirm(question)) return;
    setBusy(l.id);
    setMessage(null);
    try {
      const n = await restaurerDepuisCorbeille(l, corbeille);
      setMessage({ ok: true, texte: `${n} élément${n > 1 ? "s" : ""} restauré${n > 1 ? "s" : ""}.` });
      await charger();
    } catch (e) {
      setMessage({ ok: false, texte: messageErreur(e, "Restauration impossible.") });
    } finally {
      setBusy(null);
    }
  }

  async function purger(l: LigneCorbeille) {
    if (!confirm(`Supprimer DÉFINITIVEMENT « ${l.libelle || labelTable(l.table_name)} » de la corbeille ? Cette action est irréversible.`)) return;
    setBusy(l.id);
    try {
      await purgerDeCorbeille(l, corbeille);
      await charger();
    } catch (e) {
      setMessage({ ok: false, texte: messageErreur(e, "Suppression impossible.") });
    } finally {
      setBusy(null);
    }
  }

  const ChipDossier = ({ id }: { id: string | null | undefined }) => {
    if (!id) return null;
    const d = dossiers.get(id);
    if (!d) return <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/40">📁 dossier supprimé</span>;
    return (
      <Link href={`/sinistres/${id}`} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80 hover:bg-white/20" title={d.client_nom || ""}>
        📁 {libelleDossierCourt(d)}
      </Link>
    );
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="titre-page">Historique</h1>
          <p className="mt-1 text-sm text-white/50">Tout ce qui a été fait dans l&apos;appli sur les {JOURS_HISTORIQUE} derniers jours, et ce qui a été supprimé.</p>
        </div>
        <div className="segment">
          <button className={`segment-btn ${volet === "actions" ? "actif" : ""}`} onClick={() => setVolet("actions")}>
            Actions ({actions.length})
          </button>
          <button className={`segment-btn ${volet === "corbeille" ? "actif" : ""}`} onClick={() => setVolet("corbeille")}>
            🗑 Supprimé récemment ({corbeilleVisibles.length})
          </button>
        </div>
      </div>
      <ConfigBanner />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Actions (30 j)" value={String(actions.length)} icone="📋" />
        <StatCard label="Devis & factures" value={String(compte("document"))} accent="teal" icone="🧾" />
        <StatCard label="Emails" value={String(compte("email"))} accent="pink" icone="✉️" />
        <StatCard label="Restaurables" value={String(corbeilleVisibles.length)} accent="violet" icone="🗑" hint="conservés 30 jours" />
      </div>

      {message && (
        <p className={`badge ${message.ok ? "badge-ok" : "badge-danger"} mb-3`}>{message.texte}</p>
      )}

      {volet === "actions" && (
        <section className="glass-card p-3 sm:p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-1">
              {FAMILLES.map((f) => (
                <button
                  key={f.code}
                  onClick={() => setFamille(f.code)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    famille === f.code ? "border-accent-pink/60 bg-white/15 text-white" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {f.icone ? `${f.icone} ` : ""}{f.label}
                  {f.code !== "tout" && <span className="ml-1 text-white/40">{compte(f.code)}</span>}
                </button>
              ))}
            </div>
            <input
              className="field-input field-compact md:w-64"
              placeholder="Rechercher (texte, immat, client)…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>

          {loading && <p className="mt-4 text-sm text-white/40">Chargement…</p>}
          {!loading && groupes.length === 0 && (
            <p className="mt-4 text-sm text-white/40">Aucune action sur cette période{famille !== "tout" || recherche ? " avec ces filtres" : ""}.</p>
          )}

          <div className="mt-3 space-y-4">
            {groupes.map((g) => (
              <div key={g.jour}>
                <div className="sticky top-0 z-[1] -mx-1 mb-1 flex items-center gap-2 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-white/50 backdrop-blur-sm">
                  <span>{libelleJour(g.jour)}</span>
                  <span className="text-white/30">· {g.actions.length}</span>
                </div>
                <ul className="divide-y divide-white/5">
                  {g.actions.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 py-2 text-sm">
                      <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-white/40">{heure(a.quand)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-white/85">{a.titre}</span>
                        {a.detail && <span className="block break-words text-xs text-white/50">{a.detail}</span>}
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${COULEUR_FAMILLE[a.famille]}`}>
                            {FAMILLES.find((f) => f.code === a.famille)?.label}
                          </span>
                          {a.auteur && (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">
                              {a.auteur === "secretaire" ? "🗂️ Secrétaire" : "🔧 Garage"}
                            </span>
                          )}
                          <ChipDossier id={a.dossier_id} />
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {volet === "corbeille" && (
        <section className="glass-card p-3 sm:p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="titre-bloc">Supprimé récemment</h2>
            <span className="text-xs text-white/45">Conservé {JOURS_HISTORIQUE} jours, puis effacé pour de bon.</span>
          </div>
          {!corbeilleDispo && (
            <p className="alerte alerte-warn mt-3 text-sm">
              La corbeille n&apos;est pas encore active : exécute la migration v69 dans Supabase (SQL Editor) pour que les suppressions deviennent restaurables.
            </p>
          )}
          {corbeilleDispo && !loading && corbeilleVisibles.length === 0 && (
            <p className="mt-3 text-sm text-white/40">Rien n&apos;a été supprimé ces {JOURS_HISTORIQUE} derniers jours.</p>
          )}
          <p className="mt-2 text-xs text-white/40">
            Restaurer un dossier ramène aussi ce qui a disparu avec lui (devis, factures, paiements, tâches, pièces…). Les fichiers déposés (rapport, cartes grises, photos) sont conservés.
          </p>
          <ul className="mt-3 divide-y divide-white/5">
            {corbeilleVisibles.map((l) => {
              const enfants = l.table_name === "dossiers" ? corbeille.filter((x) => x.dossier_id === l.ligne_id && x.table_name !== "dossiers").length : 0;
              const dossier = l.dossier_id && l.table_name !== "dossiers" ? dossiers.get(l.dossier_id) : null;
              const parentSupprime = Boolean(l.dossier_id && l.table_name !== "dossiers" && !dossier);
              return (
                <li key={l.id} className="flex flex-wrap items-start gap-2 py-2.5 text-sm sm:flex-nowrap">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-white/85">
                      <span className="text-white/50">{labelTable(l.table_name)}</span>
                      {l.libelle ? ` — ${l.libelle}` : ""}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-white/45">
                      <span>Supprimé le {formatDateTime(l.supprime_le)}</span>
                      {enfants > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5">+ {enfants} élément{enfants > 1 ? "s" : ""} liés</span>}
                      {dossier && <ChipDossier id={l.dossier_id} />}
                      {parentSupprime && <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-200">dossier parent supprimé — restaure d&apos;abord le dossier</span>}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button
                      className="btn-primary btn-compact"
                      disabled={busy === l.id || parentSupprime}
                      onClick={() => restaurer(l)}
                      title={parentSupprime ? "Le dossier parent doit être restauré avant" : "Remettre en place"}
                    >
                      {busy === l.id ? "…" : "↩ Restaurer"}
                    </button>
                    <button className="btn-ghost btn-compact text-rose-200" disabled={busy === l.id} onClick={() => purger(l)} title="Effacer définitivement">
                      ×
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
