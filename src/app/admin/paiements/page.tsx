"use client";

// ============================================================
//  SUIVI DES PAIEMENTS (v13.33) — espace éditeur.
//  Une seule page pour savoir, en un coup d'œil : ce qui est en retard
//  (et relancer / suspendre), ce qui arrive (et envoyer un lien de
//  paiement Qonto), ce que je dois à mes collaborateurs, et comment
//  les relances automatiques sont réglées.
// ============================================================

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminShell, { ChampAdmin, dateFr, euros, moisFr } from "@/components/admin/AdminShell";
import ModalShell from "@/components/ModalShell";
import ConnexionQonto from "@/components/admin/ConnexionQonto";
import {
  LigneSuiviPaiement, SituationPaiements, appelMensualite, enregistrerParametres, envoyerDigestPaiements, lancerCronPaiements, lienPaiementMensualite, lireParametres, lireSituationPaiements,
  pointerMensualitePayee, reactiverAbonnement, relancerMensualite, suspendreAbonnementImpaye, verifierLiensQonto,
} from "@/lib/admin/client";
import { PARAMETRES_DEFAUT, Parametres, RelancesParams } from "@/lib/admin/economie";

const NIVEAUX: Record<number, { label: string; badge: string }> = {
  0: { label: "Pas encore relancé", badge: "badge badge-neutral" },
  1: { label: "Rappel envoyé", badge: "badge badge-info" },
  2: { label: "Relance envoyée", badge: "badge badge-warn" },
  3: { label: "Avertissement envoyé", badge: "badge badge-danger" },
  4: { label: "Suspendu", badge: "badge badge-danger" },
  5: { label: "Réactivé", badge: "badge badge-ok" },
};
const LIB_NIVEAU: Record<number, string> = { 1: "Rappel amical", 2: "Relance (15 jours, art. 5)", 3: "Dernier avertissement", 4: "Suspension du compte" };
const dateCourte = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

