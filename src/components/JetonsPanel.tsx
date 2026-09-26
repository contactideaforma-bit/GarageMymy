"use client";

// ============================================================
//  MES JETONS COURRIERS (v13.28)
//  Solde, grille (lettre = 1 jeton, recommandé = 5), achat d'un
//  pack par lien de paiement Qonto, suivi des paiements et journal.
// ============================================================

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AchatJetons, FEUILLES_TRANCHE_1, JETONS_PAR_ENVOI, LIBELLE_MOTIF, MouvementJetons, PACKS_JETONS, prixUnitaireHt, ttc } from "@/lib/jetons";
import { acheterPack, lireHistoriqueJetons, lireSoldeJetons, verifierPaiements } from "@/lib/jetonsClient";
import { formatDateTime, formatEuros } from "@/lib/format";
import ModalShell from "./ModalShell";

export default function JetonsPanel({ onSolde }: { onSolde?: (s: number) => void }) {
  const [solde, setSolde] = useState<number | null>(null);
  const [migration, setMigration] = useState(true);
  const [mouvements, setMouvements] = useState<MouvementJetons[]>([]);
  const [achats, setAchats] = useState<AchatJetons[]>([]);
  const [achat, setAchat] = useState<string | null>(null); // pack choisi
  const [accepte, setAccepte] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);
  const [journal, setJournal] = useState(false);

  const charger = useCallback(async () => {
    const s = await lireSoldeJetons();
    if (s === null) { setMigration(false); return; }
    setSolde(s); onSolde?.(s);
    const h = await lireHistoriqueJetons();
    setMouvements(h.mouvements); setAchats(h.achats);
  }, [onSolde]);

  const verifier = useCallback(async (silencieux: boolean) => {
    if (!silencieux) setBusy("verif");
    const r = await verifierPaiements();
    if (!silencieux) setBusy(null);
    if (r.credites > 0) setMsg({ ok: true, texte: `Paiement reçu ✓ — ${r.credites > 1 ? "achats crédités" : "jetons crédités"}.` });
    else if (!silencieux) setMsg(r.error ? { ok: false, texte: r.error } : { ok: true, texte: "Aucun nouveau paiement pour l'instant. Un paiement par carte est confirmé en quelques secondes à quelques minutes." });
    await charger();
  }, [charger]);

  useEffect(() => { charger().then(() => verifier(true)); }, [charger, verifier]);
  // Retour sur l'onglet après avoir payé : on revérifie tout seul.
  useEffect(() => {
    const f = () => { if (document.visibilityState === "visible" && achats.some((a) => a.statut === "en_attente")) verifier(true); };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [achats, verifier]);

  async function payer() {
    if (!achat) return;
    setBusy("achat"); setMsg(null);
    const fenetre = window.open("", "_blank");
    const r = await acheterPack(achat);
    setBusy(null);
    if (r.error || !r.url) { fenetre?.close(); setMsg({ ok: false, texte: r.error || "Paiement indisponible." }); return; }
    if (fenetre) fenetre.location.href = r.url; else window.location.href = r.url;
    setAchat(null); setAccepte(false);
    setMsg({ ok: true, texte: "Page de paiement ouverte dans un nouvel onglet. Les jetons arrivent ici dès que le paiement est confirmé." });
    charger();
  }

  const enAttente = achats.filter((a) => a.statut === "en_attente");
  const pack = PACKS_JETONS.find((p) => p.id === achat);

  if (!migration) {
    return <div id="jetons" className="glass-card mb-6 p-4 text-sm text-amber-100">Jetons indisponibles : exécute <code>supabase/migration_v90.sql</code> dans Supabase.</div>;
  }

  return (
    <section id="jetons" className="glass-card mb-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="titre-bloc">Mes jetons courriers</h2>
          <p className="text-xs text-white/55">
            Lettre simple = {JETONS_PAR_ENVOI.simple} jeton · Recommandé AR = {JETONS_PAR_ENVOI.lrar} jetons · +{JETONS_PAR_ENVOI.supplementLourd} au-delà de {FEUILLES_TRANCHE_1} feuilles. Timbre, impression et mise sous pli compris.
          </p>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-bold ${solde !== null && solde < JETONS_PAR_ENVOI.lrar ? "text-amber-300" : "text-white"}`}>{solde ?? "…"}</div>
          <div className="text-[11px] uppercase tracking-wide text-white/50">jeton{(solde || 0) > 1 ? "s" : ""} disponible{(solde || 0) > 1 ? "s" : ""}</div>
        </div>
      </div>

      {solde !== null && solde < JETONS_PAR_ENVOI.lrar && (
        <p className="mt-2 text-xs text-amber-200">Solde bas : il ne permet plus d&apos;envoyer un recommandé. Recharge ci-dessous.</p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {PACKS_JETONS.map((p) => (
          <button key={p.id} type="button" onClick={() => { setAchat(p.id); setMsg(null); }} className="glass-soft relative p-3 text-left transition hover:bg-white/10">
            {p.mention && <span className="badge badge-info absolute right-2 top-2">{p.mention}</span>}
            <div className="text-sm font-semibold text-white">{p.libelle}</div>
            <div className="text-2xl font-bold text-white">{p.jetons} <span className="text-sm font-normal text-white/60">jetons</span></div>
            <div className="text-sm text-white/80">{formatEuros(p.prixHt)} HT <span className="text-white/50">· {formatEuros(ttc(p.prixHt))} TTC</span></div>
            <div className="text-xs text-white/50">soit {formatEuros(prixUnitaireHt(p))} HT le jeton · ≈ {Math.floor(p.jetons / JETONS_PAR_ENVOI.lrar)} recommandés</div>
          </button>
        ))}
      </div>

      {enAttente.length > 0 && (
        <div className="mt-3 rounded-lg border border-sky-400/30 bg-sky-500/10 p-3 text-sm text-sky-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{enAttente.length} paiement{enAttente.length > 1 ? "s" : ""} en attente de confirmation.</span>
            <div className="flex flex-wrap gap-1">
              {enAttente[0]?.qonto_url && <a href={enAttente[0].qonto_url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-compact">Reprendre le paiement</a>}
              <button onClick={() => verifier(false)} disabled={busy !== null} className="btn-primary btn-compact">{busy === "verif" ? "Vérification…" : "J'ai payé — vérifier"}</button>
            </div>
          </div>
        </div>
      )}

      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.texte}</p>}

      <div className="mt-3">
        <button onClick={() => setJournal(!journal)} className="text-xs font-semibold text-accent-pink hover:underline">{journal ? "▴ Masquer l'historique" : "▾ Historique des jetons"}</button>
        {journal && (
          <ul className="mt-2 divide-y divide-white/10 text-sm">
            {mouvements.length === 0 && <li className="py-2 text-white/45">Aucun mouvement pour l&apos;instant.</li>}
            {mouvements.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate text-white/80"><span className="text-white/45">{formatDateTime(m.created_at)}</span> · {LIBELLE_MOTIF[m.motif] || m.motif}{m.libelle ? ` — ${m.libelle}` : ""}</span>
                <span className={`shrink-0 font-mono ${m.delta > 0 ? "text-emerald-300" : "text-white/80"}`}>{m.delta > 0 ? "+" : ""}{m.delta}{m.solde_apres !== null ? <span className="text-white/40"> → {m.solde_apres}</span> : null}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pack && (
        <ModalShell title={`Acheter — ${pack.libelle}`} onClose={() => setAchat(null)}>
          <div className="glass-soft p-3 text-sm text-white/85">
            <div className="text-lg font-semibold text-white">{pack.jetons} jetons courriers La Poste</div>
            <div>{formatEuros(pack.prixHt)} HT · <strong>{formatEuros(ttc(pack.prixHt))} TTC</strong></div>
            <div className="mt-1 text-xs text-white/55">Paiement sécurisé Qonto : carte bancaire, Apple Pay ou PayPal. Facture adressée par IDEAFORMA (My Easy Auto).</div>
          </div>
          <label className="flex items-start gap-2 text-sm text-white/85">
            <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} className="mt-0.5 h-4 w-4 accent-pink-500" />
            <span>J&apos;accepte les <Link href="/cgu#jetons" target="_blank" className="text-accent-teal hover:underline">conditions d&apos;achat et d&apos;utilisation des jetons</Link> (sans date d&apos;expiration, non remboursables, rendus automatiquement si un courrier n&apos;est pas parti).</span>
          </label>
          <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
            <button onClick={() => setAchat(null)} className="btn-ghost btn-compact">Annuler</button>
            <button onClick={payer} disabled={!accepte || busy !== null} className="btn-primary btn-compact">{busy === "achat" ? "Préparation du paiement…" : `Payer ${formatEuros(ttc(pack.prixHt))}`}</button>
          </div>
        </ModalShell>
      )}
    </section>
  );
}
