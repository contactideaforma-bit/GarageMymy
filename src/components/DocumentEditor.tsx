"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Document, DocumentLigne, DocumentType, Dossier } from "@/lib/types";
import {
  CategorieLigne,
  CATEGORIES_LIGNE,
  LigneSaisie,
  categorieDe,
  computeTotaux,
  estLigneIngredients,
  estPosteMo,
  genNumero,
  groupeLignes,
  ingredientsDesynchronises,
  joursFacture,
  ligneVide,
  lignesToDb,
  controlerRapport,
  marquerTempsLibre,
  montantRemiseLigne,
  resynchroniserIngredients,
  sousTotal,
  syncIngredientsPeinture,
  totalLigne,
  lignesDepuisChiffrage,
} from "@/lib/documents";
import { formatEuros, messageErreur, ymd } from "@/lib/format";
import { detecterCorrections, type LigneComparable } from "@/lib/apprentissage";
import { apprendreDesCorrections } from "@/lib/apprentissageDb";

/**
 * Grille d'une ligne de saisie (v8.1).
 * Mobile : 12 colonnes classiques. Desktop : colonnes à largeur FIXE pour les
 * montants — les anciennes `col-span-1` (≈ 70 px) rognaient les centimes
 * (« 739,66 » s'affichait « 739, »). Désignation = 1re colonne élastique.
 * Ordre : désignation · tableau · qté/temps · PU/taux · remise · total · ×
 */
const GRILLE_LIGNE =
  "grid grid-cols-12 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_5.5rem_7.5rem_5rem_7rem_1.5rem]";

/**
 * Lignes de pré-remplissage : soit les lignes en base d'un document existant,
 * soit le CHIFFRAGE du rapport rangé sur le dossier (v50). Seuls ces cinq
 * champs sont lus — inutile d'exiger un `DocumentLigne` complet.
 */
export type LigneSource = Pick<
  DocumentLigne,
  "designation" | "quantite" | "prix_unitaire" | "remise" | "categorie"
>;

