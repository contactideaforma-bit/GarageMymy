"use client";

/* ====================================================================
 *  PROSPECTION — ESPACE ÉDITEUR (v13.1)
 *
 *  1. « Rechercher & attribuer » : moteur de recherche dans l'annuaire des
 *     entreprises (zone géographique, SIRET, nom du garage). On coche des
 *     garages et on les ATTRIBUE à un commercial : 20 garages du 13014 pour
 *     X, puis 10 autres pour Y. Un garage déjà donné n'est plus cochable.
 *  2. « Suivi » : TOUTES les fiches de TOUS les commerciaux — où en est
 *     chacune (pipeline), ce qui a été fait (journal des contacts), ce qui
 *     est en retard ; filtres, réattribution, retrait des fiches non
 *     travaillées.
 *
 *  Une fiche attribuée appartient au commercial (owner_id) : elle apparaît
 *  directement dans « Mes clients » et dans sa session d'appels.
 * ==================================================================== */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import AdminShell, { dateFr } from "@/components/admin/AdminShell";
import { Collaborateur, lireTable, nomCollab } from "@/lib/admin/client";
import {
  CriteresRecherche,
  GarageTrouve,
  JournalFiche,
  attribuerGarages,
  lireJournal,
  lireSuivi,
  reattribuerProspects,
  rechercherGarages,
  retirerProspects,
} from "@/lib/admin/prospection";
import { ACTIVITES_RECHERCHE, LIBELLES_NAF } from "@/lib/admin/zones";
import {
  CANAUX_CONTACT,
  ETAPES_PIPELINE,
  EtapePipeline,
  MOTIFS_REFUS,
  Prospect,
  RESULTATS_CONTACT,
  STATUTS_PROSPECT,
  TYPES_DOCUMENT,
  etapeDe,
  etatRappel,
  statsPipeline,
} from "@/lib/prospects";

type Cible = { owner_id: string; nom: string; zone: string | null };

const message = (e: unknown, repli: string) => (e instanceof Error ? e.message : repli);
const joursDepuis = (iso: string | null | undefined) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

