"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Document, DocumentLigne, Dossier, Entreprise } from "@/lib/types";
import { documentPdfBase64 } from "@/lib/pdf";
import { fetchAuth } from "@/lib/apiClient";
import ModalShell from "@/components/ModalShell";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type Contact = { label: string; email: string };

export default function EmailComposer({
  dossier,
  document,
  attachment,
  defaultTo = "",
  defaultSubject = "",
  defaultBody = "",
  onClose,
  onSent,
}: {
  dossier: Dossier;
  document?: Document | null;
  // Pièce jointe générique (ex. cession de créance) quand ce n'est pas un devis/facture
  attachment?: { filename: string; getBase64: () => Promise<string> } | null;
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
  const [cci, setCci] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [attachPdf, setAttachPdf] = useState(Boolean(document || attachment));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contacts du dossier (accès rapide) + annuaire complet (autocomplétion)
  const [contactsDossier, setContactsDossier] = useState<Contact[]>([]);
  const [annuaire, setAnnuaire] = useState<Contact[]>([]);

  useEffect(() => {
    supabase
      .from("entreprise")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setEnt((data as Entreprise) || {}));
    fetchAuth("/api/mail-config")
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

  // Charge les destinataires possibles depuis la base
  useEffect(() => {
    (async () => {
      const chips: Contact[] = [];
      if (dossier.assureur_email) chips.push({ label: `Assurance${dossier.assureur ? ` (${dossier.assureur})` : ""}`, email: dossier.assureur_email });
      if (dossier.expert_email) chips.push({ label: `Expert${dossier.expert_nom ? ` (${dossier.expert_nom})` : ""}`, email: dossier.expert_email });
      if (dossier.cabinet_email) chips.push({ label: `Cabinet${dossier.cabinet_expert ? ` (${dossier.cabinet_expert})` : ""}`, email: dossier.cabinet_email });

      const [cli, ass, exp] = await Promise.all([
        supabase.from("clients").select("nom,email").not("email", "is", null),
        supabase.from("assureurs").select("nom,email").not("email", "is", null),
        supabase.from("experts").select("cabinet,expert_nom,email,expert_email"),
      ]);

      // Email du client : d'abord celui du dossier, sinon l'annuaire (par nom)
      const clients = (cli.data as { nom: string | null; email: string | null }[]) || [];
      if (dossier.client_email) {
        chips.push({ label: `Client${dossier.client_nom ? ` (${dossier.client_nom})` : ""}`, email: dossier.client_email });
      } else if (dossier.client_nom) {
        const c = clients.find(
          (x) => (x.nom || "").trim().toLowerCase() === dossier.client_nom!.trim().toLowerCase() && x.email
        );
        if (c?.email) chips.push({ label: `Client (${c.nom})`, email: c.email });
      }

      const tous: Contact[] = [];
      for (const c of clients) if (c.email) tous.push({ label: c.nom || "Client", email: c.email });
      for (const a of ((ass.data as { nom: string | null; email: string | null }[]) || []))
        if (a.email) tous.push({ label: a.nom || "Assurance", email: a.email });
      for (const e of ((exp.data as { cabinet: string | null; expert_nom: string | null; email: string | null; expert_email: string | null }[]) || [])) {
        if (e.email) tous.push({ label: e.cabinet || "Cabinet", email: e.email });
        if (e.expert_email) tous.push({ label: e.expert_nom || "Expert", email: e.expert_email });
      }
      // dédoublonne par email
      const vus = new Set<string>();
      setAnnuaire(tous.filter((c) => (vus.has(c.email.toLowerCase()) ? false : (vus.add(c.email.toLowerCase()), true))));
      setContactsDossier(chips);
    })();
  }, [dossier]);

  // Ajoute une adresse à un champ (multi-adresses séparées par des virgules)
  function ajouterEmail(email: string, champ: "to" | "cci" = "to") {
    const setter = champ === "to" ? setTo : setCci;
    setter((prev) => {
      const list = prev.split(",").map((s) => s.trim()).filter(Boolean);
      if (list.some((e) => e.toLowerCase() === email.toLowerCase())) return prev;
      return [...list, email].join(", ");
    });
  }

  // Liste déroulante des adresses de la base : contacts du dossier en tête,
  // puis tout l'annuaire (sans doublons).
  function SelecteurContacts({ champ }: { champ: "to" | "cci" }) {
    const dossierEmails = new Set(contactsDossier.map((c) => c.email.toLowerCase()));
    const autres = annuaire.filter((c) => !dossierEmails.has(c.email.toLowerCase()));
    if (contactsDossier.length === 0 && autres.length === 0) return null;
    return (
      <select
        className="field-input mt-2"
        value=""
        onChange={(e) => {
          if (e.target.value) ajouterEmail(e.target.value, champ);
        }}
        aria-label="Ajouter une adresse enregistrée"
      >
        <option value="">Ajouter une adresse enregistrée…</option>
        {contactsDossier.length > 0 && (
          <optgroup label="Contacts du dossier">
            {contactsDossier.map((c) => (
              <option key={`d-${c.email}-${c.label}`} value={c.email}>
                {c.label} — {c.email}
              </option>
            ))}
          </optgroup>
        )}
        {autres.length > 0 && (
          <optgroup label="Annuaire (clients, assurances, experts)">
            {autres.map((c) => (
              <option key={`a-${c.email}`} value={c.email}>
                {c.label} — {c.email}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    );
  }

  const fromLabel =
    mailFrom ||
    (ent?.nom && ent?.email ? `${ent.nom} <${ent.email}>` : ent?.email || "(à configurer)");

  // GARDE-FOU cession de créance : la facture ne doit PAS partir au client
  const emailsClient = contactsDossier
    .filter((c) => c.label.startsWith("Client"))
    .map((c) => c.email.toLowerCase());
  const alerteCession = Boolean(
    dossier.mode_cession &&
      document?.type === "facture" &&
      `${to},${cci}`.split(",").some((t) => emailsClient.includes(t.trim().toLowerCase()))
  );

  async function envoyer() {
    setSending(true);
    setError(null);

    // Pièce jointe PDF (devis/facture ou document fourni) si demandé
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
      } else if (attachPdf && attachment) {
        const b64 = await attachment.getBase64();
        attachments = [{ filename: attachment.filename, content: b64 }];
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
      bcc: cci.trim() || undefined,
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
      const res = await fetchAuth("/api/send-email", {
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

    if (ok) {
      // Un devis/facture envoyé ne reste pas en brouillon
      if (document && document.statut === "brouillon") {
        await supabase.from("documents").update({ statut: "envoye" }).eq("id", document.id);
      }
      // Historique du dossier
      await supabase.from("evenements").insert({
        dossier_id: dossier.id,
        titre: document
          ? `${document.type === "devis" ? "Devis" : "Facture"} ${document.numero || ""} envoyé${document.type === "devis" ? "" : "e"}`
          : "Email envoyé",
        description: `À : ${to}${cci.trim() ? ` (cci : ${cci.trim()})` : ""} — ${subject}`,
        date_evenement: new Date().toISOString(),
        categorie: "autre",
      });
    }

    setSending(false);
    if (ok) {
      onSent?.();
      onClose();
    } else {
      setError(errMsg || "Échec de l'envoi.");
    }
  }

  return (
    <ModalShell title="Envoyer un email" onClose={onClose}>
          <div className="text-xs text-white/40">
            Expéditeur : <span className="text-white/70">{fromLabel}</span>
          </div>
          {mailConfigured === false && (
            <div className="rounded-lg bg-amber-500/15 border border-amber-400/30 px-3 py-2 text-sm text-amber-200">
              Aucune boîte mail configurée. Va dans Profil du garage → Envoi des emails pour la connecter.
            </div>
          )}
          <div>
            <label className="field-label">Destinataire(s)</label>
            <input
              className="field-input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="adresse@email.fr, autre@email.fr"
              list="contacts-annuaire"
            />
            <datalist id="contacts-annuaire">
              {annuaire.map((c) => (
                <option key={c.email} value={c.email}>{c.label}</option>
              ))}
            </datalist>
            {contactsDossier.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {contactsDossier.map((c) => (
                  <button
                    key={c.email + c.label}
                    type="button"
                    onClick={() => ajouterEmail(c.email, "to")}
                    className="rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-xs text-white/80 transition-colors"
                    title={c.email}
                  >
                    + {c.label}
                  </button>
                ))}
              </div>
            )}
            <SelecteurContacts champ="to" />
            <p className="mt-1 text-xs text-white/40">
              Choisis dans la liste (contacts du dossier en premier), clique sur un raccourci, ou tape
              directement. Plusieurs adresses possibles (virgules).
            </p>
            {alerteCession && (
              <div className="mt-2 rounded-lg bg-amber-500/15 border border-amber-400/40 px-3 py-2 text-sm text-amber-200">
                Attention : ce dossier est en CESSION DE CRÉANCE. La facture doit être envoyée à
                l&apos;assurance{dossier.assureur ? ` (${dossier.assureur})` : ""}, pas au client.
              </div>
            )}
          </div>

          <div>
            <label className="field-label">CCI — copie cachée (optionnel)</label>
            <input
              className="field-input"
              value={cci}
              onChange={(e) => setCci(e.target.value)}
              placeholder="Reçoit une copie sans que les destinataires le voient"
              list="contacts-annuaire"
            />
            <SelecteurContacts champ="cci" />
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

          {(document || attachment) && (
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} />
              Joindre le PDF (
              {document ? `${document.type === "devis" ? "devis" : "facture"} ${document.numero || ""}` : attachment?.filename}
              )
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
    </ModalShell>
  );
}
