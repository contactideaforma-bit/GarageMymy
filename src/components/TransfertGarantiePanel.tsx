"use client";

import { usePliage } from "@/lib/pliage";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, Entreprise, FlotteVehicule, TransfertGarantie } from "@/lib/types";
import { formatDate, formatEuros, messageErreur, ymd } from "@/lib/format";
import ModalShell from "@/components/ModalShell";
import EmailComposer from "@/components/EmailComposer";
import { PRISES_EN_CHARGE, clausesParDefaut, coutPretHt, defautsContrat, joursPret } from "@/lib/pret";
import { apercuContratPretPdf, contratPretPdfBase64, generateContratPretPdf } from "@/lib/pdf";

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
  // CONTRAT DE PRÊT (v54) : modale d'édition + envoi du PDF au client
  const [contrat, setContrat] = useState<TransfertGarantie | null>(null);
  const [emailContrat, setEmailContrat] = useState<{ t: TransfertGarantie; pdf: string } | null>(null);
  const [entreprise, setEntreprise] = useState<Partial<Entreprise> | null>(null);
  useEffect(() => {
    supabase.from("entreprise").select("*").limit(1).maybeSingle().then(({ data }) => setEntreprise((data as Entreprise) || null));
  }, []);

  async function envoyerContrat(t: TransfertGarantie) {
    try {
      const pdf = await contratPretPdfBase64(t, dossier);
      setEmailContrat({ t, pdf });
    } catch (err) {
      alert(messageErreur(err, "Impossible de générer le contrat."));
    }
  }

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
    if (statut === "demande" && !t.date_demande) maj.date_demande = ymd();
    if (statut === "accorde" && !t.date_accord) maj.date_accord = ymd();
    const { error } = await supabase.from("transferts_garantie").update(maj).eq("id", t.id);
    if (error) return alert(messageErreur(error, "Changement de statut impossible."));
    refresh();
  }

  async function supprimer(t: TransfertGarantie) {
    if (!confirm("Supprimer ce transfert de garantie ?")) return;
    const { error } = await supabase.from("transferts_garantie").delete().eq("id", t.id);
    if (error) return alert(messageErreur(error, "Suppression impossible."));
    // Le véhicule de prêt redevient disponible (il était marqué loué à la
    // création du transfert et ne l'était jamais redevenu → il disparaissait
    // définitivement de la liste des véhicules disponibles).
    if (t.vehicule_immat) {
      await supabase
        .from("flotte_vehicules")
        .update({ loue: false, locataire: null, locataire_tel: null })
        .ilike("immatriculation", t.vehicule_immat.trim());
    }
    refresh();
  }

  const { plie, basculerPliage } = usePliage("dossier.pret", true);

  return (
    <section className="glass-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 sm:px-4 sm:py-2.5">
        <button
          onClick={basculerPliage}
          className="flex min-w-0 items-center gap-2 text-left"
          aria-expanded={!plie}
          title={plie ? "Déplier" : "Replier"}
        >
          <span className={`shrink-0 text-white/40 transition-transform ${plie ? "" : "rotate-90"}`} aria-hidden>
            ▸
          </span>
          <h2 className="titre-bloc truncate">Véhicule de prêt — transfert de garantie</h2>
        </button>
        {!plie && (
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
<button onClick={() => setModalOpen(true)} className="btn-ghost py-1.5 px-3 text-xs">
          + Véhicule de prêt
        </button>
          </div>
        )}
      </div>

      {!plie && (
        <>

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
                    {Number(t.tarif_jour) > 0
                      ? ` · ${formatEuros(Number(t.tarif_jour))} HT/j (${formatEuros(coutPretHt(t))} HT estimés, ${
                          t.prise_en_charge === "client" ? "à la charge du client" : "pris en charge par l'assurance"
                        })`
                      : t.clauses
                        ? " · prêt gratuit"
                        : ""}
                    {t.signe_le ? ` · contrat signé le ${formatDate(t.signe_le)}` : t.clauses ? " · contrat prêt" : ""}
                    {t.date_demande ? ` · demandé le ${formatDate(t.date_demande)}` : ""}
                    {t.date_accord ? ` · accordé le ${formatDate(t.date_accord)}` : ""}
                    {t.notes ? ` — ${t.notes}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-sm">
                  <button onClick={() => setContrat(t)} className="text-accent-pink hover:underline" title="Contrat de mise à disposition (tarifs et clauses modifiables)">
                    {t.clauses ? "Contrat de prêt" : "Établir le contrat"}
                  </button>
                  {t.clauses && (
                    <>
                      <button onClick={() => apercuContratPretPdf(t, dossier)} className="text-accent-teal hover:underline">PDF</button>
                      <button onClick={() => envoyerContrat(t)} className="text-accent-teal hover:underline">Envoyer</button>
                    </>
                  )}
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
      {contrat && (
        <ContratPretModal
          transfert={contrat}
          dossier={dossier}
          entreprise={entreprise}
          onClose={() => setContrat(null)}
          onSaved={() => { setContrat(null); refresh(); }}
        />
      )}
      {emailContrat && (
        <EmailComposer
          dossier={dossier}
          defaultTo={dossier.client_email || ""}
          defaultSubject={`Contrat de véhicule de prêt — ${emailContrat.t.vehicule_modele || ""} ${emailContrat.t.vehicule_immat || ""}`}
          defaultBody={`Bonjour,\n\nVeuillez trouver ci-joint le contrat de mise à disposition du véhicule de prêt ${
            emailContrat.t.vehicule_modele || ""
          }${emailContrat.t.vehicule_immat ? ` (${emailContrat.t.vehicule_immat})` : ""} pour la période du ${formatDate(
            emailContrat.t.date_debut
          )} au ${formatDate(emailContrat.t.date_fin)}, pendant la réparation de votre véhicule.\n\nMerci de nous le retourner signé, précédé de la mention « lu et approuvé ».\n\nCordialement.`}
          piecesJointes={[
            {
              label: "Contrat de prêt (PDF)",
              filename: `contrat-pret-${emailContrat.t.vehicule_immat || "vehicule"}.pdf`,
              getBase64: async () => emailContrat.pdf,
              coche: true,
            },
          ]}
          onClose={() => setEmailContrat(null)}
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
        </>
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
  const [debut, setDebut] = useState(dossier.reparation_debut || ymd());
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
      // Tarifs par défaut du profil (v54) : posés à la création, modifiables
      // ensuite dans le contrat. Colonnes absentes (migration v54 non
      // passée) → on retente sans elles.
      const { data: entData } = await supabase.from("entreprise").select("*").limit(1).maybeSingle();
      const ent = (entData as Entreprise | null) || null;
      const base = {
        dossier_id: dossier.id,
        vehicule_immat: immat.trim().toUpperCase(),
        vehicule_modele: modele || null,
        date_debut: debut || null,
        date_fin: fin || null,
        notes: notes || null,
      };
      const d = defautsContrat(ent, dossier);
      let { error: e1 } = await supabase.from("transferts_garantie").insert({
        ...base,
        tarif_jour: d.tarif_jour,
        tarif_horaire: d.tarif_horaire,
        franchise: d.franchise,
        km_jour: d.km_jour,
        prix_km: d.prix_km,
        conducteur_nom: d.conducteur_nom || null,
        prise_en_charge: d.prise_en_charge,
      });
      if (e1 && /column|colonne/i.test(e1.message || "")) {
        ({ error: e1 } = await supabase.from("transferts_garantie").insert(base));
      }
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

/* ------------------------------ Contrat de prêt (v54) ------------------------------ */

function ContratPretModal({
  transfert,
  dossier,
  entreprise,
  onClose,
  onSaved,
}: {
  transfert: TransfertGarantie;
  dossier: Dossier;
  entreprise: Partial<Entreprise> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const d = defautsContrat(entreprise, dossier);
  const [f, setF] = useState({
    date_debut: transfert.date_debut || ymd(),
    date_fin: transfert.date_fin || "",
    tarif_jour: String(transfert.tarif_jour ?? d.tarif_jour ?? ""),
    tarif_horaire: String(transfert.tarif_horaire ?? d.tarif_horaire ?? ""),
    franchise: String(transfert.franchise ?? d.franchise ?? ""),
    km_jour: String(transfert.km_jour ?? d.km_jour ?? ""),
    prix_km: String(transfert.prix_km ?? d.prix_km ?? ""),
    km_depart: String(transfert.km_depart ?? ""),
    carburant: transfert.carburant || "",
    conducteur_nom: transfert.conducteur_nom || d.conducteur_nom || "",
    conducteur_naissance: transfert.conducteur_naissance || "",
    permis_numero: transfert.permis_numero || "",
    permis_date: transfert.permis_date || "",
    prise_en_charge: transfert.prise_en_charge || "assurance",
    observations: transfert.observations || "",
    signataire_nom: transfert.signataire_nom || "",
  });
  const [clauses, setClauses] = useState(transfert.clauses || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const num = (v: string): number | null => (v.trim() === "" ? null : Number(String(v).replace(",", ".")) || 0);

  function valeurs(): TransfertGarantie {
    return {
      ...transfert,
      date_debut: f.date_debut || null,
      date_fin: f.date_fin || null,
      tarif_jour: num(f.tarif_jour),
      tarif_horaire: num(f.tarif_horaire),
      franchise: num(f.franchise),
      km_jour: num(f.km_jour),
      prix_km: num(f.prix_km),
      km_depart: num(f.km_depart),
      carburant: f.carburant || null,
      conducteur_nom: f.conducteur_nom || null,
      conducteur_naissance: f.conducteur_naissance || null,
      permis_numero: f.permis_numero || null,
      permis_date: f.permis_date || null,
      prise_en_charge: f.prise_en_charge,
      observations: f.observations || null,
      signataire_nom: f.signataire_nom || null,
      clauses: clauses.trim() || null,
    };
  }

  // Le texte des clauses dépend des tarifs : on le (re)génère à la demande,
  // jamais par-dessus une modification du garage sans le lui dire.
  function regenererClauses() {
    if (clauses.trim() && !confirm("Remplacer le texte du contrat par le texte par défaut (calculé avec les tarifs ci-dessus) ?")) return;
    setClauses(clausesParDefaut({ ...valeurs(), clauses: null }, dossier, entreprise));
  }
  useEffect(() => {
    if (!clauses.trim()) setClauses(clausesParDefaut(valeurs(), dossier, entreprise));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enregistrer(puis?: "pdf" | "telecharger") {
    setSaving(true);
    setError(null);
    const v = valeurs();
    const { id, created_at, dossier_id, ...patch } = v;
    void id; void created_at; void dossier_id;
    const { error: e } = await supabase.from("transferts_garantie").update(patch).eq("id", transfert.id);
    setSaving(false);
    if (e) {
      setError(messageErreur(e, "Enregistrement impossible (migration v54 exécutée ?)."));
      return;
    }
    if (puis === "pdf") await apercuContratPretPdf(v, dossier);
    if (puis === "telecharger") await generateContratPretPdf(v, dossier);
    onSaved();
  }

  const jours = joursPret(f.date_debut, f.date_fin);
  const estimation = coutPretHt(valeurs());

  return (
    <ModalShell title="Contrat de véhicule de prêt" onClose={onClose} maxWidth="max-w-3xl">
      <p className="text-xs text-white/50">
        {transfert.vehicule_modele || "Véhicule"} {transfert.vehicule_immat ? `(${transfert.vehicule_immat})` : ""} prêté à{" "}
        {dossier.client_nom || "—"}. Les tarifs par défaut viennent de <b>Profil du garage</b> et sont modifiables ici,
        contrat par contrat.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><label className="field-label">Début</label><input type="date" className="field-input" value={f.date_debut} onChange={(e) => set("date_debut", e.target.value)} /></div>
        <div><label className="field-label">Fin prévue</label><input type="date" className="field-input" value={f.date_fin} onChange={(e) => set("date_fin", e.target.value)} /></div>
        <div><label className="field-label">Tarif € HT / jour</label><input inputMode="decimal" className="field-input" value={f.tarif_jour} onChange={(e) => set("tarif_jour", e.target.value)} placeholder="0 = gratuit" /></div>
        <div><label className="field-label">Tarif € HT / heure</label><input inputMode="decimal" className="field-input" value={f.tarif_horaire} onChange={(e) => set("tarif_horaire", e.target.value)} placeholder="optionnel" /></div>
        <div><label className="field-label">Franchise €</label><input inputMode="decimal" className="field-input" value={f.franchise} onChange={(e) => set("franchise", e.target.value)} /></div>
        <div><label className="field-label">Km inclus / jour</label><input inputMode="numeric" className="field-input" value={f.km_jour} onChange={(e) => set("km_jour", e.target.value)} placeholder="vide = libre" /></div>
        <div><label className="field-label">€ HT / km au-delà</label><input inputMode="decimal" className="field-input" value={f.prix_km} onChange={(e) => set("prix_km", e.target.value)} /></div>
        <div>
          <label className="field-label">Frais pris en charge par</label>
          <select className="field-input" value={f.prise_en_charge} onChange={(e) => set("prise_en_charge", e.target.value)}>
            {Object.entries(PRISES_EN_CHARGE).map(([k, l]) => <option key={k} value={k}>{k === "assurance" ? "L'assurance du client" : "Le client"}</option>)}
          </select>
          <span className="sr-only">{Object.values(PRISES_EN_CHARGE).join(" ")}</span>
        </div>
      </div>
      <div className="glass-soft px-3 py-2 text-xs text-white/70">
        {jours ? `${jours} jour(s)` : "Durée non renseignée"}
        {Number(f.tarif_jour) > 0 ? ` · estimation ${formatEuros(estimation)} HT` : " · mise à disposition gratuite"}
        {f.prise_en_charge === "assurance" && Number(f.tarif_jour) > 0 ? ` · facturée à ${dossier.assureur || "l'assureur"}` : ""}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2"><label className="field-label">Conducteur</label><input className="field-input" value={f.conducteur_nom} onChange={(e) => set("conducteur_nom", e.target.value)} /></div>
        <div><label className="field-label">Né(e) le</label><input type="date" className="field-input" value={f.conducteur_naissance} onChange={(e) => set("conducteur_naissance", e.target.value)} /></div>
        <div><label className="field-label">Permis délivré le</label><input type="date" className="field-input" value={f.permis_date} onChange={(e) => set("permis_date", e.target.value)} /></div>
        <div className="col-span-2"><label className="field-label">N° de permis</label><input className="field-input" value={f.permis_numero} onChange={(e) => set("permis_numero", e.target.value)} /></div>
        <div><label className="field-label">Km au départ</label><input inputMode="numeric" className="field-input" value={f.km_depart} onChange={(e) => set("km_depart", e.target.value)} /></div>
        <div><label className="field-label">Carburant au départ</label><input className="field-input" value={f.carburant} onChange={(e) => set("carburant", e.target.value)} placeholder="ex. 3/4" /></div>
      </div>
      <div>
        <label className="field-label">État du véhicule au départ (rayures, équipements…)</label>
        <textarea className="field-input" rows={2} value={f.observations} onChange={(e) => set("observations", e.target.value)} />
      </div>
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <label className="field-label mb-0">Texte du contrat (modifiable — un article par paragraphe)</label>
          <button onClick={regenererClauses} className="text-xs text-accent-teal hover:underline">↺ Texte par défaut avec ces tarifs</button>
        </div>
        <textarea className="field-input font-mono text-xs" rows={14} value={clauses} onChange={(e) => setClauses(e.target.value)} />
      </div>
      <div><label className="field-label">Nom du signataire (emprunteur)</label><input className="field-input" value={f.signataire_nom} onChange={(e) => set("signataire_nom", e.target.value)} placeholder={dossier.client_nom || ""} /></div>
      {error && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</div>}
      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={() => enregistrer("pdf")} disabled={saving} className="btn-ghost">Enregistrer + aperçu PDF</button>
        <button onClick={() => enregistrer("telecharger")} disabled={saving} className="btn-ghost">Enregistrer + télécharger</button>
        <button onClick={() => enregistrer()} disabled={saving} className="btn-primary">{saving ? "…" : "Enregistrer"}</button>
      </div>
    </ModalShell>
  );
}
