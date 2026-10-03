"use client";

// ============================================================
//  CONNEXION QONTO (v13.38) — espace éditeur, page Paiements.
//  Qonto exige OAuth 2.0 pour les liens de paiement : l'éditeur clique
//  « Connecter Qonto », autorise sur la page Qonto, revient ici. Les
//  jetons se renouvellent ensuite tout seuls (cron quotidien inclus).
//  Le résultat du retour (?qonto=ok|erreur&detail=…) est affiché ici.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { fetchAuth, lireReponse } from "@/lib/apiClient";

type Etat = {
  oauthConfigure: boolean;
  connecte: boolean;
  environnement: string;
  connectePar: string | null;
  connecteLe: string | null;
  scope: string | null;
  derniereErreur: string | null;
  redirectUri: string;
};

export default function ConnexionQonto() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [busy, setBusy] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; detail: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const r = await lireReponse<Etat>(await fetchAuth("/api/qonto/connexion"));
    if (r.ok && r.data) setEtat(r.data);
    else setErr(r.error || "État de la connexion Qonto illisible.");
  }, []);

  // Retour arrière depuis Qonto (page restaurée du cache) : le bouton ne doit
  // pas rester bloqué sur « Ouverture de Qonto… ».
  useEffect(() => {
    const reveil = () => setBusy(false);
    window.addEventListener("pageshow", reveil);
    return () => window.removeEventListener("pageshow", reveil);
  }, []);

  useEffect(() => {
    charger();
    // Retour de Qonto : ?qonto=ok | erreur (&detail=…) — puis on nettoie l'URL.
    const q = new URLSearchParams(window.location.search);
    const v = q.get("qonto");
    if (v) {
      setRetour({ ok: v === "ok", detail: q.get("detail") });
      q.delete("qonto");
      q.delete("detail");
      const reste = q.toString();
      window.history.replaceState(null, "", window.location.pathname + (reste ? `?${reste}` : ""));
    }
  }, [charger]);

  async function connecter() {
    setBusy(true);
    setErr(null);
    const r = await lireReponse<{ url: string }>(await fetchAuth("/api/qonto/connexion", { method: "POST" }));
    if (r.ok && r.data?.url) {
      window.location.href = r.data.url;
      return;
    }
    setErr(r.error || "Connexion impossible.");
    setBusy(false);
  }

  async function deconnecter() {
    if (!confirm("Déconnecter Qonto ? Les liens de paiement ne pourront plus être créés ni vérifiés jusqu'à la prochaine connexion.")) return;
    setBusy(true);
    await fetchAuth("/api/qonto/connexion", { method: "DELETE" });
    await charger();
    setBusy(false);
  }

  if (!etat && !err) return null;

  const connecte = Boolean(etat?.connecte);
  return (
    <section className={`glass-card border-2 p-4 ${connecte ? "border-emerald-400/40" : "border-amber-300/50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="titre-bloc">Connexion Qonto (liens de paiement)</h2>
          {connecte ? (
            <p className="mt-1 text-sm text-emerald-300">
              ✅ Connecté{etat?.environnement === "sandbox" ? " (bac à sable)" : ""}
              {etat?.connecteLe ? ` depuis le ${new Date(etat.connecteLe).toLocaleDateString("fr-FR")}` : ""}
              {etat?.connectePar ? ` par ${etat.connectePar}` : ""} — les liens de paiement sont créés et vérifiés automatiquement.
            </p>
          ) : etat?.oauthConfigure ? (
            <p className="mt-1 text-sm text-white/75">Clique sur « Connecter Qonto », connecte-toi sur la page Qonto et accepte : tu reviendras ici automatiquement. À faire une seule fois.</p>
          ) : (
            <p className="mt-1 text-sm text-amber-200">Ajoute <code>QONTO_CLIENT_ID</code> et <code>QONTO_CLIENT_SECRET</code> dans les variables Vercel, puis redéploie : le bouton de connexion apparaîtra ici.</p>
          )}
        </div>
        {etat?.oauthConfigure && (
          connecte ? (
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost btn-compact" disabled={busy} onClick={connecter}>Reconnecter</button>
              <button className="btn-ghost btn-compact" disabled={busy} onClick={deconnecter}>Déconnecter</button>
            </div>
          ) : (
            <button className="btn-primary" disabled={busy} onClick={connecter}>{busy ? "Ouverture de Qonto…" : "🔗 Connecter Qonto"}</button>
          )
        )}
      </div>

      {retour && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${retour.ok ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border border-rose-400/40 bg-rose-500/10 text-rose-200"}`}>
          {retour.ok ? "Qonto est connecté. Tu peux créer des liens de paiement." : `La connexion n'a pas abouti : ${retour.detail || "erreur inconnue"}`}
        </p>
      )}
      {etat?.derniereErreur && <p className="mt-2 text-xs text-rose-300">Dernière erreur : {etat.derniereErreur}</p>}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
      {etat && !connecte && etat.oauthConfigure && (
        <p className="mt-2 text-xs text-white/50">
          Dans le portail développeur Qonto, l&apos;adresse de redirection doit être exactement : <code className="break-all">{etat.redirectUri}</code> — portées : <code>offline_access payment_link.read payment_link.write</code>.
        </p>
      )}
    </section>
  );
}
