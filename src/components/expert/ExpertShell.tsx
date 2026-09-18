"use client";

/* ====================================================================
 *  MODE EXPERT (v13.5) — coque de l'espace caché « Alliance Experts »
 *
 *  · vérifie la session Supabase ET que le compte est autorisé
 *    (lib/expertise/acces.ts) ; sinon → /alliance (connexion) ou écran
 *    « compte non autorisé » ;
 *  · applique la charte Alliance (classe html.alliance + thème clair
 *    forcé) et la retire en sortant, sans toucher au réglage du garage ;
 *  · barre latérale dédiée (tiroir sur mobile), comme AppShell.
 * ==================================================================== */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { aAccesExpert, LIEN_ALLIANCE } from "@/lib/expertise/acces";
import ExpertSidebar from "@/components/expert/ExpertSidebar";
import BoutonHaut from "@/components/BoutonHaut";
import TableauxFluides from "@/components/TableauxFluides";

/** Applique / retire la charte Alliance sur <html>. */
export function useChartAlliance() {
  useEffect(() => {
    const html = document.documentElement;
    const avaitLight = html.classList.contains("light");
    html.classList.add("alliance", "light");
    return () => {
      html.classList.remove("alliance");
      // On rend au garage son thème : sombre seulement s'il l'avait choisi.
      let theme: string | null = null;
      try { theme = localStorage.getItem("theme"); } catch { /* ignoré */ }
      if (theme === "dark" && !avaitLight) html.classList.remove("light");
    };
  }, []);
}

type Etat = "chargement" | "ok" | "refuse";

export default function ExpertShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>("chargement");
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useChartAlliance();

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setEtat("ok");
      return;
    }
    let mounted = true;
    const evaluer = (s: Session | null) => {
      if (!mounted) return;
      if (!s) {
        router.replace(LIEN_ALLIANCE);
        return;
      }
      setEmail(s.user.email ?? null);
      setEtat(aAccesExpert(s.user.email) ? "ok" : "refuse");
    };
    supabase.auth.getSession().then(({ data }) => evaluer(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT") {
        router.replace(LIEN_ALLIANCE);
        return;
      }
      if (s) evaluer(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (etat === "chargement") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-white/50">Ouverture de l&apos;espace expert…</p>
      </div>
    );
  }

  if (etat === "refuse") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="glass-card w-full max-w-md p-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/alliance/logo.png" alt="Alliance Experts" className="mx-auto mb-4 h-14 w-auto" />
          <h1 className="text-lg font-semibold">Accès réservé</h1>
          <p className="mt-2 text-sm text-white/60">
            Le compte <span className="font-semibold">{email}</span> n&apos;est pas autorisé sur l&apos;espace Alliance Experts.
          </p>
          <button
            type="button"
            className="btn-primary mt-5 w-full justify-center"
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace(LIEN_ALLIANCE);
            }}
          >
            Se connecter avec un autre compte
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="lg:flex min-h-screen">
        {/* Barre du haut (mobile) */}
        <div className="lg:hidden sticky top-0 z-30 p-3">
          <div className="glass-card glass-blur flex items-center gap-3 px-3 py-2">
            <button onClick={() => setOpen(true)} aria-label="Ouvrir le menu" className="btn-ghost btn-compact px-2.5 text-lg leading-none">☰</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/alliance/logo.png" alt="Alliance Experts" className="h-8 w-auto" />
          </div>
        </div>
        {open && <div className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-md" onClick={() => setOpen(false)} />}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 p-3 transition-transform duration-200
            lg:static lg:h-auto lg:self-start lg:z-auto lg:translate-x-0 lg:shrink-0
            ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="relative h-full overflow-y-auto lg:h-auto lg:overflow-visible">
            <button onClick={() => setOpen(false)} aria-label="Fermer le menu" className="lg:hidden absolute right-2 top-2 z-10 btn-ghost btn-compact px-2.5 text-lg leading-none">×</button>
            <ExpertSidebar email={email} onNavigate={() => setOpen(false)} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
      <TableauxFluides />
      <BoutonHaut />
    </div>
  );
}
