"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/**
 * Page cible du lien « mot de passe oublié » envoyé par Supabase.
 * Le lien connecte l'utilisateur en mode "récupération" : il choisit
 * ici son nouveau mot de passe.
 */
export default function ReinitialisationPage() {
  const router = useRouter();
  const [pret, setPret] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // La session "recovery" est créée par Supabase à l'arrivée sur la page.
    supabase.auth.getSession().then(({ data }) => setPret(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY" || s) setPret(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Choisis un mot de passe d'au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne sont pas identiques.");
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/"), 1500);
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-sm glass-card p-8">
        <h1 className="text-white mb-4">Nouveau mot de passe</h1>

        {!pret && (
          <p className="text-sm text-white/60">
            Ce lien de réinitialisation est invalide ou expiré. Retourne à l&apos;écran de
            connexion et clique à nouveau sur « Mot de passe oublié ? ».
          </p>
        )}

        {pret && done && (
          <div className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200">
            Mot de passe modifié ! Redirection vers l&apos;appli…
          </div>
        )}

        {pret && !done && (
          <form onSubmit={enregistrer} className="space-y-4">
            <div>
              <label className="field-label">Nouveau mot de passe</label>
              <input
                type="password"
                className="field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
              <p className="mt-1 text-xs text-white/40">8 caractères minimum.</p>
            </div>
            <div>
              <label className="field-label">Confirme le mot de passe</label>
              <input
                type="password"
                className="field-input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {error && (
              <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            )}
            <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
              {saving ? "Enregistrement…" : "Enregistrer le mot de passe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
