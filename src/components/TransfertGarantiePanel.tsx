"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, FlotteVehicule, TransfertGarantie } from "@/lib/types";
import { formatDate, messageErreur } from "@/lib/format";
import ModalShell from "@/components/ModalShell";
import EmailComposer from "@/components/EmailComposer";

const STATUTS_TRANSFERT: Record<string, { label: string; badge: string }> = {
  a_demander: { label: "À demander", badge: "bg-rose-100 text-rose-700" },
  demande: { label: "Demandé", badge: "bg-amber-100 text-amber-700" },
  accorde: { label: "Accordé", badge: "bg-emerald-100 text-emerald-700" },
  refuse: { label: "Refusé", badge: "bg-slate-100 text-slate-500" },
};

/**
 * Véhicule de prêt & transfert de garantie : le client repart avec un
 * véhicule de la flotte pendant les réparations — on demande à SON
 * assurance de transférer les garanties du contrat sur ce véhicule.
 */
export default function TransfertGarantiePanel({
  dossier,
  onChanged,
}: {
  dossier: Dossier;
  onChanged?: () => void;
}) {
  const [transferts, setTransferts] = useState<TransfertGarantie[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [emailTransfert, setEmailTransfert] = useState<TransfertGarantie | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("transferts_garantie")
      .select("*")
      .eq("dossier_id", dossier.id)
      .order("created_at", { ascending: false });
    setTransferts((data as TransfertGarantie[]) || []);
    setLoading(false);
  }, [dossier.id]);

  useEffect(() => { load(); }, [load]);

  function refresh() {
    load();
    onChanged?.();
  }

  async function changerStatut(t: TransfertGarantie, statut: string) {
    const maj: Record<string, unknown> = { statut };
    if (statut === "demande" && !t.date_demande) maj.date_demande = new Date().toISOString().slice(0, 10);
    if (statut === "accorde" && !t.date_accord) maj.date_accord = new Date().toISOString().slice(0, 10);
    await supabase.from("transferts_garantie").update(maj).eq("id", t.id);
    refresh();
  }

  async function supprimer(t: TransfertGarantie) {
    if (!confirm("Supprimer ce transfert de garantie ?")) return;
    await supabase.from("transferts_garantie").delete().eq("id", t.id);
    refresh();
  }

  return (
    <section className="glass-card">
      <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-white">Véhicule de prêt — transfert de garantie</h2>
        <button onClick={() => setModalOpen(true)} className="btn-ghost py-1.5 px-3 text-xs">
          + Véhicule de prêt
        </button>
      </div>

      <div className="px-5 py-4 space-y-3">
        {loading && <p className="text-sm text-white/40">Chargement…</p>}
        {!loading && transferts.length === 0 && (
          <p className="text-sm text-white/40">
            Tu prêtes un véhicule de ta flotte pendant les réparations ? Enregistre-le ici et
            demande à l&apos;assurance du client le transfert des garanties sur le véhicule prêté.
          </p>
        )}

        {transferts.map((t) => {
          const st = STATUTS_TRANSFERT[t.statut] || STATUTS_TRANSFERT.a_demander;
          return (
            <div key={t.id} className="glass-soft p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${st.badge}`}>
                      {st.label}
                    </span>
                    <span className="font-medium text-white">
                      {t.vehicule_modele || "Véhicule"}{t.vehicule_immat ? ` (${t.vehicule_immat})` : ""}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-white/50">
                    Prêt du {formatDate(t.date_debut)} au {formatDate(t.date_fin)}
                    {t.date_demande ? ` · demandé le ${formatDate(t.date_demande)}` : ""}
                    {t.date_accord ? ` · accordé le ${formatDate(t.date_accord)}` : ""}
                    {t.notes ? ` — ${t.notes}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-sm">
                  {t.statut !== "accorde" && (
                    <button onClick={() => setEmailTransfert(t)} className="text-accent-teal hover:underline">
                      Demander à l&apos;assurance
                    </button>
                  )}
                  {t.statut === "demande" && (
                    <button onClick={() => changerStatut(t, "accorde")} className="text-accent-pink hover:underline">
                      Marquer accordé
                    </button>
                  )}
                  <button onClick={() => supprimer(t)} className="text-white/40 hover:text-rose-300">Suppr.</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <TransfertModal
          dossier={dossier}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); refresh(); }}
        />
      )}
      {emailTransfert && (
        <EmailComposer
          dossier={dossier}
          defaultTo={dossier.assureur_email || ""}
          defaultSubject={`Demande de transfert de garantie — sinistre ${dossier.numero_sinistre || ""}${
            dossier.numero_police ? ` (police n° ${dossier.numero_police})` : ""
          }`}
          defaultBody={`Bonjour,\n\nDans le cadre du sinistre n° ${dossier.numero_sinistre || "—"} concernant le véhicule ${
            dossier.marque_modele || ""
          }${dossier.immatriculation ? ` (${dossier.immatriculation})` : ""} de votre assuré(e) ${
            dossier.client_nom || ""
          }, un véhicule de remplacement lui est prêté pendant la durée des réparations :\n\n- Véhicule prêté : ${
            emailTransfert.vehicule_modele || "—"
          }${emailTransfert.vehicule_immat ? ` (${emailTransfert.vehicule_immat})` : ""}\n- Période : du ${formatDate(
            emailTransfert.date_debut
          )} au ${formatDate(
            emailTransfert.date_fin
          )}\n\nNous vous remercions de bien vouloir procéder au TRANSFERT DES GARANTIES du contrat${
            dossier.numero_police ? ` n° ${dossier.numero_police}` : ""
          } sur ce véhicule de prêt pour la période indiquée, et de nous confirmer ce transfert par retour.\n\nRestant à votre disposition,\nCordialement.`}
          onClose={() => setEmailTransfert(null)}
          onSent={() => changerStatut(emailTransfert, "demande")}
        />
      )}
    </section>
  );
}

/* --------------------------- Modal véhicule de prêt --------------------------- */

function TransfertModal({
  dossier,
  onClose,
  onSaved,
}: {
  dossier: Dossier;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [flotte, setFlotte] = useState<FlotteVehicule[]>([]);
  const [vehiculeId, setVehiculeId] = useState("");
  const [immat, setImmat] = useState("");
  const [modele, setModele] = useState("");
  const [debut, setDebut] = useState(dossier.reparation_debut || new Date().toISOString().slice(0, 10));
  const [fin, setFin] = useState(dossier.reparation_fin || "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("flotte_vehicules")
      .select("*")
      .order("immatriculation")
      .then(({ data }) => setFlotte((data as FlotteVehicule[]) || []));
  }, []);

  function choisirVehicule(id: string) {
    setVehiculeId(id);
    const v = flotte.find((x) => x.id === id);
    if (v) {
      setImmat(v.immatriculation);
      setModele(v.marque_modele || "");
    }
  }

  async function save() {
    if (!immat.trim()) { setError("Choisis un véhicule de la flotte (ou saisis son immatriculation)."); return; }
    setSaving(true);
    setError(null);
    try {
      const { error: e1 } = await supabase.from("transferts_garantie").insert({
        dossier_id: dossier.id,
        vehicule_immat: immat.trim().toUpperCase(),
        vehicule_modele: modele || null,
        date_debut: debut || null,
        date_fin: fin || null,
        notes: notes || null,
      });
      if (e1) throw e1;
      // Marque le véhicule de flotte comme loué au client du dossier
      if (vehiculeId) {
        await supabase.from("flotte_vehicules").update({
          loue: true,
          locataire: dossier.client_nom || "Client (prêt sinistre)",
          locataire_tel: dossier.client_tel || null,
          location_debut: debut || null,
          location_fin: fin || null,
        }).eq("id", vehiculeId);
      }
      onSaved();
    } catch (err: unknown) {
      setError(messageErreur(err, "Enregistrement impossible (migration v21 exécutée ?)."));
    } finally {
      setSaving(false);
    }
  }

  const disponibles = flotte.filter((v) => !v.loue);

  return (
    <ModalShell title="Véhicule de prêt" onClose={onClose}>
      <div>
        <label className="field-label">Véhicule de la flotte (disponibles)</label>
        <select className="field-input" value={vehiculeId} onChange={(e) => choisirVehicule(e.target.value)}>
          <option value="">— Choisir dans la flotte —</option>
          {disponibles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.immatriculation} · {v.marque_modele || "—"}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-white/40">Le véhicule sera marqué « loué » dans la flotte.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Immatriculation</label>
          <input className="field-input" value={immat} onChange={(e) => setImmat(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Modèle</label>
          <input className="field-input" value={modele} onChange={(e) => setModele(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Début du prêt</label>
          <input type="date" className="field-input" value={debut} onChange={(e) => setDebut(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Fin prévue</label>
          <input type="date" className="field-input" value={fin} onChange={(e) => setFin(e.target.value)} />
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
