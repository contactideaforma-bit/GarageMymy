"use client";

/* ====================================================================
 *  LIEN SECRET — myeasyauto.fr/alliance (v13.5)
 *
 *  Page d'entrée de l'espace « Alliance Experts ». Elle n'est liée nulle
 *  part dans l'appli. Seuls les comptes de COMPTES_EXPERT passent ; un
 *  compte My Easy Auto ordinaire est refusé.
 * ==================================================================== */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { ACCUEIL_EXPERT, aAccesExpert } from "@/lib/expertise/acces";
import { useChartAlliance } from "@/components/expert/ExpertShell";

export default function PageAlliance() {
  const router = useRouter();
  useChartAlliance();
  const [email, setEmail] = useState("alliance@mail.fr");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [dejaConnecte, setDejaConnecte] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      const e = data.session?.user.email;
      if (!e) return;
      if (aAccesExpert(e)) router.replace(ACCUEIL_EXPERT);
      else setDejaConnecte(e);
    });
  }, [router]);

  async function connexion(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!aAccesExpert(email)) {
      setErreur("Ce compte n'a pas accès à l'espace Alliance Experts.");
      return;
    }
    setEnvoi(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setEnvoi(false);
    if (error) {
      setErreur(error.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : error.message);
      return;
    }
    router.replace(ACCUEIL_EXPERT);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="glass-card overflow-hidden">
          <div className="al-entete px-8 py-7 text-center">
            <div className="mx-auto inline-block rounded-xl bg-white px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/alliance/logo.png" alt="Alliance Experts" className="h-12 w-auto" />
            </div>
            <div className="mt-4 text-sm font-semibold tracking-wide uppercase opacity-90">Espace expertise</div>
            <div className="mt-1 text-xs opacity-75">Dossiers · Photos · Chiffrage · Procès-verbaux</div>
          </div>

          <div className="px-8 py-7">
            {dejaConnecte ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-white/70">
                  Tu es connecté avec <span className="font-semibold">{dejaConnecte}</span>, qui n&apos;a pas accès à cet espace.
                </p>
                <button
                  type="button"
                  className="btn-primary w-full justify-center"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setDejaConnecte(null);
                  }}
                >
                  Changer de compte
                </button>
              </div>
            ) : (
              <form onSubmit={connexion} className="space-y-4">
                <div>
                  <label className="field-label">Email</label>
                  <input type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
                </div>
                <div>
                  <label className="field-label">Mot de passe</label>
                  <input type="password" className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus required />
                </div>
                {erreur && <div className="alerte alerte-danger text-sm">{erreur}</div>}
                <button type="submit" disabled={envoi} className="btn-primary w-full justify-center">
                  {envoi ? "Un instant…" : "Ouvrir l'espace expert"}
                </button>
              </form>
            )}
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-white/40">
          Accès réservé · Une solution My Easy Auto by IDEAFORMA
        </p>
      </div>
    </div>
  );
}
