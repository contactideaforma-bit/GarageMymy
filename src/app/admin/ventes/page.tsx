"use client";

// VENTES DÉCLARÉES (v10.0) — ce que les commerciaux envoient depuis /vente.
// L'éditeur : lit la fiche, télécharge le contrat signé, VALIDE (crée
// l'abonnement rattaché au commercial → primes calculées par les relevés),
// crée le compte du garage (ou le commercial l'a déjà fait, v13.31), et suit la
// fidélisation (mensualités encaissées) dans le temps.

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell, { ChampAdmin, dateFr, euros } from "@/components/admin/AdminShell";
import ModalShell from "@/components/ModalShell";
import BoutonRenvoiBienvenue from "@/components/admin/BoutonRenvoiBienvenue";
import {
  Abonnement, Collaborateur, DemandeRappel, Mensualite, ResultatCompteGarage, STATUTS_VENTE, Vente, activerInscription, creerCompteGarage, lireParametres, lireTable, nomCollab, supprimerLigne, upsertLigne, validerVente,
} from "@/lib/admin/client";
import { libelleCreneau, libelleSource } from "@/lib/inscription";
import { PARAMETRES_DEFAUT, Parametres, primeVente } from "@/lib/admin/economie";
import { MODES_PAIEMENT, VenteContrat } from "@/lib/admin/contratGarage";

/** v13.57 — mensualité moyenne sur 12 mois quand la remise exceptionnelle est limitée dans le temps (base de la prime). */
function mensualiteMoyenneVente(v: { prix_mensuel_ht: number; prix_plein_ht?: number | null; remise_supp_pct?: number | null; remise_supp_mois?: number | null }): number {
  const mois = Number(v.remise_supp_pct) > 0 ? Math.min(12, Number(v.remise_supp_mois) || 0) : 0;
  if (!mois) return v.prix_mensuel_ht;
  const plein = Number(v.prix_plein_ht ?? v.prix_mensuel_ht) || 0;
  return Math.round(((v.prix_mensuel_ht * mois + plein * (12 - mois)) / 12) * 100) / 100;
}
import { telechargerContratPdf } from "@/lib/admin/contratPdf";
import { QUESTIONS_BESOINS } from "@/lib/admin/ventePublic";
import Ico from "@/components/Ico";

type Filtre = "a_traiter" | "suivi" | "toutes";

