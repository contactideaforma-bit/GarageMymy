"use client";

// Fournit le métier du garage connecté (carrosserie | vitrage) à toute l'appli.
// Le métier est lu une fois depuis le profil entreprise après connexion ; il
// sert au branding et, plus tard, à l'adaptation du vocabulaire / parcours.

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { Metier, METIER_DEFAUT, normaliseMetier } from "@/lib/metier";

type MetierCtx = {
  metier: Metier;
  loading: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<MetierCtx>({
  metier: METIER_DEFAUT,
  loading: true,
  refresh: async () => {},
});

export function useMetier() {
  return useContext(Ctx);
}

export default function MetierProvider({ children }: { children: React.ReactNode }) {
  const [metier, setMetier] = useState<Metier>(METIER_DEFAUT);
  const [loading, setLoading] = useState(true);

  const charger = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("entreprise").select("metier").limit(1).maybeSingle();
    setMetier(normaliseMetier((data as { metier?: string | null } | null)?.metier));
    setLoading(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  return (
    <Ctx.Provider value={{ metier, loading, refresh: charger }}>{children}</Ctx.Provider>
  );
}
