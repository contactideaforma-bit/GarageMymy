"use client";

/* ====================================================================
 *  DÉPÔT GROUPÉ (mode expert, v13.25)
 *
 *  L'expert dépose d'un coup plusieurs PDF / photos (pré-rapports, devis,
 *  factures). ① Chaque document est lu et reconnu (nature, immatriculation,
 *  réparateur). ② L'appli PROPOSE un rangement — dossier existant retrouvé
 *  par l'immatriculation, ou nouveau dossier — que l'expert vérifie et
 *  corrige. ③ Seulement après confirmation : dossiers créés, documents
 *  rangés, contrôles ouverts ou complétés. Rien n'est fait en silence.
 * ==================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ModalShell from "@/components/ModalShell";
import Icone from "@/components/expert/Icone";
import { chargerDossiers, chargerGarages, creerDossier } from "@/lib/expertise/data";
import {
  LectureIA, ModeLecture, analyserFichierAuto, chargerControlesDossier, coteAttendu, coteDepuisLecture, creerControle, deposerPourControle, majControle, memoriserLecture,
} from "@/lib/expertise/controleData";
import { chiffrageAttendu, comparerControle, fusionnerDecisions, journaliser, totalHT } from "@/lib/expertise/controle";
import { DossierExpert, GarageExpert } from "@/lib/expertise/types";
import { formatEuros, messageErreur } from "@/lib/format";

type Nature = "pre_rapport" | "devis" | "facture" | "ignorer";
type Ligne = {
  cle: string;
  file: File;
  etat: "attente" | "lecture" | "lu" | "erreur" | "range";
  lecture?: LectureIA;
  erreur?: string;
  nature: Nature;
  /** id de dossier existant, ou "nouveau:<IMMAT>" */
  cible: string;
  resultat?: { dossierId: string; texte: string };
};

const cleImmat = (s: string | null | undefined) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const LIB: Record<Nature, string> = { pre_rapport: "Pré-rapport", devis: "Devis", facture: "Facture", ignorer: "Ne pas importer" };

