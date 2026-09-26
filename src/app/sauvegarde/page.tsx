"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatDate, formatDateTime, messageErreur } from "@/lib/format";
import {
  DELAI_SAUVEGARDE_JOURS,
  joursDepuisSauvegarde,
  lireEtatSauvegarde,
  passerSauvegarde,
  poidsLisible,
  prochainRappelSauvegarde,
  sauvegarderGarage,
  sauvegardeARefaire,
} from "@/lib/sauvegarde";
import StatCard from "@/components/StatCard";

/**
 * SAUVEGARDE (v46).
 *
 * Le principe : le garage doit pouvoir partir avec ses données, à tout
 * moment, dans un format qu'il ouvre sans nous. C'est ce qui permet de
 * confier son atelier à un logiciel en ligne sans arrière-pensée.
 */
export default function SauvegardePage() {
  const [derniere, setDerniere] = useState<string | null>(null);
  const [entrepriseId, setEntrepriseId] = useState<string | null>(null);
  const [avecPdf, setAvecPdf] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [etape, setEtape] = useState("");
  const [pourcent, setPourcent] = useState(0);
  const [resultat, setResultat] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [compteurs, setCompteurs] = useState({ dossiers: 0, factures: 0, pieces: 0 });
  const [ignoreeLe, setIgnoreeLe] = useState<string | null>(null);
  const [infoPasse, setInfoPasse] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [ent, d, f, p] = await Promise.all([
        lireEtatSauvegarde(),
        supabase.from("dossiers").select("id", { count: "exact", head: true }),
        supabase.from("documents").select("id", { count: "exact", head: true }).eq("type", "facture"),
        supabase.from("pieces_dossier").select("id", { count: "exact", head: true }),
      ]);
      setEntrepriseId(ent?.id || null);
      setDerniere(ent?.derniere || null);
      setIgnoreeLe(ent?.ignoreeLe || null);
      setCompteurs({ dossiers: d.count || 0, factures: f.count || 0, pieces: p.count || 0 });
    })();
  }, []);

  async function lancer() {
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    setPourcent(0);
    try {
      const r = await sauvegarderGarage({
        avecPdf,
        onProgress: (m, p) => {
          setEtape(m);
          setPourcent(p);
        },
      });
      setResultat(
        `${r.fichier} — ${r.dossiers} dossier${r.dossiers > 1 ? "s" : ""}, ${r.factures} facture${
          r.factures > 1 ? "s" : ""
        }${r.pdf ? ` (${r.pdf} PDF)` : ""}${r.rapports ? `, ${r.rapports} rapport${r.rapports > 1 ? "s" : ""} d'expertise` : ""}, ${poidsLisible(r.octets)}.`
      );
      setDerniere(new Date().toISOString());
      if (!entrepriseId) {
        setErreur(
          "Sauvegarde téléchargée, mais la date n'a pas pu être mémorisée : renseigne d'abord le profil du garage."
        );
      }
    } catch (err) {
      setErreur(messageErreur(err, "La sauvegarde n'a pas pu être constituée."));
    }
    setEnCours(false);
  }

  const jours = joursDepuisSauvegarde(derniere);
  const aRefaire = sauvegardeARefaire(derniere, ignoreeLe);
  const prochain = prochainRappelSauvegarde(derniere, ignoreeLe);

  async function passer() {
    if (!confirm(`Passer cette sauvegarde ? Le rappel reviendra dans ${DELAI_SAUVEGARDE_JOURS} jours.`)) return;
    const err = await passerSauvegarde(entrepriseId);
    if (err) { setErreur(err); return; }
    setIgnoreeLe(new Date().toISOString());
    setInfoPasse(`Sauvegarde passée. Prochain rappel dans ${DELAI_SAUVEGARDE_JOURS} jours.`);
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="titre-page">Sauvegarde de mes données</h1>
        <p className="mt-1 text-xs text-white/50">
          Un fichier ZIP que vous ouvrez sur n&apos;importe quel ordinateur, sans My Easy Auto.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          accent={aRefaire ? "amber" : "emerald"}
          icone={aRefaire ? "⏳" : "🛡️"}
          label="Dernière sauvegarde"
          value={jours === null ? "Jamais" : jours === 0 ? "Aujourd'hui" : `Il y a ${jours} j`}
          hint={derniere ? formatDateTime(derniere) : "aucune sauvegarde enregistrée"}
        />
        <StatCard accent="violet" icone="📁" label="Dossiers" value={String(compteurs.dossiers)} hint="inclus dans l'export" />
        <StatCard accent="pink" icone="🧾" label="Factures" value={String(compteurs.factures)} hint="tableau + PDF" />
        <StatCard accent="teal" icone="📎" label="Pièces jointes" value={String(compteurs.pieces)} hint="listées dans les données" />
      </div>

      {aRefaire && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-amber-400/50 bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
          <span>
            {jours === null
              ? "Vous n'avez jamais fait de sauvegarde. Cela prend une minute — faites-la maintenant."
              : `Votre dernière sauvegarde date de ${jours} jours. Une sauvegarde est conseillée tous les ${DELAI_SAUVEGARDE_JOURS} jours.`}
          </span>
          <button onClick={passer} className="text-xs text-amber-100/70 hover:text-amber-100 hover:underline">Passer cette sauvegarde</button>
        </div>
      )}
      {!aRefaire && prochain && (
        <p className="mb-5 text-xs text-white/55">
          Prochain rappel le {formatDate(prochain.toISOString())}
          {ignoreeLe && (!derniere || new Date(ignoreeLe) > new Date(derniere)) ? " (dernière sauvegarde passée le " + formatDate(ignoreeLe) + ")" : ""}.
        </p>
      )}
      {infoPasse && <p className="mb-5 text-xs text-emerald-300">{infoPasse}</p>}

      <section className="glass-card mb-4 p-4">
        <h2 className="titre-section mb-3">Créer la sauvegarde</h2>

        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={avecPdf}
            onChange={(e) => setAvecPdf(e.target.checked)}
            className="mt-1 h-4 w-4 accent-emerald-500"
          />
          <span>
            <span className="block text-sm font-semibold text-white">
              Inclure les PDF des factures et les rapports d'expertise
            </span>
            <span className="block text-xs text-white/50">
              Recommandé pour la conservation légale. Compte environ une seconde par facture.
            </span>
          </span>
        </label>

        <button onClick={lancer} disabled={enCours} className="btn-primary">
          {enCours ? "Sauvegarde en cours…" : "Télécharger ma sauvegarde"}
        </button>

        {enCours && (
          <div className="mt-4">
            <div className="retro-bar h-3 w-full overflow-hidden rounded">
              <div
                className="h-full bg-gradient-to-r from-accent-violet to-accent-pink transition-all"
                style={{ width: `${pourcent}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-white/55">{etape}</p>
          </div>
        )}

        {resultat && (
          <p className="mt-3 rounded-lg border-2 border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            ✅ Sauvegarde téléchargée : {resultat}
          </p>
        )}
        {erreur && (
          <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
            {erreur}
          </p>
        )}
      </section>

      <section className="glass-card p-4">
        <h2 className="titre-section mb-3">Ce que contient le fichier</h2>
        <ul className="space-y-2 text-sm text-white/70">
          <li>
            <span className="font-semibold text-white">suivi-dossiers.xlsx</span> — tous vos dossiers,
            ouvrable dans Excel ou LibreOffice.
          </li>
          <li>
            <span className="font-semibold text-white">factures.xlsx</span> — chaque facture avec ce
            qui a été encaissé et ce qui reste dû.
          </li>
          <li>
            <span className="font-semibold text-white">factures/*.pdf</span> — les factures telles
            qu&apos;elles ont été envoyées.
          </li>
          <li>
            <span className="font-semibold text-white">donnees/*.json</span> — la copie brute de
            chaque table, qui sert à une remise en service.
          </li>
        </ul>
        <p className="mt-3 rounded-lg border-2 border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
          Conservez ce fichier <span className="font-semibold">ailleurs</span> que sur l&apos;ordinateur
          du garage : clé USB, disque externe ou espace de stockage en ligne. Les pièces comptables
          doivent être gardées 10 ans.
        </p>
      </section>
    </div>
  );
}
