"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CommandePiece, Document, DocumentLigne, Dossier } from "@/lib/types";
import { formatEuros, messageErreur } from "@/lib/format";
import ModalShell from "@/components/ModalShell";

// Statuts de commande (section NON bloquante pour l'avancement du dossier)
export const STATUTS_COMMANDE: Record<string, { label: string; badge: string }> = {
  a_commander: { label: "À commander", badge: "bg-rose-100 text-rose-700" },
  commande: { label: "Commandé", badge: "bg-amber-100 text-amber-700" },
  en_livraison: { label: "En cours de livraison", badge: "bg-blue-100 text-blue-700" },
  receptionne: { label: "Réceptionné", badge: "bg-emerald-100 text-emerald-700" },
};

// Lignes de main d'œuvre à écarter lors de l'import depuis le devis
const MOTIFS_MO = /^(main d'?œuvre|main d'?oeuvre|peinture$|ingr[ée]dient|t[123]\b)/i;

export default function CommandesPanel({ dossier }: { dossier: Dossier }) {
  const [commandes, setCommandes] = useState<CommandePiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [ajoutOpen, setAjoutOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("commandes_pieces")
      .select("*")
      .eq("dossier_id", dossier.id)
      .order("created_at", { ascending: true });
    setCommandes((data as CommandePiece[]) || []);
    setLoading(false);
  }, [dossier.id]);

  useEffect(() => { load(); }, [load]);

  // Importe les pièces tarifées depuis l'ORDRE DE RÉPARATION (référence du
  // chiffrage) ; repli sur la facture si l'OR ne détaille pas les lignes.
  // Les lignes de main d'œuvre sont écartées.
  async function importerDepuisOR() {
    setImporting(true);
    setError(null);
    try {
      const { data: or } = await supabase
        .from("ordres_reparation")
        .select("id,travaux")
        .eq("dossier_id", dossier.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!or) throw new Error("Aucun ordre de réparation sur ce dossier : émets-le d'abord (bloc Documents).");

      const dejaLa = new Set(commandes.map((c) => c.designation.toLowerCase()));
      let aImporter: { dossier_id: string; designation: string; prix_ht: number; statut: string }[] = [];

      // 1) Lignes de l'OR : format "- DÉSIGNATION (xN) — 123.45 € HT"
      const regex = /^-\s*(.+?)(?:\s*\(x\d+\))?\s*—\s*([\d\s.,]+)\s*€\s*HT\s*$/;
      for (const ligne of (or.travaux || "").split("\n")) {
        const m = ligne.trim().match(regex);
        if (!m) continue;
        const des = m[1].trim();
        const prix = Number(m[2].replace(/\s/g, "").replace(",", "."));
        if (!des || !prix || MOTIFS_MO.test(des) || dejaLa.has(des.toLowerCase())) continue;
        aImporter.push({ dossier_id: dossier.id, designation: des, prix_ht: prix, statut: "a_commander" });
      }

      // 2) Repli : lignes de la facture (même chiffrage) si l'OR est en texte libre
      if (aImporter.length === 0) {
        const { data: fac } = await supabase
          .from("documents")
          .select("id")
          .eq("dossier_id", dossier.id)
          .eq("type", "facture")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fac) {
          const { data: lignes } = await supabase
            .from("document_lignes")
            .select("*")
            .eq("document_id", (fac as Document).id)
            .order("ordre", { ascending: true });
          aImporter = ((lignes as DocumentLigne[]) || [])
            .filter((l) => {
              const des = (l.designation || "").trim();
              const total = (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0);
              return des && total > 0 && !MOTIFS_MO.test(des) && !dejaLa.has(des.toLowerCase());
            })
            .map((l) => ({
              dossier_id: dossier.id,
              designation: (l.designation || "").trim(),
              prix_ht: (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0),
              statut: "a_commander",
            }));
        }
      }

      if (aImporter.length === 0) {
        setError("Rien à importer : les pièces tarifées de l'ordre de réparation sont déjà dans la liste (ou il n'en contient pas).");
      } else {
        const { error: e1 } = await supabase.from("commandes_pieces").insert(aImporter);
        if (e1) throw e1;
        load();
      }
    } catch (err: unknown) {
      setError(messageErreur(err, "Import impossible (migration v18 exécutée ?)."));
    } finally {
      setImporting(false);
    }
  }

  async function changerStatut(c: CommandePiece, statut: string) {
    setCommandes((prev) => prev.map((x) => (x.id === c.id ? { ...x, statut } : x)));
    await supabase.from("commandes_pieces").update({ statut }).eq("id", c.id);
  }

  async function changerCommentaire(c: CommandePiece, commentaire: string) {
    await supabase.from("commandes_pieces").update({ commentaire: commentaire || null }).eq("id", c.id);
  }

  async function supprimer(c: CommandePiece) {
    if (!confirm(`Retirer « ${c.designation} » de la liste ?`)) return;
    await supabase.from("commandes_pieces").delete().eq("id", c.id);
    load();
  }

  const recues = commandes.filter((c) => c.statut === "receptionne").length;
  const totalHt = commandes.reduce((s, c) => s + (Number(c.prix_ht) || 0), 0);

  return (
    <section className="glass-card">
      <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-white">Commande de pièces</h2>
          {commandes.length > 0 && (
            <span
              className="font-pixel text-[0.55rem]"
              style={{ color: recues === commandes.length ? "#10b981" : "#f59e0b" }}
            >
              {recues}/{commandes.length} RECUES
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={importerDepuisOR} disabled={importing} className="btn-ghost py-1.5 px-3 text-xs">
            {importing ? "Import…" : "Importer les pièces de l'ordre de réparation"}
          </button>
          <button onClick={() => setAjoutOpen(true)} className="btn-ghost py-1.5 px-3 text-xs">
            + Pièce
          </button>
        </div>
      </div>

      <div className="px-5 py-4">
        {loading && <p className="text-sm text-white/40">Chargement…</p>}
        {!loading && commandes.length === 0 && (
          <p className="text-sm text-white/40">
            Aucune pièce suivie. « Importer les pièces de l&apos;ordre de réparation » récupère
            automatiquement les pièces tarifées du chiffrage (la main d&apos;œuvre est écartée).
          </p>
        )}

        {commandes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-white/50">
                <tr>
                  <th className="py-2 pr-4 font-medium">Pièce</th>
                  <th className="py-2 pr-4 font-medium text-right">Prix HT</th>
                  <th className="py-2 pr-4 font-medium">Statut</th>
                  <th className="py-2 pr-4 font-medium">Commentaire</th>
                  <th className="py-2 font-medium text-right">Retirer</th>
                </tr>
              </thead>
              <tbody>
                {commandes.map((c) => (
                  <tr key={c.id} className="border-t border-white/5 align-middle">
                    <td className="py-2.5 pr-4 text-white/90 max-w-[280px]">
                      <span className="block truncate" title={c.designation}>{c.designation}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-white/80 whitespace-nowrap">
                      {c.prix_ht != null ? formatEuros(c.prix_ht) : "—"}
                    </td>
                    <td className="py-2.5 pr-4">
                      <select
                        className="field-input py-1.5 text-xs w-44"
                        value={c.statut}
                        onChange={(e) => changerStatut(c, e.target.value)}
                      >
                        {Object.entries(STATUTS_COMMANDE).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 pr-4">
                      <input
                        className="field-input py-1.5 text-xs"
                        defaultValue={c.commentaire || ""}
                        placeholder="Fournisseur, délai, référence…"
                        onBlur={(e) => changerCommentaire(c, e.target.value)}
                      />
                    </td>
                    <td className="py-2.5 text-right">
                      <button onClick={() => supprimer(c)} className="text-white/40 hover:text-rose-300">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10">
                  <td className="py-2 pr-4 text-white/50">Total pièces</td>
                  <td className="py-2 pr-4 text-right font-medium text-white">{formatEuros(totalHt)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>
        )}
      </div>

      {ajoutOpen && (
        <AjoutPieceModal
          dossier={dossier}
          onClose={() => setAjoutOpen(false)}
          onSaved={() => { setAjoutOpen(false); load(); }}
        />
      )}
    </section>
  );
}

/* --------------------------- Ajout manuel --------------------------- */

function AjoutPieceModal({
  dossier,
  onClose,
  onSaved,
}: {
  dossier: Dossier;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [designation, setDesignation] = useState("");
  const [prix, setPrix] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!designation.trim()) { setError("Indique la désignation de la pièce."); return; }
    setSaving(true);
    setError(null);
    try {
      const { error: e1 } = await supabase.from("commandes_pieces").insert({
        dossier_id: dossier.id,
        designation: designation.trim(),
        prix_ht: prix === "" ? null : Number(prix),
        commentaire: commentaire || null,
      });
      if (e1) throw e1;
      onSaved();
    } catch (err: unknown) {
      setError(messageErreur(err, "Enregistrement impossible (migration v18 exécutée ?)."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Ajouter une pièce" onClose={onClose}>
      <div>
        <label className="field-label">Désignation</label>
        <input className="field-input" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Ex. PARE-CHOCS AR" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Prix HT (€)</label>
          <input type="number" className="field-input" value={prix} onChange={(e) => setPrix(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Commentaire (optionnel)</label>
          <input className="field-input" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Fournisseur, référence…" />
        </div>
      </div>
      {error && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Enregistrement…" : "Ajouter"}
        </button>
      </div>
    </ModalShell>
  );
}
