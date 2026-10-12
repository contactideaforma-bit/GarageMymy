"use client";

// ============================================================
//  INSCRIPTION EN LIGNE (v13.41) — un garage s'abonne SEUL, sans commercial.
//
//  1. Votre garage   : coordonnées + « Comment nous avez-vous connu ? »
//  2. Vos besoins    : fiche de besoins → formule CONSEILLÉE (expliquée)
//  3. Votre formule  : conseil + choix libre, mensuel / engagement / année
//  4. Paiement       : prélèvement automatique (Stripe) ou virement pour
//                      le mensuel ; lien sécurisé (Qonto) ou virement
//                      pour l'année — le garage garde le choix
//  5. Contrat        : conditions particulières, CGV, CGU, annexe RGPD,
//                      signature en ligne, puis « Je m'abonne »
//  À toute étape : « Être rappelé ». Prix nets (franchise en base de TVA).
// ============================================================

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { VitrineNav, VitrineFooter } from "@/components/vitrine/Vitrine";
import { SOCIETE } from "@/components/vitrine/societe";
import { FICHES } from "@/components/vitrine/formules";
import DemandeRappel from "@/components/vitrine/DemandeRappel";
import SignaturePad from "@/components/SignaturePad";
import { lireReponse } from "@/lib/apiClient";
import { Formule, Parametres, Periodicite, fusionnerParametres, grilleTarifs, prixVente } from "@/lib/admin/economie";
import { QUESTIONS_BESOINS } from "@/lib/admin/ventePublic";
import { ACCEPTATION_CGV, VenteContrat, articlesCGV, conditionsParticulieres } from "@/lib/admin/contratGarage";
import { ACCEPTATION_CGU, VERSION_CGU, articlesCGU } from "@/lib/admin/cgu";
import { AUTORISATION_SOUS_TRAITANCE, VERSION_DPA, articlesDPA } from "@/lib/admin/dpa";
import { construireContratPdf, prechargerLogoPdf } from "@/lib/admin/contratPdf";
import { MENTION_TVA } from "@/lib/venteParcours";
import {
  ETAPES_INSCRIPTION, EtapeInscription, InscriptionPublique, ModeEnLigne, SOURCES_CONNAISSANCE, CRENEAUX_RAPPEL, type Besoins,
  optionsPaiement, recommanderFormule,
} from "@/lib/inscription";

const eur = (n: number | null | undefined) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

type Chargement = { parametres: Parametres; dispo: { stripe: boolean; qonto: boolean } };

export default function InscriptionPage() {
  // useSearchParams exige une frontière Suspense (rendu statique Next 14).
  return (
    <Suspense fallback={<div className="landing-pro min-h-screen" />}>
      <Inscription />
    </Suspense>
  );
}

