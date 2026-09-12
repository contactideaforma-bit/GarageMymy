"use client";

// ============================================================
//  MODE « RETARD DE PAIEMENT » ASSISTÉ (v12.7, migration v70)
//
//  Un dossier dont la facture n'est pas réglée passe en « retard de
//  paiement » d'un clic depuis l'en-tête de la fiche (comme le litige).
//  La finance remonte alors en haut de page et ce bloc guide le garage :
//    · LES FACTURES en retard, avec le solde dû et une estimation des
//      pénalités (indicative — voir lib/recouvrement.ts) ;
//    · L'ÉTAPE de la procédure (relance amiable → mise en demeure →
//      tentative amiable → injonction de payer → exécution), avec ce
//      qu'il faut faire et les textes de référence ;
//    · LES ACTIONS : relance par email, courrier de relance et mise en
//      demeure (texte proposé, MODIFIABLE, signé, PDF, envoi par email
//      ou en recommandé) ;
//    · LE JOURNAL DES CONTACTS : qui on a eu, quand, ce qui a été dit ;
//    · LES RAPPELS : programmés tout seuls après chaque action (table
//      `ardoise`, origine 'recouvrement:auto'), visibles dans « À faire ».
//  Sortir du retard CONSERVE tout (courriers, journal, tâches).
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CourrierRecouvrement, Document, Dossier, LigneArdoise, Paiement, Relance } from "@/lib/types";
import { formatDate, formatEuros, messageErreur, ymd } from "@/lib/format";
import { templateRelance } from "@/lib/paiements";
import {
  CANAUX_CONTACT,
  CibleCourrier,
  ETAPES_PROCEDURE,
  INTERLOCUTEURS,
  LIBELLE_TYPE_COURRIER,
  PERIODE_TAUX,
  cibleAssurance,
  cibleClient,
  cibleParDefaut,
  echeanceRappel,
  estimerPenalites,
  etapeProcedure,
  etapeSuivante,
  etatRecouvrement,
  modeleCourrier,
} from "@/lib/recouvrement";
import {
  ajouterRappel,
  basculerRappel,
  chargerRappels,
  estEnRetard,
  libelleEcheance,
  localVersIso,
  supprimerRappel,
} from "@/lib/ardoise";
import { lireRole } from "@/lib/conversation";
import {
  apercuCourrierRecouvrementPdf,
  courrierRecouvrementPdfBase64,
  documentPdfBase64Auto,
  nomFichierCourrier,
  nomFichierDocument,
} from "@/lib/pdf";
import ModalShell from "./ModalShell";
import SignaturePad from "./SignaturePad";
import ChampEcheance from "./ChampEcheance";
import EmailComposer from "./EmailComposer";

const ORIGINE_MANUELLE = "recouvrement";
const ORIGINE_AUTO = "recouvrement:auto";

type FactureRetard = Document & { paiements: Paiement[]; relances: Relance[] };

