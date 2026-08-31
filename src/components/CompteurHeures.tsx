"use client";

// ====================================================================
//  COMPTEUR D'HEURES DE SECRÉTARIAT (v11.6) — bas de /conversation
//
//  Demande de l'éditeur : « un compteur d'heures pour la secrétaire avec
//  un champ libre pour qu'elle décrive ce qu'elle a fait pendant ces
//  heures ». La description est OBLIGATOIRE : un compteur sans détail ne
//  règle aucun désaccord.
//
//  Mise en page : tout en colonne, aucune largeur fixe, chaque ligne se
//  replie — c'est un bloc qui vit dans une colonne étroite sur téléphone.
// ====================================================================

import { useCallback, useEffect, useState } from "react";
import { Dossier } from "@/lib/types";
import { messageErreur } from "@/lib/format";
import {
  DUREES, LigneHeures, ajouterHeures, chargerHeures, forfaitHeures,
  formatDuree, libelleMois, moisCourant, supprimerHeures, totalMinutes,
} from "@/lib/heures";

function ymdParis(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function CompteurHeures({
  dossiers,
  auteur,
}: {
  dossiers: Dossier[];
  /** « secretaire » ou « garage » — la bascule « Qui écrit ? ». */
  auteur: string;
}) {
  const [mois] = useState(moisCourant());
  const [lignes, setLignes] = useState<LigneHeures[]>([]);
  const [forfait, setForfait] = useState<number | null>(null);
  const [dispo, setDispo] = useState(true);
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const [jour, setJour] = useState(ymdParis());
  const [minutes, setMinutes] = useState<number>(30);
  const [description, setDescription] = useState("");
  const [dossierId, setDossierId] = useState("");

  const charger = useCallback(async () => {
    try {
      const [l, f] = await Promise.all([chargerHeures(mois), forfaitHeures().catch(() => null)]);
      setLignes(l);
      setForfait(f);
      setDispo(true);
    } catch {
      // Migration v64 pas encore exécutée : on masque le bloc au lieu d'afficher une erreur.
      setDispo(false);
    }
  }, [mois]);

  useEffect(() => {
    charger();
  }, [charger]);

  if (!dispo) return null;

  const total = totalMinutes(lignes);
  const forfaitMin = forfait ? forfait * 60 : null;
  const depasse = forfaitMin != null && total > forfaitMin;
  const pct = forfaitMin ? Math.min(100, Math.round((total / forfaitMin) * 100)) : 0;

  async function enregistrer() {
    if (!description.trim() || busy) return;
    setBusy(true);
    setErreur(null);
    try {
      await ajouterHeures({ jour, minutes, description, dossier_id: dossierId || null, auteur });
      setDescription("");
      setDossierId("");
      setMinutes(30);
      await charger();
    } catch (e) {
      setErreur(messageErreur(e, "Heures non enregistrées."));
    } finally {
      setBusy(false);
    }
  }

  async function retirer(l: LigneHeures) {
    if (!confirm(`Supprimer cette ligne de ${formatDuree(l.minutes)} ?`)) return;
    try {
      await supprimerHeures(l.id);
      await charger();
    } catch (e) {
      setErreur(messageErreur(e, "Suppression impossible."));
    }
  }

  const nomDossier = (id: string | null) => {
    if (!id) return null;
    const d = dossiers.find((x) => x.id === id);
    return d ? d.immatriculation || d.numero_sinistre || d.client_nom || "dossier" : null;
  };

  return (
    <section className="glass-card p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="titre-bloc">Heures de secrétariat</h2>
        <span className="text-xs text-white/45">{libelleMois(mois)}</span>
      </div>

      {/* Total du mois — la seule information qu'on veut voir d'un coup d'œil. */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="valeur-hud text-white">{formatDuree(total)}</span>
        {forfait ? (
          <span className={`text-sm ${depasse ? "text-rose-300" : "text-white/50"}`}>
            sur {forfait} h / mois{depasse ? ` — dépassement de ${formatDuree(total - (forfaitMin || 0))}` : ""}
          </span>
        ) : (
          <span className="text-sm text-white/40">déclarées ce mois-ci</span>
        )}
      </div>
      {forfaitMin != null && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${depasse ? "bg-rose-400" : "bg-accent-teal"}`}
            style={{ width: `${depasse ? 100 : pct}%` }}
          />
        </div>
      )}
      {depasse && (
        <p className="alerte alerte-warn mt-2 text-xs">
          Le forfait du mois est dépassé. Les heures au-delà se facturent en heures supplémentaires,
          après accord écrit du garage — voir la procédure du contrat.
        </p>
      )}

      {erreur && <p className="badge badge-danger mt-2">{erreur}</p>}

      {/* Saisie */}
      {!ouvert ? (
        <button className="btn-primary btn-compact mt-3 w-full sm:w-auto" onClick={() => setOuvert(true)}>
          + Déclarer du temps
        </button>
      ) : (
        <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-white/5 p-2.5">
          <div className="flex flex-wrap gap-2">
            <label className="min-w-0 grow basis-[8rem] text-[11px] text-white/60">
              Jour
              <input type="date" className="field-input field-compact mt-0.5 w-full" value={jour} onChange={(e) => setJour(e.target.value)} />
            </label>
            <label className="min-w-0 grow basis-[7rem] text-[11px] text-white/60">
              Durée
              <select className="field-input field-compact mt-0.5 w-full" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {DUREES.map((d) => (
                  <option key={d} value={d}>{formatDuree(d)}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-[11px] text-white/60">
            Ce qui a été fait
            <textarea
              className="field-input mt-0.5 w-full"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ex. appelé l'assurance pour débloquer le règlement, relancé l'expert, saisi la facture"
            />
          </label>
          <label className="block text-[11px] text-white/60">
            Dossier concerné (facultatif)
            <select className="field-input field-compact mt-0.5 w-full" value={dossierId} onChange={(e) => setDossierId(e.target.value)}>
              <option value="">— aucun —</option>
              {dossiers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.immatriculation || d.numero_sinistre || "dossier"} — {d.client_nom || ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button className="btn-ghost btn-compact w-full sm:w-auto" onClick={() => setOuvert(false)}>Annuler</button>
            <button className="btn-primary btn-compact w-full sm:w-auto" disabled={busy || !description.trim()} onClick={enregistrer}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      {/* Relevé du mois */}
      {lignes.length > 0 && (
        <ul className="mt-3 max-h-[28vh] divide-y divide-white/10 overflow-y-auto pr-1">
          {lignes.map((l) => (
            <li key={l.id} className="flex items-start gap-2 py-1.5 text-sm">
              <span className="badge badge-neutral mt-0.5 shrink-0">{formatDuree(l.minutes)}</span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-white/85">{l.description}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-white/40">
                  <span>{new Date(l.jour).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                  {nomDossier(l.dossier_id) && <span className="rounded-full bg-white/10 px-1.5 py-px">📁 {nomDossier(l.dossier_id)}</span>}
                </span>
              </span>
              <button onClick={() => retirer(l)} className="shrink-0 px-1 text-white/25 hover:text-rose-300" title="Supprimer">×</button>
            </li>
          ))}
        </ul>
      )}
      {lignes.length === 0 && <p className="mt-3 text-sm text-white/40">Aucune heure déclarée ce mois-ci.</p>}
    </section>
  );
}
