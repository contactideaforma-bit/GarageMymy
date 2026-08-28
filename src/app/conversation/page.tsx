"use client";

// ============================================================
//  CONVERSATION GARAGE ↔ SECRÉTAIRE (v10.7, migration v59)
//
//  Le garagiste et sa secrétaire partagent le MÊME compte : la bascule en
//  haut (« Qui écrit ? ») est mémorisée PAR APPAREIL — le poste de la
//  secrétaire reste sur Secrétaire, celui de l'atelier sur Garage.
//
//  Deux colonnes : le fil de messages (rattachables à un dossier) et la
//  liste de tâches — la MÊME liste que le bloc « À faire » du tableau de
//  bord (table ardoise). MY-MY souffle des astuces dans sa bulle.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, LigneArdoise, MessageConversation } from "@/lib/types";
import { estActif, formatDateTime, messageErreur } from "@/lib/format";
import {
  ajouterRappel,
  basculerRappel,
  chargerRappels,
  estAujourdhui,
  estEnRetard,
  libelleEcheance,
  localVersIso,
  supprimerRappel,
} from "@/lib/ardoise";
import {
  ASTUCES_MYMY,
  ROLES,
  RoleConversation,
  autreRole,
  chargerMessages,
  envoyerMessage,
  libelleRole,
  lireRole,
  marquerLus,
  memoriserRole,
} from "@/lib/conversation";
import DossierPicker, { libelleDossier } from "@/components/DossierPicker";
import ConfigBanner from "@/components/ConfigBanner";

const CLE_ASTUCE = "mea.conversation.astuce";

