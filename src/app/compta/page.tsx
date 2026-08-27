"use client";

// EXPORT COMPTABLE (v10.1) — Finance → Export comptable.
// Une période, quatre chiffres, deux boutons : le classeur Excel (journal
// des ventes, encaissements, TVA, balance clients) et le ZIP des pièces
// (classeur + factures PDF + rapports d'expertise). Rien n'est modifié.

import { useEffect, useMemo, useState } from "react";
import StatCard from "@/components/StatCard";
import ConfigBanner from "@/components/ConfigBanner";
import { formatDate, formatEuros, messageErreur } from "@/lib/format";
import {
  DonneesCompta, Periode, chargerDonneesCompta, exporterClasseurCompta, exporterPiecesCompta, periodeAnnee, periodeMois, periodeTrimestre, synthese,
} from "@/lib/compta";

type Mode = "mois" | "trimestre" | "annee" | "libre";

export default function ComptaPage() {
  const now = new Date();
  const [data, setData] = useState<DonneesCompta | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("mois");
  const [annee, setAnnee] = useState(now.getFullYear());
  const [mois, setMois] = useState(now.getMonth() === 0 ? 11 : now.getMonth() - 1);
  const [anneeMois, setAnneeMois] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [trimestre, setTrimestre] = useState(Math.max(1, Math.ceil(now.getMonth() / 3)));
  const [libre, setLibre] = useState({ debut: `${now.getFullYear()}-01-01`, fin: now.toISOString().slice(0, 10) });
  const [etape, setEtape] = useState<string | null>(null);
  const [pourcent, setPourcent] = useState(0);

  useEffect(() => {
    chargerDonneesCompta().then(setData).catch((e) => setErreur(messageErreur(e, "Lecture impossible.")));
  }, []);

  const periode: Periode = useMemo(() => {
    if (mode === "mois") return periodeMois(anneeMois, mois);
    if (mode === "trimestre") return periodeTrimestre(annee, trimestre);
    if (mode === "annee") return periodeAnnee(annee);
    return { debut: libre.debut, fin: libre.fin, libelle: `du ${formatDate(libre.debut)} au ${formatDate(libre.fin)}` };
  }, [mode, annee, mois, anneeMois, trimestre, libre]);

  const s = useMemo(() => (data ? synthese(data, periode) : null), [data, periode]);
  const annees = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  async function classeur() {
    if (!data) return;
    try { await exporterClasseurCompta(data, periode); } catch (e) { alert(messageErreur(e, "Export impossible.")); }
  }
  async function pieces() {
    if (!data || etape) return;
    try {
      const r = await exporterPiecesCompta(data, periode, (m, p) => { setEtape(m); setPourcent(p); });
      setEtape(`ZIP téléchargé : ${r.factures} facture(s) PDF, ${r.rapports} rapport(s) d'expertise.`);
      setTimeout(() => setEtape(null), 6000);
    } catch (e) {
      setEtape(null);
      alert(messageErreur(e, "Export impossible."));
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="titre-page">Export comptable</h1>
          <p className="text-sm text-white/50">Tableaux pour le comptable et pièces justificatives, par période. Ne modifie et n&apos;efface rien.</p>
        </div>
      </div>
      <ConfigBanner />
      {erreur && <p className="badge badge-danger">{erreur}</p>}

      {/* Période */}
      <div className="glass-card mb-5 p-4">
        <div className="segment mb-3 flex-wrap">
          {(["mois", "trimestre", "annee", "libre"] as Mode[]).map((m) => (
            <button key={m} className={`segment-btn ${mode === m ? "actif" : ""}`} onClick={() => setMode(m)}>
              {m === "mois" ? "Mois" : m === "trimestre" ? "Trimestre" : m === "annee" ? "Année" : "Dates libres"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {mode === "mois" && (
            <>
              <div><label className="field-label">Mois</label><select className="field-input" value={mois} onChange={(e) => setMois(Number(e.target.value))}>{MOIS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select></div>
              <div><label className="field-label">Année</label><select className="field-input" value={anneeMois} onChange={(e) => setAnneeMois(Number(e.target.value))}>{annees.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
            </>
          )}
          {mode === "trimestre" && (
            <>
              <div><label className="field-label">Trimestre</label><select className="field-input" value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value))}>{[1, 2, 3, 4].map((t) => <option key={t} value={t}>T{t} (mois {(t - 1) * 3 + 1} à {t * 3})</option>)}</select></div>
              <div><label className="field-label">Année</label><select className="field-input" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>{annees.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
            </>
          )}
          {mode === "annee" && (
            <div><label className="field-label">Année</label><select className="field-input" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>{annees.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
          )}
          {mode === "libre" && (
            <>
              <div><label className="field-label">Du</label><input type="date" className="field-input" value={libre.debut} onChange={(e) => setLibre((l) => ({ ...l, debut: e.target.value }))} /></div>
              <div><label className="field-label">Au</label><input type="date" className="field-input" value={libre.fin} onChange={(e) => setLibre((l) => ({ ...l, fin: e.target.value }))} /></div>
            </>
          )}
          <div className="text-sm text-white/60">→ <b className="text-white capitalize">{periode.libelle}</b> ({formatDate(periode.debut)} → {formatDate(periode.fin)})</div>
        </div>
      </div>

      {/* Chiffres */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Facturé HT" value={formatEuros(s?.ht)} hint={`${s?.factures.length ?? 0} facture(s) émise(s)`} accent="violet" />
        <StatCard label="TVA collectée" value={formatEuros(s?.tva)} hint={s?.parTaux.map((t) => `${t.taux} % : ${formatEuros(t.tva)}`).join(" · ") || "—"} accent="pink" />
        <StatCard label="Encaissé" value={formatEuros(s?.encaisse)} hint={`${s?.paiements.length ?? 0} paiement(s) reçu(s)`} accent="teal" />
        <StatCard label={`Reste dû au ${formatDate(periode.fin)}`} value={formatEuros(s?.resteDuFinPeriode)} hint="toutes factures émises à cette date" accent="amber" />
      </div>

      {/* Exports */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="glass-card p-4">
          <h2 className="titre-bloc">Classeur Excel (4 onglets)</h2>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            <li>📒 <b>Journal des ventes</b> — chaque facture : n°, client, SIREN, sinistre, nature (réparation / gardiennage), HT, taux, TVA, TTC, échéance, mode, statut, encaissé, reste dû.</li>
            <li>💶 <b>Encaissements</b> — chaque paiement : date, montant, moyen, référence, facture, client.</li>
            <li>🧾 <b>TVA collectée</b> — par taux.</li>
            <li>👥 <b>Balance clients</b> — facturé, encaissé, reste dû, plus ancienne échéance impayée.</li>
          </ul>
          <button onClick={classeur} disabled={!data} className="btn-primary mt-3">Télécharger le classeur (.xlsx)</button>
        </div>
        <div className="glass-card p-4">
          <h2 className="titre-bloc">Pièces justificatives (ZIP)</h2>
          <p className="mt-2 text-sm text-white/70">
            Le classeur ci-contre <b>+ les factures PDF</b> de la période <b>+ les rapports d&apos;expertise</b> des dossiers facturés (nommés par n° de sinistre), avec un LISEZ-MOI récapitulatif. C&apos;est le dossier à transmettre au comptable ou à présenter en cas de contrôle.
          </p>
          <button onClick={pieces} disabled={!data || Boolean(etape && pourcent < 100)} className="btn-primary mt-3">
            {etape && pourcent < 100 ? etape : "Télécharger les pièces (.zip)"}
          </button>
          {etape && pourcent < 100 && (
            <div className="mt-2 h-2 overflow-hidden rounded bg-white/10"><div className="h-full bg-accent-teal transition-all" style={{ width: `${pourcent}%` }} /></div>
          )}
          {etape && pourcent >= 100 && <p className="mt-2 text-xs text-emerald-300">{etape}</p>}
        </div>
      </div>

      <p className="mt-4 text-xs text-white/40">
        Les brouillons ne sont pas comptés. Les factures sont datées par leur date de facture ; les paiements par leur date d&apos;encaissement. Pour conserver les pièces 10 ans, fais aussi une sauvegarde complète (Organisation → Sauvegarde). L&apos;archivage d&apos;un dossier, lui, le retire de l&apos;appli : à réserver aux dossiers que tu ne veux plus voir.
      </p>
    </div>
  );
}
