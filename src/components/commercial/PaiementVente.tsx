"use client";

// ============================================================
//  PAIEMENT DE LA 1re ÉCHÉANCE (v13.37) — fiche client du commercial.
//
//  Deux grands choix, pas de jargon :
//   💳 Lien de paiement — carte bancaire. Lien unique Qonto créé en un
//      clic : à OUVRIR sur place (le gérant paie sur le téléphone du
//      commercial), à envoyer par EMAIL ou par SMS, ou à copier.
//      Vérification automatique (bouton + chaque matin).
//   🏦 Virement — IBAN, BIC, montant TTC et référence, chacun copiable,
//      et envoi par email en un clic. Le commercial confirme à réception.
//  Le commercial n'encaisse jamais lui-même : tout est au nom d'IDEAFORMA.
// ============================================================

import { useState } from "react";
import { formatDate, formatDateTime, formatEuros, messageErreur } from "@/lib/format";
import { telHref } from "@/lib/prospects";
import { ContexteCommercial, envoyerPaiementVente, lienPaiementVente, majPaiement, verifierPaiementVente } from "@/lib/commercialClient";
import { SOCIETE } from "@/components/vitrine/societe";
import { TVA_VENTE, VenteParcours, estPaye, premiereEcheance, referenceVirement } from "@/lib/venteParcours";

type Mode = "lien" | "virement";

