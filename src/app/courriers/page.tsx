"use client";

/**
 * COURRIERS LA POSTE (v13.27)
 *
 * Tous les courriers papier partis depuis l'appli via Maileva (La Poste) :
 * lettres simples et recommandés AR, suivi, n° de recommandé, preuves de
 * dépôt et avis de réception. Envoi d'un PDF hors dossier, et réglages du
 * compte Maileva du garage.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { EnvoiPostal, StatutEnvoiPostal, suiviActif } from "@/lib/envoisPostaux";
import { actualiserSuivi, ConfigMaileva, enregistrerConfigMaileva, fichierEnBase64, lireConfigMaileva, testerConfigMaileva } from "@/lib/envoisPostauxClient";
import ConfigBanner from "@/components/ConfigBanner";
import StatCard from "@/components/StatCard";
import FilePicker from "@/components/FilePicker";
import EnvoiPostalModal from "@/components/EnvoiPostalModal";
import EnvoisPostauxListe from "@/components/EnvoisPostauxListe";

type Filtre = "tous" | "en_cours" | "lrar" | "simple" | "distribue" | "probleme";

export default function CourriersPage() {
  const [envois, setEnvois] = useState<EnvoiPostal[]>([]);
  const [dossiers, setDossiers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [erreurTable, setErreurTable] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [recherche, setRecherche] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [nouveau, setNouveau] = useState(false);

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from("envois_postaux").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) { setErreurTable(true); setLoading(false); return; }
    const liste = (data as EnvoiPostal[]) || [];
    setEnvois(liste);
    const ids = Array.from(new Set(liste.map((e) => e.dossier_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: ds } = await supabase.from("dossiers").select("id, numero_sinistre, client_nom, immatriculation").in("id", ids);
      const m: Record<string, string> = {};
      for (const d of (ds as { id: string; numero_sinistre: string | null; client_nom: string | null; immatriculation: string | null }[]) || []) {
        m[d.id] = [d.client_nom, d.immatriculation || d.numero_sinistre].filter(Boolean).join(" · ") || "Dossier";
      }
      setDossiers(m);
    }
    setLoading(false);
  }, []);

  // À l'ouverture : on relit la base puis on réinterroge La Poste pour les envois en cours.
  useEffect(() => {
    (async () => {
      await charger();
      const r = await actualiserSuivi();
      if (!r.error && r.envois.length) charger();
    })();
  }, [charger]);

  async function actualiser() {
    setBusy(true); setInfo(null);
    const r = await actualiserSuivi();
    setBusy(false);
    setInfo(r.error ? r.error : r.erreurs.length ? `Suivi partiel : ${r.erreurs.join(" · ")}` : `Suivi à jour (${r.envois.length} envoi${r.envois.length > 1 ? "s" : ""} vérifié${r.envois.length > 1 ? "s" : ""}).`);
    charger();
  }

  const kpi = useMemo(() => {
    const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0);
    const reels = envois.filter((e) => e.maileva_sending_id);
    return {
      mois: reels.filter((e) => new Date(e.soumis_le || e.created_at) >= debutMois).length,
      enCours: reels.filter((e) => suiviActif(e.statut)).length,
      lrar: reels.filter((e) => e.type === "lrar").length,
      distribues: envois.filter((e) => e.statut === "distribue").length,
      problemes: envois.filter((e) => (["erreur", "rejete", "retour"] as StatutEnvoiPostal[]).includes(e.statut)).length,
    };
  }, [envois]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return envois.filter((e) => {
      if (filtre === "en_cours" && !suiviActif(e.statut)) return false;
      if (filtre === "lrar" && e.type !== "lrar") return false;
      if (filtre === "simple" && e.type !== "simple") return false;
      if (filtre === "distribue" && e.statut !== "distribue") return false;
      if (filtre === "probleme" && !["erreur", "rejete", "retour"].includes(e.statut)) return false;
      if (!q) return true;
      return [e.destinataire_nom, e.objet, e.numero_suivi, ...(e.adresse_lignes || []), e.dossier_id ? dossiers[e.dossier_id] : ""].join(" ").toLowerCase().includes(q);
    });
  }, [envois, filtre, recherche, dossiers]);

  const FILTRES: { key: Filtre; label: string }[] = [
    { key: "tous", label: "Tous" },
    { key: "en_cours", label: "En cours" },
    { key: "lrar", label: "Recommandés" },
    { key: "simple", label: "Lettres simples" },
    { key: "distribue", label: "Distribués" },
    { key: "probleme", label: "À traiter" },
  ];

  return (
    <div>
      <h1 className="titre-page mb-1">Courriers La Poste</h1>
      <p className="mb-4 text-sm text-white/60">Envoie un PDF : La Poste l&apos;imprime, le met sous pli et le distribue — lettre simple ou recommandé avec avis de réception. Plus de passage au bureau de poste.</p>
      <ConfigBanner />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Envoyés ce mois" value={String(kpi.mois)} hint={`${kpi.lrar} recommandé${kpi.lrar > 1 ? "s" : ""} au total`} accent="violet" />
        <StatCard label="En cours" value={String(kpi.enCours)} hint="impression / acheminement" accent="amber" />
        <StatCard label="Distribués" value={String(kpi.distribues)} hint="remis au destinataire" accent="emerald" />
        <StatCard label="À traiter" value={String(kpi.problemes)} hint="erreur, rejet ou retour" accent="pink" />
      </div>

      {erreurTable && (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
          Exécute <code>supabase/migration_v89.sql</code> dans Supabase → SQL Editor pour activer les courriers La Poste.
        </div>
      )}

      <section className="glass-card mb-6 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="titre-bloc">Nouvel envoi</h2>
          <span className="text-xs text-white/50">Pour un courrier lié à un sinistre, passe plutôt par la fiche dossier (il y sera rattaché).</span>
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <FilePicker value={fichier} onChange={setFichier} accept="application/pdf" label="Choisir le PDF à envoyer" aide="PDF uniquement — glisse le fichier ici" avecPhoto={false} />
          <button className="btn-primary" disabled={!fichier} onClick={() => setNouveau(true)}>📮 Envoyer par La Poste</button>
        </div>
      </section>

      <section className="glass-card mb-6 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="segment flex-wrap">
            {FILTRES.map((f) => (
              <button key={f.key} type="button" onClick={() => setFiltre(f.key)} className={`segment-btn ${filtre === f.key ? "actif" : ""}`}>{f.label}</button>
            ))}
          </div>
          <input className="field-input field-compact min-w-[180px] flex-1" placeholder="Rechercher (destinataire, n° de recommandé, objet…)" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          <button onClick={actualiser} disabled={busy} className="btn-ghost btn-compact">{busy ? "Vérification…" : "↻ Actualiser le suivi"}</button>
        </div>
        {info && <p className="mb-2 text-xs text-white/70">{info}</p>}
        {loading && <p className="text-sm text-white/40">Chargement…</p>}
        {!loading && !erreurTable && visibles.length === 0 && (
          <p className="text-sm text-white/45">{envois.length ? "Aucun envoi pour ce filtre." : "Aucun courrier envoyé pour l'instant. Depuis une fiche dossier ou la procédure d'impayé, le bouton « Envoyer par La Poste » expédie le PDF en un clic."}</p>
        )}
        <EnvoisPostauxListe envois={visibles} dossiers={dossiers} />
      </section>

      <ReglagesMaileva />

      {nouveau && fichier && (
        <EnvoiPostalModal
          getPdfBase64={() => fichierEnBase64(fichier)}
          nomFichier={fichier.name}
          objet={fichier.name.replace(/\.pdf$/i, "")}
          destinataireNom=""
          destinataireAdresse=""
          onClose={() => setNouveau(false)}
          onEnvoye={() => { setNouveau(false); setFichier(null); setInfo("Courrier transmis à La Poste ✓"); charger(); }}
        />
      )}
    </div>
  );
}

function ReglagesMaileva() {
  const [config, setConfig] = useState<ConfigMaileva | null>(null);
  const [f, setF] = useState({ environnement: "sandbox", login: "", password: "", client_id: "", client_secret: "", notification_email: "", couleur: false, recto_verso: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);

  const lire = useCallback(async () => {
    const { config: c } = await lireConfigMaileva();
    setConfig(c);
    if (c) setF((p) => ({ ...p, environnement: c.environnement, login: c.login, client_id: c.client_id, notification_email: c.notification_email, couleur: c.couleur, recto_verso: c.recto_verso, password: "", client_secret: "" }));
  }, []);
  useEffect(() => { lire(); }, [lire]);

  async function enregistrer(tester: boolean) {
    setBusy(tester ? "test" : "save"); setMsg(null);
    const champs: Record<string, unknown> = { ...f };
    if (!f.password) delete champs.password;
    if (!f.client_secret) delete champs.client_secret;
    let err = await enregistrerConfigMaileva(champs);
    if (!err && tester) err = await testerConfigMaileva();
    setBusy(null);
    setMsg(err ? { ok: false, texte: err } : { ok: true, texte: tester ? `Connexion Maileva réussie (${f.environnement === "production" ? "production" : "test"}) ✓` : "Réglages enregistrés ✓" });
    lire();
  }

  return (
    <section id="reglages" className="glass-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="titre-bloc">Réglages Maileva (La Poste)</h2>
        {config?.configured ? <span className="badge badge-ok">Connecté{config.environnement === "sandbox" ? " · TEST" : " · production"}</span> : <span className="badge badge-neutral">Non configuré</span>}
      </div>
      <p className="mb-3 text-sm text-white/65">
        Crée un compte professionnel sur <a href="https://www.maileva.com" target="_blank" rel="noopener noreferrer" className="text-accent-teal hover:underline">maileva.com</a>, puis demande l&apos;accès API (identifiants <em>client_id</em> / <em>client_secret</em>, d&apos;abord en environnement de test). Les mots de passe sont chiffrés et ne sont jamais réaffichés. L&apos;adresse d&apos;expéditeur est celle du Profil du garage.
      </p>
      {config?.viaEnv && <p className="mb-3 text-xs text-sky-200">Un compte Maileva commun est déjà configuré sur le serveur : ces champs sont facultatifs.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label text-[11px]">Environnement</label>
          <div className="segment">
            <button type="button" onClick={() => setF({ ...f, environnement: "sandbox" })} className={`segment-btn ${f.environnement === "sandbox" ? "actif" : ""}`}>Test (rien n&apos;est posté)</button>
            <button type="button" onClick={() => setF({ ...f, environnement: "production" })} className={`segment-btn ${f.environnement === "production" ? "actif" : ""}`}>Production (envois réels)</button>
          </div>
        </div>
        <div><label className="field-label text-[11px]">Identifiant Maileva</label><input className="field-input field-compact w-full" autoComplete="off" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} /></div>
        <div><label className="field-label text-[11px]">Mot de passe {config?.hasPassword && <span className="text-white/40">(enregistré — laisser vide pour le garder)</span>}</label><input type="password" className="field-input field-compact w-full" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <div><label className="field-label text-[11px]">client_id (application API)</label><input className="field-input field-compact w-full font-mono" autoComplete="off" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} /></div>
        <div><label className="field-label text-[11px]">client_secret {config?.hasSecret && <span className="text-white/40">(enregistré)</span>}</label><input type="password" className="field-input field-compact w-full font-mono" autoComplete="new-password" value={f.client_secret} onChange={(e) => setF({ ...f, client_secret: e.target.value })} /></div>
        <div><label className="field-label text-[11px]">Email de notification Maileva (facultatif)</label><input type="email" className="field-input field-compact w-full" value={f.notification_email} onChange={(e) => setF({ ...f, notification_email: e.target.value })} /></div>
        <div className="flex flex-col justify-end gap-1 text-sm text-white/80">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.recto_verso} onChange={(e) => setF({ ...f, recto_verso: e.target.checked })} className="h-4 w-4 accent-pink-500" />Recto verso par défaut</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.couleur} onChange={(e) => setF({ ...f, couleur: e.target.checked })} className="h-4 w-4 accent-pink-500" />Couleur par défaut</label>
        </div>
      </div>
      {config?.expediteur && (
        <p className="mt-3 text-xs text-white/55">Expéditeur : {[config.expediteur.nom, config.expediteur.adresse, `${config.expediteur.code_postal || ""} ${config.expediteur.ville || ""}`.trim()].filter(Boolean).join(", ") || "à compléter dans le Profil"}</p>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.texte}</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button className="btn-ghost btn-compact" disabled={busy !== null} onClick={() => enregistrer(false)}>{busy === "save" ? "Enregistrement…" : "Enregistrer"}</button>
        <button className="btn-primary btn-compact" disabled={busy !== null} onClick={() => enregistrer(true)}>{busy === "test" ? "Test en cours…" : "Enregistrer et tester la connexion"}</button>
      </div>
    </section>
  );
}
