"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CessionCreance, Dossier, OrdreReparation, Restitution, Document, DocumentLigne } from "@/lib/types";
import { formatDate, formatEuros, messageErreur, STATUTS_ORDRE } from "@/lib/format";
import { genNumeroOR, badgeStatutAtelier, labelStatutAtelier } from "@/lib/atelier";
import {
  apercuCessionPdf,
  apercuOrdreReparationPdf,
  apercuRestitutionPdf,
  cessionPdfBase64,
  documentPdfBase64Auto,
  ordreReparationPdfBase64,
  ribPdfBase64,
} from "@/lib/pdf";
import EmailComposer, { PieceJointeOption } from "@/components/EmailComposer";
import SignaturePad from "@/components/SignaturePad";
import ModalShell from "@/components/ModalShell";

/**
 * Atelier : ordre de réparation signé + PV de restitution signé.
 * Complète le cycle du sinistre : autorisation avant travaux,
 * décharge à la remise du véhicule.
 */
export default function AtelierPanel({
  dossier,
  onChanged,
  integre = false, // true = rendu à l'intérieur du bloc « Documents du dossier »
  documents = [], // devis/factures du dossier (pour les pièces jointes d'email)
}: {
  dossier: Dossier;
  onChanged?: () => void;
  integre?: boolean;
  documents?: Document[];
}) {
  const derniereFacture = documents.find((d) => d.type === "facture") || null;
  const pjRib: PieceJointeOption = {
    label: "RIB du garage",
    filename: "RIB.pdf",
    getBase64: ribPdfBase64,
    coche: false,
  };
  const [ordres, setOrdres] = useState<OrdreReparation[]>([]);
  const [restitutions, setRestitutions] = useState<Restitution[]>([]);
  const [cessions, setCessions] = useState<CessionCreance[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<
    | { kind: "or"; or?: OrdreReparation }
    | { kind: "restitution"; rest?: Restitution }
    | { kind: "cession"; cession?: CessionCreance }
    | null
  >(null);
  const [emailCession, setEmailCession] = useState<CessionCreance | null>(null);
  const [emailOR, setEmailOR] = useState<OrdreReparation | null>(null);
  // envoi d'un lien de signature à distance (OR ou cession)
  const [emailSign, setEmailSign] = useState<{ titre: string; token: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [o, r, c] = await Promise.all([
      supabase.from("ordres_reparation").select("*").eq("dossier_id", dossier.id).order("created_at", { ascending: false }),
      supabase.from("restitutions").select("*").eq("dossier_id", dossier.id).order("created_at", { ascending: false }),
      supabase.from("cessions_creance").select("*").eq("dossier_id", dossier.id).order("created_at", { ascending: false }),
    ]);
    setOrdres((o.data as OrdreReparation[]) || []);
    setRestitutions((r.data as Restitution[]) || []);
    setCessions((c.data as CessionCreance[]) || []);
    setLoading(false);
  }, [dossier.id]);

  useEffect(() => { load(); }, [load]);

  function refresh() {
    load();
    onChanged?.();
  }

  async function supprimerOR(or: OrdreReparation) {
    if (!confirm("Supprimer cet ordre de réparation ?")) return;
    await supabase.from("ordres_reparation").delete().eq("id", or.id);
    refresh();
  }

  async function supprimerRest(rest: Restitution) {
    if (!confirm("Supprimer ce PV de restitution ?")) return;
    await supabase.from("restitutions").delete().eq("id", rest.id);
    refresh();
  }

  async function supprimerCession(c: CessionCreance) {
    if (!confirm("Supprimer cette cession de créance ?")) return;
    await supabase.from("cessions_creance").delete().eq("id", c.id);
    refresh();
  }

  return (
    <section className={integre ? "border-t-2 border-white/10" : "glass-card"}>
      <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        {integre ? (
          <div className="text-sm font-semibold text-white/70">Ordre de réparation · Cession de créance · Restitution</div>
        ) : (
          <h2 className="font-semibold text-white">Atelier — documents à signer</h2>
        )}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setModal({ kind: "or" })} className="btn-primary py-1.5 px-3 text-xs">
            + Ordre de réparation
          </button>
          <button
            onClick={() => setModal({ kind: "cession" })}
            className={`${dossier.mode_cession && cessions.length === 0 ? "btn-primary" : "btn-ghost"} py-1.5 px-3 text-xs`}
            title={dossier.mode_cession && cessions.length === 0 ? "Mode cession activé : fais signer la cession" : undefined}
          >
            + Cession de créance
          </button>
          <button onClick={() => setModal({ kind: "restitution" })} className="btn-ghost py-1.5 px-3 text-xs">
            + Restitution
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {loading && <p className="text-sm text-white/40">Chargement…</p>}

        {!loading && ordres.length === 0 && restitutions.length === 0 && cessions.length === 0 && (
          <p className="text-sm text-white/40">
            Fais signer l&apos;ordre de réparation avant les travaux, la cession de créance pour être
            payé directement par l&apos;assurance, puis le PV de restitution à la remise du véhicule —
            directement sur l&apos;écran (doigt ou souris).
          </p>
        )}

        {ordres.map((or) => (
          <div key={or.id} className="glass-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{or.numero || "Ordre de réparation"}</span>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeStatutAtelier(or.statut)}`}>
                    {labelStatutAtelier(or.statut)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/50">
                  Émis le {formatDate(or.date_or)}
                  {or.signe_le ? ` · signé le ${formatDate(or.signe_le)} par ${or.signataire_nom || "le client"}` : " · en attente de signature"}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-sm">
                <button onClick={() => apercuOrdreReparationPdf(or, dossier)} className="text-accent-teal hover:underline">PDF</button>
                <button onClick={() => setEmailOR(or)} className="text-accent-teal hover:underline">Envoyer</button>
                {or.statut !== "signe" && (
                  <>
                    <button onClick={() => setModal({ kind: "or", or })} className="text-accent-pink hover:underline">
                      Modifier / Signer
                    </button>
                    {or.sign_token && (
                      <button
                        onClick={() => setEmailSign({ titre: `l'ordre de réparation ${or.numero || ""}`, token: or.sign_token! })}
                        className="text-accent-teal hover:underline"
                      >
                        Faire signer à distance
                      </button>
                    )}
                  </>
                )}
                <button onClick={() => supprimerOR(or)} className="text-white/40 hover:text-rose-300">Suppr.</button>
              </div>
            </div>
          </div>
        ))}

        {cessions.map((c) => (
          <div key={c.id} className="glass-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">Cession de créance</span>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeStatutAtelier(c.statut)}`}>
                    {labelStatutAtelier(c.statut)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/50">
                  Le {formatDate(c.date_cession)}
                  {c.montant != null ? ` · ${formatEuros(c.montant)} TTC` : ""}
                  {c.signe_le ? ` · signée par ${c.signataire_nom || "le client"}` : " · en attente de signature"}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-sm">
                <button onClick={() => apercuCessionPdf(c, dossier)} className="text-accent-teal hover:underline">PDF</button>
                <button onClick={() => setEmailCession(c)} className="text-accent-teal hover:underline">Envoyer</button>
                {c.statut !== "signe" && (
                  <>
                    <button onClick={() => setModal({ kind: "cession", cession: c })} className="text-accent-pink hover:underline">
                      Modifier / Signer
                    </button>
                    {c.sign_token && (
                      <button
                        onClick={() => setEmailSign({ titre: "la cession de créance", token: c.sign_token! })}
                        className="text-accent-teal hover:underline"
                      >
                        Faire signer à distance
                      </button>
                    )}
                  </>
                )}
                <button onClick={() => supprimerCession(c)} className="text-white/40 hover:text-rose-300">Suppr.</button>
              </div>
            </div>
          </div>
        ))}

        {restitutions.map((rest) => (
          <div key={rest.id} className="glass-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">Restitution du véhicule</span>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeStatutAtelier(rest.statut)}`}>
                    {labelStatutAtelier(rest.statut)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/50">
                  Le {formatDate(rest.date_restitution)}
                  {rest.kilometrage != null ? ` · ${Number(rest.kilometrage).toLocaleString("fr-FR")} km` : ""}
                  {rest.signe_le ? ` · signé par ${rest.signataire_nom || "le client"}` : " · en attente de signature"}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-sm">
                <button onClick={() => apercuRestitutionPdf(rest, dossier)} className="text-accent-teal hover:underline">PDF</button>
                {rest.statut !== "signe" && (
                  <button onClick={() => setModal({ kind: "restitution", rest })} className="text-accent-pink hover:underline">
                    Modifier / Signer
                  </button>
                )}
                <button onClick={() => supprimerRest(rest)} className="text-white/40 hover:text-rose-300">Suppr.</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modal?.kind === "or" && (
        <ORModal
          dossier={dossier}
          or={modal.or}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); }}
        />
      )}
      {modal?.kind === "restitution" && (
        <RestitutionModal
          dossier={dossier}
          rest={modal.rest}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); }}
        />
      )}
      {modal?.kind === "cession" && (
        <CessionModal
          dossier={dossier}
          cession={modal.cession}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); }}
        />
      )}
      {emailCession && (
        <EmailComposer
          dossier={dossier}
          piecesJointes={[
            {
              label: "Cession de créance (PDF)",
              filename: `cession-creance-${dossier.numero_sinistre || "dossier"}.pdf`,
              getBase64: () => cessionPdfBase64(emailCession, dossier),
            },
            ...(derniereFacture
              ? [{
                  label: `Facture ${derniereFacture.numero || ""} (PDF)`,
                  filename: `${derniereFacture.numero || "facture"}.pdf`,
                  getBase64: () => documentPdfBase64Auto(derniereFacture, dossier),
                }]
              : []),
            pjRib,
          ]}
          defaultTo={dossier.assureur_email || ""}
          defaultSubject={`Notification de cession de créance — sinistre ${dossier.numero_sinistre || ""}${
            dossier.immatriculation ? ` (${dossier.immatriculation})` : ""
          }`}
          defaultBody={`Bonjour,\n\nNous vous notifions, conformément aux articles 1321 et suivants du Code civil, la cession de créance consentie par ${
            dossier.client_nom || "notre client"
          } à notre profit au titre du sinistre n° ${dossier.numero_sinistre || "—"}${
            dossier.numero_police ? ` (police n° ${dossier.numero_police})` : ""
          }.\n\nVous trouverez ci-joint l'acte de cession signé. En conséquence, nous vous remercions de bien vouloir procéder au règlement de l'indemnité directement entre nos mains.\n\nRestant à votre disposition,\nCordialement.`}
          onClose={() => setEmailCession(null)}
        />
      )}
      {emailOR && (
        <EmailComposer
          dossier={dossier}
          piecesJointes={[
            {
              label: `Ordre de réparation ${emailOR.numero || ""} (PDF)`,
              filename: `${emailOR.numero || "ordre-reparation"}.pdf`,
              getBase64: () => ordreReparationPdfBase64(emailOR, dossier),
            },
            pjRib,
          ]}
          defaultTo={[dossier.expert_email || dossier.cabinet_email, dossier.client_email]
            .filter(Boolean)
            .join(", ")}
          defaultSubject={`Ordre de réparation ${emailOR.numero || ""} — ${dossier.marque_modele || ""}${
            dossier.immatriculation ? ` (${dossier.immatriculation})` : ""
          }`}
          defaultBody={`Bonjour,\n\nVeuillez trouver ci-joint l'ordre de réparation ${
            emailOR.numero || ""
          } concernant le dossier ${dossier.numero_sinistre || "—"}${
            dossier.client_nom ? ` (${dossier.client_nom})` : ""
          }, établi conformément au chiffrage du rapport d'expertise.\n\nRestant à votre disposition,\nCordialement.`}
          onClose={() => setEmailOR(null)}
          onSent={() => refresh()}
        />
      )}
      {emailSign && (
        <EmailComposer
          dossier={dossier}
          defaultTo={dossier.client_email || ""}
          defaultSubject={`Signature requise — ${dossier.marque_modele || "votre véhicule"}${
            dossier.immatriculation ? ` (${dossier.immatriculation})` : ""
          }`}
          defaultBody={`Bonjour${dossier.client_nom ? ` ${dossier.client_nom}` : ""},\n\nMerci de signer ${
            emailSign.titre
          } concernant votre dossier${dossier.numero_sinistre ? ` n° ${dossier.numero_sinistre}` : ""} en cliquant sur ce lien sécurisé :\n\n${
            typeof window !== "undefined" ? window.location.origin : ""
          }/signer/${emailSign.token}\n\nLa signature se fait en 30 secondes, directement depuis votre téléphone.\n\nCordialement.`}
          onClose={() => setEmailSign(null)}
          onSent={() => refresh()}
        />
      )}
    </section>
  );
}

