"use client";

/* ====================================================================
 *  RDV EXPERT (v13.7) — planification des visites chez les réparateurs.
 *  Vue semaine (jour par jour) ou tournée (par garage), rendez-vous liés
 *  aux dossiers, statut planifié / effectué / annulé.
 * ==================================================================== */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icone from "@/components/expert/Icone";
import RdvModal from "@/components/expert/RdvModal";
import { BadgeStatutExpert, Bloc, EnTete, Vide } from "@/components/expert/ui";
import { chargerDossiers, chargerGarages, chargerRdv, enregistrerRdv } from "@/lib/expertise/data";
import { DossierExpert, GarageExpert, RdvExpert, labelTypeRdv } from "@/lib/expertise/types";

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lundiDe = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const heure = (h: string | null) => (h ? h.slice(0, 5) : "—");
const dateLongue = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

export default function PageAgendaExpert() {
  const [lundi, setLundi] = useState<Date>(() => lundiDe(new Date()));
  const [rdv, setRdv] = useState<RdvExpert[]>([]);
  const [dispo, setDispo] = useState(true);
  const [dossiers, setDossiers] = useState<Record<string, DossierExpert>>({});
  const [garages, setGarages] = useState<Record<string, GarageExpert>>({});
  const [vue, setVue] = useState<"semaine" | "tournee" | "liste">("semaine");
  const [edition, setEdition] = useState<Partial<RdvExpert> | null | "nouveau">(null);

  const dimanche = useMemo(() => { const d = new Date(lundi); d.setDate(d.getDate() + 6); return d; }, [lundi]);

  const recharger = useCallback(async () => {
    const [{ rdv: r, dispo: ok }, { dossiers: d }, g] = await Promise.all([
      chargerRdv(vue === "liste" ? { de: ymd(new Date()) } : { de: ymd(lundi), a: ymd(dimanche) }),
      chargerDossiers(),
      chargerGarages(),
    ]);
    setRdv(r); setDispo(ok);
    setDossiers(Object.fromEntries(d.map((x) => [x.id, x])));
    setGarages(Object.fromEntries(g.map((x) => [x.id, x])));
  }, [lundi, dimanche, vue]);
  useEffect(() => { recharger(); }, [recharger]);

  const jours = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(lundi); d.setDate(d.getDate() + i); return ymd(d); }), [lundi]);
  const aujourdhui = ymd(new Date());
  const parGarage = useMemo(() => {
    const m = new Map<string, RdvExpert[]>();
    for (const r of rdv) { const k = r.garage_id || r.lieu || "Autre lieu"; m.set(k, [...(m.get(k) || []), r]); }
    return Array.from(m.entries()).map(([k, l]) => ({ cle: k, nom: garages[k]?.nom || l[0].lieu || "Autre lieu", adresse: garages[k] ? [garages[k].adresse, garages[k].code_postal, garages[k].ville].filter(Boolean).join(" ") : l[0].adresse || "", rdv: l }));
  }, [rdv, garages]);

  async function changerStatut(r: RdvExpert, statut: RdvExpert["statut"]) {
    await enregistrerRdv({ ...r, statut });
    recharger();
  }

  const CarteRdv = ({ r, avecDate = false }: { r: RdvExpert; avecDate?: boolean }) => {
    const d = r.dossier_id ? dossiers[r.dossier_id] : null;
    const g = r.garage_id ? garages[r.garage_id] : null;
    return (
      <div className={`carte-liste ${r.statut === "annule" ? "opacity-50" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold tabular-nums">{avecDate ? `${dateLongue(r.date)} · ` : ""}{heure(r.heure)}</span>
              <span className="text-xs text-white/50">{r.duree_min || 45} min</span>
              <span className="badge badge-info">{labelTypeRdv(r.type)}</span>
              {r.statut === "fait" && <span className="badge badge-ok">Effectué</span>}
              {r.statut === "annule" && <span className="badge badge-neutral">Annulé</span>}
            </div>
            <div className="mt-1 text-sm">
              <Icone nom="lieu" className="opacity-60" /> <span className="font-medium">{g?.nom || r.lieu || "Lieu à préciser"}</span>
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

  return (
    <div className="space-y-4">
      <EnTete
        titre="RDV expert"
        sousTitre="Visites chez les réparateurs, contradictoires et contrôles — liés aux dossiers."
        actions={<button className="btn-primary" onClick={() => setEdition("nouveau")}><Icone nom="plus" /> Planifier un rendez-vous</button>}
      />
      {!dispo && <div className="alerte alerte-warn text-sm">Exécute <code className="font-mono">supabase/migration_v77.sql</code> dans Supabase → SQL Editor pour activer l&apos;agenda.</div>}

      <div className="glass-card flex flex-wrap items-center gap-2 p-2">
        <div className="segment">
          <button className={`segment-btn ${vue === "semaine" ? "actif" : ""}`} onClick={() => setVue("semaine")}>Semaine</button>
          <button className={`segment-btn ${vue === "tournee" ? "actif" : ""}`} onClick={() => setVue("tournee")}>Tournée par garage</button>
          <button className={`segment-btn ${vue === "liste" ? "actif" : ""}`} onClick={() => setVue("liste")}>À venir</button>
        </div>
        {vue !== "liste" && (
          <div className="ml-auto flex items-center gap-1">
            <button className="btn-ghost btn-compact" onClick={() => setLundi((l) => { const d = new Date(l); d.setDate(d.getDate() - 7); return d; })} aria-label="Semaine précédente"><Icone nom="gauche" /></button>
            <button className="btn-ghost btn-compact" onClick={() => setLundi(lundiDe(new Date()))}>Aujourd&apos;hui</button>
            <button className="btn-ghost btn-compact" onClick={() => setLundi((l) => { const d = new Date(l); d.setDate(d.getDate() + 7); return d; })} aria-label="Semaine suivante"><Icone nom="droite" /></button>
            <span className="ml-2 text-sm text-white/60">Du {lundi.toLocaleDateString("fr-FR")} au {dimanche.toLocaleDateString("fr-FR")} · {rdv.length} RDV</span>
          </div>
        )}
      </div>

      {vue === "semaine" && (
        <div className="space-y-3">
          {jours.map((j, i) => {
            const liste = rdv.filter((r) => r.date === j);
            if (!liste.length && (i >= 5)) return null;
            return (
              <Bloc key={j} titre={`${JOURS[i]} ${new Date(j + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}${j === aujourdhui ? " · aujourd'hui" : ""}`}
                actions={<button className="btn-ghost btn-compact" onClick={() => setEdition({ date: j })}><Icone nom="plus" /> RDV</button>}>
                {liste.length === 0 ? <p className="text-sm text-white/40">Aucun rendez-vous.</p> : <div className="space-y-2">{liste.map((r) => <CarteRdv key={r.id} r={r} />)}</div>}
              </Bloc>
            );
          })}
        </div>
      )}

      {vue === "tournee" && (
        parGarage.length === 0 ? <div className="glass-card p-4"><Vide titre="Aucune visite cette semaine" texte="Planifie les visites : elles se regroupent ici par réparateur pour organiser la tournée." /></div> : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {parGarage.map((g) => (
              <Bloc key={g.cle} titre={`${g.nom} · ${g.rdv.length} véhicule(s)`}>
                {g.adresse && <p className="mb-2 text-xs text-white/55"><Icone nom="lieu" /> {g.adresse}</p>}
                <div className="space-y-2">{g.rdv.map((r) => <CarteRdv key={r.id} r={r} avecDate />)}</div>
              </Bloc>
            ))}
          </div>
        )
      )}

      {vue === "liste" && (
        rdv.length === 0 ? <div className="glass-card p-4"><Vide titre="Aucun rendez-vous à venir" action={<button className="btn-primary" onClick={() => setEdition("nouveau")}><Icone nom="plus" /> Planifier</button>} /></div> : (
          <div className="space-y-2">{rdv.map((r: RdvExpert) => <CarteRdv key={r.id} r={r} avecDate />)}</div>
        )
      )}

      {edition && (
        <RdvModal initial={edition === "nouveau" ? null : edition} onClose={() => setEdition(null)} onSaved={() => { setEdition(null); recharger(); }} />
      )}
    </div>
  );
}
