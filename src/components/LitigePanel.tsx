"use client";

// ============================================================
//  MODE LITIGE (v10.8, migration v60)
//
//  Un dossier bloqué (expert qui sursoit, assurance qui conteste, client
//  injoignable…) passe en LITIGE d'un clic depuis l'en-tête de la fiche.
//  Ce bloc apparaît alors avec :
//    · LE PROBLÈME — description libre, enregistrée toute seule ;
//    · POUR DÉBLOQUER — le plan d'action, enregistré tout seul ;
//    · LES TÂCHES du litige (avec ou sans date) — table `ardoise`
//      (origine 'litige') : visibles aussi dans « À faire » et la
//      Conversation, cochables partout.
//  Lever le litige CONSERVE les textes (historique si ça recommence).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, LigneArdoise } from "@/lib/types";
import { formatDate, messageErreur } from "@/lib/format";
import {
  ajouterRappel,
  basculerRappel,
  chargerRappels,
  estAujourdhui,
  estEnRetard,
  libelleEcheance,
  localVersIso,
  supprimerRappel,
} from "@/lib/ardoise";
import { lireRole } from "@/lib/conversation";
import ChampEcheance from "./ChampEcheance";

const ORIGINE_LITIGE = "litige";

export default function LitigePanel({
  dossier,
  onPatch,
  onLever,
}: {
  dossier: Dossier;
  /** Répercute un changement (textes) dans l'état de la fiche. */
  onPatch: (patch: Partial<Dossier>) => void;
  /** Lève le litige (bouton de l'en-tête et d'ici : même action). */
  onLever: () => void;
}) {
  const [probleme, setProbleme] = useState(dossier.litige_probleme || "");
  const [deblocage, setDeblocage] = useState(dossier.litige_deblocage || "");
  const [enregistre, setEnregistre] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [taches, setTaches] = useState<LigneArdoise[]>([]);
  const [texte, setTexte] = useState("");
  const [echeance, setEcheance] = useState("");
  const [pour, setPour] = useState<"" | "garage" | "secretaire">("secretaire");
  const [busy, setBusy] = useState(false);
  const [voirFaites, setVoirFaites] = useState(false);

  /* ------------------- Autosauvegarde des deux textes ------------------ */
  // Même recette que la note de dossier : 800 ms après la dernière frappe.
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enregistrerTextes = useCallback(
    async (p: string, d: string) => {
      const { error } = await supabase
        .from("dossiers")
        .update({ litige_probleme: p.trim() || null, litige_deblocage: d.trim() || null })
        .eq("id", dossier.id);
      if (error) {
        setErreur(messageErreur(error, "Enregistrement impossible (migration v60 exécutée ?)."));
        return;
      }
      setErreur(null);
      onPatch({ litige_probleme: p.trim() || null, litige_deblocage: d.trim() || null });
      setEnregistre("Enregistré ✓");
      setTimeout(() => setEnregistre(null), 2000);
    },
    [dossier.id, onPatch]
  );
  const planifier = useCallback(
    (p: string, d: string) => {
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => enregistrerTextes(p, d), 800);
    },
    [enregistrerTextes]
  );
  useEffect(() => () => {
    if (minuteur.current) clearTimeout(minuteur.current);
  }, []);

  /* ------------------------------ Tâches ------------------------------- */

  const charger = useCallback(async () => {
    const { lignes } = await chargerRappels(dossier.id);
    setTaches(lignes.filter((l) => l.origine === ORIGINE_LITIGE));
  }, [dossier.id]);
  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouter() {
    const t = texte.trim();
    if (!t || busy) return;
    setBusy(true);
    setErreur(null);
    try {
      const ligne = await ajouterRappel({
        texte: t,
        dossierId: dossier.id,
        echeance: localVersIso(echeance),
        ordre: Math.min(0, ...taches.map((l) => l.ordre)) - 1,
        auteur: lireRole(),
        pour: pour || null,
        origine: ORIGINE_LITIGE,
      });
      setTaches((prev) => [ligne, ...prev]);
      setTexte("");
      setEcheance("");
    } catch (err) {
      setErreur(messageErreur(err, "Tâche non ajoutée."));
    }
    setBusy(false);
  }

  async function cocher(ligne: LigneArdoise, fait: boolean) {
    setTaches((prev) => prev.map((x) => (x.id === ligne.id ? { ...x, fait } : x)));
    try {
      await basculerRappel(ligne, fait);
    } catch (err) {
      setTaches((prev) => prev.map((x) => (x.id === ligne.id ? { ...x, fait: !fait } : x)));
      setErreur(messageErreur(err, "Modification impossible."));
    }
  }

  async function supprimer(ligne: LigneArdoise) {
    setTaches((prev) => prev.filter((x) => x.id !== ligne.id));
    try {
      await supprimerRappel(ligne);
    } catch (err) {
      setErreur(messageErreur(err, "Suppression impossible."));
      charger();
    }
  }

  const aFaire = taches.filter((t) => !t.fait);
  const faites = taches.filter((t) => t.fait);

  /* -------------------------------- Rendu ------------------------------- */

  return (
    <section className="glass-card p-4" style={{ borderLeft: "8px solid #e11d48" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-pixel text-[0.5rem] text-rose-300">⚠ LITIGE EN COURS</span>
          {dossier.litige_depuis && (
            <span className="text-xs text-white/45">depuis le {formatDate(dossier.litige_depuis)}</span>
          )}
          {aFaire.length > 0 && <span className="badge badge-danger">{aFaire.length} tâche{aFaire.length > 1 ? "s" : ""}</span>}
          {enregistre && <span className="text-xs text-emerald-300/80">{enregistre}</span>}
        </div>
        <button
          onClick={onLever}
          className="btn-ghost btn-compact"
          title="Le blocage est résolu — les notes sont conservées"
        >
          ✓ Litige résolu
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label text-[11px]">Le problème</label>
          <textarea
            className="field-input w-full"
            rows={3}
            placeholder="Ex. l'expert fait surseoir les travaux, en attente du rapport définitif…"
            value={probleme}
            onChange={(e) => {
              setProbleme(e.target.value);
              planifier(e.target.value, deblocage);
            }}
            onBlur={() => enregistrerTextes(probleme, deblocage)}
          />
        </div>
        <div>
          <label className="field-label text-[11px]">Pour débloquer la situation</label>
          <textarea
            className="field-input w-full"
            rows={3}
            placeholder="Ex. appeler le cabinet, envoyer les photos complémentaires, relancer l'assurance…"
            value={deblocage}
            onChange={(e) => {
              setDeblocage(e.target.value);
              planifier(probleme, e.target.value);
            }}
            onBlur={() => enregistrerTextes(probleme, deblocage)}
          />
        </div>
      </div>

      {/* Tâches du litige */}
      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="flex gap-2">
          <input
            className="field-input field-compact flex-1"
            placeholder="Tâche pour débloquer… (avec ou sans date)"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                ajouter();
              }
            }}
          />
          <button onClick={ajouter} disabled={busy || !texte.trim()} className="btn-ghost btn-compact shrink-0">
            Ajouter
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-end gap-2 text-xs">
          <select
            className="field-input field-compact w-auto"
            value={pour}
            onChange={(e) => setPour(e.target.value as "" | "garage" | "secretaire")}
            title="Qui doit s'en occuper ?"
          >
            <option value="secretaire">Pour la secrétaire</option>
            <option value="garage">Pour le garage</option>
            <option value="">Pour tout le monde</option>
          </select>
          <ChampEcheance valeur={echeance} onChange={setEcheance} />
        </div>

        {aFaire.length > 0 && (
          <ul className="mt-2 divide-y divide-white/10">
            {aFaire.map((ligne) => {
              const retard = estEnRetard(ligne.echeance);
              const auj = estAujourdhui(ligne.echeance);
              return (
                <li key={ligne.id} className="flex min-w-0 items-start gap-2.5 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => cocher(ligne, true)}
                    className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block break-words text-white/85">{ligne.texte}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {ligne.pour && (
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            ligne.pour === "secretaire" ? "bg-teal-100 text-teal-700" : "bg-violet-100 text-violet-700"
                          }`}
                        >
                          {ligne.pour === "secretaire" ? "Secrétaire" : "Garage"}
                        </span>
                      )}
                      {ligne.echeance && (
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            retard ? "bg-rose-100 text-rose-700" : auj ? "bg-amber-100 text-amber-700" : "bg-white/10 text-white/70"
                          }`}
                        >
                          {retard ? "En retard · " : ""}
                          {libelleEcheance(ligne.echeance)}
                        </span>
                      )}
                    </span>
                  </div>
                  <button onClick={() => supprimer(ligne)} className="shrink-0 text-white/30 hover:text-rose-300" title="Supprimer">
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {faites.length > 0 && (
          <div className="mt-1">
            <button onClick={() => setVoirFaites((v) => !v)} className="text-xs text-emerald-300/80 hover:underline">
              {voirFaites ? "Masquer" : "Voir"} les {faites.length} faite{faites.length > 1 ? "s" : ""}
            </button>
            {voirFaites && (
              <ul className="mt-1 divide-y divide-white/5 opacity-60">
                {faites.map((ligne) => (
                  <li key={ligne.id} className="flex items-start gap-2.5 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked
                      onChange={() => cocher(ligne, false)}
                      className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
                      title="Décocher (remettre à faire)"
                    />
                    <span className="min-w-0 flex-1 break-words text-white/60 line-through">{ligne.texte}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="mt-2 text-[11px] text-white/35">
          Ces tâches apparaissent aussi dans « À faire » (tableau de bord) et la 💬 Conversation.
        </p>
      </div>

      {erreur && (
        <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
          {erreur}
        </div>
      )}
    </section>
  );
}
