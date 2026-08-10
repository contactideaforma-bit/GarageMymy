"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Document, DocumentLigne, DocumentType, Dossier } from "@/lib/types";
import {
  CategorieLigne,
  CATEGORIES_LIGNE,
  LigneSaisie,
  categorieDe,
  computeTotaux,
  genNumero,
  groupeLignes,
  joursFacture,
  ligneVide,
  lignesToDb,
  controlerRapport,
  montantRemiseLigne,
  sousTotal,
  syncIngredientsPeinture,
  totalLigne,
} from "@/lib/documents";
import { formatEuros, messageErreur, ymd } from "@/lib/format";

export default function DocumentEditor({
  dossier,
  type,
  document,
  lignes,
  onClose,
  onSaved,
}: {
  dossier: Dossier;
  type: DocumentType;
  document?: Document | null;
  lignes?: DocumentLigne[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(document);
  const titre = type === "devis" ? "Devis" : "Facture";

  const [numero, setNumero] = useState(document?.numero || genNumero(type));
  const [dateDoc, setDateDoc] = useState(document?.date_document || ymd());
  const [dateEcheance, setDateEcheance] = useState(document?.date_echeance || "");
  const [statut, setStatut] = useState(document?.statut || "brouillon");
  const [tva, setTva] = useState(String(document?.tva ?? 20));
  const [notes, setNotes] = useState(document?.notes || "");
  const [acquitte, setAcquitte] = useState(Boolean(document?.acquitte));
  // Durée d'immobilisation imprimée en en-tête de facture : pré-remplie
  // depuis le planning du dossier, modifiable au cas par cas.
  // Durée d'immobilisation : plus saisie (retirée de la facture en v7.5),
  // mais la valeur déjà enregistrée est conservée telle quelle.
  const jours = String(joursFacture(document, dossier) ?? "");
  const [items, setItems] = useState<LigneSaisie[]>(
    lignes && lignes.length
      ? lignes.map((l) => ({
          designation: l.designation || "",
          quantite: String(l.quantite ?? 1),
          prix_unitaire: String(l.prix_unitaire ?? 0),
          remise: String(l.remise ?? 0),
          categorie: categorieDe(l),
        }))
      : [ligneVide()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totaux = computeTotaux(items, tva);
  // Le net à payer doit correspondre au rapport d'expertise (montant HT retenu
  // sur le dossier). Sinon : alerte — correction MANUELLE, jamais automatique.
  const controle = controlerRapport(totaux.ht, dossier.montant);
  const remises = items.reduce((s, l) => s + montantRemiseLigne(l), 0);
  const groupes = groupeLignes(items);

  // Toute modification passe par la synchro « ingrédients = temps peinture ».
  function majItems(maj: (arr: LigneSaisie[]) => LigneSaisie[]) {
    setItems((arr) => syncIngredientsPeinture(maj(arr)));
  }
  function setItem(i: number, key: keyof LigneSaisie, val: string) {
    majItems((arr) =>
      arr.map((it, idx) => (idx === i ? ({ ...it, [key]: val } as LigneSaisie) : it))
    );
  }
  function addLine(categorie: CategorieLigne) {
    majItems((arr) => [...arr, ligneVide(categorie)]);
  }
  function removeLine(i: number) {
    majItems((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        dossier_id: dossier.id,
        type,
        numero,
        date_document: dateDoc,
        date_echeance: dateEcheance || null,
        statut,
        tva: Number(tva) || 0,
        notes: notes || null,
        total_ht: totaux.ht,
        total_tva: totaux.tva,
        total_ttc: totaux.ttc,
        acquitte: type === "facture" ? acquitte : false,
        jours_reparation: Number(jours) > 0 ? Number(jours) : null,
      };

      let docId = document?.id;

      if (isEdit && document) {
        const { error: e1 } = await supabase
          .from("documents")
          .update(payload)
          .eq("id", document.id);
        if (e1) throw e1;
      } else {
        const { data, error: e1 } = await supabase
          .from("documents")
          .insert(payload)
          .select("id")
          .single();
        if (e1) throw e1;
        docId = data!.id;
      }

      // INSÉRER d'abord les nouvelles lignes, SUPPRIMER ensuite les anciennes :
      // si l'insert échoue, l'ancienne version reste intacte (l'ancien ordre
      // delete→insert pouvait vider définitivement la facture sur une coupure).
      const rows = lignesToDb(items).map((l) => ({ ...l, document_id: docId! }));
      let nouveauxIds: string[] = [];
      if (rows.length) {
        const { data: inserees, error: e2 } = await supabase
          .from("document_lignes")
          .insert(rows)
          .select("id");
        if (e2) throw e2;
        nouveauxIds = (inserees || []).map((r) => r.id);
      }
      if (isEdit && document) {
        let del = supabase.from("document_lignes").delete().eq("document_id", document.id);
        if (nouveauxIds.length) {
          del = del.not("id", "in", `(${nouveauxIds.join(",")})`);
        }
        const { error: e3 } = await del;
        if (e3) throw e3;
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(messageErreur(err, "Erreur lors de l'enregistrement."));
    } finally {
      setSaving(false);
    }
  }

  // Une ligne de saisie (mêmes colonnes que la facture PDF).
  // NB : fonction de rendu, PAS un sous-composant — un composant redéclaré à
  // chaque rendu serait remonté à chaque frappe (perte du focus clavier).
  const renderLigne = (it: LigneSaisie, i: number) => {
    const total = totalLigne(it);
    return (
      <div key={i} className="grid grid-cols-12 gap-2 items-center">
        <input
          className="field-input col-span-12 sm:col-span-5"
          placeholder="Désignation"
          value={it.designation}
          onChange={(e) => setItem(i, "designation", e.target.value)}
        />
        <select
          className="field-input col-span-6 sm:col-span-2 text-xs"
          value={it.categorie}
          onChange={(e) => setItem(i, "categorie", e.target.value)}
          title="Tableau de la facture dans lequel cette ligne apparaît"
        >
          {(Object.keys(CATEGORIES_LIGNE) as CategorieLigne[]).map((c) => (
            <option key={c} value={c}>{CATEGORIES_LIGNE[c]}</option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          className="field-input col-span-3 sm:col-span-1 text-right"
          value={it.quantite}
          title="Quantité (ou temps en heures pour la main d'œuvre)"
          onChange={(e) => setItem(i, "quantite", e.target.value)}
        />
        <input
          type="number"
          step="0.01"
          className="field-input col-span-3 sm:col-span-1 text-right"
          value={it.prix_unitaire}
          title="Prix unitaire HT (ou taux horaire)"
          onChange={(e) => setItem(i, "prix_unitaire", e.target.value)}
        />
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          className="field-input col-span-3 sm:col-span-1 text-right"
          value={it.remise}
          title="Remise en %"
          onChange={(e) => setItem(i, "remise", e.target.value)}
        />
        <div className="col-span-2 sm:col-span-1 text-right text-sm text-white/80 whitespace-nowrap">
          {formatEuros(total)}
        </div>
        <button
          onClick={() => removeLine(i)}
          className="col-span-1 text-white/40 hover:text-rose-300"
          title="Supprimer"
        >
          ×
        </button>
      </div>
    );
  };

  const renderBloc = (
    titreBloc: string,
    aide: string,
    categorie: CategorieLigne,
    indices: number[]
  ) => {
    const st = sousTotal(indices.map((i) => items[i]));
    return (
      <div key={categorie} className="glass-soft rounded-xl p-3">
        <div className="flex items-center justify-between mb-2 gap-3">
          <div>
            <span className="text-sm font-medium text-white/80">{titreBloc}</span>
            <span className="block text-[11px] text-white/40">{aide}</span>
          </div>
          <button onClick={() => addLine(categorie)} className="btn-ghost py-1 px-3 text-xs whitespace-nowrap">
            + Ligne
          </button>
        </div>
        <div className="hidden sm:grid grid-cols-12 gap-2 text-[11px] text-white/40 px-1 mb-1">
          <span className="col-span-5">Désignation</span>
          <span className="col-span-2">Tableau</span>
          <span className="col-span-1 text-right">{categorie === "mo" ? "Temps" : "Qté"}</span>
          <span className="col-span-1 text-right">{categorie === "mo" ? "Taux" : "PU HT"}</span>
          <span className="col-span-1 text-right">Remise %</span>
          <span className="col-span-1 text-right">Total HT</span>
        </div>
        <div className="space-y-2">
          {indices.length === 0 && (
            <p className="text-xs text-white/30 px-1 py-2">Aucune ligne dans ce tableau.</p>
          )}
          {indices.map((i) => renderLigne(items[i], i))}
        </div>
        {indices.length > 0 && (
          <div className="flex justify-end mt-2 text-xs text-white/50">
            Sous-total HT&nbsp;: <span className="text-white/80 ml-2">{formatEuros(st)}</span>
          </div>
        )}
      </div>
    );
  };

  const indicesPar = (cat: CategorieLigne) =>
    items.map((_, i) => i).filter((i) => items[i].categorie === cat);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto backdrop-blur-sm">
      <div className="w-full max-w-5xl glass-card my-8 modal-panel">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? `Modifier ${titre.toLowerCase()}` : `Nouveau ${titre.toLowerCase()}`}
          </h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div>
              <label className="field-label">N° {titre.toLowerCase()}</label>
              <input className="field-input" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Date</label>
              <input type="date" className="field-input" value={dateDoc} onChange={(e) => setDateDoc(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Échéance</label>
              <input type="date" className="field-input" value={dateEcheance} onChange={(e) => setDateEcheance(e.target.value)} />
            </div>
            <div>
              <label className="field-label">TVA (%)</label>
              <input type="number" className="field-input" value={tva} onChange={(e) => setTva(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Statut</label>
              <select className="field-input" value={statut} onChange={(e) => setStatut(e.target.value)}>
                <option value="brouillon">Brouillon</option>
                <option value="envoye">Envoyé</option>
                <option value="accepte">Accepté</option>
                <option value="refuse">Refusé</option>
                <option value="paye">Payé</option>
              </select>
            </div>
          </div>

          <p className="text-[11px] text-white/40 -mt-2">
            Le mode de paiement imprimé sur le PDF est choisi au moment de générer le document.
            Les ingrédients de peinture reprennent automatiquement le temps de la ligne « Peinture ».
          </p>

          {/* Les 3 tableaux de la facture */}
          <div className="space-y-4">
            {renderBloc(
              "Tableau principal — pièces, fournitures & prestations",
              "Désignation · Qté · PU HT · Remise · Total HT",
              "piece",
              indicesPar("piece")
            )}
            {renderBloc(
              "Main d'œuvre & peinture",
              "T1, T2, T3, Peinture, Ingr. de peinture (temps = celui de la peinture)",
              "mo",
              indicesPar("mo")
            )}
            {renderBloc(
              "Autres éléments retenus au rapport",
              "Forfaits, fournitures diverses, frais annexes… (tableau affiché seulement s'il contient des lignes)",
              "autre",
              indicesPar("autre")
            )}
          </div>

          {type === "facture" && (
            <label className="flex items-start gap-2.5 text-sm text-white/80 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acquitte}
                onChange={(e) => setAcquitte(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-500"
              />
              <span>
                Mention « Acquittée » sur le PDF
                <span className="block text-xs text-white/40 normal-case">
                  Atteste que la facture a été réglée — un tampon vert « ACQUITTÉE » est apposé près du total.
                </span>
              </span>
            </label>
          )}

          <div>
            <label className="field-label">Notes</label>
            <textarea
              className="field-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Conditions, délais, mentions…"
            />
          </div>

          {/* Alerte de cohérence avec le rapport d'expertise */}
          {!controle.coherent && controle.message && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
              <span className="font-semibold">⚠ À vérifier — </span>
              {controle.message}
            </div>
          )}

          {/* Totaux */}
          <div className="flex justify-end">
            <div className="w-full sm:w-72 space-y-1 text-sm">
              <div className="flex justify-between text-white/50 text-xs">
                <span>Pièces / MO / Autres</span>
                <span>
                  {formatEuros(sousTotal(groupes.pieces))} · {formatEuros(sousTotal(groupes.mo))} ·{" "}
                  {formatEuros(sousTotal(groupes.autres))}
                </span>
              </div>
              {remises > 0 && (
                <div className="flex justify-between text-white/50">
                  <span>Dont remises accordées</span><span>- {formatEuros(remises)}</span>
                </div>
              )}
              <div className="flex justify-between text-white/70">
                <span>Total HT</span><span>{formatEuros(totaux.ht)}</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>TVA ({tva || 0}%)</span><span>{formatEuros(totaux.tva)}</span>
              </div>
              <div className="flex justify-between text-white font-semibold text-base pt-1 border-t border-white/10">
                <span>Total TTC</span><span>{formatEuros(totaux.ttc)}</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="btn-ghost">Annuler</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
