"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Document, Dossier, Paiement, Relance } from "@/lib/types";
import { formatEuros, formatDate, messageErreur } from "@/lib/format";
import EmailComposer from "@/components/EmailComposer";
import ModalShell from "@/components/ModalShell";
import {
  MOYENS,
  CANAUX,
  labelMoyen,
  labelCanal,
  totalPaye,
  statutPaiement,
  resteAPayer,
  enRetard,
  STATUT_PAIEMENT,
  templateRelance,
} from "@/lib/paiements";

type FactureFinance = Document & { paiements: Paiement[]; relances: Relance[] };

export default function PaiementsPanel({
  dossier,
  onChanged,
}: {
  dossier: Dossier;
  onChanged?: () => void;
}) {
  const dossierId = dossier.id;
  const [factures, setFactures] = useState<FactureFinance[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<
    | { kind: "paiement"; facture: FactureFinance }
    | { kind: "relance"; facture: FactureFinance }
    | null
  >(null);
  const [emailFacture, setEmailFacture] = useState<FactureFinance | null>(null);
  const [relanceAuto, setRelanceAuto] = useState<boolean>(Boolean(dossier.relance_auto));

  async function toggleRelanceAuto() {
    const next = !relanceAuto;
    setRelanceAuto(next);
    const { error } = await supabase.from("dossiers").update({ relance_auto: next }).eq("id", dossier.id);
    if (error) {
      setRelanceAuto(!next);
      alert(messageErreur(error, "Impossible de modifier les relances automatiques (migration v13 exécutée ?)."));
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data: docs } = await supabase
      .from("documents")
      .select("*")
      .eq("dossier_id", dossierId)
      .eq("type", "facture")
      .order("created_at", { ascending: false });

    const facs = (docs as Document[]) || [];
    const ids = facs.map((f) => f.id);

    let paiements: Paiement[] = [];
    let relances: Relance[] = [];
    if (ids.length) {
      const [p, r] = await Promise.all([
        supabase.from("paiements").select("*").in("document_id", ids).order("date_paiement", { ascending: false }),
        supabase.from("relances").select("*").in("document_id", ids).order("date_relance", { ascending: false }),
      ]);
      paiements = (p.data as Paiement[]) || [];
      relances = (r.data as Relance[]) || [];
    }

    setFactures(
      facs.map((f) => ({
        ...f,
        paiements: paiements.filter((p) => p.document_id === f.id),
        relances: relances.filter((r) => r.document_id === f.id),
      }))
    );
    setLoading(false);
  }, [dossierId]);

  useEffect(() => {
    load();
  }, [load]);

  function refresh() {
    load();
    onChanged?.();
  }

  async function supprimerPaiement(p: Paiement) {
    if (!confirm("Supprimer ce paiement ?")) return;
    await supabase.from("paiements").delete().eq("id", p.id);
    // si la facture n'est plus soldée, on la repasse en "envoyé"
    const fac = factures.find((f) => f.id === p.document_id);
    if (fac) {
      const reste = resteAPayer(fac.total_ttc, totalPaye(fac.paiements) - (Number(p.montant) || 0));
      if (reste > 0 && fac.statut === "paye") {
        await supabase.from("documents").update({ statut: "envoye" }).eq("id", fac.id);
      }
    }
    refresh();
  }

  return (
    <section className="glass-card">
      <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-white">Finance — paiements & relances</h2>
        <button
          onClick={toggleRelanceAuto}
          className="flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors"
          title="Quand c'est activé, l'appli envoie seule les relances n°1 et n°2 à l'assureur pour les factures échues de ce dossier (jamais la mise en demeure)."
        >
          Relances automatiques
          <span
            className={`relative h-5 w-9 rounded-full transition-colors ${
              relanceAuto ? "bg-accent-violet" : "bg-white/20"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                relanceAuto ? "left-[1.15rem]" : "left-0.5"
              }`}
            />
          </span>
        </button>
      </div>
      <div className="px-5 py-4 space-y-4">
        {loading && <p className="text-sm text-white/40">Chargement…</p>}
        {!loading && factures.length === 0 && (
          <p className="text-sm text-white/40">Aucune facture. Crée une facture pour suivre les encaissements.</p>
        )}

        {factures.map((f) => {
          const paye = totalPaye(f.paiements);
          const reste = resteAPayer(f.total_ttc, paye);
          const sp = statutPaiement(f.total_ttc, paye);
          const retard = enRetard(f, reste);
          const derniereRelance = f.relances[0];

          return (
            <div key={f.id} className="glass-soft p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{f.numero || "Facture"}</span>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUT_PAIEMENT[sp].badge}`}>
                      {STATUT_PAIEMENT[sp].label}
                    </span>
                    {retard && (
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-rose-500/20 text-rose-200">
                        En retard
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    Émise le {formatDate(f.date_document)}
                    {f.date_echeance ? ` · échéance ${formatDate(f.date_echeance)}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModal({ kind: "paiement", facture: f })}
                    className="btn-primary py-1.5 px-3 text-xs"
                  >
                    + Paiement
                  </button>
                  <button
                    onClick={() => setModal({ kind: "relance", facture: f })}
                    className="btn-ghost py-1.5 px-3 text-xs"
                  >
                    + Relance
                  </button>
                  <button
                    onClick={() => setEmailFacture(f)}
                    className="btn-ghost py-1.5 px-3 text-xs"
                  >
                    Relancer par email
                  </button>
                </div>
              </div>

              {/* Montants */}
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-xs text-white/40">Total TTC</div>
                  <div className="text-white/90 font-medium">{formatEuros(f.total_ttc)}</div>
                </div>
                <div>
                  <div className="text-xs text-white/40">Encaissé</div>
                  <div className="text-emerald-300 font-medium">{formatEuros(paye)}</div>
                </div>
                <div>
                  <div className="text-xs text-white/40">Reste à payer</div>
                  <div className={`font-medium ${reste > 0 ? "text-amber-300" : "text-white/60"}`}>
                    {formatEuros(reste)}
                  </div>
                </div>
              </div>

              {/* Détail des paiements */}
              {f.paiements.length > 0 && (
                <ul className="mt-3 divide-y divide-white/10 border-t border-white/10">
                  {f.paiements.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="text-white/80">
                        {formatEuros(p.montant)}{" "}
                        <span className="text-white/40">
                          · {labelMoyen(p.moyen)} · {formatDate(p.date_paiement)}
                          {p.reference ? ` · réf. ${p.reference}` : ""}
                        </span>
                      </span>
                      <button onClick={() => supprimerPaiement(p)} className="text-white/30 hover:text-rose-300" title="Supprimer">
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Relances */}
              {derniereRelance && (
                <div className="mt-2 text-xs text-white/40">
                  {f.relances.length} relance{f.relances.length > 1 ? "s" : ""} · dernière :{" "}
                  {labelCanal(derniereRelance.canal)} le {formatDate(derniereRelance.date_relance)}
                  {derniereRelance.notes ? ` — ${derniereRelance.notes}` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modal?.kind === "paiement" && (
        <PaiementModal
          facture={modal.facture}
          dossierId={dossierId}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {modal?.kind === "relance" && (
        <RelanceModal
          facture={modal.facture}
          dossierId={dossierId}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {emailFacture && (
        <EmailComposer
          dossier={dossier}
          document={emailFacture}
          defaultTo={dossier.assureur_email || ""}
          defaultSubject={templateRelance(emailFacture.relances.length + 1, emailFacture, dossier).subject}
          defaultBody={templateRelance(emailFacture.relances.length + 1, emailFacture, dossier).body}
          onClose={() => setEmailFacture(null)}
          onSent={async () => {
            await supabase.from("relances").insert({
              dossier_id: dossierId,
              document_id: emailFacture.id,
              date_relance: new Date().toISOString().slice(0, 10),
              canal: "email",
              notes: "Relance envoyée par email",
            });
            refresh();
          }}
        />
      )}
    </section>
  );
}

/* ----------------------------- Modals ----------------------------- */

function PaiementModal({
  facture,
  dossierId,
  onClose,
  onSaved,
}: {
  facture: FactureFinance;
  dossierId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dejaPaye = totalPaye(facture.paiements);
  const reste = resteAPayer(facture.total_ttc, dejaPaye);

  const [montant, setMontant] = useState(reste > 0 ? String(reste) : "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [moyen, setMoyen] = useState("virement");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const m = Number(montant) || 0;
      if (m <= 0) throw new Error("Indique un montant supérieur à 0.");
      const { error: e1 } = await supabase.from("paiements").insert({
        dossier_id: dossierId,
        document_id: facture.id,
        montant: m,
        date_paiement: date,
        moyen,
        reference: reference || null,
        notes: notes || null,
      });
      if (e1) throw e1;
      // Facture soldée → statut payé
      const nouveauReste = resteAPayer(facture.total_ttc, dejaPaye + m);
      if (nouveauReste <= 0) {
        await supabase.from("documents").update({ statut: "paye" }).eq("id", facture.id);
      }
      onSaved();
    } catch (err: unknown) {
      setError(messageErreur(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Encaisser — ${facture.numero || "facture"}`} onClose={onClose}>
      <div className="text-sm text-white/60">
        Total TTC {formatEuros(facture.total_ttc)} · reste à payer{" "}
        <span className="text-amber-300 font-medium">{formatEuros(reste)}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Montant reçu (€)</label>
          <input type="number" className="field-input" value={montant} onChange={(e) => setMontant(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Date</label>
          <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Moyen</label>
          <select className="field-input" value={moyen} onChange={(e) => setMoyen(e.target.value)}>
            {Object.entries(MOYENS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Référence (optionnel)</label>
          <input className="field-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° chèque, virement…" />
        </div>
      </div>
      <div>
        <label className="field-label">Notes</label>
        <input className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Enregistrement…" : "Enregistrer le paiement"}
        </button>
      </div>
    </ModalShell>
  );
}

function RelanceModal({
  facture,
  dossierId,
  onClose,
  onSaved,
}: {
  facture: FactureFinance;
  dossierId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [canal, setCanal] = useState("email");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { error: e1 } = await supabase.from("relances").insert({
        dossier_id: dossierId,
        document_id: facture.id,
        date_relance: date,
        canal,
        notes: notes || null,
      });
      if (e1) throw e1;
      onSaved();
    } catch (err: unknown) {
      setError(messageErreur(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Relance — ${facture.numero || "facture"}`} onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Date</label>
          <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Canal</label>
          <select className="field-input" value={canal} onChange={(e) => setCanal(e.target.value)}>
            {Object.entries(CANAUX).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="field-label">Notes</label>
        <textarea className="field-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contenu / objet de la relance…" />
      </div>
      {error && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Enregistrement…" : "Journaliser la relance"}
        </button>
      </div>
    </ModalShell>
  );
}