export default function RetardPaiementPanel({
  dossier,
  onPatch,
  onLever,
  onChanged,
}: {
  dossier: Dossier;
  onPatch: (patch: Partial<Dossier>) => void;
  /** Sort du mode retard de paiement (bouton de l'en-tête et d'ici : même action). */
  onLever: () => void;
  /** Quelque chose a changé (relance, paiement…) : la fiche recharge. */
  onChanged?: () => void;
}) {
  const [factures, setFactures] = useState<FactureRetard[]>([]);
  const [relances, setRelances] = useState<Relance[]>([]);
  const [courriers, setCourriers] = useState<CourrierRecouvrement[]>([]);
  const [taches, setTaches] = useState<LigneArdoise[]>([]);
  const [garage, setGarage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guideOuvert, setGuideOuvert] = useState(false);

  // Modales
  const [courrierModal, setCourrierModal] = useState<{ type: "relance" | "mise_en_demeure"; courrier?: CourrierRecouvrement } | null>(null);
  const [emailModal, setEmailModal] = useState<{
    to: string;
    subject: string;
    body: string;
    facture: FactureRetard | null;
    courrier?: CourrierRecouvrement;
    interlocuteur: "client" | "assurance";
  } | null>(null);

  // Journal des contacts — formulaire
  const [cDate, setCDate] = useState(ymd());
  const [cHeure, setCHeure] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, "0")}`;
  });
  const [cQui, setCQui] = useState("client");
  const [cCanal, setCCanal] = useState("telephone");
  const [cNotes, setCNotes] = useState("");
  const [cRappel, setCRappel] = useState("");

  // Tâche manuelle
  const [tTexte, setTTexte] = useState("");
  const [tEcheance, setTEcheance] = useState("");

  /* ------------------------------ Données ------------------------------ */

  const charger = useCallback(async () => {
    const [docs, pais, rels, cours, rap, ent] = await Promise.all([
      supabase.from("documents").select("*").eq("dossier_id", dossier.id).eq("type", "facture").order("created_at", { ascending: false }),
      supabase.from("paiements").select("*").eq("dossier_id", dossier.id),
      supabase.from("relances").select("*").eq("dossier_id", dossier.id).order("date_relance", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("courriers_recouvrement").select("*").eq("dossier_id", dossier.id).order("created_at", { ascending: false }),
      chargerRappels(dossier.id),
      supabase.from("entreprise").select("nom").limit(1).maybeSingle(),
    ]);
    const p = (pais.data as Paiement[]) || [];
    const r = (rels.data as Relance[]) || [];
    setFactures(
      ((docs.data as Document[]) || []).map((f) => ({
        ...f,
        paiements: p.filter((x) => x.document_id === f.id),
        relances: r.filter((x) => x.document_id === f.id),
      }))
    );
    setRelances(r);
    if (cours.error) {
      if (/relation|courriers_recouvrement|schema/i.test(cours.error.message || "")) {
        setErreur("Migration v70 à exécuter dans Supabase pour les courriers de recouvrement.");
      }
    } else setCourriers((cours.data as CourrierRecouvrement[]) || []);
    setTaches(rap.lignes.filter((l) => l.origine === ORIGINE_MANUELLE || l.origine === ORIGINE_AUTO));
    setGarage((ent.data as { nom?: string | null } | null)?.nom || null);
  }, [dossier.id]);

  useEffect(() => {
    charger();
  }, [charger]);

  const etats = useMemo(
    () =>
      factures
        .map((f) => ({ facture: f, etat: etatRecouvrement(f, f.paiements, f.relances) }))
        .filter((x) => x.etat.reste > 0.01),
    [factures]
  );
  const enRetard = etats.filter((x) => x.etat.retard > 0);
  const principale = (enRetard[0] || etats[0])?.facture || null;
  const totalDu = etats.reduce((s, x) => s + x.etat.reste, 0);
  const retardMax = etats.reduce((m, x) => Math.max(m, x.etat.retard), 0);
  const cible = cibleParDefaut(dossier);
  const penalites = estimerPenalites(totalDu, retardMax, cible.professionnel);
  const etape = etapeProcedure(dossier.retard_etape);
  const suivante = etapeSuivante(etape.code);
  const nbRelances = relances.length + courriers.filter((c) => c.statut === "envoye").length;

  /* ------------------------------ Rappels ------------------------------ */

  /** Programme un rappel automatique (remplace le précédent rappel auto non fait). */
  const programmerRappelAuto = useCallback(
    async (texte: string, jours: number) => {
      try {
        const anciens = taches.filter((t) => t.origine === ORIGINE_AUTO && !t.fait);
        await Promise.all(anciens.map((t) => supprimerRappel(t)));
        const ligne = await ajouterRappel({
          texte,
          dossierId: dossier.id,
          echeance: echeanceRappel(jours),
          ordre: -1,
          auteur: lireRole(),
          pour: null,
          origine: ORIGINE_AUTO,
        });
        setTaches((prev) => [ligne, ...prev.filter((t) => !anciens.some((a) => a.id === t.id))]);
        setInfo(`Rappel programmé : ${libelleEcheance(ligne.echeance, true)}.`);
        setTimeout(() => setInfo(null), 4000);
      } catch (err) {
        setErreur(messageErreur(err, "Rappel non programmé."));
      }
    },
    [dossier.id, taches]
  );

  async function ajouterTache() {
    const t = tTexte.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const ligne = await ajouterRappel({
        texte: t,
        dossierId: dossier.id,
        echeance: localVersIso(tEcheance),
        ordre: Math.min(0, ...taches.map((l) => l.ordre)) - 1,
        auteur: lireRole(),
        pour: null,
        origine: ORIGINE_MANUELLE,
      });
      setTaches((prev) => [ligne, ...prev]);
      setTTexte("");
      setTEcheance("");
    } catch (err) {
      setErreur(messageErreur(err, "Tâche non ajoutée."));
    }
    setBusy(false);
  }

  async function cocher(ligne: LigneArdoise, fait: boolean) {
    setTaches((prev) => prev.map((x) => (x.id === ligne.id ? { ...x, fait } : x)));
    try {
      await basculerRappel(ligne, fait);
    } catch (err) {
      setTaches((prev) => prev.map((x) => (x.id === ligne.id ? { ...x, fait: !fait } : x)));
      setErreur(messageErreur(err, "Modification impossible."));
    }
  }

  async function retirerTache(ligne: LigneArdoise) {
    setTaches((prev) => prev.filter((x) => x.id !== ligne.id));
    try {
      await supprimerRappel(ligne);
    } catch (err) {
      setErreur(messageErreur(err, "Suppression impossible."));
      charger();
    }
  }

  /* --------------------------- Journal des contacts --------------------- */

  async function journaliser(args: { canal: string; interlocuteur: string; notes: string; date?: string; heure?: string | null; documentId?: string | null }) {
    const base: Record<string, unknown> = {
      dossier_id: dossier.id,
      document_id: args.documentId ?? principale?.id ?? null,
      date_relance: args.date || ymd(),
      canal: args.canal,
      notes: args.notes,
    };
    const extras: Record<string, unknown> = { interlocuteur: args.interlocuteur };
    if (args.heure) extras.heure = args.heure;
    let res = await supabase.from("relances").insert({ ...base, ...extras });
    if (res.error && /column|colonne|schema/i.test(res.error.message || "")) {
      res = await supabase.from("relances").insert(base); // migration v70 pas encore passée
    }
    if (res.error) throw res.error;
  }

  async function enregistrerContact() {
    if (!cNotes.trim() || busy) return;
    setBusy(true);
    setErreur(null);
    try {
      await journaliser({ canal: cCanal, interlocuteur: cQui, notes: cNotes.trim(), date: cDate, heure: cHeure });
      setCNotes("");
      if (cRappel) {
        const ligne = await ajouterRappel({
          texte: `Rappeler ${libelleQui(cQui).toLowerCase()} — suite à l'échange du ${formatDate(cDate)}`,
          dossierId: dossier.id,
          echeance: localVersIso(cRappel),
          ordre: -1,
          auteur: lireRole(),
          pour: null,
          origine: ORIGINE_MANUELLE,
        });
        setTaches((prev) => [ligne, ...prev]);
        setCRappel("");
      }
      await charger();
      onChanged?.();
    } catch (err) {
      setErreur(messageErreur(err, "Contact non enregistré."));
    }
    setBusy(false);
  }

  /* ------------------------------ Étapes -------------------------------- */

  async function changerEtape(code: string) {
    const { error } = await supabase.from("dossiers").update({ retard_etape: code }).eq("id", dossier.id);
    if (error) {
      setErreur(messageErreur(error, "Étape non enregistrée (migration v70 exécutée ?)."));
      return;
    }
    onPatch({ retard_etape: code });
  }

  /* ------------------------------ Emails -------------------------------- */

  function ouvrirEmail(vers: "client" | "assurance") {
    const c = vers === "assurance" ? cibleAssurance(dossier) : cibleClient(dossier);
    const f = principale;
    const niveau = (f?.relances.length || 0) + 1;
    const t = f ? templateRelance(niveau, f, dossier, c.professionnel) : { subject: `Relance — dossier ${dossier.numero_sinistre || ""}`, body: "" };
    setEmailModal({ to: c.email || "", subject: t.subject, body: t.body, facture: f, interlocuteur: vers });
  }

  /* ------------------------------ Courriers ----------------------------- */

  async function supprimerCourrier(c: CourrierRecouvrement) {
    if (!confirm("Supprimer ce courrier ? (récupérable 30 jours dans l'historique)")) return;
    const { error } = await supabase.from("courriers_recouvrement").delete().eq("id", c.id);
    if (error) setErreur(messageErreur(error));
    else setCourriers((prev) => prev.filter((x) => x.id !== c.id));
  }

  async function marquerEnvoye(c: CourrierRecouvrement, canal: string) {
    const patch = { statut: "envoye" as const, envoye_le: new Date().toISOString(), canal_envoi: canal };
    const { error } = await supabase.from("courriers_recouvrement").update(patch).eq("id", c.id);
    if (error) {
      setErreur(messageErreur(error));
      return;
    }
    setCourriers((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
    const canalJournal = canal === "email" ? "email" : "courrier";
    try {
      await journaliser({
        canal: canalJournal,
        interlocuteur: c.destinataire,
        notes: `${LIBELLE_TYPE_COURRIER[c.type]} envoyé${canal === "lrar" ? "e en recommandé AR" : canal === "email" ? "e par email" : "e par courrier"}${c.montant ? ` — ${formatEuros(c.montant)}` : ""}`,
        documentId: c.document_id,
      });
    } catch {
      /* journal facultatif */
    }
    const jours = c.delai_jours || 8;
    await programmerRappelAuto(
      c.type === "mise_en_demeure"
        ? `Fin du délai de mise en demeure (${dossier.client_nom || dossier.numero_sinistre || "dossier"}) : vérifier le paiement, sinon passer à l'étape suivante`
        : `Vérifier le paiement après relance (${dossier.client_nom || dossier.numero_sinistre || "dossier"}) — relancer à nouveau si rien reçu`,
      jours
    );
    if (c.type === "mise_en_demeure" && etape.code === "amiable") await changerEtape("mise_en_demeure");
    charger();
    onChanged?.();
  }

  const courrierEnvoyeParEmail = (c: CourrierRecouvrement) => {
    const cibleC = c.destinataire === "assurance" ? cibleAssurance(dossier) : cibleClient(dossier);
    setEmailModal({
      to: cibleC.email || "",
      subject: c.objet || LIBELLE_TYPE_COURRIER[c.type],
      body: `Bonjour,\n\nVeuillez trouver ci-joint ${c.type === "mise_en_demeure" ? "une mise en demeure de payer" : "un courrier de relance"} concernant la facture ${principale?.numero || ""} (dossier ${dossier.numero_sinistre || ""}).\n\nCordialement.`,
      facture: principale,
      courrier: c,
      interlocuteur: c.destinataire,
    });
  };

  const factureDe = (c: CourrierRecouvrement) => factures.find((f) => f.id === c.document_id) || principale;

  /* -------------------------------- Rendu ------------------------------- */

  return (
    <section className="glass-card p-4" style={{ borderLeft: "8px solid #f59e0b" }}>
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-pixel text-[0.5rem] text-amber-300">⏰ RETARD DE PAIEMENT</span>
          {dossier.retard_depuis && <span className="text-xs text-white/45">depuis le {formatDate(dossier.retard_depuis)}</span>}
          {totalDu > 0 && <span className="badge badge-danger">{formatEuros(totalDu)} dus</span>}
          {retardMax > 0 && <span className="badge badge-warn">{retardMax} j de retard</span>}
          {info && <span className="text-xs text-emerald-300/80">{info}</span>}
        </div>
        <button onClick={onLever} className="btn-ghost btn-compact" title="Le paiement est arrivé (ou le retard est réglé) — tout reste enregistré">
          ✓ Réglé — sortir du retard
        </button>
      </div>

      {/* Factures */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="glass-soft p-3">
          <div className="titre-bloc text-white/70">Factures impayées</div>
          {etats.length === 0 ? (
            <p className="mt-1 text-sm text-emerald-300/80">Aucune facture avec un solde dû sur ce dossier.</p>
          ) : (
            <ul className="mt-1 divide-y divide-white/10">
              {etats.map(({ facture: f, etat }) => (
                <li key={f.id} className="py-1.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-semibold text-white">{f.numero || "Facture"}</span>
                    <span className="text-rose-200">{formatEuros(etat.reste)} dus</span>
                  </div>
                  <div className="text-[11px] text-white/50">
                    {f.date_echeance ? `Échéance ${formatDate(f.date_echeance)}` : "Sans échéance"}
                    {etat.retard > 0 ? ` · ${etat.retard} j de retard` : ""} · {f.relances.length} relance{f.relances.length > 1 ? "s" : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {totalDu > 0 && (
            <p className="mt-2 text-[11px] text-white/45">
              Débiteur présumé : <span className="text-white/80">{cible.nom}</span> ({cible.professionnel ? "professionnel" : "particulier"}).
              {retardMax > 0 && (
                <>
                  {" "}
                  Accessoires exigibles (estimation {PERIODE_TAUX}) : intérêts {formatEuros(penalites.interets)} à {penalites.taux} %
                  {penalites.indemnite ? ` + indemnité forfaitaire ${formatEuros(penalites.indemnite)}` : ""} ={" "}
                  <span className="text-white/80">{formatEuros(penalites.total)}</span>.
                </>
              )}
            </p>
          )}
        </div>

        {/* Étape de la procédure */}
        <div className="glass-soft p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="titre-bloc text-white/70">Où en est la procédure</div>
            <button onClick={() => setGuideOuvert((v) => !v)} className="text-xs text-accent-pink hover:underline">
              {guideOuvert ? "Masquer le guide" : "Guide complet"}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {ETAPES_PROCEDURE.map((e, i) => {
              const idx = ETAPES_PROCEDURE.findIndex((x) => x.code === etape.code);
              const actif = e.code === etape.code;
              const passe = i < idx;
              return (
                <button
                  key={e.code}
                  onClick={() => changerEtape(e.code)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    actif ? "bg-amber-100 text-amber-800" : passe ? "bg-emerald-100 text-emerald-700" : "bg-white/10 text-white/60 hover:bg-white/20"
                  }`}
                  title={e.quand}
                >
                  {i + 1}. {e.titre}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-white/85">{etape.comment}</p>
          <p className="mt-1 text-[11px] text-white/45">{etape.textes}</p>
          {suivante && (
            <button onClick={() => changerEtape(suivante.code)} className="btn-ghost btn-compact mt-2">
              Étape suivante → {suivante.titre}
            </button>
          )}
          {guideOuvert && (
            <div className="mt-3 space-y-2 border-t border-white/10 pt-2">
              {ETAPES_PROCEDURE.map((e, i) => (
                <div key={e.code} className="text-xs">
                  <div className="font-semibold text-white/85">
                    {i + 1}. {e.titre} <span className="font-normal text-white/45">— {e.quand}</span>
                  </div>
                  <div className="text-white/70">{e.comment}</div>
                  <div className="text-white/40">{e.textes}</div>
                </div>
              ))}
              <p className="text-[11px] text-amber-200/80">
                Repères juridiques indicatifs (droit français, septembre 2026). L&apos;appli n&apos;est ni avocat ni commissaire de justice : avant une
                action en justice, vérifiez les délais et faites-vous conseiller. Pensez à la prescription : 2 ans contre un particulier, 5 ans
                entre professionnels.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-white/45">Relancer :</span>
        <button onClick={() => ouvrirEmail("client")} className="btn-ghost btn-compact" disabled={!principale} title={dossier.client_email || "Pas d'email client"}>
          ✉ Email au client
        </button>
        <button onClick={() => ouvrirEmail("assurance")} className="btn-ghost btn-compact" disabled={!principale} title={dossier.assureur_email || "Pas d'email assurance"}>
          ✉ Email à l&apos;assurance
        </button>
        <button onClick={() => setCourrierModal({ type: "relance" })} className="btn-ghost btn-compact" disabled={!principale}>
          📄 Courrier de relance
        </button>
        <button onClick={() => setCourrierModal({ type: "mise_en_demeure" })} className="btn-primary btn-compact" disabled={!principale}>
          ⚖ Mise en demeure
        </button>
        <span className="text-[11px] text-white/40">
          {nbRelances} relance{nbRelances > 1 ? "s" : ""} au total
        </span>
      </div>

      {/* Courriers générés */}
      {courriers.length > 0 && (
        <div className="mt-3">
          <div className="titre-bloc text-white/70">Courriers</div>
          <ul className="mt-1 divide-y divide-white/10">
            {courriers.map((c) => (
              <li key={c.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-white">{LIBELLE_TYPE_COURRIER[c.type]}</span>
                  <span className="text-white/50">→ {c.destinataire_nom || c.destinataire}</span>
                  <span className="text-white/40">· {formatDate(c.date_courrier)}</span>
                  <span
                    className={
                      c.statut === "envoye" ? "badge badge-ok" : c.statut === "signe" ? "badge badge-info" : "badge badge-neutral"
                    }
                  >
                    {c.statut === "envoye"
                      ? `Envoyé${c.canal_envoi === "lrar" ? " (recommandé AR)" : c.canal_envoi === "email" ? " par email" : ""}`
                      : c.statut === "signe"
                        ? "Signé"
                        : "Brouillon"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <button onClick={() => apercuCourrierRecouvrementPdf(c, dossier, factureDe(c)?.numero)} className="btn-ghost btn-compact">
                    PDF
                  </button>
                  {c.statut !== "envoye" && (
                    <button onClick={() => setCourrierModal({ type: c.type, courrier: c })} className="btn-ghost btn-compact">
                      Modifier / signer
                    </button>
                  )}
                  {c.statut !== "envoye" && (
                    <>
                      <button onClick={() => courrierEnvoyeParEmail(c)} className="btn-ghost btn-compact">
                        Envoyer par email
                      </button>
                      <button onClick={() => marquerEnvoye(c, "lrar")} className="btn-ghost btn-compact" title="Vous l'avez imprimé et posté en recommandé AR">
                        Posté en recommandé
                      </button>
                      <button onClick={() => marquerEnvoye(c, "courrier")} className="btn-ghost btn-compact" title="Posté en courrier simple ou remis en main propre">
                        Posté / remis
                      </button>
                    </>
                  )}
                  <button onClick={() => supprimerCourrier(c)} className="text-xs text-white/30 hover:text-rose-300">
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Journal des contacts + rappels */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="glass-soft p-3">
          <div className="titre-bloc text-white/70">Journal des appels et échanges</div>
          <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
            <div>
              <label className="field-label text-[11px]">Date</label>
              <input type="date" className="field-input field-compact" value={cDate} onChange={(e) => setCDate(e.target.value)} />
            </div>
            <div>
              <label className="field-label text-[11px]">Heure</label>
              <input type="time" className="field-input field-compact" value={cHeure} onChange={(e) => setCHeure(e.target.value)} />
            </div>
            <div>
              <label className="field-label text-[11px]">Qui</label>
              <select className="field-input field-compact" value={cQui} onChange={(e) => setCQui(e.target.value)}>
                {INTERLOCUTEURS.map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label text-[11px]">Par</label>
              <select className="field-input field-compact" value={cCanal} onChange={(e) => setCCanal(e.target.value)}>
                {CANAUX_CONTACT.map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <textarea
            className="field-input mt-2 w-full"
            rows={2}
            placeholder="Ce qui a été dit : « promet un virement vendredi », « attend le rapport définitif »…"
            value={cNotes}
            onChange={(e) => setCNotes(e.target.value)}
          />
          <div className="mt-1.5 flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="field-label text-[11px]">Me le rappeler (facultatif)</label>
              <ChampEcheance valeur={cRappel} onChange={setCRappel} />
            </div>
            <button onClick={enregistrerContact} disabled={busy || !cNotes.trim()} className="btn-primary btn-compact shrink-0">
              Enregistrer
            </button>
          </div>
          {relances.length > 0 && (
            <ul className="mt-2 max-h-56 divide-y divide-white/10 overflow-y-auto">
              {relances.map((r) => (
                <li key={r.id} className="py-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5 text-white/50">
                    <span className="font-semibold text-white/80">{formatDate(r.date_relance)}</span>
                    {r.heure && <span>{r.heure}</span>}
                    {r.interlocuteur && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70">{libelleQui(r.interlocuteur)}</span>}
                    <span>{CANAUX_CONTACT.find((c) => c.code === r.canal)?.label || r.canal}</span>
                  </div>
                  {r.notes && <div className="mt-0.5 break-words text-white/80">{r.notes}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-soft p-3">
          <div className="titre-bloc text-white/70">Rappels de relance</div>
          <p className="mt-1 text-[11px] text-white/45">
            Un rappel est programmé tout seul après chaque envoi (J+8). Vous pouvez en ajouter — ils apparaissent dans « À faire » et la Conversation.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              className="field-input field-compact flex-1"
              placeholder="Rappel… (ex. rappeler l'assurance)"
              value={tTexte}
              onChange={(e) => setTTexte(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  ajouterTache();
                }
              }}
            />
            <button onClick={ajouterTache} disabled={busy || !tTexte.trim()} className="btn-ghost btn-compact shrink-0">
              Ajouter
            </button>
          </div>
          <div className="mt-1.5">
            <ChampEcheance valeur={tEcheance} onChange={setTEcheance} />
          </div>
          {taches.filter((t) => !t.fait).length > 0 && (
            <ul className="mt-2 divide-y divide-white/10">
              {taches
                .filter((t) => !t.fait)
                .map((ligne) => {
                  const retard = estEnRetard(ligne.echeance);
                  return (
                    <li key={ligne.id} className="flex min-w-0 items-start gap-2.5 py-2 text-sm">
                      <input type="checkbox" checked={false} onChange={() => cocher(ligne, true)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <span className="block break-words text-white/85">{ligne.texte}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {ligne.origine === ORIGINE_AUTO && (
                            <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Auto</span>
                          )}
                          {ligne.echeance && (
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${retard ? "bg-rose-100 text-rose-700" : "bg-white/10 text-white/70"}`}>
                              {retard ? "En retard · " : ""}
                              {libelleEcheance(ligne.echeance)}
                            </span>
                          )}
                        </span>
                      </div>
                      <button onClick={() => retirerTache(ligne)} className="shrink-0 text-white/30 hover:text-rose-300" title="Supprimer">
                        ×
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </div>

      {erreur && (
        <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">{erreur}</div>
      )}

      {/* Modale courrier */}
      {courrierModal && principale && (
        <CourrierModal
          type={courrierModal.type}
          existant={courrierModal.courrier}
          dossier={dossier}
          facture={factureDe(courrierModal.courrier || ({ document_id: principale.id } as CourrierRecouvrement)) || principale}
          reste={etats.find((x) => x.facture.id === (courrierModal.courrier?.document_id || principale.id))?.etat.reste ?? totalDu}
          niveau={nbRelances + 1}
          garage={garage}
          onClose={() => setCourrierModal(null)}
          onSaved={(c, action) => {
            setCourriers((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]));
            setCourrierModal(null);
            if (action === "email") courrierEnvoyeParEmail(c);
            else if (action === "lrar") marquerEnvoye(c, "lrar");
          }}
        />
      )}

      {/* Modale email (relance directe ou courrier en pièce jointe) */}
      {emailModal && (
        <EmailComposer
          dossier={dossier}
          document={emailModal.facture}
          defaultTo={emailModal.to}
          defaultSubject={emailModal.subject}
          defaultBody={emailModal.body}
          piecesJointes={
            emailModal.courrier
              ? [
                  {
                    label: LIBELLE_TYPE_COURRIER[emailModal.courrier.type],
                    filename: nomFichierCourrier(emailModal.courrier, emailModal.facture?.numero),
                    getBase64: () => courrierRecouvrementPdfBase64(emailModal.courrier!, dossier),
                    coche: true,
                  },
                ]
              : emailModal.facture
                ? [
                    {
                      label: nomFichierDocument(emailModal.facture).replace(/\.pdf$/, ""),
                      filename: nomFichierDocument(emailModal.facture),
                      getBase64: () => documentPdfBase64Auto(emailModal.facture!, dossier),
                      coche: false,
                    },
                  ]
                : undefined
          }
          onClose={() => setEmailModal(null)}
          onSent={async () => {
            const m = emailModal;
            setEmailModal(null);
            if (m.courrier) {
              await marquerEnvoye(m.courrier, "email");
              return;
            }
            try {
              await journaliser({ canal: "email", interlocuteur: m.interlocuteur, notes: `Relance envoyée par email — ${m.subject}`, documentId: m.facture?.id });
            } catch (err) {
              setErreur(messageErreur(err, "Email envoyé mais relance non journalisée."));
            }
            await programmerRappelAuto(
              `Vérifier le paiement après relance email (${dossier.client_nom || dossier.numero_sinistre || "dossier"}) — relancer à nouveau si rien reçu`,
              8
            );
            charger();
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}

function libelleQui(code: string): string {
  return INTERLOCUTEURS.find((i) => i.code === code)?.label || code;
}

/* ====================================================================
   Modale « courrier » : texte proposé par l'appli, modifiable, signature
   au doigt (facultative : sinon le tampon et la signature du profil du
   garage sont apposés), puis PDF / email / recommandé.
==================================================================== */

function CourrierModal({
  type,
  existant,
  dossier,
  facture,
  reste,
  niveau,
  garage,
  onClose,
  onSaved,
}: {
  type: "relance" | "mise_en_demeure";
  existant?: CourrierRecouvrement;
  dossier: Dossier;
  facture: Document;
  reste: number;
  niveau: number;
  garage: string | null;
  onClose: () => void;
  onSaved: (c: CourrierRecouvrement, action: "brouillon" | "signe" | "email" | "lrar") => void;
}) {
  const initialCible: CibleCourrier =
    existant?.destinataire === "assurance" ? cibleAssurance(dossier) : existant?.destinataire === "client" ? cibleClient(dossier) : cibleParDefaut(dossier);
  const [vers, setVers] = useState<"client" | "assurance">(initialCible.type);
  const [nom, setNom] = useState(existant?.destinataire_nom || initialCible.nom);
  const [adresse, setAdresse] = useState(existant?.destinataire_adresse || initialCible.adresse);
  const [date, setDate] = useState(existant?.date_courrier || ymd());
  const modele = useMemo(
    () => modeleCourrier({ type, facture, dossier, cible: vers === "assurance" ? cibleAssurance(dossier) : cibleClient(dossier), reste, niveau, garage }),
    [type, facture, dossier, vers, reste, niveau, garage]
  );
  const [objet, setObjet] = useState(existant?.objet || modele.objet);
  const [corps, setCorps] = useState(existant?.corps || modele.corps);
  const [signataire, setSignataire] = useState(existant?.signataire_nom || garage || "");
  const [signature, setSignature] = useState<string | null>(existant?.signature || null);
  const [signer, setSigner] = useState(Boolean(existant?.signature));
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function changerCible(v: "client" | "assurance") {
    setVers(v);
    const c = v === "assurance" ? cibleAssurance(dossier) : cibleClient(dossier);
    setNom(c.nom);
    setAdresse(c.adresse);
    const m = modeleCourrier({ type, facture, dossier, cible: c, reste, niveau, garage });
    setObjet(m.objet);
    setCorps(m.corps);
  }

  function brouillon(): CourrierRecouvrement {
    const signe = signer && signature;
    return {
      id: existant?.id || "",
      created_at: existant?.created_at || new Date().toISOString(),
      dossier_id: dossier.id,
      document_id: facture.id,
      type,
      destinataire: vers,
      destinataire_nom: nom.trim() || null,
      destinataire_adresse: adresse.trim() || null,
      objet: objet.trim() || null,
      corps: corps.trim() || null,
      montant: reste,
      delai_jours: modele.delaiJours,
      date_courrier: date || ymd(),
      signataire_nom: signataire.trim() || null,
      signature: signe ? signature : null,
      signe_le: signe ? existant?.signe_le || new Date().toISOString() : null,
      envoye_le: existant?.envoye_le || null,
      canal_envoi: existant?.canal_envoi || null,
      statut: existant?.statut === "envoye" ? "envoye" : signe ? "signe" : "brouillon",
      notes: existant?.notes || null,
    };
  }

  async function enregistrer(action: "brouillon" | "signe" | "email" | "lrar") {
    setBusy(action);
    setErreur(null);
    const c = brouillon();
    if (signer && !signature) {
      setErreur("Signez dans le cadre (ou décochez la signature au doigt pour utiliser le tampon et la signature du profil).");
      setBusy(null);
      return;
    }
    const { id, created_at, ...donnees } = c;
    void created_at;
    const res = id
      ? await supabase.from("courriers_recouvrement").update(donnees).eq("id", id).select("*").single()
      : await supabase.from("courriers_recouvrement").insert(donnees).select("*").single();
    if (res.error || !res.data) {
      setErreur(messageErreur(res.error, "Enregistrement impossible (migration v70 exécutée ?)."));
      setBusy(null);
      return;
    }
    setBusy(null);
    onSaved(res.data as CourrierRecouvrement, action);
  }

  return (
    <ModalShell title={LIBELLE_TYPE_COURRIER[type]} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="field-label text-[11px]">Destinataire</label>
            <div className="segment">
              <button type="button" onClick={() => changerCible("client")} className={`segment-btn ${vers === "client" ? "actif" : ""}`}>
                Client
              </button>
              <button type="button" onClick={() => changerCible("assurance")} className={`segment-btn ${vers === "assurance" ? "actif" : ""}`}>
                Assurance
              </button>
            </div>
          </div>
          <div>
            <label className="field-label text-[11px]">Date du courrier</label>
            <input type="date" className="field-input field-compact" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="text-[11px] text-white/45">
            Facture {facture.numero || "—"} · {formatEuros(reste)} dus
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="field-label text-[11px]">Nom du destinataire</label>
            <input className="field-input field-compact w-full" value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div>
            <label className="field-label text-[11px]">Adresse postale</label>
            <textarea className="field-input field-compact w-full" rows={2} value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Rue, code postal, ville" />
          </div>
        </div>
        <div>
          <label className="field-label text-[11px]">Objet</label>
          <input className="field-input field-compact w-full" value={objet} onChange={(e) => setObjet(e.target.value)} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="field-label text-[11px]">Texte du courrier (modifiable)</label>
            <button
              type="button"
              onClick={() => {
                setObjet(modele.objet);
                setCorps(modele.corps);
              }}
              className="text-[11px] text-accent-pink hover:underline"
            >
              ↺ Reprendre le texte proposé
            </button>
          </div>
          <textarea className="field-input w-full font-mono text-[13px]" rows={14} value={corps} onChange={(e) => setCorps(e.target.value)} />
          {type === "mise_en_demeure" && (
            <p className="mt-1 text-[11px] text-amber-200/80">
              À envoyer en recommandé avec accusé de réception : c&apos;est la preuve exigée ensuite (injonction de payer, commissaire de justice). Délai de 8
              jours à réception.
            </p>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="field-label text-[11px]">Signataire</label>
            <input className="field-input field-compact w-full" value={signataire} onChange={(e) => setSignataire(e.target.value)} placeholder="Nom du signataire" />
            <label className="mt-2 flex items-center gap-2 text-xs text-white/70">
              <input type="checkbox" checked={signer} onChange={(e) => setSigner(e.target.checked)} className="h-4 w-4 accent-pink-500" />
              Signer au doigt (sinon : tampon et signature enregistrés dans le profil)
            </label>
          </div>
          {signer && (
            <div>
              <label className="field-label text-[11px]">Signature</label>
              <SignaturePad onChange={setSignature} />
            </div>
          )}
        </div>
        {erreur && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">{erreur}</div>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" onClick={() => apercuCourrierRecouvrementPdf(brouillon(), dossier, facture.numero)} className="btn-ghost btn-compact">
            Aperçu PDF
          </button>
          <button type="button" onClick={() => enregistrer("brouillon")} disabled={busy !== null} className="btn-ghost btn-compact">
            Enregistrer
          </button>
          <button type="button" onClick={() => enregistrer("email")} disabled={busy !== null} className="btn-ghost btn-compact">
            Enregistrer et envoyer par email
          </button>
          <button type="button" onClick={() => enregistrer("lrar")} disabled={busy !== null} className="btn-primary btn-compact" title="Le courrier est signé ; vous l'imprimez et le postez en recommandé AR">
            Signé — à poster en recommandé
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