export default function ProspectionPage() {
  const [onglet, setOnglet] = useState<"recherche" | "suivi">("recherche");
  const [collabs, setCollabs] = useState<Collaborateur[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [moi, setMoi] = useState<string>("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([lireTable<Collaborateur>("collaborateurs"), lireSuivi()]);
      setCollabs(c);
      setProspects(s.prospects);
      setMoi(s.moi);
      setErreur(null);
    } catch (e) {
      setErreur(message(e, "Lecture impossible."));
    } finally {
      setChargement(false);
    }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const commerciaux = useMemo(() => collabs.filter((c) => c.type === "commercial" && c.statut !== "termine"), [collabs]);
  /** Comptes à qui on peut attribuer : commerciaux AVEC un compte, puis l'éditeur. */
  const cibles: Cible[] = useMemo(
    () => [
      ...commerciaux.filter((c) => c.owner_id).map((c) => ({ owner_id: c.owner_id as string, nom: nomCollab(c), zone: c.zone ?? null })),
      ...(moi ? [{ owner_id: moi, nom: "Moi (éditeur)", zone: null }] : []),
    ],
    [commerciaux, moi]
  );
  const sansCompte = commerciaux.filter((c) => !c.owner_id);
  const nomDe = useCallback(
    (owner: string) => cibles.find((c) => c.owner_id === owner)?.nom || collabs.find((c) => c.owner_id === owner)?.nom || "Autre compte",
    [cibles, collabs]
  );

  return (
    <AdminShell titre="Prospection">
      {erreur && <p className="badge badge-danger">{erreur}</p>}
      <div className="segment">
        <button className={`segment-btn ${onglet === "recherche" ? "actif" : ""}`} onClick={() => setOnglet("recherche")}>🔎 Rechercher & attribuer</button>
        <button className={`segment-btn ${onglet === "suivi" ? "actif" : ""}`} onClick={() => setOnglet("suivi")}>📊 Suivi des prospects ({prospects.length})</button>
      </div>
      {sansCompte.length > 0 && (
        <p className="text-xs text-amber-200">
          ⚠ Sans compte My Easy Auto, impossible de leur attribuer des garages : {sansCompte.map(nomCollab).join(", ")} — « Créer le compte » depuis leur fiche (Collaborateurs).
        </p>
      )}
      {onglet === "recherche" ? (
        <Recherche cibles={cibles} prospects={prospects} onAttribue={charger} />
      ) : (
        <Suivi prospects={prospects} cibles={cibles} nomDe={nomDe} chargement={chargement} onChange={charger} />
      )}
    </AdminShell>
  );
}

/* =====================================================================
 *  ONGLET 1 — RECHERCHER & ATTRIBUER
 * =================================================================== */

function Recherche({ cibles, prospects, onAttribue }: { cibles: Cible[]; prospects: Prospect[]; onAttribue: () => Promise<void> }) {
  const [criteres, setCriteres] = useState<CriteresRecherche>({ zone: "", nom: "", siret: "", activite: "garages" });
  const [lances, setLances] = useState<CriteresRecherche | null>(null); // critères de la recherche affichée
  const [garages, setGarages] = useState<GarageTrouve[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [zone, setZone] = useState("");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [cible, setCible] = useState("");
  const [combien, setCombien] = useState("20");
  const [occupe, setOccupe] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);

  const set = (k: keyof CriteresRecherche, v: string) => setCriteres((c) => ({ ...c, [k]: v }));
  const libres = garages.filter((g) => !g.deja);

  async function chercher(suite = false) {
    const c = suite && lances ? lances : criteres;
    if (!c.zone.trim() && !c.nom.trim() && !c.siret.trim()) {
      setMsg({ ok: false, texte: "Indique une zone (13014, Marseille 14e, Aubagne, 13…), un nom de garage ou un SIRET." });
      return;
    }
    setOccupe(true);
    setMsg(null);
    try {
      const r = await rechercherGarages(c, suite ? page + 1 : 1);
      setGarages((avant) => {
        if (!suite) return r.garages;
        const vus = new Set(avant.map((g) => g.siret));
        return [...avant, ...r.garages.filter((g) => !vus.has(g.siret))];
      });
      if (!suite) setSelection(new Set());
      setLances(c);
      setPage(r.page);
      setTotalPages(r.totalPages);
      setTotal(r.totalEntreprises);
      setZone(r.zone);
      if (!suite && r.garages.length === 0) setMsg({ ok: false, texte: "Aucun établissement ouvert ne correspond. Élargis la zone ou passe l'activité sur « Toutes »." });
    } catch (e) {
      setMsg({ ok: false, texte: message(e, "Recherche impossible.") });
    } finally {
      setOccupe(false);
    }
  }

  function basculer(siret: string) {
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(siret)) n.delete(siret); else n.add(siret);
      return n;
    });
  }
  /** Coche les N premiers garages LIBRES pas encore cochés (« donne-m'en 20 »). */
  function cocherLesPremiers() {
    const n = Math.max(1, Math.min(200, Number(combien) || 0));
    setSelection((s) => {
      const suivant = new Set(s);
      let ajoutes = 0;
      for (const g of libres) {
        if (ajoutes >= n) break;
        if (!suivant.has(g.siret)) { suivant.add(g.siret); ajoutes++; }
      }
      return suivant;
    });
  }

  async function attribuer() {
    const c = cibles.find((x) => x.owner_id === cible);
    const lot = garages.filter((g) => selection.has(g.siret) && !g.deja);
    if (!c || !lot.length) return;
    setOccupe(true);
    setMsg(null);
    try {
      const r = await attribuerGarages(c.owner_id, lot);
      const donnes = new Set(lot.map((g) => g.siret));
      // Les garages donnés deviennent « déjà attribués » : on enchaîne avec le lot suivant.
      setGarages((avant) => avant.map((g) => (donnes.has(g.siret) ? { ...g, deja: { prospect_id: "", owner_id: c.owner_id, proprietaire: c.nom, statut: "prospect" } } : g)));
      setSelection(new Set());
      setMsg({
        ok: true,
        texte: `${r.crees} garage(s) attribué(s) à ${c.nom}.${r.ignores.length ? ` ${r.ignores.length} ignoré(s) car déjà attribué(s) entre-temps : ${r.ignores.slice(0, 5).join(", ")}.` : ""} Sélectionne le lot suivant.`,
      });
      await onAttribue();
    } catch (e) {
      setMsg({ ok: false, texte: message(e, "Attribution impossible.") });
    } finally {
      setOccupe(false);
    }
  }

  const charge = (owner: string) => prospects.filter((p) => p.owner_id === owner && etapeDe(p) === "a_appeler").length;

  return (
    <>
      <form
        className="glass-card p-4"
        onSubmit={(e) => { e.preventDefault(); chercher(false); }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="field-label">Zone géographique</label>
            <input className="field-input" value={criteres.zone} onChange={(e) => set("zone", e.target.value)} placeholder="13014 · Marseille 14e · Aubagne · 13" />
          </div>
          <div>
            <label className="field-label">Nom du garage</label>
            <input className="field-input" value={criteres.nom} onChange={(e) => set("nom", e.target.value)} placeholder="ex. Carrosserie du Merlan" />
          </div>
          <div>
            <label className="field-label">SIRET ou SIREN</label>
            <input className="field-input" inputMode="numeric" value={criteres.siret} onChange={(e) => set("siret", e.target.value)} placeholder="14 ou 9 chiffres" />
          </div>
          <div>
            <label className="field-label">Activité</label>
            <select className="field-input" value={criteres.activite} onChange={(e) => set("activite", e.target.value)} disabled={Boolean(criteres.siret.trim())}>
              {Object.entries(ACTIVITES_RECHERCHE).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" disabled={occupe}>{occupe ? "Recherche…" : "Rechercher"}</button>
          <span className="text-xs text-white/45">
            Source : annuaire des entreprises (INSEE / État). Établissements ouverts uniquement. Un SIRET prime sur les autres critères. Le téléphone n&apos;y figure pas : le commercial le complète sur la fiche.
          </span>
        </div>
      </form>

      {msg && <p className={`badge ${msg.ok ? "badge-ok" : "badge-danger"} whitespace-normal`}>{msg.texte}</p>}

      {garages.length > 0 && (
        <section className="glass-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="titre-bloc">
              {garages.length} établissement(s){zone ? ` — ${zone}` : ""}
            </h2>
            <span className="text-xs text-white/50">
              {libres.length} libre(s) · {garages.length - libres.length} déjà attribué(s) · {total} entreprise(s) dans l&apos;annuaire, page {page}/{totalPages}
            </span>
          </div>

          {/* BARRE D'ATTRIBUTION */}
          <div className="glass-soft mt-3 flex flex-wrap items-end gap-3 rounded-xl p-3">
            <div className="flex items-end gap-2">
              <div>
                <label className="field-label">Cocher les</label>
                <input className="field-input w-20 text-right tabular-nums" inputMode="numeric" value={combien} onChange={(e) => setCombien(e.target.value)} />
              </div>
              <button type="button" className="btn-ghost btn-compact" onClick={cocherLesPremiers} disabled={!libres.length}>premiers libres</button>
              <button type="button" className="btn-ghost btn-compact" onClick={() => setSelection(new Set(libres.map((g) => g.siret)))} disabled={!libres.length}>Tout</button>
              <button type="button" className="btn-ghost btn-compact" onClick={() => setSelection(new Set())} disabled={!selection.size}>Rien</button>
            </div>
            <div className="min-w-[14rem] flex-1">
              <label className="field-label">Attribuer à</label>
              <select className="field-input" value={cible} onChange={(e) => setCible(e.target.value)}>
                <option value="">— choisir un commercial —</option>
                {cibles.map((c) => (
                  <option key={c.owner_id} value={c.owner_id}>
                    {c.nom}{c.zone ? ` · zone ${c.zone}` : ""} · {charge(c.owner_id)} à appeler
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn-primary" onClick={attribuer} disabled={occupe || !cible || !selection.size}>
              Attribuer {selection.size || ""} garage{selection.size > 1 ? "s" : ""}
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-white/50">
                <tr>
                  <th className="px-2 py-2"> </th>
                  <th className="px-2 py-2 font-medium">Garage</th>
                  <th className="px-2 py-2 font-medium">Adresse</th>
                  <th className="px-2 py-2 font-medium">Dirigeant</th>
                  <th className="px-2 py-2 font-medium">SIRET</th>
                  <th className="px-2 py-2 font-medium">Situation</th>
                </tr>
              </thead>
              <tbody>
                {garages.map((g) => {
                  const coche = selection.has(g.siret);
                  return (
                    <tr
                      key={g.siret}
                      className={`border-t border-white/5 ${g.deja ? "opacity-55" : "cursor-pointer hover:bg-white/5"} ${coche ? "bg-white/10" : ""}`}
                      onClick={() => !g.deja && basculer(g.siret)}
                    >
                      <td className="px-2 py-2">
                        <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={coche} disabled={Boolean(g.deja)} onChange={() => basculer(g.siret)} onClick={(e) => e.stopPropagation()} aria-label={`Sélectionner ${g.nom}`} />
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-white">{g.nom}</div>
                        <div className="text-xs text-white/45">
                          {g.raison_sociale !== g.nom ? `${g.raison_sociale} · ` : ""}{LIBELLES_NAF[g.activite] || g.activite}{g.est_siege ? "" : " · établissement secondaire"}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-white/80">{g.adresse}<div className="text-xs text-white/50">{g.cp} {g.ville}</div></td>
                      <td className="px-2 py-2 text-white/80">{g.dirigeant || "—"}</td>
                      <td className="px-2 py-2 tabular-nums text-white/60">{g.siret}</td>
                      <td className="px-2 py-2">
                        {g.deja
                          ? <span className="badge badge-warn">Déjà attribué · {g.deja.proprietaire}{g.deja.statut !== "prospect" ? ` · ${STATUTS_PROSPECT[g.deja.statut as keyof typeof STATUTS_PROSPECT]?.label || g.deja.statut}` : ""}</span>
                          : <span className="badge badge-ok">Libre</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {page < totalPages && (
            <div className="mt-3 text-center">
              <button type="button" className="btn-ghost" onClick={() => chercher(true)} disabled={occupe}>
                {occupe ? "Chargement…" : `Charger la suite (page ${page + 1}/${totalPages})`}
              </button>
              <p className="mt-1 text-[11px] text-white/40">La sélection est conservée quand tu charges la suite.</p>
            </div>
          )}
        </section>
      )}
    </>
  );
}

/* =====================================================================
 *  ONGLET 2 — SUIVI DE TOUS LES PROSPECTS
 * =================================================================== */

function Suivi({ prospects, cibles, nomDe, chargement, onChange }: {
  prospects: Prospect[]; cibles: Cible[]; nomDe: (owner: string) => string; chargement: boolean; onChange: () => Promise<void>;
}) {
  const [fCommercial, setFCommercial] = useState("tous");
  const [fEtape, setFEtape] = useState<"toutes" | EtapePipeline | "retard">("toutes");
  const [fOrigine, setFOrigine] = useState<"toutes" | "attribues" | "perso">("toutes");
  const [fZone, setFZone] = useState("");
  const [fTexte, setFTexte] = useState("");
  const [fInactif, setFInactif] = useState("0");
  const [limite, setLimite] = useState(100);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [cible, setCible] = useState("");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [journal, setJournal] = useState<JournalFiche | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);

  // Synthèse par commercial
  const parCommercial = useMemo(() => {
    const m = new Map<string, Prospect[]>();
    for (const p of prospects) m.set(p.owner_id, [...(m.get(p.owner_id) || []), p]);
    return Array.from(m.entries())
      .map(([owner, liste]) => {
        const s = statsPipeline(liste);
        const dernier = liste.reduce<string | null>((d, p) => (p.dernier_contact && (!d || p.dernier_contact > d) ? p.dernier_contact : d), null);
        return { owner, nom: nomDe(owner), liste, s, dernier, retards: liste.filter((p) => etatRappel(p) === "echu").length };
      })
      .sort((a, b) => b.liste.length - a.liste.length);
  }, [prospects, nomDe]);

  const filtres = useMemo(() => {
    const z = fZone.trim().toLowerCase();
    const t = fTexte.trim().toLowerCase();
    const inactif = Number(fInactif) || 0;
    return prospects.filter((p) => {
      if (fCommercial !== "tous" && p.owner_id !== fCommercial) return false;
      if (fEtape === "retard") { if (etatRappel(p) !== "echu") return false; }
      else if (fEtape !== "toutes" && etapeDe(p) !== fEtape) return false;
      if (fOrigine === "attribues" && !p.attribue_le) return false;
      if (fOrigine === "perso" && p.attribue_le) return false;
      if (z && !((p.cp || "").startsWith(z) || (p.ville || "").toLowerCase().includes(z))) return false;
      if (t && ![p.nom, p.siret, p.siren, p.gerant, p.contact_nom, p.tel, p.email].some((v) => (v || "").toLowerCase().includes(t))) return false;
      if (inactif) {
        if (p.statut === "perdu" || p.statut === "client") return false;
        const j = joursDepuis(p.dernier_contact || p.attribue_le || p.created_at);
        if (j === null || j < inactif) return false;
      }
      return true;
    });
  }, [prospects, fCommercial, fEtape, fOrigine, fZone, fTexte, fInactif]);

  const global = useMemo(() => statsPipeline(filtres), [filtres]);

  async function ouvrir(id: string) {
    if (ouvert === id) { setOuvert(null); return; }
    setOuvert(id);
    setJournal(null);
    try {
      setJournal(await lireJournal(id));
    } catch (e) {
      setMsg({ ok: false, texte: message(e, "Journal illisible.") });
    }
  }

  async function reattribuer() {
    const c = cibles.find((x) => x.owner_id === cible);
    if (!c || !selection.size) return;
    if (!confirm(`Donner ${selection.size} fiche(s) à ${c.nom} ? Le journal des contacts et les documents suivent la fiche.`)) return;
    setOccupe(true);
    try {
      const r = await reattribuerProspects(c.owner_id, Array.from(selection));
      setMsg({ ok: true, texte: `${r.deplaces} fiche(s) données à ${c.nom}.${r.bloquees ? ` ${r.bloquees} non déplacée(s) : contrat signé ou client actif (vente et primes rattachées).` : ""}` });
      setSelection(new Set());
      await onChange();
    } catch (e) {
      setMsg({ ok: false, texte: message(e, "Réattribution impossible.") });
    } finally {
      setOccupe(false);
    }
  }

  async function retirer() {
    if (!selection.size) return;
    if (!confirm(`Retirer ${selection.size} fiche(s) ? Seules les fiches JAMAIS travaillées (aucun contact, aucun document) seront supprimées ; les garages redeviendront libres dans la recherche.`)) return;
    setOccupe(true);
    try {
      const r = await retirerProspects(Array.from(selection));
      setMsg({ ok: true, texte: `${r.retires} fiche(s) retirée(s).${r.conserves ? ` ${r.conserves} conservée(s) car déjà travaillée(s).` : ""}` });
      setSelection(new Set());
      await onChange();
    } catch (e) {
      setMsg({ ok: false, texte: message(e, "Retrait impossible.") });
    } finally {
      setOccupe(false);
    }
  }

  const visibles = filtres.slice(0, limite);
  const tousCoches = visibles.length > 0 && visibles.every((p) => selection.has(p.id));

  if (chargement) return <p className="text-sm text-white/50">Chargement…</p>;
  if (!prospects.length) {
    return <p className="text-sm text-white/45">Aucune fiche pour l&apos;instant. Attribue des garages depuis « Rechercher & attribuer ».</p>;
  }

  return (
    <>
      {/* SYNTHÈSE PAR COMMERCIAL — un clic filtre la liste */}
      <section className="glass-card p-4">
        <h2 className="titre-bloc">Par commercial</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-white/50">
              <tr>
                <th className="px-2 py-2 font-medium">Commercial</th>
                <th className="px-2 py-2 text-right font-medium">Fiches</th>
                <th className="px-2 py-2 text-right font-medium">À appeler</th>
                <th className="px-2 py-2 text-right font-medium">Contactés</th>
                <th className="px-2 py-2 text-right font-medium">RDV</th>
                <th className="px-2 py-2 text-right font-medium">Devis</th>
                <th className="px-2 py-2 text-right font-medium">Signés</th>
                <th className="px-2 py-2 text-right font-medium">Perdus</th>
                <th className="px-2 py-2 text-right font-medium">Taux RDV</th>
                <th className="px-2 py-2 text-right font-medium">Rappels en retard</th>
                <th className="px-2 py-2 font-medium">Dernier contact</th>
              </tr>
            </thead>
            <tbody>
              {parCommercial.map((c) => (
                <tr key={c.owner} className={`cursor-pointer border-t border-white/5 hover:bg-white/5 ${fCommercial === c.owner ? "bg-white/10" : ""}`} onClick={() => setFCommercial(fCommercial === c.owner ? "tous" : c.owner)}>
                  <td className="px-2 py-2 font-medium text-white">{c.nom}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.liste.length}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.s.parEtape.a_appeler}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.s.parEtape.en_cours}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.s.parEtape.rdv}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.s.parEtape.devis}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.s.parEtape.signe + c.s.parEtape.client}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.s.parEtape.perdu}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.s.tauxRdv === null ? "—" : `${c.s.tauxRdv} %`}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${c.retards ? "text-rose-300" : ""}`}>{c.retards}</td>
                  <td className="px-2 py-2 text-white/70">{c.dernier ? `${dateFr(c.dernier)} (${joursDepuis(c.dernier)} j)` : "jamais"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FILTRES */}
      <section className="glass-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label className="field-label">Commercial</label>
            <select className="field-input" value={fCommercial} onChange={(e) => setFCommercial(e.target.value)}>
              <option value="tous">Tous</option>
              {parCommercial.map((c) => <option key={c.owner} value={c.owner}>{c.nom} ({c.liste.length})</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Où ça en est</label>
            <select className="field-input" value={fEtape} onChange={(e) => setFEtape(e.target.value as typeof fEtape)}>
              <option value="toutes">Toutes les étapes</option>
              {(Object.keys(ETAPES_PIPELINE) as EtapePipeline[]).map((k) => <option key={k} value={k}>{ETAPES_PIPELINE[k].label}</option>)}
              <option value="retard">⚠ Rappel en retard</option>
            </select>
          </div>
          <div>
            <label className="field-label">Zone</label>
            <input className="field-input" value={fZone} onChange={(e) => setFZone(e.target.value)} placeholder="13014, 13, Aubagne…" />
          </div>
          <div>
            <label className="field-label">Recherche</label>
            <input className="field-input" value={fTexte} onChange={(e) => setFTexte(e.target.value)} placeholder="nom, SIRET, gérant, tél…" />
          </div>
          <div>
            <label className="field-label">Origine</label>
            <select className="field-input" value={fOrigine} onChange={(e) => setFOrigine(e.target.value as typeof fOrigine)}>
              <option value="toutes">Toutes</option>
              <option value="attribues">Attribués par moi</option>
              <option value="perso">Créés par le commercial</option>
            </select>
          </div>
          <div>
            <label className="field-label">Sans activité depuis</label>
            <select className="field-input" value={fInactif} onChange={(e) => setFInactif(e.target.value)}>
              <option value="0">—</option>
              <option value="7">7 jours</option>
              <option value="14">14 jours</option>
              <option value="30">30 jours</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <span className="badge badge-neutral">{filtres.length} fiche(s)</span>
          {(Object.keys(ETAPES_PIPELINE) as EtapePipeline[]).map((k) =>
            global.parEtape[k] ? (
              <button key={k} type="button" className={`badge ${fEtape === k ? "badge-info" : "badge-neutral"}`} onClick={() => setFEtape(fEtape === k ? "toutes" : k)}>
                {ETAPES_PIPELINE[k].label} : {global.parEtape[k]}
              </button>
            ) : null
          )}
          {global.motifs.length > 0 && (
            <span className="text-white/45">Refus : {global.motifs.slice(0, 3).map((m) => `${MOTIFS_REFUS[m.motif]} (${m.n})`).join(" · ")}</span>
          )}
        </div>
      </section>

      {msg && <p className={`badge ${msg.ok ? "badge-ok" : "badge-danger"} whitespace-normal`}>{msg.texte}</p>}

      {/* ACTIONS EN LOT */}
      {selection.size > 0 && (
        <div className="glass-soft flex flex-wrap items-end gap-3 rounded-xl p-3">
          <span className="text-sm text-white">{selection.size} fiche(s) cochée(s)</span>
          <div className="min-w-[12rem] flex-1">
            <label className="field-label">Donner à</label>
            <select className="field-input" value={cible} onChange={(e) => setCible(e.target.value)}>
              <option value="">— choisir —</option>
              {cibles.map((c) => <option key={c.owner_id} value={c.owner_id}>{c.nom}</option>)}
            </select>
          </div>
          <button type="button" className="btn-primary" onClick={reattribuer} disabled={occupe || !cible}>Réattribuer</button>
          <button type="button" className="btn-danger" onClick={retirer} disabled={occupe}>Retirer (non travaillées)</button>
          <button type="button" className="btn-ghost" onClick={() => setSelection(new Set())}>Annuler</button>
        </div>
      )}

      {/* LISTE */}
      <section className="glass-card overflow-x-auto p-2">
        <table className="w-full text-sm">
          <thead className="text-left text-white/50">
            <tr>
              <th className="px-2 py-2">
                <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={tousCoches} aria-label="Tout cocher"
                  onChange={() => setSelection(tousCoches ? new Set() : new Set(visibles.map((p) => p.id)))} />
              </th>
              <th className="px-2 py-2 font-medium">Garage</th>
              <th className="px-2 py-2 font-medium">Commercial</th>
              <th className="px-2 py-2 font-medium">Étape</th>
              <th className="px-2 py-2 text-right font-medium">Contacts</th>
              <th className="px-2 py-2 font-medium">Dernier contact</th>
              <th className="px-2 py-2 font-medium">Prochaine action</th>
              <th className="px-2 py-2 font-medium">Attribué</th>
              <th className="px-2 py-2"> </th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => {
              const etape = etapeDe(p);
              const rappel = etatRappel(p);
              return (
                <Fragment key={p.id}>
                  <tr className={`border-t border-white/5 hover:bg-white/5 ${selection.has(p.id) ? "bg-white/10" : ""}`}>
                    <td className="px-2 py-2">
                      <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={selection.has(p.id)} aria-label={`Sélectionner ${p.nom}`}
                        onChange={() => setSelection((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-medium text-white">{p.nom}</div>
                      <div className="text-xs text-white/45">{[p.cp, p.ville].filter(Boolean).join(" ")}{p.tel ? ` · ${p.tel}` : ""}</div>
                    </td>
                    <td className="px-2 py-2 text-white/80">{nomDe(p.owner_id)}</td>
                    <td className="px-2 py-2">
                      <span className={etape === "a_appeler" || etape === "en_cours" ? (etape === "a_appeler" ? "badge badge-neutral" : "badge badge-info") : STATUTS_PROSPECT[p.statut].badge}>{ETAPES_PIPELINE[etape].label}</span>
                      {p.statut === "perdu" && p.motif_refus && <div className="mt-0.5 text-[11px] text-white/45">{MOTIFS_REFUS[p.motif_refus]}</div>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.nb_appels || 0}</td>
                    <td className="px-2 py-2 text-white/70">
                      {p.dernier_contact ? (
                        <>
                          {dateFr(p.dernier_contact)}
                          {p.dernier_resultat && <div className="text-[11px] text-white/45">{RESULTATS_CONTACT[p.dernier_resultat]?.label || p.dernier_resultat}</div>}
                        </>
                      ) : <span className="text-white/35">jamais contacté</span>}
                    </td>
                    <td className="px-2 py-2">
                      {p.prochaine_date ? (
                        <span className={rappel === "echu" ? "text-rose-300" : rappel === "aujourdhui" ? "text-amber-200" : "text-white/70"}>
                          {dateFr(p.prochaine_date)}{rappel === "echu" ? " · en retard" : ""}
                          {p.prochaine_action && <div className="text-[11px] text-white/45">{p.prochaine_action}</div>}
                        </span>
                      ) : p.rdv_le && p.statut === "rdv" ? <span className="text-white/70">RDV le {dateFr(p.rdv_le)}</span> : <span className="text-white/35">—</span>}
                    </td>
                    <td className="px-2 py-2 text-xs text-white/50">{p.attribue_le ? dateFr(p.attribue_le) : "créé par lui"}</td>
                    <td className="px-2 py-2 text-right">
                      <button type="button" className="text-accent-teal hover:underline" onClick={() => ouvrir(p.id)}>{ouvert === p.id ? "Fermer" : "Détail"}</button>
                    </td>
                  </tr>
                  {ouvert === p.id && (
                    <tr className="border-t border-white/5 bg-white/5">
                      <td> </td>
                      <td colSpan={8} className="px-2 py-3">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                          <div className="text-xs text-white/70">
                            <div className="mb-1 font-semibold text-white">Fiche</div>
                            <div>{p.adresse} {p.cp} {p.ville}</div>
                            <div>SIRET {p.siret || p.siren || "—"}</div>
                            <div>Gérant : {p.gerant || "—"} · Contact : {p.contact_nom || "—"}</div>
                            <div>{p.tel || "pas de téléphone"} · {p.email || "pas d'email"}</div>
                            {p.notes && <div className="mt-1 whitespace-pre-wrap text-white/50">{p.notes}</div>}
                          </div>
                          <div className="text-xs lg:col-span-2">
                            <div className="mb-1 font-semibold text-white">Ce qui a été fait</div>
                            {!journal && <div className="text-white/45">Chargement…</div>}
                            {journal && journal.interactions.length === 0 && journal.documents.length === 0 && <div className="text-white/45">Rien pour l&apos;instant : aucun contact noté, aucun document.</div>}
                            {journal && journal.documents.length > 0 && (
                              <div className="mb-2 text-white/70">
                                Documents : {journal.documents.map((d) => `${TYPES_DOCUMENT[d.type]}${d.signe_le ? " ✓ signé" : d.envoye_le ? " (envoyé)" : ""}`).join(" · ")}
                              </div>
                            )}
                            {journal && journal.interactions.length > 0 && (
                              <ul className="space-y-1">
                                {journal.interactions.map((i) => (
                                  <li key={i.id} className="flex flex-wrap items-baseline gap-x-2 text-white/80">
                                    <span className="tabular-nums text-white/45">{new Date(i.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                                    <span>{CANAUX_CONTACT[i.canal]?.icone} {CANAUX_CONTACT[i.canal]?.label}</span>
                                    <span className={RESULTATS_CONTACT[i.resultat]?.badge || "badge badge-neutral"}>{RESULTATS_CONTACT[i.resultat]?.label || i.resultat}</span>
                                    {i.motif_refus && <span className="text-white/55">{MOTIFS_REFUS[i.motif_refus]}</span>}
                                    {i.commentaire && <span className="text-white/60">— {i.commentaire}</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filtres.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-white/40">Aucune fiche ne correspond à ces filtres.</td></tr>
            )}
          </tbody>
        </table>
        {filtres.length > limite && (
          <div className="p-3 text-center">
            <button type="button" className="btn-ghost" onClick={() => setLimite((l) => l + 200)}>Afficher plus ({filtres.length - limite} restantes)</button>
          </div>
        )}
      </section>
    </>
  );
}
