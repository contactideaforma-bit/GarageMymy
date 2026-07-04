"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { DemandeAssurance, Dossier } from "@/lib/types";
import { formatDate, messageErreur } from "@/lib/format";
import ModalShell from "@/components/ModalShell";
import EmailComposer from "@/components/EmailComposer";

const DEMANDEURS: Record<string, string> = {
  assurance: "Assurance",
  expert: "Expert",
  autre: "Autre",
};

/**
 * Demandes de documents complémentaires (assurance / expert) :
 * ce qui est réclamé, depuis quand, envoyé ou pas. Tant qu'une demande
 * est en attente, le moteur « Prochaine action » la remonte en priorité.
 */
export default function DemandesPanel({
  dossier,
  demandes,
  onChanged,
}: {
  dossier: Dossier;
  demandes: DemandeAssurance[];
  onChanged?: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [emailDemande, setEmailDemande] = useState<DemandeAssurance | null>(null);

  const enAttente = demandes.filter((d) => !d.date_envoi).length;

  async function marquerEnvoye(d: DemandeAssurance) {
    await supabase
      .from("demandes_assurance")
      .update({ date_envoi: new Date().toISOString().slice(0, 10) })
      .eq("id", d.id);
    onChanged?.();
  }

  async function supprimer(d: DemandeAssurance) {
    if (!confirm("Supprimer cette demande ?")) return;
    await supabase.from("demandes_assurance").delete().eq("id", d.id);
    onChanged?.();
  }

  return (
    <section className="glass-card">
      <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-white">Demandes de l&apos;assurance</h2>
        <div className="flex items-center gap-2">
          {enAttente > 0 && (
            <span className="font-pixel text-[0.55rem]" style={{ color: "#e11d48" }}>
              {enAttente} EN ATTENTE
            </span>
          )}
          <button onClick={() => setModalOpen(true)} className="btn-ghost py-1.5 px-3 text-xs">
            + Demande reçue
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {demandes.length === 0 && (
          <p className="text-sm text-white/40">
            L&apos;assurance ou l&apos;expert réclame une pièce (facture d&apos;achat, photos, relevé
            d&apos;information…) ? Note-la ici pour ne pas bloquer le paiement.
          </p>
        )}
        {demandes.map((d) => (
          <div key={d.id} className="glass-soft p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {d.date_envoi ? (
                    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700">
                      Envoyé le {formatDate(d.date_envoi)}
                    </span>
                  ) : (
                    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold bg-rose-100 text-rose-700">
                      À envoyer
                    </span>
                  )}
                  <span className="font-medium text-white truncate">{d.demande}</span>
                </div>
                <div className="mt-0.5 text-xs text-white/50">
                  Demandé par {DEMANDEURS[d.demandeur] || d.demandeur} le {formatDate(d.date_demande)}
                  {d.notes ? ` — ${d.notes}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 gap-3 text-sm">
                {!d.date_envoi && (
                  <>
                    <button onClick={() => setEmailDemande(d)} className="text-accent-teal hover:underline">
                      Répondre par email
                    </button>
                    <button onClick={() => marquerEnvoye(d)} className="text-accent-pink hover:underline">
                      Marquer envoyé
                    </button>
                  </>
                )}
                <button onClick={() => supprimer(d)} className="text-white/40 hover:text-rose-300">
                  Suppr.
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <DemandeModal
          dossier={dossier}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            onChanged?.();
          }}
        />
      )}
      {emailDemande && (
        <EmailComposer
          dossier={dossier}
          defaultTo={
            emailDemande.demandeur === "expert"
              ? dossier.expert_email || dossier.cabinet_email || ""
              : dossier.assureur_email || ""
          }
          defaultSubject={`Documents complémentaires — sinistre ${dossier.numero_sinistre || ""}${
            dossier.immatriculation ? ` (${dossier.immatriculation})` : ""
          }`}
          defaultBody={`Bonjour,\n\nSuite à votre demande du ${formatDate(
            emailDemande.date_demande
          )} concernant le dossier ${dossier.numero_sinistre || "—"}, veuillez trouver ci-joint : ${
            emailDemande.demande
          }.\n\n(Pense à joindre le document avant d'envoyer.)\n\nRestant à votre disposition,\nCordialement.`}
          onClose={() => setEmailDemande(null)}
          onSent={() => marquerEnvoye(emailDemande)}
        />
      )}
    </section>
  );
}

/* ----------------------------- Modal demande ----------------------------- */

function DemandeModal({
  dossier,
  onClose,
  onSaved,
}: {
  dossier: Dossier;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [demande, setDemande] = useState("");
  const [demandeur, setDemandeur] = useState("assurance");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!demande.trim()) {
      setError("Indique ce qui est demandé.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: e1 } = await supabase.from("demandes_assurance").insert({
        dossier_id: dossier.id,
        demande: demande.trim(),
        demandeur,
        date_demande: date || null,
        notes: notes || null,
      });
      if (e1) throw e1;
      onSaved();
    } catch (err: unknown) {
      setError(messageErreur(err, "Enregistrement impossible (migration v16 exécutée ?)."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Demande de documents reçue" onClose={onClose}>
      <div>
        <label className="field-label">Ce qui est demandé</label>
        <input
          className="field-input"
          value={demande}
          onChange={(e) => setDemande(e.target.value)}
          placeholder="Ex. photos du véhicule, relevé d'information, facture d'achat…"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Demandé par</label>
          <select className="field-input" value={demandeur} onChange={(e) => setDemandeur(e.target.value)}>
            {Object.entries(DEMANDEURS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Date de la demande</label>
          <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="field-label">Notes (optionnel)</label>
        <input className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </ModalShell>
  );
}
