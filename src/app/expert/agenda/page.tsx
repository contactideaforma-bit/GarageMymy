"use client";

/* ====================================================================
 *  RDV EXPERT — CALENDRIER (v13.7 → v13.24)
 *
 *  Vues Jour · Semaine · Mois · Année (+ Tournée par garage et À venir).
 *  · Clic sur un créneau vide → nouveau RDV pré-rempli (date + heure).
 *  · Glisser-déposer un RDV pour le déplacer, avec « Annuler » (garde-fou).
 *  · Chevauchements affichés côte à côte ; ligne « maintenant ».
 *  · Clavier : ← → période, T aujourd'hui, J / S / M / A changer de vue.
 *  · La vue choisie est mémorisée sur l'appareil.
 * ==================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icone from "@/components/expert/Icone";
import RdvModal from "@/components/expert/RdvModal";
import { BadgeStatutExpert, Bloc, EnTete, Vide } from "@/components/expert/ui";
import { chargerDossiers, chargerGarages, chargerRdv, enregistrerRdv } from "@/lib/expertise/data";
import { DossierExpert, GarageExpert, RdvExpert, TYPES_RDV, labelTypeRdv } from "@/lib/expertise/types";
import {
  HEURE_DEBUT, HEURE_FIN, JOURS_COURTS, MOIS, PX_HEURE, VueCalendrier, ajouterJours, colonnes, couleurRdv, decaler, depuisYmd, hhmm,
  lundiDe, minutes, periode, positionRdv, titrePeriode, ymd,
} from "@/lib/expertise/calendrier";
import { messageErreur } from "@/lib/format";

type Vue = VueCalendrier | "tournee" | "liste";
const VUES_CAL: { code: VueCalendrier; label: string; touche: string }[] = [
  { code: "jour", label: "Jour", touche: "J" },
  { code: "semaine", label: "Semaine", touche: "S" },
  { code: "mois", label: "Mois", touche: "M" },
  { code: "annee", label: "Année", touche: "A" },
];
const CLE_VUE = "expert-agenda-vue";
const heureCourte = (h: string | null) => (h ? h.slice(0, 5) : "—");
const dateLongue = (s: string) => depuisYmd(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

export default function PageAgendaExpert() {
  const [vue, setVue] = useState<Vue>("semaine");
  const [ref, setRef] = useState<Date>(() => new Date());
  const [rdv, setRdv] = useState<RdvExpert[]>([]);
  const [dispo, setDispo] = useState(true);
  const [chargement, setChargement] = useState(true);
  const [dossiers, setDossiers] = useState<Record<string, DossierExpert>>({});
  const [garages, setGarages] = useState<Record<string, GarageExpert>>({});
  const [edition, setEdition] = useState<Partial<RdvExpert> | null | "nouveau">(null);
  const [toast, setToast] = useState<{ texte: string; annuler?: () => void } | null>(null);
  const [maintenant, setMaintenant] = useState(() => new Date());
  const minuteurToast = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grille = useRef<HTMLDivElement>(null);

  // Vue mémorisée sur l'appareil (confort, jamais bloquant).
  useEffect(() => {
    try { const v = localStorage.getItem(CLE_VUE) as Vue | null; if (v) setVue(v); } catch { /* stockage indisponible */ }
  }, []);
  const choisirVue = (v: Vue) => { setVue(v); try { localStorage.setItem(CLE_VUE, v); } catch { /* ignoré */ } };

  // Horloge pour la ligne « maintenant ».
  useEffect(() => { const t = setInterval(() => setMaintenant(new Date()), 60_000); return () => clearInterval(t); }, []);

  const bornes = useMemo(() => {
    if (vue === "liste") return { de: ymd(new Date()), a: undefined as string | undefined };
    const p = periode(vue === "tournee" ? "semaine" : vue, ref);
    return { de: ymd(p.de), a: ymd(p.a) };
  }, [vue, ref]);

  const recharger = useCallback(async () => {
    const [{ rdv: r, dispo: ok }, { dossiers: d }, g] = await Promise.all([
      chargerRdv(bornes.a ? { de: bornes.de, a: bornes.a } : { de: bornes.de }),
      chargerDossiers(),
      chargerGarages(),
    ]);
    setRdv(r); setDispo(ok); setChargement(false);
    setDossiers(Object.fromEntries(d.map((x) => [x.id, x])));
    setGarages(Object.fromEntries(g.map((x) => [x.id, x])));
  }, [bornes]);
  useEffect(() => { recharger(); }, [recharger]);

  // En vue jour / semaine, on fait défiler la grille vers 8 h.
  useEffect(() => {
    if ((vue === "jour" || vue === "semaine") && grille.current) grille.current.scrollTop = PX_HEURE * (8 - HEURE_DEBUT) - 8;
  }, [vue]);

  const montrerToast = (t: { texte: string; annuler?: () => void }) => {
    setToast(t);
    if (minuteurToast.current) clearTimeout(minuteurToast.current);
    minuteurToast.current = setTimeout(() => setToast(null), 8000);
  };

  // Raccourcis clavier (hors saisie, hors modale).
  useEffect(() => {
    if (edition) return;
    const surTouche = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const cal = vue !== "tournee" && vue !== "liste" ? vue : "semaine";
      if (k === "arrowleft") { e.preventDefault(); setRef((r) => decaler(cal, r, -1)); }
      else if (k === "arrowright") { e.preventDefault(); setRef((r) => decaler(cal, r, 1)); }
      else if (k === "t") setRef(new Date());
      else { const v = VUES_CAL.find((x) => x.touche.toLowerCase() === k); if (v) choisirVue(v.code); }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [edition, vue]);

  /* ------------------------------ Actions ---------------------------- */

  async function changerStatut(r: RdvExpert, statut: RdvExpert["statut"]) {
    const avant = r.statut;
    setRdv((l) => l.map((x) => (x.id === r.id ? { ...x, statut } : x)));
    try {
      await enregistrerRdv({ ...r, statut });
      montrerToast({ texte: statut === "fait" ? "RDV marqué effectué." : "RDV mis à jour.", annuler: async () => { await enregistrerRdv({ ...r, statut: avant }); recharger(); } });
    } catch (e) { montrerToast({ texte: messageErreur(e) }); recharger(); }
  }

  /** Déplacement (glisser-déposer) : immédiat à l'écran, annulable. */
  async function deplacer(r: RdvExpert, date: string, heure?: string | null) {
    const nouvelleHeure = heure !== undefined ? heure : r.heure;
    if (r.date === date && (nouvelleHeure || null) === (r.heure || null)) return;
    const avant = { date: r.date, heure: r.heure };
    setRdv((l) => l.map((x) => (x.id === r.id ? { ...x, date, heure: nouvelleHeure } : x)));
    try {
      await enregistrerRdv({ ...r, date, heure: nouvelleHeure });
      montrerToast({
        texte: `RDV déplacé au ${dateLongue(date)}${nouvelleHeure ? ` à ${heureCourte(nouvelleHeure)}` : ""}.`,
        annuler: async () => { await enregistrerRdv({ ...r, ...avant }); recharger(); setToast(null); },
      });
    } catch (e) {
      montrerToast({ texte: messageErreur(e, "Déplacement impossible.") });
      recharger();
    }
  }

  /* ------------------------------ Données ---------------------------- */

  const parJour = useMemo(() => {
    const m: Record<string, RdvExpert[]> = {};
    for (const r of rdv) (m[r.date] ||= []).push(r);
    for (const k of Object.keys(m)) m[k].sort((a, b) => (minutes(a.heure) ?? 0) - (minutes(b.heure) ?? 0));
    return m;
  }, [rdv]);
  const aujourdhui = ymd(maintenant);
  const actifs = rdv.filter((r) => r.statut !== "annule");

  const parGarage = useMemo(() => {
    const m = new Map<string, RdvExpert[]>();
    for (const r of rdv) { const k = r.garage_id || r.lieu || "Autre lieu"; m.set(k, [...(m.get(k) || []), r]); }
    return Array.from(m.entries()).map(([k, l]) => ({ cle: k, nom: garages[k]?.nom || l[0].lieu || "Autre lieu", adresse: garages[k] ? [garages[k].adresse, garages[k].code_postal, garages[k].ville].filter(Boolean).join(" ") : l[0].adresse || "", rdv: l }));
  }, [rdv, garages]);

  const infoRdv = (r: RdvExpert) => {
    const d = r.dossier_id ? dossiers[r.dossier_id] : null;
    const g = r.garage_id ? garages[r.garage_id] : null;
    return { d, g, lieu: g?.nom || r.lieu || "Lieu à préciser", vehicule: d ? d.immatriculation || d.numero : null };
  };

  /** Heure (arrondie au quart d'heure) sous le pointeur dans une colonne horaire. */
  const heureSousPointeur = (e: React.MouseEvent | React.DragEvent, el: HTMLElement) => {
    const y = e.clientY - el.getBoundingClientRect().top;
    const m = HEURE_DEBUT * 60 + Math.round(((y / PX_HEURE) * 60) / 15) * 15;
    return hhmm(Math.min(Math.max(m, HEURE_DEBUT * 60), HEURE_FIN * 60 - 15));
  };

  /* ------------------------------ Rendus ----------------------------- */

  const renderCarte = (r: RdvExpert, avecDate = false) => {
    const { d, g, lieu } = infoRdv(r);
    return (
      <div key={r.id} className={`carte-liste ${r.statut === "annule" ? "opacity-50" : ""}`} style={{ borderLeft: `4px solid ${couleurRdv(r.type).bord}` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold tabular-nums">{avecDate ? `${dateLongue(r.date)} · ` : ""}{heureCourte(r.heure)}</span>
              <span className="text-xs text-white/50">{r.duree_min || 45} min</span>
              <span className="badge badge-info">{labelTypeRdv(r.type)}</span>
              {r.statut === "fait" && <span className="badge badge-ok">Effectué</span>}
              {r.statut === "annule" && <span className="badge badge-neutral">Annulé</span>}
            </div>
            <div className="mt-1 text-sm">
              <Icone nom="lieu" className="opacity-60" /> <span className="font-medium">{lieu}</span>
              {(r.adresse || g) && <span className="text-white/55"> — {r.adresse || [g?.adresse, g?.code_postal, g?.ville].filter(Boolean).join(" ")}</span>}
            </div>
            {d && (
              <div className="mt-1 text-sm text-white/70">
                <Icone nom="voiture" className="opacity-60" /> <Link href={`/expert/dossiers/${d.id}`} className="hover:underline">{d.numero} · {[d.immatriculation, d.marque, d.modele].filter(Boolean).join(" ")}{d.lese_nom ? ` — ${d.lese_nom}` : ""}</Link>
                <span className="ml-2"><BadgeStatutExpert statut={d.statut} /></span>
              </div>
            )}
            {r.notes && <div className="mt-1 text-xs text-white/50">{r.notes}</div>}
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            {r.statut === "planifie" && <button className="btn-ghost btn-compact" onClick={() => changerStatut(r, "fait")}><Icone nom="check" /> Effectué</button>}
            <button className="btn-ghost btn-compact" onClick={() => setEdition(r)}>Modifier</button>
          </div>
        </div>
      </div>
    );
  };

  /** Bloc d'un RDV dans la grille horaire (jour / semaine). */
  const renderBloc = (r: RdvExpert, place: { col: number; nb: number } | undefined) => {
    const { top, hauteur } = positionRdv(r);
    const c = couleurRdv(r.type);
    const { lieu, vehicule } = infoRdv(r);
    const nb = place?.nb || 1;
    const col = place?.col || 0;
    return (
      <button
        key={r.id}
        type="button"
        draggable
        onDragStart={(e) => { e.dataTransfer.setData("text/plain", r.id); e.dataTransfer.effectAllowed = "move"; }}
        onClick={(e) => { e.stopPropagation(); setEdition(r); }}
        className={`absolute overflow-hidden rounded-lg px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition hover:z-10 hover:shadow-md ${r.statut === "annule" ? "line-through opacity-50" : ""}`}
        style={{ top, height: hauteur, left: `calc(${(col / nb) * 100}% + 2px)`, width: `calc(${100 / nb}% - 4px)`, background: c.fond, color: c.texte, borderLeft: `3px solid ${c.bord}` }}
        title={`${heureCourte(r.heure)} · ${labelTypeRdv(r.type)} · ${lieu}${vehicule ? ` · ${vehicule}` : ""}${r.notes ? `\n${r.notes}` : ""}`}
      >
        <div className="font-semibold tabular-nums">{heureCourte(r.heure)}{r.statut === "fait" ? " ✓" : ""}</div>
        <div className="truncate font-medium">{lieu}</div>
        {hauteur > 40 && vehicule && <div className="truncate opacity-80">{vehicule}</div>}
      </button>
    );
  };

  /** Grille horaire pour 1 jour (vue Jour) ou 7 jours (vue Semaine). */
  const renderGrille = (jours: string[]) => {
    const heures = Array.from({ length: HEURE_FIN - HEURE_DEBUT }, (_, i) => HEURE_DEBUT + i);
    const hauteur = (HEURE_FIN - HEURE_DEBUT) * PX_HEURE;
    const gabarit = { gridTemplateColumns: `3rem repeat(${jours.length}, minmax(0, 1fr))` };
    const minMaintenant = maintenant.getHours() * 60 + maintenant.getMinutes();
    return (
      <div className="glass-card overflow-hidden p-0">
        {/* En-têtes des jours */}
        <div className="grid border-b border-white/10" style={gabarit}>
          <div />
          {jours.map((j) => {
            const d = depuisYmd(j);
            const n = (parJour[j] || []).filter((r) => r.statut !== "annule").length;
            return (
              <button key={j} type="button" onClick={() => { setRef(d); choisirVue("jour"); }} className={`border-l border-white/10 px-1 py-2 text-center transition hover:bg-white/5 ${j === aujourdhui ? "font-bold" : ""}`}>
                <div className="text-[11px] uppercase tracking-wider text-white/50">{JOURS_COURTS[(d.getDay() + 6) % 7]}</div>
                <div className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm ${j === aujourdhui ? "bg-[var(--al-bleu-2,#0b3fc4)] text-white" : ""}`}>{d.getDate()}</div>
                {n > 0 && <div className="text-[10px] text-white/50">{n} RDV</div>}
              </button>
            );
          })}
        </div>
        {/* Corps */}
        <div ref={grille} className="max-h-[70vh] overflow-y-auto">
          <div className="relative grid" style={{ ...gabarit, height: hauteur }}>
            <div className="relative">
              {heures.map((h) => <div key={h} className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-white/45" style={{ top: (h - HEURE_DEBUT) * PX_HEURE }}>{h > HEURE_DEBUT ? `${h}:00` : ""}</div>)}
            </div>
            {jours.map((j) => {
              const liste = parJour[j] || [];
              const places = colonnes(liste);
              return (
                <div
                  key={j}
                  className={`relative cursor-copy border-l border-white/10 ${j === aujourdhui ? "bg-[rgba(11,63,196,0.04)]" : ""}`}
                  style={{ backgroundImage: `repeating-linear-gradient(to bottom, rgba(0,0,0,0.07) 0, rgba(0,0,0,0.07) 1px, transparent 1px, transparent ${PX_HEURE / 2}px)` }}
                  onClick={(e) => setEdition({ date: j, heure: heureSousPointeur(e, e.currentTarget) })}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                  onDrop={(e) => { e.preventDefault(); const r = rdv.find((x) => x.id === e.dataTransfer.getData("text/plain")); if (r) deplacer(r, j, `${heureSousPointeur(e, e.currentTarget)}:00`); }}
                  title="Clic : nouveau rendez-vous à cette heure"
                >
                  {j === aujourdhui && minMaintenant >= HEURE_DEBUT * 60 && minMaintenant <= HEURE_FIN * 60 && (
                    <div className="pointer-events-none absolute left-0 right-0 z-20 h-0.5 bg-rose-500" style={{ top: ((minMaintenant - HEURE_DEBUT * 60) / 60) * PX_HEURE }}>
                      <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500" />
                    </div>
                  )}
                  {liste.map((r) => renderBloc(r, places[r.id]))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderMois = () => {
    const { de } = periode("mois", ref);
    const cases = Array.from({ length: 42 }, (_, i) => ajouterJours(de, i));
    return (
      <div className="glass-card overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b border-white/10">
          {JOURS_COURTS.map((j) => <div key={j} className="py-2 text-center text-[11px] uppercase tracking-wider text-white/50">{j}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cases.map((d) => {
            const j = ymd(d);
            const liste = parJour[j] || [];
            const horsMois = d.getMonth() !== ref.getMonth();
            return (
              <div
                key={j}
                className={`min-h-[4.5rem] cursor-copy border-b border-l border-white/10 p-1 sm:min-h-[6.5rem] ${horsMois ? "bg-black/[0.03] opacity-60" : ""}`}
                onClick={() => setEdition({ date: j, heure: "09:00" })}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={(e) => { e.preventDefault(); const r = rdv.find((x) => x.id === e.dataTransfer.getData("text/plain")); if (r) deplacer(r, j); }}
                title="Clic : nouveau rendez-vous ce jour"
              >
                <button type="button" onClick={(e) => { e.stopPropagation(); setRef(d); choisirVue("jour"); }} className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition hover:bg-white/10 ${j === aujourdhui ? "bg-[var(--al-bleu-2,#0b3fc4)] font-bold text-white" : ""}`}>{d.getDate()}</button>
                {/* Téléphone : pastille de compte */}
                {liste.length > 0 && <div className="mt-1 text-center sm:hidden"><span className="badge badge-info">{liste.length}</span></div>}
                {/* Grand écran : les RDV */}
                <div className="mt-0.5 hidden space-y-0.5 sm:block">
                  {liste.slice(0, 3).map((r) => {
                    const c = couleurRdv(r.type);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", r.id); e.dataTransfer.effectAllowed = "move"; }}
                        onClick={(e) => { e.stopPropagation(); setEdition(r); }}
                        className={`block w-full truncate rounded px-1 text-left text-[11px] ${r.statut === "annule" ? "line-through opacity-50" : ""}`}
                        style={{ background: c.fond, color: c.texte, borderLeft: `3px solid ${c.bord}` }}
                        title={`${heureCourte(r.heure)} · ${infoRdv(r).lieu}`}
                      >
                        <span className="tabular-nums">{heureCourte(r.heure)}</span> {infoRdv(r).lieu}
                      </button>
                    );
                  })}
                  {liste.length > 3 && (
                    <button type="button" className="text-[11px] text-white/60 hover:underline" onClick={(e) => { e.stopPropagation(); setRef(d); choisirVue("jour"); }}>+ {liste.length - 3} autre(s)</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAnnee = () => {
    const annee = ref.getFullYear();
    const intensite = (n: number) => (n === 0 ? "" : n === 1 ? "rgba(11,63,196,0.18)" : n === 2 ? "rgba(11,63,196,0.38)" : "rgba(11,63,196,0.65)");
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MOIS.map((nom, m) => {
          const premier = new Date(annee, m, 1);
          const debut = lundiDe(premier);
          const cases = Array.from({ length: 42 }, (_, i) => ajouterJours(debut, i));
          const total = actifs.filter((r) => depuisYmd(r.date).getMonth() === m && depuisYmd(r.date).getFullYear() === annee).length;
          return (
            <div key={nom} className="glass-card p-3">
              <button type="button" className="mb-2 flex w-full items-center justify-between text-left font-semibold hover:underline" onClick={() => { setRef(premier); choisirVue("mois"); }}>
                <span>{nom}</span>
                <span className="text-xs font-normal text-white/50">{total ? `${total} RDV` : ""}</span>
              </button>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px]">
                {JOURS_COURTS.map((j) => <div key={j} className="text-white/40">{j[0]}</div>)}
                {cases.map((d) => {
                  const j = ymd(d);
                  if (d.getMonth() !== m) return <div key={j} />;
                  const n = (parJour[j] || []).filter((r) => r.statut !== "annule").length;
                  return (
                    <button
                      key={j}
                      type="button"
                      onClick={() => { setRef(d); choisirVue("jour"); }}
                      className={`aspect-square rounded tabular-nums transition hover:ring-1 hover:ring-[var(--al-bleu-2,#0b3fc4)] ${j === aujourdhui ? "font-bold ring-1 ring-[var(--al-bleu-2,#0b3fc4)]" : ""} ${n >= 3 ? "text-white" : ""}`}
                      style={{ background: intensite(Math.min(n, 3)) }}
                      title={`${d.toLocaleDateString("fr-FR")} : ${n} rendez-vous`}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /* ------------------------------- Page ------------------------------ */

  const vueCal: VueCalendrier = vue === "tournee" || vue === "liste" ? "semaine" : vue;
  const joursSemaine = useMemo(() => { const l = lundiDe(ref); return Array.from({ length: 7 }, (_, i) => ymd(ajouterJours(l, i))); }, [ref]);

  return (
    <div className="space-y-4">
      <EnTete
        titre="RDV expert"
        sousTitre="Visites chez les réparateurs, contradictoires et contrôles — liés aux dossiers."
        actions={<button className="btn-primary" onClick={() => setEdition("nouveau")}><Icone nom="plus" /> Planifier un rendez-vous</button>}
      />
      {!dispo && <div className="alerte alerte-warn text-sm">Exécute <code className="font-mono">supabase/migration_v77.sql</code> dans Supabase → SQL Editor pour activer l&apos;agenda.</div>}

      {/* Barre d'outils */}
      <div className="glass-card flex flex-wrap items-center gap-2 p-2">
        <div className="segment">
          {VUES_CAL.map((v) => (
            <button key={v.code} className={`segment-btn ${vue === v.code ? "actif" : ""}`} onClick={() => choisirVue(v.code)} title={`Touche ${v.touche}`}>{v.label}</button>
          ))}
        </div>
        <div className="segment">
          <button className={`segment-btn ${vue === "tournee" ? "actif" : ""}`} onClick={() => choisirVue("tournee")}>Tournée</button>
          <button className={`segment-btn ${vue === "liste" ? "actif" : ""}`} onClick={() => choisirVue("liste")}>À venir</button>
        </div>
        {vue !== "liste" && (
          <div className="flex flex-wrap items-center gap-1 sm:ml-auto">
            <button className="btn-ghost btn-compact" onClick={() => setRef((r) => decaler(vueCal, r, -1))} aria-label="Période précédente" title="Précédent (←)"><Icone nom="gauche" /></button>
            <button className="btn-ghost btn-compact" onClick={() => setRef(new Date())} title="Aujourd'hui (T)">Aujourd&apos;hui</button>
            <button className="btn-ghost btn-compact" onClick={() => setRef((r) => decaler(vueCal, r, 1))} aria-label="Période suivante" title="Suivant (→)"><Icone nom="droite" /></button>
            <span className="ml-1 font-semibold">{titrePeriode(vueCal, ref)}</span>
            <input type="date" className="field-input field-compact ml-1 w-auto" value={ymd(ref)} onChange={(e) => e.target.value && setRef(depuisYmd(e.target.value))} aria-label="Aller à une date" title="Aller à une date" />
          </div>
        )}
      </div>

      {/* Légende */}
      {vue !== "liste" && vue !== "tournee" && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
          {TYPES_RDV.map((t) => { const c = couleurRdv(t.code); return <span key={t.code} className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: c.fond, borderLeft: `3px solid ${c.bord}` }} />{t.label}</span>; })}
          <span className="hidden md:inline">· Clic sur un créneau : nouveau RDV · glisser un RDV pour le déplacer · ← → T J S M A</span>
        </div>
      )}

      {chargement ? <div className="skeleton h-64 rounded-2xl" /> : (
        <>
          {vue === "jour" && (
            <>
              {renderGrille([ymd(ref)])}
              {(parJour[ymd(ref)] || []).length > 0 && <div className="space-y-2">{(parJour[ymd(ref)] || []).map((r) => renderCarte(r))}</div>}
            </>
          )}

          {vue === "semaine" && (
            <>
              <div className="hidden md:block">{renderGrille(joursSemaine)}</div>
              {/* Téléphone : liste jour par jour */}
              <div className="space-y-3 md:hidden">
                {joursSemaine.map((j, i) => {
                  const liste = parJour[j] || [];
                  if (!liste.length && i >= 5) return null;
                  return (
                    <Bloc key={j} titre={`${dateLongue(j)}${j === aujourdhui ? " · aujourd'hui" : ""}`} actions={<button className="btn-ghost btn-compact" onClick={() => setEdition({ date: j })}><Icone nom="plus" /> RDV</button>}>
                      {liste.length === 0 ? <p className="text-sm text-white/40">Aucun rendez-vous.</p> : <div className="space-y-2">{liste.map((r) => renderCarte(r))}</div>}
                    </Bloc>
                  );
                })}
              </div>
            </>
          )}

          {vue === "mois" && renderMois()}
          {vue === "annee" && renderAnnee()}

          {vue === "tournee" && (
            parGarage.length === 0 ? <div className="glass-card p-4"><Vide titre="Aucune visite cette semaine" texte="Planifie les visites : elles se regroupent ici par réparateur pour organiser la tournée." /></div> : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {parGarage.map((g) => (
                  <Bloc key={g.cle} titre={`${g.nom} · ${g.rdv.length} véhicule(s)`}>
                    {g.adresse && (
                      <p className="mb-2 text-xs text-white/55">
                        <Icone nom="lieu" /> {g.adresse}
                        <a className="ml-2 underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${g.nom} ${g.adresse}`)}`} target="_blank" rel="noopener noreferrer">Itinéraire</a>
                      </p>
                    )}
                    <div className="space-y-2">{g.rdv.map((r) => renderCarte(r, true))}</div>
                  </Bloc>
                ))}
              </div>
            )
          )}

          {vue === "liste" && (
            rdv.length === 0 ? <div className="glass-card p-4"><Vide titre="Aucun rendez-vous à venir" action={<button className="btn-primary" onClick={() => setEdition("nouveau")}><Icone nom="plus" /> Planifier</button>} /></div> : (
              <div className="space-y-2">{rdv.map((r) => renderCarte(r, true))}</div>
            )
          )}
        </>
      )}

      {edition && (
        <RdvModal initial={edition === "nouveau" ? null : edition} onClose={() => setEdition(null)} onSaved={() => { setEdition(null); recharger(); }} />
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl border-2 border-black bg-white px-4 py-2 text-sm text-black shadow-lg" role="status">
          <span>{toast.texte}</span>
          {toast.annuler && <button className="font-semibold underline" onClick={() => { const a = toast.annuler; setToast(null); a?.(); }}>Annuler</button>}
          <button className="text-black/50" aria-label="Fermer" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </div>
  );
}
