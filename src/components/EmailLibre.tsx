"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  CessionCreance,
  Document,
  Dossier,
  ListeDiffusion,
  OrdreReparation,
} from "@/lib/types";
import { messageErreur } from "@/lib/format";
import {
  cessionPdfBase64,
  documentPdfBase64Auto,
  ordreReparationPdfBase64,
  ribPdfBase64,
} from "@/lib/pdf";
import ModalShell from "@/components/ModalShell";
import EmailComposer, { PieceJointeOption } from "@/components/EmailComposer";

/**
 * NOUVEL EMAIL « libre » (rubrique Emails) :
 * - optionnellement lié à un dossier → contacts et documents du dossier
 *   disponibles (pièces jointes cochables) ;
 * - ou envoi GROUPÉ à une liste de diffusion (adresses en copie cachée,
 *   pour ne pas exposer les emails des destinataires entre eux).
 */
export default function EmailLibre({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent?: () => void;
}) {
  const [etape, setEtape] = useState<"choix" | "listes" | "compose">("choix");

  // choix
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [listes, setListes] = useState<ListeDiffusion[]>([]);
  const [dossierId, setDossierId] = useState("");
  const [listeId, setListeId] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // données préparées pour le composer
  const [dossierChoisi, setDossierChoisi] = useState<Dossier | null>(null);
  const [pj, setPj] = useState<PieceJointeOption[]>([]);
  const [cciInitial, setCciInitial] = useState("");

  // gestion des listes
  const [nomListe, setNomListe] = useState("");
  const [emailsListe, setEmailsListe] = useState("");
  const [listeEnEdition, setListeEnEdition] = useState<ListeDiffusion | null>(null);

  const chargerListes = useCallback(async () => {
    const { data } = await supabase.from("listes_diffusion").select("*").order("nom");
    setListes((data as ListeDiffusion[]) || []);
  }, []);

  useEffect(() => {
    supabase
      .from("dossiers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setDossiers((data as Dossier[]) || []));
    chargerListes();
  }, [chargerListes]);

  async function rediger() {
    setChargement(true);
    setErreur(null);
    try {
      let d: Dossier | null = null;
      let pieces: PieceJointeOption[] = [];
      if (dossierId) {
        d = dossiers.find((x) => x.id === dossierId) || null;
        if (d) {
          const [docs, ors, cess] = await Promise.all([
            supabase.from("documents").select("*").eq("dossier_id", d.id).order("created_at", { ascending: false }),
            supabase.from("ordres_reparation").select("*").eq("dossier_id", d.id),
            supabase.from("cessions_creance").select("*").eq("dossier_id", d.id),
          ]);
          const dossier = d;
          pieces = [
            ...(((docs.data as Document[]) || []).map((doc) => ({
              label: `${doc.type === "devis" ? "Devis" : "Facture"} ${doc.numero || ""} (PDF)`,
              filename: `${doc.numero || doc.type}.pdf`,
              getBase64: () => documentPdfBase64Auto(doc, dossier),
              coche: false,
            }))),
            ...(((ors.data as OrdreReparation[]) || []).map((o) => ({
              label: `Ordre de réparation ${o.numero || ""} (PDF)`,
              filename: `${o.numero || "ordre-reparation"}.pdf`,
              getBase64: () => ordreReparationPdfBase64(o, dossier),
              coche: false,
            }))),
            ...(((cess.data as CessionCreance[]) || []).map((c) => ({
              label: "Cession de créance (PDF)",
              filename: "cession-creance.pdf",
              getBase64: () => cessionPdfBase64(c, dossier),
              coche: false,
            }))),
          ];
        }
      }
      pieces.push({ label: "RIB du garage", filename: "RIB.pdf", getBase64: ribPdfBase64, coche: false });

      // Liste de diffusion → adresses en COPIE CACHÉE
      let cci = "";
      if (listeId) {
        const l = listes.find((x) => x.id === listeId);
        cci = (l?.emails || "")
          .split(/[,\n;]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .join(", ");
      }

      setDossierChoisi(d);
      setPj(pieces);
      setCciInitial(cci);
      setEtape("compose");
    } catch (err: unknown) {
      setErreur(messageErreur(err, "Préparation impossible."));
    } finally {
      setChargement(false);
    }
  }

  async function enregistrerListe() {
    if (!nomListe.trim()) {
      setErreur("Donne un nom à la liste.");
      return;
    }
    setErreur(null);
    const payload = { nom: nomListe.trim(), emails: emailsListe.trim() };
    const { error } = listeEnEdition
      ? await supabase.from("listes_diffusion").update(payload).eq("id", listeEnEdition.id)
      : await supabase.from("listes_diffusion").insert(payload);
    if (error) {
      setErreur(messageErreur(error, "Enregistrement impossible (migration v23 exécutée ?)."));
      return;
    }
    setNomListe("");
    setEmailsListe("");
    setListeEnEdition(null);
    chargerListes();
  }

  async function supprimerListe(l: ListeDiffusion) {
    if (!confirm(`Supprimer la liste « ${l.nom} » ?`)) return;
    await supabase.from("listes_diffusion").delete().eq("id", l.id);
    chargerListes();
  }

  if (etape === "compose") {
    return (
      <EmailComposer
        dossier={dossierChoisi}
        piecesJointes={pj}
        defaultCci={cciInitial}
        defaultSubject=""
        defaultBody={`Bonjour,\n\n\n\nCordialement.`}
        onClose={onClose}
        onSent={onSent}
      />
    );
  }

  if (etape === "listes") {
    return (
      <ModalShell title="Listes de diffusion" onClose={() => setEtape("choix")}>
        {listes.length === 0 && (
          <p className="text-sm text-white/40">Aucune liste. Crée ta première liste ci-dessous.</p>
        )}
        {listes.map((l) => (
          <div key={l.id} className="glass-soft flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <div className="font-medium text-white">{l.nom}</div>
              <div className="truncate text-xs text-white/50">
                {(l.emails.match(/@/g) || []).length} adresse{(l.emails.match(/@/g) || []).length > 1 ? "s" : ""}
              </div>
            </div>
            <div className="flex gap-3 text-sm">
              <button
                onClick={() => { setListeEnEdition(l); setNomListe(l.nom); setEmailsListe(l.emails); }}
                className="text-accent-pink hover:underline"
              >
                Modifier
              </button>
              <button onClick={() => supprimerListe(l)} className="text-white/40 hover:text-rose-300">
                Suppr.
              </button>
            </div>
          </div>
        ))}

        <div className="border-t border-white/10 pt-3 space-y-3">
          <div className="text-sm font-semibold text-white">
            {listeEnEdition ? `Modifier « ${listeEnEdition.nom} »` : "Nouvelle liste"}
          </div>
          <div>
            <label className="field-label">Nom de la liste</label>
            <input className="field-input" value={nomListe} onChange={(e) => setNomListe(e.target.value)} placeholder="Ex. Clients fidèles, Assurances partenaires…" />
          </div>
          <div>
            <label className="field-label">Adresses (séparées par des virgules ou des retours à la ligne)</label>
            <textarea className="field-input" rows={4} value={emailsListe} onChange={(e) => setEmailsListe(e.target.value)} placeholder="premier@email.fr, deuxieme@email.fr…" />
          </div>
          {erreur && (
            <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{erreur}</div>
          )}
          <div className="flex justify-end gap-3">
            {listeEnEdition && (
              <button onClick={() => { setListeEnEdition(null); setNomListe(""); setEmailsListe(""); }} className="btn-ghost">
                Annuler la modification
              </button>
            )}
            <button onClick={enregistrerListe} className="btn-primary">
              {listeEnEdition ? "Enregistrer" : "Créer la liste"}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Nouvel email" onClose={onClose}>
      <div>
        <label className="field-label">Lier à un dossier (optionnel)</label>
        <select className="field-input" value={dossierId} onChange={(e) => setDossierId(e.target.value)}>
          <option value="">— Aucun dossier —</option>
          {dossiers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.numero_sinistre || "Sans n°"} · {d.client_nom || "—"}
              {d.immatriculation ? ` · ${d.immatriculation}` : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-white/40">
          Lié à un dossier : ses contacts (assurance, expert, client) et ses documents (PDF joignables)
          seront disponibles, et l&apos;email apparaîtra dans l&apos;historique du dossier.
        </p>
      </div>

      <div>
        <label className="field-label">Envoyer à une liste de diffusion (optionnel)</label>
        <div className="flex gap-2">
          <select className="field-input" value={listeId} onChange={(e) => setListeId(e.target.value)}>
            <option value="">— Aucune liste —</option>
            {listes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom} ({(l.emails.match(/@/g) || []).length})
              </option>
            ))}
          </select>
          <button onClick={() => setEtape("listes")} className="btn-ghost shrink-0 py-2 px-3 text-xs">
            Gérer les listes
          </button>
        </div>
        <p className="mt-1 text-xs text-white/40">
          Les adresses de la liste partent en COPIE CACHÉE : les destinataires ne voient pas
          les adresses des autres.
        </p>
      </div>

      {erreur && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{erreur}</div>
      )}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={rediger} disabled={chargement} className="btn-primary">
          {chargement ? "Préparation…" : "Rédiger l'email"}
        </button>
      </div>
    </ModalShell>
  );
}
