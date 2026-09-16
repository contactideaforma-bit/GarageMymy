"use client";

// ESPACE CLIENTS DU COMMERCIAL (v10.2 → v12.9) — liste des garages démarchés
// + alertes de rappel (clients à recontacter, échus ou sous 7 jours)
// + pipeline du démarchage (v12.9) : à appeler → contactés → RDV → devis →
//   signés → clients, refus et leurs motifs, session d'appels.
// « + Nouveau client » : SIREN / SIRET / nom → l'annuaire officiel des
// entreprises pré-remplit l'identité ; le reste se complète sur la fiche.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import StatCard from "@/components/StatCard";
import ModalShell from "@/components/ModalShell";
import EmailPresentationModal from "@/components/EmailPresentationModal";
import { rechercherSiren, type ResultatSiren } from "@/components/RechercheSiren";
import { formatDate, messageErreur } from "@/lib/format";
import InteractionModal from "@/components/InteractionModal";
import { ETAPES_PIPELINE, EtapePipeline, MOTIFS_REFUS, ORIGINES_PROSPECT, Prospect, ProspectOrigine, ProspectStatut, RESULTATS_CONTACT, STATUTS_PROSPECT, chargerProspects, dateDansJours, enregistrerProspect, etapeDe, etatRappel, fileAppels, jamaisContacte, statsPipeline } from "@/lib/prospects";
import { ContexteCommercial, chargerContexteCommercial, nomCommercial } from "@/lib/commercialClient";

