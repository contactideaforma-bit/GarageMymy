"use client";

/* ====================================================================
 *  VÉRIFIER / CORRIGER LA LECTURE d'un document (contrôle du devis, v13.23)
 *
 *  L'IA peut mal lire une ligne. Avant de trancher, l'expert voit ici ce
 *  qui a été lu (main-d'œuvre + opérations), le compare au total imprimé
 *  et corrige au besoin. Rien n'est enregistré tant qu'il ne valide pas.
 * ==================================================================== */

import { useMemo, useState } from "react";
import ModalShell from "@/components/ModalShell";
import Icone from "@/components/expert/Icone";
import { formatEuros } from "@/lib/format";
import { CODES_OPERATION, Choc, CodeOperation, Operation, PosteChoc } from "@/lib/expertise/types";
import { POSTES_STANDARD, montantOperation, montantPoste } from "@/lib/expertise/chiffrage";
import { CoteControle, totalHT } from "@/lib/expertise/controle";

type LignePoste = PosteChoc & { choc: number };

export default function LectureControleModal({
  titre,
  cote,
  lectureSeule,
  onClose,
  onValider,
  onOuvrirDocument,
}: {
  titre: string;
  cote: CoteControle;
  lectureSeule?: boolean;
  onClose: () => void;
  onValider: (c: CoteControle) => void;
  onOuvrirDocument?: () => void;
}) {
  const [postes, setPostes] = useState<LignePoste[]>(() => (cote.chocs || []).flatMap((c) => (c.postes || []).map((p) => ({ ...p, choc: c.numero }))));
  const [ops, setOps] = useState<Operation[]>(() => (cote.operations || []).map((o) => ({ ...o })));
  const [modifie, setModifie] = useState(false);

  const chiffrage = useMemo(() => {
    const numeros = Array.from(new Set(postes.map((p) => p.choc))).sort((a, b) => a - b);
    const chocs: Choc[] = (numeros.length ? numeros : [1]).map((n) => {
      const orig = (cote.chocs || []).find((c) => c.numero === n);
      return { numero: n, libelle: orig?.libelle || `Choc ${n}`, postes: postes.filter((p) => p.choc === n).map(({ choc: _c, ...p }) => p) };
    });
    return { chocs, operations: ops };
  }, [postes, ops, cote.chocs]);
  const total = totalHT(chiffrage);
  const imprime = Number(cote.total_imprime_ht) || 0;
  const ecartImprime = imprime ? Math.round((imprime - total) * 100) / 100 : 0;

  const num = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")) || 0);
  const majPoste = (i: number, patch: Partial<LignePoste>) => { setModifie(true); setPostes((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p))); };
  const majOp = (i: number, patch: Partial<Operation>) => { setModifie(true); setOps((l) => l.map((o, j) => (j === i ? { ...o, ...patch } : o))); };

  function fermer() {
    if (modifie && !confirm("Abandonner les corrections de la lecture ?")) return;
    onClose();
  }

  return (
    <ModalShell title={titre} onClose={fermer} maxWidth="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div>
          <span className="font-semibold">{cote.nom || "Document"}</span>
          {cote.confiance && <span className={`badge ml-2 ${cote.confiance === "bonne" ? "badge-ok" : cote.confiance === "moyenne" ? "badge-info" : "badge-warn"}`}>Lecture {cote.confiance}</span>}
          {cote.corrige && <span className="badge badge-neutral ml-1">Corrigée à la main</span>}
        </div>
        {onOuvrirDocument && <button className="btn-ghost btn-compact" onClick={onOuvrirDocument}><Icone nom="oeil" /> Ouvrir le document</button>}
      </div>

      <div className={`alerte text-sm ${imprime && Math.abs(ecartImprime) > Math.max(1, imprime * 0.01) ? "alerte-warn" : "alerte-info"}`}>
        Total lu : <b>{formatEuros(total)} HT</b>
        {imprime ? (
          <> · total imprimé sur le document : <b>{formatEuros(imprime)} HT</b>
            {Math.abs(ecartImprime) > Math.max(1, imprime * 0.01)
              ? <> — <b>écart de {formatEuros(ecartImprime)}</b> : une ligne a peut-être été mal lue (ou le total inclut des frais hors réparation). Vérifie avec le document.</>
              : <> — cohérent.</>}
          </>
        ) : <> · aucun total imprimé repéré : vérifie les lignes avec le document.</>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="titre-section">Main-d&apos;œuvre</h3>
          {!lectureSeule && <button className="btn-ghost btn-compact" onClick={() => { setModifie(true); setPostes((l) => [...l, { choc: l[0]?.choc || 1, poste: "Tôlerie T1", heures: 0, taux: 0, remise: 0 }]); }}><Icone nom="plus" /> Poste</button>}
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="al-table">
            <thead><tr><th>Poste</th><th className="num">Heures</th><th className="num">Taux €/h</th><th className="num">Remise %</th><th className="num">Forfait €</th><th className="num">Montant</th><th /></tr></thead>
            <tbody>
              {postes.length === 0 && <tr><td colSpan={7} className="text-center text-white/45">Aucun poste lu.</td></tr>}
              {postes.map((p, i) => (
                <tr key={i}>
                  <td className="min-w-[10rem]">
                    <input className="field-input field-compact w-full" list="postes-standard" value={p.poste} disabled={lectureSeule} onChange={(e) => majPoste(i, { poste: e.target.value })} />
                  </td>
                  <td className="num"><input className="field-input field-compact w-20 text-right" inputMode="decimal" value={p.heures || ""} disabled={lectureSeule} onChange={(e) => majPoste(i, { heures: num(e.target.value) })} /></td>
                  <td className="num"><input className="field-input field-compact w-20 text-right" inputMode="decimal" value={p.taux || ""} disabled={lectureSeule} onChange={(e) => majPoste(i, { taux: num(e.target.value) })} /></td>
                  <td className="num"><input className="field-input field-compact w-16 text-right" inputMode="decimal" value={p.remise || ""} disabled={lectureSeule} onChange={(e) => majPoste(i, { remise: num(e.target.value) })} /></td>
                  <td className="num"><input className="field-input field-compact w-20 text-right" inputMode="decimal" value={p.forfait || ""} disabled={lectureSeule} onChange={(e) => majPoste(i, { forfait: num(e.target.value) || null })} /></td>
                  <td className="num whitespace-nowrap font-medium">{formatEuros(montantPoste(p))}</td>
                  <td>{!lectureSeule && <button className="btn-ghost btn-compact" title="Retirer la ligne" onClick={() => { setModifie(true); setPostes((l) => l.filter((_, j) => j !== i)); }}><Icone nom="croix" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <datalist id="postes-standard">{POSTES_STANDARD.map((p) => <option key={p} value={p} />)}</datalist>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="titre-section">Opérations et pièces</h3>
          {!lectureSeule && <button className="btn-ghost btn-compact" onClick={() => { setModifie(true); setOps((l) => [...l, { op: "E", peinture: false, designation: "", qte: 1, prix_unit: 0 }]); }}><Icone nom="plus" /> Opération</button>}
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="al-table">
            <thead><tr><th>Op.</th><th title="Opération de peinture">Peint.</th><th>Désignation</th><th className="num">Qté</th><th className="num">Prix unit. €</th><th className="num">Remise %</th><th>Qualité</th><th className="num">Montant</th><th /></tr></thead>
            <tbody>
              {ops.length === 0 && <tr><td colSpan={9} className="text-center text-white/45">Aucune opération lue.</td></tr>}
              {ops.map((o, i) => (
                <tr key={i}>
                  <td>
                    <select className="field-input field-compact w-auto" value={o.op} disabled={lectureSeule} onChange={(e) => majOp(i, { op: e.target.value as CodeOperation })}>
                      {CODES_OPERATION.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
                    </select>
                  </td>
                  <td className="text-center"><input type="checkbox" checked={Boolean(o.peinture)} disabled={lectureSeule} onChange={(e) => majOp(i, { peinture: e.target.checked })} /></td>
                  <td className="min-w-[12rem]"><input className="field-input field-compact w-full" value={o.designation} disabled={lectureSeule} onChange={(e) => majOp(i, { designation: e.target.value.toUpperCase() })} /></td>
                  <td className="num"><input className="field-input field-compact w-16 text-right" inputMode="decimal" value={o.qte || ""} disabled={lectureSeule} onChange={(e) => majOp(i, { qte: num(e.target.value) })} /></td>
                  <td className="num"><input className="field-input field-compact w-24 text-right" inputMode="decimal" value={o.prix_unit || ""} disabled={lectureSeule} onChange={(e) => majOp(i, { prix_unit: num(e.target.value) })} /></td>
                  <td className="num"><input className="field-input field-compact w-16 text-right" inputMode="decimal" value={o.remise || ""} disabled={lectureSeule} onChange={(e) => majOp(i, { remise: num(e.target.value) })} /></td>
                  <td>
                    <select className="field-input field-compact w-auto" value={o.qualite || ""} disabled={lectureSeule} onChange={(e) => majOp(i, { qualite: (e.target.value || null) as Operation["qualite"] })}>
                      <option value="">—</option><option value="origine">Origine</option><option value="equivalente">Équivalente</option><option value="reemploi">Réemploi</option>
                    </select>
                  </td>
                  <td className="num whitespace-nowrap font-medium">{o.prix_unit ? formatEuros(montantOperation(o)) : ""}</td>
                  <td>{!lectureSeule && <button className="btn-ghost btn-compact" title="Retirer la ligne" onClick={() => { setModifie(true); setOps((l) => l.filter((_, j) => j !== i)); }}><Icone nom="croix" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-white/45">{lectureSeule ? "Contrôle conclu : la lecture n'est plus modifiable (rouvre le contrôle pour corriger)." : "Les décisions déjà prises sur les lignes inchangées sont conservées."}</p>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={fermer}>{lectureSeule ? "Fermer" : "Annuler"}</button>
          {!lectureSeule && (
            <button className="btn-primary" disabled={!modifie} onClick={() => onValider({ ...cote, chocs: chiffrage.chocs, operations: chiffrage.operations.filter((o) => o.designation.trim()), corrige: true })}>
              <Icone nom="check" /> Enregistrer les corrections
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
