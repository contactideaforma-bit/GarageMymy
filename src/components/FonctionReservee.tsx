"use client";

// ============================================================
//  FONCTION RÉSERVÉE À UNE FORMULE SUPÉRIEURE (v13.42)
//  Bloc grisé affiché à la place du suivi des impayés / des litiges dans
//  la formule Essentiel : explique ce que débloque Adhésion Service et
//  renvoie vers la fiche formule et le support (demande de changement).
// ============================================================

import Link from "next/link";
import { LIBELLE_FORMULE, TEXTE_FORMULE_SUPERIEURE, useFormuleGarage } from "@/lib/formuleGarage";

export default function FonctionReservee({ titre, description, compact = false }: { titre: string; description?: string; compact?: boolean }) {
  const { formule } = useFormuleGarage();
  return (
    <section className={`glass-card relative overflow-hidden ${compact ? "p-3" : "p-4 sm:p-5"}`} aria-disabled title={TEXTE_FORMULE_SUPERIEURE}>
      <div className="pointer-events-none select-none opacity-45 grayscale">
        <div className="titre-bloc">{titre}</div>
        {description && <p className="mt-1 text-sm text-white/70">{description}</p>}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2">
        <div className="text-sm text-amber-100">
          <span className="mr-1" aria-hidden>🔒</span>
          <strong>Non inclus dans votre formule{formule ? ` ${LIBELLE_FORMULE[formule]}` : ""}.</strong> {TEXTE_FORMULE_SUPERIEURE}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/formules/plus" className="btn-primary btn-compact">Découvrir Adhésion Service</Link>
          <Link href="/support" className="btn-ghost btn-compact">Changer de formule</Link>
        </div>
      </div>
    </section>
  );
}

/** Bouton grisé (en-tête de fiche dossier) pour une action réservée. */
export function BoutonReserve({ children, className = "btn-ghost" }: { children: React.ReactNode; className?: string }) {
  return (
    <Link href="/formules/plus" className={`${className} opacity-50 grayscale`} title={`🔒 ${TEXTE_FORMULE_SUPERIEURE}`} aria-disabled>
      🔒 {children}
    </Link>
  );
}
