"use client";

// v13.31 — Renvoi de l'email de bienvenue (espace éditeur). Pose un NOUVEAU
// mot de passe provisoire sur le compte du garage puis renvoie l'email ;
// si l'email ne part pas, le mot de passe est affiché pour transmission.

import { useState } from "react";
import { ResultatRenvoiBienvenue, renvoyerBienvenue } from "@/lib/admin/client";

export default function BoutonRenvoiBienvenue({ cible, email, compact = true }: { cible: { vente_id?: string; abonnement_id?: string }; email: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ResultatRenvoiBienvenue | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    if (!confirm(`Renvoyer l'email de bienvenue à ${email} ?\nUn NOUVEAU mot de passe provisoire sera posé : l'ancien ne fonctionnera plus.`)) return;
    setBusy(true);
    setErr(null);
    try { setRes(await renvoyerBienvenue(cible)); } catch (e) { setErr(e instanceof Error ? e.message : "Renvoi impossible."); } finally { setBusy(false); }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button className={compact ? "text-accent-teal hover:underline" : "btn-ghost btn-compact"} onClick={go} disabled={busy} title="Nouveau mot de passe provisoire + email de bienvenue">
        {busy ? "Envoi…" : "Renvoyer l'email de bienvenue"}
      </button>
      {res && (res.emailEnvoye ? (
        <span className="text-xs text-emerald-300">✓ envoyé à {res.email}</span>
      ) : (
        <span className="text-xs text-amber-300">Email non parti{res.erreurEmail ? ` (${res.erreurEmail})` : ""}{res.motDePasse ? <> — nouveau mot de passe : <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-white">{res.motDePasse}</code></> : null}</span>
      ))}
      {err && <span className="text-xs text-rose-300">{err}</span>}
    </span>
  );
}
