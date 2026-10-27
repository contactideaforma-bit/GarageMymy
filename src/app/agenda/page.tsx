"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { heureLisible } from "@/lib/ardoise";
import { messageErreur } from "@/lib/format";
import { Evenement, Dossier } from "@/lib/types";
import ConfigBanner from "@/components/ConfigBanner";
import { useZoneVisible } from "@/lib/cadreMobile";
import { useEstMobile } from "@/lib/mobile";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function lundi(d: Date) { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const CAT: Record<string, { label: string; cls: string; point: string }> = {
  rdv_client: { label: "Client", cls: "from-accent-violet/40 to-accent-violet/20", point: "#8b5cf6" },
  rdv_expert: { label: "Expert", cls: "from-accent-teal/40 to-accent-teal/20", point: "#14b8a6" },
  // v41 : rendez-vous créé depuis un rappel du bloc « À faire ».
  rappel: { label: "Rappel", cls: "from-amber-400/40 to-amber-400/20", point: "#f59e0b" },
  autre: { label: "Autre", cls: "from-white/20 to-white/10", point: "#9ca3af" },
};

export default function AgendaPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Evenement[]>([]);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  // Vue MOIS par défaut : meilleure visibilité d'ensemble.
  const [vue, setVue] = useState<"semaine" | "mois">("mois");
  const [ref, setRef] = useState<Date>(startOfDay(new Date()));
  // v13.50 — AGENDA MOBILE : le mois devient une grille COMPACTE (jour + points
  // de couleur) et le jour choisi s'affiche en liste lisible dessous ; la
  // semaine devient une liste jour par jour. Les chips à 10 px dans 7
  // colonnes se cassaient lettre par lettre sur téléphone.
  const mobile = useEstMobile();
  const [jourSel, setJourSel] = useState<string>(ymd(new Date()));

  // modal RDV
  const [open, setOpen] = useState(false);
  // Téléphone : la modale épouse la zone visible, clavier compris (v11.2).
  const { style: zoneStyle } = useZoneVisible(open);
  const [fDossier, setFDossier] = useState("");
  const [fDate, setFDate] = useState(ymd(new Date()));
  const [fHeure, setFHeure] = useState("09:00");
  const [fMotif, setFMotif] = useState("");
  const [fCat, setFCat] = useState("rdv_client");
  const [fQui, setFQui] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [e, d] = await Promise.all([
      supabase.from("evenements").select("*").order("date_evenement", { ascending: true }),
      supabase.from("dossiers").select("*").order("created_at", { ascending: false }),
    ]);
    if (e.data) setEvents(e.data as Evenement[]);
    if (d.data) setDossiers(d.data as Dossier[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // index des événements par jour (clé ymd)
  const parJour = useMemo(() => {
    const map: Record<string, Evenement[]> = {};
    for (const ev of events) {
      const k = ymd(new Date(ev.date_evenement));
      (map[k] ||= []).push(ev);
    }
    return map;
  }, [events]);

  function ouvrir(dateStr?: string) {
    setFDossier(""); setFDate(dateStr || ymd(new Date())); setFHeure("09:00");
    setFMotif(""); setFCat("rdv_client"); setFQui(""); setFDesc("");
    setOpen(true);
  }

  // pré-remplit l'interlocuteur quand on choisit un dossier
  function choisirDossier(id: string) {
    setFDossier(id);
    const d = dossiers.find((x) => x.id === id);
    if (d) {
      if (fCat === "rdv_expert") setFQui(d.expert_nom || d.cabinet_expert || "");
      else setFQui(d.client_nom || "");
    }
  }

  async function enregistrer() {
    if (!fMotif.trim() || !fDate) return;
    setSaving(true);
    const { error } = await supabase.from("evenements").insert({
      dossier_id: fDossier || null,
      titre: fMotif,
      description: fDesc || null,
      date_evenement: new Date(`${fDate}T${fHeure || "09:00"}`).toISOString(),
      categorie: fCat,
      avec_qui: fQui || null,
    });
    setSaving(false);
    if (error) {
      // Modale laissée ouverte : la saisie n'est pas perdue.
      alert(messageErreur(error, "Rendez-vous non enregistré."));
      return;
    }
    setOpen(false);
    load();
  }

  // « 9h00 » plutôt que « 09:00 » (v9.9) : lisible d'un coup d'œil.
  function heure(ev: Evenement) {
    return heureLisible(ev.date_evenement);
  }
  function clicEvent(ev: Evenement) {
    if (ev.dossier_id) router.push(`/sinistres/${ev.dossier_id}`);
  }

  // --- données vue ---
  const semaine = Array.from({ length: 7 }, (_, i) => addDays(lundi(ref), i));
  const moisDays = (() => {
    const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const start = lundi(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  })();

  const titrePeriode =
    vue === "semaine"
      ? `${semaine[0].toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} — ${semaine[6].toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`
      : ref.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  function naviguer(dir: number) {
    setRef((r) => {
      const suivant = vue === "semaine" ? addDays(r, dir * 7) : addMonths(r, dir);
      // Le jour sélectionné suit la période (1er du mois / lundi de la semaine).
      setJourSel(ymd(vue === "semaine" ? lundi(suivant) : new Date(suivant.getFullYear(), suivant.getMonth(), 1)));
      return suivant;
    });
  }
  function aujourdhui() {
    const t = startOfDay(new Date());
    setRef(t);
    setJourSel(ymd(t));
  }
  const libelleJour = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  };

  // Véhicule · immatriculation · client du dossier rattaché : sans ça, un
  // « Envoyer la facture » ne dit pas de quel dossier il s'agit.
  function contexteDossier(ev: Evenement): string {
    if (!ev.dossier_id) return "";
    const d = dossiers.find((x) => x.id === ev.dossier_id);
    if (!d) return "";
    return [d.marque_modele, d.immatriculation, d.client_nom].filter(Boolean).join(" · ");
  }

  function EventChip({ ev, compact }: { ev: Evenement; compact?: boolean }) {
    const cat = CAT[ev.categorie || "autre"] || CAT.autre;
    const ctx = contexteDossier(ev);
    return (
      <button
        onClick={() => clicEvent(ev)}
        className={`w-full text-left rounded-md bg-gradient-to-r ${cat.cls} px-2 py-1 ${compact ? "text-[10px]" : "text-[11px]"} text-white hover:brightness-110`}
        title={`${heure(ev)} · ${ev.titre}${ctx ? ` — ${ctx}` : ""}${ev.avec_qui ? " · " + ev.avec_qui : ""}`}
      >
        <span className="font-medium">{heure(ev)}</span> {ev.titre}
        {!compact && ctx && <span className="block truncate text-white/70">{ctx}</span>}
        {!compact && !ctx && ev.avec_qui && <span className="text-white/60"> · {ev.avec_qui}</span>}
      </button>
    );
  }

  /** Ligne d'événement LISIBLE (mobile) : heure, titre, dossier, catégorie. */
  function EventRow({ ev }: { ev: Evenement }) {
    const cat = CAT[ev.categorie || "autre"] || CAT.autre;
    const ctx = contexteDossier(ev);
    return (
      <button type="button" onClick={() => clicEvent(ev)} className="ligne-liste" disabled={!ev.dossier_id} title={cat.label}>
        <span className="flex w-12 shrink-0 flex-col items-center">
          <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--mea-texte)" }}>{heure(ev)}</span>
          <span className="mt-1 h-2 w-2 rounded-full" style={{ background: cat.point }} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-snug" style={{ color: "var(--mea-texte)" }}>{ev.titre}</span>
          {(ctx || ev.avec_qui) && (
            <span className="block truncate text-xs" style={{ color: "var(--mea-texte-3)" }}>{ctx || ev.avec_qui}</span>
          )}
        </span>
        {ev.dossier_id && <span aria-hidden style={{ color: "var(--mea-texte-3)" }}>›</span>}
      </button>
    );
  }

  /** Liste du jour sélectionné (mobile, sous la grille du mois). */
  const listeJour = (k: string) => {
    const items = parJour[k] || [];
    return (
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="text-sm font-semibold capitalize" style={{ color: "var(--mea-texte)" }}>{libelleJour(k)}</span>
          <button type="button" onClick={() => ouvrir(k)} className="chip">+ RDV</button>
        </div>
        {items.length === 0 ? (
          <p className="rounded-xl px-3 py-4 text-center text-sm" style={{ background: "var(--mea-surface-2)", color: "var(--mea-texte-3)" }}>Rien de prévu ce jour.</p>
        ) : (
          <div className="groupe-liste">{items.map((ev) => <EventRow key={ev.id} ev={ev} />)}</div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 lg:mb-6">
        <h1 className="titre-page">Agenda</h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
            <button onClick={() => setVue("semaine")} className={`rounded-lg px-3 py-1 text-sm ${vue === "semaine" ? "bg-white/15 text-white font-medium" : "text-white/60 hover:text-white"}`}>Semaine</button>
            <button onClick={() => setVue("mois")} className={`rounded-lg px-3 py-1 text-sm ${vue === "mois" ? "bg-white/15 text-white font-medium" : "text-white/60 hover:text-white"}`}>Mois</button>
          </div>
          <button onClick={() => ouvrir()} className="btn-primary">+ RDV</button>
        </div>
      </div>

      <ConfigBanner />

      {/* Navigation */}
      <div className="glass-card p-4 mb-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => naviguer(-1)} className="btn-ghost py-1 px-3 text-sm">‹ Préc.</button>
          <div className="text-center">
            <div className="font-semibold text-white capitalize">{titrePeriode}</div>
            <button onClick={aujourdhui} className="text-xs text-accent-pink hover:underline">Aujourd&apos;hui</button>
          </div>
          <button onClick={() => naviguer(1)} className="btn-ghost py-1 px-3 text-sm">Suiv. ›</button>
        </div>

        {loading ? (
          <p className="text-white/40">Chargement…</p>
        ) : mobile && vue === "semaine" ? (
          /* ----- MOBILE · SEMAINE : liste jour par jour ----- */
          <div className="space-y-3">
            {semaine.map((j, i) => {
              const k = ymd(j);
              const items = parJour[k] || [];
              const isToday = k === ymd(new Date());
              return (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between px-1">
                    <span className={`text-sm font-semibold ${isToday ? "text-accent-pink" : ""}`} style={isToday ? undefined : { color: "var(--mea-texte)" }}>
                      {JOURS[i]} {j.getDate()}{isToday ? " · aujourd'hui" : ""}
                    </span>
                    <button type="button" onClick={() => ouvrir(k)} className="text-xs" style={{ color: "var(--mea-texte-3)" }}>＋ RDV</button>
                  </div>
                  {items.length === 0 ? (
                    <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "var(--mea-surface-2)", color: "var(--mea-texte-3)" }}>—</div>
                  ) : (
                    <div className="groupe-liste">{items.map((ev) => <EventRow key={ev.id} ev={ev} />)}</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : mobile ? (
          /* ----- MOBILE · MOIS : grille compacte + liste du jour choisi ----- */
          <div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {JOURS.map((d) => <div key={d} className="text-center text-[11px] font-semibold" style={{ color: "var(--mea-texte-3)" }}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {moisDays.map((j, i) => {
                const k = ymd(j);
                const items = parJour[k] || [];
                const isToday = k === ymd(new Date());
                const inMonth = j.getMonth() === ref.getMonth();
                const sel = k === jourSel;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setJourSel(k)}
                    className={`cal-jour ${sel ? "sel" : ""} ${isToday ? "auj" : ""} ${inMonth ? "" : "hors"}`}
                    aria-pressed={sel}
                    aria-label={`${libelleJour(k)}${items.length ? `, ${items.length} rendez-vous` : ""}`}
                  >
                    <span className="num">{j.getDate()}</span>
                    <span className="points" aria-hidden>
                      {items.slice(0, 3).map((ev) => (
                        <i key={ev.id} style={{ background: (CAT[ev.categorie || "autre"] || CAT.autre).point }} />
                      ))}
                      {items.length > 3 && <em>+</em>}
                    </span>
                  </button>
                );
              })}
            </div>
            {listeJour(jourSel)}
          </div>
        ) : vue === "semaine" ? (
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
            {semaine.map((j, i) => {
              const items = parJour[ymd(j)] || [];
              const isToday = ymd(j) === ymd(new Date());
              return (
                <div key={i} className={`glass-soft p-2 min-h-[8rem] ${isToday ? "ring-1 ring-accent-violet" : ""}`}>
                  <button onClick={() => ouvrir(ymd(j))} className="w-full text-left text-xs font-semibold text-white/70 mb-2 hover:text-white">
                    {JOURS[i]} <span className="text-white/40">{j.getDate()}</span> <span className="text-white/30">＋</span>
                  </button>
                  <div className="space-y-1">
                    {items.map((ev) => <EventChip key={ev.id} ev={ev} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-7 gap-2 mb-1">
              {JOURS.map((d) => <div key={d} className="text-center text-xs font-semibold text-white/40">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {moisDays.map((j, i) => {
                const items = parJour[ymd(j)] || [];
                const isToday = ymd(j) === ymd(new Date());
                const inMonth = j.getMonth() === ref.getMonth();
                return (
                  <div key={i} className={`glass-soft p-1.5 min-h-[5.5rem] ${isToday ? "ring-1 ring-accent-violet" : ""} ${inMonth ? "" : "opacity-40"}`}>
                    <button onClick={() => ouvrir(ymd(j))} className="block w-full text-left text-[11px] font-medium text-white/70 hover:text-white">
                      {j.getDate()}
                    </button>
                    <div className="space-y-0.5 mt-1">
                      {items.slice(0, 3).map((ev) => <EventChip key={ev.id} ev={ev} compact />)}
                      {items.length > 3 && <div className="text-[10px] text-white/40">+{items.length - 3}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal RDV */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-2 sm:p-4 overflow-y-auto backdrop-blur-sm" style={zoneStyle}>
          <div className="w-full max-w-lg glass-card my-2 sm:my-8 modal-panel p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Nouveau rendez-vous</h2>
              <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="field-label">Type de RDV</label>
                <select className="field-input" value={fCat} onChange={(e) => setFCat(e.target.value)}>
                  <option value="rdv_client">RDV client</option>
                  <option value="rdv_expert">RDV expert</option>
                  <option value="rappel">Rappel</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="field-label">Dossier concerné (optionnel)</label>
                <select className="field-input" value={fDossier} onChange={(e) => choisirDossier(e.target.value)}>
                  <option value="">— Aucun —</option>
                  {dossiers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {(d.marque_modele || "Dossier")}{d.immatriculation ? ` (${d.immatriculation})` : ""} · {d.client_nom || d.numero_sinistre || "—"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Date</label>
                  <input type="date" className="field-input" value={fDate} onChange={(e) => setFDate(e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Heure</label>
                  <input type="time" className="field-input" value={fHeure} onChange={(e) => setFHeure(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="field-label">Motif</label>
                <input className="field-input" value={fMotif} onChange={(e) => setFMotif(e.target.value)} placeholder="Ex. Expertise, restitution, signature devis…" />
              </div>
              <div>
                <label className="field-label">Avec qui</label>
                <input className="field-input" value={fQui} onChange={(e) => setFQui(e.target.value)} placeholder="Nom de l'interlocuteur" />
              </div>
              <div>
                <label className="field-label">Notes (optionnel)</label>
                <textarea className="field-input" rows={2} value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setOpen(false)} className="btn-ghost">Annuler</button>
                <button onClick={enregistrer} disabled={saving || !fMotif.trim()} className="btn-primary">
                  {saving ? "Enregistrement…" : "Ajouter le RDV"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