export default function ConversationPage() {
  const [role, setRole] = useState<RoleConversation>("garage");
  const [messages, setMessages] = useState<MessageConversation[]>([]);
  const [dispo, setDispo] = useState(true);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [taches, setTaches] = useState<LigneArdoise[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // Composer (message)
  const [texte, setTexte] = useState("");
  const [dossierLie, setDossierLie] = useState<Dossier | null>(null);
  const [pickerPour, setPickerPour] = useState<"message" | "tache" | null>(null);
  const [busy, setBusy] = useState(false);

  // Nouvelle tâche
  const [tacheTexte, setTacheTexte] = useState("");
  const [tachePour, setTachePour] = useState<"" | "garage" | "secretaire">("secretaire");
  const [tacheEcheance, setTacheEcheance] = useState("");
  const [tacheDossier, setTacheDossier] = useState<Dossier | null>(null);
  const [tacheBusy, setTacheBusy] = useState(false);
  const [voirFaites, setVoirFaites] = useState(false);

  // Bulle d'astuces MY-MY
  const [astuce, setAstuce] = useState<number | null>(0);

  const finFil = useRef<HTMLDivElement>(null);
  const defilerEnBas = useCallback((doux = true) => {
    finFil.current?.scrollIntoView({ behavior: doux ? "smooth" : "auto", block: "end" });
  }, []);

  /* ------------------------------ Chargement --------------------------- */

  const charger = useCallback(async (premier = false) => {
    const [{ messages: msgs, dispo: ok }, { lignes }, d] = await Promise.all([
      chargerMessages(),
      chargerRappels(),
      premier ? supabase.from("dossiers").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: null }),
    ]);
    setDispo(ok);
    setMessages(msgs);
    setTaches(lignes);
    if (premier && d.data) setDossiers((d.data as Dossier[]).filter((x) => estActif(x.statut)));
    setLoading(false);
  }, []);

  useEffect(() => {
    const r = lireRole();
    setRole(r);
    // Le destinataire par défaut d'une tâche : l'AUTRE.
    setTachePour(autreRole(r));
    try {
      const n = Number(localStorage.getItem(CLE_ASTUCE));
      setAstuce(Number.isFinite(n) && n >= 0 ? (n >= ASTUCES_MYMY.length ? null : n) : 0);
    } catch {
      setAstuce(0);
    }
    charger(true).then(() => {
      marquerLus(lireRole());
      setTimeout(() => defilerEnBas(false), 80);
    });
    // Rafraîchissement léger : toutes les 15 s + au retour sur l'onglet.
    const t = setInterval(() => charger(), 15000);
    const surVisible = () => {
      if (document.visibilityState === "visible") charger().then(() => marquerLus(lireRole()));
    };
    document.addEventListener("visibilitychange", surVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", surVisible);
    };
  }, [charger, defilerEnBas]);

  // Nouveaux messages → lu pour mon rôle + défilement en bas.
  const nbMessages = messages.length;
  useEffect(() => {
    if (nbMessages) {
      marquerLus(role);
      defilerEnBas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nbMessages]);

  const dossierParId = useMemo(() => {
    const m = new Map<string, Dossier>();
    for (const d of dossiers) m.set(d.id, d);
    return m;
  }, [dossiers]);

  /* ------------------------------- Actions ------------------------------ */

  function basculerRole(r: RoleConversation) {
    setRole(r);
    memoriserRole(r);
    setTachePour(autreRole(r));
    marquerLus(r);
  }

  async function envoyer() {
    const t = texte.trim();
    if (!t || busy) return;
    setBusy(true);
    setErreur(null);
    try {
      const m = await envoyerMessage({ auteur: role, texte: t, dossierId: dossierLie?.id || null });
      setMessages((prev) => [...prev, m]);
      setTexte("");
      setDossierLie(null);
      defilerEnBas();
    } catch (err) {
      setErreur(messageErreur(err, "Message non envoyé (migration v59 exécutée ?)."));
    }
    setBusy(false);
  }

  async function ajouterTache() {
    const t = tacheTexte.trim();
    if (!t || tacheBusy) return;
    setTacheBusy(true);
    setErreur(null);
    try {
      const ligne = await ajouterRappel({
        texte: t,
        dossierId: tacheDossier?.id || null,
        echeance: localVersIso(tacheEcheance),
        ordre: Math.min(0, ...taches.map((l) => l.ordre)) - 1,
        auteur: role,
        pour: tachePour || null,
      });
      setTaches((prev) => [ligne, ...prev]);
      setTacheTexte("");
      setTacheEcheance("");
      setTacheDossier(null);
    } catch (err) {
      setErreur(messageErreur(err, "Tâche non ajoutée."));
    }
    setTacheBusy(false);
  }

  async function cocherTache(ligne: LigneArdoise, fait: boolean) {
    setTaches((prev) => prev.map((x) => (x.id === ligne.id ? { ...x, fait } : x)));
    try {
      await basculerRappel(ligne, fait);
    } catch (err) {
      setTaches((prev) => prev.map((x) => (x.id === ligne.id ? { ...x, fait: !fait } : x)));
      setErreur(messageErreur(err, "Modification impossible."));
    }
  }

  async function supprimerTache(ligne: LigneArdoise) {
    if (!confirm(`Supprimer « ${ligne.texte.slice(0, 60)} » ?`)) return;
    setTaches((prev) => prev.filter((x) => x.id !== ligne.id));
    try {
      await supprimerRappel(ligne);
    } catch (err) {
      setErreur(messageErreur(err, "Suppression impossible."));
      charger();
    }
  }

  function astuceSuivante() {
    const suivant = (astuce ?? -1) + 1;
    const valeur = suivant >= ASTUCES_MYMY.length ? 0 : suivant;
    setAstuce(valeur);
    try {
      localStorage.setItem(CLE_ASTUCE, String(valeur));
    } catch {
      /* ignore */
    }
  }
  function fermerAstuce() {
    setAstuce(null);
    try {
      localStorage.setItem(CLE_ASTUCE, String(ASTUCES_MYMY.length));
    } catch {
      /* ignore */
    }
  }

  /* -------------------------------- Rendu ------------------------------- */

  const tachesAFaire = taches.filter((t) => !t.fait);
  const tachesFaites = taches.filter((t) => t.fait);

  const chipDossier = (id: string | null | undefined) => {
    if (!id) return null;
    const d = dossierParId.get(id);
    return (
      <Link
        href={`/sinistres/${id}`}
        className="inline-flex max-w-[13rem] items-center gap-1 truncate rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/20 hover:text-white"
        title={d ? libelleDossier(d) : "Ouvrir le dossier"}
      >
        📁 {d ? d.immatriculation || d.numero_sinistre || d.client_nom || "dossier" : "dossier"}
      </Link>
    );
  };

  return (
    <div>
      <ConfigBanner />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="titre-page">Conversation</h1>
          <p className="text-sm text-white/50">Le fil garage ↔ secrétaire, et la liste de tâches partagée avec « À faire ».</p>
        </div>
        {/* QUI ÉCRIT ? — même session pour tout le monde : on ruse avec une
            bascule mémorisée par appareil. */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/45">Qui écrit ?</span>
          <div className="segment">
            {ROLES.map((r) => (
              <button
                key={r.valeur}
                onClick={() => basculerRole(r.valeur)}
                className={`segment-btn ${role === r.valeur ? "actif" : ""}`}
                title="Mémorisé sur cet appareil"
              >
                {r.icone} {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulle d'astuces MY-MY */}
      {astuce != null && ASTUCES_MYMY[astuce] && (
        <div className="glass-soft mb-4 flex items-start gap-3 rounded-xl border-2 border-accent-pink/30 p-3 anim-apparition">
          <span className="mt-0.5 shrink-0 text-xl" aria-hidden>🎮</span>
          <div className="min-w-0 flex-1">
            <div className="font-pixel text-[0.55rem] text-accent-pink">MY-MY · ASTUCE</div>
            <p className="mt-1 text-sm text-white/75">{ASTUCES_MYMY[astuce]}</p>
            <button onClick={astuceSuivante} className="mt-1 text-xs text-accent-teal hover:underline">
              Astuce suivante →
            </button>
          </div>
          <button onClick={fermerAstuce} className="shrink-0 text-white/40 hover:text-white" title="Masquer les astuces">
            ×
          </button>
        </div>
      )}

      {!dispo && !loading && (
        <p className="badge badge-warn mb-4">La conversation n&apos;est pas encore activée : exécute la migration v59 dans Supabase.</p>
      )}
      {erreur && <p className="badge badge-danger mb-4">{erreur}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------ Fil ------------------------------ */}
        <section className="glass-card flex min-w-0 flex-col p-3 sm:p-4 lg:col-span-2">
          <h2 className="titre-bloc mb-2">Messages</h2>
          <div className="max-h-[52vh] min-h-[16rem] flex-1 space-y-3 overflow-y-auto pr-1">
            {loading && <p className="text-sm text-white/40">Chargement…</p>}
            {!loading && messages.length === 0 && (
              <p className="py-6 text-center text-sm text-white/40">
                Aucun message pour l&apos;instant. Écris le premier — par exemple le feu vert du chef d&apos;atelier
                pour envoyer un devis.
              </p>
            )}
            {messages.map((m) => {
              const moi = m.auteur === role;
              return (
                <div key={m.id} className={`flex ${moi ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 sm:max-w-[75%] ${
                      moi ? "rounded-br-md bg-accent-violet/30" : "rounded-bl-md bg-white/10"
                    }`}
                  >
                    <div className="mb-0.5 flex items-center gap-2 text-[11px] text-white/45">
                      <span className="font-semibold text-white/60">{m.auteur === "secretaire" ? "🗂️ Secrétaire" : "🔧 Garage"}</span>
                      <span>{formatDateTime(m.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-white/90">{m.texte}</p>
                    {m.dossier_id && <div className="mt-1.5">{chipDossier(m.dossier_id)}</div>}
                  </div>
                </div>
              );
            })}
            <div ref={finFil} />
          </div>

          {/* Composer */}
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="flex gap-2">
              <textarea
                className="field-input flex-1"
                rows={2}
                placeholder={`Écrire en tant que ${libelleRole(role)}… (Entrée = envoyer, Maj+Entrée = à la ligne)`}
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    envoyer();
                  }
                }}
              />
              <button onClick={envoyer} disabled={busy || !texte.trim()} className="btn-primary shrink-0 self-end">
                Envoyer
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <button onClick={() => setPickerPour("message")} className="btn-ghost btn-compact inline-flex items-center gap-1.5">
                🔍 {dossierLie ? dossierLie.immatriculation || dossierLie.numero_sinistre || "Dossier" : "Lier un dossier"}
              </button>
              {dossierLie && (
                <button onClick={() => setDossierLie(null)} className="text-white/40 hover:text-rose-300 hover:underline">
                  retirer
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ----------------------------- Tâches ----------------------------- */}
        <section className="glass-card min-w-0 p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="titre-bloc">
              Tâches
              {tachesAFaire.length > 0 && <span className="badge badge-warn ml-2">{tachesAFaire.length}</span>}
            </h2>
            <Link href="/" className="text-xs text-white/45 hover:text-white hover:underline" title="La même liste que le bloc « À faire »">
              = « À faire »
            </Link>
          </div>

          {/* Nouvelle tâche */}
          <div className="mb-3 space-y-2">
            <input
              className="field-input field-compact w-full"
              placeholder="Nouvelle tâche…"
              value={tacheTexte}
              onChange={(e) => setTacheTexte(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  ajouterTache();
                }
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="field-input field-compact w-auto"
                value={tachePour}
                onChange={(e) => setTachePour(e.target.value as "" | "garage" | "secretaire")}
              >
                <option value="secretaire">Pour la secrétaire</option>
                <option value="garage">Pour le garage</option>
                <option value="">Pour tout le monde</option>
              </select>
              <button onClick={() => setPickerPour("tache")} className="btn-ghost btn-compact" title="Lier à un dossier">
                🔍 {tacheDossier ? tacheDossier.immatriculation || tacheDossier.numero_sinistre || "Dossier" : "Dossier"}
              </button>
              <input
                type="datetime-local"
                className="field-input field-compact w-auto"
                value={tacheEcheance}
                onChange={(e) => setTacheEcheance(e.target.value)}
                title="Échéance (facultative) — crée un rendez-vous dans l'agenda"
              />
              <button onClick={ajouterTache} disabled={tacheBusy || !tacheTexte.trim()} className="btn-ghost btn-compact">
                Ajouter
              </button>
            </div>
          </div>

          {/* Liste (SEULE la case coche — clic texte = dossier) */}
          {tachesAFaire.length === 0 && !loading && (
            <p className="py-2 text-sm text-emerald-300/80">Rien en attente.</p>
          )}
          <ul className="max-h-[44vh] divide-y divide-white/10 overflow-y-auto pr-1">
            {tachesAFaire.map((ligne) => {
              const retard = estEnRetard(ligne.echeance);
              const auj = estAujourdhui(ligne.echeance);
              return (
                <li key={ligne.id} className="py-2 text-sm">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => cocherTache(ligne, true)}
                      className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block break-words text-white/85">{ligne.texte}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {ligne.pour && (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              ligne.pour === "secretaire" ? "bg-teal-100 text-teal-700" : "bg-violet-100 text-violet-700"
                            }`}
                          >
                            {ligne.pour === "secretaire" ? "Secrétaire" : "Garage"}
                          </span>
                        )}
                        {ligne.echeance && (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              retard ? "bg-rose-100 text-rose-700" : auj ? "bg-amber-100 text-amber-700" : "bg-white/10 text-white/70"
                            }`}
                          >
                            {retard ? "En retard · " : ""}
                            {libelleEcheance(ligne.echeance)}
                          </span>
                        )}
                        {chipDossier(ligne.dossier_id)}
                      </span>
                    </div>
                    <button onClick={() => supprimerTache(ligne)} className="shrink-0 text-white/30 hover:text-rose-300" title="Supprimer">
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {tachesFaites.length > 0 && (
            <div className="mt-2 border-t border-white/10 pt-2">
              <button onClick={() => setVoirFaites((v) => !v)} className="text-xs text-emerald-300/80 hover:underline">
                {voirFaites ? "Masquer" : "Voir"} les {tachesFaites.length} faite{tachesFaites.length > 1 ? "s" : ""}
              </button>
              {voirFaites && (
                <ul className="mt-1 max-h-[20vh] divide-y divide-white/5 overflow-y-auto pr-1 opacity-60">
                  {tachesFaites.map((ligne) => (
                    <li key={ligne.id} className="flex items-start gap-2.5 py-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked
                        onChange={() => cocherTache(ligne, false)}
                        className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
                        title="Décocher (remettre à faire)"
                      />
                      <span className="min-w-0 flex-1 break-words text-white/60 line-through">{ligne.texte}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="mt-2 text-[11px] text-white/35">
            Même liste que le bloc « À faire » du tableau de bord — cochée ici, cochée là-bas.
          </p>
        </section>
      </div>

      {pickerPour && (
        <DossierPicker
          dossiers={dossiers}
          titre={pickerPour === "message" ? "Lier le message à un dossier" : "Lier la tâche à un dossier"}
          onChoisir={(d) => {
            if (pickerPour === "message") setDossierLie(d);
            else setTacheDossier(d);
            setPickerPour(null);
          }}
          onFermer={() => setPickerPour(null)}
        />
      )}
    </div>
  );
}
