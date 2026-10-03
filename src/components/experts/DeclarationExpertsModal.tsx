"use client";

// ============================================================
//  ASSISTANT « ME DÉCLARER AUPRÈS DES EXPERTS » (v13.40)
//
//  Un garage qui démarre doit se faire connaître de tous les cabinets
//  d'expertise : 5 étapes guidées, sans rien oublier.
//   1. Mon garage      — coordonnées, assurance RC, agréments, horaires
//   2. Taux & Kbis     — T1/T2/T3, peinture, ingrédients (opaque,
//                        métallisé/vernis, nacré), extrait Kbis PDF
//   3. Destinataires   — les cabinets de la base de données ; on peut en
//                        AJOUTER sur place (fiche ou adresses collées), ils
//                        sont enregistrés dans la base (Base de données → Experts)
//   4. Message         — objet, texte, APERÇU exact, envoi test à soi
//   5. Envoi           — un email personnalisé par cabinet, progression
//  Les informations saisies sont enregistrées dans le profil du garage
//  (elles resservent pour la prochaine campagne).
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ModalShell from "@/components/ModalShell";
import { supabase } from "@/lib/supabaseClient";
import { deposerFichier } from "@/lib/storage";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import { messageErreur } from "@/lib/format";
import type { Entreprise, Expert } from "@/lib/types";
import {
  CHAMPS_DECLARATION, INGREDIENTS, INTRO_DEFAUT, InfosDeclaration, SUJET_DEFAUT, TAUX_MO,
  construireEmail, emailExpert, kbisAncien, manquants,
} from "@/lib/declarationExperts";

type Etape = 1 | 2 | 3 | 4 | 5;
const ETAPES: [Etape, string][] = [[1, "Mon garage"], [2, "Taux & Kbis"], [3, "Destinataires"], [4, "Message"], [5, "Envoi"]];
const LOT = 15;
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

type Dest = { cle: string; expert_id: string | null; email: string; cabinet: string | null; expert_nom: string | null; deja: string | null; ville: string | null };
type Resultat = { email: string; cabinet: string | null; ok: boolean; erreur?: string };

const VIDE: InfosDeclaration = Object.fromEntries(CHAMPS_DECLARATION.map((k) => [k, null])) as unknown as InfosDeclaration;

