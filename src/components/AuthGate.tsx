"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import LandingPage from "@/components/LandingPage";
import { METIER_INFOS, Metier } from "@/lib/metier";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  // Espace choisi sur la page d'accueil (null = on affiche l'accueil).
  const [espace, setEspace] = useState<Metier | null>(null);

  useEffect(() => {
    // Si Supabase n'est pas configuré, on n'impose pas l'authentification
    // (le ConfigBanner guidera la configuration).
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Lien « mot de passe oublié » : où que la redirection atterrisse
      // (même à la racine si les Redirect URLs Supabase sont incomplètes),
      // on force l'ouverture de la page de réinitialisation.
      if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reinitialisation") {
        window.location.replace("/reinitialisation");
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Pages PUBLIQUES : signature à distance (accès par jeton) et mentions
  // légales (liées depuis la page d'accueil) — pas de login.
  if (pathname?.startsWith("/signer/") || pathname === "/mentions-legales") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-white/50 text-sm">Chargement…</p>
      </div>
    );
  }

  if (isSupabaseConfigured && !session) {
    // Pas connecté : d'abord la page d'accueil, puis l'écran de connexion
    // de l'espace choisi (avec possibilité de revenir à l'accueil).
    if (!espace) return <LandingPage onChoisir={setEspace} />;
    return <LoginScreen metier={espace} onRetour={() => setEspace(null)} />;
  }

  return <>{children}</>;
}

function LoginScreen({ metier, onRetour }: { metier: Metier; onRetour: () => void }) {
  const info = METIER_INFOS[metier];
  const accentText = info.accent === "teal" ? "text-accent-teal" : "text-accent-pink";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modeOubli, setModeOubli] = useState(false);
  const [info2, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);

    // Mot de passe oublié : envoi du lien de réinitialisation
    if (modeOubli) {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reinitialisation`,
      });
      if (err) setError(err.message);
      else setInfo("Email envoyé ! Clique sur le lien reçu pour choisir un nouveau mot de passe (regarde aussi les spams).");
      setSubmitting(false);
      return;
    }

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(
        err.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : err.message === "Email not confirmed"
            ? "Email non confirmé : clique sur le lien reçu par email avant de te connecter."
            : err.message
      );
      setSubmitting(false);
    }
    // En cas de succès, onAuthStateChange (AuthGate) bascule sur l'app.
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm glass-card p-8">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="My Easy Auto" className="mx-auto mb-3 h-20 w-20 rounded-lg border-2 border-white/20" />
          <div className="font-pixel text-[0.75rem] leading-relaxed bg-gradient-to-r from-accent-violet via-accent-pink to-accent-teal bg-clip-text text-transparent">
            MY EASY AUTO
          </div>
          <div className={`mt-2 font-pixel text-[0.55rem] ${accentText}`}>{info.espace.toUpperCase()}</div>
          <div className="mt-2 text-sm text-white/50">Connexion à l&apos;espace gestion</div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="field-label">Email</label>
            <input
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@…"
              autoComplete="username"
              required
            />
          </div>
          {!modeOubli && (
            <div>
              <label className="field-label">Mot de passe</label>
              <input
                type="password"
                className="field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}
          {info2 && (
            <div className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200">
              {info2}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
            {submitting
              ? "Un instant…"
              : modeOubli
                ? "M'envoyer le lien de réinitialisation"
                : "Se connecter"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setModeOubli((m) => !m); setError(null); setInfo(null); }}
          className="mt-4 w-full text-center text-sm text-accent-pink hover:underline"
        >
          {modeOubli ? "Retour à la connexion" : "Mot de passe oublié ?"}
        </button>

        <button
          type="button"
          onClick={onRetour}
          className="mt-3 w-full text-center text-xs text-white/40 hover:text-white/70"
        >
          ← Retour à l&apos;accueil
        </button>

        <p className="mt-4 text-center text-xs text-white/30">
          Compte créé par l&apos;administrateur.
        </p>
      </div>
    </div>
  );
}
