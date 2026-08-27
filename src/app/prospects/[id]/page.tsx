"use client";

// FICHE CLIENT DU COMMERCIAL (v10.2 → v10.4) — identité, questionnaire
// (fiche d'identification des besoins + demandes particulières, fiche client
// PDF interne pour la secrétaire), offre,
// documents (simulation, devis, contrat) signés sur place, vente et
// paiement. Tout est modifiable à tout moment, rien n'est bloquant.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ModalShell from "@/components/ModalShell";
import SignaturePad from "@/components/SignaturePad";
import EmailComposer from "@/components/EmailComposer";
import { formatDate, formatDateTime, formatEuros, messageErreur } from "@/lib/format";
import { supabase } from "@/lib/supabaseClient";
import {
  DELAIS_RAPPEL, OFFRE_DEFAUT, ORIGINES_PROSPECT, ParametresOffre, Prospect, ProspectDocument, ProspectOrigine, ProspectStatut, STATUTS_PROSPECT, TYPES_DOCUMENT, dateDansJours, etatRappel,
  chargerProspect, creerDocument, enregistrerProspect, majDocument, prospectVersContrat, supprimerDocument, supprimerProspect,
} from "@/lib/prospects";
import { ContexteCommercial, chargerContexteCommercial, declarerVente, enregistrerSignatureCommercial, majPaiement, nomCommercial } from "@/lib/commercialClient";
import { Agrement, DemandeParticuliere, QuestionBesoin, SECTIONS_BESOINS, agrementsDe, demandesDe, reponseLisible, tauxRemplissage } from "@/lib/ficheBesoins";
import { Formule, Periodicite, grilleTarifs, primeVente, prixVente } from "@/lib/admin/economie";
import { MODES_PAIEMENT, articlesCGV, conditionsParticulieres } from "@/lib/admin/contratGarage";
import { construireContratPdf, construireDevisPdf, construireFichePdf, construireSimulationPdf } from "@/lib/admin/contratPdf";
import type { Vente } from "@/lib/admin/client";
import type { PieceJointeOption } from "@/components/EmailComposer";

type Onglet = "fiche" | "besoins" | "offre" | "vente";

