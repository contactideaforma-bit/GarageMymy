"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { GuidePretAssureur } from "@/lib/types";
import { formatDate, messageErreur } from "@/lib/format";
import { estAdmin } from "@/lib/support";
import {
  CADRE_COMMUN,
  CHAMPS_VIDES_FICHE,
  FIABILITES,
  FormFiche,
  GARAGES_AGREES,
  INCLUSIONS,
  ficheVersForm,
  formVersFiche,
  fusionnerFiches,
  resumeDurees,
  sourcesListe,
} from "@/lib/guidePret";
import ConfigBanner from "@/components/ConfigBanner";
import StatCard from "@/components/StatCard";
import ModalShell from "@/components/ModalShell";

/**
 * Guide « véhicule de prêt » (v13.2) : ce que chaque assureur prend en charge
 * avant d'attribuer un véhicule. Fiches communes de l'éditeur (modifiables
 * par les comptes admin) + fiches personnelles du garage : ajout d'un
 * assureur, ou « Personnaliser » une fiche commune (copie qui prend le pas,
 * pour y noter ses retours d'expérience et accords locaux).
 */
export default function GuidePretAssureurs() {
  const [rows, setRows] = useState<GuidePretAssureur[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispo, setDispo] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<string>("tous");
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [cadreOuvert, setCadreOuvert] = useState(false);
  const [edition, setEdition] = useState<{ fiche: GuidePretAssureur | null; form: FormFiche; commune: boolean; copieDe?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const admin = estAdmin(email);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("guide_pret_assureurs").select("*").order("nom");
    if (error) { setDispo(false); setRows([]); setLoading(false); return; }
    setRows((data as GuidePretAssureur[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setEmail(data.user?.email ?? null); setUid(data.user?.id ?? null); });
    load();
  }, [load]);

  const fiches = useMemo(() => fusionnerFiches(rows), [rows]);
  const term = q.trim().toLowerCase();
  const visibles = fiches.filter((f) => {
    if (filtre !== "tous" && f.inclusion !== filtre) return false;
    if (!term) return true;
    return `${f.nom} ${f.alias || ""} ${f.contrat || ""}`.toLowerCase().includes(term);
  });

  const nbInclus = fiches.filter((f) => f.inclusion === "inclus").length;
  const nbPerso = fiches.filter((f) => f.owner_id).length;
  const nbAConfirmer = fiches.filter((f) => f.fiabilite === "comparateur").length;

  /* ------------------------------ Édition ------------------------------ */

  function ajouter() {
    setEdition({ fiche: null, form: { ...CHAMPS_VIDES_FICHE }, commune: false });
  }
  function modifier(f: GuidePretAssureur) {
    setEdition({ fiche: f, form: ficheVersForm(f), commune: !f.owner_id });
  }
  /** Copie personnelle d'une fiche commune : prend le pas, modifiable librement. */
  function personnaliser(f: GuidePretAssureur) {
    setEdition({ fiche: null, form: ficheVersForm(f), commune: false, copieDe: f.id });
  }

  async function enregistrer() {
    if (!edition || saving) return;
    const form = edition.form;
    if (!form.nom.trim()) return alert("Le nom de l'assureur est obligatoire.");
    setSaving(true);
    const valeurs = formVersFiche(form);
    let error;
    if (edition.fiche) {
      ({ error } = await supabase.from("guide_pret_assureurs").update({ ...valeurs, updated_at: new Date().toISOString() }).eq("id", edition.fiche.id));
    } else {
      const commune = edition.commune && admin;
      ({ error } = await supabase.from("guide_pret_assureurs").insert({
        ...valeurs,
        owner_id: commune ? null : uid,
        base_id: edition.copieDe || null,
      }));
    }
    setSaving(false);
    if (error) return alert(messageErreur(error, "Enregistrement impossible."));
    setEdition(null);
    load();
  }

  async function supprimer(f: GuidePretAssureur) {
    const msg = f.owner_id
      ? f.base_id ? "Supprimer ta version personnalisée ? La fiche commune réapparaîtra." : "Supprimer cette fiche ?"
      : "Supprimer cette fiche COMMUNE pour tous les garages ?";
    if (!confirm(msg)) return;
    const { error } = await supabase.from("guide_pret_assureurs").delete().eq("id", f.id);
    if (error) return alert(messageErreur(error, "Suppression impossible."));
    load();
  }

  const setF = (k: keyof FormFiche, v: string) => setEdition((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  /* ------------------------------ Rendu ------------------------------ */

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="titre-page">Guide véhicule de prêt</h1>
          <p className="mt-1 max-w-3xl text-sm text-white/60">
            Avant d&apos;attribuer un véhicule, vérifie ce que l&apos;assurance du client prend en charge : garantie incluse ou en option, durée
            selon l&apos;événement, véhicule fourni, plafond si l&apos;assisteur ne fournit rien, seuil de déclenchement, garage agréé exigé ou non.
            L&apos;encart s&apos;affiche automatiquement quand tu prêtes un véhicule lié à un dossier sinistre.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/flotte" className="btn-ghost">← Flotte</Link>
          <button onClick={ajouter} className="btn-primary">+ Assureur</button>
        </div>
      </div>
      <ConfigBanner />

      {!dispo && (
        <div className="alerte alerte-warn mb-5">
          <div className="alerte-titre">Table absente</div>
          Exécute la migration <code>supabase/migration_v74.sql</code> dans Supabase (SQL Editor → Run) pour créer le guide et ses 15 fiches.
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Assureurs" value={String(fiches.length)} accent="violet" icone="🛡️" />
        <StatCard label="Prêt inclus d'office" value={String(nbInclus)} hint="sans option à souscrire" accent="emerald" icone="✅" />
        <StatCard label="À confirmer" value={String(nbAConfirmer)} hint="CG non publiées" accent="amber" icone="❓" />
        <StatCard label="Mes fiches" value={String(nbPerso)} hint="ajouts et personnalisations" accent="teal" icone="✏️" />
      </div>

      {/* Cadre commun */}
      <section className="glass-card mb-5">
        <button onClick={() => setCadreOuvert((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={cadreOuvert}>
          <span className={`shrink-0 text-white/40 transition-transform ${cadreOuvert ? "rotate-90" : ""}`} aria-hidden>▸</span>
          <h2 className="titre-bloc">Ce qui vaut pour tous les assureurs</h2>
          <span className="ml-auto text-xs text-white/40">non responsable · IRSA · libre choix du réparateur · transfert de garantie</span>
        </button>
        {cadreOuvert && (
          <div className="grid grid-cols-1 gap-3 border-t border-white/10 px-4 py-4 md:grid-cols-2">
            {CADRE_COMMUN.map((c) => (
              <div key={c.titre} className="glass-soft p-3">
                <div className="mb-1 text-sm font-semibold text-white">{c.titre}</div>
                <p className="text-xs leading-relaxed text-white/70">{c.texte}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className="field-input max-w-xs" placeholder="Rechercher un assureur…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="segment">
          {[["tous", "Tous"], ["inclus", "Inclus"], ["selon_formule", "Selon formule"], ["option", "En option"], ["inconnu", "À vérifier"]].map(([k, l]) => (
            <button key={k} onClick={() => setFiltre(k)} className={`segment-btn ${filtre === k ? "actif" : ""}`}>{l}</button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div className="space-y-3">
        {loading && <p className="text-sm text-white/40">Chargement…</p>}
        {!loading && visibles.length === 0 && (
          <div className="glass-card px-5 py-8 text-center text-sm text-white/40">
            {fiches.length === 0 ? "Aucune fiche : exécute la migration v74 ou ajoute un assureur." : "Aucun assureur ne correspond."}
          </div>
        )}
        {visibles.map((f) => {
          const inc = INCLUSIONS[f.inclusion] || INCLUSIONS.inconnu;
          const reseau = GARAGES_AGREES[f.garage_agree] || GARAGES_AGREES.inconnu;
          const fiab = FIABILITES[f.fiabilite] || FIABILITES.site;
          const open = ouverte === f.id;
          const peutModifier = f.owner_id ? f.owner_id === uid : admin;
          return (
            <article key={f.id} className="glass-card">
              <button onClick={() => setOuverte(open ? null : f.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left" aria-expanded={open}>
                <span className={`shrink-0 text-white/40 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>▸</span>
                <span className="text-base font-semibold text-white">{f.nom}</span>
                <span className={`badge ${inc.badge}`}>{inc.label}</span>
                {f.owner_id && <span className="badge badge-info">{f.base_id ? "Personnalisée" : "Ma fiche"}</span>}
                <span className="basis-full text-xs text-white/60 sm:basis-auto sm:ml-auto">{resumeDurees(f)}</span>
              </button>

              {open && (
                <div className="space-y-4 border-t border-white/10 px-4 py-4">
                  {f.contrat && <p className="text-sm text-white/80">{f.contrat}</p>}

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    <Chiffre label="Panne" jours={f.duree_panne} />
                    <Chiffre label="Accident" jours={f.duree_accident} />
                    <Chiffre label="Incendie" jours={f.duree_incendie} />
                    <Chiffre label="Vol" jours={f.duree_vol} />
                    <Chiffre label="Maximum" jours={f.duree_max} />
                    <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-white/40">Si pas de véhicule</div>
                      <div className="text-sm font-semibold text-accent-teal">{f.plafond_jour != null ? `${Number(f.plafond_jour).toLocaleString("fr-FR")} €/j` : "—"}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className={`badge ${reseau.badge}`} title={reseau.detail}>{reseau.label}</span>
                    <span className={`badge ${fiab.badge}`} title={fiab.detail}>{fiab.label}</span>
                    {f.verifie_le && <span className="text-white/40">vérifié le {formatDate(f.verifie_le)}</span>}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Bloc titre="Formules et options" texte={f.formules} />
                    <Bloc titre="Conditions" texte={f.conditions} />
                    <Bloc titre="Véhicule fourni" texte={[f.categorie, f.plafond_detail].filter(Boolean).join(" — ")} />
                    <Bloc titre="Seuil de déclenchement" texte={f.immobilisation_min} />
                    <Bloc titre="Exclusions" texte={f.exclusions} />
                    <Bloc titre="Le garage peut-il facturer l'assureur ?" texte={f.facturation_garage} />
                    <Bloc titre="Assisteur" texte={[f.assisteur, f.assisteur_tel].filter(Boolean).join(" · ")} />
                    <Bloc titre="Prix de l'option" texte={f.prix_option} />
                    {f.notes && <Bloc titre="Mon expérience" texte={f.notes} accent />}
                  </div>

                  {sourcesListe(f).length > 0 && (
                    <div className="text-xs text-white/50">
                      Sources :{" "}
                      {sourcesListe(f).map((u, i) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer" className="text-accent-teal hover:underline">
                          {i > 0 ? " · " : ""}{new URL(u).hostname.replace(/^www\./, "")}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2">
                    {!f.owner_id && !admin && <button onClick={() => personnaliser(f)} className="btn-ghost btn-compact">Personnaliser (ma version)</button>}
                    {!f.owner_id && admin && <button onClick={() => personnaliser(f)} className="btn-ghost btn-compact">Copie personnelle</button>}
                    {peutModifier && <button onClick={() => modifier(f)} className="btn-ghost btn-compact">Modifier</button>}
                    {peutModifier && <button onClick={() => supprimer(f)} className="btn-ghost btn-compact text-white/50 hover:text-rose-300">Supprimer</button>}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {edition && (
        <ModalShell
          title={edition.fiche ? `Modifier — ${edition.fiche.nom}` : edition.copieDe ? `Ma version — ${edition.form.nom}` : "Nouvel assureur"}
          onClose={() => setEdition(null)}
          maxWidth="max-w-3xl"
        >
          {edition.commune && admin && <p className="text-xs text-amber-200">Fiche COMMUNE : la modification est visible par tous les garages.</p>}
          {admin && !edition.fiche && !edition.copieDe && (
            <label className="flex items-center gap-2 text-xs text-white/70">
              <input type="checkbox" checked={edition.commune} onChange={(e) => setEdition((x) => (x ? { ...x, commune: e.target.checked } : x))} />
              Fiche commune (visible par tous les garages)
            </label>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2"><label className="field-label">Assureur *</label><input className="field-input" value={edition.form.nom} onChange={(e) => setF("nom", e.target.value)} /></div>
            <div className="col-span-2"><label className="field-label">Autres graphies (virgules)</label><input className="field-input" value={edition.form.alias} onChange={(e) => setF("alias", e.target.value)} placeholder="axa france iard, direct axa" /></div>
            <div className="col-span-2 sm:col-span-4"><label className="field-label">Contrat / garantie</label><input className="field-input" value={edition.form.contrat} onChange={(e) => setF("contrat", e.target.value)} /></div>
            <div><label className="field-label">Prise en charge</label>
              <select className="field-input" value={edition.form.inclusion} onChange={(e) => setF("inclusion", e.target.value)}>
                {Object.entries(INCLUSIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></div>
            <div><label className="field-label">Garage agréé</label>
              <select className="field-input" value={edition.form.garage_agree} onChange={(e) => setF("garage_agree", e.target.value)}>
                {Object.entries(GARAGES_AGREES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></div>
            <div><label className="field-label">Fiabilité</label>
              <select className="field-input" value={edition.form.fiabilite} onChange={(e) => setF("fiabilite", e.target.value)}>
                {Object.entries(FIABILITES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></div>
            <div><label className="field-label">Vérifié le</label><input type="date" className="field-input" value={edition.form.verifie_le} onChange={(e) => setF("verifie_le", e.target.value)} /></div>
            <div className="col-span-2 sm:col-span-4"><label className="field-label">Formules et options</label><textarea rows={3} className="field-input" value={edition.form.formules} onChange={(e) => setF("formules", e.target.value)} /></div>
            <div><label className="field-label">Panne (jours)</label><input inputMode="numeric" className="field-input" value={edition.form.duree_panne} onChange={(e) => setF("duree_panne", e.target.value)} /></div>
            <div><label className="field-label">Accident (jours)</label><input inputMode="numeric" className="field-input" value={edition.form.duree_accident} onChange={(e) => setF("duree_accident", e.target.value)} /></div>
            <div><label className="field-label">Incendie (jours)</label><input inputMode="numeric" className="field-input" value={edition.form.duree_incendie} onChange={(e) => setF("duree_incendie", e.target.value)} /></div>
            <div><label className="field-label">Vol (jours)</label><input inputMode="numeric" className="field-input" value={edition.form.duree_vol} onChange={(e) => setF("duree_vol", e.target.value)} /></div>
            <div><label className="field-label">Maximum (jours)</label><input inputMode="numeric" className="field-input" value={edition.form.duree_max} onChange={(e) => setF("duree_max", e.target.value)} /></div>
            <div><label className="field-label">Plafond €/jour</label><input inputMode="decimal" className="field-input" value={edition.form.plafond_jour} onChange={(e) => setF("plafond_jour", e.target.value)} /></div>
            <div className="col-span-2"><label className="field-label">Véhicule fourni (catégorie)</label><input className="field-input" value={edition.form.categorie} onChange={(e) => setF("categorie", e.target.value)} /></div>
            <div className="col-span-2 sm:col-span-4"><label className="field-label">Détail du plafond</label><input className="field-input" value={edition.form.plafond_detail} onChange={(e) => setF("plafond_detail", e.target.value)} /></div>
            <div className="col-span-2 sm:col-span-4"><label className="field-label">Seuil de déclenchement</label><input className="field-input" value={edition.form.immobilisation_min} onChange={(e) => setF("immobilisation_min", e.target.value)} placeholder="> 24 h d'immobilisation, > 5 h de main-d'œuvre…" /></div>
            <div className="col-span-2 sm:col-span-4"><label className="field-label">Conditions</label><textarea rows={3} className="field-input" value={edition.form.conditions} onChange={(e) => setF("conditions", e.target.value)} /></div>
            <div className="col-span-2 sm:col-span-4"><label className="field-label">Exclusions</label><textarea rows={2} className="field-input" value={edition.form.exclusions} onChange={(e) => setF("exclusions", e.target.value)} /></div>
            <div className="col-span-2 sm:col-span-4"><label className="field-label">Le garage peut-il facturer l&apos;assureur ?</label><textarea rows={2} className="field-input" value={edition.form.facturation_garage} onChange={(e) => setF("facturation_garage", e.target.value)} /></div>
            <div className="col-span-2"><label className="field-label">Assisteur</label><input className="field-input" value={edition.form.assisteur} onChange={(e) => setF("assisteur", e.target.value)} /></div>
            <div className="col-span-2"><label className="field-label">Téléphone assisteur</label><input className="field-input" value={edition.form.assisteur_tel} onChange={(e) => setF("assisteur_tel", e.target.value)} /></div>
            <div className="col-span-2"><label className="field-label">Prix de l&apos;option</label><input className="field-input" value={edition.form.prix_option} onChange={(e) => setF("prix_option", e.target.value)} /></div>
            <div className="col-span-2 sm:col-span-4"><label className="field-label">Sources (une URL par ligne)</label><textarea rows={2} className="field-input font-mono text-xs" value={edition.form.sources} onChange={(e) => setF("sources", e.target.value)} /></div>
            <div className="col-span-2 sm:col-span-4"><label className="field-label">Mon expérience (accords locaux, délais réels, interlocuteur…)</label><textarea rows={3} className="field-input" value={edition.form.notes} onChange={(e) => setF("notes", e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEdition(null)} className="btn-ghost">Annuler</button>
            <button onClick={enregistrer} disabled={saving} className="btn-primary">{saving ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function Chiffre({ label, jours }: { label: string; jours: number | null }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div className={`text-sm font-semibold ${jours != null ? "text-white" : "text-white/30"}`}>{jours != null ? `${jours} j` : "—"}</div>
    </div>
  );
}

function Bloc({ titre, texte, accent = false }: { titre: string; texte: string | null | undefined; accent?: boolean }) {
  if (!texte) return null;
  return (
    <div className={`rounded-lg border px-3 py-2 ${accent ? "border-accent-teal/40 bg-white/5" : "border-white/10"}`}>
      <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">{titre}</div>
      <p className="whitespace-pre-line text-xs leading-relaxed text-white/75">{texte}</p>
    </div>
  );
}