export default function VentesPage() {
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [collabs, setCollabs] = useState<Collaborateur[]>([]);
  const [abos, setAbos] = useState<Abonnement[]>([]);
  const [mens, setMens] = useState<Mensualite[]>([]);
  const [rappels, setRappels] = useState<DemandeRappel[]>([]);
  const [p, setP] = useState<Parametres>(PARAMETRES_DEFAUT);
  const [filtre, setFiltre] = useState<Filtre>("a_traiter");
  const [ouverte, setOuverte] = useState<Vente | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const [v, c, a, m, params] = await Promise.all([
        lireTable<Vente>("ventes"), lireTable<Collaborateur>("collaborateurs"), lireTable<Abonnement>("abonnements"), lireTable<Mensualite>("abonnement_mensualites"), lireParametres(),
      ]);
      setVentes(v); setCollabs(c); setAbos(a); setMens(m); setP(params);
      // v13.41 — demandes de rappel (migration v98 ; silencieux si absente).
      try { setRappels(await lireTable<DemandeRappel>("demandes_rappel")); } catch { setRappels([]); }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Lecture impossible (migration v55 exécutée ?).");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  // FIDÉLISATION dérivée de l'abonnement : mensualités encaissées / résiliation.
  const suivi = useMemo(() => {
    const m = new Map<string, { payees: number; abo: Abonnement | undefined; etat: "fidelisee" | "perdue" | "en_cours" | null }>();
    for (const v of ventes) {
      const abo = abos.find((a) => a.id === v.abonnement_id);
      if (!abo) { m.set(v.id, { payees: 0, abo: undefined, etat: null }); continue; }
      const payees = mens.filter((x) => x.abonnement_id === abo.id && x.payee_le).length;
      const etat = abo.statut === "resilie" ? "perdue" : payees >= p.mensualitesReprise ? "fidelisee" : "en_cours";
      m.set(v.id, { payees, abo, etat });
    }
    return m;
  }, [ventes, abos, mens, p]);

  const liste = ventes.filter((v) =>
    filtre === "toutes" ? true : filtre === "a_traiter" ? v.statut === "declaree" || v.statut === "validee" : v.statut !== "declaree" && v.statut !== "refusee"
  );

  async function changerStatut(v: Vente, statut: Vente["statut"]) {
    try {
      await upsertLigne<Vente>("ventes", { id: v.id, statut });
      setMessage(`Vente ${v.numero || ""} → ${STATUTS_VENTE[statut].label}.`);
      charger();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Modification impossible."); }
  }
  async function supprimer(v: Vente) {
    if (!confirm(`Supprimer la vente ${v.numero || ""} (${v.garage_nom}) ?`)) return;
    await supprimerLigne("ventes", v.id);
    charger();
  }

  const nbATraiter = ventes.filter((v) => v.statut === "declaree").length;
  const rappelsOuverts = rappels.filter((r) => !r.traite_le);

  // v13.41 — inscription en ligne : virement constaté / activation (abonnement + compte + bienvenue).
  async function activer(v: Vente) {
    const ref = v.paiement_confirme_le ? "" : window.prompt(`Confirmer le paiement reçu pour ${v.garage_nom} (référence du virement, facultatif) ?\nL'abonnement et le compte du garage seront créés et l'email de bienvenue envoyé.`, "");
    if (ref === null) return;
    try {
      const r = await activerInscription(v.id, ref || "");
      setMessage(r.compte ? (r.emailEnvoye ? "Inscription activée : compte créé, email de bienvenue envoyé." : "Inscription activée : compte créé, mais l'email de bienvenue n'est pas parti (renvoyer depuis la fiche).") : "Inscription activée (compte déjà existant).");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Activation impossible.");
    }
    charger();
  }
  async function rappelFait(r: DemandeRappel) {
    await upsertLigne<DemandeRappel>("demandes_rappel", { id: r.id, traite_le: new Date().toISOString() });
    charger();
  }

  return (
    <AdminShell
      titre="Ventes déclarées"
      actions={
        <div className="segment">
          {(["a_traiter", "suivi", "toutes"] as Filtre[]).map((f) => (
            <button key={f} className={`segment-btn ${filtre === f ? "actif" : ""}`} onClick={() => setFiltre(f)}>
              {f === "a_traiter" ? `À traiter${nbATraiter ? ` (${nbATraiter})` : ""}` : f === "suivi" ? "Suivi de fidélisation" : "Toutes"}
            </button>
          ))}
        </div>
      }
    >
      {message && <p className="text-xs text-white/60">{message}</p>}
      <p className="text-xs text-white/45">
        Les commerciaux déclarent leurs ventes sur <b className="text-white/70">myeasyauto.fr/vente</b> avec leur code apporteur (fiche Collaborateurs).
        Valider une vente crée l&apos;abonnement (onglet Abonnements) ; les primes suivent le pointage des mensualités encaissées.
        Les garages peuvent aussi <b className="text-white/70">s&apos;inscrire seuls</b> sur <b className="text-white/70">myeasyauto.fr/inscription</b> : contrat signé en ligne, paiement Stripe (prélèvement mensuel) ou lien Qonto / virement (année) — l&apos;activation est automatique dès le paiement confirmé.
      </p>

      {rappelsOuverts.length > 0 && (
        <div className="glass-card p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white"><Ico n="phone" /> Demandes de rappel ({rappelsOuverts.length})</h2>
            <span className="text-xs text-white/40">depuis le parcours d&apos;inscription en ligne</span>
          </div>
          <div className="mt-2 space-y-2">
            {rappelsOuverts.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold text-white">{r.garage_nom || r.contact_nom || r.tel} <span className="font-normal text-white/50">· {dateFr(r.created_at)}</span></div>
                  <div className="text-xs text-white/70">
                    {r.contact_nom ? `${r.contact_nom} · ` : ""}<a className="text-accent-teal hover:underline" href={`tel:${r.tel}`}>{r.tel}</a>{r.email ? ` · ${r.email}` : ""} · {libelleCreneau(r.creneau)}
                    {r.etape ? ` · étape « ${r.etape} »` : ""}{r.formule_conseillee ? ` · formule conseillée : ${p.formules[r.formule_conseillee as Vente["formule"]]?.libelle || r.formule_conseillee}` : ""}{r.source_connaissance ? ` · connu par : ${libelleSource(r.source_connaissance)}` : ""}
                  </div>
                  {r.message && <div className="mt-0.5 text-xs text-white/60">« {r.message} »</div>}
                </div>
                <button className="text-emerald-300 hover:underline" onClick={() => rappelFait(r)}>Rappel fait <Ico n="check" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-white/40">Chargement…</p>
      ) : liste.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/50">Aucune vente dans cette vue.</div>
      ) : (
        <div className="space-y-2">
          {liste.map((v) => {
            const st = STATUTS_VENTE[v.statut] || STATUTS_VENTE.declaree;
            const s = suivi.get(v.id);
            const commercial = collabs.find((c) => c.id === v.collaborateur_id);
            const prime = primeVente(v.formule, { engagement12: v.engagement_12, periodicite: v.periodicite, mensualiteFacturee: v.montant_annuel_ht != null ? v.montant_annuel_ht / 12 : mensualiteMoyenneVente(v), lancementPct: v.lancement_pct, lancementMois: v.lancement_mois }, p);
            return (
              <div key={v.id} className="glass-card p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={st.badge}>{st.label}</span>
                      {v.origine === "en_ligne" && <span className="badge badge-info"><Ico n="globe" /> En ligne</span>}
                      {s?.etat === "fidelisee" && v.statut !== "fidelisee" && <span className="badge badge-ok">Fidélisée ({s.payees} mens.)</span>}
                      {s?.etat === "perdue" && v.statut !== "perdue" && <span className="badge badge-danger">Résiliée</span>}
                      {s?.etat === "en_cours" && <span className="badge badge-neutral">{s.payees}/{p.mensualitesReprise} mensualités encaissées</span>}
                      <span className="font-semibold text-white">{v.garage_nom}</span>
                      <span className="text-xs text-white/40">{v.numero} · {dateFr(v.created_at)}</span>
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      {p.formules[v.formule].libelle} · {v.periodicite === "annuel" ? `année en une fois ${euros(v.montant_annuel_ht)} HT` : `${euros(v.prix_mensuel_ht)} HT / mois`}
                      {v.engagement_12 ? " · engagement 12 mois" : " · sans engagement"}
                      {Number(v.remise_supp_pct) > 0 && <span className="text-amber-300"> · remise supp. {v.remise_supp_pct} % {Number(v.remise_supp_mois) > 0 ? `pendant ${v.remise_supp_mois} mois` : "définitive"} à valider</span>}
                      {" · "}{MODES_PAIEMENT[v.mode_paiement] || v.mode_paiement}
                      {v.paiement_sur_place && <span className="text-emerald-300"> · reçu sur place {euros(v.paiement_montant)} (réf. {v.paiement_reference || "—"})</span>}
                      {v.paiement_demande && !v.paiement_confirme_le && <span className="text-amber-300"> · {v.paiement_demande} demandé au garage</span>}
                      {v.paiement_confirme_le && <span className={v.paiement_valide_le ? "text-emerald-300" : "text-amber-300"}> · paiement confirmé{v.origine === "en_ligne" ? (v.paiement_en_ligne_mode === "stripe" ? " (prélèvement Stripe)" : v.paiement_en_ligne_mode === "qonto" ? " (lien de paiement)" : " (virement)") : " par le commercial"}{v.paiement_valide_le ? " vérifié" : " — À VÉRIFIER"}</span>}
                      {v.origine === "en_ligne" && !v.paiement_confirme_le && <span className="text-amber-300"> · en attente du paiement ({v.paiement_en_ligne_mode === "stripe" ? "prélèvement Stripe" : v.paiement_en_ligne_mode === "qonto" ? "lien de paiement" : "virement"})</span>}
                      {v.origine === "en_ligne" && v.activee_le && <span className="text-emerald-300"> · activée automatiquement le {dateFr(v.activee_le)}</span>}
                      {v.compte_cree_par && <span className="text-accent-teal"> · compte créé {v.compte_cree_par === "commercial" ? "par le commercial" : "par l'éditeur"}{v.compte_cree_le ? ` le ${dateFr(v.compte_cree_le)}` : ""}</span>}
                    </div>
                    <div className="mt-1 text-xs text-white/50">
                      {v.origine === "en_ligne"
                        ? <>Inscription en ligne · connu par : {libelleSource(v.source_connaissance)}{v.source_detail ? ` (${v.source_detail})` : ""}{v.formule_conseillee ? ` · formule conseillée : ${p.formules[v.formule_conseillee as Vente["formule"]]?.libelle || v.formule_conseillee}${v.formule_conseillee === v.formule ? "" : " (autre choix)"}` : ""}{commercial ? ` · apporteur ${nomCollab(commercial)} (code ${v.code_apporteur}) · prime ${euros(prime.total)}` : ""}</>
                        : <>Commercial : {nomCollab(commercial)} (code {v.code_apporteur}) · prime {euros(prime.total)} à la {prime.mensualiteEcheance}<sup>e</sup> mensualité</>}
                      {" · "}contact {v.contact_nom || "—"} {v.contact_tel || ""} {v.contact_email}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    <button className="text-accent-teal hover:underline" onClick={() => setOuverte(v)}>Ouvrir</button>
                    {v.origine === "en_ligne" && !v.activee_le && v.statut !== "refusee" && (
                      <button className="text-emerald-300 hover:underline" onClick={() => activer(v)}>{v.paiement_confirme_le ? "Activer (abonnement + compte)" : "Virement reçu → activer"}</button>
                    )}
                    {v.paiement_confirme_le && !v.paiement_valide_le && (
                      <button className="text-emerald-300 hover:underline" onClick={async () => { await upsertLigne<Vente>("ventes", { id: v.id, paiement_valide_le: new Date().toISOString() }); charger(); }}>Paiement vérifié <Ico n="check" /></button>
                    )}
                    {v.statut === "declaree" && <button className="text-white/40 hover:text-rose-300" onClick={() => changerStatut(v, "refusee")}>Refuser</button>}
                    {v.statut === "validee" && <button className="text-accent-pink hover:underline" onClick={() => changerStatut(v, "compte_cree")}>Compte créé <Ico n="check" /></button>}
                    {(v.statut === "compte_cree" || v.statut === "validee") && s?.etat === "fidelisee" && <button className="text-emerald-300 hover:underline" onClick={() => changerStatut(v, "fidelisee")}>Marquer fidélisée</button>}
                    {s?.etat === "perdue" && v.statut !== "perdue" && <button className="text-rose-300 hover:underline" onClick={() => changerStatut(v, "perdue")}>Marquer perdue</button>}
                    {(v.statut === "refusee" || v.statut === "declaree") && <button className="text-white/30 hover:text-rose-300" onClick={() => supprimer(v)}>Suppr.</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ouverte && (
        <VenteModal
          vente={ouverte}
          collabs={collabs}
          p={p}
          onClose={() => setOuverte(null)}
          onChanged={() => { setOuverte(null); charger(); }}
        />
      )}
    </AdminShell>
  );
}

function VenteModal({ vente: v, collabs, p, onClose, onChanged }: { vente: Vente; collabs: Collaborateur[]; p: Parametres; onClose: () => void; onChanged: () => void }) {
  const [dateDebut, setDateDebut] = useState(v.date_debut_souhaitee || new Date().toISOString().slice(0, 10));
  const [secretaire, setSecretaire] = useState("");
  const [remiseOk, setRemiseOk] = useState(false);
  const [notes, setNotes] = useState(v.notes_admin || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Création du compte garage + email de bienvenue (v10.5)
  const [avecCompte, setAvecCompte] = useState(true);
  const [resCompte, setResCompte] = useState<ResultatCompteGarage | null>(null);
  const secretaires = collabs.filter((c) => c.type === "secretaire" && c.statut === "actif");

  const contrat: VenteContrat = { ...v };

  async function valider() {
    setBusy(true); setErr(null);
    try {
      await validerVente(v.id, { date_debut: dateDebut, secretaire_id: secretaire || null, remise_acceptee: remiseOk });
      if (notes !== (v.notes_admin || "")) await upsertLigne<Vente>("ventes", { id: v.id, notes_admin: notes });
      if (avecCompte) {
        // La vente est validée : même si l'email échoue, on affiche le
        // résultat (et le mot de passe provisoire à transmettre) avant de fermer.
        const r = await creerCompteGarage(v.id);
        setResCompte(r);
        if (r.motDePasse || !r.emailEnvoye) { setBusy(false); return; }
      }
      onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : "Validation impossible."); } finally { setBusy(false); }
  }
  async function creerCompte() {
    setBusy(true); setErr(null);
    try { setResCompte(await creerCompteGarage(v.id)); } catch (e) { setErr(e instanceof Error ? e.message : "Création impossible."); } finally { setBusy(false); }
  }
  async function sauverNotes() {
    await upsertLigne<Vente>("ventes", { id: v.id, notes_admin: notes });
    onChanged();
  }

  return (
    <ModalShell title={`Vente ${v.numero || ""} — ${v.garage_nom}`} onClose={onClose} maxWidth="max-w-3xl">
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="glass-soft p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/40">Garage</div>
          <div className="mt-1 text-white">{v.garage_nom}{v.garage_siret ? ` · SIRET ${v.garage_siret}` : ""}</div>
          <div className="text-white/60">{[v.garage_adresse, `${v.garage_cp || ""} ${v.garage_ville || ""}`.trim()].filter(Boolean).join(", ") || "—"}</div>
          <div className="mt-1 text-white/70">{v.contact_nom || "—"}{v.contact_fonction ? ` (${v.contact_fonction})` : ""} · {v.contact_tel || "—"} · {v.contact_email}</div>
        </div>
        <div className="glass-soft p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/40">Offre & paiement</div>
          <div className="mt-1 text-white">{p.formules[v.formule].libelle} — {v.periodicite === "annuel" ? `${euros(v.montant_annuel_ht)} HT / an (en une fois)` : `${euros(v.prix_mensuel_ht)} HT / mois`}</div>
          <div className="text-white/60">{v.engagement_12 ? "Engagement 12 mois" : "Sans engagement"}{Number(v.mise_en_service_ht) > 0 ? ` · mise en service ${euros(v.mise_en_service_ht)}${Number(v.mise_en_service_remise_pct) > 0 ? ` (remisée de ${v.mise_en_service_remise_pct} %)` : ""}` : " · mise en service offerte"}{Number(v.remise_supp_pct) > 0 ? ` · remise supp. demandée ${v.remise_supp_pct} % ${Number(v.remise_supp_mois) > 0 ? `pendant ${v.remise_supp_mois} mois (puis ${euros(v.prix_plein_ht ?? v.prix_mensuel_ht)} / mois)` : "définitive"}` : ""}</div>
          <div className="text-white/60">{MODES_PAIEMENT[v.mode_paiement] || v.mode_paiement}{v.paiement_sur_place ? ` — reçu sur place ${euros(v.paiement_montant)} réf. ${v.paiement_reference || "—"}` : ""}</div>
          <div className="mt-1 text-white/60">Signé par {v.signataire_nom || "—"}{v.signataire_qualite ? ` (${v.signataire_qualite})` : ""} le {v.signe_le ? new Date(v.signe_le).toLocaleString("fr-FR") : "—"}</div>
          {v.signature && <img src={v.signature} alt="Signature" className="mt-2 h-14 rounded bg-white p-1" />}
        </div>
      </div>

      {v.besoins && Object.keys(v.besoins).length > 0 && (
        <div className="glass-soft p-3 text-sm">
          <div className="text-[11px] uppercase tracking-wider text-white/40">Fiche de renseignement</div>
          <ul className="mt-1 space-y-0.5 text-white/75">
            {QUESTIONS_BESOINS.filter((q) => v.besoins![q.cle]).map((q) => (
              <li key={q.cle}><span className="text-white/45">{q.label} :</span> {Array.isArray(v.besoins![q.cle]) ? (v.besoins![q.cle] as string[]).join(", ") : String(v.besoins![q.cle])}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost btn-compact" onClick={() => telechargerContratPdf(contrat, p, { numero: v.numero, signature: v.signature, signeLe: v.signe_le, besoins: v.besoins })}>Contrat signé (PDF)</button>
        <a className="btn-ghost btn-compact" href={`mailto:${v.contact_email}?subject=${encodeURIComponent(`Bienvenue sur My Easy Auto — ${v.garage_nom}`)}`}>Écrire au garage</a>
      </div>

      {v.statut === "declaree" && (
        <div className="rounded-lg border-2 border-accent-pink/60 bg-accent-pink/10 p-3">
          <div className="text-sm font-semibold text-white">Valider la vente → crée l&apos;abonnement</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <ChampAdmin label="Début de l'abonnement (1re mensualité)"><input type="date" className="field-input" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} /></ChampAdmin>
            <ChampAdmin label="Chargé de mission affectée (formules avec heures)">
              <select className="field-input" value={secretaire} onChange={(e) => setSecretaire(e.target.value)}>
                <option value="">— plus tard —</option>
                {secretaires.map((s) => <option key={s.id} value={s.id}>{nomCollab(s)}</option>)}
              </select>
            </ChampAdmin>
          </div>
          {Number(v.remise_supp_pct) > 0 && (
            <label className="mt-2 flex items-center gap-2 text-sm text-amber-200">
              <input type="checkbox" checked={remiseOk} onChange={(e) => setRemiseOk(e.target.checked)} />
              J&apos;accepte la remise exceptionnelle de {v.remise_supp_pct} % {Number(v.remise_supp_mois) > 0 ? `pendant ${v.remise_supp_mois} mois` : "définitive"} (sinon le prix de grille s&apos;applique)
            </label>
          )}
          <label className="mt-2 flex items-center gap-2 text-sm text-white/85">
            <input type="checkbox" checked={avecCompte} onChange={(e) => setAvecCompte(e.target.checked)} />
            Créer aussi le compte du garage ({v.contact_email}) et lui envoyer l&apos;email de bienvenue
          </label>
          <p className="mt-2 text-xs text-white/50">
            Le compte reçoit un mot de passe provisoire par email (à changer à la première connexion). Les mensualités se pointent dans Abonnements ; la prime du commercial part avec le relevé.
          </p>
          {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-ghost" onClick={onClose}>Fermer</button>
            <button className="btn-primary" onClick={valider} disabled={busy}>{busy ? "…" : "Valider et créer l'abonnement"}</button>
          </div>
        </div>
      )}

      {v.statut === "validee" && !resCompte && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/15 p-3 text-sm">
          <span className="text-white/70">Le compte du garage n&apos;est pas encore créé.</span>
          <button className="btn-primary btn-compact" onClick={creerCompte} disabled={busy}>{busy ? "…" : "Créer le compte + email de bienvenue"}</button>
        </div>
      )}
      {(v.statut === "compte_cree" || v.statut === "fidelisee") && !resCompte && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/15 p-3 text-sm">
          <span className="text-white/70">Compte du garage créé{v.compte_cree_par ? ` par ${v.compte_cree_par === "commercial" ? "le commercial" : "l'éditeur"}` : ""}{v.compte_cree_le ? ` le ${dateFr(v.compte_cree_le)}` : ""} · {v.contact_email}</span>
          <BoutonRenvoiBienvenue cible={{ vente_id: v.id }} email={v.contact_email} compact={false} />
        </div>
      )}
      {resCompte && (
        <div className={`rounded-lg border p-3 text-sm ${resCompte.motDePasse ? "border-amber-300/60 bg-amber-300/10" : "border-emerald-300/50 bg-emerald-300/10"}`}>
          {resCompte.dejaExistant ? (
            <p className="text-white/85">Un compte existait déjà pour {v.contact_email} : il a été rattaché à l&apos;abonnement (mot de passe inchangé, pas d&apos;email envoyé).</p>
          ) : resCompte.emailEnvoye ? (
            <p className="text-white/85"><Ico n="check" /> Compte créé — l&apos;email de bienvenue (identifiants + premiers pas) est parti à {v.contact_email}.</p>
          ) : (
            <div className="text-white/85">
              <p>Compte créé, mais l&apos;email de bienvenue n&apos;est pas parti{resCompte.erreurEmail ? ` (${resCompte.erreurEmail})` : ""}.</p>
              {resCompte.motDePasse && (
                <p className="mt-1">Transmets ces identifiants au garage : <b>{v.contact_email}</b> / mot de passe provisoire <b className="font-mono text-amber-200">{resCompte.motDePasse}</b> — il ne sera plus affiché ensuite.</p>
              )}
            </div>
          )}
          <div className="mt-2 flex justify-end"><button className="btn-ghost btn-compact" onClick={onChanged}>Fermer</button></div>
        </div>
      )}

      <ChampAdmin label="Notes de suivi (éditeur)">
        <textarea className="field-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </ChampAdmin>
      {v.statut !== "declaree" && (
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Fermer</button>
          <button className="btn-primary" onClick={sauverNotes}>Enregistrer les notes</button>
        </div>
      )}
    </ModalShell>
  );
}