function Inscription() {
  const query = useSearchParams();
  const [etape, setEtape] = useState<EtapeInscription>("garage");
  const [params, setParams] = useState<Parametres | null>(null);
  const [dispo, setDispo] = useState<{ stripe: boolean; qonto: boolean }>({ stripe: false, qonto: false });
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<{ numero: string; token: string; url: string | null; erreurPaiement: string | null; inscription: InscriptionPublique } | null>(null);

  const [g, setG] = useState({
    garage_nom: "", garage_siret: "", garage_adresse: "", garage_cp: "", garage_ville: "",
    contact_nom: "", contact_fonction: "", contact_tel: "", contact_email: "",
    source_connaissance: "", source_detail: "", code_apporteur: "",
  });
  const [besoins, setBesoins] = useState<Besoins>({});
  const [offre, setOffre] = useState<{ formule: Formule | null; engagement_12: boolean; periodicite: Periodicite; date_debut_souhaitee: string }>({
    formule: null, engagement_12: true, periodicite: "mensuel", date_debut_souhaitee: "",
  });
  const [mode, setMode] = useState<ModeEnLigne | null>(null);
  const [contrat, setContrat] = useState({ signataire_nom: "", signataire_qualite: "Gérant(e)", cgv_acceptees: false, cgu_acceptees: false, autorisation_st: false, signature: null as string | null });
  const [rappel, setRappel] = useState({ souhaite: false, creneau: "matin", message: "" });

  // Grille publique + moyens de paiement disponibles.
  useEffect(() => {
    fetch("/api/inscription")
      .then((r) => lireReponse<Chargement>(r))
      .then((r) => {
        if (!r.ok || !r.data) return setErreur(r.error || "Grille tarifaire indisponible.");
        setParams(fusionnerParametres(r.data.parametres));
        setDispo(r.data.dispo);
      })
      .catch(() => setErreur("Grille tarifaire indisponible."));
    prechargerLogoPdf();
  }, []);
  // ?formule=plus (depuis la page d'une formule) → présélection.
  useEffect(() => {
    const slug = query?.get("formule");
    const f = slug ? FICHES.find((x) => x.slug === slug || x.formule === slug) : null;
    if (f) setOffre((o) => ({ ...o, formule: f.formule }));
  }, [query]);

  const reco = useMemo(() => recommanderFormule(besoins), [besoins]);
  const formule: Formule = offre.formule || reco.formule;
  const grille = useMemo(() => (params ? grilleTarifs(params) : []), [params]);
  const prix = useMemo(() => (params ? prixVente(formule, { engagement12: offre.engagement_12, periodicite: offre.periodicite, remiseSupp: 0 }, params) : null), [params, formule, offre]);
  const options = useMemo(() => optionsPaiement(offre.periodicite, dispo), [offre.periodicite, dispo]);
  const modeChoisi: ModeEnLigne = mode && options.some((o) => o.mode === mode) ? mode : (options.find((o) => o.recommande) || options[0])?.mode || "virement";

  const vente: VenteContrat | null = params && prix
    ? {
        garage_nom: g.garage_nom, garage_siret: g.garage_siret, garage_adresse: g.garage_adresse, garage_cp: g.garage_cp, garage_ville: g.garage_ville,
        contact_nom: g.contact_nom, contact_fonction: g.contact_fonction, contact_email: g.contact_email, contact_tel: g.contact_tel,
        formule,
        engagement_12: offre.engagement_12 || offre.periodicite === "annuel",
        periodicite: offre.periodicite,
        remise_supp_pct: 0,
        prix_mensuel_ht: prix.mensualite,
        montant_annuel_ht: prix.montantAnnuel,
        mise_en_service_ht: prix.miseEnService,
        mode_paiement: modeChoisi === "stripe" ? "prelevement" : modeChoisi === "qonto" ? "cb" : "virement",
        date_debut_souhaitee: offre.date_debut_souhaitee || null,
        signataire_nom: contrat.signataire_nom,
        signataire_qualite: contrat.signataire_qualite,
        code_apporteur: g.code_apporteur.trim().toUpperCase() || null,
      }
    : null;
  const premiereEcheance = prix ? (offre.periodicite === "annuel" ? prix.montantAnnuel || 0 : prix.mensualite) + prix.miseEnService : 0;

  const setGf = (k: keyof typeof g) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setG((x) => ({ ...x, [k]: e.target.value }));
  const indexEtape = ETAPES_INSCRIPTION.findIndex((e) => e.cle === etape);

  function suivant() {
    setErreur(null);
    if (etape === "garage") {
      if (!g.garage_nom.trim()) return setErreur("Le nom de votre garage est obligatoire.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(g.contact_email.trim())) return setErreur("Indiquez une adresse email valide : ce sera votre identifiant.");
      if (g.contact_tel.replace(/\D/g, "").length < 9) return setErreur("Indiquez un numéro de téléphone : il nous sert uniquement à vous joindre pour la mise en service.");
      if (!g.source_connaissance) return setErreur("Dites-nous comment vous nous avez connus (une seconde, et ça nous aide beaucoup).");
      setEtape("besoins");
    } else if (etape === "besoins") setEtape("offre");
    else if (etape === "offre") setEtape("paiement");
    else if (etape === "paiement") setEtape("contrat");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function precedent() {
    setErreur(null);
    if (indexEtape > 0) setEtape(ETAPES_INSCRIPTION[indexEtape - 1].cle);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function envoyer() {
    if (!vente || !params) return;
    setErreur(null);
    if (!contrat.signataire_nom.trim()) return setErreur("Indiquez le nom du signataire.");
    if (!contrat.cgv_acceptees) return setErreur("Cochez l'acceptation des conditions générales de VENTE.");
    if (!contrat.cgu_acceptees) return setErreur("Cochez l'acceptation des conditions générales d'UTILISATION.");
    if (!contrat.autorisation_st) return setErreur("Cochez l'autorisation d'intervention d'un collaborateur externe (RGPD).");
    if (!contrat.signature) return setErreur("Votre signature est obligatoire.");
    setEnvoi(true);
    try {
      // Le contrat signé est généré ICI (même PDF que celui du commercial) et joint à l'email de confirmation.
      let contrat_pdf: string | null = null;
      try {
        await prechargerLogoPdf();
        contrat_pdf = construireContratPdf(vente, params, { signature: contrat.signature, signeLe: new Date().toISOString(), besoins }).output("datauristring");
      } catch { contrat_pdf = null; }
      const res = await fetch("/api/inscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "inscrire",
          ...g,
          formule,
          engagement_12: offre.engagement_12,
          periodicite: offre.periodicite,
          date_debut_souhaitee: offre.date_debut_souhaitee,
          paiement_en_ligne_mode: modeChoisi,
          besoins,
          cgv_acceptees: true, cgu_acceptees: true, version_cgu: VERSION_CGU, autorisation_sous_traitance: true, version_dpa: VERSION_DPA,
          signataire_nom: contrat.signataire_nom, signataire_qualite: contrat.signataire_qualite, signature: contrat.signature,
          contrat_pdf,
          rappel_souhaite: rappel.souhaite, rappel_tel: g.contact_tel, rappel_creneau: rappel.creneau, rappel_message: rappel.message,
        }),
      });
      const r = await lireReponse<{ numero: string; token: string; url: string | null; erreurPaiement: string | null; inscription: InscriptionPublique }>(res);
      if (!r.ok || !r.data) throw new Error(r.error || "Envoi impossible.");
      setResultat(r.data);
      // Prélèvement automatique : on part tout de suite sur la page de paiement sécurisée.
      if (modeChoisi === "stripe" && r.data.url) {
        window.location.href = r.data.url;
        return;
      }
      setEtape("fini");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  const sourceDetail = SOURCES_CONNAISSANCE.find((s) => s.cle === g.source_connaissance)?.detail;
  const ficheDe = (f: Formule) => FICHES.find((x) => x.formule === f);

  return (
    <div className="landing-pro min-h-screen">
      <VitrineNav />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <span className="lp-chip">{SOCIETE.produit} · inscription en ligne</span>
        <h1 className="mt-3">S&apos;abonner en quelques minutes</h1>
        <p className="mt-2 text-slate-500">
          Vos coordonnées, vos besoins, la formule qui vous correspond, le contrat signé en ligne et le paiement sécurisé : votre compte est créé automatiquement dès le paiement confirmé. Aucun rendez-vous commercial nécessaire — mais on vous rappelle si vous le souhaitez.
        </p>

        {etape !== "fini" && (
          <ol className="mt-6 flex flex-wrap gap-2 text-xs">
            {ETAPES_INSCRIPTION.map((e, i) => {
              const actif = e.cle === etape;
              const fait = indexEtape > i;
              return (
                <li key={e.cle} className={`rounded-full px-3 py-1 font-semibold ${actif ? "bg-violet-700 text-white" : fait ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
                  {i + 1}. {e.label}
                </li>
              );
            })}
          </ol>
        )}

        {erreur && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{erreur}</div>}

        {/* ---------------- 1. Votre garage ---------------- */}
        {etape === "garage" && (
          <div className="lp-card mt-6 p-6 sm:p-8">
            <h2 className="!text-lg font-semibold">Votre garage</h2>
            <p className="mt-1 text-sm text-slate-500">Ces informations figurent sur votre contrat et pré-remplissent votre compte.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Champ label="Nom du garage *"><input className="lp-input" value={g.garage_nom} onChange={setGf("garage_nom")} autoComplete="organization" /></Champ>
              <Champ label="SIRET"><input className="lp-input" value={g.garage_siret} onChange={setGf("garage_siret")} inputMode="numeric" /></Champ>
              <Champ label="Adresse" full><input className="lp-input" value={g.garage_adresse} onChange={setGf("garage_adresse")} autoComplete="street-address" /></Champ>
              <Champ label="Code postal"><input className="lp-input" value={g.garage_cp} onChange={setGf("garage_cp")} inputMode="numeric" autoComplete="postal-code" /></Champ>
              <Champ label="Ville"><input className="lp-input" value={g.garage_ville} onChange={setGf("garage_ville")} autoComplete="address-level2" /></Champ>
              <Champ label="Votre nom *"><input className="lp-input" value={g.contact_nom} onChange={setGf("contact_nom")} autoComplete="name" /></Champ>
              <Champ label="Votre fonction"><input className="lp-input" value={g.contact_fonction} onChange={setGf("contact_fonction")} placeholder="Gérant, responsable atelier…" /></Champ>
              <Champ label="Téléphone *"><input className="lp-input" type="tel" value={g.contact_tel} onChange={setGf("contact_tel")} autoComplete="tel" /></Champ>
              <Champ label="Email * (identifiant de votre compte)"><input className="lp-input" type="email" value={g.contact_email} onChange={setGf("contact_email")} autoComplete="email" /></Champ>
            </div>

            <h3 className="mt-6 !text-base font-semibold">Comment nous avez-vous connus ? *</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {SOURCES_CONNAISSANCE.map((s) => (
                <label key={s.cle} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${g.source_connaissance === s.cle ? "border-violet-600 bg-violet-50" : "border-slate-200"}`}>
                  <input type="radio" name="source" checked={g.source_connaissance === s.cle} onChange={() => setG((x) => ({ ...x, source_connaissance: s.cle, source_detail: "" }))} />
                  {s.label}
                </label>
              ))}
            </div>
            {sourceDetail && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Champ label={sourceDetail}><input className="lp-input" value={g.source_detail} onChange={setGf("source_detail")} /></Champ>
                {g.source_connaissance === "commercial" && (
                  <Champ label="Code apporteur (si vous l'avez)"><input className="lp-input uppercase" value={g.code_apporteur} onChange={setGf("code_apporteur")} placeholder="ex. AB1234" /></Champ>
                )}
              </div>
            )}
            <p className="mt-4 text-xs text-slate-500">
              Vos données servent uniquement à établir votre contrat, créer votre compte et vous accompagner à la mise en service — jamais revendues. <Link href="/confidentialite" className="underline">Politique de confidentialité</Link>.
            </p>
            <Nav onPrev={null} onNext={suivant} />
            <DemandeRappel defauts={{ garage_nom: g.garage_nom, contact_nom: g.contact_nom, tel: g.contact_tel, email: g.contact_email }} etape="Votre garage" source_connaissance={g.source_connaissance} />
          </div>
        )}

        {/* ---------------- 2. Vos besoins ---------------- */}
        {etape === "besoins" && (
          <div className="lp-card mt-6 p-6 sm:p-8">
            <h2 className="!text-lg font-semibold">Vos besoins</h2>
            <p className="mt-1 text-sm text-slate-500">Deux minutes : vos réponses nous servent à vous conseiller LA formule adaptée (vous restez libre de choisir) et à préparer votre mise en service.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {QUESTIONS_BESOINS.map((q) => (
                <Champ key={q.cle} label={q.label} full={q.type === "multi" || q.type === "texte"}>
                  {q.type === "texte" && <input className="lp-input" value={String(besoins[q.cle] ?? "")} onChange={(e) => setBesoins((b) => ({ ...b, [q.cle]: e.target.value }))} />}
                  {q.type === "nombre" && <input className="lp-input" inputMode="numeric" value={String(besoins[q.cle] ?? "")} onChange={(e) => setBesoins((b) => ({ ...b, [q.cle]: e.target.value }))} />}
                  {q.type === "choix" && (
                    <select className="lp-input" value={String(besoins[q.cle] ?? "")} onChange={(e) => setBesoins((b) => ({ ...b, [q.cle]: e.target.value }))}>
                      <option value="">—</option>
                      {q.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                  {q.type === "multi" && (
                    <div className="flex flex-wrap gap-2">
                      {q.options!.map((o) => {
                        const cur = Array.isArray(besoins[q.cle]) ? (besoins[q.cle] as string[]) : [];
                        const sel = cur.includes(o);
                        return (
                          <button key={o} type="button" onClick={() => setBesoins((b) => ({ ...b, [q.cle]: sel ? cur.filter((x) => x !== o) : [...cur, o] }))}
                            className={`rounded-full border px-3 py-1 text-xs ${sel ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 text-slate-600"}`}>
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Champ>
              ))}
            </div>
            <Nav onPrev={precedent} onNext={suivant} nextLabel="Voir la formule conseillée →" />
            <DemandeRappel defauts={{ garage_nom: g.garage_nom, contact_nom: g.contact_nom, tel: g.contact_tel, email: g.contact_email }} etape="Vos besoins" source_connaissance={g.source_connaissance} />
          </div>
        )}

        {/* ---------------- 3. Votre formule ---------------- */}
        {etape === "offre" && params && prix && (
          <div className="lp-card mt-6 p-6 sm:p-8">
            <h2 className="!text-lg font-semibold">Notre conseil : {ficheDe(reco.formule)?.nom || params.formules[reco.formule].libelle}</h2>
            <p className="mt-1 text-sm text-slate-600">{reco.resume}</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {reco.raisons.map((r) => <li key={r}>• {r}</li>)}
            </ul>
            <p className="mt-3 text-xs text-slate-500">Vous restez libre de choisir une autre formule ; vous pourrez changer plus tard (CGV, article 12).</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {grille.map((t) => {
                const fiche = ficheDe(t.formule);
                const conseillee = t.formule === reco.formule;
                return (
                  <button key={t.formule} type="button" onClick={() => setOffre((o) => ({ ...o, formule: t.formule }))}
                    className={`relative rounded-xl border-2 p-4 text-left transition ${formule === t.formule ? "border-violet-600 bg-violet-50" : "border-slate-200 hover:border-violet-300"}`}>
                    {conseillee && <span className="absolute -top-2.5 right-3 rounded-full bg-violet-700 px-2 py-0.5 text-[11px] font-semibold text-white">Conseillée pour vous</span>}
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-bold text-slate-800">{fiche?.nom || t.libelle}</span>
                      <span className="text-xs text-slate-500">{t.heures ? `${t.heures} h / mois` : "appli seule"}</span>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      <div>{eur(t.mensuel)} / mois sans engagement</div>
                      <div className="font-semibold text-violet-700">{eur(t.mensuelEngage)} / mois avec engagement 12 mois (−{t.remiseEngagementPct} %)</div>
                      <div className="text-xs text-slate-500">Année en une fois : {eur(t.annuelUnique)} ({t.bonusAnnuelLibelle})</div>
                    </div>
                    {fiche && <p className="mt-2 text-xs text-slate-500">{fiche.pourQui}</p>}
                  </button>
                );
              })}
            </div>

            <h3 className="mt-6 !text-base font-semibold">Comment souhaitez-vous payer ?</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${offre.periodicite === "mensuel" && !offre.engagement_12 ? "border-violet-600 bg-violet-50" : "border-slate-200"}`}>
                <input type="radio" name="per" className="mt-1" checked={offre.periodicite === "mensuel" && !offre.engagement_12} onChange={() => setOffre((o) => ({ ...o, periodicite: "mensuel", engagement_12: false }))} />
                <span><b>Mensuel sans engagement</b><br /><span className="text-xs text-slate-500">Résiliable à tout moment (préavis 1 mois). Mise en service {eur(params.miseEnService)}.</span></span>
              </label>
              <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${offre.periodicite === "mensuel" && offre.engagement_12 ? "border-violet-600 bg-violet-50" : "border-slate-200"}`}>
                <input type="radio" name="per" className="mt-1" checked={offre.periodicite === "mensuel" && offre.engagement_12} onChange={() => setOffre((o) => ({ ...o, periodicite: "mensuel", engagement_12: true }))} />
                <span><b>Mensuel, engagement 12 mois</b><br /><span className="text-xs text-slate-500">Mensualité remisée, mise en service offerte.</span></span>
              </label>
              <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${offre.periodicite === "annuel" ? "border-violet-600 bg-violet-50" : "border-slate-200"}`}>
                <input type="radio" name="per" className="mt-1" checked={offre.periodicite === "annuel"} onChange={() => setOffre((o) => ({ ...o, periodicite: "annuel", engagement_12: true }))} />
                <span><b>Année payée en une fois</b><br /><span className="text-xs text-slate-500">Le meilleur prix, renouvelé chaque année (vous êtes prévenu 30 jours avant).</span></span>
              </label>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Champ label="Date de mise en service souhaitée (facultatif)">
                <input className="lp-input" type="date" value={offre.date_debut_souhaitee} onChange={(e) => setOffre((o) => ({ ...o, date_debut_souhaitee: e.target.value }))} />
              </Champ>
            </div>
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              <div className="font-semibold text-slate-800">Récapitulatif</div>
              <ul className="mt-1 space-y-0.5">{vente && conditionsParticulieres(vente, params).map((l, i) => <li key={i}>• {l}</li>)}</ul>
              <p className="mt-2 text-xs text-slate-500">Prix nets — {MENTION_TVA}.</p>
            </div>
            <Nav onPrev={precedent} onNext={suivant} />
            <DemandeRappel defauts={{ garage_nom: g.garage_nom, contact_nom: g.contact_nom, tel: g.contact_tel, email: g.contact_email }} etape="Votre formule" source_connaissance={g.source_connaissance} formule_conseillee={reco.formule} />
          </div>
        )}

        {/* ---------------- 4. Paiement ---------------- */}
        {etape === "paiement" && params && prix && (
          <div className="lp-card mt-6 p-6 sm:p-8">
            <h2 className="!text-lg font-semibold">Le paiement</h2>
            <p className="mt-1 text-sm text-slate-500">
              Première échéance : <b className="text-slate-800">{eur(premiereEcheance)}</b>
              {offre.periodicite === "annuel" ? " (année complète)" : " (première mensualité)"}
              {prix.miseEnService ? `, dont mise en service ${eur(prix.miseEnService)}` : ""} — {MENTION_TVA}. Facture émise par {SOCIETE.editeur} au nom de {SOCIETE.produit}.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {options.map((o) => (
                <label key={o.mode} className={`flex items-start gap-2 rounded-xl border-2 p-4 text-sm ${modeChoisi === o.mode ? "border-violet-600 bg-violet-50" : "border-slate-200"}`}>
                  <input type="radio" name="mode" className="mt-1" checked={modeChoisi === o.mode} onChange={() => setMode(o.mode)} />
                  <span>
                    <b className="text-slate-800">{o.titre}</b>{o.recommande && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Conseillé</span>}
                    <br /><span className="text-xs text-slate-600">{o.detail}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600">
              <div className="text-sm font-semibold text-slate-800">Ce que vous signez, en clair</div>
              {offre.periodicite === "annuel" ? (
                <p className="mt-1">Abonnement de 12 mois payé en une fois, <b>reconduit tacitement chaque année</b> pour 12 mois au même tarif. Vous recevez un avis par email <b>30 jours avant</b> chaque échéance, avec le règlement de la nouvelle année : pour ne pas reconduire, il suffit de nous l&apos;écrire avant cette date, sans frais.</p>
              ) : offre.engagement_12 ? (
                <p className="mt-1">Abonnement mensuel avec <b>engagement ferme de 12 mois</b> (en contrepartie de la remise et de la mise en service offerte), payé d&apos;avance chaque mois{modeChoisi === "stripe" ? " par prélèvement automatique" : " sur appel de paiement"}. Au terme des 12 mois, il se poursuit mois par mois, résiliable avec un mois de préavis.</p>
              ) : (
                <p className="mt-1">Abonnement mensuel <b>sans engagement</b>, payé d&apos;avance chaque mois{modeChoisi === "stripe" ? " par prélèvement automatique" : " sur appel de paiement"}, résiliable à tout moment par simple email avec un préavis d&apos;un mois.</p>
              )}
              {modeChoisi === "stripe" && <p className="mt-1">Le prélèvement est opéré par Stripe (carte ou SEPA). Vous recevez chaque facture par email et pouvez changer de moyen de paiement à tout moment en nous écrivant.</p>}
              <p className="mt-1">Détails complets dans les conditions générales de vente (articles 2 et 4) que vous lirez à l&apos;étape suivante.</p>
            </div>
            <Nav onPrev={precedent} onNext={suivant} nextLabel="Lire et signer le contrat →" />
            <DemandeRappel defauts={{ garage_nom: g.garage_nom, contact_nom: g.contact_nom, tel: g.contact_tel, email: g.contact_email }} etape="Paiement" source_connaissance={g.source_connaissance} formule_conseillee={reco.formule} />
          </div>
        )}

        {/* ---------------- 5. Contrat ---------------- */}
        {etape === "contrat" && params && vente && (
          <div className="lp-card mt-6 p-6 sm:p-8">
            <h2 className="!text-lg font-semibold">Votre contrat d&apos;abonnement</h2>
            <p className="mt-1 text-sm text-slate-500">Lisez-le, cochez les trois acceptations et signez avec le doigt ou la souris. Vous recevrez le contrat signé (PDF) par email immédiatement.</p>
            <div className="mt-4 max-h-[24rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <div className="font-semibold text-slate-800">Conditions particulières</div>
              <ul className="mt-1 space-y-0.5">{conditionsParticulieres(vente, params).map((l, i) => <li key={i}>• {l}</li>)}</ul>
              <div className="mt-4 font-semibold text-slate-800">Conditions générales de vente</div>
              {articlesCGV(params).map((a) => (
                <div key={a.titre} className="mt-2">
                  <div className="text-xs font-semibold text-slate-700">{a.titre}</div>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600">{a.texte}</p>
                </div>
              ))}
              <div className="mt-5 font-semibold text-slate-800">Conditions générales d&apos;utilisation</div>
              {articlesCGU().map((a) => (
                <div key={a.titre} className="mt-2">
                  <div className="text-xs font-semibold text-slate-700">{a.titre}</div>
                  <p className="text-xs leading-relaxed text-slate-600">{a.texte}</p>
                </div>
              ))}
              <div className="mt-5 font-semibold text-slate-800">Accord de traitement des données (annexe RGPD)</div>
              {articlesDPA().map((a) => (
                <div key={a.titre} className="mt-2">
                  <div className="text-xs font-semibold text-slate-700">{a.titre}</div>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600">{a.texte}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Champ label="Nom du signataire *"><input className="lp-input" value={contrat.signataire_nom} onChange={(e) => setContrat((c) => ({ ...c, signataire_nom: e.target.value }))} placeholder={g.contact_nom} /></Champ>
              <Champ label="Qualité"><input className="lp-input" value={contrat.signataire_qualite} onChange={(e) => setContrat((c) => ({ ...c, signataire_qualite: e.target.value }))} /></Champ>
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-1 shrink-0" checked={contrat.cgv_acceptees} onChange={(e) => setContrat((c) => ({ ...c, cgv_acceptees: e.target.checked }))} />
              <span className="min-w-0">{ACCEPTATION_CGV}</span>
            </label>
            <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-1 shrink-0" checked={contrat.cgu_acceptees} onChange={(e) => setContrat((c) => ({ ...c, cgu_acceptees: e.target.checked }))} />
              <span className="min-w-0">{ACCEPTATION_CGU}</span>
            </label>
            <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-1 shrink-0" checked={contrat.autorisation_st} onChange={(e) => setContrat((c) => ({ ...c, autorisation_st: e.target.checked }))} />
              <span className="min-w-0">{AUTORISATION_SOUS_TRAITANCE}</span>
            </label>
            <div className="mt-4">
              <div className="text-sm font-semibold text-slate-700">Votre signature</div>
              <div className="mt-1 h-40 overflow-hidden rounded-xl border-2 border-dashed border-violet-300 bg-white">
                <SignaturePad onChange={(d) => setContrat((c) => ({ ...c, signature: d }))} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Signature électronique horodatée (date, heure, adresse IP), conservée avec le contrat.</p>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <label className="flex items-start gap-2 text-slate-700">
                <input type="checkbox" className="mt-1" checked={rappel.souhaite} onChange={(e) => setRappel((r) => ({ ...r, souhaite: e.target.checked }))} />
                <span>Je souhaite être rappelé(e) pour ma mise en service (au {g.contact_tel || "numéro indiqué"})</span>
              </label>
              {rappel.souhaite && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Champ label="Quand ?">
                    <select className="lp-input" value={rappel.creneau} onChange={(e) => setRappel((r) => ({ ...r, creneau: e.target.value }))}>
                      {CRENEAUX_RAPPEL.map((c) => <option key={c.cle} value={c.cle}>{c.label}</option>)}
                    </select>
                  </Champ>
                  <Champ label="À propos de quoi ? (facultatif)"><input className="lp-input" value={rappel.message} onChange={(e) => setRappel((r) => ({ ...r, message: e.target.value }))} /></Champ>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <button className="lp-btn-ghost" onClick={precedent} disabled={envoi}>← Précédent</button>
              <button className="lp-btn" onClick={envoyer} disabled={envoi}>
                {envoi ? "Enregistrement…" : modeChoisi === "stripe" ? "Je m'abonne et je règle en ligne →" : "Je m'abonne (commande avec obligation de paiement)"}
              </button>
            </div>
            <p className="mt-2 text-right text-xs text-slate-500">
              {modeChoisi === "stripe" ? "Vous serez redirigé vers la page de paiement sécurisée Stripe." : modeChoisi === "qonto" ? "Le lien de paiement sécurisé s'affiche juste après." : "Les coordonnées du virement s'affichent juste après et vous sont envoyées par email."}
            </p>
          </div>
        )}

        {/* ---------------- Fini ---------------- */}
        {etape === "fini" && resultat && (
          <div className="lp-card mt-6 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
              <div>
                <h3 className="!text-lg font-semibold">Contrat n° {resultat.numero} signé — merci !</h3>
                <p className="text-sm text-slate-500">Votre contrat signé vous a été envoyé par email à {g.contact_email}. Il ne reste plus que le paiement de la première échéance.</p>
              </div>
            </div>
            {resultat.erreurPaiement && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Le paiement en ligne n&apos;a pas pu être préparé ({resultat.erreurPaiement}). Vous pouvez réessayer depuis votre page de suivi ou régler par virement.</div>}
            {modeChoisi === "qonto" && (resultat.url || resultat.inscription.qonto_url) && (
              <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4">
                <div className="font-semibold text-violet-900">Payer maintenant — {eur(premiereEcheance)}</div>
                <p className="mt-1 text-xs text-slate-600">Paiement par carte sur une page sécurisée. Votre compte est créé automatiquement dès confirmation (quelques minutes).</p>
                <a href={resultat.url || resultat.inscription.qonto_url || "#"} target="_blank" rel="noreferrer" className="lp-btn mt-3 inline-block">Régler {eur(premiereEcheance)} en ligne →</a>
              </div>
            )}
            {resultat.inscription.virement && (
              <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <div className="font-semibold text-slate-800">Virement de {eur(resultat.inscription.virement.montant)}</div>
                <dl className="mt-2 grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-4">
                  <dt className="text-slate-500">Bénéficiaire</dt><dd>{SOCIETE.editeur} — {SOCIETE.produit}</dd>
                  <dt className="text-slate-500">IBAN</dt><dd className="font-mono">{resultat.inscription.virement.iban}</dd>
                  {resultat.inscription.virement.bic && <><dt className="text-slate-500">BIC</dt><dd className="font-mono">{resultat.inscription.virement.bic}</dd></>}
                  <dt className="text-slate-500">Référence</dt><dd className="font-mono">{resultat.inscription.virement.reference}</dd>
                </dl>
                <p className="mt-2 text-xs text-slate-500">Votre compte est activé à réception du virement (1 à 2 jours ouvrés) ; vous recevez alors vos identifiants par email.</p>
              </div>
            )}
            {!resultat.inscription.virement && !(resultat.url || resultat.inscription.qonto_url) && !resultat.inscription.paye && (
              <p className="mt-4 text-sm text-slate-600">Les coordonnées de règlement vous ont été envoyées par email.</p>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={`/inscription/merci?token=${encodeURIComponent(resultat.token)}`} className="lp-btn-ghost">Suivre mon inscription</Link>
            </div>
            <DemandeRappel defauts={{ garage_nom: g.garage_nom, contact_nom: g.contact_nom, tel: g.contact_tel, email: g.contact_email }} etape="Après signature" source_connaissance={g.source_connaissance} formule_conseillee={reco.formule} />
          </div>
        )}
      </div>
      <VitrineFooter />
    </div>
  );
}

function Champ({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}
function Nav({ onPrev, onNext, nextLabel }: { onPrev: (() => void) | null; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="mt-6 flex justify-between gap-2">
      {onPrev ? <button className="lp-btn-ghost" onClick={onPrev}>← Précédent</button> : <span />}
      <button className="lp-btn" onClick={onNext}>{nextLabel || "Suivant →"}</button>
    </div>
  );
}
