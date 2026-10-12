"use client";

// ============================================================
//  SUIVI D'UNE INSCRIPTION EN LIGNE (v13.41) — page « merci ».
//  Retour de Stripe (?stripe=ok|annule) ou lien de l'email de confirmation
//  (?token=…). Vérifie le paiement (Stripe / Qonto), propose de (re)payer,
//  affiche l'état : payé → compte créé → identifiants envoyés.
// ============================================================

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { VitrineNav, VitrineFooter } from "@/components/vitrine/Vitrine";
import { SOCIETE } from "@/components/vitrine/societe";
import { FICHES } from "@/components/vitrine/formules";
import DemandeRappel from "@/components/vitrine/DemandeRappel";
import { lireReponse } from "@/lib/apiClient";
import { MENTION_TVA } from "@/lib/venteParcours";
import type { InscriptionPublique } from "@/lib/inscription";

const eur = (n: number | null | undefined) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

export default function MerciPage() {
  return (
    <Suspense fallback={<div className="landing-pro min-h-screen" />}>
      <Merci />
    </Suspense>
  );
}

function Merci() {
  const query = useSearchParams();
  const token = query?.get("token") || "";
  const retourStripe = query?.get("stripe");
  const [ins, setIns] = useState<InscriptionPublique | null>(null);
  const [dispo, setDispo] = useState<{ stripe: boolean; qonto: boolean }>({ stripe: false, qonto: false });
  const [erreur, setErreur] = useState<string | null>(null);
  const [verif, setVerif] = useState(false);
  const [tentatives, setTentatives] = useState(0);

  const charger = useCallback(async () => {
    if (!token) return setErreur("Lien incomplet : ouvrez le lien reçu par email.");
    const r = await lireReponse<{ inscription: InscriptionPublique; dispo: { stripe: boolean; qonto: boolean } }>(await fetch(`/api/inscription?token=${encodeURIComponent(token)}`));
    if (!r.ok || !r.data) return setErreur(r.error || "Inscription introuvable.");
    setIns(r.data.inscription);
    setDispo(r.data.dispo);
  }, [token]);
  useEffect(() => { charger(); }, [charger]);

  const verifier = useCallback(async () => {
    if (!token) return;
    setVerif(true);
    try {
      const r = await lireReponse<{ inscription: InscriptionPublique }>(await fetch("/api/inscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verifier", token }) }));
      if (r.ok && r.data) setIns(r.data.inscription);
    } finally {
      setVerif(false);
    }
  }, [token]);

  // Retour de Stripe : le webhook a souvent déjà fait le travail ; sinon on vérifie quelques fois.
  useEffect(() => {
    if (retourStripe !== "ok" || !ins || ins.paye || tentatives >= 8) return;
    const t = setTimeout(async () => { await verifier(); setTentatives((n) => n + 1); }, tentatives === 0 ? 500 : 4000);
    return () => clearTimeout(t);
  }, [retourStripe, ins, tentatives, verifier]);

  async function payer(mode: "stripe" | "qonto" | "virement") {
    setErreur(null);
    const r = await lireReponse<{ url: string | null; inscription: InscriptionPublique }>(await fetch("/api/inscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "payer", token, mode }) }));
    if (!r.ok || !r.data) return setErreur(r.error || "Paiement indisponible.");
    setIns(r.data.inscription);
    if (r.data.url) {
      if (mode === "stripe") window.location.href = r.data.url;
      else window.open(r.data.url, "_blank", "noopener");
    }
  }

  const fiche = ins ? FICHES.find((f) => f.formule === ins.formule) : null;
  const montant = ins ? (ins.periodicite === "annuel" ? ins.montant_annuel_ht || 0 : ins.prix_mensuel_ht) + ins.mise_en_service_ht : 0;

  return (
    <div className="landing-pro min-h-screen">
      <VitrineNav />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <span className="lp-chip">{SOCIETE.produit} · suivi de votre inscription</span>
        <h1 className="mt-3">{ins?.paye ? "Bienvenue !" : "Votre inscription"}</h1>
        {erreur && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{erreur}</div>}
        {retourStripe === "annule" && !ins?.paye && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Le paiement n&apos;a pas été finalisé. Votre contrat est bien enregistré : vous pouvez régler quand vous voulez ci-dessous.</div>}

        {ins && (
          <div className="lp-card mt-6 p-6 sm:p-8">
            <div className="text-sm text-slate-500">Contrat n° {ins.numero} · {ins.garage_nom}</div>
            <div className="mt-1 text-lg font-semibold text-slate-800">{fiche?.nom || ins.formule} — {ins.periodicite === "annuel" ? `année en une fois ${eur(ins.montant_annuel_ht)}` : `${eur(ins.prix_mensuel_ht)} / mois`}{ins.engagement_12 ? " · engagement 12 mois" : " · sans engagement"}</div>
            <div className="text-xs text-slate-500">{MENTION_TVA}</div>

            <ol className="mt-5 space-y-2 text-sm">
              <Etape ok titre="Contrat signé" detail={ins.signe_le ? `le ${new Date(ins.signe_le).toLocaleString("fr-FR")} — envoyé par email à ${ins.contact_email}` : ""} />
              <Etape ok={ins.paye} titre={ins.paye ? "Première échéance réglée" : `Première échéance à régler : ${eur(montant)}`} detail={ins.paye ? "" : ins.paiement_en_ligne_mode === "stripe" ? "Prélèvement automatique à mettre en place." : ins.paiement_en_ligne_mode === "qonto" ? "Paiement en ligne sécurisé." : "Par virement (coordonnées ci-dessous)."} />
              <Etape ok={ins.compte_cree} titre={ins.compte_cree ? "Compte créé — identifiants envoyés par email" : "Création de votre compte"} detail={ins.compte_cree ? `Connectez-vous sur ${SOCIETE.site} avec ${ins.contact_email}.` : "Automatique dès que le paiement est confirmé."} />
            </ol>

            {!ins.paye && (
              <div className="mt-6 space-y-3">
                {ins.periodicite === "mensuel" && dispo.stripe && (
                  <button className="lp-btn w-full sm:w-auto" onClick={() => payer("stripe")}>Mettre en place le prélèvement automatique →</button>
                )}
                {ins.periodicite === "annuel" && (ins.qonto_url || dispo.qonto) && (
                  ins.qonto_url
                    ? <a href={ins.qonto_url} target="_blank" rel="noreferrer" className="lp-btn inline-block">Régler {eur(montant)} en ligne →</a>
                    : <button className="lp-btn" onClick={() => payer("qonto")}>Régler {eur(montant)} en ligne →</button>
                )}
                {ins.virement ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                    <div className="font-semibold text-slate-800">Virement de {eur(ins.virement.montant)}</div>
                    <dl className="mt-2 grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-4">
                      <dt className="text-slate-500">Bénéficiaire</dt><dd>{SOCIETE.editeur} — {SOCIETE.produit}</dd>
                      <dt className="text-slate-500">IBAN</dt><dd className="font-mono">{ins.virement.iban}</dd>
                      {ins.virement.bic && <><dt className="text-slate-500">BIC</dt><dd className="font-mono">{ins.virement.bic}</dd></>}
                      <dt className="text-slate-500">Référence</dt><dd className="font-mono">{ins.virement.reference}</dd>
                    </dl>
                  </div>
                ) : (
                  <button className="lp-btn-ghost !text-sm" onClick={() => payer("virement")}>Je préfère régler par virement</button>
                )}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <button className="lp-btn-ghost !text-sm" onClick={verifier} disabled={verif}>{verif ? "Vérification…" : "J'ai payé — vérifier"}</button>
                  {retourStripe === "ok" && tentatives > 0 && tentatives < 8 && <span className="text-xs text-slate-500">Confirmation en cours…</span>}
                </div>
              </div>
            )}
            {ins.paye && (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Merci ! {ins.compte_cree ? "Vos identifiants sont dans votre boîte mail (pensez aux indésirables)." : "Votre compte est en cours de création : vos identifiants arrivent par email dans quelques minutes."}
                <div className="mt-3"><Link href="/#espaces" className="lp-btn !py-2 !text-sm">Se connecter</Link></div>
              </div>
            )}
            <DemandeRappel defauts={{ garage_nom: ins.garage_nom, email: ins.contact_email }} etape="Page de suivi" />
          </div>
        )}
      </div>
      <VitrineFooter />
    </div>
  );
}

function Etape({ ok, titre, detail }: { ok: boolean; titre: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{ok ? "✓" : "•"}</span>
      <span><span className={ok ? "font-semibold text-slate-800" : "font-semibold text-slate-600"}>{titre}</span>{detail && <span className="block text-xs text-slate-500">{detail}</span>}</span>
    </li>
  );
}
