"use client";

// ============================================================
//  BANDEAU « SE FAIRE RÉFÉRENCER AUPRÈS DES EXPERTS » (v13.40)
//  Affiché sur Espaces experts (/extranets) et sur Base de données →
//  Experts. Ouvre l'assistant de déclaration ; fonctionne même quand la
//  base des experts est vide (on saisit les cabinets dans l'assistant).
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Expert } from "@/lib/types";
import DeclarationExpertsModal from "@/components/experts/DeclarationExpertsModal";

export default function BandeauReferencementExperts({ experts, onChange }: { experts?: Expert[]; onChange?: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [liste, setListe] = useState<Expert[]>(experts || []);

  const charger = useCallback(async () => {
    const { data } = await supabase.from("experts").select("id,email,expert_email,declaration_envoyee_le");
    setListe((data as Expert[]) || []);
  }, []);
  useEffect(() => {
    if (experts) setListe(experts);
    else charger();
  }, [experts, charger]);

  const avecEmail = liste.filter((e) => e.email || e.expert_email).length;
  const informes = liste.filter((e) => e.declaration_envoyee_le).length;

  return (
    <>
      <div className="glass-card mb-5 flex flex-wrap items-center justify-between gap-3 border-2 border-accent-pink/40 p-4">
        <div className="min-w-0">
          <div className="font-semibold text-white">📣 Se faire référencer auprès des experts</div>
          <p className="text-sm text-white/65">
            Garage nouveau ou repris ? Un assistant prépare un email à ton logo — coordonnées, Kbis, taux horaires T1, T2, T3, peinture et ingrédients — et l&apos;envoie à chaque cabinet d&apos;expertise.
            {liste.length > 0
              ? ` ${informes}/${avecEmail} cabinet${avecEmail > 1 ? "s" : ""} déjà informé${informes > 1 ? "s" : ""}.`
              : " Tu pourras saisir les adresses des cabinets directement dans l'assistant."}
          </p>
        </div>
        <button onClick={() => setOuvert(true)} className="btn-primary shrink-0">Me faire référencer</button>
      </div>
      {ouvert && (
        <DeclarationExpertsModal
          onClose={() => {
            setOuvert(false);
            // des cabinets ont pu être ajoutés à la base pendant l'assistant
            charger();
            onChange?.();
          }}
          onEnvoye={() => {
            charger();
            onChange?.();
          }}
        />
      )}
    </>
  );
}
