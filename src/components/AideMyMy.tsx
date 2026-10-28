"use client";

// ============================================================
//  AIDE MY-MY (v13.54) — l'avatar qui guide pas à pas.
//  Une bulle : le titre de l'étape, UNE phrase, trois gestes maximum et
//  UN bouton qui fait l'action. Repliable (on retient le choix par clé).
//  Pensé pour un utilisateur novice qui ne veut ni lire ni réfléchir.
// ============================================================

import Image from "next/image";
import { useEffect, useState } from "react";
import type { AideEtape } from "@/lib/recours";

export default function AideMyMy({ aide, cle, onAction, compteur }: { aide: AideEtape; cle: string; onAction?: () => void; compteur?: string }) {
  const [ouvert, setOuvert] = useState(true);
  useEffect(() => {
    try { setOuvert(window.localStorage.getItem(`mea.aide.${cle}`) !== "0"); } catch { /* ignoré */ }
  }, [cle]);
  const basculer = () => {
    setOuvert((o) => {
      try { window.localStorage.setItem(`mea.aide.${cle}`, o ? "0" : "1"); } catch { /* ignoré */ }
      return !o;
    });
  };

  return (
    <div className="aide-mymy">
      <button type="button" onClick={basculer} className="aide-mymy-avatar" aria-expanded={ouvert} title={ouvert ? "Masquer l'aide" : "Afficher l'aide"}>
        <Image src="/mymy-avatar.png" alt="MY-MY" width={44} height={44} className="rounded-full bg-white p-0.5" />
        {!ouvert && <span className="aide-mymy-pastille">?</span>}
      </button>
      {ouvert ? (
        <div className="aide-mymy-bulle">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="aide-mymy-titre">{aide.titre}</div>
              <p className="aide-mymy-phrase">{aide.phrase}</p>
            </div>
            <button type="button" onClick={basculer} className="aide-mymy-fermer" aria-label="Masquer l'aide">×</button>
          </div>
          {aide.gestes.length > 0 && (
            <ol className="aide-mymy-gestes">
              {aide.gestes.map((g, i) => <li key={i}><span className="num">{i + 1}</span><span>{g}</span></li>)}
            </ol>
          )}
          {(aide.bouton || compteur) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {aide.bouton && onAction && <button type="button" onClick={onAction} className="btn-primary btn-compact">{aide.bouton}</button>}
              {compteur && <span className="text-[11px]" style={{ color: "var(--mea-texte-3)" }}>{compteur}</span>}
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={basculer} className="aide-mymy-mini">{aide.titre} — besoin d&apos;aide ?</button>
      )}
    </div>
  );
}
