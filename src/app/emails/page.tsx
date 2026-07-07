"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Email } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { ribPdfBase64 } from "@/lib/pdf";
import ConfigBanner from "@/components/ConfigBanner";
import EmailLibre from "@/components/EmailLibre";
import EmailComposer from "@/components/EmailComposer";
import ContactsPicker, { ContactAnnuaire } from "@/components/ContactsPicker";

/**
 * JOURNAL DES EMAILS — présentation type Apple Mail :
 * liste des messages à gauche, lecture à droite, carnet de contacts intégré.
 */

const STATUT: Record<string, { label: string; badge: string; point: string }> = {
  envoye: { label: "Envoyé", badge: "bg-emerald-500/20 text-emerald-200 border-emerald-400/30", point: "bg-emerald-400" },
  echec: { label: "Échec", badge: "bg-rose-500/20 text-rose-200 border-rose-400/30", point: "bg-rose-400" },
  brouillon: { label: "Brouillon", badge: "bg-white/10 text-white/60 border-white/20", point: "bg-white/40" },
};

/** Date courte façon boîte mail : heure si aujourd'hui, sinon date. */
function dateCourte(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const memeJour = d.toDateString() === now.toDateString();
  if (memeJour) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const memeAnnee = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("fr-FR", memeAnnee ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "2-digit" });
}

type EmailRow = Email & { dossier_id: string | null };

export default function EmailsPage() {
  const router = useRouter();
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [selectionne, setSelectionne] = useState<EmailRow | null>(null);

  // fenêtres
  const [nouvelEmail, setNouvelEmail] = useState(false);
  const [contactsOuverts, setContactsOuverts] = useState(false);
  const [destinatairesChoisis, setDestinatairesChoisis] = useState<ContactAnnuaire[] | null>(null);

  async function load() {
    const { data } = await supabase
      .from("emails")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setEmails(data as EmailRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter(
      (m) =>
        (m.destinataire || "").toLowerCase().includes(q) ||
        (m.objet || "").toLowerCase().includes(q) ||
        (m.corps || "").toLowerCase().includes(q)
    );
  }, [emails, recherche]);

  // Écrire aux contacts cochés : 1 contact → destinataire visible ;
  // plusieurs → copie cachée (chacun ne voit pas les autres).
  const composerContacts = destinatairesChoisis
    ? {
        to: destinatairesChoisis.length === 1 ? destinatairesChoisis[0].email : "",
        cci: destinatairesChoisis.length > 1 ? destinatairesChoisis.map((c) => c.email).join(", ") : "",
      }
    : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Emails</h1>
        <div className="flex gap-3">
          <button onClick={() => setContactsOuverts(true)} className="btn-ghost">
            Contacts
          </button>
          <button onClick={() => setNouvelEmail(true)} className="btn-primary">
            + Nouvel email
          </button>
        </div>
      </div>
      <ConfigBanner />

      {/* ===== Fenêtre type Apple Mail : liste | lecture ===== */}
      <div className="glass-card overflow-hidden">
        <div className="grid md:grid-cols-[minmax(280px,360px)_1fr]" style={{ minHeight: "60vh" }}>
          {/* --- Colonne gauche : liste des messages --- */}
          <div className={`${selectionne ? "hidden md:flex" : "flex"} flex-col border-white/10 md:border-r`}>
            <div className="border-b border-white/10 p-3">
              <input
                className="field-input"
                placeholder="Rechercher (destinataire, objet, texte)…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto" style={{ maxHeight: "65vh" }}>
              {loading && <p className="px-4 py-8 text-center text-sm text-white/40">Chargement…</p>}
              {!loading && visibles.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-white/40">
                  {recherche
                    ? "Aucun email ne correspond à la recherche."
                    : "Aucun email envoyé pour l'instant. Clique sur « + Nouvel email » pour commencer."}
                </p>
              )}
              {visibles.map((m) => {
                const st = STATUT[m.statut] || STATUT.brouillon;
                const actif = selectionne?.id === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectionne(m)}
                    className={`block w-full border-b border-white/5 px-4 py-3 text-left transition-colors ${
                      actif ? "bg-white/15" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold text-white">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${st.point}`} />
                        <span className="truncate">{m.destinataire || "Sans destinataire"}</span>
                      </span>
                      <span className="shrink-0 text-xs text-white/40">{dateCourte(m.created_at)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm text-white/80">{m.objet || "(sans objet)"}</div>
                    <div className="mt-0.5 truncate text-xs text-white/40">
                      {m.statut === "echec" && m.erreur ? m.erreur : (m.corps || "").replace(/\s+/g, " ").slice(0, 90)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* --- Colonne droite : lecture --- */}
          <div className={`${selectionne ? "flex" : "hidden md:flex"} flex-col`}>
            {!selectionne ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
                <div className="font-pixel text-[0.6rem] text-white/30">BOITE D&apos;ENVOI</div>
                <p className="text-sm text-white/40">Sélectionne un email dans la liste pour le lire.</p>
              </div>
            ) : (
              <>
                <div className="border-b border-white/10 p-4">
                  <button
                    onClick={() => setSelectionne(null)}
                    className="mb-2 text-sm text-accent-teal hover:underline md:hidden"
                  >
                    ← Retour à la liste
                  </button>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="min-w-0 text-lg font-semibold text-white" style={{ overflowWrap: "anywhere" }}>
                      {selectionne.objet || "(sans objet)"}
                    </h2>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${(STATUT[selectionne.statut] || STATUT.brouillon).badge}`}
                    >
                      {(STATUT[selectionne.statut] || STATUT.brouillon).label}
                    </span>
                  </div>
                  <div className="mt-2 space-y-0.5 text-sm">
                    <div className="text-white/70">
                      <span className="text-white/40">À : </span>
                      <span style={{ overflowWrap: "anywhere" }}>{selectionne.destinataire || "—"}</span>
                    </div>
                    <div className="text-white/40">{formatDateTime(selectionne.created_at)}</div>
                    {selectionne.statut === "echec" && selectionne.erreur && (
                      <div className="mt-1 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
                        Échec d&apos;envoi : {selectionne.erreur}
                      </div>
                    )}
                  </div>
                  {selectionne.dossier_id && (
                    <button
                      onClick={() => router.push(`/sinistres/${selectionne.dossier_id}`)}
                      className="mt-2 text-sm text-accent-teal hover:underline"
                    >
                      Ouvrir le dossier lié
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: "55vh" }}>
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-white/80">
                    {selectionne.corps || "(message vide)"}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== Fenêtres ===== */}
      {nouvelEmail && (
        <EmailLibre onClose={() => setNouvelEmail(false)} onSent={load} />
      )}

      {contactsOuverts && (
        <ContactsPicker
          onClose={() => setContactsOuverts(false)}
          onEcrire={(contacts) => {
            setContactsOuverts(false);
            setDestinatairesChoisis(contacts);
          }}
        />
      )}

      {composerContacts && (
        <EmailComposer
          dossier={null}
          piecesJointes={[{ label: "RIB du garage", filename: "RIB.pdf", getBase64: ribPdfBase64, coche: false }]}
          defaultTo={composerContacts.to}
          defaultCci={composerContacts.cci}
          defaultSubject=""
          defaultBody={`Bonjour,\n\n\n\nCordialement.`}
          onClose={() => setDestinatairesChoisis(null)}
          onSent={() => {
            setDestinatairesChoisis(null);
            load();
          }}
        />
      )}
    </div>
  );
}