export default function PaiementsPage() {
  const [s, setS] = useState<SituationPaiements | null>(null);
  const [p, setP] = useState<Parametres>(PARAMETRES_DEFAUT);
  const [erreur, setErreur] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [relance, setRelance] = useState<LigneSuiviPaiement | null>(null);
  const [payee, setPayee] = useState<LigneSuiviPaiement | null>(null);
  const [reglages, setReglages] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sit, params] = await Promise.all([lireSituationPaiements(), lireParametres()]);
      setS(sit); setP(params); setErreur(null);
    } catch (e) { setErreur(e instanceof Error ? e.message : "Lecture impossible."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function action(cle: string, fn: () => Promise<string | void>) {
    setBusy(cle); setMsg(null);
    try { const m = await fn(); if (m) setMsg(m); await load(); } catch (e) { alert(e instanceof Error ? e.message : "Impossible."); } finally { setBusy(null); }
  }
  async function copierLien(l: LigneSuiviPaiement) {
    await action(`lien-${l.mensualite.id}`, async () => {
      const r = await lienPaiementMensualite(l.mensualite.id);
      try { await navigator.clipboard.writeText(r.url); return `Lien de paiement copié : ${r.url}`; } catch { return `Lien de paiement : ${r.url}`; }
    });
  }

  const nbSuspendus = s?.impayes.filter((l) => l.etatCompte === "suspendu").length || 0;

  return (
    <AdminShell
      titre="Suivi des paiements"
      actions={
        <>
          <button className="btn-ghost" onClick={() => setReglages(true)}>Réglages des relances</button>
          <button className="btn-ghost" disabled={busy === "cron"} onClick={() => action("cron", async () => { const r = await lancerCronPaiements(); return r.rapport.length ? r.rapport.join(" · ") : "Rien à faire aujourd'hui."; })} title="Exécute maintenant ce que le cron fait chaque matin : vérification des liens, relances automatiques, suspensions, digest">
            {busy === "cron" ? "…" : "Lancer le traitement du jour"}
          </button>
          <button className="btn-primary" disabled={busy === "digest"} onClick={() => action("digest", async () => ((await envoyerDigestPaiements()).envoye ? "Récapitulatif envoyé sur ta boîte." : "Rien à signaler : aucun email envoyé."))}>M&apos;envoyer le récap</button>
        </>
      }
    >
      {erreur && <p className="badge badge-danger">{erreur}</p>}
      {msg && <p className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{msg}</p>}

      {/* v13.38 — connexion OAuth Qonto (obligatoire pour les liens de paiement) */}
      <ConnexionQonto />

      {/* KPIs */}
      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi titre="Encaissé ce mois" valeur={`${euros(s.encaisseMois)} HT`} ton="ok" />
          <Kpi titre="Reste à encaisser ce mois" valeur={`${euros(s.aEncaisserMois)} HT`} ton="info" />
          <Kpi titre="En retard" valeur={`${euros(s.enRetard)} HT`} sous={`${s.impayes.length} mensualité${s.impayes.length > 1 ? "s" : ""}${nbSuspendus ? ` · ${nbSuspendus} compte${nbSuspendus > 1 ? "s" : ""} suspendu${nbSuspendus > 1 ? "s" : ""}` : ""}`} ton={s.impayes.length ? "danger" : "ok"} />
          <Kpi titre="À payer à mes collaborateurs" valeur={euros(s.totalCollaborateurs)} sous={s.collaborateurs.some((c) => c.enRetard) ? "⚠️ des lignes attendent depuis trop longtemps" : `${s.collaborateurs.length} collaborateur${s.collaborateurs.length > 1 ? "s" : ""}`} ton={s.collaborateurs.some((c) => c.enRetard) ? "warn" : "neutral"} />
        </div>
      )}

      {s && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
          <span className={`badge ${s.qonto ? "badge-ok" : "badge-warn"}`}>{s.qonto ? "Paiement en ligne Qonto : actif" : "Qonto non configuré (voir « Connexion Qonto »)"}</span>
          <span className={`badge ${s.relances.auto ? "badge-ok" : "badge-neutral"}`}>Relances auto : {s.relances.auto ? "ON" : "OFF"}</span>
          <span className={`badge ${s.relances.suspensionAuto ? "badge-ok" : "badge-neutral"}`}>Suspension auto : {s.relances.suspensionAuto ? `J+${s.relances.suspension}` : "OFF"}</span>
          <span>Échéance le {s.relances.jourEcheance} du mois · rappel J+{s.relances.rappel} · relance J+{s.relances.relance} · avertissement J+{s.relances.avertissement} · suspension J+{s.relances.suspension}</span>
          {s.qonto && <button className="text-accent-teal hover:underline" disabled={busy === "verif"} onClick={() => action("verif", async () => { const r = await verifierLiensQonto(); return `${r.verifies} lien(s) vérifié(s), ${r.payees} paiement(s) pointé(s).`; })}>Vérifier les liens de paiement</button>}
        </div>
      )}

      {/* IMPAYÉS */}
      <section className="glass-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="titre-bloc">🔴 Impayés — à relancer</h2>
          <span className="text-xs text-white/50">Mensualités échues non encaissées, du plus ancien retard au plus récent.</span>
        </div>
        {!s ? <p className="mt-2 text-sm text-white/40">Chargement…</p> : s.impayes.length === 0 ? (
          <p className="mt-3 text-sm text-emerald-200">Aucun impayé : tous les garages sont à jour. 🎉</p>
        ) : (
          <div className="mt-3 space-y-2">
            {s.impayes.map((l) => {
              const niv = Number(l.mensualite.relance_niveau) || 0;
              const n = NIVEAUX[l.etatCompte === "suspendu" ? 4 : niv];
              const enAvance = l.palierDu > niv;
              return (
                <div key={l.mensualite.id} className={`rounded-xl border p-3 ${l.etatCompte === "suspendu" ? "border-rose-400/40 bg-rose-500/10" : l.joursRetard >= s.relances.avertissement ? "border-amber-400/40 bg-amber-500/10" : "border-white/15"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{l.abonnement.garage_nom}</span>
                        <span className="badge badge-danger">{l.joursRetard} j de retard</span>
                        <span className={n.badge}>{n.label}</span>
                        {enAvance && l.etatCompte !== "suspendu" && <span className="badge badge-warn" title="Le retard justifie un palier supérieur au dernier envoyé">→ {LIB_NIVEAU[l.palierDu]} due</span>}
                        {l.mensualite.qonto_url && <span className="badge badge-info">lien de paiement {l.mensualite.qonto_statut || "ouvert"}</span>}
                      </div>
                      <div className="mt-1 text-sm text-white/75">{moisFr(l.mensualite.periode)} · <b className="text-white">{euros(l.montantTtc)} TTC</b> ({euros(l.mensualite.montant_ht)} HT) · échéance {dateFr(l.echeance)} · {l.email || "sans email"}{l.mensualite.relance_le ? ` · dernière relance ${dateFr(l.mensualite.relance_le.slice(0, 10))}` : ""}</div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                      <button className="text-accent-pink hover:underline" onClick={() => setRelance(l)}>Relancer</button>
                      {s.qonto && <button className="text-accent-teal hover:underline" disabled={busy === `lien-${l.mensualite.id}`} onClick={() => copierLien(l)}>{l.mensualite.qonto_url ? "Copier le lien" : "Créer un lien de paiement"}</button>}
                      <button className="text-emerald-300 hover:underline" onClick={() => setPayee(l)}>Marquer payée</button>
                      {l.etatCompte === "suspendu" ? (
                        <button className="text-amber-200 hover:underline" disabled={busy === `react-${l.abonnement.id}`} onClick={() => { if (confirm(`Réactiver l'accès de ${l.abonnement.garage_nom} sans attendre le paiement ?`)) action(`react-${l.abonnement.id}`, async () => { await reactiverAbonnement(l.abonnement.id); return "Accès réactivé."; }); }}>Réactiver</button>
                      ) : l.owner_id ? (
                        <button className="text-rose-300 hover:underline" disabled={busy === `susp-${l.abonnement.id}`} onClick={() => { if (confirm(`Suspendre l'accès de ${l.abonnement.garage_nom} pour impayé ?\nLe garage ne pourra plus utiliser l'application jusqu'au règlement (CGV art. 5).`)) action(`susp-${l.abonnement.id}`, async () => (await suspendreAbonnementImpaye(l.abonnement.id)).message); }}>Suspendre</button>
                      ) : (
                        <span className="text-white/35" title="Aucun compte de connexion rattaché (Abonnements → Créer le compte)">Sans compte</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* À VENIR */}
      <section className="glass-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="titre-bloc">🟠 Paiements à venir (45 jours)</h2>
          <span className="text-xs text-white/50">{s?.relances.appelAuto ? `Chaque garage reçoit automatiquement son lien de paiement ${s.relances.appelJours} jours avant l'échéance ; le pointage se fait tout seul quand il paie.` : "Appels automatiques désactivés (Réglages des relances) : envoie l'appel à la main."}</span>
        </div>
        {!s ? null : s.aVenir.length === 0 ? <p className="mt-3 text-sm text-white/50">Rien à venir sur les 45 prochains jours (génère les mensualités manquantes depuis Abonnements).</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-white/40"><tr><th className="py-1 pr-3">Garage</th><th className="py-1 pr-3">Mois</th><th className="py-1 pr-3">Échéance</th><th className="py-1 pr-3 text-right">Montant TTC</th><th className="py-1 pr-3">Lien</th><th className="py-1"></th></tr></thead>
              <tbody>
                {s.aVenir.map((l) => (
                  <tr key={l.mensualite.id} className="border-t border-white/10">
                    <td className="py-1.5 pr-3 font-medium text-white">{l.abonnement.garage_nom}</td>
                    <td className="py-1.5 pr-3 text-white/75">{moisFr(l.mensualite.periode)}</td>
                    <td className="py-1.5 pr-3 text-white/75">{dateCourte(l.echeance)} <span className="text-white/40">({l.joursRetard === 0 ? "aujourd'hui" : `dans ${-l.joursRetard} j`})</span></td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-white">{euros(l.montantTtc)}</td>
                    <td className="py-1.5 pr-3">{l.mensualite.qonto_url ? <span className="badge badge-info">{l.mensualite.qonto_statut || "ouvert"}</span> : <span className="text-white/35">—</span>}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {s.qonto && <button className="text-accent-teal hover:underline mr-3" disabled={busy === `lien-${l.mensualite.id}`} onClick={() => copierLien(l)}>{l.mensualite.qonto_url ? "Copier le lien" : "Créer un lien"}</button>}
                      {l.mensualite.appel_le ? (
                        <span className="mr-3 text-xs text-emerald-300" title="Appel de paiement envoyé avant l'échéance">✉️ appel envoyé le {new Date(l.mensualite.appel_le).toLocaleDateString("fr-FR")}</span>
                      ) : (
                        <button className="text-accent-pink hover:underline mr-3" disabled={busy === `appel-${l.mensualite.id}`} onClick={() => action(`appel-${l.mensualite.id}`, async () => { const r = await appelMensualite(l.mensualite.id); return r.ok ? `Appel de paiement envoyé à ${r.email}.` : `Échec : ${r.erreur}`; })}>{busy === `appel-${l.mensualite.id}` ? "Envoi…" : "Envoyer l'appel de paiement"}</button>
                      )}
                      <button className="text-emerald-300 hover:underline" onClick={() => setPayee(l)}>Payée</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* COLLABORATEURS */}
      <section className="glass-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="titre-bloc">🟣 À payer à mes collaborateurs</h2>
          <Link href="/admin/reglements" className="text-sm text-accent-teal hover:underline">Ouvrir les relevés & paiements →</Link>
        </div>
        {!s ? null : s.collaborateurs.length === 0 ? <p className="mt-3 text-sm text-white/50">Rien en attente. Pense à « Générer le relevé » dans Relevés & paiements après le pointage des mensualités.</p> : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {s.collaborateurs.map((c) => (
              <div key={c.id} className={`rounded-xl border p-3 ${c.enRetard ? "border-amber-400/40 bg-amber-500/10" : "border-white/15"}`}>
                <div className="flex items-center justify-between gap-2"><span className="font-semibold text-white">{c.nom}</span><span className="text-lg font-bold tabular-nums text-white">{euros(c.total)}</span></div>
                <div className="mt-1 text-xs text-white/60">{c.lignes} ligne{c.lignes > 1 ? "s" : ""} à payer{c.plusAncienne ? ` · la plus ancienne du ${dateFr(c.plusAncienne.slice(0, 10))}` : ""}</div>
                {c.enRetard && <div className="mt-1 text-xs text-amber-200">⚠️ En attente depuis plus de {s.relances.delaiCollaborateurs} jours — à régler.</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* JOURNAL */}
      {s && s.journal.length > 0 && (
        <section className="glass-card p-4">
          <h2 className="titre-bloc">Journal des relances</h2>
          <div className="mt-2 space-y-1 text-xs">
            {s.journal.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-2 text-white/70">
                <span className="text-white/40">{new Date(j.created_at).toLocaleString("fr-FR")}</span>
                <span className={j.niveau === 0 ? "badge badge-ok" : NIVEAUX[j.niveau]?.badge || "badge badge-neutral"}>{j.niveau === 0 ? "Appel de paiement" : NIVEAUX[j.niveau]?.label || j.niveau}</span>
                <span className="text-white">{j.garage_nom}</span>
                <span>{j.email}</span>
                <span className="text-white/40">{j.canal === "auto" || j.canal === "appel_auto" ? "automatique" : j.auteur || "manuel"}</span>
                {!j.ok && <span className="text-rose-300">échec : {j.erreur}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {relance && s && (
        <RelanceModal ligne={relance} params={s.relances} qonto={s.qonto} onClose={() => setRelance(null)} onDone={(m) => { setRelance(null); setMsg(m); load(); }} />
      )}
      {payee && (
        <PayeeModal ligne={payee} onClose={() => setPayee(null)} onDone={(m) => { setPayee(null); setMsg(m); load(); }} />
      )}
      {reglages && (
        <ReglagesModal p={p} onClose={() => setReglages(false)} onSaved={() => { setReglages(false); load(); }} />
      )}
    </AdminShell>
  );
}

/* ------------------------------------------------------------------ */
function Kpi({ titre, valeur, sous, ton }: { titre: string; valeur: string; sous?: string; ton: "ok" | "info" | "danger" | "warn" | "neutral" }) {
  const bord = { ok: "border-emerald-400/40", info: "border-sky-400/40", danger: "border-rose-400/50", warn: "border-amber-400/50", neutral: "border-white/15" }[ton];
  return (
    <div className={`glass-card border p-4 ${bord}`}>
      <div className="text-[11px] uppercase tracking-wider text-white/45">{titre}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-white">{valeur}</div>
      {sous && <div className="mt-0.5 text-xs text-white/55">{sous}</div>}
    </div>
  );
}

function RelanceModal({ ligne: l, params, qonto, onClose, onDone }: { ligne: LigneSuiviPaiement; params: RelancesParams; qonto: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const dernier = Number(l.mensualite.relance_niveau) || 0;
  const suggere = (Math.max(1, Math.min(4, l.joursRetard > 0 ? Math.max(l.palierDu, dernier + 1) : 1)) as 1 | 2 | 3 | 4);
  const [niveau, setNiveau] = useState<1 | 2 | 3 | 4>(suggere);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function envoyer() {
    if (niveau === 4 && !confirm(`Envoyer l'email de suspension ET suspendre l'accès de ${l.abonnement.garage_nom} maintenant ?`)) return;
    setBusy(true); setErr(null);
    try {
      const r = await relancerMensualite(l.mensualite.id, niveau);
      if (!r.ok) throw new Error(r.erreur || "Envoi impossible.");
      onDone(`${LIB_NIVEAU[niveau]} envoyé à ${r.email}${r.suspendu ? " — compte suspendu" : ""}.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Impossible."); } finally { setBusy(false); }
  }
  return (
    <ModalShell title={`Relancer ${l.abonnement.garage_nom}`} onClose={onClose} maxWidth="max-w-lg">
      <p className="text-sm text-white/75">{moisFr(l.mensualite.periode)} · {euros(l.montantTtc)} TTC · échéance {dateFr(l.echeance)}{l.joursRetard > 0 ? ` · ${l.joursRetard} j de retard` : ""} · à {l.email}</p>
      <div className="mt-3 space-y-2">
        {([1, 2, 3, 4] as const).map((n) => (
          <label key={n} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${niveau === n ? "border-accent-pink bg-white/10" : "border-white/15"}`}>
            <input type="radio" className="mt-1" checked={niveau === n} onChange={() => setNiveau(n)} />
            <span>
              <span className="font-semibold text-white">{LIB_NIVEAU[n]}</span>{n === suggere && <span className="ml-2 badge badge-info">suggéré</span>}{n <= dernier && <span className="ml-2 text-xs text-white/40">déjà envoyé</span>}
              <span className="block text-xs text-white/60">
                {n === 1 && "Ton cordial : la mensualité était attendue, voici comment régler."}
                {n === 2 && `Formelle : 15 jours pour régulariser, mention de l'article 5 (suspension). Palier normal à J+${params.relance}.`}
                {n === 3 && `Dernier avertissement : suspension automatique dans ${Math.max(1, params.suspension - Math.max(0, l.joursRetard))} jour(s), pénalités de retard. Palier à J+${params.avertissement}.`}
                {n === 4 && `Email de suspension + accès coupé immédiatement (rétabli automatiquement au paiement). Palier à J+${params.suspension}.`}
              </span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-white/50">L&apos;email contient {qonto ? "le lien de paiement Qonto (créé automatiquement) et " : ""}les coordonnées de virement de la grille (IBAN/BIC). Tu es en copie cachée.</p>
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className={niveau === 4 ? "btn-danger" : "btn-primary"} disabled={busy} onClick={envoyer}>{busy ? "Envoi…" : niveau === 4 ? "Suspendre et prévenir" : "Envoyer"}</button>
      </div>
    </ModalShell>
  );
}

function PayeeModal({ ligne: l, onClose, onDone }: { ligne: LigneSuiviPaiement; onClose: () => void; onDone: (m: string) => void }) {
  const [mode, setMode] = useState("virement");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  async function ok() {
    setBusy(true);
    try { const r = await pointerMensualitePayee(l.mensualite.id, mode, date); onDone(`Mensualité de ${moisFr(l.mensualite.periode)} pointée pour ${l.abonnement.garage_nom}${r.reactive ? " — accès réactivé" : ""}.`); }
    catch (e) { alert(e instanceof Error ? e.message : "Impossible."); } finally { setBusy(false); }
  }
  return (
    <ModalShell title={`Paiement reçu — ${l.abonnement.garage_nom}`} onClose={onClose} maxWidth="max-w-md">
      <p className="text-sm text-white/75">{moisFr(l.mensualite.periode)} · {euros(l.montantTtc)} TTC</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <ChampAdmin label="Mode"><select className="field-input" value={mode} onChange={(e) => setMode(e.target.value)}><option value="virement">Virement</option><option value="qonto">Lien de paiement (CB)</option><option value="prelevement">Prélèvement</option><option value="cheque">Chèque</option><option value="especes">Espèces</option><option value="autre">Autre</option></select></ChampAdmin>
        <ChampAdmin label="Reçu le"><input className="field-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></ChampAdmin>
      </div>
      <p className="mt-2 text-xs text-white/50">Si le compte était suspendu pour impayé et que plus rien n&apos;est en retard, l&apos;accès est rétabli et le garage prévenu.</p>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={busy} onClick={ok}>{busy ? "…" : "Confirmer l'encaissement"}</button></div>
    </ModalShell>
  );
}

function ReglagesModal({ p, onClose, onSaved }: { p: Parametres; onClose: () => void; onSaved: () => void }) {
  const [r, setR] = useState<RelancesParams>({ ...p.relances });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const num = (k: keyof RelancesParams) => (e: React.ChangeEvent<HTMLInputElement>) => setR((x) => ({ ...x, [k]: Math.max(0, Number(e.target.value) || 0) }));
  async function save() {
    if (r.suspension < r.relance + 15) return setErr(`Le contrat (art. 5) prévoit la suspension au plus tôt 15 jours après la relance : suspension ≥ J+${r.relance + 15}.`);
    if (!(r.rappel <= r.relance && r.relance <= r.avertissement && r.avertissement <= r.suspension)) return setErr("Les paliers doivent être croissants : rappel ≤ relance ≤ avertissement ≤ suspension.");
    setBusy(true); setErr(null);
    try { await enregistrerParametres({ ...p, relances: r }); onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : "Enregistrement impossible."); } finally { setBusy(false); }
  }
  return (
    <ModalShell title="Réglages des relances de paiement" onClose={onClose} maxWidth="max-w-2xl">
      <p className="text-xs text-white/60">Chaque mois : la mensualité se crée toute seule, le garage reçoit son <b>appel de paiement</b> quelques jours avant l&apos;échéance, puis les relances seulement s&apos;il ne paie pas. Les mensualités sont payables d&apos;avance. Les paliers sont comptés en jours <b>après l&apos;échéance</b>. Le contrat garage (CGV art. 5) autorise la suspension 15 jours après une relance restée sans effet, et la résiliation après 30 jours d&apos;impayé.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <ChampAdmin label="Échéance : le … du mois"><input className="field-input" type="number" min="1" max="28" value={r.jourEcheance} onChange={num("jourEcheance")} /></ChampAdmin>
        <ChampAdmin label="Rappel amical (J+)"><input className="field-input" type="number" value={r.rappel} onChange={num("rappel")} /></ChampAdmin>
        <ChampAdmin label="Relance formelle (J+)"><input className="field-input" type="number" value={r.relance} onChange={num("relance")} /></ChampAdmin>
        <ChampAdmin label="Dernier avertissement (J+)"><input className="field-input" type="number" value={r.avertissement} onChange={num("avertissement")} /></ChampAdmin>
        <ChampAdmin label="Suspension (J+, ≥ relance + 15)"><input className="field-input" type="number" value={r.suspension} onChange={num("suspension")} /></ChampAdmin>
        <ChampAdmin label="Appel de paiement : jours AVANT l'échéance"><input className="field-input" type="number" min="0" max="25" value={r.appelJours} onChange={num("appelJours")} /></ChampAdmin>
        <ChampAdmin label="Collaborateurs : alerte après (jours)"><input className="field-input" type="number" value={r.delaiCollaborateurs} onChange={num("delaiCollaborateurs")} /></ChampAdmin>
      </div>
      <div className="mt-3 space-y-2 text-sm text-white/85">
        <label className="flex items-center gap-2"><input type="checkbox" checked={r.appelAuto} onChange={(e) => setR((x) => ({ ...x, appelAuto: e.target.checked }))} />Appel de paiement automatique avant l&apos;échéance (email avec lien de paiement Qonto + IBAN)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={r.auto} onChange={(e) => setR((x) => ({ ...x, auto: e.target.checked }))} />Relances automatiques par email (chaque matin, jours ouvrés)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={r.suspensionAuto} onChange={(e) => setR((x) => ({ ...x, suspensionAuto: e.target.checked }))} />Suspension automatique du compte au palier « suspension » (réactivation automatique au paiement)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={r.digestEditeur} onChange={(e) => setR((x) => ({ ...x, digestEditeur: e.target.checked }))} />Me rappeler par email : impayés, échéances sous 7 jours, collaborateurs à payer</label>
      </div>
      <p className="mt-3 text-xs text-white/50">Les emails de relance partent depuis ta boîte éditeur (SMTP de ton compte) avec le lien de paiement Qonto et l&apos;IBAN de la grille (Simulateur → conditions de vente).</p>
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? "…" : "Enregistrer"}</button></div>
    </ModalShell>
  );
}

