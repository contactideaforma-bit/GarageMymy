"use client";

// ============================================================
//  DÉCLARATION DE VENTE — page PUBLIQUE du commercial (v10.0).
//
//  Le commercial n'a pas de compte : il entre son CODE APPORTEUR, remplit
//  avec le garage la fiche de renseignement, choisit la formule (prix
//  calculés en direct depuis la grille de l'éditeur), le mode de paiement
//  (y compris règlement sur place à l'ordre d'IDEAFORMA), fait lire et
//  SIGNER le contrat + CGV sur la tablette, puis envoie. L'éditeur reçoit
//  la vente dans /admin/ventes, la valide et crée le compte.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { VitrineNav, VitrineFooter } from "@/components/vitrine/Vitrine";
import { SOCIETE } from "@/components/vitrine/societe";
import SignaturePad from "@/components/SignaturePad";
import { lireReponse } from "@/lib/apiClient";
import { FORMULES, Formule, Parametres, Periodicite, fusionnerParametres, grilleTarifs, prixVente, primeVente } from "@/lib/admin/economie";
import { QUESTIONS_BESOINS, ReponseCode } from "@/lib/admin/ventePublic";
import { ACCEPTATION_CGV, MODES_PAIEMENT, VenteContrat, articlesCGV, conditionsParticulieres } from "@/lib/admin/contratGarage";
import { telechargerContratPdf } from "@/lib/admin/contratPdf";

const eur = (n: number | null | undefined) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

type Etape = "code" | "garage" | "besoins" | "offre" | "paiement" | "contrat" | "fini";
const ETAPES: { cle: Etape; label: string }[] = [
  { cle: "garage", label: "Garage" },
  { cle: "besoins", label: "Besoins" },
  { cle: "offre", label: "Offre" },
  { cle: "paiement", label: "Paiement" },
  { cle: "contrat", label: "Contrat" },
];

