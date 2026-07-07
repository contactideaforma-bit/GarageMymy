"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const QUOTA = 15;

/**
 * Consommation de l'assistant IA (analyses de rapports et cartes grises) :
 * jauge du mois en cours, quota 15 €/mois + crédits achetés.
 */
export default function ConsommationIA() {
  const [utilise, setUtilise] = useState(0);
  const [appels, setAppels] = useState(0);
  const [credits, setCredits] = useState(0);
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    (async () => {
      const mois = new Date().toISOString().slice(0, 7);
      const [{ data: usage }, { data: cr }] = await Promise.all([
        supabase.from("usage_ia").select("cout_eur,appels").eq("mois", mois).maybeSingle(),
        supabase.from("credits_ia").select("montant_eur").eq("mois", mois),
      ]);
      setUtilise(Number(usage?.cout_eur) || 0);
      setAppels(usage?.appels || 0);
      setCredits(
        ((cr as { montant_eur: number }[]) || []).reduce((s, c) => s + (Number(c.montant_eur) || 0), 0)
      );
      setCharge(true);
    })();
  }, []);

  const limite = QUOTA + credits;
  const pct = Math.min(100, Math.round((utilise / limite) * 100));
  const blocks = 20;
  const filled = Math.min(blocks, Math.round((pct / 100) * blocks));
  const couleur = pct >= 100 ? "#e11d48" : pct >= 80 ? "#f59e0b" : "#2dd4bf";
  const depasse = utilise >= limite;

  const mailtoAchat = `mailto:contact.ideaforma@gmail.com?subject=${encodeURIComponent(
    "Achat de crédits IA — My Easy Auto"
  )}&body=${encodeURIComponent(
    "Bonjour,\n\nJe souhaite acheter des crédits IA supplémentaires pour ce mois-ci.\n\nMerci de me recontacter."
  )}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-white/70">
          Analyses IA du mois : <span className="font-semibold text-white">{utilise.toFixed(2).replace(".", ",")} €</span>
          {" "}/ {limite.toFixed(0)} €
          {credits > 0 && <span className="text-white/40"> (15 € inclus + {credits.toFixed(0)} € de crédits)</span>}
        </span>
        <span className="font-pixel text-[0.55rem]" style={{ color: couleur }}>
          {charge ? `${pct}%` : "…"}
        </span>
      </div>

      <div className="retro-bar h-4 rounded-sm p-[2px]">
        <div className="flex h-full gap-[2px]">
          {Array.from({ length: blocks }).map((_, i) => (
            <span
              key={i}
              className={`flex-1 rounded-[1px] ${i < filled ? "" : "retro-bar-vide"}`}
              style={
                i < filled
                  ? { backgroundColor: couleur, boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.35)" }
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-white/50">
        {appels} analyse{appels > 1 ? "s" : ""} ce mois-ci (rapports d&apos;expertise, cartes grises).
        Le compteur repart à zéro chaque mois.
      </p>

      {depasse && charge && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
          Quota atteint : l&apos;analyse automatique est en pause jusqu&apos;au mois prochain.
        </div>
      )}
      {(depasse || pct >= 80) && charge && (
        <a href={mailtoAchat} className="btn-primary inline-block text-center">
          Acheter des crédits supplémentaires
        </a>
      )}
    </div>
  );
}
