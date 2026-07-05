"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Document, Dossier } from "@/lib/types";
import { messageErreur } from "@/lib/format";
import ModalShell from "@/components/ModalShell";
import SignaturePad from "@/components/SignaturePad";

/**
 * Signature électronique d'un devis / d'une facture :
 * - à l'écran (le client est au garage) ;
 * - ou à distance : bouton qui prépare l'email avec le lien /signer/<jeton>.
 */
export default function SignatureDocModal({
  dossier,
  document,
  onClose,
  onSaved,
  onEnvoyerLien,
}: {
  dossier: Dossier;
  document: Document;
  onClose: () => void;
  onSaved: () => void;
  onEnvoyerLien: () => void;
}) {
  const [signataire, setSignataire] = useState(dossier.client_nom || "");
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = document.type === "devis" ? "devis" : "facture";

  async function save() {
    if (!signature) {
      setError("Fais signer dans le cadre, ou utilise l'envoi à distance.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: e1 } = await supabase
        .from("documents")
        .update({
          signataire_nom: signataire || null,
          signature,
          signe_le: new Date().toISOString(),
        })
        .eq("id", document.id);
      if (e1) throw e1;
      await supabase.from("evenements").insert({
        dossier_id: dossier.id,
        titre: `${document.type === "devis" ? "Devis" : "Facture"} ${document.numero || ""} signé${document.type === "devis" ? "" : "e"}`,
        description: `Signé à l'écran par ${signataire || "le client"}.`,
        date_evenement: new Date().toISOString(),
        categorie: "autre",
      });
      onSaved();
    } catch (err: unknown) {
      setError(messageErreur(err, "Enregistrement impossible (migration v20 exécutée ?)."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Signature — ${document.numero || label}`} onClose={onClose}>
      {document.signature ? (
        <p className="text-sm text-emerald-300">
          Ce document est déjà signé{document.signataire_nom ? ` par ${document.signataire_nom}` : ""}. La
          signature figure en bas du PDF.
        </p>
      ) : (
        <>
          <div>
            <label className="field-label">Nom du signataire</label>
            <input className="field-input" value={signataire} onChange={(e) => setSignataire(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Signature à l&apos;écran (client présent)</label>
            <SignaturePad onChange={setSignature} />
          </div>
          {error && (
            <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button onClick={onClose} className="btn-ghost">Annuler</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? "Enregistrement…" : "Enregistrer la signature"}
            </button>
          </div>

          <div className="border-t border-white/10 pt-3">
            <div className="text-sm font-semibold text-white">Client absent ?</div>
            <p className="mt-1 text-xs text-white/50">
              Envoie-lui un lien sécurisé : il signera depuis son téléphone, la signature
              s&apos;ajoutera automatiquement au document.
            </p>
            <button onClick={onEnvoyerLien} className="btn-ghost mt-2 py-1.5 px-3 text-xs">
              Envoyer le lien de signature par email
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}
