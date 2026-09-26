// Jetons courriers — appels navigateur (v13.28).
import { supabase } from "./supabaseClient";
import { fetchAuth, lireReponse } from "./apiClient";
import type { AchatJetons, MouvementJetons } from "./jetons";

export async function lireSoldeJetons(): Promise<number | null> {
  const { data, error } = await supabase.from("jetons_soldes").select("solde").maybeSingle();
  if (error) return null; // migration v90 absente
  return Number(data?.solde || 0);
}

export async function lireHistoriqueJetons(): Promise<{ mouvements: MouvementJetons[]; achats: AchatJetons[] }> {
  const [m, a] = await Promise.all([
    supabase.from("jetons_mouvements").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("achats_jetons").select("*").order("created_at", { ascending: false }).limit(30),
  ]);
  return { mouvements: (m.data as MouvementJetons[]) || [], achats: (a.data as AchatJetons[]) || [] };
}

export async function acheterPack(pack: string): Promise<{ url: string | null; error: string | null }> {
  const r = await lireReponse<{ url: string }>(
    await fetchAuth("/api/jetons/acheter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack, cgvAcceptees: true }) })
  );
  return { url: r.data?.url || null, error: r.error };
}

export async function verifierPaiements(): Promise<{ solde: number | null; credites: number; error: string | null }> {
  const r = await lireReponse<{ solde: number; credites: number }>(await fetchAuth("/api/jetons/verifier", { method: "POST" }));
  return { solde: r.data?.solde ?? null, credites: r.data?.credites || 0, error: r.error };
}