export default function PaiementVente({ vente: v, ctx, onChanged }: { vente: VenteParcours; ctx: ContexteCommercial; onChanged: () => void }) {
  const params = ctx.parametres;
  const m = premiereEcheance(v);
  const ref = referenceVirement(v);
  const paye = estPaye(v);
  const [mode, setMode] = useState<Mode>(v.paiement_demande === "virement" || !ctx.paiementEnLigne ? "virement" : "lien");
  const [url, setUrl] = useState<string | null>(v.qonto_url || (!ctx.qonto && ctx.paiementEnLigne ? params.lienPaiementCb : null) || null);
  const [email, setEmail] = useState(v.contact_email || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refManuelle, setRefManuelle] = useState(v.paiement_reference || "");
  const [montant, setMontant] = useState(v.paiement_montant != null ? String(v.paiement_montant) : String(m.ttc));

  async function run(cle: string, f: () => Promise<void>) {
    setBusy(cle);
    setErr(null);
    setInfo(null);
    try {
      await f();
    } catch (e) {
      setErr(messageErreur(e, "Opération impossible."));
    } finally {
      setBusy(null);
    }
  }

  const genererLien = () =>
    run("lien", async () => {
      const r = await lienPaiementVente(v.id);
      setUrl(r.url);
      onChanged();
    });

  const envoyer = (mo: Mode) =>
    run(`envoi-${mo}`, async () => {
      const r = await envoyerPaiementVente({ vente_id: v.id, mode: mo, to: email });
      if (r.url) setUrl(r.url);
      setInfo(`✓ Email envoyé à ${email}. Tu es en copie.`);
      onChanged();
    });

  const verifier = () =>
    run("verif", async () => {
      const r = await verifierPaiementVente(v.id);
      setInfo(r.paye ? "✅ Paiement reçu !" : r.statut === "expired" ? "Le lien a expiré : génère-en un nouveau." : "Pas encore payé. La vérification se refait aussi automatiquement chaque matin.");
      onChanged();
    });

  const confirmer = (oui: boolean) =>
    run("confirme", async () => {
      await majPaiement(
        oui
          ? { vente_id: v.id, confirme: true, reference: refManuelle, montant: montant ? Number(String(montant).replace(",", ".")) : null }
          : { vente_id: v.id, confirme: false }
      );
      onChanged();
    });

  async function copier(texte: string, quoi: string) {
    try {
      await navigator.clipboard.writeText(texte);
      setInfo(`${quoi} copié.`);
    } catch {
      setInfo(texte);
    }
  }

  const smsHref = url && v.contact_tel
    ? `${telHref(v.contact_tel).replace("tel:", "sms:")}?&body=${encodeURIComponent(`Bonjour, voici le lien de paiement ${SOCIETE.produit} (${formatEuros(m.ttc)} TTC) : ${url}`)}`
    : null;

  /* ---------------------------- Déjà payé ---------------------------- */
  if (paye) {
    return (
      <div className="mt-3 rounded-xl border-2 border-emerald-400/50 bg-emerald-500/10 p-4">
        <div className="text-base font-bold text-emerald-200">✅ 1re échéance payée — {formatEuros(v.paiement_montant ?? m.ttc)} TTC</div>
        <p className="mt-1 text-sm text-white/75">
          {v.paiement_confirme_le ? `Le ${formatDateTime(v.paiement_confirme_le)}` : ""}
          {v.paiement_reference ? ` · réf. ${v.paiement_reference}` : ""}
          {v.paiement_valide_le ? " · vérifié ✓" : " · en attente de vérification par IDEAFORMA"}
        </p>
        {!v.qonto_link_id && v.paiement_confirme_le && !v.paiement_valide_le && (
          <button className="mt-2 text-xs text-white/50 hover:underline" disabled={!!busy} onClick={() => confirmer(false)}>Annuler la confirmation</button>
        )}
      </div>
    );
  }

  /* ------------------------------ À payer ------------------------------ */
  return (
    <div className="mt-3 rounded-xl border border-white/15 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-white">Encaisser la 1re échéance</div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-white">{formatEuros(m.ttc)} TTC</div>
          <div className="text-[11px] text-white/50">{formatEuros(m.ht)} HT + TVA {TVA_VENTE} %{Number(v.mise_en_service_ht) ? " · mise en service incluse" : ""}</div>
        </div>
      </div>

      {/* Choix du moyen : deux grosses tuiles */}
      <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Moyen de paiement">
        {([
          ["lien", "💳", "Lien de paiement", "Carte bancaire"],
          ["virement", "🏦", "Virement", "IBAN + référence"],
        ] as [Mode, string, string, string][]).map(([k, ic, t, s]) => {
          const dispo = k === "virement" || ctx.paiementEnLigne;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={mode === k}
              disabled={!dispo}
              onClick={() => setMode(k)}
              className={`rounded-xl border-2 p-3 text-left transition ${mode === k ? "border-accent-pink bg-accent-pink/10" : "border-white/15 hover:border-white/35"} ${!dispo ? "opacity-40" : ""}`}
            >
              <div className="text-2xl" aria-hidden="true">{ic}</div>
              <div className="mt-1 text-sm font-bold text-white">{t}</div>
              <div className="text-xs text-white/55">{dispo ? s : "Non configuré"}</div>
            </button>
          );
        })}
      </div>

      {/* ------------------------- Lien de paiement ------------------------- */}
      {mode === "lien" && (
        <div className="mt-3 space-y-3">
          {!url ? (
            <button className="btn-primary w-full justify-center !py-3" disabled={!!busy} onClick={genererLien}>
              {busy === "lien" ? "Création du lien…" : "Créer le lien de paiement"}
            </button>
          ) : (
            <>
              <div className="flex gap-2">
                <input readOnly className="field-input field-compact flex-1 font-mono !text-xs" value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Lien de paiement" />
                <button className="btn-ghost btn-compact" onClick={() => copier(url, "Lien")}>Copier</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <a className="btn-primary justify-center text-center" href={url} target="_blank" rel="noreferrer">📱 Payer maintenant, sur place</a>
                {smsHref ? <a className="btn-ghost justify-center text-center" href={smsHref}>💬 Envoyer par SMS</a> : <span className="btn-ghost justify-center text-center opacity-40">💬 SMS (pas de n°)</span>}
                <button className="btn-ghost justify-center" disabled={!!busy || !email} onClick={() => envoyer("lien")}>{busy === "envoi-lien" ? "Envoi…" : "✉️ Envoyer par email"}</button>
              </div>
            </>
          )}
          <ChampEmail email={email} setEmail={setEmail} />
          {ctx.qonto && url ? (
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-ghost btn-compact" disabled={!!busy} onClick={verifier}>{busy === "verif" ? "Vérification…" : "🔄 Le garage a payé ? Vérifier"}</button>
              <span className="text-xs text-white/50">Vérifié aussi automatiquement chaque matin.{v.qonto_statut && v.qonto_statut !== "open" ? ` Statut : ${v.qonto_statut}.` : ""}</span>
            </div>
          ) : url ? (
            <ConfirmationManuelle refManuelle={refManuelle} setRef={setRefManuelle} montant={montant} setMontant={setMontant} busy={!!busy} onConfirmer={() => confirmer(true)} libelle="Reçu de paiement CB" />
          ) : null}
        </div>
      )}

      {/* ------------------------------ Virement ------------------------------ */}
      {mode === "virement" && (
        <div className="mt-3 space-y-3">
          {params.iban ? (
            <dl className="glass-soft divide-y divide-white/10 text-sm">
              {([
                ["Bénéficiaire", SOCIETE.editeur],
                ["IBAN", params.iban],
                ...(params.bic ? [["BIC", params.bic]] : []),
                ["Montant", `${formatEuros(m.ttc)} TTC`],
                ["Référence", ref],
              ] as [string, string][]).map(([k, val]) => (
                <div key={k} className="flex items-center justify-between gap-2 px-3 py-2">
                  <dt className="shrink-0 text-xs text-white/55">{k}</dt>
                  <dd className="min-w-0 truncate text-right font-medium text-white">{val}</dd>
                  <button className="shrink-0 text-xs text-accent-teal hover:underline" onClick={() => copier(val, k)}>Copier</button>
                </div>
              ))}
            </dl>
          ) : (
            <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-200">L&apos;IBAN d&apos;IDEAFORMA n&apos;est pas encore renseigné dans les paramètres : demande-le à l&apos;éditeur.</p>
          )}
          <ChampEmail email={email} setEmail={setEmail} />
          <button className="btn-primary w-full justify-center !py-3" disabled={!!busy || !email || !params.iban} onClick={() => envoyer("virement")}>
            {busy === "envoi-virement" ? "Envoi…" : "✉️ Envoyer ces coordonnées au garage"}
          </button>
          <ConfirmationManuelle refManuelle={refManuelle} setRef={setRefManuelle} montant={montant} setMontant={setMontant} busy={!!busy} onConfirmer={() => confirmer(true)} libelle="Référence du virement reçu" />
        </div>
      )}

      {v.paiement_envoye_le && (
        <p className="mt-3 text-xs text-white/55">
          📨 {v.paiement_envoye_mode === "virement" ? "Coordonnées de virement" : "Lien de paiement"} envoyé le {formatDate(v.paiement_envoye_le)}{v.paiement_envoye_a ? ` à ${v.paiement_envoye_a}` : ""} — en attente du paiement.
        </p>
      )}
      {info && <p className="mt-2 break-all text-sm text-emerald-300">{info}</p>}
      {err && <p className="mt-2 text-sm text-rose-300">{err}</p>}
    </div>
  );
}

