"use client";

/* ====================================================================
 *  ÉDITEUR DU PROCÈS-VERBAL D'EXPERTISE (mode expert, v13.5)
 *
 *  · Versions du rapport (brouillon → émis), création depuis 4 sources :
 *    manuel, devis du garage, facture du garage, photos du véhicule (IA).
 *  · Chiffrage : chocs (postes MO / peinture) + opérations (pièces,
 *    redressage, peinture…) — mêmes conventions que le PDF Alliance.
 *  · Conclusions (immobilisation, accords, règlement direct…).
 *  · Synthèse en direct, aperçu / téléchargement PDF, émission
 *    (PDF archivé dans le dossier + statut « Rapport émis »).
 *  · Enregistrement automatique (1,5 s après la dernière frappe).
 * ==================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icone from "@/components/expert/Icone";
import ModalShell from "@/components/ModalShell";
import { Bloc, Champ, Erreur, Vide } from "@/components/expert/ui";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import { formatDate, formatEuros, messageErreur } from "@/lib/format";
import {
  chargerProfilExpert, chargerRapports, creerRapport, deposerPdfRapport, majDossier, majRapport, supprimerRapport, telechargerBlob,
} from "@/lib/expertise/data";
import {
  CODES_OPERATION, Cabinet, Choc, Conclusions, DocumentExpert, DossierExpert, GarageExpert, Operation, PhotoExpert, PosteChoc, ProfilExpert, RapportExpert,
  agrementPour,
} from "@/lib/expertise/types";
import { POSTES_STANDARD, chocParDefaut, immobilisationEstimee, montantOperation, montantPoste, operationVide, synthese } from "@/lib/expertise/chiffrage";
import { apercuRapportPdf, blobRapportPdf, telechargerRapportPdf } from "@/lib/expertise/rapportPdf";

type Analyse = {
  vehicule: { immatriculation: string | null; marque: string | null; modele: string | null; vin: string | null; kilometrage: number | null } | null;
  reparateur: { nom: string | null; adresse: string | null; siret: string | null } | null;
  document: { numero: string | null; date: string | null; total_ht: number | null; total_tva: number | null; total_ttc: number | null } | null;
  chocs: Choc[];
  operations: Operation[];
  zones_endommagees: { zone: string; gravite: string; description: string }[];
  dommages: string | null;
  remarques: string | null;
  confiance: "faible" | "moyenne" | "bonne";
};

type SourceIA = { mode: "devis" | "facture"; doc?: DocumentExpert; file?: File } | { mode: "photos" };

async function reduireImage(blob: Blob, maxDim = 1280): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b || blob), "image/jpeg", 0.8));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function RapportEditeur({
  dossier,
  cabinet,
  garage,
  photos,
  documents,
  demandeSource,
  onDossierChange,
  onOperationExterne,
}: {
  dossier: DossierExpert;
  cabinet: Cabinet | null;
  garage: GarageExpert | null;
  photos: PhotoExpert[];
  documents: DocumentExpert[];
  /** Demande venue d'un autre onglet (« Générer le rapport » depuis un devis). */
  demandeSource?: { doc: DocumentExpert; mode: "devis" | "facture"; cle: number } | null;
  onDossierChange: (d: DossierExpert) => void;
  /** Pièce envoyée depuis l'onglet Pièces (« → Chiffrage »). */
  onOperationExterne?: (recevoir: (op: Operation) => void) => void;
}) {
  const [rapports, setRapports] = useState<RapportExpert[]>([]);
  // v13.7 : le PV est signé au nom de l'expert connecté.
  const [expert, setExpert] = useState<ProfilExpert | null>(null);
  useEffect(() => { chargerProfilExpert().then(setExpert); }, []);
  const [courant, setCourant] = useState<RapportExpert | null>(null);
  const [conclusions, setConclusions] = useState<Conclusions>(dossier.conclusions || {});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sauvegarde, setSauvegarde] = useState<"ok" | "attente" | "encours">("ok");
  const [choixSource, setChoixSource] = useState(false);
  const [analyse, setAnalyse] = useState<{ source: SourceIA; resultat: Analyse | null; encours: boolean; erreur: string | null } | null>(null);
  const [pdfEnCours, setPdfEnCours] = useState<string | null>(null);
  const fichierIA = useRef<HTMLInputElement>(null);
  const modeFichier = useRef<"devis" | "facture">("devis");
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const derniereDemande = useRef<number>(0);

  // v13.9 : tarif préférentiel de l'agrément (garage × assurance mandante) prioritaire sur les taux du garage.
  const agrement = useMemo(() => agrementPour(garage, dossier.mandant_nom), [garage, dossier.mandant_nom]);
  const taux = useMemo(() => {
    const pref = agrement?.tarif_preferentiel ? agrement : null;
    return {
      t1: Number(pref?.taux_t1) || Number(garage?.taux_t1) || 65,
      t2: Number(pref?.taux_t2) || Number(garage?.taux_t2) || 70,
      peinture: Number(pref?.taux_peinture) || Number(garage?.taux_peinture) || 70,
    };
  }, [garage, agrement]);

  const recharger = useCallback(async () => {
    const liste = await chargerRapports(dossier.id);
    setRapports(liste);
    setCourant((c) => (c ? liste.find((r) => r.id === c.id) || liste[0] || null : liste[0] || null));
    setChargement(false);
  }, [dossier.id]);
  useEffect(() => { recharger(); }, [recharger]);

  /* ------------------------ Enregistrement auto ----------------------- */
  const planifierSauvegarde = useCallback((r: RapportExpert) => {
    setSauvegarde("attente");
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(async () => {
      setSauvegarde("encours");
      try {
        await majRapport(r.id, { chocs: r.chocs, operations: r.operations, remise: r.remise, vetuste: r.vetuste, srgc: r.srgc, taux_tva: r.taux_tva, date_rapport: r.date_rapport, numero: r.numero });
        setSauvegarde("ok");
      } catch (e) {
        setErreur(messageErreur(e, "Enregistrement impossible."));
        setSauvegarde("attente");
      }
    }, 1500);
  }, []);

  const modifier = useCallback((patch: Partial<RapportExpert>) => {
    setCourant((c) => {
      if (!c) return c;
      const n = { ...c, ...patch };
      planifierSauvegarde(n);
      return n;
    });
  }, [planifierSauvegarde]);

  const modifierConclusions = (patch: Partial<Conclusions>) => {
    const n = { ...conclusions, ...patch };
    setConclusions(n);
    if (minuteur.current) clearTimeout(minuteur.current);
    setSauvegarde("attente");
    minuteur.current = setTimeout(async () => {
      setSauvegarde("encours");
      try {
        const d = await majDossier(dossier.id, { conclusions: n });
        onDossierChange(d);
        setSauvegarde("ok");
      } catch (e) { setErreur(messageErreur(e)); }
    }, 1200);
  };

  /* ----------------- Réception d'une pièce (onglet Pièces) ------------ */
  const ajouterOperation = useCallback((op: Operation) => {
    setCourant((c) => {
      if (!c) return c;
      const n = { ...c, operations: [...c.operations, op] };
      planifierSauvegarde(n);
      return n;
    });
  }, [planifierSauvegarde]);
  useEffect(() => { onOperationExterne?.(ajouterOperation); }, [onOperationExterne, ajouterOperation]);

  /* ------------------------- Demande d'un devis ----------------------- */
  useEffect(() => {
    if (!demandeSource || demandeSource.cle === derniereDemande.current) return;
    derniereDemande.current = demandeSource.cle;
    lancerAnalyse({ mode: demandeSource.mode, doc: demandeSource.doc });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandeSource]);

  /* ------------------------------ Création ---------------------------- */
  async function creer(source: RapportExpert["source"], chocs?: Choc[], operations?: Operation[]) {
    try {
      const r = await creerRapport({ dossier, source, chocs: chocs || [chocParDefaut(1, taux)], operations, taux_tva: Number(cabinet?.taux_tva) || 20 });
      await recharger();
      setCourant(r);
      if (dossier.statut === "mission" || dossier.statut === "visite") onDossierChange(await majDossier(dossier.id, { statut: "chiffrage" }));
      return r;
    } catch (e) {
      setErreur(messageErreur(e, "Création du rapport impossible (migration v75 exécutée ?)."));
      return null;
    }
  }

  /* ------------------------------ Analyse IA -------------------------- */
  function contexte(): string {
    return [
      `Immatriculation : ${dossier.immatriculation || "?"}`,
      `Véhicule : ${[dossier.marque, dossier.modele, dossier.finition].filter(Boolean).join(" ") || "?"}`,
      dossier.date_mec && `Mise en circulation : ${dossier.date_mec}`,
      dossier.energie && `Énergie : ${dossier.energie}`,
      dossier.couleur && `Couleur : ${dossier.couleur}`,
      dossier.kilometrage && `Kilométrage : ${dossier.kilometrage}`,
      dossier.dommage_description && `Dommage déclaré : ${dossier.dommage_description}`,
      dossier.reparateur_nom && `Réparateur : ${dossier.reparateur_nom}`,
    ].filter(Boolean).join("\n");
  }

  async function lancerAnalyse(source: SourceIA) {
    setChoixSource(false);
    setAnalyse({ source, resultat: null, encours: true, erreur: null });
    try {
      const form = new FormData();
      form.append("mode", source.mode);
      form.append("contexte", contexte());
      form.append("taux_t1", String(taux.t1));
      form.append("taux_t2", String(taux.t2));
      form.append("taux_peinture", String(taux.peinture));
      if (source.mode === "photos") {
        if (!photos.length) throw new Error("Aucune photo dans le dossier : prends d'abord les photos du véhicule (onglet Photos).");
        const selection = [...photos.filter((p) => p.zone === "dommage"), ...photos.filter((p) => p.zone !== "dommage")].slice(0, 10);
        for (const p of selection) {
          const blob = await telechargerBlob(p.path);
          if (!blob) continue;
          const petit = await reduireImage(blob);
          form.append("photos", new File([petit], `${p.zone}${p.legende ? `-${p.legende}` : ""}.jpg`, { type: "image/jpeg" }));
        }
      } else if (source.file) {
        form.append("file", source.file);
      } else if (source.doc) {
        const blob = await telechargerBlob(source.doc.path);
        if (!blob) throw new Error("Document introuvable.");
        form.append("file", new File([blob], source.doc.nom, { type: "application/pdf" }));
      }
      const res = await fetchAuth("/api/expert/analyser", { method: "POST", body: form });
      const r = await lireReponse<{ data: Analyse }>(res);
      if (!r.ok || !r.data) throw new Error(r.error || "Analyse impossible.");
      setAnalyse({ source, resultat: r.data.data, encours: false, erreur: null });
    } catch (e) {
      setAnalyse({ source, resultat: null, encours: false, erreur: messageErreur(e, "Analyse impossible.") });
    }
  }

  async function appliquerAnalyse(mode: "remplacer" | "ajouter") {
    if (!analyse?.resultat) return;
    const a = analyse.resultat;
    const src = analyse.source.mode;
    let chocs = a.chocs.length ? a.chocs : [chocParDefaut(1, taux)];
    let operations = a.operations;
    if (courant && mode === "ajouter") {
      chocs = [...courant.chocs, ...a.chocs.map((c, i) => ({ ...c, numero: courant.chocs.length + i + 1 }))];
      operations = [...courant.operations, ...a.operations];
    }
    // Compléments du dossier (uniquement les champs vides).
    const patch: Partial<DossierExpert> = {};
    if (a.vehicule) {
      if (!dossier.immatriculation && a.vehicule.immatriculation) patch.immatriculation = a.vehicule.immatriculation;
      if (!dossier.marque && a.vehicule.marque) patch.marque = a.vehicule.marque;
      if (!dossier.modele && a.vehicule.modele) patch.modele = a.vehicule.modele;
      if (!dossier.vin && a.vehicule.vin) patch.vin = a.vehicule.vin;
      if (!dossier.kilometrage && a.vehicule.kilometrage) patch.kilometrage = a.vehicule.kilometrage;
    }
    if (a.reparateur && !dossier.reparateur_nom && a.reparateur.nom) {
      patch.reparateur_nom = a.reparateur.nom;
      patch.reparateur_adresse = a.reparateur.adresse;
      patch.reparateur_siret = a.reparateur.siret;
    }
    if (a.dommages && !dossier.dommage_description) patch.dommage_description = a.dommages;
    if (Object.keys(patch).length) onDossierChange(await majDossier(dossier.id, patch));
    if (!courant || (mode === "remplacer" && courant.statut === "emis")) {
      await creer(src, chocs, operations);
    } else {
      const n = { ...courant, chocs, operations, source: src };
      setCourant(n);
      await majRapport(courant.id, { chocs, operations, source: src });
      await recharger();
    }
    const immo = immobilisationEstimee(chocs);
    if (immo && !conclusions.immobilisation_jours) modifierConclusions({ immobilisation_jours: immo });
    setAnalyse(null);
    setInfo(src === "photos" ? "Ébauche appliquée : relis chaque ligne, les heures et les prix sont des estimations à confirmer." : "Chiffrage repris du document. Vérifie les taux et les pièces.");
  }

  /* ------------------------------ Émission ---------------------------- */
  async function emettre() {
    if (!courant) return;
    if (!confirm("Émettre ce rapport ? Le PDF sera archivé dans le dossier et le rapport ne sera plus modifiable (une nouvelle version restera possible).")) return;
    setPdfEnCours("emission");
    try {
      const r = { ...courant, statut: "emis" as const, date_rapport: courant.date_rapport || new Date().toISOString().slice(0, 10) };
      await majRapport(r.id, { statut: "emis", date_rapport: r.date_rapport, chocs: r.chocs, operations: r.operations });
      const blob = await blobRapportPdf(dossier, r, cabinet, expert);
      await deposerPdfRapport(r, blob);
      onDossierChange(await majDossier(dossier.id, { statut: "emis" }));
      await recharger();
      setInfo(`Rapport ${r.numero} émis et archivé dans les documents.`);
    } catch (e) { setErreur(messageErreur(e, "Émission impossible.")); } finally { setPdfEnCours(null); }
  }

  async function nouvelleVersion() {
    if (!courant) return;
    await creer(courant.source, courant.chocs.map((c) => ({ ...c })), courant.operations.map((o) => ({ ...o })));
  }

  /* --------------------------------- UI ------------------------------- */
  const s = courant ? synthese(courant) : null;
  const lectureSeule = courant?.statut === "emis";
  const devis = documents.filter((d) => d.type === "devis_garage");
  const factures = documents.filter((d) => d.type === "facture_garage");

  const majPoste = (ci: number, pi: number, patch: Partial<PosteChoc>) => {
    if (!courant) return;
    const chocs = courant.chocs.map((c, i) => i !== ci ? c : { ...c, postes: c.postes.map((p, j) => (j !== pi ? p : { ...p, ...patch })) });
    modifier({ chocs });
  };
  const majOp = (oi: number, patch: Partial<Operation>) => {
    if (!courant) return;
    modifier({ operations: courant.operations.map((o, i) => (i !== oi ? o : { ...o, ...patch })) });
  };
  const num = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")));

  if (chargement) return <div className="skeleton h-40 rounded-2xl" />;

  return (
    <div className="space-y-4">
      <Erreur message={erreur} />
      {info && <div className="alerte alerte-ok text-sm flex items-start justify-between gap-2"><span>{info}</span><button className="text-xs underline" onClick={() => setInfo(null)}>fermer</button></div>}
      <input ref={fichierIA} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) lancerAnalyse({ mode: modeFichier.current, file: f }); e.target.value = ""; }} />

      {/* ------------------------ Barre des versions ---------------------- */}
      <div className="glass-card flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {rapports.length > 0 && (
            <select className="field-input field-compact w-auto" value={courant?.id || ""} onChange={(e) => setCourant(rapports.find((r) => r.id === e.target.value) || null)}>
              {rapports.map((r) => <option key={r.id} value={r.id}>Version {r.version} · {r.statut === "emis" ? `émis le ${formatDate(r.date_rapport)}` : "brouillon"} · {r.source}</option>)}
            </select>
          )}
          {courant && <span className={`badge ${courant.statut === "emis" ? "badge-ok" : "badge-warn"}`}>{courant.statut === "emis" ? "Émis" : "Brouillon"}</span>}
          <span className="text-xs text-white/45">{sauvegarde === "ok" ? "Enregistré" : sauvegarde === "attente" ? "Modifications en attente…" : "Enregistrement…"}</span>
          {agrement && (
            <span className={`badge ${agrement.tarif_preferentiel ? "badge-ok" : "badge-info"}`} title={agrement.conditions || ""}>
              {garage?.nom} agréé {agrement.assurance}{agrement.tarif_preferentiel ? ` · tarif préf. T1 ${taux.t1} € / T2 ${taux.t2} € / peint. ${taux.peinture} €${agrement.remise_pieces ? ` / pièces -${agrement.remise_pieces} %` : ""}` : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary btn-compact" onClick={() => setChoixSource(true)}><Icone nom="ia" /> {courant ? "Générer automatiquement" : "Créer le rapport"}</button>
          {courant && (
            <>
              <button className="btn-ghost btn-compact" disabled={pdfEnCours !== null} onClick={async () => { setPdfEnCours("apercu"); try { await apercuRapportPdf(dossier, courant, cabinet, expert); } catch (e) { setErreur(messageErreur(e, "Aperçu impossible.")); } finally { setPdfEnCours(null); } }}><Icone nom="oeil" /> Aperçu PDF</button>
              <button className="btn-ghost btn-compact" disabled={pdfEnCours !== null} onClick={async () => { setPdfEnCours("dl"); try { await telechargerRapportPdf(dossier, courant, cabinet, expert); } catch (e) { setErreur(messageErreur(e)); } finally { setPdfEnCours(null); } }}><Icone nom="telecharger" /> Télécharger</button>
              {!lectureSeule ? (
                <button className="btn-primary btn-compact" disabled={pdfEnCours !== null} onClick={emettre}>{pdfEnCours === "emission" ? "Émission…" : <><Icone nom="envoyer" /> Émettre le rapport</>}</button>
              ) : (
                <button className="btn-ghost btn-compact" onClick={nouvelleVersion}>+ Nouvelle version</button>
              )}
              <button className="btn-danger btn-compact" onClick={async () => { if (confirm(`Supprimer la version ${courant.version} ?`)) { await supprimerRapport(courant); setCourant(null); recharger(); } }}>×</button>
            </>
          )}
        </div>
      </div>

      {!courant ? (
        <div className="glass-card p-4">
          <Vide
            titre="Aucun rapport pour ce dossier"
            texte="Crée le procès-verbal à la main, ou laisse le chiffrage se générer automatiquement à partir du devis du garage, de sa facture ou des photos du véhicule."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn-ghost" onClick={() => creer("manuel")}><Icone nom="stylo" /> Saisie manuelle</button>
                <button className="btn-primary" onClick={() => setChoixSource(true)}><Icone nom="ia" /> Générer automatiquement</button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          {/* --------------------------- En-tête --------------------------- */}
          <Bloc titre="Rapport">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Champ label="N° de rapport"><input className="field-input" value={courant.numero} disabled={lectureSeule} onChange={(e) => modifier({ numero: e.target.value })} /></Champ>
              <Champ label="Date du rapport"><input type="date" className="field-input" value={courant.date_rapport || ""} disabled={lectureSeule} onChange={(e) => modifier({ date_rapport: e.target.value || null })} /></Champ>
              <Champ label="Taux de TVA (%)"><input type="number" step="0.1" className="field-input" value={courant.taux_tva ?? 20} disabled={lectureSeule} onChange={(e) => modifier({ taux_tva: Number(e.target.value) })} /></Champ>
              <Champ label="Source"><input className="field-input" value={courant.source} disabled /></Champ>
            </div>
          </Bloc>

          {/* --------------------------- Chocs ----------------------------- */}
          {courant.chocs.map((choc, ci) => (
            <Bloc
              key={ci}
              titre={`Détail choc ${choc.numero}`}
              actions={!lectureSeule && (
                <>
                  <input className="field-input field-compact w-44" placeholder="Libellé (Choc avant gauche…)" value={choc.libelle || ""} onChange={(e) => modifier({ chocs: courant.chocs.map((c, i) => (i === ci ? { ...c, libelle: e.target.value } : c)) })} />
                  <button className="btn-ghost btn-compact" onClick={() => modifier({ chocs: courant.chocs.map((c, i) => (i === ci ? { ...c, postes: [...c.postes, { poste: "Tôlerie T1", heures: 0, taux: taux.t1, remise: 0 }] } : c)) })}>+ Poste</button>
                  {courant.chocs.length > 1 && <button className="btn-danger btn-compact" onClick={() => modifier({ chocs: courant.chocs.filter((_, i) => i !== ci).map((c, i) => ({ ...c, numero: i + 1 })) })}>Supprimer le choc</button>}
                </>
              )}
            >
              <div className="overflow-x-auto">
                <table className="al-table">
                  <thead><tr><th>Poste</th><th className="num">Nb. heures</th><th className="num">Taux €/h</th><th className="num">Remise %</th><th className="num">Forfait HT</th><th className="num">Montant HT</th><th></th></tr></thead>
                  <tbody>
                    {choc.postes.map((p, pi) => (
                      <tr key={pi}>
                        <td className="min-w-[10rem]">
                          <input className="field-input" list="postes-standard" value={p.poste} disabled={lectureSeule} onChange={(e) => majPoste(ci, pi, { poste: e.target.value })} />
                        </td>
                        <td className="num w-24"><input type="number" step="0.25" className="field-input text-right" value={p.heures} disabled={lectureSeule} onChange={(e) => majPoste(ci, pi, { heures: num(e.target.value) })} /></td>
                        <td className="num w-24"><input type="number" step="0.5" className="field-input text-right" value={p.taux} disabled={lectureSeule} onChange={(e) => majPoste(ci, pi, { taux: num(e.target.value) })} /></td>
                        <td className="num w-20"><input type="number" step="1" className="field-input text-right" value={p.remise} disabled={lectureSeule} onChange={(e) => majPoste(ci, pi, { remise: num(e.target.value) })} /></td>
                        <td className="num w-24"><input type="number" step="0.01" className="field-input text-right" value={p.forfait ?? ""} disabled={lectureSeule} placeholder="—" onChange={(e) => majPoste(ci, pi, { forfait: e.target.value === "" ? null : num(e.target.value) })} /></td>
                        <td className="num font-semibold">{formatEuros(montantPoste(p))}</td>
                        <td className="text-right">{!lectureSeule && <button className="btn-ghost btn-compact" onClick={() => modifier({ chocs: courant.chocs.map((c, i) => (i === ci ? { ...c, postes: c.postes.filter((_, j) => j !== pi) } : c)) })}>×</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Bloc>
          ))}
          <datalist id="postes-standard">{POSTES_STANDARD.map((p) => <option key={p} value={p} />)}</datalist>
          {!lectureSeule && (
            <button className="btn-ghost btn-compact" onClick={() => modifier({ chocs: [...courant.chocs, chocParDefaut(courant.chocs.length + 1, taux)] })}>+ Ajouter un choc</button>
          )}

          {/* ------------------------- Opérations -------------------------- */}
          <Bloc
            titre={`Opérations effectuées · ${courant.operations.length}`}
            actions={!lectureSeule && <button className="btn-ghost btn-compact" onClick={() => modifier({ operations: [...courant.operations, operationVide()] })}>+ Ligne</button>}
          >
            {courant.operations.length === 0 ? (
              <p className="text-sm text-white/50">Aucune opération. Ajoute les pièces à remplacer (E), les redressages (I), les peintures (L)… ou passe par l&apos;onglet Pièces pour retrouver références et prix.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="al-table">
                  <thead><tr><th>Op.</th><th>*</th><th>Désignation</th><th className="num">Qté</th><th className="num">Prix unit. HT</th><th>Référence</th><th>Qualité</th><th className="num">Montant HT</th><th></th></tr></thead>
                  <tbody>
                    {courant.operations.map((o, oi) => (
                      <tr key={oi}>
                        <td className="w-20">
                          <select className="field-input" value={o.op} disabled={lectureSeule} onChange={(e) => majOp(oi, { op: e.target.value as Operation["op"] })}>
                            {CODES_OPERATION.map((c) => <option key={c.code} value={c.code} title={c.label}>{c.code}</option>)}
                          </select>
                        </td>
                        <td className="w-8 text-center" title="Opération de peinture"><input type="checkbox" checked={o.peinture} disabled={lectureSeule} onChange={(e) => majOp(oi, { peinture: e.target.checked })} /></td>
                        <td className="min-w-[14rem]"><input className="field-input uppercase" value={o.designation} disabled={lectureSeule} onChange={(e) => majOp(oi, { designation: e.target.value })} /></td>
                        <td className="num w-16"><input type="number" step="1" className="field-input text-right" value={o.qte} disabled={lectureSeule} onChange={(e) => majOp(oi, { qte: num(e.target.value) })} /></td>
                        <td className="num w-28"><input type="number" step="0.01" className="field-input text-right" value={o.prix_unit} disabled={lectureSeule} onChange={(e) => majOp(oi, { prix_unit: num(e.target.value) })} /></td>
                        <td className="w-32"><input className="field-input font-mono text-xs" value={o.reference || ""} disabled={lectureSeule} onChange={(e) => majOp(oi, { reference: e.target.value || null })} /></td>
                        <td className="w-28">
                          <select className="field-input" value={o.qualite || ""} disabled={lectureSeule} onChange={(e) => majOp(oi, { qualite: (e.target.value || null) as Operation["qualite"] })}>
                            <option value="">—</option><option value="origine">Origine (O)</option><option value="equivalente">Équivalente (Q)</option><option value="reemploi">Réemploi (R)</option>
                          </select>
                        </td>
                        <td className="num font-semibold">{formatEuros(montantOperation(o))}</td>
                        <td className="whitespace-nowrap text-right">
                          {!lectureSeule && (
                            <>
                              <button className="btn-ghost btn-compact" disabled={oi === 0} onClick={() => { const ops = [...courant.operations]; [ops[oi - 1], ops[oi]] = [ops[oi], ops[oi - 1]]; modifier({ operations: ops }); }} title="Monter"><Icone nom="haut" /></button>
                              <button className="btn-ghost btn-compact ml-1" onClick={() => modifier({ operations: courant.operations.filter((_, i) => i !== oi) })}>×</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Bloc>

          {/* --------------------- Conclusions & synthèse ------------------- */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Bloc titre="Conclusions">
              <div className="grid grid-cols-2 gap-3">
                <Champ label="TVA récupérable">
                  <select className="field-input" value={conclusions.tva_recuperable ? "oui" : "non"} onChange={(e) => modifierConclusions({ tva_recuperable: e.target.value === "oui" })}><option value="non">Non</option><option value="oui">Oui</option></select>
                </Champ>
                <Champ label="Immobilisation (jours)" aide={s ? `Suggestion : ${immobilisationEstimee(courant.chocs)} j` : undefined}>
                  <input type="number" step="0.5" className="field-input" value={conclusions.immobilisation_jours ?? ""} onChange={(e) => modifierConclusions({ immobilisation_jours: e.target.value === "" ? null : Number(e.target.value) })} />
                </Champ>
                <Champ label="Accord réparateur">
                  <select className="field-input" value={conclusions.accord_reparateur === true ? "oui" : conclusions.accord_reparateur === false ? "non" : ""} onChange={(e) => modifierConclusions({ accord_reparateur: e.target.value === "" ? null : e.target.value === "oui" })}><option value="">—</option><option value="oui">Oui</option><option value="non">Non</option></select>
                </Champ>
                <Champ label="Accord assuré">
                  <select className="field-input" value={conclusions.accord_assure === true ? "oui" : conclusions.accord_assure === false ? "non" : ""} onChange={(e) => modifierConclusions({ accord_assure: e.target.value === "" ? null : e.target.value === "oui" })}><option value="">—</option><option value="oui">Oui</option><option value="non">Non</option></select>
                </Champ>
                <Champ label="Règlement direct accordé">
                  <select className="field-input" value={conclusions.reglement_direct ? "oui" : "non"} onChange={(e) => modifierConclusions({ reglement_direct: e.target.value === "oui" })}><option value="non">Non</option><option value="oui">Oui</option></select>
                </Champ>
                <Champ label="Montant à charge de la compagnie">
                  <input type="number" step="0.01" className="field-input" value={conclusions.montant_compagnie ?? 0} onChange={(e) => modifierConclusions({ montant_compagnie: Number(e.target.value) })} />
                </Champ>
                <Champ label="Réparabilité technique"><input className="field-input" value={conclusions.reparabilite_technique || ""} onChange={(e) => modifierConclusions({ reparabilite_technique: e.target.value || null })} /></Champ>
                <Champ label="Réparabilité économique"><input className="field-input" value={conclusions.reparabilite_economique || ""} onChange={(e) => modifierConclusions({ reparabilite_economique: e.target.value || null })} /></Champ>
                <Champ label="Procédure VGE"><input className="field-input" value={conclusions.procedure_vge || ""} onChange={(e) => modifierConclusions({ procedure_vge: e.target.value || null })} /></Champ>
                <Champ label="Facture réparateur"><input className="field-input" value={conclusions.facture_reparateur || ""} onChange={(e) => modifierConclusions({ facture_reparateur: e.target.value || null })} /></Champ>
                <Champ label="Observations" className="col-span-2"><textarea className="field-input" rows={2} value={conclusions.observations || ""} onChange={(e) => modifierConclusions({ observations: e.target.value || null })} /></Champ>
              </div>
            </Bloc>
            <Bloc titre="Chiffrage">
              {s && (
                <table className="al-table">
                  <thead><tr><th>Poste</th><th className="num">Montant HT</th><th className="num">TVA</th><th className="num">Montant TTC</th></tr></thead>
                  <tbody>
                    {[["Forfaits", s.forfaits], ["Ingr. + Peinture", s.peinture], ["Main d'œuvre globale", s.mo], ["Pièces de rechange", s.pieces], ["Fournitures", s.fournitures]].map(([l, v]) => (
                      <tr key={String(l)}><td>{l}</td><td className="num">{formatEuros(Number(v))}</td><td className="num">{formatEuros(Number(v) * (courant.taux_tva ?? 20) / 100)}</td><td className="num">{formatEuros(Number(v) * (1 + (courant.taux_tva ?? 20) / 100))}</td></tr>
                    ))}
                    <tr>
                      <td>Remise / vétusté</td>
                      <td className="num" colSpan={3}>
                        <div className="flex justify-end gap-2">
                          <input type="number" step="0.01" className="field-input w-24 text-right" value={courant.remise ?? 0} disabled={lectureSeule} title="Remise HT" onChange={(e) => modifier({ remise: num(e.target.value) })} />
                          <input type="number" step="0.01" className="field-input w-24 text-right" value={courant.vetuste ?? 0} disabled={lectureSeule} title="Vétusté HT" onChange={(e) => modifier({ vetuste: num(e.target.value) })} />
                        </div>
                      </td>
                    </tr>
                    <tr className="font-semibold"><td>TOTAL Réparations</td><td className="num">{formatEuros(s.ht)}</td><td className="num">{formatEuros(s.tva)}</td><td className="num">{formatEuros(s.ttc)}</td></tr>
                    <tr><td>TOTAL SRGC</td><td className="num" colSpan={3}><input type="number" step="0.01" className="field-input w-28 text-right ml-auto" value={courant.srgc ?? 0} disabled={lectureSeule} onChange={(e) => modifier({ srgc: num(e.target.value) })} /></td></tr>
                  </tbody>
                </table>
              )}
            </Bloc>
          </div>
        </>
      )}

      {/* ---------------------- Choix de la source IA --------------------- */}
      {choixSource && (
        <ModalShell title="Générer le chiffrage automatiquement" onClose={() => setChoixSource(false)} maxWidth="max-w-xl">
          <p className="text-sm text-white/60">Le document (ou les photos) est analysé automatiquement : chocs, opérations et prix sont préparés. Tu relis et tu ajustes avant d&apos;émettre.</p>
          <div className="space-y-2">
            <div className="glass-soft p-3">
              <div className="font-semibold"><Icone nom="document" /> Depuis un devis du garage</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {devis.map((d) => <button key={d.id} className="btn-ghost btn-compact" onClick={() => lancerAnalyse({ mode: "devis", doc: d })}>{d.nom}</button>)}
                <button className="btn-primary btn-compact" onClick={() => { modeFichier.current = "devis"; fichierIA.current?.click(); }}><Icone nom="trombone" /> Choisir un fichier</button>
              </div>
            </div>
            <div className="glass-soft p-3">
              <div className="font-semibold"><Icone nom="facture" /> Depuis une facture du garage</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {factures.map((d) => <button key={d.id} className="btn-ghost btn-compact" onClick={() => lancerAnalyse({ mode: "facture", doc: d })}>{d.nom}</button>)}
                <button className="btn-primary btn-compact" onClick={() => { modeFichier.current = "facture"; fichierIA.current?.click(); }}><Icone nom="trombone" /> Choisir un fichier</button>
              </div>
            </div>
            <div className="glass-soft p-3">
              <div className="font-semibold"><Icone nom="photo" /> Depuis les photos du véhicule <span className="badge badge-warn ml-1">expérimental</span></div>
              <p className="mt-1 text-xs text-white/55">{photos.length} photo(s) dans le dossier. Les dommages visibles sont décrits et une ébauche de chiffrage est proposée avec les taux du réparateur.</p>
              <button className="btn-primary btn-compact mt-2" disabled={!photos.length} onClick={() => lancerAnalyse({ mode: "photos" })}>Analyser les photos</button>
            </div>
            <div className="glass-soft p-3">
              <div className="font-semibold"><Icone nom="stylo" /> Saisie manuelle</div>
              <button className="btn-ghost btn-compact mt-2" onClick={() => { setChoixSource(false); if (!courant) creer("manuel"); }}>{courant ? "Continuer la saisie" : "Créer un rapport vide"}</button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ------------------------- Résultat de l'analyse ------------------ */}
      {analyse && (
        <ModalShell title={analyse.source.mode === "photos" ? "Analyse des photos" : analyse.source.mode === "devis" ? "Lecture du devis" : "Lecture de la facture"} onClose={() => !analyse.encours && setAnalyse(null)} maxWidth="max-w-3xl">
          {analyse.encours ? (
            <div className="py-8 text-center">
              <div className="skeleton mx-auto h-3 w-2/3 rounded-full" />
              <p className="mt-4 text-sm text-white/60">{analyse.source.mode === "photos" ? "Examen des photos, identification des dommages, estimation des heures et des pièces…" : "Lecture du document et extraction du chiffrage…"}</p>
              <p className="mt-1 text-xs text-white/40">Quelques dizaines de secondes.</p>
            </div>
          ) : analyse.erreur ? (
            <>
              <Erreur message={analyse.erreur} />
              <div className="flex justify-end"><button className="btn-ghost" onClick={() => setAnalyse(null)}>Fermer</button></div>
            </>
          ) : analyse.resultat && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`badge ${analyse.resultat.confiance === "bonne" ? "badge-ok" : analyse.resultat.confiance === "moyenne" ? "badge-warn" : "badge-danger"}`}>Confiance {analyse.resultat.confiance}</span>
                {analyse.resultat.document?.total_ht !== null && analyse.resultat.document?.total_ht !== undefined && <span className="text-white/60">Total du document : {formatEuros(analyse.resultat.document.total_ht)} HT</span>}
                <span className="text-white/60">Chiffrage lu : {formatEuros(synthese({ chocs: analyse.resultat.chocs, operations: analyse.resultat.operations, remise: 0, vetuste: 0, srgc: 0, taux_tva: courant?.taux_tva ?? 20 }).ht)} HT</span>
              </div>
              {analyse.resultat.dommages && <p className="text-sm"><span className="font-semibold">Dommages : </span>{analyse.resultat.dommages}</p>}
              {analyse.resultat.zones_endommagees.length > 0 && (
                <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                  {analyse.resultat.zones_endommagees.map((z, i) => (
                    <li key={i} className="glass-soft px-2 py-1"><span className="font-medium">{z.zone}</span> <span className={`badge ${z.gravite === "forte" ? "badge-danger" : z.gravite === "moyenne" ? "badge-warn" : "badge-neutral"} ml-1`}>{z.gravite}</span><div className="text-xs text-white/60">{z.description}</div></li>
                  ))}
                </ul>
              )}
              <div className="max-h-64 overflow-auto rounded-xl border border-white/10">
                <table className="al-table">
                  <thead><tr><th>Poste / opération</th><th className="num">Qté / h</th><th className="num">Prix / taux</th><th className="num">HT</th></tr></thead>
                  <tbody>
                    {analyse.resultat.chocs.flatMap((c) => c.postes.map((p, i) => (
                      <tr key={`c${c.numero}-${i}`}><td>Choc {c.numero} · {p.poste}</td><td className="num">{p.heures} h</td><td className="num">{formatEuros(p.taux)}</td><td className="num">{formatEuros(montantPoste(p))}</td></tr>
                    )))}
                    {analyse.resultat.operations.map((o, i) => (
                      <tr key={`o${i}`}><td>{o.op}{o.peinture ? "*" : ""} {o.designation}</td><td className="num">{o.qte || ""}</td><td className="num">{o.prix_unit ? formatEuros(o.prix_unit) : ""}</td><td className="num">{formatEuros(montantOperation(o))}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {analyse.resultat.remarques && <div className="alerte alerte-warn text-sm"><span className="alerte-titre">À vérifier : </span>{analyse.resultat.remarques}</div>}
              <div className="flex flex-wrap justify-end gap-2">
                <button className="btn-ghost" onClick={() => setAnalyse(null)}>Ignorer</button>
                {courant && !lectureSeule && <button className="btn-ghost" onClick={() => appliquerAnalyse("ajouter")}>Ajouter au rapport</button>}
                <button className="btn-primary" onClick={() => appliquerAnalyse("remplacer")}>{courant && !lectureSeule ? "Remplacer le chiffrage" : "Créer le rapport"}</button>
              </div>
            </>
          )}
        </ModalShell>
      )}
    </div>
  );
}
