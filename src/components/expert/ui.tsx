"use client";

// Petits éléments d'interface partagés du mode expert (v13.5).

import Link from "next/link";
import type { ReactNode } from "react";
import { infoStatutExpertise } from "@/lib/expertise/types";

export function EnTete({ titre, sousTitre, actions, retour }: { titre: string; sousTitre?: string; actions?: ReactNode; retour?: { href: string; label: string } }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {retour && (
          <Link href={retour.href} className="text-xs text-white/50 hover:text-white/80">← {retour.label}</Link>
        )}
        <h1 className="truncate">{titre}</h1>
        {sousTitre && <p className="mt-0.5 text-sm text-white/55">{sousTitre}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Bloc({ titre, actions, children, className = "" }: { titre?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass-card p-4 sm:p-5 ${className}`}>
      {(titre || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titre && <h2 className="titre-section">{titre}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Champ({ label, children, aide, className = "" }: { label: string; children: ReactNode; aide?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      {children}
      {aide && <p className="mt-1 text-[11px] text-white/45">{aide}</p>}
    </div>
  );
}

export function Info({ label, valeur, className = "" }: { label: string; valeur: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[11px] uppercase tracking-wider text-white/45">{label}</div>
      <div className="truncate text-sm font-medium">{valeur || <span className="text-white/35">—</span>}</div>
    </div>
  );
}

export function BadgeStatutExpert({ statut }: { statut: string | null | undefined }) {
  const s = infoStatutExpertise(statut);
  return <span className={`badge ${s.badge}`}>{s.label}</span>;
}

export function Vide({ titre, texte, action }: { titre: string; texte?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/20 px-5 py-8 text-center">
      <div className="font-semibold">{titre}</div>
      {texte && <p className="mx-auto mt-1 max-w-md text-sm text-white/55">{texte}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Erreur({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="alerte alerte-danger text-sm">{message}</div>;
}

export function adresseSurUneLigne(...parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p && p.trim()).join(" ");
}