export default function DocumentEditor({
  dossier,
  type,
  document,
  lignes,
  origineLignes,
  onClose,
  onSaved,
}: {
  dossier: Dossier;
  type: DocumentType;
  document?: Document | null;
  lignes?: LigneSource[];
  /** D'où viennent les lignes pré-remplies (affiché à l'utilisateur). */
  origineLignes?: "rapport" | "document" | null;
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
      ? marquerTempsLibre(
          lignes.map((l) => ({
            designation: l.designation || "",
            quantite: String(l.quantite ?? 1),
            prix_unitaire: String(l.prix_unitaire ?? 0),
            remise: String(l.remise ?? 0),
            categorie: categorieDe(l),
          }))
        )
      : [ligneVide()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CHIFFRAGE DU RAPPORT (v50) : conservé sur le dossier, il permet de
  // reconstituer le document à l'identique — à la demande de l'utilisateur,
  // JAMAIS tout seul (règle : l'appli signale, l'humain décide).
  const chiffrage = lignesDepuisChiffrage(dossier.chiffrage);
  function reprendreLeChiffrage() {
    if (chiffrage.length === 0) return;
    if (
      items.some((l) => l.designation.trim() !== "") &&
      !confirm(
        "Remplacer toutes les lignes par le chiffrage du rapport d'expertise ? Vos modifications en cours seront perdues."
      )
    ) {
      return;
    }
    setItems(
      marquerTempsLibre(
        chiffrage.map((l) => ({
          designation: l.designation,
          quantite: String(l.quantite),
          prix_unitaire: String(l.prix_unitaire),
          remise: String(l.remise),
          categorie: l.categorie,
        }))
      )
    );
  }

  // MÉMOIRE DE L'ANALYSE (v7.7) : photo des lignes À L'OUVERTURE. À
  // l'enregistrement, l'écart avec ce qu'on a sous les yeux, c'est exactement
  // ce que le garage a corrigé — donc ce que l'analyse doit apprendre.
  const comparable = (l: LigneSaisie): LigneComparable => ({
    designation: (l.designation || "").trim(),
    quantite: Number(l.quantite) || 0,
    prix_unitaire: Number(l.prix_unitaire) || 0,
    categorie: l.categorie,
  });
  const avantRef = useRef<LigneComparable[]>(
    (lignes || []).map((l) => ({
      designation: (l.designation || "").trim(),
      quantite: Number(l.quantite) || 0,
      prix_unitaire: Number(l.prix_unitaire) || 0,
      categorie: categorieDe(l),
    }))
  );

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
  function setItem(
    i: number,
    key: "designation" | "quantite" | "prix_unitaire" | "remise" | "categorie",
    val: string
  ) {
    majItems((arr) =>
      arr.map((it, idx) => {
        if (idx !== i) return it;
        const maj = { ...it, [key]: val } as LigneSaisie;
        // v8.1 — Saisir un temps à la main sur une ligne « ingrédients de
        // peinture » débraye la recopie automatique : sans ça le champ était
        // réécrit à chaque frappe et le nombre d'heures restait bloqué.
        if (key === "quantite" && estLigneIngredients(maj.designation)) {
          maj.tempsLibre = true;
        }
        return maj;
      })
    );
  }
  // Remettre les ingrédients sur le temps de la peinture.
  const ingrLibres = ingredientsDesynchronises(items);
  function resyncIngredients() {
    setItems((arr) => resynchroniserIngredients(arr));
  }
  function addLine(categorie: CategorieLigne) {
    majItems((arr) => [...arr, ligneVide(categorie)]);
  }
  function removeLine(i: number) {
    majItems((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function save() {
    // Un document sans aucune ligne n'a pas de sens : avant, il partait en
    // base avec un total de 0 € et le garage croyait avoir généré une facture.
    if (items.every((l) => l.designation.trim() === "")) {
      setError(
        chiffrage.length > 0
          ? "Aucune ligne : utilise « ↺ Reprendre le chiffrage du rapport » ou saisis au moins une ligne."
          : "Aucune ligne : saisis au moins une désignation avant d'enregistrer."
      );
      return;
    }
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

      // APPRENTISSAGE : on n'observe que la MODIFICATION d'un document
      // existant (une création part d'une page blanche : rien à comparer).
      // Jamais bloquant — apprendreDesCorrections avale ses erreurs.
      if (isEdit && avantRef.current.length > 0) {
        const apres = items.filter((l) => l.designation.trim() !== "").map(comparable);
        const corrections = detecterCorrections(avantRef.current, apres);
        if (corrections.length > 0) {
          await apprendreDesCorrections(dossier.id, docId ?? null, corrections);
          avantRef.current = apres;
        }
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
    const ingr = estLigneIngredients(it.designation);
    // Le tableau des postes est VERROUILLÉ sur T1, T2, T3, Peinture et
    // Ingrédients de peinture. Une ligne rangée à la main dans « main d'œuvre »
    // sans en être un poste bascule dans « Autres » : on le DIT (v8.8), au
    // lieu de la déplacer en silence à l'impression.
    const moInvalide = it.categorie === "mo" && !estPosteMo(it.designation);
    return (
      <div key={i} className={`${GRILLE_LIGNE} items-center`}>
        <input
          className="field-input col-span-12 sm:col-span-1"
          placeholder="Désignation"
          value={it.designation}
          onChange={(e) => setItem(i, "designation", e.target.value)}
        />
        <select
          className={`field-input col-span-6 sm:col-span-1 px-2 text-xs ${
            moInvalide ? "border-amber-400" : ""
          }`}
          value={it.categorie}
          onChange={(e) => setItem(i, "categorie", e.target.value)}
          title={
            moInvalide
              ? "Le tableau « Main d'œuvre » n'accepte que T1, T2, T3, Peinture et Ingrédients de peinture — cette ligne sera imprimée dans « Autres éléments »."
              : "Tableau de la facture dans lequel cette ligne apparaît"
          }
        >
          {(Object.keys(CATEGORIES_LIGNE) as CategorieLigne[]).map((c) => (
            <option key={c} value={c}>{CATEGORIES_LIGNE[c]}</option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          className="field-input col-span-3 sm:col-span-1 px-2 text-right tabular-nums"
          value={it.quantite}
          title={
            ingr
              ? "Temps des ingrédients de peinture — repris de la ligne « Peinture », modifiable à la main"
              : "Quantité (ou temps en heures pour la main d'œuvre)"
          }
          onChange={(e) => setItem(i, "quantite", e.target.value)}
        />
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          className="field-input col-span-3 sm:col-span-1 px-2 text-right tabular-nums"
          value={it.prix_unitaire}
          title="Prix unitaire HT (ou taux horaire)"
          onChange={(e) => setItem(i, "prix_unitaire", e.target.value)}
        />
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          inputMode="decimal"
          className="field-input col-span-3 sm:col-span-1 px-2 text-right tabular-nums"
          value={it.remise}
          title="Remise en %"
          onChange={(e) => setItem(i, "remise", e.target.value)}
        />
        <div className="col-span-2 sm:col-span-1 text-right text-sm text-white/80 whitespace-nowrap tabular-nums">
          {formatEuros(total)}
        </div>
        <button
          onClick={() => removeLine(i)}
          className="col-span-1 sm:col-span-1 text-white/40 hover:text-rose-300"
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
        <div className={`hidden sm:grid ${GRILLE_LIGNE} text-[11px] text-white/40 px-1 mb-1`}>
          <span className="sm:col-span-1">Désignation</span>
          <span className="sm:col-span-1">Tableau</span>
          <span className="sm:col-span-1 text-right">{categorie === "mo" ? "Temps" : "Qté"}</span>
          <span className="sm:col-span-1 text-right">{categorie === "mo" ? "Taux" : "PU HT"}</span>
          <span className="sm:col-span-1 text-right">Remise %</span>
          <span className="sm:col-span-1 text-right">Total HT</span>
          <span className="sm:col-span-1" />
        </div>
        <div className="space-y-2">
          {indices.length === 0 && (
            <p className="text-xs text-white/30 px-1 py-2">Aucune ligne dans ce tableau.</p>
          )}
          {indices.map((i) => renderLigne(items[i], i))}
        </div>
        {categorie === "mo" && ingrLibres && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="text-[11px] text-white/50">
              Le temps des ingrédients de peinture a été saisi à la main : il ne suit plus
              automatiquement la ligne « Peinture ».
            </span>
            <button onClick={resyncIngredients} className="btn-ghost py-1 px-3 text-xs whitespace-nowrap">
              ↻ Reprendre le temps de peinture
            </button>
          </div>
        )}
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
      <div className="w-full max-w-6xl glass-card my-8 modal-panel">
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
            Les ingrédients de peinture reprennent automatiquement le temps de la ligne « Peinture »,
            sauf si tu saisis toi-même un nombre d&apos;heures différent.
            {isEdit && (
              <>
                {" "}Tes corrections (libellé, tableau, taux horaire, ligne retirée) nourrissent la
                mémoire de l&apos;analyse : répétées deux fois, elles seront appliquées d&apos;office
                aux prochains rapports. Tu les retrouves dans Profil → Mémoire de l&apos;analyse.
              </>
            )}
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
              "T1, T2, T3, Peinture, Ingr. de peinture (temps repris de la peinture, modifiable)",
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

          {/* CONFRONTATION AU RAPPORT — affichée EN PERMANENCE (v8.8).
              La facture doit reprendre le rapport ligne pour ligne : le
              garage doit voir le verdict à chaque ouverture, pas seulement
              quand ça cloche. Correction toujours MANUELLE. */}
          {controle.montantRapport !== null && (
            <div
              className={`rounded-lg border-2 px-3 py-2 text-sm ${
                controle.coherent
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                  : "border-amber-400/50 bg-amber-500/15 text-amber-100"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {controle.coherent ? "✓ " : "⚠ "}
                  Rapport d&apos;expertise : {formatEuros(controle.montantRapport)} HT · ce document :{" "}
                  {formatEuros(controle.totalHt)} HT
                  {!controle.coherent && (
                    <span className="font-semibold">
                      {" "}
                      · écart {formatEuros(Math.abs(controle.ecart))}{" "}
                      {controle.ecart > 0 ? "en trop" : "en moins"}
                    </span>
                  )}
                </span>
                {chiffrage.length > 0 && (
                  <button
                    type="button"
                    onClick={reprendreLeChiffrage}
                    className="btn-ghost btn-compact shrink-0"
                    title="Remplacer les lignes par celles lues dans le rapport d'expertise"
                  >
                    ↺ Reprendre le chiffrage du rapport
                  </button>
                )}
              </div>
              {!controle.coherent && (
                <p className="mt-1 text-xs opacity-90">
                  Vérifie les heures, les taux horaires et les pièces, puis corrige à la main —
                  l&apos;appli ne modifie jamais un montant à ta place.
                </p>
              )}
            </div>
          )}

          {/* D'où viennent les lignes quand on rouvre un document */}
          {!isEdit && origineLignes && (
            <p className="text-xs text-white/50">
              {origineLignes === "rapport"
                ? `Pré-rempli avec le chiffrage du rapport d'expertise (${chiffrage.length} ligne${
                    chiffrage.length > 1 ? "s" : ""
                  }, lignes sans prix comprises).`
                : "Pré-rempli en reprenant le document existant le plus récent de ce dossier."}
            </p>
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
