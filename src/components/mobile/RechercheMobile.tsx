"use client";

// ============================================================
//  RECHERCHE INSTANTANÉE PLEIN ÉCRAN (v13.50) — l'onglet « Recherche » de la
//  barre du bas. Plaque, client, n° de sinistre, véhicule, assureur…
//  (moteur lib/recherche.ts). Sans saisie : les dossiers RÉCENTS de cet
//  appareil. Charge les dossiers une fois (copie locale si hors ligne).
//
//  `mode` dit quoi faire du dossier choisi :
//   - ouvrir  → la fiche ;
//   - photos  → la fiche, onglet Photos, appareil photo prêt ;
//   - contact → la feuille Appeler / SMS / WhatsApp / récap.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dossier } from "@/lib/types";
import { supabase } from "@/lib/supabaseClient";
import { formatEuros } from "@/lib/format";
import { rechercherDossiers } from "@/lib/recherche";
import { relire } from "@/lib/horsLigne";
import { lireRecents, noterRecent, type DossierRecent, type ModeRecherche } from "@/lib/mobile";
import StatutBadge from "@/components/StatutBadge";
import Feuille from "@/components/mobile/Feuille";
import ContactClient from "@/components/mobile/ContactClient";

const TITRES: Record<ModeRecherche, string> = {
  ouvrir: "Rechercher un dossier",
  photos: "Photos : quel dossier ?",
  contact: "Contacter : quel client ?",
};

export default function RechercheMobile({ mode, onClose }: { mode: ModeRecherche; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [recents, setRecents] = useState<DossierRecent[]>([]);
  const [contact, setContact] = useState<Dossier | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecents(lireRecents());
    let annule = false;
    (async () => {
      const { data, error } = await supabase
        .from("dossiers")
        .select("*")
        .order("created_at", { ascending: false });
      if (annule) return;
      if (!error && data) setDossiers(data as Dossier[]);
      else {
        // Hors ligne : on retombe sur la copie du tableau de bord.
        const cache = await relire<{ dossiers: Dossier[] }>("tableau-de-bord");
        if (cache?.donnees?.dossiers) setDossiers(cache.donnees.dossiers);
      }
      setLoading(false);
    })();
    // Le clavier ne monte que si l'utilisateur touche le champ (iOS) — sauf
    // quand on vient exprès chercher : on focalise après l'animation.
    const t = window.setTimeout(() => inputRef.current?.focus(), 250);
    return () => {
      annule = true;
      window.clearTimeout(t);
    };
  }, []);

  const resultats = useMemo(() => rechercherDossiers(dossiers, q, 30), [dossiers, q]);
  const saisie = q.trim().length > 0;

  const choisir = (d: Dossier) => {
    noterRecent({
      id: d.id,
      titre: d.client_nom || d.immatriculation || "Dossier",
      sous: [d.marque_modele, d.immatriculation, d.numero_sinistre ? `n° ${d.numero_sinistre}` : ""].filter(Boolean).join(" · "),
    });
    if (mode === "contact") {
      setContact(d);
      return;
    }
    onClose();
    router.push(mode === "photos" ? `/sinistres/${d.id}?onglet=photos&camera=1` : `/sinistres/${d.id}`);
  };

  const ouvrirRecent = (r: DossierRecent) => {
    const d = dossiers.find((x) => x.id === r.id);
    if (d) choisir(d);
    else {
      onClose();
      router.push(`/sinistres/${r.id}`);
    }
  };

  return (
    <>
      <Feuille titre={TITRES[mode]} onClose={onClose} pleine>
        <div className="relative mb-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: "var(--mea-texte-3)" }} aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="go"
            autoComplete="off"
            spellCheck={false}
            className="field-input !rounded-2xl !py-3 !pl-11 !pr-10 !text-base"
            placeholder="Plaque, client, n° de sinistre…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && resultats[0]) choisir(resultats[0].dossier);
            }}
          />
          {saisie && (
            <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-sm" style={{ color: "var(--mea-texte-3)" }} aria-label="Effacer">
              ✕
            </button>
          )}
        </div>

        {!saisie && (
          <>
            <div className="etiquette mb-2">Récents sur cet appareil</div>
            {recents.length === 0 && (
              <p className="py-6 text-center text-sm" style={{ color: "var(--mea-texte-3)" }}>
                Les dossiers que tu ouvres apparaîtront ici.
              </p>
            )}
            <div className="groupe-liste">
              {recents.map((r) => (
                <button key={r.id} type="button" className="ligne-liste" onClick={() => ouvrirRecent(r)}>
                  <span className="tuile-ico" aria-hidden>🕘</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.titre}</span>
                    <span className="block truncate text-xs" style={{ color: "var(--mea-texte-3)" }}>{r.sous}</span>
                  </span>
                  <span aria-hidden style={{ color: "var(--mea-texte-3)" }}>›</span>
                </button>
              ))}
            </div>
          </>
        )}

        {saisie && (
          <>
            {loading && resultats.length === 0 && (
              <p className="py-6 text-center text-sm" style={{ color: "var(--mea-texte-3)" }}>Chargement des dossiers…</p>
            )}
            {!loading && resultats.length === 0 && (
              <p className="py-6 text-center text-sm" style={{ color: "var(--mea-texte-3)" }}>
                Aucun dossier ne correspond à « {q.trim()} ».
              </p>
            )}
            <div className="groupe-liste">
              {resultats.map(({ dossier: d }) => (
                <button key={d.id} type="button" className="ligne-liste" onClick={() => choisir(d)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{d.client_nom || "Client non renseigné"}</span>
                    <span className="block truncate text-xs" style={{ color: "var(--mea-texte-2)" }}>
                      {[d.marque_modele, d.immatriculation].filter(Boolean).join(" · ") || "Véhicule non renseigné"}
                    </span>
                    <span className="block truncate text-[11px]" style={{ color: "var(--mea-texte-3)" }}>
                      {d.numero_sinistre ? `n° ${d.numero_sinistre}` : "Sans n°"}
                      {d.assureur ? ` · ${d.assureur}` : ""}
                      {d.montant ? ` · ${formatEuros(d.montant)} HT` : ""}
                    </span>
                  </span>
                  <span className="shrink-0"><StatutBadge statut={d.statut} /></span>
                </button>
              ))}
            </div>
          </>
        )}
      </Feuille>
      {contact && (
        <ContactClient
          dossier={contact}
          onClose={() => {
            setContact(null);
            onClose();
          }}
        />
      )}
    </>
  );
}
