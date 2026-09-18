"use client";

import { useMemo, useRef, useState } from "react";
import {
  ColonnesDetectees,
  FichierLu,
  LigneImport,
  cleDoublon,
  detecterColonnes,
  lireFichierListe,
  normaliserLignes,
} from "@/lib/admin/importListe";
import { importerListe } from "@/lib/admin/prospection";
import { typeEtablissement } from "@/lib/admin/zones";
import type { Prospect } from "@/lib/prospects";

type Cible = { owner_id: string; nom: string; zone: string | null };

const CHAMPS: { cle: keyof ColonnesDetectees; label: string; obligatoire?: boolean }[] = [
  { cle: "nom", label: "Nom du garage", obligatoire: true },
  { cle: "adresse", label: "Adresse (avec CP + ville, ou séparés)" },
  { cle: "cp", label: "Code postal" },
  { cle: "ville", label: "Ville" },
  { cle: "tel", label: "Téléphone" },
  { cle: "email", label: "Email" },
  { cle: "gerant", label: "Gérant / contact" },
  { cle: "commentaire", label: "Commentaire" },
  { cle: "date_appel", label: "Date de l'appel" },
  { cle: "repondu", label: "Répondu (case)" },
  { cle: "pas_interesse", label: "Pas intéressé (case)" },
  { cle: "date_rappel", label: "Date du rappel" },
  { cle: "rdv", label: "Rendez-vous (case)" },
  { cle: "date_rdv", label: "Date du RDV" },
];

/**
 * Import d'une liste de garages préparée hors appli (v13.4) : fichier
 * Excel / CSV → colonnes reconnues (modifiables) → aperçu avec doublons →
 * fiches créées chez le commercial choisi. Le suivi déjà noté dans le
 * fichier (répondu, pas intéressé, rappel, RDV) est repris dans le journal.
 */
