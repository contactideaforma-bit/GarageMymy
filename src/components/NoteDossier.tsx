"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { messageErreur } from "@/lib/format";

/**
 * NOTE LIBRE DU DOSSIER (v7.2).
 *
 * Un bouton rond en bas à droite de l'écran ouvre un bloc-notes rattaché au
 * sinistre : rappels, échanges téléphoniques, points de vigilance… Un clic en
 * dehors du panneau (ou sur la croix, ou Échap) le réduit à nouveau en bouton.
 *
 * L'enregistrement est AUTOMATIQUE (à l'arrêt de la frappe et à la fermeture) :
 * pas de bouton « Enregistrer » à oublier.
 */
export default function NoteDossier({
  dossierId,
  noteInitiale,
}: {
  dossierId: string;
  noteInitiale?: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState(noteInitiale || "");
  const [etat, setEtat] = useState<"repos" | "encours" | "ok" | "erreur">("repos");
  const [erreur, setErreur] = useState<string | null>(null);
  const zoneRef = useRef<HTMLTextAreaElement>(null);
  const dernierEnregistre = useRef(noteInitiale || "");
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const { error } = await supabase
        .from("dossiers")
        .update({ note: valeur || null, note_maj: new Date().toISOString() })
        .eq("id", dossierId);
      if (error) {
        setEtat("erreur");
        setErreur(messageErreur(error, "Note non enregistrée (migration v38 exécutée ?)."));
        return;
      }
      dernierEnregistre.current = valeur;
      setEtat("ok");
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
    zoneRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [ouvert, fermer]);

  const remplie = texte.trim().length > 0;

  /* ----------------------------- Bouton rond ----------------------------- */
  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition hover:brightness-110 active:translate-y-0.5 sm:bottom-6 sm:right-6"
        style={{ backgroundColor: "#ec4899", border: "2px solid #9d174d", boxShadow: "0 4px 0 #9d174d" }}
        title={remplie ? "Note du dossier (remplie)" : "Ajouter une note à ce dossier"}
        aria-label="Note du dossier"
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
      </button>
    );
  }

  /* ------------------------------- Panneau ------------------------------- */
  return (
    <>
      {/* Voile transparent : un clic n'importe où en dehors réduit la note. */}
      <div className="fixed inset-0 z-40" onMouseDown={fermer} aria-hidden />

      <div className="glass-card fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-md flex-col sm:bottom-6 sm:right-6">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <span className="titre-bloc">Note du dossier</span>
          <div className="flex items-center gap-2">
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

        <textarea
          ref={zoneRef}
          value={texte}
          onChange={(e) => saisir(e.target.value)}
          rows={9}
          placeholder="Rappels, échanges téléphoniques, points de vigilance… Tout ce qui compte sur ce dossier."
          className="field-input min-h-[9rem] resize-y rounded-none border-0 bg-transparent text-sm focus:shadow-none"
          style={{ borderColor: "transparent" }}
        />

        {erreur && (
          <div className="border-t border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
            {erreur}
          </div>
        )}
        <div className="border-t border-white/10 px-3 py-1.5 text-[11px] text-white/30">
          Enregistrement automatique — clique en dehors pour réduire.
        </div>
      </div>
    </>
  );
}
