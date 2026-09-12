"use client";

// v12.7 — « Bonjour, <nom du garage> » à côté du logo (barre du haut mobile
// et barre latérale), à la place de « My Easy Auto ». Le nom vient du profil
// du garage (table entreprise) ; repli sur la marque tant qu'il n'est pas
// renseigné (comptes commerciaux, éditeur…).

import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

/** « Bonjour » jusqu'à 18 h, « Bonsoir » ensuite. */
export function salutation(d: Date = new Date()): string {
  const h = d.getHours();
  return h >= 18 || h < 5 ? "Bonsoir" : "Bonjour";
}

let cacheNom: string | null | undefined; // undefined = pas encore chargé

export function useNomGarage(): string | null {
  const [nom, setNom] = useState<string | null>(cacheNom ?? null);
  useEffect(() => {
    if (cacheNom !== undefined) {
      setNom(cacheNom);
      return;
    }
    if (!isSupabaseConfigured) return;
    supabase
      .from("entreprise")
      .select("nom")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        cacheNom = (data as { nom?: string | null } | null)?.nom?.trim() || null;
        setNom(cacheNom);
      });
  }, []);
  return nom;
}

export default function Salutation({ className = "" }: { className?: string }) {
  const nom = useNomGarage();
  const [bonjour, setBonjour] = useState("Bonjour");
  useEffect(() => {
    setBonjour(salutation());
    const t = setInterval(() => setBonjour(salutation()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!nom) return <span className={`marque block min-w-0 truncate ${className}`}>My Easy Auto</span>;
  return (
    <span className={`marque block min-w-0 truncate ${className}`} title={`${bonjour}, ${nom}`}>
      {bonjour}, {nom}
    </span>
  );
}