export default function ProspectsPage() {
  const router = useRouter();
  const [ctx, setCtx] = useState<ContexteCommercial | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [liste, setListe] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<"actifs" | "a_appeler" | "a_rappeler" | ProspectStatut | "tous">("actifs");
  const [contact, setContact] = useState<Prospect | null>(null); // v12.9 — noter un appel depuis la liste
  const [nouveau, setNouveau] = useState(false);
  const [presentation, setPresentation] = useState(false); // v12.8

  useEffect(() => {
    chargerContexteCommercial().then(setCtx).catch((e) => setErreur(messageErreur(e, "Espace commercial indisponible.")));
    chargerProspects().then(setListe).catch((e) => setErreur(messageErreur(e, "Lecture impossible (migration v57 ?)."))).finally(() => setLoading(false));
  }, []);

  const visibles = useMemo(() => {
    const n = q.trim().toLowerCase();
    return liste.filter((p) => {
      if (filtre === "actifs") { if (p.statut === "perdu") return false; }
      else if (filtre === "a_appeler") { if (!jamaisContacte(p)) return false; }
      else if (filtre === "a_rappeler") { if (!p.prochaine_date || p.statut === "perdu") return false; }
      else if (filtre !== "tous" && p.statut !== filtre) return false;
      if (!n) return true;
      return [p.nom, p.ville, p.contact_nom, p.gerant, p.siren, p.email, p.tel].some((v) => (v || "").toLowerCase().includes(n));
    });
  }, [liste, q, filtre]);

  const compte = (s: ProspectStatut) => liste.filter((p) => p.statut === s).length;
  const relances = liste.filter((p) => ["echu", "aujourdhui"].includes(etatRappel(p) || ""));
  const stats = useMemo(() => statsPipeline(liste), [liste]);
  const file = useMemo(() => fileAppels(liste), [liste]);
  // ALERTES : rappels échus / du jour + ceux qui tombent sous 7 jours.
  const alertes = liste
    .filter((p) => ["echu", "aujourdhui", "bientot"].includes(etatRappel(p) || ""))
    .sort((a, b) => (a.prochaine_date || "").localeCompare(b.prochaine_date || ""));
  async function rappelFait(p: Prospect) {
    const n = await enregistrerProspect({ ...p, prochaine_action: null, prochaine_date: null });
    setListe((l) => l.map((x) => (x.id === n.id ? n : x)));
  }
  async function rappelReporter(p: Prospect, jours: number) {
    const n = await enregistrerProspect({ ...p, prochaine_date: dateDansJours(jours) });
    setListe((l) => l.map((x) => (x.id === n.id ? n : x)));
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="titre-page">Mes clients</h1>
          <p className="text-sm text-white/50">
            {ctx ? (ctx.collaborateur ? `${nomCommercial(ctx.collaborateur)} · code ${ctx.collaborateur.code_apporteur || "—"}${ctx.collaborateur.zone ? ` · zone : ${ctx.collaborateur.zone}` : ""}` : "Espace éditeur — ventes directes") : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => router.push("/prospects/demarchage")} className="btn-ghost">📞 Session d&apos;appels{file.length ? ` (${file.length})` : ""}</button>
          <button onClick={() => setPresentation(true)} className="btn-ghost">✉️ Email présentation / RDV</button>
          <button onClick={() => setNouveau(true)} className="btn-primary">+ Nouveau client</button>
        </div>
      </div>
      {erreur && <p className="badge badge-danger mb-3">{erreur}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="À appeler" value={String(stats.parEtape.a_appeler)} hint="jamais contactés" accent="violet" />
        <StatCard label="À relancer" value={String(relances.length)} hint="rappel échu ou aujourd'hui" accent="pink" />
        <StatCard label="RDV pris" value={String(compte("rdv"))} hint={stats.tauxRdv != null ? `${stats.tauxRdv} % des contactés vont en RDV` : "sur les garages contactés"} accent="amber" />
        <StatCard label="Signés / clients" value={String(compte("signe") + compte("client"))} hint={stats.tauxSignature != null ? `${stats.tauxSignature} % des RDV signent` : "ventes réalisées"} accent="teal" />
      </div>

      {/* PIPELINE (v12.9) : d'un coup d'œil, où en est mon travail. */}
      {liste.length > 0 && (
        <div className="glass-card mb-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="titre-bloc">Mon pipeline</h2>
            <span className="text-xs text-white/50">{liste.length} garages · {stats.contactes} contactés</span>
          </div>
          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-white/10">
            {(Object.keys(ETAPES_PIPELINE) as EtapePipeline[]).map((e) => stats.parEtape[e] > 0 && (
              <div key={e} className={`${ETAPES_PIPELINE[e].couleur} h-full`} style={{ width: `${(stats.parEtape[e] / liste.length) * 100}%` }} title={`${ETAPES_PIPELINE[e].label} : ${stats.parEtape[e]}`} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {(Object.keys(ETAPES_PIPELINE) as EtapePipeline[]).map((e) => (
              <button key={e} className="flex items-center gap-1.5 text-white/70 hover:text-white" onClick={() => setFiltre(e === "a_appeler" ? "a_appeler" : e === "en_cours" ? "prospect" : e)}>
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${ETAPES_PIPELINE[e].couleur}`} />
                {ETAPES_PIPELINE[e].label} <b className="text-white">{stats.parEtape[e]}</b>
              </button>
            ))}
          </div>
          {stats.motifs.length > 0 && (
            <p className="mt-3 text-xs text-white/50">
              Pourquoi ils disent non : {stats.motifs.map((m) => `${MOTIFS_REFUS[m.motif]} (${m.n})`).join(" · ")}
            </p>
          )}
        </div>
      )}

      {alertes.length > 0 && (
        <div className="glass-card mb-4 border border-accent-pink/40 p-4">
          <h2 className="titre-bloc">🔔 À recontacter</h2>
          <ul className="mt-2 divide-y divide-white/10">
            {alertes.map((p) => {
              const e = etatRappel(p);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <button className="min-w-0 text-left text-sm" onClick={() => router.push(`/prospects/${p.id}`)}>
                    <span className={`badge ${e === "bientot" ? "badge-warn" : "badge-danger"} mr-2`}>
                      {e === "echu" ? `En retard · ${formatDate(p.prochaine_date!)}` : e === "aujourdhui" ? "Aujourd'hui" : formatDate(p.prochaine_date!)}
                    </span>
                    <span className="font-medium text-white">{p.nom}</span>
                    <span className="text-white/60">{p.prochaine_action ? ` — ${p.prochaine_action}` : " — à recontacter"}</span>
                    {p.tel && <span className="text-white/40"> · {p.tel}</span>}
                  </button>
                  <div className="flex gap-2 text-xs">
                    <button className="btn-ghost btn-compact" onClick={() => rappelReporter(p, 7)}>+ 1 sem</button>
                    <button className="btn-ghost btn-compact" onClick={() => rappelFait(p)}>✓ Fait</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="glass-card mb-4 flex flex-wrap items-center gap-2 p-3">
        <input className="field-input field-compact min-w-[12rem] flex-1 sm:max-w-sm" placeholder="Garage, ville, contact, SIREN…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="segment flex-wrap">
          {(["actifs", "a_appeler", "a_rappeler", "prospect", "rdv", "devis", "signe", "client", "perdu", "tous"] as const).map((f) => (
            <button key={f} className={`segment-btn ${filtre === f ? "actif" : ""}`} onClick={() => setFiltre(f)}>
              {f === "actifs" ? "En cours" : f === "a_appeler" ? "À appeler" : f === "a_rappeler" ? "À rappeler" : f === "tous" ? "Tous" : STATUTS_PROSPECT[f].label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-white/40">Chargement…</p>
      ) : visibles.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/50">
          Aucun client dans cette vue. Clique sur « + Nouveau client », saisis le SIREN ou le nom du garage : l&apos;annuaire officiel remplit l&apos;adresse, la raison sociale et le n° de TVA.
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map((p) => {
            const st = STATUTS_PROSPECT[p.statut];
            const echue = p.prochaine_date && p.prochaine_date <= new Date().toISOString().slice(0, 10);
            const et = etapeDe(p);
            return (
              <div key={p.id} className="glass-card flex w-full items-stretch gap-2 p-3 hover:brightness-110 sm:p-4">
              <button onClick={() => router.push(`/prospects/${p.id}`)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={st.badge}>{st.label}</span>
                      <span className="font-semibold text-white">{p.nom}</span>
                      <span className="text-xs text-white/40">{[p.cp, p.ville].filter(Boolean).join(" ")}</span>
                      {p.origine !== "portefeuille" && <span className="badge badge-neutral">{ORIGINES_PROSPECT[p.origine].label}</span>}
                      {et === "a_appeler" && <span className="badge badge-info">Jamais appelé</span>}
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      {[p.contact_nom || p.gerant, p.tel, p.email].filter(Boolean).join(" · ") || "Contact à compléter"}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      {p.nb_appels ? `${p.nb_appels} appel${p.nb_appels > 1 ? "s" : ""}` : ""}
                      {p.dernier_resultat ? `${p.nb_appels ? " · " : ""}dernier : ${RESULTATS_CONTACT[p.dernier_resultat].label}${p.dernier_contact ? ` le ${formatDate(p.dernier_contact)}` : ""}` : ""}
                      {p.statut === "perdu" && p.motif_refus ? ` · ✕ ${MOTIFS_REFUS[p.motif_refus]}` : ""}
                    </div>
                  </div>
                  <div className="text-right text-xs text-white/50">
                    {p.prochaine_action && <div className={echue ? "text-rose-300" : ""}>➜ {p.prochaine_action}{p.prochaine_date ? ` · ${formatDate(p.prochaine_date)}` : ""}</div>}
                    <div>maj {formatDate(p.maj_le)}</div>
                  </div>
                </div>
              </button>
              {p.statut !== "client" && p.statut !== "signe" && (
                <button className="btn-ghost btn-compact shrink-0 self-center" title="Noter un appel" onClick={() => setContact(p)}>📞</button>
              )}
              </div>
            );
          })}
        </div>
      )}

      {presentation && ctx && (
        <EmailPresentationModal
          parametres={ctx.parametres}
          commercialNom={nomCommercial(ctx.collaborateur)}
          codeApporteur={ctx.collaborateur?.code_apporteur || null}
          onClose={() => setPresentation(false)}
        />
      )}
      {contact && (
        <InteractionModal prospect={contact} onClose={() => setContact(null)} onSaved={(n) => { setContact(null); setListe((l) => l.map((x) => (x.id === n.id ? n : x))); }} />
      )}
      {nouveau && (
        <NouveauClientModal
          onClose={() => setNouveau(false)}
          onCree={(p) => { setNouveau(false); router.push(`/prospects/${p.id}`); }}
          zone={ctx?.collaborateur?.zone || null}
          estAdmin={Boolean(ctx?.estAdmin)}
        />
      )}
    </div>
  );
}

function NouveauClientModal({ onClose, onCree, zone, estAdmin }: { onClose: () => void; onCree: (p: Prospect) => void; zone: string | null; estAdmin: boolean }) {
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<ResultatSiren[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<Partial<Prospect> & { nom: string }>({ nom: "", origine: estAdmin ? "editeur" : "portefeuille", statut: "prospect" });
  const set = <K extends keyof Prospect>(k: K, v: Prospect[K]) => setF((x) => ({ ...x, [k]: v }));

  async function chercher() {
    const t = recherche.trim();
    if (!t) return;
    setBusy(true); setErr(null);
    const r = await rechercherSiren(t.replace(/\s/g, "").match(/^\d{9,14}$/) ? t.replace(/\s/g, "").slice(0, 9) : t);
    setBusy(false);
    if (r.error) setErr(r.error);
    setResultats(r.resultats);
    if (r.resultats.length === 1) appliquer(r.resultats[0]);
  }
  function appliquer(r: ResultatSiren) {
    setF((x) => ({ ...x, nom: r.nom || x.nom, siren: r.siren, siret: recherche.replace(/\s/g, "").match(/^\d{14}$/) ? recherche.replace(/\s/g, "") : x.siret || null, adresse: r.adresse, cp: r.codePostal, ville: r.ville, tva_intra: r.tva || null, activite: r.activite || null }));
    setResultats([]);
  }
  async function creer() {
    if (!f.nom.trim()) return setErr("Le nom du garage est obligatoire.");
    setBusy(true); setErr(null);
    try {
      const p = await enregistrerProspect(f);
      onCree(p);
    } catch (e) { setErr(messageErreur(e, "Création impossible (migration v57 ?).")); } finally { setBusy(false); }
  }

  return (
    <ModalShell title="Nouveau client" onClose={onClose} maxWidth="max-w-2xl">
      <div>
        <label className="field-label">SIREN, SIRET ou nom du garage</label>
        <div className="flex gap-2">
          <input className="field-input" value={recherche} onChange={(e) => setRecherche(e.target.value)} onKeyDown={(e) => e.key === "Enter" && chercher()} placeholder="ex. 123 456 789 ou Carrosserie Martin Lyon" />
          <button className="btn-ghost shrink-0" onClick={chercher} disabled={busy}>{busy ? "…" : "🔍 Pré-remplir"}</button>
        </div>
        <p className="mt-1 text-xs text-white/40">L&apos;annuaire officiel des entreprises remplit raison sociale, adresse, TVA et activité. Tu complètes le reste sur la fiche.</p>
        {resultats.length > 1 && (
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {resultats.map((r) => (
              <li key={r.siren}>
                <button className="glass-soft w-full px-3 py-2 text-left text-sm hover:brightness-110" onClick={() => appliquer(r)}>
                  <span className="font-medium text-white">{r.nom}</span> <span className="text-white/50">— {r.codePostal} {r.ville} · SIREN {r.siren}{r.actif ? "" : " · fermée"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="field-label">Nom du garage *</label><input className="field-input" value={f.nom} onChange={(e) => set("nom", e.target.value)} /></div>
        <div><label className="field-label">SIREN</label><input className="field-input" value={f.siren || ""} onChange={(e) => set("siren", e.target.value)} /></div>
        <div><label className="field-label">N° TVA</label><input className="field-input" value={f.tva_intra || ""} onChange={(e) => set("tva_intra", e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="field-label">Adresse</label><input className="field-input" value={f.adresse || ""} onChange={(e) => set("adresse", e.target.value)} /></div>
        <div><label className="field-label">Code postal</label><input className="field-input" value={f.cp || ""} onChange={(e) => set("cp", e.target.value)} /></div>
        <div><label className="field-label">Ville</label><input className="field-input" value={f.ville || ""} onChange={(e) => set("ville", e.target.value)} /></div>
        <div><label className="field-label">Nom du gérant</label><input className="field-input" value={f.gerant || ""} onChange={(e) => set("gerant", e.target.value)} /></div>
        <div><label className="field-label">Téléphone</label><input className="field-input" value={f.tel || ""} onChange={(e) => set("tel", e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="field-label">Email (futur identifiant du compte)</label><input className="field-input" type="email" value={f.email || ""} onChange={(e) => set("email", e.target.value)} /></div>
        <div className="sm:col-span-2">
          <label className="field-label">Origine du contact {zone ? `(votre zone : ${zone})` : ""}</label>
          <select className="field-input" value={f.origine} onChange={(e) => set("origine", e.target.value as ProspectOrigine)}>
            {(Object.keys(ORIGINES_PROSPECT) as ProspectOrigine[]).filter((o) => estAdmin || o !== "editeur").map((o) => <option key={o} value={o}>{ORIGINES_PROSPECT[o].label}</option>)}
          </select>
          <p className="mt-1 text-xs text-white/45">{ORIGINES_PROSPECT[(f.origine || "portefeuille") as ProspectOrigine].aide}</p>
          {(f.origine === "connaissance" || f.origine === "recommandation" || f.origine === "hors_zone") && (
            <input className="field-input mt-2" placeholder={f.origine === "recommandation" ? "Recommandé par (nom du client, date)" : f.origine === "connaissance" ? "Lien avec ce garage (ami, ancien collègue…)" : "Référence de l'accord IDEAFORMA"} value={f.origine_detail || ""} onChange={(e) => set("origine_detail", e.target.value)} />
          )}
        </div>
      </div>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={creer} disabled={busy}>Créer la fiche</button>
      </div>
    </ModalShell>
  );
}