/** Nom de cabinet déduit d'une adresse : contact@cabinet-dupont.fr → « Cabinet dupont ». */
function cabinetDepuisEmail(email: string): string {
  const dom = email.split("@")[1] || email;
  const base = dom.split(".").slice(0, -1).join(" ") || dom;
  const n = base.replace(/[-_.]+/g, " ").trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export default function DeclarationExpertsModal({ experts: expertsInitiaux, onClose, onEnvoye }: { experts?: Expert[]; onClose: () => void; onEnvoye: () => void }) {
  const [etape, setEtape] = useState<Etape>(1);
  // Base des experts : fournie par l'appelant ou chargée ici (page Espaces experts).
  const [experts, setExperts] = useState<Expert[]>(expertsInitiaux || []);
  const chargerExperts = useCallback(async () => {
    const { data } = await supabase.from("experts").select("*").order("cabinet", { ascending: true });
    setExperts((data as Expert[]) || []);
  }, []);
  useEffect(() => {
    if (!expertsInitiaux) chargerExperts();
  }, [expertsInitiaux, chargerExperts]);
  // Ajout d'un cabinet sur place (enregistré dans la base)
  const [nouveau, setNouveau] = useState({ cabinet: "", expert_nom: "", email: "", tel: "", ville: "" });
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [entId, setEntId] = useState<string | null>(null);
  const [infos, setInfos] = useState<InfosDeclaration>(VIDE);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [kbisFichier, setKbisFichier] = useState<File | null>(null);

  // Destinataires
  const [coches, setCoches] = useState<Record<string, boolean>>({});
  const [colle, setColle] = useState("");
  const [filtre, setFiltre] = useState("");

  // Message
  const [sujet, setSujet] = useState("");
  const [intro, setIntro] = useState("");
  const [avecKbis, setAvecKbis] = useState(true);

  // Envoi
  const [progres, setProgres] = useState<{ fait: number; total: number } | null>(null);
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [termine, setTermine] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("entreprise").select("*").limit(1).maybeSingle();
      if (error) setErr(messageErreur(error, "Profil illisible."));
      const e = (data || {}) as Partial<Entreprise> & Record<string, unknown>;
      if (data) {
        setEntId(String(e.id));
        const i = Object.fromEntries([...CHAMPS_DECLARATION, "signature_mail"].map((k) => [k, (e[k] as unknown) ?? null])) as unknown as InfosDeclaration;
        setInfos(i);
        setSujet(SUJET_DEFAUT(i));
        setIntro(INTRO_DEFAUT(i));
        if (e.logo_path) setLogoUrl(supabase.storage.from("entreprise").getPublicUrl(String(e.logo_path)).data.publicUrl);
      }
      setChargement(false);
    })();
  }, []);

  // Liste des cabinets avec un email exploitable (dédoublonnée par email).
  const destsAnnuaire = useMemo<Dest[]>(() => {
    const vus = new Set<string>();
    const out: Dest[] = [];
    for (const x of experts) {
      const email = emailExpert(x);
      if (!email || vus.has(email)) continue;
      vus.add(email);
      out.push({ cle: x.id, expert_id: x.id, email, cabinet: x.cabinet, expert_nom: x.expert_nom, deja: x.declaration_envoyee_le || null, ville: x.ville });
    }
    return out.sort((a, b) => (a.cabinet || "").localeCompare(b.cabinet || "", "fr"));
  }, [experts]);
  const sansEmail = experts.length - destsAnnuaire.length;

  // Par défaut : tous les cabinets jamais contactés (les nouveaux arrivés
  // dans la liste sont cochés, les choix déjà faits sont conservés).
  useEffect(() => {
    setCoches((c) => {
      const n = { ...c };
      for (const d of destsAnnuaire) if (!(d.cle in n)) n[d.cle] = !d.deja;
      return n;
    });
  }, [destsAnnuaire]);

  const selection = useMemo(() => destsAnnuaire.filter((d) => coches[d.cle]), [destsAnnuaire, coches]);

  /** Ajoute un cabinet (formulaire) dans la base de données des experts. */
  async function ajouterCabinet() {
    const email = nouveau.email.trim().toLowerCase();
    if (!nouveau.cabinet.trim()) return setErr("Indique le nom du cabinet.");
    if (!EMAIL_RE.test(email)) return setErr("Adresse email du cabinet invalide.");
    if (destsAnnuaire.some((d) => d.email === email)) return setErr("Cette adresse est déjà dans la base.");
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("experts").insert({
      cabinet: nouveau.cabinet.trim(), expert_nom: nouveau.expert_nom.trim() || null, email, tel: nouveau.tel.trim() || null, ville: nouveau.ville.trim() || null, source: "manuel",
    });
    setBusy(false);
    if (error) return setErr(messageErreur(error, "Ajout impossible."));
    setNouveau({ cabinet: "", expert_nom: "", email: "", tel: "", ville: "" });
    setInfo(`✓ ${nouveau.cabinet.trim()} ajouté à la base et sélectionné.`);
    await chargerExperts();
  }

  /** Adresses collées en vrac → une fiche par adresse dans la base. */
  async function ajouterColle() {
    const deja = new Set(destsAnnuaire.map((d) => d.email));
    const emails = Array.from(new Set(colle.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter((x) => EMAIL_RE.test(x) && !deja.has(x))));
    if (!emails.length) return setErr("Aucune nouvelle adresse valide à ajouter.");
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("experts").insert(emails.map((email) => ({ cabinet: cabinetDepuisEmail(email), email, source: "manuel" })));
    setBusy(false);
    if (error) return setErr(messageErreur(error, "Ajout impossible."));
    setColle("");
    setInfo(`✓ ${emails.length} cabinet${emails.length > 1 ? "s" : ""} ajouté${emails.length > 1 ? "s" : ""} à la base et sélectionné${emails.length > 1 ? "s" : ""} (nom déduit de l'adresse, modifiable dans Base de données → Experts).`);
    await chargerExperts();
  }
  const m = manquants(infos);
  const set = <K extends keyof InfosDeclaration>(k: K, v: InfosDeclaration[K]) => setInfos((x) => ({ ...x, [k]: v }));

  /** Enregistre les étapes 1-2 dans le profil (et dépose le Kbis). */
  async function enregistrer(): Promise<boolean> {
    setBusy(true);
    setErr(null);
    try {
      let kbis_path = infos.kbis_path || null;
      if (kbisFichier) {
        if (kbisFichier.size > 6_000_000) throw new Error("Kbis trop lourd (6 Mo maximum).");
        kbis_path = await deposerFichier("prive", `kbis_${Date.now()}.pdf`, kbisFichier, { contentType: "application/pdf", upsert: true });
      }
      const patch: Record<string, unknown> = {};
      for (const k of CHAMPS_DECLARATION) patch[k] = (infos as Record<string, unknown>)[k] ?? null;
      patch.kbis_path = kbis_path;
      const q = entId ? supabase.from("entreprise").update(patch).eq("id", entId) : supabase.from("entreprise").insert(patch).select("id").single();
      const { data, error } = await q;
      if (error) throw new Error(/column|colonne/i.test(error.message) ? "Exécute d'abord supabase/migration_v97.sql dans Supabase." : error.message);
      if (!entId && data && "id" in (data as object)) setEntId(String((data as { id: string }).id));
      setInfos((x) => ({ ...x, kbis_path }));
      setKbisFichier(null);
      return true;
    } catch (e) {
      setErr(messageErreur(e, "Enregistrement impossible."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function suivant() {
    setErr(null);
    setInfo(null);
    if (etape === 1 || etape === 2) {
      if (!(await enregistrer())) return;
    }
    if (etape === 2 && m.bloquants.length) return setErr(`Il manque encore ${m.bloquants.join(", ")}.`);
    if (etape === 3 && !selection.length) return setErr("Choisis au moins un cabinet.");
    if (etape === 4 && (!sujet.trim() || !intro.trim())) return setErr("L'objet et le message sont obligatoires.");
    setEtape((e) => (e < 5 ? ((e + 1) as Etape) : e));
  }

  async function appel(payload: Record<string, unknown>) {
    const r = await lireReponse<{ ok: boolean; envoyes: number; echecs: number; resultats: Resultat[] }>(
      await fetchAuth("/api/experts/declaration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    );
    if (!r.ok || !r.data) throw new Error(r.error || "Envoi impossible.");
    return r.data;
  }

  async function test() {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      await appel({ test: true, sujet, intro, avecKbis: avecKbis && Boolean(infos.kbis_path) });
      setInfo(`✓ Email de test envoyé à ${infos.email}. Ouvre-le pour vérifier le rendu (logo, tableau, pièce jointe).`);
    } catch (e) {
      setErr(messageErreur(e, "Envoi du test impossible."));
    } finally {
      setBusy(false);
    }
  }

  async function envoyer() {
    if (!confirm(`Envoyer la déclaration à ${selection.length} cabinet${selection.length > 1 ? "s" : ""} ?\nChaque cabinet reçoit un email personnel, depuis ta boîte mail.`)) return;
    setBusy(true);
    setErr(null);
    setResultats([]);
    setTermine(false);
    setProgres({ fait: 0, total: selection.length });
    const tous: Resultat[] = [];
    try {
      for (let i = 0; i < selection.length; i += LOT) {
        const lot = selection.slice(i, i + LOT).map((d) => ({ expert_id: d.expert_id, email: d.email, cabinet: d.cabinet, expert_nom: d.expert_nom }));
        const r = await appel({ destinataires: lot, sujet, intro, avecKbis: avecKbis && Boolean(infos.kbis_path) });
        tous.push(...r.resultats);
        setResultats([...tous]);
        setProgres({ fait: Math.min(selection.length, i + LOT), total: selection.length });
      }
      setTermine(true);
      onEnvoye();
    } catch (e) {
      setErr(messageErreur(e, "Envoi interrompu."));
    } finally {
      setBusy(false);
    }
  }

  const apercu = useMemo(() => {
    const d = selection[0] || { cabinet: "Cabinet exemple", expert_nom: null };
    return construireEmail(infos, d, { intro, logoUrl, avecKbis: avecKbis && Boolean(infos.kbis_path || kbisFichier) }).html;
  }, [infos, intro, logoUrl, avecKbis, selection, kbisFichier]);

  const visibles = destsAnnuaire.filter((d) => !filtre.trim() || [d.cabinet, d.expert_nom, d.ville, d.email].some((v) => (v || "").toLowerCase().includes(filtre.trim().toLowerCase())));
  const envoyes = resultats.filter((r) => r.ok).length;

  return (
    <ModalShell title="Me déclarer auprès des experts" onClose={onClose} maxWidth="max-w-4xl">
      {/* Étapes */}
      <ol className="mb-4 grid grid-cols-5 gap-1 text-center">
        {ETAPES.map(([n, l]) => (
          <li key={n}>
            <button
              type="button"
              disabled={busy || n > etape}
              onClick={() => setEtape(n)}
              className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 ${n === etape ? "bg-accent-pink/10" : ""}`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${n < etape ? "bg-emerald-500 text-white" : n === etape ? "bg-accent-pink text-white" : "border-2 border-white/25 text-white/50"}`}>{n < etape ? "✓" : n}</span>
              <span className={`text-[11px] leading-tight ${n === etape ? "font-semibold text-white" : "text-white/55"}`}>{l}</span>
            </button>
          </li>
        ))}
      </ol>

      {chargement ? (
        <p className="text-sm text-white/50">Chargement du profil…</p>
      ) : (
        <div className="space-y-4">
          {/* ------------------------- 1. MON GARAGE ------------------------- */}
          {etape === 1 && (
            <>
              <Aide>Ces informations sont reprises telles quelles dans l&apos;email aux cabinets. Elles sont pré-remplies depuis ton profil et y sont enregistrées.</Aide>
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="h-14 max-w-[160px] rounded bg-white object-contain p-1" />
                ) : (
                  <span className="text-xs text-amber-200">Pas de logo : ajoute-le dans Profil du garage pour un email à ton image.</span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ label="Nom du garage *" v={infos.nom} on={(v) => set("nom", v)} />
                <Champ label="Téléphone *" v={infos.tel} on={(v) => set("tel", v)} type="tel" />
                <Champ label="Email *" v={infos.email} on={(v) => set("email", v)} type="email" />
                <Champ label="Adresse *" v={infos.adresse} on={(v) => set("adresse", v)} />
                <Champ label="Code postal *" v={infos.code_postal} on={(v) => set("code_postal", v)} />
                <Champ label="Ville *" v={infos.ville} on={(v) => set("ville", v)} />
                <Champ label="SIRET *" v={infos.siret} on={(v) => set("siret", v)} />
                <Champ label="N° TVA intracommunautaire" v={infos.tva_intra} on={(v) => set("tva_intra", v)} />
                <Champ label="Assurance RC pro (compagnie)" v={infos.rc_assureur} on={(v) => set("rc_assureur", v)} placeholder="ex. AXA" />
                <Champ label="N° de police RC" v={infos.rc_police} on={(v) => set("rc_police", v)} />
                <Champ label="Agréments / partenariats assureurs" v={infos.agrements} on={(v) => set("agrements", v)} placeholder="ex. agréé MAIF, réseau…" />
                <Champ label="Horaires d'ouverture" v={infos.horaires} on={(v) => set("horaires", v)} placeholder="Lun–ven 8h–12h / 14h–18h" />
              </div>
              <div>
                <label className="field-label">Services proposés</label>
                <textarea className="field-input" rows={2} value={infos.services || ""} onChange={(e) => set("services", e.target.value || null)} placeholder="Véhicule de prêt, marbre, dépannage, gardiennage, réparation plastique…" />
              </div>
            </>
          )}

          {/* ------------------------- 2. TAUX & KBIS ------------------------- */}
          {etape === 2 && (
            <>
              <Aide>Taux horaires facturés <b>hors taxes</b>, par heure. Ce sont les chiffres que l&apos;expert reprendra dans ses chiffrages : vérifie-les bien.</Aide>
              <div>
                <div className="mb-2 text-sm font-semibold text-white">Main-d&apos;œuvre (€ HT / heure)</div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {TAUX_MO.map((t) => <Taux key={t.cle} label={t.label} aide={t.aide} v={infos[t.cle] as number | null} on={(v) => set(t.cle, v as never)} />)}
                </div>
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold text-white">Ingrédients peinture (€ HT / heure de peinture)</div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {INGREDIENTS.map((t) => <Taux key={t.cle} label={t.label} v={infos[t.cle] as number | null} on={(v) => set(t.cle, v as never)} />)}
                </div>
              </div>
              <div className="glass-soft p-3">
                <div className="text-sm font-semibold text-white">Extrait Kbis (PDF)</div>
                <p className="text-xs text-white/55">Joint à chaque email. Les cabinets demandent en général un extrait de moins de 3 mois.</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                  <input type="file" accept="application/pdf" className="field-input" onChange={(e) => setKbisFichier(e.target.files?.[0] || null)} />
                  <div>
                    <input type="date" className="field-input" value={infos.kbis_date || ""} onChange={(e) => set("kbis_date", e.target.value || null)} aria-label="Date de l'extrait Kbis" />
                  </div>
                </div>
                <p className="mt-1 text-xs">
                  {kbisFichier ? <span className="text-emerald-300">✓ {kbisFichier.name} sera enregistré.</span> : infos.kbis_path ? <span className="text-emerald-300">✓ Kbis déjà enregistré.</span> : <span className="text-amber-200">Aucun Kbis pour l&apos;instant (conseillé).</span>}
                  {kbisAncien(infos.kbis_date) && <span className="ml-2 text-amber-200">⚠ Extrait de plus de 3 mois : pense à en télécharger un récent sur infogreffe.fr.</span>}
                </p>
              </div>
              <Bilan m={m} />
            </>
          )}

          {/* ------------------------- 3. DESTINATAIRES ------------------------- */}
          {etape === 3 && (
            <>
              <Aide>Chaque cabinet coché reçoit son <b>propre</b> email (il ne voit pas les autres destinataires). Par défaut, ceux qui n&apos;ont jamais reçu ta déclaration sont cochés. Les cabinets ajoutés ici sont enregistrés dans ta base de données.</Aide>

              {/* Ajouter des cabinets dans la base */}
              <div className="rounded-xl border-2 border-dashed border-white/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white">➕ Ajouter des cabinets d&apos;expertise</div>
                  <Link href="/annuaire?tab=experts" className="text-xs text-accent-teal hover:underline">Ouvrir la base des experts ↗</Link>
                </div>
                {!ajoutOuvert ? (
                  <button className="btn-ghost btn-compact mt-2" onClick={() => setAjoutOuvert(true)}>Saisir un cabinet ou coller des adresses</button>
                ) : (
                  <div className="mt-2 space-y-3">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input className="field-input field-compact" placeholder="Cabinet *" value={nouveau.cabinet} onChange={(e) => setNouveau((n) => ({ ...n, cabinet: e.target.value }))} />
                      <input className="field-input field-compact" type="email" placeholder="Email *" value={nouveau.email} onChange={(e) => setNouveau((n) => ({ ...n, email: e.target.value }))} />
                      <input className="field-input field-compact" placeholder="Nom de l'expert" value={nouveau.expert_nom} onChange={(e) => setNouveau((n) => ({ ...n, expert_nom: e.target.value }))} />
                      <input className="field-input field-compact" type="tel" placeholder="Téléphone" value={nouveau.tel} onChange={(e) => setNouveau((n) => ({ ...n, tel: e.target.value }))} />
                      <input className="field-input field-compact" placeholder="Ville" value={nouveau.ville} onChange={(e) => setNouveau((n) => ({ ...n, ville: e.target.value }))} />
                      <button className="btn-primary btn-compact" disabled={busy} onClick={ajouterCabinet}>Ajouter à la base</button>
                    </div>
                    <div>
                      <label className="field-label !text-xs">Ou colle plusieurs adresses (séparées par des virgules ou des retours à la ligne)</label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <textarea className="field-input field-compact flex-1" rows={2} value={colle} onChange={(e) => setColle(e.target.value)} placeholder="contact@cabinet-a.fr, gestion@cabinet-b.fr" />
                        <button className="btn-ghost btn-compact shrink-0" disabled={busy || !colle.trim()} onClick={ajouterColle}>Ajouter ces adresses</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input className="field-input field-compact max-w-xs flex-1" placeholder="Rechercher un cabinet, une ville…" value={filtre} onChange={(e) => setFiltre(e.target.value)} />
                <button className="btn-ghost btn-compact" onClick={() => setCoches(Object.fromEntries(destsAnnuaire.map((d) => [d.cle, true])))}>Tout cocher</button>
                <button className="btn-ghost btn-compact" onClick={() => setCoches({})}>Tout décocher</button>
                <button className="btn-ghost btn-compact" onClick={() => setCoches(Object.fromEntries(destsAnnuaire.map((d) => [d.cle, !d.deja])))}>Jamais contactés</button>
              </div>
              {destsAnnuaire.length === 0 ? (
                <p className="text-sm text-white/55">Aucun cabinet avec email dans ta base pour l&apos;instant : ajoute-les ci-dessus.</p>
              ) : (
                <ul className="max-h-72 divide-y divide-white/10 overflow-y-auto rounded-lg border border-white/10">
                  {visibles.map((d) => (
                    <li key={d.cle}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                        <input type="checkbox" checked={Boolean(coches[d.cle])} onChange={(e) => setCoches((c) => ({ ...c, [d.cle]: e.target.checked }))} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-white">{d.cabinet || d.email}</span>
                          <span className="block truncate text-xs text-white/55">{[d.expert_nom, d.ville, d.email].filter(Boolean).join(" · ")}</span>
                        </span>
                        {d.deja && <span className="badge badge-ok shrink-0">envoyé le {new Date(d.deja).toLocaleDateString("fr-FR")}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {sansEmail > 0 && <p className="text-xs text-amber-200">{sansEmail} cabinet{sansEmail > 1 ? "s" : ""} de la base sans email (ou en double) : complète leur fiche pour les inclure.</p>}
              <p className="text-sm font-semibold text-white">{selection.length} cabinet{selection.length > 1 ? "s" : ""} sélectionné{selection.length > 1 ? "s" : ""}</p>
            </>
          )}

          {/* ------------------------- 4. MESSAGE & APERÇU ------------------------- */}
          {etape === 4 && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Objet</label>
                    <input className="field-input" value={sujet} onChange={(e) => setSujet(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Message d&apos;introduction</label>
                    <textarea className="field-input" rows={7} value={intro} onChange={(e) => setIntro(e.target.value)} />
                    <button className="mt-1 text-xs text-accent-teal hover:underline" onClick={() => setIntro(INTRO_DEFAUT(infos))}>Revenir au texte proposé</button>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-white/85">
                    <input type="checkbox" checked={avecKbis} disabled={!infos.kbis_path} onChange={(e) => setAvecKbis(e.target.checked)} />
                    Joindre l&apos;extrait Kbis {infos.kbis_path ? "" : "(non enregistré — étape 2)"}
                  </label>
                  <p className="text-xs text-white/55">Le salut s&apos;adapte à chaque cabinet (« Bonjour M. Dupont » quand le nom de l&apos;expert est connu). Le tableau des coordonnées et des taux est ajouté automatiquement sous ton message.</p>
                  <button className="btn-ghost w-full justify-center" disabled={busy} onClick={test}>{busy ? "Envoi…" : `✉️ M'envoyer un test (${infos.email || "email du profil"})`}</button>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-white/45">Aperçu — tel que le cabinet le recevra</div>
                  <iframe title="Aperçu de l'email" srcDoc={apercu} className="h-[460px] w-full rounded-lg border border-white/15 bg-white" sandbox="" />
                </div>
              </div>
            </>
          )}

          {/* ------------------------- 5. ENVOI ------------------------- */}
          {etape === 5 && (
            <>
              <div className="glass-soft p-4 text-sm text-white/85">
                <div className="font-semibold text-white">Récapitulatif</div>
                <ul className="mt-1 space-y-0.5">
                  <li>• {selection.length} cabinet{selection.length > 1 ? "s" : ""}, un email personnel chacun, depuis ta boîte mail</li>
                  <li>• Objet : « {sujet} »</li>
                  <li>• Taux : {TAUX_MO.map((t) => `${t.label} ${infos[t.cle] ?? "—"}`).join(" · ")} € HT/h</li>
                  <li>• Kbis joint : {avecKbis && infos.kbis_path ? "oui" : "non"}</li>
                </ul>
              </div>
              {progres && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-white/60"><span>Envoi en cours…</span><span>{progres.fait} / {progres.total}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-teal-400 transition-all" style={{ width: `${Math.round((progres.fait / Math.max(1, progres.total)) * 100)}%` }} /></div>
                </div>
              )}
              {termine && (
                <p className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  ✅ {envoyes} email{envoyes > 1 ? "s" : ""} envoyé{envoyes > 1 ? "s" : ""}{resultats.length - envoyes ? ` · ${resultats.length - envoyes} échec(s) ci-dessous` : ""}. Chaque cabinet est marqué « envoyé » dans l&apos;annuaire. Retrouve les envois dans l&apos;historique des emails.
                </p>
              )}
              {resultats.some((r) => !r.ok) && (
                <ul className="space-y-1 text-xs text-rose-300">
                  {resultats.filter((r) => !r.ok).map((r) => <li key={r.email}>✗ {r.cabinet || r.email} ({r.email}) : {r.erreur}</li>)}
                </ul>
              )}
              {!termine && (
                <button className="btn-primary w-full justify-center !py-3 !text-base" disabled={busy || !selection.length} onClick={envoyer}>
                  {busy ? "Envoi en cours…" : `📣 Envoyer à ${selection.length} cabinet${selection.length > 1 ? "s" : ""}`}
                </button>
              )}
            </>
          )}

          {info && <p className="text-sm text-emerald-300">{info}</p>}
          {err && <p className="text-sm text-rose-300">{err}</p>}

          {/* Navigation */}
          <div className="flex justify-between gap-2 border-t border-white/10 pt-3">
            <button className="btn-ghost" disabled={busy} onClick={() => (etape === 1 ? onClose() : setEtape((e) => (e - 1) as Etape))}>{etape === 1 ? "Fermer" : "← Retour"}</button>
            {etape < 5 ? (
              <button className="btn-primary" disabled={busy} onClick={suivant}>{busy ? "Enregistrement…" : "Suivant →"}</button>
            ) : termine ? (
              <button className="btn-primary" onClick={onClose}>Terminer</button>
            ) : null}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function Aide({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-accent-teal/30 bg-accent-teal/10 px-3 py-2 text-xs text-white/80">💡 {children}</p>;
}

function Champ({ label, v, on, type = "text", placeholder }: { label: string; v: string | null; on: (v: string | null) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input type={type} className="field-input" value={v || ""} placeholder={placeholder} onChange={(e) => on(e.target.value || null)} />
    </div>
  );
}

function Taux({ label, aide, v, on }: { label: string; aide?: string; v: number | null; on: (v: number | null) => void }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          inputMode="decimal"
          className="field-input"
          value={v ?? ""}
          placeholder="0,00"
          onChange={(e) => {
            const s = e.target.value.replace(",", ".").trim();
            on(s === "" ? null : Number.isFinite(Number(s)) ? Number(s) : v);
          }}
        />
        <span className="shrink-0 text-[11px] text-white/50">€ HT</span>
      </div>
      {aide && <p className="mt-0.5 text-[11px] text-white/45">{aide}</p>}
    </div>
  );
}

function Bilan({ m }: { m: { bloquants: string[]; conseilles: string[] } }) {
  if (!m.bloquants.length && !m.conseilles.length) return <p className="text-sm text-emerald-300">✓ Déclaration complète.</p>;
  return (
    <div className="space-y-1 text-xs">
      {m.bloquants.length > 0 && <p className="text-rose-300">Obligatoire avant l&apos;envoi : {m.bloquants.join(", ")}.</p>}
      {m.conseilles.length > 0 && <p className="text-amber-200">Conseillé : {m.conseilles.join(", ")}.</p>}
    </div>
  );
}