export default function VentePage() {
  const [etape, setEtape] = useState<Etape>("code");
  const [code, setCode] = useState("");
  const [commercial, setCommercial] = useState<ReponseCode["commercial"] | null>(null);
  const [params, setParams] = useState<Parametres | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<{ numero: string; signeLe: string } | null>(null);

  // Mémorise le code sur l'appareil du commercial (tablette de démo).
  useEffect(() => {
    try {
      const c = localStorage.getItem("mea-code-apporteur");
      if (c) setCode(c);
    } catch { /* ignore */ }
  }, []);

  const [g, setG] = useState({
    garage_nom: "", garage_siret: "", garage_adresse: "", garage_cp: "", garage_ville: "",
    contact_nom: "", contact_fonction: "", contact_tel: "", contact_email: "",
  });
  const [besoins, setBesoins] = useState<Record<string, string | string[] | number>>({});
  const [offre, setOffre] = useState<{ formule: Formule; engagement_12: boolean; periodicite: Periodicite; remise_supp_pct: number; date_debut_souhaitee: string }>({
    formule: "starter", engagement_12: true, periodicite: "mensuel", remise_supp_pct: 0, date_debut_souhaitee: "",
  });
  const [paiement, setPaiement] = useState({ mode_paiement: "virement", paiement_sur_place: false, paiement_montant: "", paiement_reference: "" });
  const [contrat, setContrat] = useState({ signataire_nom: "", signataire_qualite: "Gérant(e)", cgv_acceptees: false, signature: null as string | null });

  const prix = useMemo(() => (params ? prixVente(offre.formule, { engagement12: offre.engagement_12, periodicite: offre.periodicite, remiseSupp: offre.remise_supp_pct }, params) : null), [params, offre]);
  const prime = useMemo(
    () => (params && prix ? primeVente(offre.formule, { engagement12: offre.engagement_12 || offre.periodicite === "annuel", periodicite: offre.periodicite, mensualiteFacturee: prix.montantAnnuel != null ? prix.montantAnnuel / 12 : prix.mensualite }, params) : null),
    [params, prix, offre]
  );
  const grille = useMemo(() => (params ? grilleTarifs(params) : []), [params]);

  const vente: VenteContrat | null = params && prix
    ? {
        ...g,
        formule: offre.formule,
        engagement_12: offre.engagement_12 || offre.periodicite === "annuel",
        periodicite: offre.periodicite,
        remise_supp_pct: offre.remise_supp_pct,
        prix_mensuel_ht: prix.mensualite,
        montant_annuel_ht: prix.montantAnnuel,
        mise_en_service_ht: prix.miseEnService,
        mode_paiement: paiement.mode_paiement,
        date_debut_souhaitee: offre.date_debut_souhaitee || null,
        signataire_nom: contrat.signataire_nom,
        signataire_qualite: contrat.signataire_qualite,
        code_apporteur: code.toUpperCase(),
      }
    : null;

  const montantDu = prix ? (offre.periodicite === "annuel" ? (prix.montantAnnuel || 0) : prix.mensualite) + prix.miseEnService : 0;

  async function verifierCode() {
    setErreur(null);
    const res = await fetch(`/api/vente?code=${encodeURIComponent(code.trim())}`);
    const r = await lireReponse<ReponseCode>(res);
    if (!r.ok || !r.data) {
      setErreur(r.error || "Code inconnu.");
      return;
    }
    setCommercial(r.data.commercial);
    setParams(fusionnerParametres(r.data.parametres));
    try { localStorage.setItem("mea-code-apporteur", code.trim().toUpperCase()); } catch { /* ignore */ }
    setEtape("garage");
  }

  function suivant() {
    setErreur(null);
    if (etape === "garage") {
      if (!g.garage_nom.trim() || !g.contact_email.trim()) return setErreur("Le nom du garage et l'email du contact sont obligatoires.");
      setEtape("besoins");
    } else if (etape === "besoins") setEtape("offre");
    else if (etape === "offre") setEtape("paiement");
    else if (etape === "paiement") {
      if (paiement.paiement_sur_place && !paiement.paiement_reference.trim()) return setErreur("Indique la référence du paiement reçu (n° de chèque, référence du virement, n° du reçu).");
      setEtape("contrat");
    }
  }
  function precedent() {
    const i = ETAPES.findIndex((e) => e.cle === etape);
    setEtape(i <= 0 ? "code" : ETAPES[i - 1].cle);
  }

  async function envoyer() {
    if (!vente) return;
    setErreur(null);
    if (!contrat.signataire_nom.trim()) return setErreur("Indique le nom du signataire.");
    if (!contrat.cgv_acceptees) return setErreur("Le garage doit cocher l'acceptation des conditions.");
    if (!contrat.signature) return setErreur("La signature du garage est obligatoire.");
    setEnvoi(true);
    try {
      const res = await fetch("/api/vente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code_apporteur: code.trim().toUpperCase(),
          ...g,
          ...offre,
          ...paiement,
          paiement_montant: paiement.paiement_montant ? Number(String(paiement.paiement_montant).replace(",", ".")) : null,
          besoins,
          cgv_acceptees: true,
          signataire_nom: contrat.signataire_nom,
          signataire_qualite: contrat.signataire_qualite,
          signature: contrat.signature,
        }),
      });
      const r = await lireReponse<{ numero: string }>(res);
      if (!r.ok || !r.data) throw new Error(r.error || "Envoi impossible.");
      setResultat({ numero: r.data.numero, signeLe: new Date().toISOString() });
      setEtape("fini");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  function pdf() {
    if (!vente || !params) return;
    telechargerContratPdf(vente, params, { numero: resultat?.numero, signature: contrat.signature, signeLe: resultat?.signeLe || new Date().toISOString(), besoins });
  }

  const setGf = (k: keyof typeof g) => (e: React.ChangeEvent<HTMLInputElement>) => setG((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="landing-pro min-h-screen">
      <VitrineNav />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <span className="lp-chip">{SOCIETE.signature} · espace commercial</span>
        <h1 className="mt-3">Déclarer une vente</h1>
        <p className="mt-2 text-slate-500">
          {commercial ? `Bonjour ${[commercial.prenom, commercial.nom].filter(Boolean).join(" ")}. ` : ""}
          Fiche du garage, besoins, formule, paiement, contrat signé sur place : tout part à IDEAFORMA en une fois.
        </p>

        {etape !== "code" && etape !== "fini" && (
          <ol className="mt-6 flex flex-wrap gap-2 text-xs">
            {ETAPES.map((e, i) => {
              const actif = e.cle === etape;
              const fait = ETAPES.findIndex((x) => x.cle === etape) > i;
              return (
                <li key={e.cle} className={`rounded-full px-3 py-1 font-semibold ${actif ? "bg-violet-700 text-white" : fait ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
                  {i + 1}. {e.label}
                </li>
              );
            })}
          </ol>
        )}

        {erreur && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{erreur}</div>}

        {/* ---------------- Code apporteur ---------------- */}
        {etape === "code" && (
          <div className="lp-card mt-6 p-6 sm:p-8">
            <label className="text-sm font-semibold text-slate-700">Votre code apporteur</label>
            <div className="mt-2 flex gap-2">
              <input className="lp-input uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex. AB1234" autoCapitalize="characters" />
              <button className="lp-btn" onClick={verifierCode} disabled={!code.trim()}>Continuer</button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Le code vous a été remis avec votre contrat d&apos;apporteur d&apos;affaires. Il identifie vos ventes et déclenche vos primes.
            </p>
          </div>
        )}

        {/* ---------------- Garage ---------------- */}
        {etape === "garage" && (
          <div className="lp-card mt-6 p-6 sm:p-8">
            <h2 className="!text-lg font-semibold">Le garage</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Champ label="Nom du garage *"><input className="lp-input" value={g.garage_nom} onChange={setGf("garage_nom")} /></Champ>
              <Champ label="SIRET"><input className="lp-input" value={g.garage_siret} onChange={setGf("garage_siret")} inputMode="numeric" /></Champ>
              <Champ label="Adresse" full><input className="lp-input" value={g.garage_adresse} onChange={setGf("garage_adresse")} /></Champ>
              <Champ label="Code postal"><input className="lp-input" value={g.garage_cp} onChange={setGf("garage_cp")} inputMode="numeric" /></Champ>
              <Champ label="Ville"><input className="lp-input" value={g.garage_ville} onChange={setGf("garage_ville")} /></Champ>
              <Champ label="Nom du contact"><input className="lp-input" value={g.contact_nom} onChange={setGf("contact_nom")} /></Champ>
              <Champ label="Fonction"><input className="lp-input" value={g.contact_fonction} onChange={setGf("contact_fonction")} placeholder="Gérant, responsable atelier…" /></Champ>
              <Champ label="Téléphone"><input className="lp-input" type="tel" value={g.contact_tel} onChange={setGf("contact_tel")} /></Champ>
              <Champ label="Email * (identifiant du futur compte)"><input className="lp-input" type="email" value={g.contact_email} onChange={setGf("contact_email")} /></Champ>
            </div>
            <Nav onPrev={precedent} onNext={suivant} />
          </div>
        )}

        {/* ---------------- Besoins ---------------- */}
        {etape === "besoins" && (
          <div className="lp-card mt-6 p-6 sm:p-8">
            <h2 className="!text-lg font-semibold">Fiche de renseignement — les besoins du garage</h2>
            <p className="mt-1 text-sm text-slate-500">À remplir avec le garagiste : elle guide la mise en service et le choix de la formule.</p>
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
                        const sel = Array.isArray(besoins[q.cle]) && (besoins[q.cle] as string[]).includes(o);
                        return (
                          <button
                            key={o}
                            type="button"
                            onClick={() => setBesoins((b) => {
                              const cur = Array.isArray(b[q.cle]) ? (b[q.cle] as string[]) : [];
                              return { ...b, [q.cle]: sel ? cur.filter((x) => x !== o) : [...cur, o] };
                            })}
                            className={`rounded-full border px-3 py-1 text-xs ${sel ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 text-slate-600"}`}
                          >
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Champ>
              ))}
            </div>
            <Nav onPrev={precedent} onNext={suivant} />
          </div>
        )}

        {/* ---------------- Offre ---------------- */}
        {etape === "offre" && params && prix && (
          <div className="lp-card mt-6 p-6 sm:p-8">
            <h2 className="!text-lg font-semibold">La formule</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {grille.map((t) => (
                <button
                  key={t.formule}
                  type="button"
                  onClick={() => setOffre((o) => ({ ...o, formule: t.formule }))}
                  className={`rounded-xl border-2 p-4 text-left transition ${offre.formule === t.formule ? "border-violet-600 bg-violet-50" : "border-slate-200 hover:border-violet-300"}`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-bold text-slate-800">{t.libelle}</span>
                    <span className="text-sm text-slate-500">{t.heures ? `${t.heures} h / mois` : "appli seule"}</span>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    <div>{eur(t.mensuel)} HT / mois sans engagement</div>
                    <div className="font-semibold text-violet-700">{eur(t.mensuelEngage)} HT / mois avec engagement 12 mois (−{t.remiseEngagementPct} %)</div>
                    <div className="text-xs text-slate-500">Année en une fois : {eur(t.annuelUnique)} HT ({t.bonusAnnuelLibelle})</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input type="radio" name="per" checked={offre.periodicite === "mensuel" && !offre.engagement_12} onChange={() => setOffre((o) => ({ ...o, periodicite: "mensuel", engagement_12: false }))} />
                Mensuel sans engagement
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input type="radio" name="per" checked={offre.periodicite === "mensuel" && offre.engagement_12} onChange={() => setOffre((o) => ({ ...o, periodicite: "mensuel", engagement_12: true }))} />
                Mensuel, engagement 12 mois
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input type="radio" name="per" checked={offre.periodicite === "annuel"} onChange={() => setOffre((o) => ({ ...o, periodicite: "annuel", engagement_12: true }))} />
                Année payée en une fois
              </label>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Champ label="Remise exceptionnelle (%) — soumise à validation IDEAFORMA">
                <input className="lp-input" inputMode="decimal" value={offre.remise_supp_pct || ""} onChange={(e) => setOffre((o) => ({ ...o, remise_supp_pct: Math.min(30, Number(e.target.value) || 0) }))} placeholder="0" />
              </Champ>
              <Champ label="Mise en service souhaitée">
                <input className="lp-input" type="date" value={offre.date_debut_souhaitee} onChange={(e) => setOffre((o) => ({ ...o, date_debut_souhaitee: e.target.value }))} />
              </Champ>
            </div>
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              <div className="font-semibold text-slate-800">Récapitulatif</div>
              <ul className="mt-1 space-y-0.5">
                {vente && conditionsParticulieres(vente, params).map((l, i) => <li key={i}>• {l}</li>)}
              </ul>
              {prime && (
                <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
                  Votre prime sur cette vente : <b className="text-slate-700">{eur(prime.total)}</b> — acquise à la {prime.mensualiteEcheance}
                  <sup>{prime.mensualiteEcheance === 1 ? "re" : "e"}</sup> mensualité encaissée par IDEAFORMA
                  {offre.engagement_12 || offre.periodicite === "annuel" ? " (immédiate grâce à l'engagement)" : " (différée de deux mois sans engagement)"} ; reprise si le garage arrête avant la {prime.mensualitesReprise}
                  <sup>e</sup> mensualité.
                </p>
              )}
            </div>
            <Nav onPrev={precedent} onNext={suivant} />
          </div>
        )}

        {/* ---------------- Paiement ---------------- */}
        {etape === "paiement" && params && prix && (
          <div className="lp-card mt-6 p-6 sm:p-8">
            <h2 className="!text-lg font-semibold">Le paiement</h2>
            <p className="mt-1 text-sm text-slate-500">
              Première échéance : <b>{eur(montantDu)} HT</b>
              {offre.periodicite === "annuel" ? " (année complète)" : " (première mensualité)"}
              {prix.miseEnService ? ` dont mise en service ${eur(prix.miseEnService)}` : ""}, TVA en sus. Facture émise par IDEAFORMA.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {Object.entries(MODES_PAIEMENT).map(([k, l]) => (
                <label key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${paiement.mode_paiement === k ? "border-violet-600 bg-violet-50" : "border-slate-200"}`}>
                  <input type="radio" name="mode" checked={paiement.mode_paiement === k} onChange={() => setPaiement((x) => ({ ...x, mode_paiement: k }))} />
                  {l}
                </label>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-slate-700">
              <div className="font-semibold text-violet-800">Régler sur place, directement à IDEAFORMA</div>
              <p className="mt-1 text-xs text-slate-600">
                Le commercial n&apos;encaisse jamais en son nom : tout paiement est libellé à l&apos;ordre d&apos;IDEAFORMA (chèque) ou versé sur son compte (virement, référence « MEA {g.garage_nom.slice(0, 20) || "nom du garage"} »).
                {params.iban ? ` IBAN ${params.iban}${params.bic ? ` · BIC ${params.bic}` : ""}.` : " Coordonnées bancaires : sur la facture IDEAFORMA."}
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={paiement.paiement_sur_place} onChange={(e) => setPaiement((x) => ({ ...x, paiement_sur_place: e.target.checked }))} />
                Un paiement a été remis / effectué sur place
              </label>
              {paiement.paiement_sur_place && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Champ label="Montant reçu (€ TTC)"><input className="lp-input" inputMode="decimal" value={paiement.paiement_montant} onChange={(e) => setPaiement((x) => ({ ...x, paiement_montant: e.target.value }))} /></Champ>
                  <Champ label="Référence (n° de chèque, virement, reçu) *"><input className="lp-input" value={paiement.paiement_reference} onChange={(e) => setPaiement((x) => ({ ...x, paiement_reference: e.target.value }))} /></Champ>
                </div>
              )}
            </div>
            <Nav onPrev={precedent} onNext={suivant} />
          </div>
        )}

        {/* ---------------- Contrat ---------------- */}
        {etape === "contrat" && params && vente && (
          <div className="lp-card mt-6 p-6 sm:p-8">
            <h2 className="!text-lg font-semibold">Le contrat d&apos;engagement</h2>
            <p className="mt-1 text-sm text-slate-500">À faire lire au garagiste, puis signer sur l&apos;écran. Le PDF signé est téléchargeable juste après l&apos;envoi.</p>
            <div className="mt-4 max-h-[22rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <div className="font-semibold text-slate-800">Conditions particulières</div>
              <ul className="mt-1 space-y-0.5">{conditionsParticulieres(vente, params).map((l, i) => <li key={i}>• {l}</li>)}</ul>
              <div className="mt-4 font-semibold text-slate-800">Conditions générales de vente</div>
              {articlesCGV(params).map((a) => (
                <div key={a.titre} className="mt-2">
                  <div className="text-xs font-semibold text-slate-700">{a.titre}</div>
                  <p className="text-xs leading-relaxed text-slate-600">{a.texte}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Champ label="Nom du signataire *"><input className="lp-input" value={contrat.signataire_nom} onChange={(e) => setContrat((c) => ({ ...c, signataire_nom: e.target.value }))} placeholder={g.contact_nom} /></Champ>
              <Champ label="Qualité"><input className="lp-input" value={contrat.signataire_qualite} onChange={(e) => setContrat((c) => ({ ...c, signataire_qualite: e.target.value }))} /></Champ>
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-1" checked={contrat.cgv_acceptees} onChange={(e) => setContrat((c) => ({ ...c, cgv_acceptees: e.target.checked }))} />
              {ACCEPTATION_CGV}
            </label>
            <div className="mt-4">
              <div className="text-sm font-semibold text-slate-700">Signature du garage</div>
              <div className="mt-1 h-40 overflow-hidden rounded-xl border-2 border-dashed border-violet-300 bg-white">
                <SignaturePad onChange={(d) => setContrat((c) => ({ ...c, signature: d }))} />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-between gap-2">
              <button className="lp-btn-ghost" onClick={precedent}>← Précédent</button>
              <button className="lp-btn" onClick={envoyer} disabled={envoi}>{envoi ? "Envoi…" : "Envoyer la vente à IDEAFORMA"}</button>
            </div>
          </div>
        )}

        {/* ---------------- Fini ---------------- */}
        {etape === "fini" && resultat && (
          <div className="lp-card mt-6 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-2xl">✓</div>
            <h3 className="mt-4 !text-lg font-semibold">Vente {resultat.numero} envoyée.</h3>
            <p className="mt-2 text-sm text-slate-500">
              IDEAFORMA valide la vente et crée le compte du garage sous 5 jours ouvrés (email de bienvenue à {g.contact_email}).
              Remettez au garage son exemplaire du contrat.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button className="lp-btn" onClick={pdf}>Télécharger le contrat signé (PDF)</button>
              <button className="lp-btn-ghost" onClick={() => window.location.reload()}>Nouvelle vente</button>
            </div>
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
function Nav({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  return (
    <div className="mt-6 flex justify-between gap-2">
      <button className="lp-btn-ghost" onClick={onPrev}>← Précédent</button>
      <button className="lp-btn" onClick={onNext}>Suivant →</button>
    </div>
  );
}
