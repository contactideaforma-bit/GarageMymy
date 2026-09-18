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
  sourcesListe,
  trouverFicheAssureur,
} from "@/lib/guidePret";

/**
 * Encart « Que prend en charge l'assurance du client ? » (v13.2), affiché
 * au moment d'attribuer un véhicule de prêt lié à un dossier sinistre.
 * Retrouve la fiche du guide à partir du nom libre de l'assureur du dossier.
 * Replié : durées, véhicule fourni et BUDGET MAX en une ligne. Bouton
 * « Détails et procédure » : événement, durée applicable, seuil, réseau,
 * conditions / procédure, exclusions, facturation, assisteur, sources.
 * Table absente (migration v74 non exécutée) → l'encart se tait.
 */
export default function ConditionsAssureurPret({
  assureur,
  compact = false,
  onEvenement,
}: {
  assureur: string | null | undefined;
  /** Version resserrée (dans une modale) : repliée par défaut. */
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
  const budget = fiche.plafond_jour != null ? `${Number(fiche.plafond_jour).toLocaleString("fr-FR")} €/jour` : null;
  const budgetMax =
    budget && fiche.duree_max != null
      ? `${(Number(fiche.plafond_jour) * fiche.duree_max).toLocaleString("fr-FR")} € (${fiche.duree_max} j × ${budget})`
      : null;
  const tel = fiche.assisteur_tel && /\d/.test(fiche.assisteur_tel) ? fiche.assisteur_tel : null;

  return (
    <div className="glass-soft p-3 space-y-3">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Prise en charge par l&apos;assurance</span>
          <span className="truncate text-sm font-semibold text-white">{fiche.nom}</span>
          <span className={`badge ${inc.badge}`}>{inc.label}</span>
          <span className={`badge ${fiab.badge}`} title={fiab.detail}>{fiab.label}</span>
        </div>
        <button type="button" onClick={() => setOuvert((o) => !o)} className="btn-ghost btn-compact whitespace-nowrap" aria-expanded={ouvert}>
          {ouvert ? "Réduire ▴" : "Détails et procédure ▾"}
        </button>
      </div>

      {/* Résumé toujours visible : durées · véhicule · budget */}
      <div className="grid grid-cols-1 gap-1.5 text-xs text-white/70 sm:grid-cols-3">
        <div><span className="text-white/45">Durées : </span>{resumeDurees(fiche)}</div>
        <div><span className="text-white/45">Véhicule fourni : </span>{fiche.categorie || "non précisé"}</div>
        <div>
          <span className="text-white/45">Budget max : </span>
          {budget ? (
            <span className="font-semibold text-accent-teal" title={fiche.plafond_detail || undefined}>
              {budget}{budgetMax ? ` · ${budgetMax}` : ""}
            </span>
          ) : (
            <span title="Aucun montant en euros dans les conditions : l'assisteur fournit le véhicule lui-même, il ne rembourse pas une location décidée sans lui.">
              pas de plafond en € — véhicule fourni par l&apos;assisteur
            </span>
          )}
        </div>
      </div>

      {ouvert && (
        <div className="space-y-3 border-t border-white/10 pt-3">
          {/* 1. Événement → durée applicable */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">1 · Événement à l&apos;origine de l&apos;immobilisation</div>
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
            <Info label="Maximum tous cas" valeur={fiche.duree_max != null ? `${fiche.duree_max} jours` : "—"} />
            <Info label="Si pas de véhicule" valeur={budget || "—"} titre={fiche.plafond_detail || undefined} />
            <Info label="Seuil de déclenchement" valeur={fiche.immobilisation_min || "—"} />
          </div>
          {duree.note && <p className="text-xs text-white/70">{duree.note}</p>}
          {fiche.plafond_detail && <p className="text-xs text-white/60"><b className="text-white/80">Plafond :</b> {fiche.plafond_detail}</p>}

          {/* 2. Conditions et procédure */}
          <Section titre="2 · Conditions et procédure">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={`badge ${reseau.badge}`}>{reseau.label}</span>
              <span className="text-xs text-white/55">{reseau.detail}</span>
            </div>
            {fiche.conditions ? <p className="whitespace-pre-line text-xs leading-relaxed text-white/75">{fiche.conditions}</p> : <p className="text-xs text-white/40">Non trouvé.</p>}
          </Section>

          {/* 3. Formules */}
          {fiche.formules && (
            <Section titre="3 · Formules et options (à vérifier sur les conditions particulières du client)">
              <p className="whitespace-pre-line text-xs leading-relaxed text-white/75">{fiche.formules}</p>
              {fiche.prix_option && <p className="mt-1 text-xs text-white/55">Prix de l&apos;option : {fiche.prix_option}</p>}
            </Section>
          )}

          {/* 4. Exclusions */}
          {fiche.exclusions && (
            <Section titre="4 · Exclusions">
              <p className="whitespace-pre-line text-xs leading-relaxed text-white/75">{fiche.exclusions}</p>
            </Section>
          )}

          {/* 5. Facturer l'assureur ? */}
          {fiche.facturation_garage && (
            <Section titre="5 · Le garage peut-il facturer l'assureur ?">
              <p className="whitespace-pre-line text-xs leading-relaxed text-white/75">{fiche.facturation_garage}</p>
            </Section>
          )}

          {/* 6. Qui appeler */}
          <Section titre="6 · Qui appeler">
            {fiche.assisteur ? (
              <p className="text-xs text-white/75">
                {fiche.assisteur}
                {tel ? (
                  <> · <a className="font-semibold text-accent-teal hover:underline" href={`tel:${tel.replace(/[^\d+]/g, "")}`}>{tel}</a></>
                ) : fiche.assisteur_tel ? ` · ${fiche.assisteur_tel}` : ""}
                {" "}— appeler AVANT d&apos;engager des frais : sans accord ou numéro de dossier, rien n&apos;est remboursé.
              </p>
            ) : (
              <p className="text-xs text-white/40">Assisteur non trouvé : numéro au dos de la carte verte du client.</p>
            )}
          </Section>

          {fiche.notes && (
            <Section titre="Mon expérience avec cet assureur" accent>
              <p className="whitespace-pre-line text-xs leading-relaxed text-white/75">{fiche.notes}</p>
            </Section>
          )}

          {fiche.fiabilite === "comparateur" && <p className="text-xs text-amber-200">{fiab.detail}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/40">
            <span>
              Indicatif : la formule et les options du client priment.
              {sourcesListe(fiche).length > 0 && (
                <>
                  {" "}Sources :{" "}
                  {sourcesListe(fiche).map((u, i) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="text-accent-teal hover:underline">
                      {i > 0 ? " · " : ""}{new URL(u).hostname.replace(/^www\./, "")}
                    </a>
                  ))}
                </>
              )}
            </span>
            <Link href="/flotte/guide-assureurs" className="text-accent-teal hover:underline">Ouvrir le guide complet ↗</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ titre, children, accent = false }: { titre: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${accent ? "border-accent-teal/40 bg-white/5" : "border-white/10"}`}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">{titre}</div>
      {children}
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