export default function ProspectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ctx, setCtx] = useState<ContexteCommercial | null>(null);
  const [p, setP] = useState<Prospect | null>(null);
  const [docs, setDocs] = useState<ProspectDocument[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [onglet, setOnglet] = useState<Onglet>("fiche");
  const [msg, setMsg] = useState<string | null>(null);
  const [offre, setOffre] = useState<ParametresOffre>(OFFRE_DEFAUT);
  const [signer, setSigner] = useState<ProspectDocument | null>(null);
  const [envoyer, setEnvoyer] = useState<ProspectDocument[] | null>(null);
  const [venteModal, setVenteModal] = useState(false);

  const load = useCallback(async () => {
    const r = await chargerProspect(id);
    setP(r.prospect);
    setDocs(r.documents);
    const dernier = r.documents.find((d) => d.parametres);
    if (dernier?.parametres) setOffre({ ...OFFRE_DEFAUT, ...dernier.parametres });
    const { data } = await supabase.from("ventes").select("*").eq("prospect_id", id).order("created_at", { ascending: false });
    setVentes((data as Vente[]) || []);
  }, [id]);
  useEffect(() => {
    chargerContexteCommercial().then(setCtx).catch((e) => setMsg(messageErreur(e, "Espace commercial indisponible.")));
    load().catch((e) => setMsg(messageErreur(e, "Lecture impossible.")));
  }, [load]);

  const params = ctx?.parametres;
  const prix = useMemo(() => (params ? prixVente(offre.formule, { engagement12: offre.engagement_12, periodicite: offre.periodicite, remiseSupp: offre.remise_supp_pct }, params) : null), [params, offre]);
  const prime = useMemo(
    () => (params && prix && ctx?.collaborateur ? primeVente(offre.formule, { engagement12: offre.engagement_12 || offre.periodicite === "annuel", periodicite: offre.periodicite, mensualiteFacturee: prix.montantAnnuel != null ? prix.montantAnnuel / 12 : prix.mensualite }, params) : null),
    [params, prix, offre, ctx]
  );
  const contrat = useMemo(() => (p && prix ? prospectVersContrat(p, offre, prix, ctx?.collaborateur?.code_apporteur) : null), [p, prix, offre, ctx]);

  async function sauver(patch: Partial<Prospect>) {
    if (!p) return;
    try {
      const n = await enregistrerProspect({ ...p, ...patch, nom: patch.nom ?? p.nom });
      setP(n);
      setMsg("Enregistré.");
      setTimeout(() => setMsg(null), 1500);
    } catch (e) { setMsg(messageErreur(e, "Enregistrement impossible.")); }
  }

  // --- PDF d'un document (à partir de ses paramètres enregistrés)
  function pdfDe(d: ProspectDocument) {
    if (!p || !params) return null;
    const o = { ...OFFRE_DEFAUT, ...(d.parametres || offre) };
    const px = prixVente(o.formule, { engagement12: o.engagement_12, periodicite: o.periodicite, remiseSupp: o.remise_supp_pct }, params);
    const v = prospectVersContrat(p, o, px, ctx?.collaborateur?.code_apporteur);
    if (d.signataire_client) v.signataire_nom = d.signataire_client;
    const commun = { numero: d.numero, signature: d.signature_client, signeLe: d.signe_le, signatureCommercial: d.signature_commercial || ctx?.collaborateur?.signature || null, commercialNom: nomCommercial(ctx?.collaborateur || null) };
    if (d.type === "contrat") return construireContratPdf(v, params, { ...commun, besoins: p.besoins });
    if (d.type === "devis") return construireDevisPdf(v, params, { ...commun, validiteJours: o.validite_jours || 30, date: d.created_at });
    if (d.type === "simulation") return construireSimulationPdf(p.nom, o.formule, params, { numero: d.numero, commercialNom: commun.commercialNom });
    if (d.type === "fiche") return construireFichePdf(p, { numero: d.numero, date: d.created_at, commercialNom: commun.commercialNom, codeApporteur: ctx?.collaborateur?.code_apporteur });
    return null;
  }
  function apercu(d: ProspectDocument) {
    const pdf = pdfDe(d);
    if (!pdf) return;
    window.open(pdf.output("bloburl"), "_blank");
  }
  async function generer(type: ProspectDocument["type"]) {
    try {
      const d = await creerDocument(id, type, type === "fiche" ? null : offre);
      await load();
      if (p && p.statut === "prospect" && type !== "simulation" && type !== "fiche") await sauver({ statut: "devis" });
      setMsg(`${TYPES_DOCUMENT[type]} ${d.numero} généré.`);
      setTimeout(() => apercu({ ...d, parametres: offre }), 200);
    } catch (e) { setMsg(messageErreur(e, "Génération impossible.")); }
  }
  const pj = (liste: ProspectDocument[]): PieceJointeOption[] =>
    liste.map((d) => ({
      label: `${TYPES_DOCUMENT[d.type]} ${d.numero || ""}${d.signe_le ? " (signé)" : ""}${d.type === "fiche" ? " — interne" : ""}`,
      filename: `${d.type}-${(d.numero || d.id.slice(0, 6)).replace(/[^a-z0-9-]+/gi, "_")}.pdf`,
      getBase64: async () => {
        const pdf = pdfDe(d);
        if (!pdf) return "";
        const uri = pdf.output("datauristring");
        return uri.substring(uri.indexOf(",") + 1);
      },
      coche: d.type !== "fiche",
    }));

  if (!p) return <p className="text-sm text-white/50">{msg || "Chargement…"}</p>;
  const st = STATUTS_PROSPECT[p.statut];
  const contratSigne = docs.find((d) => d.type === "contrat" && d.signature_client);
  const vente = ventes[0];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button onClick={() => router.push("/prospects")} className="text-xs text-white/50 hover:underline">← Mes clients</button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="titre-page">{p.nom}</h1>
            <span className={st.badge}>{st.label}</span>
          </div>
          <p className="text-sm text-white/50">{[p.adresse, `${p.cp || ""} ${p.ville || ""}`.trim(), p.siren ? `SIREN ${p.siren}` : ""].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="field-input field-compact" value={p.statut} onChange={(e) => sauver({ statut: e.target.value as ProspectStatut })}>
            {(Object.keys(STATUTS_PROSPECT) as ProspectStatut[]).map((s) => <option key={s} value={s}>{STATUTS_PROSPECT[s].label}</option>)}
          </select>
          <button onClick={async () => { if (confirm("Supprimer cette fiche client et ses documents ?")) { await supprimerProspect(p.id); router.push("/prospects"); } }} className="btn-ghost btn-compact text-rose-300">Supprimer</button>
        </div>
      </div>
      {msg && <p className="mb-3 text-xs text-accent-teal">{msg}</p>}

      <RappelProspect p={p} onSave={sauver} />

      <div className="segment mb-4 flex-wrap">
        {([["fiche", "Fiche"], ["besoins", "Questionnaire"], ["offre", "Offre & documents"], ["vente", "Vente & paiement"]] as [Onglet, string][]).map(([k, l]) => (
          <button key={k} className={`segment-btn ${onglet === k ? "actif" : ""}`} onClick={() => setOnglet(k)}>{l}{k === "offre" && docs.length ? ` (${docs.length})` : ""}</button>
        ))}
      </div>

      {/* ---------------- FICHE ---------------- */}
      {onglet === "fiche" && <FicheForm p={p} onSave={sauver} estAdmin={Boolean(ctx?.estAdmin)} zone={ctx?.collaborateur?.zone || null} />}

      {/* ---------------- QUESTIONNAIRE ---------------- */}
      {onglet === "besoins" && <BesoinsForm p={p} onSave={sauver} docs={docs} onGenerer={() => generer("fiche")} onApercu={apercu} onEnvoyer={(d) => setEnvoyer([d])} />}

      {/* ---------------- OFFRE & DOCUMENTS ---------------- */}
      {onglet === "offre" && params && prix && (
        <div className="space-y-4">
          <div className="glass-card p-4">
            <h2 className="titre-bloc">L&apos;offre</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {grilleTarifs(params).map((t) => (
                <button key={t.formule} onClick={() => setOffre((o) => ({ ...o, formule: t.formule }))} className={`rounded-lg border-2 p-3 text-left ${offre.formule === t.formule ? "border-accent-pink bg-accent-pink/10" : "border-white/15 hover:border-white/40"}`}>
                  <div className="font-bold text-white">{t.libelle}</div>
                  <div className="text-xs text-white/60">{t.heures ? `${t.heures} h / mois` : "appli seule"}</div>
                  <div className="mt-1 text-sm text-white/85">{formatEuros(t.mensuel)} · <span className="text-accent-teal">{formatEuros(t.mensuelEngage)} engagé</span></div>
                  <div className="text-xs text-white/50">{formatEuros(t.annuelUnique)} l&apos;année</div>
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {([["mensuel", false, "Mensuel sans engagement"], ["mensuel", true, "Mensuel, engagement 12 mois"], ["annuel", true, "Année payée en une fois"]] as [Periodicite, boolean, string][]).map(([per, eng, l]) => (
                <label key={l} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${offre.periodicite === per && offre.engagement_12 === eng ? "border-accent-pink bg-accent-pink/10" : "border-white/15"}`}>
                  <input type="radio" checked={offre.periodicite === per && offre.engagement_12 === eng} onChange={() => setOffre((o) => ({ ...o, periodicite: per, engagement_12: eng }))} />{l}
                </label>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div><label className="field-label">Remise exceptionnelle (%)</label><input className="field-input field-compact" inputMode="decimal" value={offre.remise_supp_pct || ""} onChange={(e) => setOffre((o) => ({ ...o, remise_supp_pct: Math.min(30, Number(e.target.value) || 0) }))} placeholder="0" /></div>
              <div><label className="field-label">Mode de règlement</label><select className="field-input field-compact" value={offre.mode_paiement} onChange={(e) => setOffre((o) => ({ ...o, mode_paiement: e.target.value }))}>{Object.entries(MODES_PAIEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div><label className="field-label">Mise en service souhaitée</label><input type="date" className="field-input field-compact" value={offre.date_debut_souhaitee || ""} onChange={(e) => setOffre((o) => ({ ...o, date_debut_souhaitee: e.target.value }))} /></div>
              <div><label className="field-label">Validité du devis (jours)</label><input className="field-input field-compact" inputMode="numeric" value={offre.validite_jours || 30} onChange={(e) => setOffre((o) => ({ ...o, validite_jours: Number(e.target.value) || 30 }))} /></div>
            </div>
            <div className="glass-soft mt-3 p-3 text-sm text-white/80">
              <ul className="space-y-0.5">{contrat && conditionsParticulieres(contrat, params).map((l, i) => <li key={i}>• {l}</li>)}</ul>
              {prime && <p className="mt-2 border-t border-white/10 pt-2 text-xs text-white/50">Votre prime : <b className="text-white/80">{formatEuros(prime.total)}</b>, acquise à la {prime.mensualiteEcheance}<sup>e</sup> mensualité encaissée.</p>}
              {offre.remise_supp_pct > 0 && <p className="mt-1 text-xs text-amber-300">Remise exceptionnelle : soumise à validation IDEAFORMA — le devis et le contrat le mentionnent.</p>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => generer("simulation")}>Simulation tarifaire (PDF)</button>
              <button className="btn-ghost" onClick={() => generer("devis")}>Générer le devis</button>
              <button className="btn-primary" onClick={() => generer("contrat")}>Générer le contrat</button>
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="titre-bloc">Documents</h2>
              {docs.length > 0 && <button className="btn-ghost btn-compact" onClick={() => setEnvoyer(docs)}>✉️ Envoyer au garage</button>}
            </div>
            {docs.length === 0 ? (
              <p className="mt-2 text-sm text-white/45">Aucun document. Règle l&apos;offre ci-dessus puis génère la simulation, le devis ou le contrat : ils reprennent la fiche du garage et le questionnaire.</p>
            ) : (
              <ul className="mt-2 divide-y divide-white/10">
                {docs.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0 text-sm">
                      <span className="font-medium text-white">{TYPES_DOCUMENT[d.type]} {d.numero}</span>
                      <span className="text-white/50"> · {formatDate(d.created_at)}{d.parametres ? ` · ${params.formules[d.parametres.formule].libelle}${d.parametres.periodicite === "annuel" ? " (année)" : d.parametres.engagement_12 ? " (engagé)" : ""}` : ""}</span>
                      {d.type === "fiche" && <span className="badge badge-neutral ml-2">Interne</span>}
                      {d.signe_le && <span className="badge badge-ok ml-2">Signé le {formatDate(d.signe_le)}</span>}
                      {d.envoye_le && <span className="badge badge-info ml-2">Envoyé {formatDate(d.envoye_le)}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                      <button className="text-accent-teal hover:underline" onClick={() => apercu(d)}>PDF</button>
                      {d.type !== "simulation" && d.type !== "fiche" && <button className="text-accent-pink hover:underline" onClick={() => setSigner(d)}>{d.signe_le ? "Re-signer" : "Signer sur place"}</button>}
                      <button className="text-accent-teal hover:underline" onClick={() => setEnvoyer([d])}>Envoyer</button>
                      <button className="text-white/40 hover:text-rose-300" onClick={async () => { if (confirm("Supprimer ce document ?")) { await supprimerDocument(d.id); load(); } }}>Suppr.</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ---------------- VENTE & PAIEMENT ---------------- */}
      {onglet === "vente" && params && (
        <div className="space-y-4">
          {!vente ? (
            <div className="glass-card p-4">
              <h2 className="titre-bloc">Déclarer la vente</h2>
              {contratSigne ? (
                <>
                  <p className="mt-2 text-sm text-white/70">Le contrat {contratSigne.numero} est signé par le garage{contratSigne.signe_le ? ` le ${formatDateTime(contratSigne.signe_le)}` : ""}. Déclare la vente à IDEAFORMA : elle sera validée sous 5 jours ouvrés et le compte du garage créé.</p>
                  <button className="btn-primary mt-3" onClick={() => setVenteModal(true)}>Déclarer la vente à IDEAFORMA</button>
                </>
              ) : (
                <p className="mt-2 text-sm text-white/50">Génère le contrat (onglet Offre & documents) et fais-le signer sur place par le garage : le bouton de déclaration apparaîtra ici.</p>
              )}
            </div>
          ) : (
            <VenteSuivi vente={vente} params={params} onChanged={load} />
          )}
          {ventes.length > 1 && <p className="text-xs text-white/40">{ventes.length - 1} vente(s) antérieure(s) sur cette fiche.</p>}
        </div>
      )}

      {signer && <SignatureModal doc={signer} ctx={ctx} onClose={() => setSigner(null)} onSigned={async () => { setSigner(null); await load(); if (signer.type === "contrat") await sauver({ statut: "signe" }); }} />}
      {envoyer && (
        <EmailComposer
          defaultTo={p.email || ""}
          defaultSubject={`${envoyer.length === 1 ? TYPES_DOCUMENT[envoyer[0].type] : "Vos documents"} My Easy Auto — ${p.nom}`}
          defaultBody={`Bonjour ${p.contact_nom || p.gerant || ""},\n\nSuite à notre rendez-vous, veuillez trouver ci-joint ${envoyer.length === 1 ? `votre ${TYPES_DOCUMENT[envoyer[0].type].toLowerCase()}` : "vos documents"} My Easy Auto pour ${p.nom}.\n\nJe reste à votre disposition pour toute question.\n\nCordialement,\n${nomCommercial(ctx?.collaborateur || null)}${ctx?.collaborateur?.code_apporteur ? ` — apporteur d'affaires IDEAFORMA (code ${ctx.collaborateur.code_apporteur})` : " — IDEAFORMA"}`}
          piecesJointes={pj(envoyer)}
          onClose={() => setEnvoyer(null)}
          onSent={async () => {
            for (const d of envoyer) await majDocument(d.id, { envoye_le: new Date().toISOString(), envoye_a: p.email, statut: d.statut === "brouillon" ? "envoye" : d.statut });
            setEnvoyer(null);
            load();
          }}
        />
      )}
      {venteModal && contratSigne && contrat && params && (
        <ModalShell title="Déclarer la vente à IDEAFORMA" onClose={() => setVenteModal(false)}>
          <VenteDeclaration
            prospect={p}
            doc={contratSigne}
            offre={{ ...OFFRE_DEFAUT, ...(contratSigne.parametres || offre) }}
            params={params}
            onClose={() => setVenteModal(false)}
            onDone={async () => { setVenteModal(false); await load(); }}
          />
        </ModalShell>
      )}
    </div>
  );
}

/* ------------------------------ Fiche ------------------------------ */
/* ------------------------- Rappel (alerte commercial) ------------------------- */
// « Le client souhaite être recontacté à telle date / dans tel délai » :
// visible sur tous les onglets, alimente les alertes de la liste Mes clients.
function RappelProspect({ p, onSave }: { p: Prospect; onSave: (patch: Partial<Prospect>) => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [motif, setMotif] = useState(p.prochaine_action || "");
  const [date, setDate] = useState(p.prochaine_date || "");
  useEffect(() => { setMotif(p.prochaine_action || ""); setDate(p.prochaine_date || ""); }, [p]);
  const e = etatRappel(p);
  const couleur = e === "echu" || e === "aujourdhui" ? "border-rose-400/60 bg-rose-400/10" : e === "bientot" ? "border-amber-300/50 bg-amber-300/10" : "border-white/15";

  async function programmer(d: string) {
    await onSave({ prochaine_action: motif || "Recontacter le client", prochaine_date: d });
    setEdit(false);
  }

  if (!edit && !p.prochaine_date) {
    return (
      <div className="mb-4">
        <button className="btn-ghost btn-compact" onClick={() => setEdit(true)}>🔔 Programmer un rappel (à recontacter)</button>
      </div>
    );
  }
  return (
    <div className={`glass-card mb-4 border p-3 ${couleur}`}>
      {!edit ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="min-w-0">
            <span className="mr-2">🔔</span>
            <span className={e === "echu" ? "font-semibold text-rose-300" : e === "aujourdhui" ? "font-semibold text-amber-200" : "text-white/85"}>
              {e === "echu" ? "Rappel en retard" : e === "aujourdhui" ? "À recontacter aujourd'hui" : `À recontacter le ${formatDate(p.prochaine_date!)}`}
              {e === "echu" ? ` (prévu le ${formatDate(p.prochaine_date!)})` : ""}
            </span>
            {p.prochaine_action && <span className="text-white/60"> — {p.prochaine_action}</span>}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button className="btn-ghost btn-compact" onClick={() => setEdit(true)}>Modifier</button>
            <button className="btn-ghost btn-compact" onClick={() => onSave({ prochaine_date: dateDansJours(7) })}>+ 1 sem</button>
            <button className="btn-ghost btn-compact" onClick={() => onSave({ prochaine_action: null, prochaine_date: null })}>✓ Fait</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="grid gap-2 sm:grid-cols-[1.6fr_auto]">
            <input className="field-input field-compact" placeholder="Motif (ex : le client veut être rappelé après les congés)" value={motif} onChange={(ev) => setMotif(ev.target.value)} />
            <input type="date" className="field-input field-compact" value={date} onChange={(ev) => setDate(ev.target.value)} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-white/50">Ou dans :</span>
            {DELAIS_RAPPEL.map((d) => (
              <button key={d.jours} className="btn-ghost btn-compact" onClick={() => programmer(dateDansJours(d.jours))}>{d.label}</button>
            ))}
            <span className="flex-1" />
            <button className="btn-ghost btn-compact" onClick={() => setEdit(false)}>Annuler</button>
            <button className="btn-primary btn-compact" onClick={() => date && programmer(date)} disabled={!date}>Programmer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FicheForm({ p, onSave, estAdmin, zone }: { p: Prospect; onSave: (patch: Partial<Prospect>) => Promise<void>; estAdmin: boolean; zone: string | null }) {
  const [f, setF] = useState<Prospect>(p);
  useEffect(() => setF(p), [p]);
  const set = <K extends keyof Prospect>(k: K, v: Prospect[K]) => setF((x) => ({ ...x, [k]: v }));
  const C = ({ k, label, type = "text", full }: { k: keyof Prospect; label: string; type?: string; full?: boolean }) => (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="field-label">{label}</label>
      <input type={type} className="field-input" value={(f[k] as string) ?? ""} onChange={(e) => set(k, (type === "number" ? (e.target.value ? Number(e.target.value) : null) : e.target.value) as never)} />
    </div>
  );
  return (
    <div className="glass-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <C k="nom" label="Raison sociale" full />
        <C k="siren" label="SIREN" /><C k="siret" label="SIRET (établissement)" />
        <C k="tva_intra" label="N° TVA" /><C k="forme_juridique" label="Forme juridique" />
        <C k="activite" label="Activité (NAF)" /><C k="effectif" label="Effectif" type="number" />
        <C k="adresse" label="Adresse" full />
        <C k="cp" label="Code postal" /><C k="ville" label="Ville" />
        <C k="gerant" label="Nom du gérant" /><C k="contact_nom" label="Interlocuteur" />
        <C k="contact_fonction" label="Fonction de l'interlocuteur" /><C k="tel" label="Téléphone" type="tel" />
        <C k="email" label="Email (identifiant du futur compte)" type="email" /><C k="site" label="Site web" />
        <div>
          <label className="field-label">Origine du contact {zone ? `(zone : ${zone})` : ""}</label>
          <select className="field-input" value={f.origine} onChange={(e) => set("origine", e.target.value as ProspectOrigine)}>
            {(Object.keys(ORIGINES_PROSPECT) as ProspectOrigine[]).filter((o) => estAdmin || o !== "editeur").map((o) => <option key={o} value={o}>{ORIGINES_PROSPECT[o].label}</option>)}
          </select>
        </div>
        <C k="origine_detail" label="Précision (qui a recommandé, lien, accord…)" />
        <C k="prochaine_action" label="Prochaine action" /><C k="prochaine_date" label="Le" type="date" />
        <div className="sm:col-span-2"><label className="field-label">Notes</label><textarea className="field-input" rows={3} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>
      </div>
      <div className="mt-3 flex justify-end"><button className="btn-primary" onClick={() => onSave(f)}>Enregistrer</button></div>
    </div>
  );
}

/* ------------------- Agréments (nom + tarif particulier) ------------------- */
function AgrementsEditor({ b, set }: { b: Record<string, unknown>; set: (cle: string, v: unknown) => void }) {
  const liste = agrementsDe(b); // inclut la reprise de l'ancien champ « lesquels »
  const maj = (l: Agrement[]) => {
    set("agrements_liste", l);
    set("agrements_detail", ""); // l'ancien champ libre est absorbé par la liste
  };
  const [nouveau, setNouveau] = useState<Agrement>({ nom: "", tarif: "" });
  function ajouter() {
    if (!nouveau.nom.trim()) return;
    maj([...liste, { nom: nouveau.nom.trim(), tarif: nouveau.tarif?.trim() || undefined }]);
    setNouveau({ nom: "", tarif: "" });
  }
  return (
    <div className="mt-2 rounded-lg border border-white/15 p-3">
      <p className="text-xs text-white/50">Un agrément par ligne — précise le tarif particulier s&apos;il y en a un (taux horaire imposé, remise, forfait…). Ils apparaissent sur la fiche client et l&apos;annexe du contrat.</p>
      {liste.length > 0 && (
        <ul className="mt-2 divide-y divide-white/10">
          {liste.map((a, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-white">{a.nom}</span>
                <span className="text-white/60">{a.tarif ? ` — ${a.tarif}` : " — tarif standard"}</span>
              </div>
              <button className="text-xs text-white/40 hover:text-rose-300" onClick={() => maj(liste.filter((_, j) => j !== i))}>Retirer</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.2fr_auto]">
        <input className="field-input field-compact" placeholder="Assureur / réseau (ex : AXA, Covéa…)" value={nouveau.nom} onChange={(e) => setNouveau((n) => ({ ...n, nom: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") ajouter(); }} />
        <input className="field-input field-compact" placeholder="Tarif particulier (facultatif — ex : T1 à 62 € HT)" value={nouveau.tarif || ""} onChange={(e) => setNouveau((n) => ({ ...n, tarif: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") ajouter(); }} />
        <button className="btn-ghost btn-compact" type="button" onClick={ajouter} disabled={!nouveau.nom.trim()}>+ Ajouter</button>
      </div>
    </div>
  );
}

/* --------------------------- Questionnaire --------------------------- */
function BesoinsForm({ p, onSave, docs, onGenerer, onApercu, onEnvoyer }: {
  p: Prospect;
  onSave: (patch: Partial<Prospect>) => Promise<void>;
  docs: ProspectDocument[];
  onGenerer: () => Promise<void>;
  onApercu: (d: ProspectDocument) => void;
  onEnvoyer: (d: ProspectDocument) => void;
}) {
  const [b, setB] = useState<Record<string, unknown>>(p.besoins || {});
  const [demandes, setDemandes] = useState<DemandeParticuliere[]>(demandesDe(p.besoins));
  const [nouvelle, setNouvelle] = useState<DemandeParticuliere>({ titre: "", detail: "" });
  const [sauvegarde, setSauvegarde] = useState(false);
  useEffect(() => {
    setB(p.besoins || {});
    setDemandes(demandesDe(p.besoins));
  }, [p]);
  const fiches = docs.filter((d) => d.type === "fiche");
  const derniere = fiches[0];
  const modifie = JSON.stringify({ ...b, demandes }) !== JSON.stringify(p.besoins || {});
  const set = (cle: string, v: unknown) => setB((x) => ({ ...x, [cle]: v }));

  async function enregistrer() {
    setSauvegarde(true);
    try { await onSave({ besoins: { ...b, demandes } }); } finally { setSauvegarde(false); }
  }
  async function genererFiche() {
    if (modifie) await onSave({ besoins: { ...b, demandes } });
    await onGenerer();
  }
  function ajouterDemande() {
    if (!nouvelle.titre.trim()) return;
    setDemandes((l) => [...l, { titre: nouvelle.titre.trim(), detail: nouvelle.detail?.trim() || undefined }]);
    setNouvelle({ titre: "", detail: "" });
  }

  function champ(q: QuestionBesoin) {
    const v = b[q.cle];
    if (q.type === "texte") return <input className="field-input" value={reponseLisible(v)} placeholder={q.aide} onChange={(e) => set(q.cle, e.target.value)} />;
    if (q.type === "nombre") return <input className="field-input" inputMode="decimal" value={reponseLisible(v)} onChange={(e) => set(q.cle, e.target.value)} />;
    if (q.type === "long") return <textarea className="field-input" rows={2} value={reponseLisible(v)} onChange={(e) => set(q.cle, e.target.value)} />;
    if (q.type === "choix")
      return (
        <select className="field-input" value={reponseLisible(v)} onChange={(e) => set(q.cle, e.target.value)}>
          <option value="">—</option>
          {q.options!.map((o) => <option key={o} value={o}>{o}</option>)}
          {Boolean(v) && !q.options!.includes(String(v)) && <option value={String(v)}>{String(v)}</option>}
        </select>
      );
    if (q.type === "ouinon") {
      const val = v === true || v === "Oui" ? "Oui" : v === false || v === "Non" ? "Non" : "";
      return (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {["Oui", "Non"].map((o) => (
              <button key={o} type="button" onClick={() => set(q.cle, val === o ? "" : o)} className={`rounded-full border px-3 py-1 text-xs ${val === o ? "border-accent-pink bg-accent-pink text-white" : "border-white/25 text-white/70"}`}>{o}</button>
            ))}
            {q.precision && val === "Oui" && (
              <input className="field-input field-compact flex-1 min-w-[10rem]" placeholder={q.precision.label} value={reponseLisible(b[q.precision.cle])} onChange={(e) => set(q.precision!.cle, e.target.value)} />
            )}
          </div>
          {q.cle === "agrements" && val === "Oui" && <AgrementsEditor b={b} set={set} />}
        </div>
      );
    }
    // multi
    const cur = Array.isArray(v) ? (v as string[]) : [];
    const vertical = q.options!.length > 8;
    return (
      <div className={vertical ? "grid gap-1.5 sm:grid-cols-2" : "flex flex-wrap gap-2"}>
        {q.options!.map((o) => {
          const sel = cur.includes(o);
          return vertical ? (
            <label key={o} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs ${sel ? "border-accent-pink bg-accent-pink/10 text-white" : "border-white/15 text-white/70"}`}>
              <input type="checkbox" className="mt-0.5" checked={sel} onChange={() => set(q.cle, sel ? cur.filter((y) => y !== o) : [...cur, o])} />
              <span>{o}</span>
            </label>
          ) : (
            <button key={o} type="button" onClick={() => set(q.cle, sel ? cur.filter((y) => y !== o) : [...cur, o])} className={`rounded-full border px-3 py-1 text-xs ${sel ? "border-accent-pink bg-accent-pink text-white" : "border-white/25 text-white/70"}`}>{o}</button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="titre-bloc">Fiche d&apos;identification des besoins</h2>
            <p className="text-sm text-white/50">Les questions de l&apos;entretien de découverte (pack commercial). Aucune n&apos;est obligatoire, tout se modifie à tout moment ; les réponses sont jointes au contrat et servent à la fiche client remise à la secrétaire.</p>
          </div>
          <div className="text-right text-xs text-white/50">
            Rempli à <b className="text-white/80">{tauxRemplissage({ ...b, demandes })} %</b>
            {modifie && <div className="text-amber-300">Modifications non enregistrées</div>}
          </div>
        </div>
      </div>

      {SECTIONS_BESOINS.map((s, i) => (
        <div key={s.cle} className={`glass-card p-4 ${s.interne ? "border border-accent-violet/40" : ""}`}>
          <h3 className="font-semibold text-white">{i + 1}. {s.titre}{s.interne && <span className="badge badge-neutral ml-2">Interne IDEAFORMA</span>}</h3>
          {s.intro && <p className="mt-1 text-xs text-white/50">{s.intro}</p>}
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {s.questions.map((q) => (
              <div key={q.cle} className={q.type === "multi" || q.type === "long" || q.type === "ouinon" ? "sm:col-span-2" : ""}>
                <label className="field-label">{q.label}</label>
                {champ(q)}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="glass-card border border-accent-pink/40 p-4">
        <h3 className="font-semibold text-white">{SECTIONS_BESOINS.length + 1}. Demandes particulières du client</h3>
        <p className="mt-1 text-xs text-white/50">Tout ce que le garage demande en plus ou autrement (habitudes, documents spécifiques, horaires, interlocuteurs à éviter…). Elles apparaissent en évidence sur la fiche client.</p>
        {demandes.length > 0 && (
          <ul className="mt-3 divide-y divide-white/10">
            {demandes.map((d, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0 text-sm">
                  <div className="font-medium text-white">{i + 1}. {d.titre}</div>
                  {d.detail && <div className="text-white/60">{d.detail}</div>}
                </div>
                <button className="text-xs text-white/40 hover:text-rose-300" onClick={() => setDemandes((l) => l.filter((_, j) => j !== i))}>Retirer</button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <input className="field-input field-compact" placeholder="Demande (ex : facture envoyée en double au comptable)" value={nouvelle.titre} onChange={(e) => setNouvelle((n) => ({ ...n, titre: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") ajouterDemande(); }} />
          <input className="field-input field-compact" placeholder="Précision (facultatif)" value={nouvelle.detail || ""} onChange={(e) => setNouvelle((n) => ({ ...n, detail: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") ajouterDemande(); }} />
          <button className="btn-ghost btn-compact" type="button" onClick={ajouterDemande} disabled={!nouvelle.titre.trim()}>+ Ajouter</button>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-white">Fiche client (PDF interne)</h3>
            <p className="text-xs text-white/50">À la charte IDEAFORMA avec le logo. À garder en interne et à transmettre à la secrétaire qui prendra le garage en charge — elle reflète toujours la dernière version du questionnaire.</p>
            {derniere && <p className="mt-1 text-xs text-white/60">Dernière fiche : {derniere.numero} · {formatDateTime(derniere.created_at)}{derniere.envoye_le ? ` · transmise le ${formatDate(derniere.envoye_le)}` : ""}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={enregistrer} disabled={sauvegarde}>{sauvegarde ? "Enregistrement…" : "Enregistrer le questionnaire"}</button>
            {derniere && <button className="btn-ghost" onClick={() => onApercu(derniere)}>Voir la fiche</button>}
            {derniere && <button className="btn-ghost" onClick={() => onEnvoyer(derniere)}>✉️ Transmettre à la secrétaire</button>}
            <button className="btn-primary" onClick={genererFiche}>{derniere ? "Régénérer la fiche client" : "Générer la fiche client"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Signature ---------------------------- */
function SignatureModal({ doc, ctx, onClose, onSigned }: { doc: ProspectDocument; ctx: ContexteCommercial | null; onClose: () => void; onSigned: () => void }) {
  const [sigClient, setSigClient] = useState<string | null>(null);
  const [sigCom, setSigCom] = useState<string | null>(ctx?.collaborateur?.signature || null);
  const [nom, setNom] = useState(doc.signataire_client || "");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [redessiner, setRedessiner] = useState(!ctx?.collaborateur?.signature);
  const params = ctx?.parametres;
  async function valider() {
    if (!sigClient) return setErr("La signature du garage est obligatoire.");
    if (!nom.trim()) return setErr("Indique le nom du signataire.");
    if (doc.type === "contrat" && !ok) return setErr("Le garage doit accepter les conditions.");
    setBusy(true); setErr(null);
    try {
      if (sigCom && redessiner && ctx?.collaborateur) await enregistrerSignatureCommercial(sigCom);
      await majDocument(doc.id, { signature_client: sigClient, signataire_client: nom.trim(), signature_commercial: sigCom, signe_le: new Date().toISOString(), statut: "signe" });
      onSigned();
    } catch (e) { setErr(messageErreur(e, "Enregistrement impossible.")); } finally { setBusy(false); }
  }
  return (
    <ModalShell title={`Signer ${TYPES_DOCUMENT[doc.type].toLowerCase()} ${doc.numero || ""}`} onClose={onClose} maxWidth="max-w-3xl">
      {doc.type === "contrat" && params && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-white/15 bg-white/5 p-3 text-xs text-white/75">
          <div className="font-semibold text-white">Conditions générales de vente (à faire lire au garage)</div>
          {articlesCGV(params).map((a) => <p key={a.titre} className="mt-1"><b>{a.titre}.</b> {a.texte}</p>)}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label">Signature du garage</label>
          <input className="field-input field-compact mb-2" placeholder="Nom et qualité du signataire" value={nom} onChange={(e) => setNom(e.target.value)} />
          <SignaturePad onChange={setSigClient} />
        </div>
        <div>
          <label className="field-label">Signature du commercial{ctx?.collaborateur ? ` — ${nomCommercial(ctx.collaborateur)}` : ""}</label>
          {!redessiner && sigCom ? (
            <div>
              <img src={sigCom} alt="Signature enregistrée" className="h-24 rounded bg-white p-1" />
              <button className="mt-2 text-xs text-accent-teal hover:underline" onClick={() => setRedessiner(true)}>Refaire ma signature</button>
            </div>
          ) : (
            <>
              <SignaturePad onChange={setSigCom} />
              <p className="mt-1 text-xs text-white/40">Mémorisée sur votre fiche pour les prochains documents.</p>
            </>
          )}
        </div>
      </div>
      {doc.type === "contrat" && (
        <label className="flex items-start gap-2 text-sm text-white/85">
          <input type="checkbox" className="mt-1" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          Le garage a lu et accepte les conditions particulières et les conditions générales de vente, et demande la mise en service dès validation par IDEAFORMA.
        </label>
      )}
      {err && <p className="text-sm text-rose-300">{err}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={valider} disabled={busy}>{busy ? "…" : "Enregistrer les signatures"}</button>
      </div>
    </ModalShell>
  );
}

/* ------------------------- Déclaration de vente ------------------------- */
function VenteDeclaration({ prospect, doc, offre, params, onClose, onDone }: { prospect: Prospect; doc: ProspectDocument; offre: ParametresOffre; params: ContexteCommercial["parametres"]; onClose: () => void; onDone: () => void }) {
  const [paiement, setPaiement] = useState<"virement" | "cb">(params.lienPaiementCb ? "cb" : "virement");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const prix = prixVente(offre.formule, { engagement12: offre.engagement_12, periodicite: offre.periodicite, remiseSupp: offre.remise_supp_pct }, params);
  const du = (offre.periodicite === "annuel" ? prix.montantAnnuel || 0 : prix.mensualite) + prix.miseEnService;
  async function go() {
    setBusy(true); setErr(null);
    try {
      await declarerVente({ prospect_id: prospect.id, offre, signature: doc.signature_client!, signataire_nom: doc.signataire_client || undefined, paiement_demande: paiement });
      onDone();
    } catch (e) { setErr(messageErreur(e, "Déclaration impossible.")); } finally { setBusy(false); }
  }
  return (
    <>
      <p className="text-sm text-white/70">
        {params.formules[offre.formule].libelle} · {offre.periodicite === "annuel" ? `année en une fois ${formatEuros(prix.montantAnnuel)} HT` : `${formatEuros(prix.mensualite)} HT / mois`}{offre.engagement_12 || offre.periodicite === "annuel" ? " · engagement 12 mois" : ""}. Première échéance : <b className="text-white">{formatEuros(du)} HT</b> (TVA en sus), facturée par IDEAFORMA.
      </p>
      <div>
        <label className="field-label">Comment le garage règle-t-il ?</label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`rounded-lg border px-3 py-2 text-sm ${paiement === "virement" ? "border-accent-pink bg-accent-pink/10" : "border-white/15"}`}>
            <input type="radio" checked={paiement === "virement"} onChange={() => setPaiement("virement")} /> <b>Virement bancaire</b>
            <div className="mt-1 text-xs text-white/60">{params.iban ? `IBAN ${params.iban}${params.bic ? ` · BIC ${params.bic}` : ""}` : "IBAN : sur la facture IDEAFORMA"} · référence « MEA {prospect.nom.slice(0, 20)} »</div>
          </label>
          <label className={`rounded-lg border px-3 py-2 text-sm ${paiement === "cb" ? "border-accent-pink bg-accent-pink/10" : "border-white/15"} ${!params.lienPaiementCb ? "opacity-50" : ""}`}>
            <input type="radio" checked={paiement === "cb"} disabled={!params.lienPaiementCb} onChange={() => setPaiement("cb")} /> <b>Carte bancaire</b>
            <div className="mt-1 text-xs text-white/60">{params.lienPaiementCb ? "Lien de paiement sécurisé, à ouvrir sur place ou envoyé au garage." : "Lien de paiement non configuré par IDEAFORMA."}</div>
          </label>
        </div>
      </div>
      <p className="text-xs text-white/45">Le commercial n&apos;encaisse jamais en son nom. Tu confirmeras ensuite depuis cette fiche que le paiement est fait (référence du virement / reçu CB) ; IDEAFORMA le vérifie et valide la vente.</p>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={go} disabled={busy}>{busy ? "…" : "Déclarer la vente"}</button>
      </div>
    </>
  );
}

/* ----------------------------- Suivi vente ----------------------------- */
function VenteSuivi({ vente: v, params, onChanged }: { vente: Vente; params: ContexteCommercial["parametres"]; onChanged: () => void }) {
  const [ref, setRef] = useState(v.paiement_reference || "");
  const [montant, setMontant] = useState(v.paiement_montant != null ? String(v.paiement_montant) : "");
  const [busy, setBusy] = useState(false);
  const du = (v.periodicite === "annuel" ? Number(v.montant_annuel_ht) : Number(v.prix_mensuel_ht)) + Number(v.mise_en_service_ht || 0);
  const vv = v as Vente & { paiement_demande?: string | null; paiement_confirme_le?: string | null; paiement_valide_le?: string | null };
  async function action(args: Parameters<typeof majPaiement>[0]) {
    setBusy(true);
    try { await majPaiement(args); onChanged(); } catch (e) { alert(messageErreur(e, "Impossible.")); } finally { setBusy(false); }
  }
  const statut = { declaree: "Déclarée — en attente de validation IDEAFORMA", validee: "Validée par IDEAFORMA", compte_cree: "Compte du garage créé", fidelisee: "Fidélisée", perdue: "Perdue", refusee: "Refusée" }[v.statut];
  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="titre-bloc">Vente {v.numero}</h2>
        <span className={`badge ${v.statut === "declaree" ? "badge-warn" : v.statut === "perdue" || v.statut === "refusee" ? "badge-danger" : "badge-ok"}`}>{statut}</span>
      </div>
      <p className="mt-2 text-sm text-white/70">{params.formules[v.formule].libelle} · {v.periodicite === "annuel" ? `${formatEuros(v.montant_annuel_ht)} HT / an` : `${formatEuros(v.prix_mensuel_ht)} HT / mois`}{v.engagement_12 ? " · engagement 12 mois" : ""} · déclarée le {formatDate(v.created_at)}</p>
      <div className="glass-soft mt-3 p-3">
        <div className="text-sm font-semibold text-white">Paiement de la 1re échéance — {formatEuros(du)} HT</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={`btn-ghost btn-compact ${vv.paiement_demande === "virement" ? "border-accent-pink" : ""}`} disabled={busy} onClick={() => action({ vente_id: v.id, paiement_demande: "virement" })}>Demander un virement</button>
          <button className={`btn-ghost btn-compact ${vv.paiement_demande === "cb" ? "border-accent-pink" : ""}`} disabled={busy || !params.lienPaiementCb} onClick={() => action({ vente_id: v.id, paiement_demande: "cb" })}>Paiement par CB</button>
          {params.lienPaiementCb && <a className="btn-ghost btn-compact" href={params.lienPaiementCb} target="_blank" rel="noreferrer">Ouvrir le lien de paiement ↗</a>}
        </div>
        {vv.paiement_demande === "virement" && <p className="mt-2 text-xs text-white/60">{params.iban ? `IBAN ${params.iban}${params.bic ? ` · BIC ${params.bic}` : ""}` : "IBAN sur la facture IDEAFORMA"} · référence « MEA {v.garage_nom.slice(0, 20)} »</p>}
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input className="field-input field-compact" placeholder="Référence (virement, reçu CB)" value={ref} onChange={(e) => setRef(e.target.value)} />
          <input className="field-input field-compact" inputMode="decimal" placeholder="Montant reçu € TTC" value={montant} onChange={(e) => setMontant(e.target.value)} />
          {vv.paiement_confirme_le ? (
            <button className="btn-ghost btn-compact" disabled={busy} onClick={() => action({ vente_id: v.id, confirme: false })}>Annuler la confirmation</button>
          ) : (
            <button className="btn-primary btn-compact" disabled={busy} onClick={() => action({ vente_id: v.id, confirme: true, reference: ref, montant: montant ? Number(String(montant).replace(",", ".")) : null })}>Confirmer : paiement fait</button>
          )}
        </div>
        <p className="mt-2 text-xs text-white/50">
          {vv.paiement_confirme_le ? `✅ Paiement confirmé le ${formatDateTime(vv.paiement_confirme_le)}${v.paiement_reference ? ` (réf. ${v.paiement_reference})` : ""}` : "En attente du paiement du garage."}
          {vv.paiement_valide_le ? ` · vérifié par IDEAFORMA le ${formatDate(vv.paiement_valide_le)}` : ""}
        </p>
      </div>
    </div>
  );
}
