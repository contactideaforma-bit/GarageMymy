"use client";

/* ====================================================================
 *  MOTEUR DE RECHERCHE PIÈCES & PRIX (mode expert, v13.5)
 *
 *  1. Le véhicule (du dossier, ou saisi) + la désignation de la pièce.
 *  2. « Estimer » → /api/expert/pieces : référence OEM probable, fourchettes
 *     origine / neuf adaptable / occasion, temps de pose, remarques.
 *  3. Liens PRÉ-REMPLIS vers les catalogues (neuf, réemploi, constructeur,
 *     référence) pour vérifier et affiner.
 *  4. « Retenir » mémorise la pièce (prix, état, fournisseur) dans le
 *     dossier ; « → Chiffrage » l'ajoute aux opérations du rapport.
 * ==================================================================== */

import { useEffect, useState } from "react";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import { formatEuros, messageErreur } from "@/lib/format";
import { chargerPieces, enregistrerPiece, supprimerPiece } from "@/lib/expertise/data";
import { CATEGORIES, CategorieFournisseur, EstimationPiece, fournisseursPour } from "@/lib/expertise/fournisseurs";
import { DossierExpert, Operation, PieceExpert } from "@/lib/expertise/types";
import { Bloc, Champ, Erreur, Vide } from "@/components/expert/ui";

type Vehicule = { marque: string; modele: string; finition: string; annee: string; vin: string; energie: string; immatriculation: string };

const ETATS: { code: PieceExpert["etat"]; label: string; qualite: Operation["qualite"] }[] = [
  { code: "origine", label: "Origine (O)", qualite: "origine" },
  { code: "equivalent", label: "Équivalente (Q)", qualite: "equivalente" },
  { code: "occasion", label: "Réemploi (R)", qualite: "reemploi" },
  { code: "neuf", label: "Neuf adaptable", qualite: "equivalente" },
];

