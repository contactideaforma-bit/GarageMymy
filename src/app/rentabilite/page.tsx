"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  CommandePiece,
  Document,
  DocumentLigne,
  Dossier,
  Paiement,
} from "@/lib/types";
import { formatEuros, messageErreur } from "@/lib/format";
import {
  MargeDossier,
  PERIODES,
  dansPeriode,
  margeDossier,
  statsParAssureur,
} from "@/lib/rentabilite";
import StatCard from "@/components/StatCard";

/**
 * RENTABILITÉ (v49).
 *
 * Trois questions, trois réponses :
 *   · qu'est-ce que ce dossier m'a rapporté ?
 *   · est-ce que je vends assez d'heures par rapport à celles que je passe ?
 *   · quels assureurs me font attendre mon argent ?
 *
 * Le chiffre est refusé plutôt que faux : sans coût horaire renseigné,
 * aucune marge n'est affichée.
 */
export default function RentabilitePage() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [lignes, setLignes] = useState<DocumentLigne[]>([]);
  const [commandes, setCommandes] = useState<CommandePiece[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [entrepriseId, setEntrepriseId] = useState<string | null>(null);
  const [coutHoraire, setCoutHoraire] = useState<number | null>(null);
  const [saisieCout, setSaisieCout] = useState("");
  const [periode, setPeriode] = useState<string>("annee");
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const [d, doc, lg, cmd, pay, ent] = await Promise.all([
      supabase.from("dossiers").select("*"),
      supabase.from("documents").select("*").eq("type", "facture"),
      supabase.from("document_lignes").select("*"),
      supabase.from("commandes_pieces").select("*"),
      supabase.from("paiements").select("*"),
      supabase.from("entreprise").select("id,cout_horaire").limit(1).maybeSingle(),
    ]);
    setDossiers((d.data as Dossier[]) || []);
    setDocuments((doc.data as Document[]) || []);
    setLignes((lg.data as DocumentLigne[]) || []);
    setCommandes((cmd.data as CommandePiece[]) || []);
    setPaiements((pay.data as Paiement[]) || []);
    const e = ent.data as { id?: string; cout_horaire?: number } | null;
    setEntrepriseId(e?.id || null);
    const ch = e?.cout_horaire ?? null;
    setCoutHoraire(ch);
    setSaisieCout(ch ? String(ch) : "");
    setLoading(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function enregistrerCout() {
    const v = Number(saisieCout.replace(",", "."));
    if (!isFinite(v) || v <= 0) {
      setErreur("Indiquez un coût horaire supérieur à zéro.");
      return;
    }
    if (!entrepriseId) {
      setErreur("Renseignez d'abord le profil du garage.");
      return;
    }
    const { error } = await supabase
      .from("entreprise")
      .update({ cout_horaire: v })
      .eq("id", entrepriseId);
    if (error) {
      setErreur(messageErreur(error, "Coût horaire non enregistré (migration v49 exécutée ?)."));
      return;
    }
    setCoutHoraire(v);
    setErreur(null);
    setEnregistre("Coût horaire enregistré.");
    setTimeout(() => setEnregistre(null), 3000);
  }

  /** Saisie rapide des heures passées / du coût des pièces, ligne par ligne. */
  async function majDossier(dossierId: string, patch: Record<string, number | null>) {
    const avant = dossiers;
    setDossiers((prev) => prev.map((d) => (d.id === dossierId ? { ...d, ...patch } : d)));
    const { error } = await supabase.from("dossiers").update(patch).eq("id", dossierId);
    if (error) {
      setDossiers(avant);
      setErreur(messageErreur(error, "Modification non enregistrée (migration v49 exécutée ?)."));
    }
  }

  /* ------------------------------ Calculs ---------------------------- */

  const facturesPeriode = useMemo(
    () => documents.filter((f) => dansPeriode(f.date_document || f.created_at, periode)),
    [documents, periode]
  );

  const marges: MargeDossier[] = useMemo(() => {
    const idsFacturesPeriode = new Set(facturesPeriode.map((f) => f.id));
    return dossiers
      .map((d) => {
        const fs = facturesPeriode.filter((f) => f.dossier_id === d.id);
        if (fs.length === 0) return null;
        const lgs = lignes.filter((l) => idsFacturesPeriode.has(l.document_id) && fs.some((f) => f.id === l.document_id));
        return margeDossier({
          dossier: d,
          factures: fs,
          lignes: lgs,
          commandes: commandes.filter((c) => c.dossier_id === d.id),
          coutHoraire,
        });
      })
      .filter((x): x is MargeDossier => x !== null)
      .sort((a, b) => (a.taux ?? 999) - (b.taux ?? 999));
  }, [dossiers, facturesPeriode, lignes, commandes, coutHoraire]);

  const assureurs = useMemo(
    () => statsParAssureur(dossiers, facturesPeriode, paiements),
    [dossiers, facturesPeriode, paiements]
  );

  const caTotal = marges.reduce((s, m) => s + m.ca, 0);
  const margeTotale = marges.reduce((s, m) => s + m.marge, 0);
  const tauxGlobal = caTotal > 0 ? (margeTotale / caTotal) * 100 : 0;
  const delaisConnus = assureurs.map((a) => a.delaiMoyen).filter((x): x is number => x !== null);
  const delaiMoyen =
    delaisConnus.length > 0
      ? Math.round(delaisConnus.reduce((s, x) => s + x, 0) / delaisConnus.length)
      : null;
  const heuresVenduesTotal = marges.reduce((s, m) => s + m.heuresVendues, 0);
  const heuresPasseesTotal = marges.reduce((s, m) => s + (m.heuresPassees ?? 0), 0);
  const dossiersSansHeures = marges.filter((m) => m.heuresPassees === null).length;

  /* ------------------------------- Rendu ----------------------------- */

  const badgeTaux = (t: number | null) => {
    if (t === null) return "badge badge-neutral";
    if (t < 10) return "badge badge-danger";
    if (t < 25) return "badge badge-warn";
    return "badge badge-ok";
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titre-page">Rentabilité</h1>
          <p className="mt-1 text-xs text-white/50">
            Ce que chaque dossier rapporte vraiment, et quels assureurs vous font attendre.
          </p>
        </div>
        <div className="segment">
          {PERIODES.map((p) => (
            <button
              key={p.code}
              onClick={() => setPeriode(p.code)}
              className={`segment-btn ${periode === p.code ? "actif" : ""}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Coût horaire : sans lui, aucune marge n'est affichée */}
      {!coutHoraire && !loading && (
        <section className="glass-card mb-5 border-l-4 border-l-amber-400 p-4">
          <h2 className="titre-section mb-2">Une donnée manque : votre coût horaire</h2>
          <p className="mb-3 text-sm text-white/65">
            Ce n&apos;est pas le taux que vous facturez, mais ce que vous coûte une heure
            d&apos;atelier : salaires chargés + loyer + énergie + consommables, divisés par les
            heures productives. La plupart des carrosseries se situent entre 35 et 60 € de
            l&apos;heure. Tant qu&apos;il n&apos;est pas renseigné, aucune marge n&apos;est affichée —
            un chiffre faux serait pire que pas de chiffre.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="field-label">Coût horaire de l&apos;atelier (€ HT)</label>
              <input
                className="field-input w-40"
                inputMode="decimal"
                placeholder="45"
                value={saisieCout}
                onChange={(e) => setSaisieCout(e.target.value)}
              />
            </div>
            <button onClick={enregistrerCout} className="btn-primary btn-compact">
              Enregistrer
            </button>
          </div>
        </section>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard accent="pink" icone="🧾" label="Chiffre d'affaires HT" value={formatEuros(caTotal)} hint={`${marges.length} dossier(s) facturé(s)`} />
        <StatCard
          accent={tauxGlobal >= 25 ? "emerald" : tauxGlobal >= 10 ? "amber" : "pink"}
          icone="📈"
          label="Marge estimée"
          value={coutHoraire ? formatEuros(margeTotale) : "—"}
          hint={coutHoraire ? `${tauxGlobal.toFixed(1)} % du CA` : "coût horaire non renseigné"}
        />
        <StatCard
          accent="violet"
          icone="⏱️"
          label="Heures vendues / passées"
          value={`${heuresVenduesTotal.toFixed(1)} / ${heuresPasseesTotal.toFixed(1)}`}
          hint={dossiersSansHeures > 0 ? `${dossiersSansHeures} dossier(s) sans saisie` : "toutes saisies"}
        />
        <StatCard
          accent="teal"
          icone="🏦"
          label="Délai d'encaissement"
          value={delaiMoyen === null ? "—" : `${delaiMoyen} j`}
          hint="moyenne des assureurs payés"
        />
      </div>

      {erreur && (
        <div className="mb-4 rounded-lg border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm text-rose-200">
          {erreur}
        </div>
      )}
      {enregistre && <p className="mb-4 text-sm text-emerald-300">{enregistre}</p>}

      {/* Marge par dossier */}
      <section className="glass-card mb-5 p-3 sm:p-4">
        <h2 className="titre-section mb-1">Marge par dossier</h2>
        <p className="mb-3 text-xs text-white/45">
          Les dossiers les moins rentables en premier. Saisissez les heures réellement passées pour
          fiabiliser le calcul — c&apos;est l&apos;écart avec les heures vendues qui révèle les fuites.
        </p>

        {loading ? (
          <div className="space-y-2">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        ) : marges.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/45">
            Aucune facture sur cette période.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-white/45">
                <tr>
                  <th className="cellule font-medium">Dossier</th>
                  <th className="cellule font-medium text-right">CA HT</th>
                  <th className="cellule font-medium text-right">Pièces</th>
                  <th className="cellule font-medium text-right">Heures V / P</th>
                  <th className="cellule font-medium text-right">Coût MO</th>
                  <th className="cellule font-medium text-right">Marge</th>
                </tr>
              </thead>
              <tbody>
                {marges.map((m) => (
                  <tr key={m.dossier.id} className="border-t border-white/5">
                    <td className="cellule">
                      <Link
                        href={`/sinistres/${m.dossier.id}`}
                        className="font-medium text-white hover:underline"
                      >
                        {m.dossier.numero_sinistre || "—"}
                      </Link>
                      <span className="block truncate text-[11px] text-white/45">
                        {m.dossier.client_nom || "—"}
                        {m.dossier.immatriculation ? ` · ${m.dossier.immatriculation}` : ""}
                      </span>
                    </td>
                    <td className="cellule text-right tabular-nums text-white/85">
                      {formatEuros(m.ca)}
                    </td>
                    <td className="cellule text-right tabular-nums">
                      {m.coutPieces > 0 ? (
                        <span className="text-white/75">{formatEuros(m.coutPieces)}</span>
                      ) : (
                        <input
                          className="field-input field-compact w-24 text-right"
                          inputMode="decimal"
                          placeholder="coût ?"
                          defaultValue=""
                          onBlur={(e) => {
                            const v = Number(e.target.value.replace(",", "."));
                            if (isFinite(v) && v > 0) majDossier(m.dossier.id, { cout_pieces_reel: v });
                          }}
                          title="Coût d'achat des pièces (si aucune commande n'est saisie)"
                        />
                      )}
                    </td>
                    <td className="cellule text-right tabular-nums">
                      <span className="text-white/60">{m.heuresVendues.toFixed(1)}</span>
                      <span className="mx-1 text-white/25">/</span>
                      <input
                        className="field-input field-compact w-16 text-right"
                        inputMode="decimal"
                        placeholder="?"
                        defaultValue={m.heuresPassees ?? ""}
                        onBlur={(e) => {
                          const brut = e.target.value.trim();
                          const v = brut === "" ? null : Number(brut.replace(",", "."));
                          if (v === null || isFinite(v)) majDossier(m.dossier.id, { heures_passees: v });
                        }}
                        title="Heures réellement passées sur ce véhicule"
                      />
                      {m.ecartHeures !== null && m.ecartHeures < 0 && (
                        <span className="ml-1 badge badge-danger">{m.ecartHeures.toFixed(1)} h</span>
                      )}
                    </td>
                    <td className="cellule text-right tabular-nums text-white/60">
                      {m.calculable ? formatEuros(m.coutMainOeuvre) : "—"}
                    </td>
                    <td className="cellule text-right tabular-nums">
                      {m.calculable ? (
                        <>
                          <span className="block font-semibold text-white">{formatEuros(m.marge)}</span>
                          <span className={badgeTaux(m.taux)}>
                            {m.taux === null ? "—" : `${m.taux.toFixed(0)} %`}
                          </span>
                        </>
                      ) : (
                        <span className="text-white/35">coût horaire ?</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Assureurs */}
      <section className="glass-card p-3 sm:p-4">
        <h2 className="titre-section mb-1">Qui vous paie, et en combien de temps</h2>
        <p className="mb-3 text-xs text-white/45">
          Classement par délai moyen de règlement, le plus lent en tête. C&apos;est la donnée à sortir
          quand un assureur discute vos tarifs.
        </p>
        {assureurs.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/45">Aucune facture sur cette période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-white/45">
                <tr>
                  <th className="cellule font-medium">Assurance</th>
                  <th className="cellule font-medium text-right">Dossiers</th>
                  <th className="cellule font-medium text-right">Facturé TTC</th>
                  <th className="cellule font-medium text-right">Reste dû</th>
                  <th className="cellule font-medium text-right">Délai moyen</th>
                </tr>
              </thead>
              <tbody>
                {assureurs.map((a) => (
                  <tr key={a.assureur} className="border-t border-white/5">
                    <td className="cellule">
                      <span className="font-medium text-white">{a.assureur}</span>
                      {a.enRetard > 0 && (
                        <span className="badge badge-danger ml-2">
                          {a.enRetard} facture{a.enRetard > 1 ? "s" : ""} en retard
                        </span>
                      )}
                    </td>
                    <td className="cellule text-right tabular-nums text-white/70">{a.dossiers}</td>
                    <td className="cellule text-right tabular-nums text-white/85">
                      {formatEuros(a.caTtc)}
                    </td>
                    <td className="cellule text-right tabular-nums">
                      <span className={a.resteDu > 0.01 ? "text-rose-300" : "text-white/45"}>
                        {formatEuros(a.resteDu)}
                      </span>
                    </td>
                    <td className="cellule text-right tabular-nums">
                      {a.delaiMoyen === null ? (
                        <span className="text-white/35">jamais soldé</span>
                      ) : (
                        <span
                          className={
                            a.delaiMoyen > 60
                              ? "badge badge-danger"
                              : a.delaiMoyen > 30
                                ? "badge badge-warn"
                                : "badge badge-ok"
                          }
                        >
                          {a.delaiMoyen} j
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
