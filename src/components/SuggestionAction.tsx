"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { ActionFaite, Dossier, LigneArdoise } from "@/lib/types";
import { messageErreur } from "@/lib/format";
import { ProchaineAction, URGENCE_STYLE } from "@/lib/actions";
import { ajouterRappel, chargerRappels, localVersIso, supprimerRappel } from "@/lib/ardoise";
import { annulerActionFaite, marquerActionFaite } from "@/lib/aFaire";
import { lireRole } from "@/lib/conversation";

/**
 * SUGGESTION DE TÂCHE (v10.7) — remplace la bannière « Prochaine action ».
 *
 * Sur le terrain, rien ne part sans le feu vert du chef d'atelier, chaque
 * garage a sa procédure (devis, OR, ou facture directe) et les aléas
 * s'accumulent : les tâches AUTOMATIQUES du tableau de bord étaient des
 * parasites. Le moteur `calculeProchaineAction` reste, mais il ne fait plus
 * que SUGGÉRER ici, dans la fiche :
 *   · « Programmer »  → crée une vraie tâche (échéance facultative, pour la
 *     secrétaire ou le garage) visible dans « À faire » et la Conversation ;
 *   · « Ignorer »     → la suggestion se replie (elle se réaffiche d'un clic,
 *     et revient d'elle-même quand le dossier avance : marque actions_faites).
 * Rien n'apparaît au tableau de bord tant qu'on n'a pas cliqué « Programmer ».
 */
export default function SuggestionAction({
  dossier,
  action,
  avecCta = true,
}: {
  dossier: Dossier;
  action: ProchaineAction | null;
  avecCta?: boolean;
}) {
  const [rappels, setRappels] = useState<LigneArdoise[]>([]);
  const [faites, setFaites] = useState<ActionFaite[]>([]);
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Formulaire « Programmer »
  const [ouvert, setOuvert] = useState(false);
  const [echeance, setEcheance] = useState("");
  const [pour, setPour] = useState<"" | "garage" | "secretaire">("secretaire");
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    const [{ lignes }, af] = await Promise.all([
      chargerRappels(dossier.id),
      supabase.from("actions_faites").select("*").eq("dossier_id", dossier.id),
    ]);
    setRappels(lignes);
    setFaites((af.data as ActionFaite[]) || []);
    setPret(true);
  }, [dossier.id]);

  useEffect(() => {
    charger();
  }, [charger]);

  if (!action) return null;

  const origine = `suggestion:${action.code}`;
  const tacheProgrammee = rappels.find((r) => r.origine === origine && !r.fait) || null;
  const ignoree = faites.some((f) => f.code === action.code);
  const st = URGENCE_STYLE[action.urgence];

  async function programmer() {
    if (!action || busy) return;
    setBusy(true);
    setErreur(null);
    try {
      const ligne = await ajouterRappel({
        texte: action.titre,
        dossierId: dossier.id,
        echeance: localVersIso(echeance),
        auteur: lireRole(),
        pour: pour || null,
        origine,
      });
      setRappels((prev) => [ligne, ...prev]);
      setOuvert(false);
      setEcheance("");
    } catch (err) {
      setErreur(messageErreur(err, "Tâche non programmée (migrations v38/v41 exécutées ?)."));
    }
    setBusy(false);
  }

  async function annulerProgrammation() {
    if (!tacheProgrammee) return;
    try {
      await supprimerRappel(tacheProgrammee);
      setRappels((prev) => prev.filter((x) => x.id !== tacheProgrammee.id));
    } catch (err) {
      setErreur(messageErreur(err, "Impossible d'annuler."));
    }
  }

  async function ignorer() {
    if (!action) return;
    try {
      const ligne = await marquerActionFaite(dossier.id, action.code);
      setFaites((prev) => [...prev, ligne]);
    } catch (err) {
      setErreur(messageErreur(err, "Impossible d'ignorer (migration v35 exécutée ?)."));
    }
  }

  async function reafficher() {
    if (!action) return;
    try {
      await annulerActionFaite(dossier.id, action.code);
      setFaites((prev) => prev.filter((f) => f.code !== action.code));
    } catch (err) {
      setErreur(messageErreur(err, "Impossible de ré-afficher."));
    }
  }

  // Suggestion ignorée : une seule ligne discrète, récupérable d'un clic.
  if (pret && ignoree && !tacheProgrammee) {
    return (
      <section className="glass-soft flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm">
        <span className="text-white/45">
          Suggestion ignorée : <span className="text-white/60">{action.titre}</span>
        </span>
        <button onClick={reafficher} className="text-xs text-accent-teal hover:underline">
          Ré-afficher
        </button>
      </section>
    );
  }

  return (
    <section
      className="glass-card p-4"
      style={{ borderLeft: `8px solid ${tacheProgrammee ? "#10b981" : st.couleur}` }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[16rem] flex-1">
          <div className="flex items-center gap-2">
            <span className="font-pixel text-[0.5rem] text-white/50">SUGGESTION</span>
            {tacheProgrammee ? (
              <span className="badge badge-ok">Programmée ✓</span>
            ) : (
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${st.badge}`}>
                {st.label}
              </span>
            )}
          </div>
          <div className="mt-1 break-words font-semibold text-white">{action.titre}</div>
          {action.detail && <div className="break-words text-sm text-white/60">{action.detail}</div>}
          {tacheProgrammee && (
            <div className="mt-1 text-xs text-white/45">
              Dans le bloc « À faire »{tacheProgrammee.pour ? ` (${tacheProgrammee.pour === "secretaire" ? "pour la secrétaire" : "pour le garage"})` : ""} et la 💬 Conversation.
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {tacheProgrammee ? (
            <button onClick={annulerProgrammation} className="btn-ghost btn-compact" title="Retirer la tâche du bloc À faire">
              Annuler
            </button>
          ) : (
            <>
              <button onClick={() => setOuvert((v) => !v)} className="btn-primary" disabled={!pret}>
                Programmer
              </button>
              <button onClick={ignorer} className="btn-ghost btn-compact" title="Masquer cette suggestion (elle reviendra quand le dossier avancera)">
                Ignorer
              </button>
            </>
          )}
          {avecCta && !tacheProgrammee && (
            <Link href={action.href} className="btn-ghost btn-compact shrink-0">
              {action.ctaLabel}
            </Link>
          )}
        </div>
      </div>

      {ouvert && !tacheProgrammee && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border-2 border-white/10 bg-white/5 p-2.5">
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
          <label className="inline-flex items-center gap-1.5 text-xs text-white/45">
            📅
            <input
              type="datetime-local"
              className="field-input field-compact w-auto"
              value={echeance}
              onChange={(e) => setEcheance(e.target.value)}
              title="Échéance (facultative) — crée un rendez-vous dans l'agenda"
            />
          </label>
          <button onClick={programmer} disabled={busy} className="btn-ghost btn-compact">
            {busy ? "…" : "Ajouter à « À faire »"}
          </button>
          <span className="text-[11px] text-white/40">Sans date, la tâche reste un pense-bête.</span>
        </div>
      )}

      {erreur && (
        <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
          {erreur}
        </div>
      )}
    </section>
  );
}
