"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Document, DocumentLigne, Dossier, Entreprise } from "@/lib/types";
import { documentPdfBase64 } from "@/lib/pdf";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function EmailComposer({
  dossier,
  document,
  defaultTo = "",
  defaultSubject = "",
  defaultBody = "",
  onClose,
  onSent,
}: {
  dossier: Dossier;
  document?: Document | null;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [ent, setEnt] = useState<Partial<Entreprise> | null>(null);
  const [mailFrom, setMailFrom] = useState<string | null>(null);
  const [mailConfigured, setMailConfigured] = useState<boolean | null>(null);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [attachPdf, setAttachPdf] = useState(Boolean(document));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("entreprise")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setEnt((data as Entreprise) || {}));
    fetch("/api/mail-config")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) {
          setMailConfigured(Boolean(d.configured));
          setMailFrom(
            d.from_name && d.from_email ? `${d.from_name} <${d.from_email}>` : d.from_email || null
          );
        }
      })
      .catch(() => {});
  }, []);

  const fromLabel =
    mailFrom ||
    (ent?.nom && ent?.email ? `${ent.nom} <${ent.email}>` : ent?.email || "(à configurer)");

  async function envoyer() {
    setSending(true);
    setError(null);

    // Pièce jointe PDF (devis/facture) si demandé
    let attachments: { filename: string; content: string }[] | undefined;
    try {
      if (attachPdf && document) {
        const { data: lignes } = await supabase
          .from("document_lignes")
          .select("*")
          .eq("document_id", document.id)
          .order("ordre", { ascending: true });
        const b64 = await documentPdfBase64(document, (lignes as DocumentLigne[]) || [], dossier);
        const titre = document.type === "devis" ? "Devis" : "Facture";
        attachments = [{ filename: `${document.numero || titre}.pdf`, content: b64 }];
      }
    } catch {
      setError("Impossible de générer le PDF à joindre.");
      setSending(false);
      return;
    }

    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.5">${escapeHtml(
      body
    ).replace(/\n/g, "<br>")}</div>`;

    const payload = {
      to,
      from: ent?.nom && ent?.email ? `${ent.nom} <${ent.email}>` : ent?.email || undefined,
      replyTo: ent?.email || undefined,
      subject,
      html,
      text: body,
      attachments,
    };

    let ok = false;
    let errMsg: string | null = null;
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      ok = res.ok && data?.ok;
      if (!ok) errMsg = data?.error || `Erreur (HTTP ${res.status}).`;
    } catch (e: unknown) {
      errMsg = e instanceof Error ? e.message : "Échec réseau.";
    }

    // Journal des envois
    await supabase.from("emails").insert({
      dossier_id: dossier.id,
      destinataire: to,
      objet: subject,
      corps: body,
      statut: ok ? "envoye" : "echec",
      erreur: ok ? null : errMsg,
    });

    setSending(false);
    if (ok) {
      onSent?.();
      onClose();
    } else {
      setError(errMsg || "Échec de l'envoi.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto backdrop-blur-sm">
      <div className="w-full max-w-lg glass-card my-8 modal-panel">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Envoyer un email</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="text-xs text-white/40">
            Expéditeur : <span className="text-white/70">{fromLabel}</span>
          </div>
          {mailConfigured === false && (
            <div className="rounded-lg bg-amber-500/15 border border-amber-400/30 px-3 py-2 text-sm text-amber-200">
              Aucune boîte mail configurée. Va dans Profil du garage → Envoi des emails pour la connecter.
            </div>
          )}
          <div>
            <label className="field-label">Destinataire</label>
            <input
              type="email"
              className="field-input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="client@email.fr"
            />
          </div>
          <div>
            <label className="field-label">Objet</label>
            <input className="field-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Message</label>
            <textarea
              className="field-input"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {document && (
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} />
              Joindre le PDF ({document.type === "devis" ? "devis" : "facture"} {document.numero || ""})
            </label>
          )}

          {error && (
            <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="btn-ghost">Annuler</button>
            <button
              onClick={envoyer}
              disabled={sending || !to || !subject}
              className="btn-primary"
            >
              {sending ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
