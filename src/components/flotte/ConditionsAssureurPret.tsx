"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { GuidePretAssureur } from "@/lib/types";
import {
  EVENEMENTS_PRET,
  FIABILITES,
  GARAGES_AGREES,
  INCLUSIONS,
  dureePourEvenement,
  resumeDurees,
  trouverFicheAssureur,
} from "@/lib/guidePret";

/**
 * Encart « Que prend en charge l'assurance du client ? » (v13.2), affiché
 * au moment d'attribuer un véhicule de prêt lié à un dossier sinistre.
 * Retrouve la fiche du guide à partir du nom libre de l'assureur du dossier,
 * laisse choisir l'événement et affiche la durée indicative, le plafond, le
 * seuil de déclenchement et les conditions de réseau. Table absente
 * (migration v74 non exécutée) → l'encart se tait.
 */
export default function ConditionsAssureurPret({
  assureur,
  compact = false,
  onEvenement,
}: {
  assureur: string | null | undefined;
  /** Version resserrée (dans une modale). */
  compact?: boolean;
  /** Remonte l'événement choisi (ex. pour le noter sur le contrat). */
  onEvenement?: (key: string) => void;
}) {
  const [fiches, setFiches] = useState<GuidePretAssureur[] | null>(null);
  const [dispo, setDispo] = useState(true);
  const [evenement, setEvenement] = useState("accident_non_resp");
  const [ouvert, setOuvert] = useState(!compact);

  useEffect(() => {
    let actif = true;
    supabase
      .from("guide_pret_assureurs")
      .select("*")
      .then(({ data, error }) => {
        if (!actif) return;
        if (error) { setDispo(false); setFiches([]); return; }
        setFiches((data as GuidePretAssureur[]) || []);
      });
    return () => { actif = false; };
  }, []);

  const fiche = useMemo(() => (fiches ? trouverFicheAssureur(assureur, fiches) : null), [fiches, assureur]);

  if (!dispo || !assureur?.trim()) return null;
  if (fiches === null) return <p className="text-xs text-white/40">Conditions de l&apos;assureur…</p>;

  if (!fiche) {
    return (
      <div className="alerte alerte-info text-sm">
        <div className="alerte-titre">Conditions de prise en charge : aucune fiche pour « {assureur} »</div>
        <p className="mt-1 text-xs opacity-80">
          Vérifie la garantie « véhicule de remplacement » sur les conditions particulières du client, puis ajoute cet assureur au{" "}
          <Link href="/flotte/guide-assureurs" className="underline">guide véhicule de prêt</Link> pour la prochaine fois.
        </p>
      </div>
    );
  }

  const inc = INCLUSIONS[fiche.inclusion] || INCLUSIONS.inconnu;
  const reseau = GARAGES_AGREES[fiche.garage_agree] || GARAGES_AGREES.inconnu;
  const fiab = FIABILITES[fiche.fiabilite] || FIABILITES.site;
  const duree = dureePourEvenement(fiche, evenement);
  const choisir = (k: string) => { setEvenement(k); onEvenement?.(k); };

  return (
    <div className="glass-soft p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setOuvert((o) => !o)} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={ouvert}>
          <span className={`shrink-0 text-white/40 transition-transform ${ouvert ? "rotate-90" : ""}`} aria-hidden>▸</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Prise en charge par l&apos;assurance</span>
          <span className="truncate text-sm font-semibold text-white">{fiche.nom}</span>
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`badge ${inc.badge}`}>{inc.label}</span>
          <span className={`badge ${fiab.badge}`} title={fiab.detail}>{fiab.label}</span>
        </div>
      </div>

      {!ouvert && <p className="text-xs text-white/60">{resumeDurees(fiche)}{fiche.categorie ? ` · ${fiche.categorie}` : ""}</p>}

      {ouvert && (
        <>
          <div>
            <div className="mb-1.5 text-[11px] text-white/45">Événement à l&apos;origine de l&apos;immobilisation</div>
            <div className="segment flex-wrap">
              {EVENEMENTS_PRET.map((e) => (
                <button key={e.key} type="button" onClick={() => choisir(e.key)} className={`segment-btn ${evenement === e.key ? "actif" : ""}`}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Info label="Durée indicative" valeur={duree.libelle} fort />
            <Info label="Véhicule fourni" valeur={fiche.categorie || "—"} />
            <Info label="Si pas de véhicule" valeur={fiche.plafond_jour != null ? `${Number(fiche.plafond_jour).toLocaleString("fr-FR")} €/jour` : "—"} titre={fiche.plafond_detail || undefined} />
            <Info label="Seuil" valeur={fiche.immobilisation_min || "—"} />
          </div>

          {duree.note && <p className="text-xs text-white/70">{duree.note}</p>}

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`badge ${reseau.badge}`} title={reseau.detail}>{reseau.label}</span>
            {fiche.assisteur && (
              <span className="text-white/60">
                Assisteur : {fiche.assisteur}
                {fiche.assisteur_tel && /\d/.test(fiche.assisteur_tel) ? (
                  <> · <a className="text-accent-teal hover:underline" href={`tel:${fiche.assisteur_tel.replace(/[^\d+]/g, "")}`}>{fiche.assisteur_tel}</a></>
                ) : fiche.assisteur_tel ? ` · ${fiche.assisteur_tel}` : ""}
              </span>
            )}
          </div>

          {fiche.formules && <p className="text-xs text-white/60"><b className="text-white/80">Formules :</b> {fiche.formules}</p>}
          {fiche.notes && <p className="text-xs text-white/70"><b className="text-white/80">Mon expérience :</b> {fiche.notes}</p>}
          {fiche.fiabilite === "comparateur" && (
            <p className="text-xs text-amber-200">{fiab.detail}</p>
          )}
          <p className="text-[11px] text-white/40">
            Indicatif : la formule et les options du client priment (conditions particulières).{" "}
            <Link href="/flotte/guide-assureurs" className="text-accent-teal hover:underline">Fiche complète ↗</Link>
          </p>
        </>
      )}
    </div>
  );
}

function Info({ label, valeur, fort = false, titre }: { label: string; valeur: string; fort?: boolean; titre?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5" title={titre}>
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div className={`truncate text-sm ${fort ? "font-semibold text-accent-teal" : "text-white/85"}`} title={valeur}>{valeur}</div>
    </div>
  );
}
