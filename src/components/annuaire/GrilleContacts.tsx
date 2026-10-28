"use client";

// ============================================================
//  BASE DE DONNÉES — BARRE D'OUTILS + GRILLE (v13.52)
//  Barre : recherche, tri (A → Z / récents), compteur, actions.
//  Grille : cartes en colonnes, regroupées par lettre quand on trie A → Z.
//  États vides parlants (les contacts arrivent seuls depuis les dossiers).
// ============================================================

import type { ReactNode } from "react";

export type TriAnnuaire = "az" | "recents";

export function BarreAnnuaire({
  q,
  onQ,
  placeholder,
  tri,
  onTri,
  total,
  visibles,
  actions,
}: {
  q: string;
  onQ: (v: string) => void;
  placeholder: string;
  tri: TriAnnuaire;
  onTri: (t: TriAnnuaire) => void;
  total: number;
  visibles: number;
  actions: ReactNode;
}) {
  return (
    <div className="annuaire-barre">
      <div className="relative min-w-0 flex-1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2" style={{ width: 18, height: 18, color: "var(--mea-texte-3)" }} aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          className="field-input !rounded-xl !pl-10"
          placeholder={placeholder}
          value={q}
          onChange={(e) => onQ(e.target.value)}
        />
      </div>
      <div className="segment shrink-0">
        <button type="button" className={`segment-btn ${tri === "az" ? "actif" : ""}`} onClick={() => onTri("az")}>A → Z</button>
        <button type="button" className={`segment-btn ${tri === "recents" ? "actif" : ""}`} onClick={() => onTri("recents")}>Récents</button>
      </div>
      <span className="annuaire-compteur" title="Contacts affichés / total">
        {q.trim() ? `${visibles} / ${total}` : total}
      </span>
      <div className="flex shrink-0 gap-2">{actions}</div>
    </div>
  );
}

function lettreDe(nom: string | null | undefined): string {
  const c = String(nom || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

export function GrilleContacts<T extends { id: string; created_at: string }>({
  lignes,
  nomDe,
  tri,
  loading,
  vide,
  rendre,
}: {
  lignes: T[];
  nomDe: (r: T) => string | null | undefined;
  tri: TriAnnuaire;
  loading: boolean;
  vide: ReactNode;
  rendre: (r: T) => ReactNode;
}) {
  if (loading) {
    return (
      <div className="annuaire-grille">
        {[0, 1, 2].map((i) => (
          <div key={i} className="carte-contact">
            <div className="flex items-center gap-3"><div className="skeleton h-11 w-11 rounded-full" /><div className="flex-1"><div className="skeleton h-4 w-32" /><div className="skeleton mt-2 h-3 w-20" /></div></div>
            <div className="skeleton mt-4 h-3 w-full" /><div className="skeleton mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
    );
  }
  if (lignes.length === 0) return <div className="annuaire-vide">{vide}</div>;

  if (tri === "recents") {
    const triees = [...lignes].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return <div className="annuaire-grille">{triees.map(rendre)}</div>;
  }

  const triees = [...lignes].sort((a, b) => String(nomDe(a) || "").localeCompare(String(nomDe(b) || ""), "fr", { sensitivity: "base" }));
  // Les séparateurs de lettres n'aident qu'à partir d'une vraie liste ;
  // en dessous, une simple grille triée est plus agréable.
  if (triees.length < 12) return <div className="annuaire-grille">{triees.map(rendre)}</div>;
  const groupes = new Map<string, T[]>();
  for (const r of triees) {
    const l = lettreDe(nomDe(r));
    if (!groupes.has(l)) groupes.set(l, []);
    groupes.get(l)!.push(r);
  }
  return (
    <div className="space-y-5">
      {Array.from(groupes.entries()).map(([lettre, items]) => (
        <section key={lettre}>
          <div className="annuaire-lettre">
            <span>{lettre}</span>
            <span className="annuaire-lettre-trait" />
            <span className="annuaire-lettre-nb">{items.length}</span>
          </div>
          <div className="annuaire-grille">{items.map(rendre)}</div>
        </section>
      ))}
    </div>
  );
}
