"use client";

// PORTEFEUILLES (v10.2) — ce que font les commerciaux : leurs clients, par
// statut, avec zone attribuée et origine des contacts (contrôle des
// exceptions au portefeuille), documents générés, ventes.

import { useEffect, useMemo, useState } from "react";
import AdminShell, { dateFr } from "@/components/admin/AdminShell";
import { Collaborateur, CompteAuth, Vente, lireComptes, lireTable, nomCollab } from "@/lib/admin/client";
import { ORIGINES_PROSPECT, Prospect, ProspectDocument, STATUTS_PROSPECT, TYPES_DOCUMENT } from "@/lib/prospects";

export default function PortefeuillesPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [docs, setDocs] = useState<ProspectDocument[]>([]);
  const [collabs, setCollabs] = useState<Collaborateur[]>([]);
  const [comptes, setComptes] = useState<CompteAuth[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [filtre, setFiltre] = useState<string>("tous");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([lireTable<Prospect>("prospects"), lireTable<ProspectDocument>("prospect_documents"), lireTable<Collaborateur>("collaborateurs"), lireComptes(), lireTable<Vente>("ventes")])
      .then(([p, d, c, cp, v]) => { setProspects(p); setDocs(d); setCollabs(c); setComptes(cp); setVentes(v); })
      .catch((e) => setMsg(e instanceof Error ? e.message : "Lecture impossible (migration v57 ?)."));
  }, []);

  // owner_id → commercial (ou « éditeur »)
  const proprietaire = (owner: string) => {
    const c = collabs.find((x) => x.owner_id === owner);
    if (c) return { cle: c.id, nom: nomCollab(c), zone: c.zone, commercial: c };
    const cp = comptes.find((x) => x.id === owner);
    return { cle: `compte:${owner}`, nom: cp ? `${cp.email} (éditeur / autre)` : "Compte inconnu", zone: null, commercial: null };
  };
  const groupes = useMemo(() => {
    const m = new Map<string, { nom: string; zone: string | null; liste: Prospect[] }>();
    for (const p of prospects) {
      const o = proprietaire(p.owner_id);
      const g = m.get(o.cle) || { nom: o.nom, zone: o.zone ?? null, liste: [] as Prospect[] };
      g.liste.push(p);
      m.set(o.cle, g);
    }
    return Array.from(m.entries());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospects, collabs, comptes]);

  const exceptions = prospects.filter((p) => p.origine === "connaissance" || p.origine === "recommandation" || p.origine === "hors_zone");

  return (
    <AdminShell titre="Portefeuilles des commerciaux">
      {msg && <p className="badge badge-danger">{msg}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titre="Fiches clients" valeur={String(prospects.length)} />
        <Kpi titre="Devis / contrats en cours" valeur={String(prospects.filter((p) => p.statut === "devis" || p.statut === "rdv").length)} />
        <Kpi titre="Signés / clients" valeur={String(prospects.filter((p) => p.statut === "signe" || p.statut === "client").length)} />
        <Kpi titre="Exceptions au portefeuille" valeur={String(exceptions.length)} sous="connaissance / recommandation / hors zone" />
      </div>
      <div className="segment flex-wrap">
        <button className={`segment-btn ${filtre === "tous" ? "actif" : ""}`} onClick={() => setFiltre("tous")}>Tous</button>
        {groupes.map(([cle, g]) => <button key={cle} className={`segment-btn ${filtre === cle ? "actif" : ""}`} onClick={() => setFiltre(cle)}>{g.nom} ({g.liste.length})</button>)}
      </div>
      {groupes.filter(([cle]) => filtre === "tous" || cle === filtre).map(([cle, g]) => (
        <section key={cle} className="glass-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="titre-bloc">{g.nom}</h2>
            <span className="text-xs text-white/50">{g.zone ? `Zone : ${g.zone}` : "Zone non définie"} · {g.liste.length} fiche(s)</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {(Object.keys(STATUTS_PROSPECT) as (keyof typeof STATUTS_PROSPECT)[]).map((s) => {
              const n = g.liste.filter((p) => p.statut === s).length;
              return n ? <span key={s} className={STATUTS_PROSPECT[s].badge}>{STATUTS_PROSPECT[s].label} : {n}</span> : null;
            })}
          </div>
          <ul className="mt-3 divide-y divide-white/10">
            {g.liste.map((p) => {
              const st = STATUTS_PROSPECT[p.statut];
              const d = docs.filter((x) => x.prospect_id === p.id);
              const v = ventes.find((x) => x.prospect_id === p.id);
              const exception = p.origine !== "portefeuille" && p.origine !== "editeur";
              return (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <span className={st.badge}>{st.label}</span> <span className="font-medium text-white">{p.nom}</span>
                    <span className="text-white/50"> · {[p.cp, p.ville].filter(Boolean).join(" ")} · {p.contact_nom || p.gerant || "—"} · {p.email || "—"}</span>
                    {exception && <div className={`text-xs ${p.origine_detail ? "text-amber-200" : "text-rose-300"}`}>⚠ {ORIGINES_PROSPECT[p.origine].label}{p.origine_detail ? ` — ${p.origine_detail}` : " — SANS justification"}</div>}
                    {d.length > 0 && <div className="text-xs text-white/45">{d.map((x) => `${TYPES_DOCUMENT[x.type]}${x.signe_le ? " ✓" : ""}`).join(" · ")}</div>}
                    {v && <div className="text-xs text-white/55">Vente {v.numero} — {v.statut}{v.paiement_confirme_le ? " · paiement confirmé par le commercial" : v.paiement_demande ? ` · ${v.paiement_demande} demandé` : ""}</div>}
                  </div>
                  <div className="text-right text-xs text-white/45">
                    {p.prochaine_action && <div>➜ {p.prochaine_action} {p.prochaine_date ? dateFr(p.prochaine_date) : ""}</div>}
                    <div>maj {dateFr(p.maj_le)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {groupes.length === 0 && !msg && <p className="text-sm text-white/45">Aucune fiche client pour l&apos;instant. Les commerciaux (comptes metier = commercial rattachés à leur fiche) et vous-même créez des fiches dans « Mes clients ».</p>}
    </AdminShell>
  );
}

function Kpi({ titre, valeur, sous }: { titre: string; valeur: string; sous?: string }) {
  return (
    <div className="glass-card p-3 sm:p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{titre}</div>
      <div className="valeur-hud mt-1 font-bold text-white">{valeur}</div>
      {sous && <div className="mt-1 text-[11px] text-white/45">{sous}</div>}
    </div>
  );
}