export default function ImportListeProspects({ cibles, prospects, onImporte }: { cibles: Cible[]; prospects: Prospect[]; onImporte: () => Promise<void> }) {
  const [ouvert, setOuvert] = useState(false);
  const [fichier, setFichier] = useState<File | null>(null);
  const [lu, setLu] = useState<FichierLu | null>(null);
  const [cols, setCols] = useState<ColonnesDetectees>({});
  const [cible, setCible] = useState("");
  const [seulementCarrosseries, setSeulementCarrosseries] = useState(false);
  const [ignorerDoublons, setIgnorerDoublons] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);
  const [voirTout, setVoirTout] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function charger(f: File | null) {
    setFichier(f); setLu(null); setMsg(null); setCols({});
    if (!f) return;
    try {
      const r = await lireFichierListe(f);
      setLu(r);
      setCols(detecterColonnes(r.entetes));
      setOuvert(true);
    } catch (e) {
      setMsg({ ok: false, texte: e instanceof Error ? e.message : "Lecture impossible." });
    }
  }

  const analyse = useMemo(() => {
    if (!lu) return null;
    const { lignes, sansNom } = normaliserLignes(lu, cols);
    const existants = new Set<string>();
    for (const p of prospects) cleDoublon(p).forEach((c) => existants.add(c));
    const vuFichier = new Set<string>();
    const annotees = lignes.map((l) => {
      const cles = cleDoublon(l);
      const doublonBase = cles.some((c) => existants.has(c));
      const doublonFichier = cles.some((c) => vuFichier.has(c));
      cles.forEach((c) => vuFichier.add(c));
      const type = typeEtablissement(l.nom);
      return { l, doublonBase, doublonFichier, type };
    });
    const retenues = annotees.filter((a) => !(ignorerDoublons && (a.doublonBase || a.doublonFichier)) && !(seulementCarrosseries && a.type !== "carrosserie"));
    return {
      annotees,
      retenues,
      sansNom,
      doublons: annotees.filter((a) => a.doublonBase || a.doublonFichier).length,
      sansTel: retenues.filter((a) => !a.l.tel).length,
      nonCarrosseries: annotees.filter((a) => a.type !== "carrosserie").length,
      avecSuivi: retenues.filter((a) => a.l.repondu || a.l.pas_interesse || a.l.date_rappel || a.l.rdv || a.l.date_rdv || a.l.date_appel).length,
    };
  }, [lu, cols, prospects, ignorerDoublons, seulementCarrosseries]);

  async function importer() {
    if (!analyse || !cible || !analyse.retenues.length) return;
    const c = cibles.find((x) => x.owner_id === cible);
    if (!c || !confirm(`Créer ${analyse.retenues.length} fiche(s) chez ${c.nom} ?`)) return;
    setOccupe(true); setMsg(null);
    try {
      const r = await importerListe(c.owner_id, analyse.retenues.map((a) => a.l), fichier?.name || "");
      setMsg({
        ok: true,
        texte: `${r.crees} fiche(s) créée(s) chez ${c.nom}${r.sansTel ? ` (${r.sansTel} sans téléphone : le commercial le trouvera avec le bouton « Fiche Google »)` : ""}.${r.ignores.length ? ` ${r.ignores.length} doublon(s) écarté(s) à l'enregistrement : ${r.ignores.slice(0, 5).join(", ")}${r.ignores.length > 5 ? "…" : ""}.` : ""}`,
      });
      setLu(null); setFichier(null);
      if (inputRef.current) inputRef.current.value = "";
      await onImporte();
    } catch (e) {
      setMsg({ ok: false, texte: e instanceof Error ? e.message : "Import impossible." });
    } finally {
      setOccupe(false);
    }
  }

  const setCol = (cle: keyof ColonnesDetectees, v: string) => setCols((c) => ({ ...c, [cle]: v === "" ? undefined : Number(v) }));

  return (
    <section className="glass-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setOuvert((o) => !o)} className="flex items-center gap-2 text-left" aria-expanded={ouvert}>
          <span className={`shrink-0 text-white/40 transition-transform ${ouvert ? "rotate-90" : ""}`} aria-hidden>▸</span>
          <h2 className="titre-bloc">📥 Importer une liste (Excel / CSV)</h2>
        </button>
        <span className="text-xs text-white/45">Une liste préparée par une collaboratrice : les fiches se créent chez le commercial, avec le suivi déjà noté.</span>
      </div>

      {ouvert && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.csv,.txt" className="text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white" onChange={(e) => charger(e.target.files?.[0] || null)} />
            {lu && <span className="badge badge-neutral">{lu.feuille} · {lu.lignes.length} ligne(s)</span>}
          </div>
          <p className="text-xs text-white/45">
            Colonnes attendues (dans n&apos;importe quel ordre, reconnues par leur en-tête) : Nom du garage, Adresse, Téléphone, E-mail, et si la liste a déjà servi : Date de l&apos;appel, Répondu, Pas intéressé, Date du rappel, Rendez-vous, Date du RDV, Commentaire. Les cases cochées ☑ / X / Oui sont comprises.
          </p>

          {msg && <p className={`badge ${msg.ok ? "badge-ok" : "badge-danger"} whitespace-normal`}>{msg.texte}</p>}

          {lu && analyse && (
            <>
              {/* Correspondance des colonnes */}
              <details className="glass-soft rounded-xl p-3">
                <summary className="cursor-pointer text-sm text-white/80">Colonnes reconnues — vérifier / corriger</summary>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {CHAMPS.map((ch) => (
                    <div key={ch.cle}>
                      <label className="field-label">{ch.label}{ch.obligatoire ? " *" : ""}</label>
                      <select className="field-input field-compact" value={cols[ch.cle] ?? ""} onChange={(e) => setCol(ch.cle, e.target.value)}>
                        <option value="">— non présente —</option>
                        {lu.entetes.map((e, i) => <option key={i} value={i}>{e || `Colonne ${i + 1}`}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </details>

              {/* Bilan */}
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="badge badge-info">{analyse.annotees.length} garage(s) lus</span>
                {analyse.sansNom > 0 && <span className="badge badge-neutral">{analyse.sansNom} ligne(s) sans nom ignorée(s)</span>}
                <span className={`badge ${analyse.doublons ? "badge-warn" : "badge-ok"}`}>{analyse.doublons} doublon(s) (déjà en base ou en double dans le fichier)</span>
                <span className={`badge ${analyse.sansTel ? "badge-warn" : "badge-ok"}`}>{analyse.sansTel} sans téléphone</span>
                {analyse.avecSuivi > 0 && <span className="badge badge-info">{analyse.avecSuivi} avec un suivi déjà noté</span>}
                {analyse.nonCarrosseries > 0 && <span className="badge badge-neutral">{analyse.nonCarrosseries} non identifié(s) comme carrosserie</span>}
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-white/70">
                <label className="flex items-center gap-2"><input type="checkbox" checked={ignorerDoublons} onChange={(e) => setIgnorerDoublons(e.target.checked)} /> Écarter les doublons</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={seulementCarrosseries} onChange={(e) => setSeulementCarrosseries(e.target.checked)} /> Carrosseries uniquement (d&apos;après le nom)</label>
              </div>

              {/* Aperçu */}
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="text-left text-white/50">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">#</th>
                      <th className="px-2 py-1.5 font-medium">Garage</th>
                      <th className="px-2 py-1.5 font-medium">Adresse</th>
                      <th className="px-2 py-1.5 font-medium">Téléphone</th>
                      <th className="px-2 py-1.5 font-medium">Suivi</th>
                      <th className="px-2 py-1.5 font-medium">État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(voirTout ? analyse.annotees : analyse.annotees.slice(0, 15)).map((a) => {
                      const ecartee = (ignorerDoublons && (a.doublonBase || a.doublonFichier)) || (seulementCarrosseries && a.type !== "carrosserie");
                      return (
                        <tr key={a.l.ligne} className={`border-t border-white/5 ${ecartee ? "opacity-50" : ""}`}>
                          <td className="px-2 py-1.5 tabular-nums text-white/40">{a.l.ligne}</td>
                          <td className="px-2 py-1.5 font-medium text-white">{a.l.nom}{a.type !== "carrosserie" && <span className="ml-1 text-white/40">({a.type === "garage" ? "garage" : "autre"})</span>}</td>
                          <td className="px-2 py-1.5 text-white/70">{[a.l.adresse, a.l.cp, a.l.ville].filter(Boolean).join(" ")}</td>
                          <td className="px-2 py-1.5 tabular-nums">{a.l.tel || <span className="text-amber-200">manquant</span>}</td>
                          <td className="px-2 py-1.5 text-white/60">
                            {[a.l.rdv || a.l.date_rdv ? `RDV${a.l.date_rdv ? ` ${a.l.date_rdv}` : ""}` : "", a.l.pas_interesse ? "pas intéressé" : "", a.l.date_rappel ? `rappel ${a.l.date_rappel}` : "", a.l.repondu ? "répondu" : "", a.l.date_appel ? `appelé ${a.l.date_appel}` : ""].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td className="px-2 py-1.5">
                            {a.doublonBase ? <span className="badge badge-warn">déjà en base</span> : a.doublonFichier ? <span className="badge badge-warn">en double</span> : ecartee ? <span className="badge badge-neutral">écarté</span> : <span className="badge badge-ok">à créer</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {analyse.annotees.length > 15 && (
                  <div className="p-2 text-center">
                    <button type="button" className="text-xs text-accent-teal hover:underline" onClick={() => setVoirTout((v) => !v)}>{voirTout ? "Réduire" : `Voir les ${analyse.annotees.length} lignes`}</button>
                  </div>
                )}
              </div>

              {/* Attribution */}
              <div className="glass-soft flex flex-wrap items-end gap-3 rounded-xl p-3">
                <div className="min-w-[14rem] flex-1">
                  <label className="field-label">Créer les fiches chez</label>
                  <select className="field-input" value={cible} onChange={(e) => setCible(e.target.value)}>
                    <option value="">— choisir un commercial —</option>
                    {cibles.map((c) => <option key={c.owner_id} value={c.owner_id}>{c.nom}{c.zone ? ` · ${c.zone}` : ""}</option>)}
                  </select>
                </div>
                <button type="button" className="btn-primary" onClick={importer} disabled={occupe || !cible || !analyse.retenues.length}>
                  {occupe ? "Import…" : `Importer ${analyse.retenues.length} fiche(s)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
