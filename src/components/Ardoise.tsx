"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { messageErreur } from "@/lib/format";

/**
 * ARDOISE (v7.2) — le pense-bête du garage, sur le tableau de bord.
 *
 * Des lignes libres qu'on coche une fois faites : « rappeler l'expert Dupont »,
 * « commander la peinture », « relancer AXA »… Rien à voir avec « À faire
 * aujourd'hui », qui est calculé automatiquement à partir des dossiers :
 * ici, c'est l'utilisateur qui écrit ce qu'il veut.
 */

type Ligne = {
  id: string;
  texte: string;
  fait: boolean;
  ordre: number;
  created_at: string;
};

export default function Ardoise() {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [texte, setTexte] = useState("");
  const [voirFaites, setVoirFaites] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [dispo, setDispo] = useState(true);

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from("ardoise")
      .select("id,texte,fait,ordre,created_at")
      .order("fait", { ascending: true })
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) {
      // Migration v38 pas encore passée : on masque le bloc plutôt que d'afficher une erreur.
      setDispo(false);
      return;
    }
    setLignes((data as Ligne[]) || []);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouter() {
    const t = texte.trim();
    if (!t || busy) return;
    setBusy(true);
    setErreur(null);
    // Nouvelle ligne en tête de liste.
    const ordre = Math.min(0, ...lignes.map((l) => l.ordre)) - 1;
    const { data, error } = await supabase
      .from("ardoise")
      .insert({ texte: t, ordre })
      .select("id,texte,fait,ordre,created_at")
      .single();
    setBusy(false);
    if (error) {
      setErreur(messageErreur(error, "Ligne non ajoutée (migration v38 exécutée ?)."));
      return;
    }
    setLignes((prev) => [data as Ligne, ...prev]);
    setTexte("");
  }

  async function cocher(l: Ligne) {
    const suivant = !l.fait;
    setLignes((prev) => prev.map((x) => (x.id === l.id ? { ...x, fait: suivant } : x)));
    const { error } = await supabase
      .from("ardoise")
      .update({ fait: suivant, fait_le: suivant ? new Date().toISOString() : null })
      .eq("id", l.id);
    if (error) {
      setLignes((prev) => prev.map((x) => (x.id === l.id ? { ...x, fait: l.fait } : x)));
      setErreur(messageErreur(error, "Modification impossible."));
    }
  }

  async function supprimer(l: Ligne) {
    const avant = lignes;
    setLignes((prev) => prev.filter((x) => x.id !== l.id));
    const { error } = await supabase.from("ardoise").delete().eq("id", l.id);
    if (error) {
      setLignes(avant);
      setErreur(messageErreur(error, "Suppression impossible."));
    }
  }

  async function effacerFaites() {
    const faites = lignes.filter((l) => l.fait);
    if (faites.length === 0) return;
    if (!confirm(`Effacer les ${faites.length} ligne(s) cochée(s) de l'ardoise ?`)) return;
    const avant = lignes;
    setLignes((prev) => prev.filter((l) => !l.fait));
    const { error } = await supabase
      .from("ardoise")
      .delete()
      .in("id", faites.map((l) => l.id));
    if (error) {
      setLignes(avant);
      setErreur(messageErreur(error, "Suppression impossible."));
    }
  }

  if (!dispo) return null;

  const aFaire = lignes.filter((l) => !l.fait);
  const faites = lignes.filter((l) => l.fait);

  return (
    <section className="glass-card mb-3 p-3 sm:mb-4 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="titre-bloc">
          Ardoise
          {aFaire.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              {aFaire.length}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          {faites.length > 0 && (
            <button
              onClick={() => setVoirFaites((v) => !v)}
              className="text-xs text-emerald-300/80 hover:text-emerald-200 hover:underline"
            >
              {voirFaites ? "Masquer" : "Voir"} les {faites.length} cochée{faites.length > 1 ? "s" : ""}
            </button>
          )}
          <span className="font-pixel text-[0.5rem] text-white/40">PENSE-BÊTE</span>
        </div>
      </div>

      {/* Saisie */}
      <div className="mb-2 flex gap-2">
        <input
          className="field-input flex-1"
          placeholder="Noter quelque chose… (rappeler un expert, commander une pièce…)"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ajouter();
            }
          }}
        />
        <button onClick={ajouter} disabled={busy || !texte.trim()} className="btn-ghost shrink-0">
          Ajouter
        </button>
      </div>

      {/* Lignes à faire */}
      {aFaire.length === 0 && faites.length === 0 && (
        <p className="py-2 text-sm text-white/40">
          Ardoise vide. Écris ci-dessus ce que tu ne veux pas oublier — coche-le une fois fait.
        </p>
      )}
      <ul className="divide-y divide-white/5">
        {aFaire.map((l) => (
          <li key={l.id} className="flex items-start gap-2 py-1.5 text-sm">
            <input
              type="checkbox"
              checked={false}
              onChange={() => cocher(l)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
            />
            <span className="min-w-0 flex-1 break-words text-white/85">{l.texte}</span>
            <button
              onClick={() => supprimer(l)}
              className="shrink-0 text-white/30 hover:text-rose-300"
              title="Supprimer"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {/* Lignes cochées (repliées par défaut) */}
      {voirFaites && faites.length > 0 && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <ul className="divide-y divide-white/5">
            {faites.map((l) => (
              <li key={l.id} className="flex items-start gap-2 py-1.5 text-sm opacity-50">
                <input
                  type="checkbox"
                  checked
                  onChange={() => cocher(l)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
                />
                <span className="min-w-0 flex-1 break-words text-white/80 line-through">{l.texte}</span>
                <button
                  onClick={() => supprimer(l)}
                  className="shrink-0 text-white/30 hover:text-rose-300"
                  title="Supprimer"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={effacerFaites}
            className="mt-2 text-xs text-white/40 hover:text-rose-300 hover:underline"
          >
            Effacer toutes les lignes cochées
          </button>
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