function ChampEmail({ email, setEmail }: { email: string; setEmail: (s: string) => void }) {
  return (
    <div>
      <label className="field-label !text-xs">Email du garage</label>
      <input type="email" className="field-input field-compact" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@garage.fr" />
    </div>
  );
}

function ConfirmationManuelle({
  refManuelle, setRef, montant, setMontant, busy, onConfirmer, libelle,
}: {
  refManuelle: string; setRef: (s: string) => void; montant: string; setMontant: (s: string) => void; busy: boolean; onConfirmer: () => void; libelle: string;
}) {
  return (
    <details className="rounded-lg border border-white/10 px-3 py-2">
      <summary className="cursor-pointer text-sm font-semibold text-white/80">J&apos;ai la preuve du paiement → confirmer</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
        <input className="field-input field-compact" placeholder={libelle} value={refManuelle} onChange={(e) => setRef(e.target.value)} />
        <input className="field-input field-compact" inputMode="decimal" placeholder="Montant € TTC" value={montant} onChange={(e) => setMontant(e.target.value)} />
        <button className="btn-primary btn-compact" disabled={busy} onClick={onConfirmer}>Confirmer le paiement</button>
      </div>
      <p className="mt-1 text-xs text-white/45">IDEAFORMA vérifie ensuite la réception sur son compte.</p>
    </details>
  );
}