export default function PiecesRecherche({
  dossier,
  onAjouterAuChiffrage,
}: {
  dossier?: DossierExpert | null;
  onAjouterAuChiffrage?: (op: Operation) => void;
}) {
  const [veh, setVeh] = useState<Vehicule>({
    marque: dossier?.marque || "", modele: dossier?.modele || "", finition: dossier?.finition || "",
    annee: dossier?.date_mec ? dossier.date_mec.slice(0, 4) : "", vin: dossier?.vin || "", energie: dossier?.energie || "", immatriculation: dossier?.immatriculation || "",
  });
  const [designation, setDesignation] = useState("");
  const [reference, setReference] = useState("");
  const [estimation, setEstimation] = useState<EstimationPiece | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [categorie, setCategorie] = useState<CategorieFournisseur>("neuf");
  const [pieces, setPieces] = useState<PieceExpert[]>([]);
  const [prixRetenu, setPrixRetenu] = useState<string>("");
  const [etat, setEtat] = useState<PieceExpert["etat"]>("origine");
  const [fournisseur, setFournisseur] = useState("");
  const [ok, setOk] = useState<string | null>(null);

  const recharger = () => chargerPieces(dossier?.id || null).then(setPieces);
  useEffect(() => { recharger(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dossier?.id]);

  async function estimer() {
    if (!designation.trim()) { setErreur("Indique la pièce recherchée (ex. « aile avant gauche »)."); return; }
    setChargement(true); setErreur(null); setEstimation(null); setOk(null);
    try {
      const res = await fetchAuth("/api/expert/pieces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designation: designation.trim(), ...veh }),
      });
      const r = await lireReponse<{ data: EstimationPiece }>(res);
      if (!r.ok || !r.data) throw new Error(r.error || "Estimation indisponible.");
      setEstimation(r.data.data);
      if (r.data.data.reference_oem && !reference) setReference(r.data.data.reference_oem);
      if (r.data.data.prix_retenu) setPrixRetenu(String(r.data.data.prix_retenu));
    } catch (e) { setErreur(messageErreur(e, "Estimation impossible.")); } finally { setChargement(false); }
  }

  async function retenir() {
    if (!designation.trim()) return;
    setErreur(null);
    try {
      await enregistrerPiece({
        dossier_id: dossier?.id || null,
        designation: (estimation?.designation_normalisee || designation).trim(),
        reference: reference.trim() || null,
        etat,
        fournisseur: fournisseur.trim() || null,
        prix_ht: prixRetenu ? Number(prixRetenu) : null,
        source: estimation ? "ia" : "manuel",
        notes: estimation?.remarques || null,
      });
      setOk("Pièce mémorisée dans le dossier.");
      await recharger();
    } catch (e) { setErreur(messageErreur(e)); }
  }

  function versChiffrage(p: { designation: string; prix_ht: number | null; reference: string | null; etat: PieceExpert["etat"] }) {
    if (!onAjouterAuChiffrage) return;
    const e = ETATS.find((x) => x.code === p.etat);
    onAjouterAuChiffrage({
      op: "E",
      peinture: estimation?.peinture_necessaire ?? /aile|porte|capot|bouclier|pare-?chocs|hayon|coffre|custode|bas de caisse|retroviseur|rétroviseur/i.test(p.designation),
      designation: p.designation.toUpperCase(),
      qte: 1,
      prix_unit: p.prix_ht || 0,
      reference: p.reference,
      qualite: e?.qualite || null,
    });
    setOk(`« ${p.designation} » ajoutée au chiffrage.`);
  }

  const q = { designation: designation.trim(), marque: veh.marque, modele: veh.modele, reference: reference.trim() || null, immatriculation: veh.immatriculation };
  const fourchette = (f: { min: number; max: number } | null) => (f ? `${formatEuros(f.min)} – ${formatEuros(f.max)}` : "—");

  return (
    <div className="space-y-4">
      <Bloc titre="Pièce recherchée">
        {!dossier && (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Champ label="Marque"><input className="field-input field-compact" value={veh.marque} onChange={(e) => setVeh({ ...veh, marque: e.target.value })} /></Champ>
            <Champ label="Modèle"><input className="field-input field-compact" value={veh.modele} onChange={(e) => setVeh({ ...veh, modele: e.target.value })} /></Champ>
            <Champ label="Finition / moteur"><input className="field-input field-compact" value={veh.finition} onChange={(e) => setVeh({ ...veh, finition: e.target.value })} /></Champ>
            <Champ label="Année"><input className="field-input field-compact" value={veh.annee} onChange={(e) => setVeh({ ...veh, annee: e.target.value })} /></Champ>
          </div>
        )}
        {dossier && (
          <p className="mb-3 text-sm text-white/60">
            Véhicule du dossier : <span className="font-medium text-white/85">{[veh.marque, veh.modele, veh.finition].filter(Boolean).join(" ")}</span>
            {veh.annee && ` (${veh.annee})`}{veh.vin && ` · VIN ${veh.vin}`}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="field-input flex-1" placeholder="Désignation : aile avant gauche, optique AVD, bouclier arrière…" value={designation} onChange={(e) => setDesignation(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); estimer(); } }} />
          <input className="field-input sm:w-48" placeholder="Référence (si connue)" value={reference} onChange={(e) => setReference(e.target.value)} />
          <button type="button" className="btn-primary shrink-0" disabled={chargement} onClick={estimer}>{chargement ? "Estimation…" : "✨ Estimer le prix"}</button>
        </div>
        <Erreur message={erreur} />
        {ok && <div className="alerte alerte-ok mt-2 text-sm">{ok}</div>}
      </Bloc>

      {estimation && (
        <Bloc titre={`Estimation — ${estimation.designation_normalisee || estimation.designation}`}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="glass-soft p-3">
              <div className="text-[11px] uppercase tracking-wider text-white/45">Origine constructeur (O)</div>
              <div className="text-lg font-semibold">{fourchette(estimation.prix_origine)}</div>
              {estimation.prix_retenu && <div className="text-xs text-white/55">Prix retenu conseillé : {formatEuros(estimation.prix_retenu)} HT</div>}
            </div>
            <div className="glass-soft p-3">
              <div className="text-[11px] uppercase tracking-wider text-white/45">Neuf adaptable (Q)</div>
              <div className="text-lg font-semibold">{fourchette(estimation.prix_neuf_adaptable)}</div>
            </div>
            <div className="glass-soft p-3">
              <div className="text-[11px] uppercase tracking-wider text-white/45">Réemploi / occasion (R)</div>
              <div className="text-lg font-semibold">{fourchette(estimation.prix_occasion)}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/70">
            {estimation.reference_oem && <span>Réf. OEM probable : <span className="font-mono font-medium text-white/90">{estimation.reference_oem}</span></span>}
            {estimation.references_alternatives.length > 0 && <span>Équivalents : {estimation.references_alternatives.join(", ")}</span>}
            {estimation.temps_pose_heures !== null && <span>Pose : {estimation.temps_pose_heures} h</span>}
            <span>{estimation.peinture_necessaire ? "Pièce à peindre" : "Sans peinture"}</span>
          </div>
          {estimation.remarques && <p className="mt-2 text-sm text-white/60">{estimation.remarques}</p>}
          <p className="mt-2 text-[11px] text-white/40">Estimation indicative générée par l&apos;IA — à confirmer sur les catalogues ci-dessous avant d&apos;être retenue.</p>
        </Bloc>
      )}

      <Bloc titre="Vérifier sur les catalogues">
        <div className="segment mb-3 flex-wrap">
          {CATEGORIES.map((c) => (
            <button key={c.code} type="button" className={`segment-btn ${categorie === c.code ? "actif" : ""}`} onClick={() => setCategorie(c.code)} title={c.hint}>{c.label}</button>
          ))}
        </div>
        {!designation.trim() ? (
          <p className="text-sm text-white/50">Saisis une désignation pour préparer les recherches.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fournisseursPour(veh.marque, categorie).map((f) => (
              <a key={f.code} href={f.url(q)} target="_blank" rel="noopener noreferrer" className="carte-liste flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{f.nom}</div>
                  <div className="truncate text-xs text-white/55">{f.description}</div>
                </div>
                <span className="shrink-0 text-xs text-white/50">Ouvrir ↗</span>
              </a>
            ))}
          </div>
        )}
      </Bloc>

      <Bloc titre="Retenir la pièce">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Champ label="Prix HT retenu"><input type="number" step="0.01" className="field-input" value={prixRetenu} onChange={(e) => setPrixRetenu(e.target.value)} /></Champ>
          <Champ label="Qualité">
            <select className="field-input" value={etat} onChange={(e) => setEtat(e.target.value as PieceExpert["etat"])}>
              {ETATS.map((e) => <option key={e.code} value={e.code}>{e.label}</option>)}
            </select>
          </Champ>
          <Champ label="Fournisseur"><input className="field-input" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} placeholder="Oscaro, GPA, concession…" /></Champ>
          <div className="flex items-end gap-2">
            <button type="button" className="btn-ghost w-full" disabled={!designation.trim()} onClick={retenir}>💾 Retenir</button>
            {onAjouterAuChiffrage && (
              <button type="button" className="btn-primary w-full" disabled={!designation.trim()} onClick={() => versChiffrage({ designation: estimation?.designation_normalisee || designation, prix_ht: prixRetenu ? Number(prixRetenu) : null, reference: reference || null, etat })}>→ Chiffrage</button>
            )}
          </div>
        </div>
      </Bloc>

      <Bloc titre={dossier ? "Pièces retenues pour ce dossier" : "Dernières pièces recherchées"}>
        {pieces.length === 0 ? (
          <Vide titre="Aucune pièce mémorisée" texte="Les pièces retenues apparaissent ici avec leur référence et leur prix." />
        ) : (
          <div className="overflow-x-auto">
            <table className="al-table">
              <thead><tr><th>Désignation</th><th>Référence</th><th>Qualité</th><th>Fournisseur</th><th className="num">Prix HT</th><th></th></tr></thead>
              <tbody>
                {pieces.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.designation}{p.source === "ia" && <span className="ml-1 text-[10px] text-white/40">IA</span>}</td>
                    <td className="font-mono text-xs">{p.reference || "—"}</td>
                    <td>{ETATS.find((e) => e.code === p.etat)?.label || p.etat}</td>
                    <td>{p.fournisseur || "—"}</td>
                    <td className="num">{p.prix_ht !== null ? formatEuros(Number(p.prix_ht)) : "—"}</td>
                    <td className="whitespace-nowrap text-right">
                      {onAjouterAuChiffrage && <button className="btn-ghost btn-compact mr-1" onClick={() => versChiffrage({ designation: p.designation, prix_ht: p.prix_ht !== null ? Number(p.prix_ht) : null, reference: p.reference, etat: p.etat })}>→ Chiffrage</button>}
                      <button className="btn-danger btn-compact" onClick={async () => { await supprimerPiece(p.id); recharger(); }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloc>
    </div>
  );
}
