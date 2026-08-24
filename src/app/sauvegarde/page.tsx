"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatDateTime, messageErreur } from "@/lib/format";
import {
  DELAI_SAUVEGARDE_JOURS,
  joursDepuisSauvegarde,
  poidsLisible,
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

  useEffect(() => {
    (async () => {
      const [ent, d, f, p] = await Promise.all([
        supabase.from("entreprise").select("id,derniere_sauvegarde").limit(1).maybeSingle(),
        supabase.from("dossiers").select("id", { count: "exact", head: true }),
        supabase.from("documents").select("id", { count: "exact", head: true }).eq("type", "facture"),
        supabase.from("pieces_dossier").select("id", { count: "exact", head: true }),
      ]);
      const e = ent.data as { id?: string; derniere_sauvegarde?: string } | null;
      setEntrepriseId(e?.id || null);
      setDerniere(e?.derniere_sauvegarde || null);
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
        }${r.pdf ? ` (${r.pdf} PDF)` : ""}, ${poidsLisible(r.octets)}.`
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
  const aRefaire = sauvegardeARefaire(derniere);

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
        <div className="mb-5 rounded-lg border-2 border-amber-400/50 bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
          {jours === null
            ? "Vous n'avez jamais fait de sauvegarde. Cela prend une minute — faites-la maintenant."
            : `Votre dernière sauvegarde date de ${jours} jours. Au-delà de ${DELAI_SAUVEGARDE_JOURS} jours, refaites-en une.`}
        </div>
      )}

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
              Inclure les PDF des factures
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
