"use client";

// Fournit le métier du compte connecté (carrosserie | vitrage) à toute l'appli.
// SOURCE DE VÉRITÉ : les métadonnées Auth du compte (app_metadata.metier),
// posées par l'admin à la création et NON modifiables par l'utilisateur.
// Repli sur user_metadata.metier, puis 'carrosserie' par défaut.

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { Metier, METIER_DEFAUT, normaliseMetier } from "@/lib/metier";

type MetierCtx = { metier: Metier; loading: boolean };

const Ctx = createContext<MetierCtx>({ metier: METIER_DEFAUT, loading: true });

export function useMetier() {
  return useContext(Ctx);
}

function lireMetier(user: User | null | undefined): Metier {
  const brut =
    (user?.app_metadata as { metier?: string } | undefined)?.metier ??
    (user?.user_metadata as { metier?: string } | undefined)?.metier;
  return normaliseMetier(brut);
}

export default function MetierProvider({ children }: { children: React.ReactNode }) {
  const [metier, setMetier] = useState<Metier>(METIER_DEFAUT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setMetier(lireMetier(data.user));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setMetier(lireMetier(s?.user));
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <Ctx.Provider value={{ metier, loading }}>{children}</Ctx.Provider>;
}
