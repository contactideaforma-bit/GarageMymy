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
};

export default function SignerPage() {
  const { token } = useParams<{ token: string }>();
  const [infos, setInfos] = useState<Infos | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [fini, setFini] = useState(false);

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
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch("/api/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, nom: nom.trim(), signature }),
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
                ? `Merci ${nom.trim()} — ta signature a bien été enregistrée. ${infos.garage} a été prévenu, tu peux fermer cette page.`
                : "Ce document est déjà signé. Tu peux fermer cette page."}
            </p>
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
            <p className="text-center text-xs text-white/40">
              En signant, tu acceptes le contenu du document présenté par {infos.garage}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
