"use client";

// ============================================================
//  OFFRE DE LANCEMENT (v13.44) — bandeau + compte à rebours du site public.
//
//  Deux variantes :
//   · "hero"     : pastille compacte sous les boutons du haut de page.
//   · "formules" : bandeau large au-dessus des cartes de prix, avec le
//                  compte à rebours jours / heures / minutes / secondes.
//  Rendu côté client uniquement (useEffect) pour éviter toute différence
//  serveur/navigateur sur l'heure. Disparaît tout seul après la date de fin.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { DATE_FIN_LIBELLE, OFFRE_LANCEMENT, compteARebours, offreActive } from "@/lib/offreLancement";

function useCompteARebours() {
  const [etat, setEtat] = useState<ReturnType<typeof compteARebours> | null>(null);
  useEffect(() => {
    const tick = () => setEtat(compteARebours());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return etat;
}

const deux = (n: number) => String(n).padStart(2, "0");

function Chiffre({ v, l }: { v: number; l: string }) {
  return (
    <div className="flex min-w-[3.1rem] flex-col items-center rounded-lg bg-white/90 px-2 py-1.5 shadow-sm ring-1 ring-fuchsia-200">
      <span className="text-lg font-bold tabular-nums leading-none text-slate-900 sm:text-xl">{deux(v)}</span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-700">{l}</span>
    </div>
  );
}

export default function OffreLancement({ variante = "formules" }: { variante?: "hero" | "formules" }) {
  const t = useCompteARebours();
  if (!t || t.total <= 0 || !offreActive()) return null;

  if (variante === "hero") {
    return (
      <Link
        href="#formules"
        className="mt-5 inline-flex max-w-full items-center gap-2.5 rounded-full border border-fuchsia-300 bg-white/85 py-1.5 pl-1.5 pr-4 text-sm text-slate-800 shadow-sm backdrop-blur transition hover:border-fuchsia-500"
      >
        <span className="rounded-full bg-gradient-to-r from-fuchsia-600 to-violet-600 px-2.5 py-1 text-xs font-bold text-white">−{OFFRE_LANCEMENT.pct} %</span>
        <span className="truncate">
          <b>pendant {OFFRE_LANCEMENT.mois} mois</b> sur toutes les formules · plus que{" "}
          <span className="font-semibold tabular-nums text-fuchsia-700">
            {t.jours} j {deux(t.heures)} h {deux(t.minutes)} min
          </span>
        </span>
      </Link>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border-2 border-fuchsia-500 bg-gradient-to-r from-fuchsia-50 via-pink-50 to-violet-50 p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="shrink-0 rounded-xl bg-gradient-to-br from-fuchsia-600 to-violet-600 px-3 py-2 text-2xl font-bold leading-none text-white shadow sm:text-3xl">
            −{OFFRE_LANCEMENT.pct} %
          </span>
          <div>
            <div className="font-semibold text-slate-900">Offre de lancement : −{OFFRE_LANCEMENT.pct} % pendant {OFFRE_LANCEMENT.mois} mois, sur toutes les formules.</div>
            <div className="mt-0.5 text-sm text-slate-600">
              Pour toute inscription en ligne jusqu&apos;au <b>{DATE_FIN_LIBELLE}</b>. La remise s&apos;applique toute seule, rien à saisir : vos {OFFRE_LANCEMENT.mois} premières mensualités sont remisées, puis le prix normal de votre formule.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 lg:shrink-0">
          <div className="hidden text-xs font-semibold uppercase tracking-wider text-fuchsia-700 sm:block">Il reste</div>
          <div className="flex gap-1.5" aria-live="off" aria-label={`Il reste ${t.jours} jours ${t.heures} heures ${t.minutes} minutes`}>
            <Chiffre v={t.jours} l="jours" />
            <Chiffre v={t.heures} l="heures" />
            <Chiffre v={t.minutes} l="min" />
            <Chiffre v={t.secondes} l="sec" />
          </div>
          <Link href="/inscription" className="lp-btn hidden !px-4 !py-2 text-sm xl:inline-flex">J&apos;en profite →</Link>
        </div>
      </div>
    </div>
  );
}
