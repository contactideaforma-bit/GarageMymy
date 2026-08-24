"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { ecrireOuEnfiler } from "@/lib/horsLigne";
import { messageErreur } from "@/lib/format";
import { LigneArdoise } from "@/lib/types";
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

/**
 * NOTE DU DOSSIER (v7.2, étendue en v41).
 *
 * Un bouton rond en bas à droite de la fiche sinistre ouvre DEUX choses,
 * utilisables ensemble :
 *
 *  1. LE COMMENTAIRE — un bloc-notes libre qui reste sur le dossier
 *     (échanges téléphoniques, points de vigilance…). Enregistrement
 *     AUTOMATIQUE : 800 ms après la dernière frappe, et à la fermeture.
 *
 *  2. LES RAPPELS — des lignes courtes qui remontent dans le bloc
 *     « À faire » du TABLEAU DE BORD, rattachées à ce dossier. Une date
 *     facultative crée en plus un rendez-vous dans l'AGENDA.
 *
 * Un clic en dehors du panneau (ou la croix, ou Échap) le réduit en bouton.
 */
export default function NoteDossier({
  dossierId,
  noteInitiale,
}: {
  dossierId: string;
  noteInitiale?: string | null;
}) {
  // ================================================================
  //  CADRAGE MOBILE (v8.7) — pourquoi tout ce code pour un panneau
  //
  //  Sur iPhone, ouvrir la note donnait le focus au textarea, donc le
  //  clavier montait. Or un élément `position: fixed` reste calé sur la
  //  fenêtre de mise en page (celle d'AVANT le clavier) : le panneau
  //  partait sous le clavier et débordait à droite — le « hors champ »
  //  signalé. Deux réponses :
  //
  //   1. sur téléphone, le panneau devient une FEUILLE PLEIN ÉCRAN
  //      positionnée sur la zone RÉELLEMENT visible, lue via
  //      `window.visualViewport` (largeur, hauteur et décalage réels,
  //      clavier compris). Plus aucun calcul de marge à se tromper ;
  //   2. le focus automatique est réservé au bureau : sur téléphone, le
  //      clavier ne s'ouvre que si l'utilisateur touche le champ.
  // ================================================================
  const [mobile, setMobile] = useState(false);
  const [zone, setZone] = useState<{ top: number; left: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const maj = () => setMobile(mq.matches);
    maj();
    mq.addEventListener("change", maj);
    return () => mq.removeEventListener("change", maj);
  }, []);

  // PORTAIL (v8.6) : le panneau était rendu DANS la fiche dossier, dont
  // les cartes créent un « containing block » (fond dégradé + animations).
  // Résultat : le `position: fixed` se calait sur la carte et le panneau
  // sortait de l'écran, sur mobile comme sur PC. On le sort donc sur
  // <body>, comme toutes les modales du projet (cf. ModalShell).
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);

  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState(noteInitiale || "");
  const [etat, setEtat] = useState<"repos" | "encours" | "ok" | "erreur">("repos");
  const [erreur, setErreur] = useState<string | null>(null);
  const zoneRef = useRef<HTMLTextAreaElement>(null);
  const dernierEnregistre = useRef(noteInitiale || "");
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Rappels rattachés à ce dossier (table `ardoise`) ---
  const [rappels, setRappels] = useState<LigneArdoise[]>([]);
  const [rappelsDispo, setRappelsDispo] = useState(true);
  const [nouveau, setNouveau] = useState("");
  const [echeance, setEcheance] = useState("");
  const [busy, setBusy] = useState(false);

  const chargerListe = useCallback(async () => {
    const { lignes, dispo } = await chargerRappels(dossierId);
    setRappelsDispo(dispo);
    setRappels(lignes);
  }, [dossierId]);

  // Chargés une fois, dès le montage : la pastille du bouton rond doit être
  // juste AVANT même d'ouvrir le panneau.
  useEffect(() => {
    chargerListe();
  }, [chargerListe]);

  // Le dossier peut se recharger (autre action sur la page) : on resynchronise
  // seulement si l'utilisateur n'a pas de modification en cours.
  useEffect(() => {
    const recu = noteInitiale || "";
    if (recu !== dernierEnregistre.current && texte === dernierEnregistre.current) {
      dernierEnregistre.current = recu;
      setTexte(recu);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteInitiale]);

  const enregistrer = useCallback(
    async (valeur: string) => {
      if (valeur === dernierEnregistre.current) return;
      setEtat("encours");
      setErreur(null);
      // MODE DÉGRADÉ (v47) : dans l'atelier, la connexion tombe souvent au
      // moment précis où l'on note quelque chose. L'écriture part si le
      // réseau répond, sinon elle est mise en file et rejouée toute seule.
      try {
        const partie = await ecrireOuEnfiler({
          table: "dossiers",
          type: "update",
          colonne: "id",
          valeur: dossierId,
          donnees: { note: valeur || null, note_maj: new Date().toISOString() },
          libelle: "Note de dossier",
        });
        dernierEnregistre.current = valeur;
        setEtat("ok");
        if (!partie) {
          setErreur("Hors ligne : la note est gardée sur cet appareil et partira au retour du réseau.");
        }
      } catch (error) {
        setEtat("erreur");
        setErreur(messageErreur(error, "Note non enregistrée (migration v38 exécutée ?)."));
      }
    },
    [dossierId]
  );

  // Enregistrement différé : 800 ms après la dernière frappe.
  function saisir(valeur: string) {
    setTexte(valeur);
    setEtat("encours");
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => enregistrer(valeur), 800);
  }

  const fermer = useCallback(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    enregistrer(texte);
    setOuvert(false);
  }, [enregistrer, texte]);

  // Échap ferme le panneau, comme un clic à l'extérieur.
  useEffect(() => {
    if (!ouvert) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    window.addEventListener("keydown", onKey);
    // Focus automatique BUREAU uniquement : sur téléphone il ferait monter
    // le clavier avant même que l'utilisateur ait vu le panneau.
    if (!mobile) zoneRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [ouvert, fermer, mobile]);

  // Zone visible du navigateur : recalculée à l'ouverture, quand le clavier
  // monte ou descend (`resize`), et quand iOS fait glisser la page sous le
  // clavier (`scroll`).
  useEffect(() => {
    if (!ouvert || !mobile) {
      setZone(null);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const maj = () =>
      setZone({ top: vv.offsetTop, left: vv.offsetLeft, w: vv.width, h: vv.height });
    maj();
    vv.addEventListener("resize", maj);
    vv.addEventListener("scroll", maj);
    return () => {
      vv.removeEventListener("resize", maj);
      vv.removeEventListener("scroll", maj);
    };
  }, [ouvert, mobile]);

  /* ------------------------------ Rappels ------------------------------ */

  async function ajouter() {
    const t = nouveau.trim();
    if (!t || busy) return;
    setBusy(true);
    setErreur(null);
    const ordre = Math.min(0, ...rappels.map((l) => l.ordre)) - 1;
    try {
      const ligne = await ajouterRappel({
        texte: t,
        dossierId,
        echeance: localVersIso(echeance),
        ordre,
      });
      setRappels((prev) => [ligne, ...prev]);
      setNouveau("");
      setEcheance("");
    } catch (err) {
      setErreur(messageErreur(err, "Rappel non ajouté (migrations v38 et v41 exécutées ?)."));
    }
    setBusy(false);
  }

  async function cocher(ligne: LigneArdoise, fait: boolean) {
    const avant = rappels;
    setRappels((prev) => prev.map((x) => (x.id === ligne.id ? { ...x, fait } : x)));
    try {
      await basculerRappel(ligne, fait);
    } catch (err) {
      setRappels(avant);
      setErreur(messageErreur(err, "Modification impossible."));
    }
  }

  async function retirer(ligne: LigneArdoise) {
    const avant = rappels;
    setRappels((prev) => prev.filter((x) => x.id !== ligne.id));
    try {
      await supprimerRappel(ligne);
    } catch (err) {
      setRappels(avant);
      setErreur(messageErreur(err, "Suppression impossible."));
    }
  }

  // « Reprendre la note » : on pré-remplit la saisie avec le commentaire
  // (tronqué), à raccourcir avant d'envoyer sur le tableau de bord.
  function reprendreLaNote() {
    const t = texte.trim().replace(/\s+/g, " ");
    if (!t) return;
    setNouveau(t.length > 200 ? `${t.slice(0, 197)}…` : t);
  }

  const remplie = texte.trim().length > 0;
  const actifs = rappels.filter((r) => !r.fait);
  const enRetard = actifs.some((r) => estEnRetard(r.echeance));

  /* ----------------------------- Bouton rond ----------------------------- */
  if (!monte) return null;

  if (!ouvert) {
    return createPortal(
      <button
        onClick={() => setOuvert(true)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition hover:brightness-110 active:translate-y-0.5 sm:bottom-6 sm:right-6"
        style={{ backgroundColor: "#ec4899", border: "2px solid #9d174d", boxShadow: "0 4px 0 #9d174d" }}
        title={
          actifs.length > 0
            ? `Note du dossier · ${actifs.length} rappel(s) en cours`
            : remplie
              ? "Note du dossier (remplie)"
              : "Ajouter une note ou un rappel à ce dossier"
        }
        aria-label="Note et rappels du dossier"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.3-.6L3 21l1.8-5.1A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {remplie && (
          <span
            className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2"
            style={{ backgroundColor: "#2dd4bf", borderColor: "#1d1836" }}
            aria-hidden
          />
        )}
        {actifs.length > 0 && (
          <span
            className="absolute -left-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold"
            style={{
              backgroundColor: enRetard ? "#e11d48" : "#f59e0b",
              color: "#1d1836",
              border: "2px solid #1d1836",
            }}
            aria-hidden
          >
            {actifs.length}
          </span>
        )}
      </button>,
      document.body
    );
  }

  /* ------------------------------- Panneau ------------------------------- */
  return createPortal(
    <>
      {/* Voile transparent : un clic n'importe où en dehors réduit la note. */}
      <div className="fixed inset-0 z-40" onMouseDown={fermer} aria-hidden />

      {/* Mobile : feuille PLEIN ÉCRAN sur la zone visible (clavier compris).
          PC : carte ancrée en bas à droite, largeur fixe. */}
      <div
        className={`glass-card fixed z-50 flex flex-col overflow-hidden ${
          mobile
            ? "inset-0 rounded-none border-x-0"
            : "bottom-6 right-6 max-h-[80vh] w-[26rem]"
        }`}
        style={
          mobile
            ? {
                // L'ombre portée « cartouche » n'a pas de sens en plein écran
                // et est écrite en CSS non utilitaire : on la coupe ici.
                boxShadow: "none",
                ...(zone
                  ? {
                      top: zone.top,
                      left: zone.left,
                      width: zone.w,
                      height: zone.h,
                      right: "auto",
                      bottom: "auto",
                    }
                  : {}),
              }
            : undefined
        }
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <span className="titre-bloc min-w-0 truncate">Note du dossier</span>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[11px] text-white/40">
              {etat === "encours" && "Enregistrement…"}
              {etat === "ok" && "Enregistré"}
              {etat === "erreur" && "Échec"}
            </span>
            <button
              onClick={fermer}
              className="rounded-md px-2 text-xl leading-none text-white/50 hover:text-white"
              title="Réduire la note"
              aria-label="Réduire"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* 1. Commentaire libre du dossier */}
          <div className="px-3 pt-2 text-[11px] uppercase tracking-wider text-white/40">
            Commentaire · reste sur ce dossier
          </div>
          <textarea
            ref={zoneRef}
            value={texte}
            onChange={(e) => saisir(e.target.value)}
            rows={6}
            placeholder="Rappels, échanges téléphoniques, points de vigilance… Tout ce qui compte sur ce dossier."
            className="field-input min-h-[7rem] resize-y rounded-none border-0 bg-transparent text-sm focus:shadow-none"
            style={{ borderColor: "transparent" }}
          />

          {/* 2. Rappels remontés au tableau de bord */}
          {rappelsDispo && (
            <div className="border-t border-white/10 px-3 py-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wider text-white/40">
                  Rappels · tableau de bord
                </span>
                {remplie && (
                  <button
                    onClick={reprendreLaNote}
                    className="text-[11px] text-accent-teal hover:underline"
                    title="Pré-remplir le rappel avec le commentaire ci-dessus"
                  >
                    Reprendre la note
                  </button>
                )}
              </div>

              {actifs.length === 0 && rappels.length === 0 && (
                <p className="mb-2 text-xs text-white/40">
                  Aucun rappel. Ce que tu écris ici apparaît dans « À faire » sur le tableau de bord.
                </p>
              )}

              <ul className="divide-y divide-white/5">
                {rappels.map((r) => {
                  const retard = !r.fait && estEnRetard(r.echeance);
                  const auj = !r.fait && estAujourdhui(r.echeance);
                  return (
                    <li key={r.id} className={`flex items-start gap-2 py-1.5 text-sm ${r.fait ? "opacity-50" : ""}`}>
                      <input
                        type="checkbox"
                        checked={r.fait}
                        onChange={(e) => cocher(r, e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block break-words text-white/85 ${r.fait ? "line-through" : ""}`}>
                          {r.texte}
                        </span>
                        {r.echeance && (
                          <span
                            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              retard
                                ? "bg-rose-100 text-rose-700"
                                : auj
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-white/10 text-white/70"
                            }`}
                          >
                            📅 {retard ? "En retard · " : ""}
                            {libelleEcheance(r.echeance)}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => retirer(r)}
                        className="shrink-0 text-white/30 hover:text-rose-300"
                        title="Supprimer ce rappel"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Saisie d'un rappel */}
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <input
                    className="field-input field-compact flex-1"
                    placeholder="Nouveau rappel…"
                    value={nouveau}
                    onChange={(e) => setNouveau(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        ajouter();
                      }
                    }}
                  />
                  <button
                    onClick={ajouter}
                    disabled={busy || !nouveau.trim()}
                    className="btn-ghost btn-compact shrink-0"
                  >
                    Ajouter
                  </button>
                </div>
                <label className="block text-[11px] text-white/45">
                  <span className="mb-1 block">📅 Agenda (optionnel)</span>
                  <input
                    type="datetime-local"
                    className="field-input field-compact w-full"
                    value={echeance}
                    onChange={(e) => setEcheance(e.target.value)}
                  />
                  {echeance && <span className="text-accent-teal">→ RDV créé dans l&apos;agenda</span>}
                </label>
              </div>
            </div>
          )}
        </div>

        {erreur && (
          <div className="border-t border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
            {erreur}
          </div>
        )}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-3 py-1.5 text-[11px] text-white/30">
          <span className="min-w-0 truncate">
            Commentaire enregistré automatiquement{mobile ? "." : " — clique en dehors pour réduire."}
          </span>
          {mobile && (
            <button onClick={fermer} className="btn-ghost btn-compact shrink-0">
              Fermer
            </button>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