export default function DepotGroupeModal({ onClose, onTermine }: { onClose: () => void; onTermine: () => void }) {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [dossiers, setDossiers] = useState<DossierExpert[]>([]);
  const [garages, setGarages] = useState<GarageExpert[]>([]);
  const [phase, setPhase] = useState<"choix" | "lecture" | "verification" | "import" | "fini">("choix");
  const [erreur, setErreur] = useState<string | null>(null);
  const entree = useRef<HTMLInputElement>(null);

  useEffect(() => { chargerDossiers().then((d) => setDossiers(d.dossiers)); chargerGarages().then(setGarages); }, []);

  const maj = (cle: string, patch: Partial<Ligne>) => setLignes((l) => l.map((x) => (x.cle === cle ? { ...x, ...patch } : x)));

  function proposerCible(l: LectureIA | undefined): string {
    const k = cleImmat(l?.vehicule?.immatriculation);
    if (!k) return dossiers[0] ? "" : "nouveau:";
    const d = dossiers.find((x) => cleImmat(x.immatriculation) === k && x.statut !== "cloture");
    return d ? d.id : `nouveau:${k}`;
  }

  async function lire(files: File[]) {
    const init: Ligne[] = files.map((f, i) => ({ cle: `${Date.now()}-${i}`, file: f, etat: "attente", nature: "devis", cible: "" }));
    setLignes(init);
    setPhase("lecture");
    // Lecture une par une : pas de pic de charge, progression visible.
    for (const l of init) {
      maj(l.cle, { etat: "lecture" });
      try {
        const r = await analyserFichierAuto(l.file);
        const nature: Nature = r.type_document === "pre_rapport" || r.type_document === "devis" || r.type_document === "facture" ? r.type_document : "ignorer";
        maj(l.cle, { etat: "lu", lecture: r, nature, cible: proposerCible(r) });
      } catch (e) {
        maj(l.cle, { etat: "erreur", erreur: messageErreur(e, "Lecture impossible."), nature: "ignorer" });
      }
    }
    setPhase("verification");
  }

  // Nouveaux dossiers proposés (une immatriculation = un dossier).
  const nouveaux = useMemo(() => Array.from(new Set(lignes.filter((l) => l.nature !== "ignorer" && l.cible.startsWith("nouveau:")).map((l) => l.cible))), [lignes]);
  const aImporter = lignes.filter((l) => l.nature !== "ignorer" && l.etat === "lu");
  const incomplets = aImporter.filter((l) => !l.cible || l.cible === "nouveau:");

  async function importer() {
    if (!confirm(`Importer ${aImporter.length} document(s)${nouveaux.length ? ` et créer ${nouveaux.length} dossier(s)` : ""} ?`)) return;
    setPhase("import");
    setErreur(null);
    const crees = new Map<string, string>(); // "nouveau:IMMAT" → id
    // Ordre : pré-rapports d'abord, puis devis, puis factures.
    const ordre: Record<Nature, number> = { pre_rapport: 0, devis: 1, facture: 2, ignorer: 3 };
    for (const l of [...aImporter].sort((a, b) => ordre[a.nature] - ordre[b.nature])) {
      try {
        let dossierId = l.cible;
        if (l.cible.startsWith("nouveau:")) {
          dossierId = crees.get(l.cible) || "";
          if (!dossierId) {
            const v = l.lecture?.vehicule;
            const rep = l.lecture?.reparateur;
            const g = rep?.nom ? garages.find((x) => x.nom.toLowerCase() === rep.nom!.toLowerCase()) : null;
            const d = await creerDossier({
              statut: "chiffrage", date_mission: new Date().toISOString().slice(0, 10),
              immatriculation: v?.immatriculation?.toUpperCase() || l.cible.slice(8) || null, marque: v?.marque || null, modele: v?.modele || null,
              garage_id: g?.id ?? null, reparateur_nom: g?.nom || rep?.nom || null, reparateur_adresse: rep?.adresse || null, reparateur_siret: rep?.siret || null,
            });
            dossierId = d.id;
            crees.set(l.cible, d.id);
          }
        }
        const texte = await ranger(dossierId, l);
        maj(l.cle, { etat: "range", resultat: { dossierId, texte } });
      } catch (e) {
        maj(l.cle, { etat: "erreur", erreur: messageErreur(e, "Import impossible.") });
      }
    }
    setPhase("fini");
    onTermine();
  }

  /** Range un document lu dans son dossier et complète / ouvre le bon contrôle. */
  async function ranger(dossierId: string, l: Ligne): Promise<string> {
    const lecture = l.lecture!;
    const facture = l.nature === "facture";
    const mode: ModeLecture = l.nature === "pre_rapport" ? "rapport" : facture ? "facture" : "devis";
    let doc = await deposerPourControle(dossierId, l.file, l.nature === "pre_rapport" ? "reference" : "devis", facture ? "facture" : "devis");
    doc = await memoriserLecture(doc, mode, lecture);
    const cote = coteDepuisLecture(lecture, doc);
    const { controles } = await chargerControlesDossier(dossierId);
    const devisCtl = controles.filter((c) => (c.type || "devis") === "devis");
    const dernier = devisCtl[devisCtl.length - 1] || null;

    if (l.nature === "pre_rapport") {
      if (dernier?.reference) return "rangé (un pré-rapport est déjà utilisé : remplace-le depuis le contrôle si besoin)";
      if (dernier) {
        const ecarts = dernier.devis ? comparerControle(cote, dernier.devis).ecarts : [];
        await majControle(dernier.id, { reference: cote, ecarts, journal: journaliser(dernier.journal, `Pré-rapport lu (dépôt groupé) : ${doc.nom}`) });
        return dernier.devis ? `contrôle complété : ${ecarts.length} écart(s) à trancher` : "contrôle ouvert, devis à déposer";
      }
      await creerControle({ dossierId, reference: cote, action: "Contrôle ouvert (dépôt groupé)" });
      return "contrôle ouvert, devis à déposer";
    }

    if (l.nature === "devis") {
      if (!dernier) { await creerControle({ dossierId, devis: cote, action: "Contrôle ouvert (dépôt groupé)" }); return "contrôle ouvert, pré-rapport à déposer"; }
      if (dernier.statut === "attente_garage") {
        const ref = coteAttendu(dernier, chiffrageAttendu(dernier));
        const { ecarts } = comparerControle(ref, cote);
        await creerControle({ dossierId, tour: dernier.tour + 1, parentId: dernier.id, reference: ref, devis: cote, ecarts, action: `Tour ${dernier.tour + 1} ouvert (devis rectifié, dépôt groupé)` });
        return `devis rectifié : tour ${dernier.tour + 1}, ${ecarts.length} écart(s)`;
      }
      if (dernier.statut === "a_trancher" && !dernier.devis) {
        const ecarts = dernier.reference ? comparerControle(dernier.reference, cote).ecarts : [];
        await majControle(dernier.id, { devis: cote, ecarts, journal: journaliser(dernier.journal, `Devis lu (dépôt groupé) : ${doc.nom}`) });
        return dernier.reference ? `contrôle complété : ${ecarts.length} écart(s) à trancher` : "devis posé, pré-rapport à déposer";
      }
      if (dernier.statut === "a_trancher" && dernier.reference) {
        const ecarts = fusionnerDecisions(dernier.ecarts, comparerControle(dernier.reference, cote).ecarts);
        await majControle(dernier.id, { devis: cote, ecarts, journal: journaliser(dernier.journal, `Devis remplacé (dépôt groupé) : ${doc.nom}`) });
        return "devis remplacé dans le contrôle en cours (décisions inchangées conservées)";
      }
      return "rangé (contrôle déjà conclu : rouvre-le ou ouvre un tour depuis le dossier)";
    }

    // Facture finale
    const facCtl = controles.filter((c) => c.type === "facture");
    const derniereFac = facCtl[facCtl.length - 1] || null;
    if (derniereFac && derniereFac.statut === "a_trancher" && !derniereFac.devis && derniereFac.reference) {
      const { ecarts } = comparerControle(derniereFac.reference, cote);
      await majControle(derniereFac.id, { devis: cote, ecarts, journal: journaliser(derniereFac.journal, `Facture lue (dépôt groupé) : ${doc.nom}`) });
      return `facture contrôlée : ${ecarts.length} écart(s)`;
    }
    if (!derniereFac && dernier?.statut === "valide") {
      const retenu = dernier.resultat || chiffrageAttendu(dernier);
      const reference = { source: "tour_precedent" as const, nom: `Chiffrage retenu (contrôle du devis, tour ${dernier.tour})`, chocs: retenu.chocs, operations: retenu.operations };
      const { ecarts } = comparerControle(reference, cote);
      await creerControle({ dossierId, type: "facture", reference, devis: cote, ecarts, action: "Contrôle de la facture ouvert (dépôt groupé)" });
      return `facture contrôlée : ${ecarts.length} écart(s)`;
    }
    return "rangée (pas de devis validé à comparer pour l'instant)";
  }

  const libDossier = (id: string) => { const d = dossiers.find((x) => x.id === id); return d ? `${d.immatriculation || "sans immat."} · ${d.numero}${d.reparateur_nom ? ` · ${d.reparateur_nom}` : ""}` : ""; };

  return (
    <ModalShell title="Dépôt groupé de documents" onClose={() => phase !== "lecture" && phase !== "import" && onClose()} maxWidth="max-w-4xl">
      {phase === "choix" && (
        <div
          className="rounded-2xl border-2 border-dashed border-white/25 p-8 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = Array.from(e.dataTransfer.files).filter((x) => /pdf|image/.test(x.type)).slice(0, 20); if (f.length) lire(f); }}
        >
          <div className="font-semibold">Glisse ici tes pré-rapports, devis et factures (20 maximum)</div>
          <p className="mx-auto mt-1 max-w-lg text-sm text-white/55">Chaque document est lu, reconnu et rattaché à son dossier grâce à l&apos;immatriculation. Tu vérifies le rangement proposé <b>avant</b> tout import.</p>
          <input ref={entree} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = Array.from(e.target.files || []).slice(0, 20); if (f.length) lire(f); e.target.value = ""; }} />
          <button className="btn-primary mt-4" onClick={() => entree.current?.click()}><Icone nom="importer" /> Choisir les fichiers</button>
        </div>
      )}

      {phase !== "choix" && (
        <>
          {phase === "lecture" && <p className="text-sm text-white/60">Lecture en cours : {lignes.filter((l) => l.etat !== "attente" && l.etat !== "lecture").length} / {lignes.length}… (20 à 50 s par document)</p>}
          {phase === "verification" && <div className="alerte alerte-info text-sm">Vérifie la nature et le dossier de chaque document, puis importe. Les documents « Ne pas importer » sont ignorés.</div>}
          <div className="max-h-[55vh] overflow-auto rounded-xl border border-white/10">
            <table className="al-table">
              <thead><tr><th>Fichier</th><th>Lu</th><th>Nature</th><th>Dossier</th><th>État</th></tr></thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.cle}>
                    <td className="max-w-[12rem] truncate" title={l.file.name}>{l.file.name}</td>
                    <td className="text-xs">
                      {l.lecture ? <>{l.lecture.vehicule?.immatriculation || "immat. ?"}<br />{l.lecture.reparateur?.nom || ""}{l.lecture.chocs.length || l.lecture.operations.length ? <> · {formatEuros(totalHT(l.lecture))}</> : null}</> : null}
                    </td>
                    <td>
                      <select className="field-input field-compact w-auto" disabled={phase !== "verification" || l.etat !== "lu"} value={l.nature} onChange={(e) => maj(l.cle, { nature: e.target.value as Nature })}>
                        {(Object.keys(LIB) as Nature[]).map((n) => <option key={n} value={n}>{LIB[n]}</option>)}
                      </select>
                    </td>
                    <td className="min-w-[14rem]">
                      {l.etat === "range" && l.resultat ? (
                        <Link href={`/expert/dossiers/${l.resultat.dossierId}?onglet=controle`} className="underline" onClick={onClose}>{libDossier(l.resultat.dossierId) || "Ouvrir le dossier"}</Link>
                      ) : (
                        <select className="field-input field-compact w-full" disabled={phase !== "verification" || l.nature === "ignorer" || l.etat !== "lu"} value={l.cible} onChange={(e) => maj(l.cle, { cible: e.target.value })}>
                          <option value="">— choisir —</option>
                          {cleImmat(l.lecture?.vehicule?.immatriculation) && <option value={`nouveau:${cleImmat(l.lecture?.vehicule?.immatriculation)}`}>+ Nouveau dossier {l.lecture?.vehicule?.immatriculation}</option>}
                          {dossiers.map((d) => <option key={d.id} value={d.id}>{libDossier(d.id)}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="text-xs">
                      {l.etat === "attente" && "en attente"}
                      {l.etat === "lecture" && <span className="text-white/60">lecture…</span>}
                      {l.etat === "lu" && (l.lecture?.confiance === "faible" ? <span className="badge badge-warn">lecture à vérifier</span> : <span className="badge badge-ok">lu</span>)}
                      {l.etat === "erreur" && <span className="text-rose-600">{l.erreur}</span>}
                      {l.etat === "range" && <span className="text-emerald-600">✓ {l.resultat?.texte}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {erreur && <div className="alerte alerte-danger text-sm">{erreur}</div>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-white/55">
              {phase === "verification" && <>{aImporter.length} à importer{nouveaux.length ? ` · ${nouveaux.length} nouveau(x) dossier(s)` : ""}{incomplets.length ? ` · ${incomplets.length} sans dossier choisi` : ""}</>}
              {phase === "fini" && "Import terminé. Ouvre un dossier pour trancher les écarts."}
            </span>
            <div className="flex gap-2">
              {(phase === "verification" || phase === "fini") && <button className="btn-ghost" onClick={onClose}>{phase === "fini" ? "Fermer" : "Annuler"}</button>}
              {phase === "verification" && <button className="btn-primary" disabled={!aImporter.length || incomplets.length > 0} onClick={importer}><Icone nom="check" /> Importer</button>}
              {phase === "import" && <span className="text-sm text-white/60">Import en cours…</span>}
            </div>
          </div>
        </>
      )}
    </ModalShell>
  );
}
