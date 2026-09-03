"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { aFlotteHorsGarage } from "@/lib/flotte";
import FlotteListe from "@/components/flotte/FlotteListe";

/**
 * FLOTTE HORS GARAGE (v12.3) : véhicules appartenant au garage mais
 * immatriculés au nom de tiers. Onglet réservé aux comptes listés dans
 * lib/flotte.ts (COMPTES_FLOTTE_HORS_GARAGE). Les données restent de toute
 * façon cloisonnées par compte (RLS owner_id).
 */
export default function FlotteHorsGaragePage() {
  const [autorise, setAutorise] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) { setAutorise(false); return; }
    supabase.auth.getUser().then(({ data }) => setAutorise(aFlotteHorsGarage(data.user?.email)));
  }, []);

  if (autorise === null) return <p className="text-white/50">Chargement…</p>;
  if (!autorise) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-white/70">Cet onglet n&apos;est pas activé pour ton compte.</p>
        <Link href="/flotte" className="btn-ghost mt-3 inline-block">← Flotte du garage</Link>
      </div>
    );
  }
  return <FlotteListe horsGarage />;
}
