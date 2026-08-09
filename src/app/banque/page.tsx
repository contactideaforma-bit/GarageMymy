"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { BankTransaction, Document, Dossier, Paiement } from "@/lib/types";
import { formatEuros, formatDate, messageErreur } from "@/lib/format";
import {
  parseReleveCsv,
  hashTransactions,
  analyserCredit,
  calculeReste,
  FactureBanque,
  LIBELLE_MOTIF,
  type Correspondance,
} from "@/lib/banque";
import { rapprocherTransaction } from "@/lib/rapprochement";
import StatCard from "@/components/StatCard";
import ConfigBanner from "@/components/ConfigBanner";
import ModalShell from "@/components/ModalShell";
import { majDossierSiSolde } from "@/lib/dossierSync";
import { estSoldee } from "@/lib/paiements";

type Filtre = "a_rapprocher" | "rapproche" | "ignore" | "tous";

export default function BanquePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [factures, setFactures] = useState<FactureBanque[]>([]);
  const [loading, setLoading] = useState(true);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>("a_rapprocher");
  const [rapproche, setRapproche] = useState<BankTransaction | null>(null); // modal
  // Analyse automatique du relevé (v6.7) : rapprochement des virements dont le
  // libellé porte un n° de facture ou un n° de dossier.
  const [analyse, setAnalyse] = useState(false);
  const [analyseMsg, setAnalyseMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [txRes, docsRes, payRes] = await Promise.all([
      supabase.from("bank_transactions").select("*").order("date_transaction", { ascending: false }).limit(500),
      supabase.from("documents").select("*, dossier:dossiers(*)").eq("type", "facture"),
      supabase.from("paiements").select("*"),
    ]);
    setTransactions((txRes.data as BankTransaction[]) || []);
    const docs = (docsRes.data as (Document & { dossier: Dossier | null })[]) || [];
    const paiements = (payRes.data as Paiement[]) || [];
    setFactures(
      docs.map((d) => {
        const p = paiements.filter((x) => x.document_id === d.id);
        return { ...d, paiements: p, reste: calculeReste({ ...d, paiements: p }) };
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ----------------------------- Import CSV ----------------------------- */

  async function importerCsv(file: File) {
    setImporting(true);
    setImportMsg(null);
    try {
      const text = await file.text();
      const { lignes, ignorees } = parseReleveCsv(text);
      if (lignes.length === 0) {
        setImportMsg("Aucune transaction lisible dans ce fichier. Vérifie que c'est bien l'export CSV du relevé.");
        return;
      }
      // hashTransactions numérote les opérations identiques du même jour :
      // deux virements de même montant/libellé ne s'écrasent plus.
      const hashes = hashTransactions(lignes);
      const rows = lignes.map((l, i) => ({
        date_transaction: l.date,
        libelle: l.libelle,
        montant: l.montant,
        reference: l.reference,
        source: "csv",
        hash: hashes[i],
      }));
      // upsert ignoreDuplicates : réimporter le même relevé ne crée pas de doublons
      const { error } = await supabase
        .from("bank_transactions")
        .upsert(rows, { onConflict: "owner_id,hash", ignoreDuplicates: true });
      if (error) throw error;
      setImportMsg(
        `${lignes.length} transaction${lignes.length > 1 ? "s" : ""} lue${lignes.length > 1 ? "s" : ""}` +
          (ignorees ? ` (${ignorees} ligne${ignorees > 1 ? "s" : ""} illisible${ignorees > 1 ? "s" : ""} ignorée${ignorees > 1 ? "s" : ""})` : "") +
          ". Les doublons déjà importés sont écartés automatiquement."
      );
      await load();
    } catch (err: unknown) {
      setImportMsg(`Erreur d'import : ${messageErreur(err, "fichier illisible.")}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /* ------------------------------ Actions ------------------------------ */

  async function ignorer(tx: BankTransaction, retablir = false) {
    const { error } = await supabase
      .from("bank_transactions")
      .update({ statut: retablir ? "nouveau" : "ignore" })
      .eq("id", tx.id);
    if (error) alert(messageErreur(error));
    load();
  }

  /* ------------------------------- Dérivés ------------------------------- */

  const enrichies = useMemo(
    () =>
      transactions.map((tx) => {
        const corr: Correspondance | null =
          tx.statut === "nouveau"
            ? analyserCredit(Number(tx.montant) || 0, tx.libelle || "", tx.reference, factures)
            : null;
        return { ...tx, correspondance: corr, suggestion: corr?.facture || null };
      }),
    [transactions, factures]
  );

  // Virements identifiés SANS AMBIGUÏTÉ (référence trouvée dans le libellé et
  // montant compatible) : rapprochables en un clic.
  const certaines = useMemo(
    () => enrichies.filter((t) => t.statut === "nouveau" && t.correspondance?.certaine),
    [enrichies]
  );

  /**
   * Analyse du relevé : encaisse tous les virements dont la référence désigne
   * une facture. Traitement SÉQUENTIEL (le reste à payer d'une facture évolue
   * au fil des encaissements) et on ne traite qu'une fois chaque facture par
   * passe, pour ne jamais sur-encaisser.
   */
  async function rapprocherAutomatiquement() {
    if (certaines.length === 0) return;
    setAnalyse(true);
    setAnalyseMsg(null);
    let faits = 0;
    const echecs: string[] = [];
    const dejaTraitees = new Set<string>();
    for (const tx of certaines) {
      const facture = tx.correspondance!.facture;
      if (dejaTraitees.has(facture.id)) continue; // relecture au prochain passage
      dejaTraitees.add(facture.id);
      const res = await rapprocherTransaction(tx, facture);
      if (res.ok) faits++;
      else echecs.push(res.erreur);
    }
    await load();
    setAnalyse(false);
    setAnalyseMsg(
      `${faits} virement${faits > 1 ? "s" : ""} rapproché${faits > 1 ? "s" : ""}` +
        (echecs.length ? ` · ${echecs.length} en échec (${echecs[0]})` : "") +
        ". Les factures soldées passent en « Payé », et leur dossier aussi."
    );
  }

  const kpi = useMemo(() => {
    let aRapprocherN = 0, aRapprocherM = 0, rapprochees = 0, suggestions = 0;
    for (const t of enrichies) {
      if (t.statut === "nouveau" && (Number(t.montant) || 0) > 0) {
        aRapprocherN++;
        aRapprocherM += Number(t.montant) || 0;
        if (t.suggestion) suggestions++;
      }
      if (t.statut === "rapproche") rapprochees++;
    }
    return { aRapprocherN, aRapprocherM, rapprochees, suggestions };
  }, [enrichies]);

  const filtrees = enrichies.filter((t) => {
    if (filtre === "tous") return true;
    if (filtre === "a_rapprocher") return t.statut === "nouveau";
    return t.statut === filtre;
  });

  const FILTRES: { key: Filtre; label: string }[] = [
    { key: "a_rapprocher", label: "À rapprocher" },
    { key: "rapproche", label: "Rapprochées" },
    { key: "ignore", label: "Ignorées" },
    { key: "tous", label: "Toutes" },
  ];

  return (
    <div>
      <h1 className="titre-page mb-4">Banque</h1>
      <ConfigBanner />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Crédits à rapprocher" value={String(kpi.aRapprocherN)} hint={formatEuros(kpi.aRapprocherM)} />
        <StatCard label="Suggestions trouvées" value={String(kpi.suggestions)} hint="rapprochement en 1 clic" />
        <StatCard label="Rapprochées" value={String(kpi.rapprochees)} />
        <StatCard label="Transactions importées" value={String(transactions.length)} />
      </div>

      {/* Import du relevé + analyse automatique des règlements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <section className="glass-card p-5">
          <h2 className="font-semibold text-white">Importer un relevé bancaire (CSV)</h2>
          <p className="mt-1 text-sm text-white/50">
            Export CSV depuis l&apos;espace en ligne de ta banque — toutes les banques le proposent.
            Réimporter le même relevé ne crée pas de doublons.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importerCsv(f);
            }}
          />
          <button onClick={() => fileRef.current?.click()} disabled={importing} className="btn-primary mt-4">
            {importing ? "Import…" : "Importer le relevé"}
          </button>
          {importMsg && <p className="mt-3 text-sm text-white/70">{importMsg}</p>}
        </section>

        {/* Analyse du relevé : quels dossiers sont déjà réglés ? (v6.7) */}
        <section className="glass-card p-5">
          <h2 className="font-semibold text-white">Analyse des règlements</h2>
          <p className="mt-1 text-sm text-white/50">
            On lit la référence de chaque virement : dès qu&apos;un{" "}
            <span className="text-white/70">n° de facture</span> ou un{" "}
            <span className="text-white/70">n° de dossier</span> y figure, le virement est
            rattaché à la bonne facture. Les factures soldées passent en « Payé » — et leur
            dossier avec.
          </p>

          <div className="mt-3 text-sm">
            {certaines.length > 0 ? (
              <p className="text-emerald-200">
                {certaines.length} virement{certaines.length > 1 ? "s" : ""} identifié
                {certaines.length > 1 ? "s" : ""} sans ambiguïté, pour{" "}
                {formatEuros(certaines.reduce((s, t) => s + (Number(t.montant) || 0), 0))}.
              </p>
            ) : (
              <p className="text-white/40">
                Aucun virement identifiable par sa référence pour l&apos;instant. Les autres se
                rapprochent à la main depuis le tableau ci-dessous.
              </p>
            )}
          </div>

          <button
            onClick={rapprocherAutomatiquement}
            disabled={analyse || certaines.length === 0}
            className="btn-primary mt-4 disabled:opacity-40"
          >
            {analyse ? "Analyse…" : `Rapprocher automatiquement (${certaines.length})`}
          </button>
          {analyseMsg && <p className="mt-3 text-sm text-white/70">{analyseMsg}</p>}
          <p className="mt-2 text-xs text-white/35">
            Astuce : indique le n° de facture (ou le n° de sinistre) en référence quand tu
            demandes un virement — c&apos;est ce qui rend le rapprochement automatique.
          </p>
        </section>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTRES.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltre(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filtre === f.key ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Transactions */}
      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-white/50">
            <tr>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Libellé</th>
              <th className="px-5 py-3 font-medium text-right">Montant</th>
              <th className="px-5 py-3 font-medium">Rapprochement</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-white/40">Chargement…</td></tr>
            )}
            {!loading && filtrees.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-white/40">
                  {transactions.length === 0
                    ? "Aucune transaction. Importe ton premier relevé CSV ci-dessus."
                    : "Rien pour ce filtre."}
                </td>
              </tr>
            )}
            {filtrees.map((tx) => {
              const m = Number(tx.montant) || 0;
              const factureLiee = tx.document_id ? factures.find((f) => f.id === tx.document_id) : null;
              return (
                <tr key={tx.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-5 py-3 text-white/80 whitespace-nowrap">{formatDate(tx.date_transaction)}</td>
                  <td className="px-5 py-3 text-white/80 max-w-[360px] truncate" title={tx.libelle || ""}>
                    {tx.libelle}
                  </td>
                  <td className={`px-5 py-3 text-right font-medium ${m >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {formatEuros(m)}
                  </td>
                  <td className="px-5 py-3">
                    {tx.statut === "rapproche" && (
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">
                        ✓ {factureLiee?.numero || "facture"}
                      </span>
                    )}
                    {tx.statut === "ignore" && (
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-500">
                        Ignorée
                      </span>
                    )}
                    {tx.statut === "nouveau" && tx.correspondance && (
                      <div className="text-xs">
                        <span className={tx.correspondance.certaine ? "text-emerald-300" : "text-accent-teal"}>
                          {tx.correspondance.certaine ? "Identifié : " : "Suggestion : "}
                          {tx.correspondance.facture.numero}
                          {tx.correspondance.facture.dossier?.client_nom
                            ? ` · ${tx.correspondance.facture.dossier.client_nom}`
                            : ""}
                        </span>
                        <span className="ml-1 text-white/35">
                          ({tx.correspondance.motifs.map((m) => LIBELLE_MOTIF[m]).join(", ")})
                        </span>
                      </div>
                    )}
                    {tx.statut === "nouveau" && !tx.suggestion && m > 0 && (
                      <span className="text-xs text-white/30">—</span>
                    )}
                    {tx.statut === "nouveau" && m < 0 && (
                      <span className="text-xs text-white/30">débit</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {tx.statut === "nouveau" && m > 0 && (
                      <button onClick={() => setRapproche(tx)} className="text-accent-teal hover:underline mr-3">
                        Rapprocher
                      </button>
                    )}
                    {tx.statut === "nouveau" && (
                      <button onClick={() => ignorer(tx)} className="text-white/40 hover:text-white/70">
                        Ignorer
                      </button>
                    )}
                    {tx.statut === "ignore" && (
                      <button onClick={() => ignorer(tx, true)} className="text-white/40 hover:text-white/70">
                        Rétablir
                      </button>
                    )}
                    {tx.statut === "rapproche" && factureLiee?.dossier && (
                      <button
                        onClick={() => router.push(`/sinistres/${factureLiee.dossier!.id}`)}
                        className="text-accent-teal hover:underline"
                      >
                        Dossier
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rapproche && (
        <RapprochementModal
          tx={rapproche}
          factures={factures}
          suggestion={enrichies.find((t) => t.id === rapproche.id)?.suggestion || null}
          onClose={() => setRapproche(null)}
          onSaved={() => {
            setRapproche(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------- Modal de rapprochement ------------------------- */

function RapprochementModal({
  tx,
  factures,
  suggestion,
  onClose,
  onSaved,
}: {
  tx: BankTransaction;
  factures: FactureBanque[];
  suggestion: FactureBanque | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ouvertes = factures.filter((f) => f.reste > 0);
  const [factureId, setFactureId] = useState(suggestion?.id || ouvertes[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const facture = factures.find((f) => f.id === factureId) || null;
  const montant = Number(tx.montant) || 0;

  async function valider() {
    if (!facture) return;
    setSaving(true);
    setError(null);
    try {
      // 1) VERROU d'idempotence : on marque la transaction rapprochée EN
      // PREMIER, conditionné à son statut actuel. Si un précédent essai a déjà
      // abouti (ou qu'un autre onglet vient de la traiter), 0 ligne modifiée →
      // on s'arrête SANS créer de second paiement (l'ancien ordre insérait le
      // paiement d'abord : un retry après erreur doublait l'encaissement).
      const { data: verrou, error: e0 } = await supabase
        .from("bank_transactions")
        .update({ statut: "rapproche", document_id: facture.id })
        .eq("id", tx.id)
        .eq("statut", tx.statut) // uniquement si personne ne l'a traitée entre-temps
        .select("id");
      if (e0) throw e0;
      if (!verrou || verrou.length === 0) {
        throw new Error("Cette transaction a déjà été rapprochée (ou vient de l'être). Recharge la page.");
      }

      // 2) Crée le paiement (virement, référence = libellé bancaire)
      const { data: paiement, error: e1 } = await supabase
        .from("paiements")
        .insert({
          dossier_id: facture.dossier_id,
          document_id: facture.id,
          montant,
          date_paiement: tx.date_transaction,
          moyen: "virement",
          reference: (tx.libelle || "").slice(0, 120) || null,
          notes: "Rapprochement bancaire",
        })
        .select()
        .single();
      if (e1) {
        // Échec de l'insert : on libère le verrou pour permettre un nouvel essai.
        await supabase
          .from("bank_transactions")
          .update({ statut: tx.statut, document_id: null })
          .eq("id", tx.id);
        throw e1;
      }

      // 3) Facture soldée → statut payé (+ dossier « Payé » si tout est soldé)
      if (estSoldee(facture.reste, montant)) {
        await supabase.from("documents").update({ statut: "paye" }).eq("id", facture.id);
        await majDossierSiSolde(facture.dossier_id);
      }

      // 4) Attache l'id du paiement à la transaction (best effort — le
      // rapprochement est déjà valide même si cette étape échoue).
      await supabase
        .from("bank_transactions")
        .update({ paiement_id: paiement?.id || null })
        .eq("id", tx.id);

      onSaved();
    } catch (err: unknown) {
      setError(messageErreur(err, "Erreur lors du rapprochement."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Rapprocher avec une facture" onClose={onClose}>
      <div className="glass-soft p-3 text-sm">
        <div className="text-white/50 text-xs">Transaction bancaire</div>
        <div className="text-white/90 mt-1">
          {formatDate(tx.date_transaction)} · <span className="text-emerald-300 font-medium">{formatEuros(montant)}</span>
        </div>
        <div className="text-white/60 text-xs mt-1 break-words">{tx.libelle}</div>
      </div>

      <div>
        <label className="field-label">Facture à encaisser</label>
        <select className="field-input" value={factureId} onChange={(e) => setFactureId(e.target.value)}>
          {ouvertes.length === 0 && <option value="">Aucune facture avec un reste à payer</option>}
          {ouvertes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.numero || "Facture"} · {f.dossier?.client_nom || "—"} · reste {formatEuros(f.reste)}
              {suggestion?.id === f.id ? "  ← suggestion" : ""}
            </option>
          ))}
        </select>
      </div>

      {facture && (
        <div className="text-sm text-white/60">
          Reste à payer : <span className="text-amber-300 font-medium">{formatEuros(facture.reste)}</span>
          {" · "}après rapprochement :{" "}
          <span className={facture.reste - montant <= 0.01 ? "text-emerald-300 font-medium" : "text-amber-300 font-medium"}>
            {facture.reste - montant <= 0.01 ? "soldée ✓" : formatEuros(Math.max(0, facture.reste - montant))}
          </span>
          {montant > facture.reste + 0.01 && (
            <div className="mt-1 text-xs text-amber-300">
              Attention : le montant reçu dépasse le reste à payer de cette facture.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={valider} disabled={saving || !facture} className="btn-primary">
          {saving ? "Rapprochement…" : "Valider le rapprochement"}
        </button>
      </div>
    </ModalShell>
  );
}