/* --------------------- Avancement automatique du dossier --------------------- */

// Fait avancer le statut du dossier vers `cible` si le dossier est en amont.
async function avancerStatut(dossier: Dossier, cible: string, extra?: Record<string, unknown>) {
  const posActuel = STATUTS_ORDRE.indexOf(dossier.statut as (typeof STATUTS_ORDRE)[number]);
  const posCible = STATUTS_ORDRE.indexOf(cible as (typeof STATUTS_ORDRE)[number]);
  const updates: Record<string, unknown> = { ...(extra || {}) };
  if (posActuel !== -1 && posCible !== -1 && posActuel < posCible) updates.statut = cible;
  if (Object.keys(updates).length) {
    await supabase.from("dossiers").update(updates).eq("id", dossier.id);
  }
}

/* ----------------------------- Modal OR ----------------------------- */

function ORModal({
  dossier,
  or,
  onClose,
  onSaved,
}: {
  dossier: Dossier;
  or?: OrdreReparation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [numero] = useState(or?.numero || genNumeroOR());
  const [dateOr, setDateOr] = useState(or?.date_or || new Date().toISOString().slice(0, 10));
  const [travaux, setTravaux] = useState(or?.travaux || "");
  const [debut, setDebut] = useState(or?.date_debut || dossier.reparation_debut || "");
  const [fin, setFin] = useState(or?.date_fin || dossier.reparation_fin || "");
  const [montant, setMontant] = useState(or?.montant_ht != null ? String(or.montant_ht) : "");
  const [signataire, setSignataire] = useState(or?.signataire_nom || dossier.client_nom || "");
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pré-remplit les travaux depuis le dernier devis (une ligne par poste).
  useEffect(() => {
    if (or?.travaux || travaux) return;
    (async () => {
      const { data: devis } = await supabase
        .from("documents").select("id,total_ht").eq("dossier_id", dossier.id).eq("type", "devis")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!devis) return;
      const { data: lignes } = await supabase
        .from("document_lignes").select("*").eq("document_id", devis.id).order("ordre", { ascending: true });
      // MONTANTS EXACTS du chiffrage repris ligne à ligne (vide si pas de montant)
      const txt = ((lignes as DocumentLigne[]) || [])
        .map((l) => {
          const total = (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0);
          const qte = Number(l.quantite) || 1;
          return `- ${l.designation}${qte !== 1 ? ` (x${qte})` : ""}${total > 0 ? ` — ${total.toFixed(2)} € HT` : ""}`;
        })
        .join("\n");
      if (txt) setTravaux("Conforme au chiffrage du rapport d'expertise :\n" + txt);
      if (devis.total_ht != null && !montant) setMontant(String(devis.total_ht));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const signe = !!signature;
      const payload = {
        dossier_id: dossier.id,
        numero,
        date_or: dateOr || null,
        travaux: travaux || null,
        date_debut: debut || null,
        date_fin: fin || null,
        montant_ht: montant === "" ? null : Number(montant),
        signataire_nom: signataire || null,
        ...(signe
          ? { signature, signe_le: new Date().toISOString(), statut: "signe" }
          : {}),
      };
      const { error: e1 } = or
        ? await supabase.from("ordres_reparation").update(payload).eq("id", or.id)
        : await supabase.from("ordres_reparation").insert(payload);
      if (e1) throw e1;

      if (signe) {
        await avancerStatut(dossier, "reparation");
        await supabase.from("evenements").insert({
          dossier_id: dossier.id,
          titre: "Ordre de réparation signé",
          description: `${numero} signé par ${signataire || "le client"}`,
          date_evenement: new Date().toISOString(),
          categorie: "autre",
        });
      }
      onSaved();
    } catch (err: unknown) {
      setError(messageErreur(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Ordre de réparation — ${numero}`} onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Date</label>
          <input type="date" className="field-input" value={dateOr} onChange={(e) => setDateOr(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Montant estimé HT (€)</label>
          <input type="number" className="field-input" value={montant} onChange={(e) => setMontant(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Début prévu</label>
          <input type="date" className="field-input" value={debut} onChange={(e) => setDebut(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Fin prévue</label>
          <input type="date" className="field-input" value={fin} onChange={(e) => setFin(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="field-label">Travaux à réaliser</label>
        <textarea
          className="field-input" rows={5} value={travaux}
          onChange={(e) => setTravaux(e.target.value)}
          placeholder="- Remplacement pare-chocs avant&#10;- Peinture aile droite…"
        />
        <p className="mt-1 text-xs text-white/40">Pré-rempli depuis le dernier devis du dossier.</p>
      </div>
      <div>
        <label className="field-label">Nom du signataire</label>
        <input className="field-input" value={signataire} onChange={(e) => setSignataire(e.target.value)} />
      </div>
      <div>
        <label className="field-label">Signature du client (autorisation de réparer)</label>
        <SignaturePad onChange={setSignature} />
      </div>
      {error && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Enregistrement…" : signature ? "Enregistrer signé ✓" : "Enregistrer (sans signature)"}
        </button>
      </div>
    </ModalShell>
  );
}

/* ------------------------- Modal Restitution ------------------------- */

function RestitutionModal({
  dossier,
  rest,
  onClose,
  onSaved,
}: {
  dossier: Dossier;
  rest?: Restitution;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(rest?.date_restitution || new Date().toISOString().slice(0, 10));
  const [km, setKm] = useState(rest?.kilometrage != null ? String(rest.kilometrage) : "");
  const [obs, setObs] = useState(rest?.observations || "");
  const [signataire, setSignataire] = useState(rest?.signataire_nom || dossier.client_nom || "");
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const signe = !!signature;
      const payload = {
        dossier_id: dossier.id,
        date_restitution: date || null,
        kilometrage: km === "" ? null : Math.round(Number(km)),
        observations: obs || null,
        signataire_nom: signataire || null,
        ...(signe
          ? { signature, signe_le: new Date().toISOString(), statut: "signe" }
          : {}),
      };
      const { error: e1 } = rest
        ? await supabase.from("restitutions").update(payload).eq("id", rest.id)
        : await supabase.from("restitutions").insert(payload);
      if (e1) throw e1;

      if (signe) {
        // Véhicule rendu : avance le statut + le véhicule quitte le garage.
        await avancerStatut(dossier, "rendu", { au_garage: false });
        await supabase.from("evenements").insert({
          dossier_id: dossier.id,
          titre: "Véhicule restitué",
          description: `PV de restitution signé par ${signataire || "le client"}`,
          date_evenement: new Date().toISOString(),
          categorie: "autre",
        });
      }
      onSaved();
    } catch (err: unknown) {
      setError(messageErreur(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="PV de restitution du véhicule" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Date de restitution</label>
          <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Kilométrage</label>
          <input type="number" className="field-input" value={km} onChange={(e) => setKm(e.target.value)} placeholder="km au compteur" />
        </div>
      </div>
      <div>
        <label className="field-label">Observations (optionnel)</label>
        <textarea className="field-input" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Réserves éventuelles, état du véhicule…" />
      </div>
      <div>
        <label className="field-label">Nom du signataire</label>
        <input className="field-input" value={signataire} onChange={(e) => setSignataire(e.target.value)} />
      </div>
      <div>
        <label className="field-label">Signature du client (décharge)</label>
        <SignaturePad onChange={setSignature} />
      </div>
      <p className="text-xs text-white/40">
        À la signature : le dossier passe en « Véhicule rendu » et le véhicule est marqué sorti du garage.
      </p>
      {error && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Enregistrement…" : signature ? "Enregistrer signé ✓" : "Enregistrer (sans signature)"}
        </button>
      </div>
    </ModalShell>
  );
}

/* -------------------------- Modal Cession de créance -------------------------- */

function CessionModal({
  dossier,
  cession,
  onClose,
  onSaved,
}: {
  dossier: Dossier;
  cession?: CessionCreance;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(cession?.date_cession || new Date().toISOString().slice(0, 10));
  const [montant, setMontant] = useState(cession?.montant != null ? String(cession.montant) : "");
  const [signataire, setSignataire] = useState(cession?.signataire_nom || dossier.client_nom || "");
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pré-remplit le montant : dernière facture, sinon dernier devis (TTC).
  useEffect(() => {
    if (cession?.montant != null || montant !== "") return;
    (async () => {
      const { data } = await supabase
        .from("documents")
        .select("type,total_ttc,created_at")
        .eq("dossier_id", dossier.id)
        .order("created_at", { ascending: false });
      const docs = (data as Pick<Document, "type" | "total_ttc" | "created_at">[]) || [];
      const doc = docs.find((d) => d.type === "facture") || docs.find((d) => d.type === "devis");
      if (doc?.total_ttc != null) setMontant(String(doc.total_ttc));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const signe = !!signature;
      const payload = {
        dossier_id: dossier.id,
        date_cession: date || null,
        montant: montant === "" ? null : Number(montant),
        signataire_nom: signataire || null,
        ...(signe
          ? { signature, signe_le: new Date().toISOString(), statut: "signe" }
          : {}),
      };
      const { error: e1 } = cession
        ? await supabase.from("cessions_creance").update(payload).eq("id", cession.id)
        : await supabase.from("cessions_creance").insert(payload);
      if (e1) throw e1;

      if (signe) {
        await supabase.from("evenements").insert({
          dossier_id: dossier.id,
          titre: "Cession de créance signée",
          description: `Signée par ${signataire || "le client"}${montant ? ` — ${Number(montant).toFixed(2)} € TTC` : ""}`,
          date_evenement: new Date().toISOString(),
          categorie: "autre",
        });
      }
      onSaved();
    } catch (err: unknown) {
      setError(messageErreur(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Cession de créance" onClose={onClose}>
      <p className="text-sm text-white/60">
        Le client (cédant) cède au garage sa créance d&apos;indemnisation sur{" "}
        <span className="text-white/90">{dossier.assureur || "l'assureur"}</span> : le garage est payé
        directement par l&apos;assurance. Pense à notifier l&apos;assureur (envoi du PDF) pour la rendre opposable.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Date</label>
          <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Montant cédé (€ TTC)</label>
          <input type="number" className="field-input" value={montant} onChange={(e) => setMontant(e.target.value)} />
          <p className="mt-1 text-xs text-white/40">Pré-rempli depuis la facture (sinon le devis).</p>
        </div>
      </div>
      <div>
        <label className="field-label">Nom du signataire (cédant)</label>
        <input className="field-input" value={signataire} onChange={(e) => setSignataire(e.target.value)} />
      </div>
      <div>
        <label className="field-label">Signature du client</label>
        <SignaturePad onChange={setSignature} />
      </div>
      {error && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Enregistrement…" : signature ? "Enregistrer signée ✓" : "Enregistrer (sans signature)"}
        </button>
      </div>
    </ModalShell>
  );
}
