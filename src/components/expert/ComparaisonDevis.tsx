"use client";

/* ====================================================================
 *  COMPARAISON DEVIS ↔ PRÉ-RAPPORT (mode expert, v13.11)
 *
 *  Le devis du réparateur a été lu ; ses écarts avec le pré-rapport sont
 *  listés du plus lourd au plus léger. L'expert accepte (valeur du devis)
 *  ou refuse (valeur du pré-rapport) chaque écart, peut commenter, puis
 *  établit le rapport définitif : nouvelle version du rapport, écarts et
 *  décisions conservés et imprimés dans le PV.
 * ==================================================================== */

import { useMemo, useState } from "react";
import ModalShell from "@/components/ModalShell";
import Icone from "@/components/expert/Icone";
import { formatEuros } from "@/lib/format";
import { synthese } from "@/lib/expertise/chiffrage";
import { Comparaison, Ecart, LIBELLE_NATURE, appliquerDecisions, comparaisonPourBase, comparer } from "@/lib/expertise/comparaison";
import { Choc, Operation, RapportExpert } from "@/lib/expertise/types";

export default function ComparaisonDevis({
  rapport,
  devis,
  document,
  onClose,
  onValider,
}: {
  rapport: RapportExpert;
  devis: { chocs: Choc[]; operations: Operation[]; total_ht?: number | null };
  document: { id: string | null; nom: string | null };
  onClose: () => void;
  onValider: (comparaison: Comparaison, resultat: { chocs: Choc[]; operations: Operation[] }) => Promise<void>;
}) {
  const [ecarts, setEcarts] = useState<Ecart[]>(() => comparer(rapport, devis));
  const [commentaire, setCommentaire] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [filtre, setFiltre] = useState<"tous" | "poste" | "operation">("tous");

  const totalPre = useMemo(() => synthese(rapport).ht, [rapport]);
  const totalDevis = useMemo(() => synthese({ chocs: devis.chocs, operations: devis.operations, remise: 0, vetuste: 0, srgc: 0, taux_tva: rapport.taux_tva ?? 20 }).ht, [devis, rapport.taux_tva]);
  const apres = useMemo(() => appliquerDecisions(rapport, ecarts), [rapport, ecarts]);
  const totalApres = useMemo(() => synthese({ ...rapport, chocs: apres.chocs, operations: apres.operations }).ht, [rapport, apres]);

  const nbAcceptes = ecarts.filter((e) => e.decision === "accepte").length;
  const visibles = ecarts.filter((e) => filtre === "tous" || e.type === filtre);

  const decider = (id: string, decision: Ecart["decision"]) => setEcarts((l) => l.map((e) => (e.id === id ? { ...e, decision } : e)));
  const commenter = (id: string, commentaire: string) => setEcarts((l) => l.map((e) => (e.id === id ? { ...e, commentaire: commentaire || null } : e)));
  const tout = (decision: Ecart["decision"]) => setEcarts((l) => l.map((e) => ({ ...e, decision })));

  async function valider() {
    setEnCours(true);
    try {
      const comparaison: Comparaison = {
        document_id: document.id,
        document_nom: document.nom,
        rapport_base_id: rapport.id,
        base_version: rapport.version,
        date: new Date().toISOString().slice(0, 10),
        total_pre_rapport: totalPre,
        total_devis: totalDevis,
        commentaire: commentaire.trim() || null,
        ecarts,
      };
      await onValider(comparaisonPourBase(comparaison), apres);
    } finally {
      setEnCours(false);
    }
  }

  const delta = (e: Ecart) => e.montant_apres - e.montant_avant;
  const signe = (n: number) => (n > 0 ? "+" : "") + formatEuros(n);

  return (
    <ModalShell title={`Devis du réparateur ↔ pré-rapport v${rapport.version}`} onClose={() => !enCours && onClose()} maxWidth="max-w-5xl">
      {/* Résumé chiffré */}
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="glass-soft p-2"><div className="text-[11px] uppercase tracking-wider text-white/45">Pré-rapport v{rapport.version}</div><div className="text-lg font-semibold">{formatEuros(totalPre)}</div><div className="text-xs text-white/45">HT</div></div>
        <div className="glass-soft p-2"><div className="text-[11px] uppercase tracking-wider text-white/45">Devis{document.nom ? ` · ${document.nom}` : ""}</div><div className="text-lg font-semibold">{formatEuros(totalDevis)}</div><div className={`text-xs ${totalDevis - totalPre > 0 ? "text-rose-300" : "text-emerald-300"}`}>{signe(totalDevis - totalPre)} vs pré-rapport</div></div>
        <div className="glass-soft border border-accent-teal/40 p-2"><div className="text-[11px] uppercase tracking-wider text-white/45">Rapport définitif</div><div className="text-lg font-semibold">{formatEuros(totalApres)}</div><div className="text-xs text-white/45">{nbAcceptes}/{ecarts.length} écart(s) accepté(s)</div></div>
      </div>

      {ecarts.length === 0 ? (
        <div className="alerte alerte-ok text-sm">Aucun écart : le devis du réparateur est conforme au pré-rapport. Tu peux établir le rapport définitif tel quel.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              {([["tous", `Tous · ${ecarts.length}`], ["poste", `Main-d'œuvre · ${ecarts.filter((e) => e.type === "poste").length}`], ["operation", `Pièces & opérations · ${ecarts.filter((e) => e.type === "operation").length}`]] as const).map(([code, label]) => (
                <button key={code} className={`al-onglet ${filtre === code ? "actif" : ""}`} onClick={() => setFiltre(code)}>{label}</button>
              ))}
            </div>
            <div className="flex gap-1">
              <button className="btn-ghost btn-compact" onClick={() => tout("accepte")}>Tout accepter</button>
              <button className="btn-ghost btn-compact" onClick={() => tout("refuse")}>Tout refuser</button>
            </div>
          </div>

          <div className="max-h-[50vh] overflow-auto rounded-xl border border-white/10">
            <table className="al-table">
              <thead><tr><th>Écart</th><th>Pré-rapport</th><th>Devis</th><th className="num">Δ HT</th><th>Décision</th></tr></thead>
              <tbody>
                {visibles.map((e) => (
                  <tr key={e.id} className={e.decision === "accepte" ? "bg-emerald-500/5" : ""}>
                    <td className="min-w-[14rem]">
                      <span className={`badge mr-1 ${e.nature === "ajout" ? "badge-warn" : e.nature === "suppression" ? "badge-danger" : "badge-info"}`}>{LIBELLE_NATURE[e.nature]}</span>
                      <span className="font-medium">{e.libelle}</span>
                      <div className="text-[11px] text-white/40">{e.type === "poste" ? "Main-d'œuvre" : "Opération"}</div>
                      <input
                        className="field-input field-compact mt-1 w-full text-xs"
                        placeholder="Commentaire (facultatif)"
                        value={e.commentaire || ""}
                        onChange={(ev) => commenter(e.id, ev.target.value)}
                      />
                    </td>
                    <td className={`whitespace-nowrap text-sm ${e.decision === "refuse" ? "font-semibold" : "text-white/55"}`}>{e.avant || <span className="text-white/30">—</span>}</td>
                    <td className={`whitespace-nowrap text-sm ${e.decision === "accepte" ? "font-semibold" : "text-white/55"}`}>{e.apres || <span className="text-white/30">—</span>}</td>
                    <td className={`num whitespace-nowrap font-semibold ${delta(e) > 0 ? "text-rose-300" : delta(e) < 0 ? "text-emerald-300" : ""}`}>{signe(delta(e))}</td>
                    <td className="whitespace-nowrap">
                      <div className="flex gap-1">
                        <button className={`btn-compact ${e.decision === "accepte" ? "btn-primary" : "btn-ghost"}`} onClick={() => decider(e.id, "accepte")} title="Retenir la valeur du devis">Accepter</button>
                        <button className={`btn-compact ${e.decision === "refuse" ? "btn-danger" : "btn-ghost"}`} onClick={() => decider(e.id, "refuse")} title="Conserver le pré-rapport">Refuser</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div>
        <label className="field-label">Commentaire de l&apos;expert (imprimé dans le rapport)</label>
        <textarea className="field-input" rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Ex. : temps de peinture ramenés au barème constructeur ; pièce d'occasion refusée (élément de sécurité)…" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-white/45">Le rapport définitif est créé comme nouvelle version (v{rapport.version + 1}) ; le pré-rapport v{rapport.version} reste consultable.</p>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={enCours} onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={enCours} onClick={valider}>{enCours ? "Création…" : <><Icone nom="rapport" /> Établir le rapport définitif</>}</button>
        </div>
      </div>
    </ModalShell>
  );
}
