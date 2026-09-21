"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import SignaturePad from "@/components/SignaturePad";

/**
 * PAGE PUBLIQUE de signature à distance (accès par jeton, sans compte).
 * Le client ouvre le lien reçu par email, vérifie le document et signe.
 */

type Infos = {
  type: string;
  titre: string;
  dejaSigne: boolean;
  garage: string;
  vehicule: string;
  client: string;
  sinistre: string;
  clauses?: { code: string; titre: string; texte: string; consentement?: string }[];
  consentementGageRequis?: boolean;
  /** v13.22 — OR : conditions générales, état constaté, texte d'autorisation. */
  conditions?: { numero: number; titre: string; texte: string }[];
  etat?: string[];
  autorisation?: string | null;
  consentementConditionsRequis?: boolean;
};

export default function SignerPage() {
  const { token } = useParams<{ token: string }>();
  const [infos, setInfos] = useState<Infos | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [consentGage, setConsentGage] = useState(false);
  const [consentConditions, setConsentConditions] = useState(false);
  const [conditionsOuvertes, setConditionsOuvertes] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [fini, setFini] = useState(false);
  // v13.21 — arrivée depuis le portail de suivi (?retour=/suivi/<jeton>) :
  // on propose de revenir au suivi une fois signé. Seuls les chemins
  // internes du suivi sont acceptés (pas de redirection ouverte).
  const [retour, setRetour] = useState<string | null>(null);
  useEffect(() => {
    try {
      const r = new URLSearchParams(window.location.search).get("retour") || "";
      if (/^\/suivi\/[A-Za-z0-9_-]+$/.test(r)) setRetour(r);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetch(`/api/signature?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Lien invalide.");
        setInfos(j as Infos);
        if ((j as Infos).client) setNom((j as Infos).client);
      })
      .catch((e: unknown) => setErreur(e instanceof Error ? e.message : "Lien invalide."));
  }, [token]);

  async function signer() {
    if (!signature) {
      setErreur("Signe dans le cadre avant de valider.");
      return;
    }
    if (!nom.trim()) {
      setErreur("Indique ton nom et prénom.");
      return;
    }
    if (infos?.consentementConditionsRequis && !consentConditions) {
      setErreur("Coche « J'ai lu et j'accepte les conditions » pour pouvoir signer.");
      return;
    }
    if (infos?.consentementGageRequis && !consentGage) {
      setErreur("Coche l'acceptation expresse de la clause de gage pour pouvoir signer.");
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch("/api/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, nom: nom.trim(), signature, consentGage, consentConditions }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Erreur (HTTP ${res.status}).`);
      setFini(true);
    } catch (e: unknown) {
      setErreur(e instanceof Error ? e.message : "Signature impossible, réessaie.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md glass-card p-6">
        <div className="text-center mb-5">
          <Image src="/logo.png" alt="" width={56} height={56} className="mx-auto mb-2 rounded-md border-2 border-white/20" />
          <div className="font-pixel text-[0.6rem] bg-gradient-to-r from-accent-violet via-accent-pink to-accent-teal bg-clip-text text-transparent">
            MY EASY AUTO
          </div>
        </div>

        {!infos && !erreur && <p className="text-center text-sm text-white/50">Chargement…</p>}

        {erreur && !infos && (
          <p className="text-center text-sm text-rose-300">{erreur}</p>
        )}

        {infos && (fini || infos.dejaSigne) && (
          <div className="text-center space-y-2">
            <div className="font-pixel text-[0.8rem]" style={{ color: "#10b981" }}>SIGNÉ !</div>
            <p className="text-sm text-white/70">
              {fini
                ? `Merci ${nom.trim()} — ta signature a bien été enregistrée. ${infos.garage} a été prévenu${retour ? "." : ", tu peux fermer cette page."}`
                : `Ce document est déjà signé.${retour ? "" : " Tu peux fermer cette page."}`}
            </p>
            {retour && (
              <a href={retour} className="btn-primary mt-3 inline-flex justify-center">← Retour au suivi de mon véhicule</a>
            )}
          </div>
        )}

        {infos && !fini && !infos.dejaSigne && (
          <div className="space-y-4">
            <div className="glass-soft p-4 text-sm space-y-1">
              <div className="text-white/50 text-xs uppercase tracking-wide">Document à signer</div>
              <div className="font-semibold text-white">{infos.titre}</div>
              <div className="text-white/60">
                {infos.garage}
                {infos.vehicule ? ` — ${infos.vehicule}` : ""}
                {infos.sinistre ? ` — sinistre ${infos.sinistre}` : ""}
              </div>
            </div>

            {infos.etat && infos.etat.length > 0 && (
              <div className="glass-soft p-4 text-sm space-y-1">
                <div className="text-white/50 text-xs uppercase tracking-wide">État du véhicule à la prise en charge</div>
                {infos.etat.map((l) => <div key={l} className="text-white/80">{l}</div>)}
              </div>
            )}

            {infos.conditions && infos.conditions.length > 0 && (
              <div className="glass-soft p-4 text-sm space-y-2">
                <button type="button" onClick={() => setConditionsOuvertes((o) => !o)} className="flex w-full items-center justify-between text-left">
                  <span className="text-white/50 text-xs uppercase tracking-wide">Conditions de l&apos;ordre de réparation ({infos.conditions.length})</span>
                  <span className="text-xs text-white/60">{conditionsOuvertes ? "Replier ▴" : "Lire ▾"}</span>
                </button>
                {conditionsOuvertes && (
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {infos.conditions.map((c) => (
                      <div key={c.numero}>
                        <div className="font-semibold text-white">{c.numero}. {c.titre}</div>
                        <p className="mt-0.5 text-xs leading-relaxed text-white/70">{c.texte}</p>
                      </div>
                    ))}
                    {infos.autorisation && (
                      <div>
                        <div className="font-semibold text-white">Autorisation</div>
                        <p className="mt-0.5 text-xs leading-relaxed text-white/70">{infos.autorisation}</p>
                      </div>
                    )}
                  </div>
                )}
                <label className="flex items-start gap-2 rounded-lg border border-white/20 bg-white/5 p-2 text-sm text-white/90">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-pink-500" checked={consentConditions} onChange={(e) => setConsentConditions(e.target.checked)} />
                  <span>J&apos;ai lu et j&apos;accepte les conditions de l&apos;ordre de réparation, et je demande que les travaux commencent sans attendre la fin du délai de rétractation.</span>
                </label>
              </div>
            )}

            {infos.clauses && infos.clauses.length > 0 && (
              <div className="glass-soft p-4 text-sm space-y-3">
                <div className="text-white/50 text-xs uppercase tracking-wide">Garanties de paiement — à lire avant de signer</div>
                {infos.clauses.map((c) => (
                  <div key={c.code}>
                    <div className="font-semibold text-white">{c.titre}</div>
                    <p className="mt-0.5 text-xs leading-relaxed text-white/70">{c.texte}</p>
                    {c.consentement && (
                      <label className="mt-2 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-sm text-white/90">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-pink-500" checked={consentGage} onChange={(e) => setConsentGage(e.target.checked)} />
                        <span>{c.consentement}</span>
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="field-label">Ton nom et prénom</label>
              <input className="field-input" value={nom} onChange={(e) => setNom(e.target.value)} />
            </div>

            <div>
              <label className="field-label">Ta signature</label>
              <SignaturePad onChange={setSignature} />
            </div>

            {erreur && (
              <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{erreur}</div>
            )}

            <button onClick={signer} disabled={envoi} className="btn-primary w-full justify-center">
              {envoi ? "Enregistrement…" : "Je signe ce document"}
            </button>
            {retour && (
              <a href={retour} className="btn-ghost w-full justify-center text-sm">← Retour au suivi sans signer</a>
            )}
            <p className="text-center text-xs text-white/40">
              En signant, tu acceptes le contenu du document présenté par {infos.garage}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
