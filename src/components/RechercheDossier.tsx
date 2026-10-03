"use client";

// ============================================================
//  BARRE DE RECHERCHE DU TABLEAU DE BORD (v13.35)
//
//  Aller DIRECTEMENT à un dossier : on tape un nom, une immatriculation,
//  un n° de sinistre… et la liste des dossiers correspondants s'ouvre
//  sous la barre. Clic (ou Entrée) = ouverture de la fiche dossier.
//  - Clavier : ↑ ↓ pour choisir, Entrée pour ouvrir, Échap pour fermer ;
//    « / » ou Ctrl+K (⌘K) place le curseur dans la barre depuis la page.
//  - Mobile : saisie en 16 px (pas de zoom automatique sur iPhone),
//    résultats en grandes lignes faciles à toucher.
//  Les dossiers sont ceux déjà chargés par le tableau de bord : aucune
//  requête de plus, la recherche est instantanée (et marche hors ligne).
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dossier } from "@/lib/types";
import { formatEuros, formatDate } from "@/lib/format";
import { rechercherDossiers } from "@/lib/recherche";
import StatutBadge from "@/components/StatutBadge";

export default function RechercheDossier({
  dossiers,
  loading = false,
}: {
  dossiers: Dossier[];
  loading?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boiteRef = useRef<HTMLDivElement>(null);

  const resultats = useMemo(() => rechercherDossiers(dossiers, q, 8), [dossiers, q]);
  const saisie = q.trim().length > 0;

  // Nouvelle saisie → on repart du premier résultat.
  useEffect(() => setActif(0), [q]);

  // Raccourcis « / » et Ctrl+K / ⌘K : focus sur la barre.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      const dansChamp =
        !!cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA" || cible.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (e.key === "/" && !dansChamp) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Clic en dehors → fermeture de la liste.
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (boiteRef.current && !boiteRef.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, []);

  const ouvrir = (d: Dossier) => {
    setOuvert(false);
    router.push(`/sinistres/${d.id}`);
  };

  const voirTout = () => {
    setOuvert(false);
    router.push(`/sinistres?q=${encodeURIComponent(q.trim())}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOuvert(true);
      setActif((i) => Math.min(i + 1, Math.max(resultats.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActif((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = resultats[actif];
      if (r) ouvrir(r.dossier);
      else if (saisie) voirTout();
    } else if (e.key === "Escape") {
      if (ouvert && saisie) setOuvert(false);
      else {
        setQ("");
        inputRef.current?.blur();
      }
    }
  };

  return (
    <div ref={boiteRef} className="relative z-30 mb-6">
      <label htmlFor="recherche-dossier" className="sr-only">
        Rechercher un dossier
      </label>
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/45"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          id="recherche-dossier"
          type="search"
          inputMode="search"
          enterKeyHint="go"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={ouvert && saisie}
          aria-controls="recherche-dossier-liste"
          aria-activedescendant={ouvert && resultats[actif] ? `rd-${resultats[actif].dossier.id}` : undefined}
          className="field-input !rounded-xl !py-3 !pl-11 !pr-20 !text-base sm:!text-sm"
          placeholder="Aller à un dossier : client, immatriculation, n° de sinistre…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOuvert(true);
          }}
          onFocus={() => setOuvert(true)}
          onKeyDown={onKeyDown}
        />
        {saisie ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-sm text-white/55 hover:bg-white/10 hover:text-white"
            aria-label="Effacer la recherche"
          >
            ✕
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-white/40 sm:block">
            Ctrl K
          </kbd>
        )}
      </div>

      {ouvert && saisie && (
        <div
          id="recherche-dossier-liste"
          role="listbox"
          className="anim-apparition absolute left-0 right-0 top-full mt-2 max-h-[60vh] overflow-y-auto rounded-xl border p-1.5 shadow-2xl"
          style={{
            backgroundColor: "var(--mea-surface-opaque)",
            borderColor: "var(--mea-bordure-2)",
          }}
        >
          {loading && resultats.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-white/45">Chargement des dossiers…</p>
          )}
          {!loading && resultats.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-white/45">
              Aucun dossier ne correspond à « {q.trim()} ».
            </p>
          )}
          {resultats.map(({ dossier: d }, i) => (
            <button
              key={d.id}
              id={`rd-${d.id}`}
              type="button"
              role="option"
              aria-selected={i === actif}
              onMouseEnter={() => setActif(i)}
              onClick={() => ouvrir(d)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition sm:py-2.5 ${
                i === actif ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">
                  {d.client_nom || "Client non renseigné"}
                </span>
                <span className="block truncate text-xs text-white/55">
                  {[d.marque_modele, d.immatriculation].filter(Boolean).join(" · ") || "Véhicule non renseigné"}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-white/40">
                  {d.numero_sinistre ? `Sinistre n° ${d.numero_sinistre}` : "Sans n° de sinistre"}
                  {d.assureur ? ` · ${d.assureur}` : ""}
                  {d.date_sinistre ? ` · ${formatDate(d.date_sinistre)}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StatutBadge statut={d.statut} />
                {d.montant ? (
                  <span className="text-[11px] tabular-nums text-white/45">{formatEuros(d.montant)} HT</span>
                ) : null}
              </span>
            </button>
          ))}
          {resultats.length > 0 && (
            <button
              type="button"
              onClick={voirTout}
              className="mt-1 w-full rounded-lg border-t border-white/10 px-3 py-2.5 text-left text-xs text-accent-pink hover:bg-white/5"
            >
              Voir tous les résultats dans la liste des dossiers →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
