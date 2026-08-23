"use client";

import { useEffect, useState } from "react";
import ModalShell from "./ModalShell";
import { supabase } from "@/lib/supabaseClient";
import { messageErreur } from "@/lib/format";
import {
  CATEGORIES_TICKET,
  GRAVITES_TICKET,
  contexteTechnique,
  creerTicket,
} from "@/lib/support";
import { Ticket } from "@/lib/types";

/**
 * SIGNALER UN PROBLÈME (v43).
 *
 * Trois idées derrière ce formulaire :
 *   1. On ne demande RIEN de technique : page, navigateur et version sont
 *      captés tout seuls (le carrossier ne devrait pas avoir à les chercher).
 *   2. La gravité est exprimée en français de garage — « je ne peux pas
 *      travailler » plutôt que « criticité P1 ».
 *   3. Le contact est pré-rempli depuis le profil du garage : un ticket
 *      auquel on ne peut pas répondre ne sert à rien.
 */
export default function TicketModal({
  onFerme,
  onCree,
}: {
  onFerme: () => void;
  onCree: (t: Ticket) => void;
}) {
  const [categorie, setCategorie] = useState<string>("bug");
  const [gravite, setGravite] = useState<string>("gene");
  const [sujet, setSujet] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [garage, setGarage] = useState("");
  const [detailsOuverts, setDetailsOuverts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const ctx = contexteTechnique();

  // Pré-remplissage : profil du garage puis, à défaut, email du compte.
  useEffect(() => {
    (async () => {
      const { data: ent } = await supabase
        .from("entreprise")
        .select("nom,email,tel")
        .limit(1)
        .maybeSingle();
      const e = ent as { nom?: string; email?: string; tel?: string } | null;
      if (e?.nom) setGarage(e.nom);
      if (e?.tel) setTel(e.tel);
      if (e?.email) setEmail(e.email);
      else {
        const { data } = await supabase.auth.getUser();
        if (data.user?.email) setEmail(data.user.email);
      }
    })();
  }, []);

  async function envoyer() {
    if (busy) return;
    if (!sujet.trim() || !description.trim()) {
      setErreur("Indique un titre court et décris le problème.");
      return;
    }
    setBusy(true);
    setErreur(null);
    try {
      const t = await creerTicket({
        sujet,
        description,
        categorie,
        gravite,
        contact_email: email || null,
        contact_tel: tel || null,
        garage_nom: garage || null,
      });
      onCree(t);
    } catch (err) {
      setErreur(messageErreur(err, "Ticket non envoyé (migration v43 exécutée ?)."));
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Signaler un problème" onClose={onFerme} maxWidth="max-w-2xl">
      {/* 1. De quoi s'agit-il */}
      <div>
        <label className="field-label">De quoi s&apos;agit-il ?</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CATEGORIES_TICKET.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCategorie(c.code)}
              className={`flex items-center gap-2.5 rounded-lg border-2 px-3 py-2 text-left text-sm transition ${
                categorie === c.code
                  ? "border-accent-pink bg-white/10 font-semibold text-white"
                  : "border-white/10 text-white/70 hover:bg-white/5"
              }`}
            >
              <span className="text-lg leading-none">{c.icone}</span>
              <span className="min-w-0">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Gravité */}
      <div>
        <label className="field-label">Est-ce que ça vous empêche de travailler ?</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {GRAVITES_TICKET.map((g) => (
            <button
              key={g.code}
              type="button"
              onClick={() => setGravite(g.code)}
              className={`rounded-lg border-2 px-3 py-2 text-left transition ${
                gravite === g.code
                  ? "border-accent-pink bg-white/10"
                  : "border-white/10 hover:bg-white/5"
              }`}
            >
              <span className="block text-sm font-semibold text-white">{g.label}</span>
              <span className="mt-0.5 block text-[11px] text-white/50">{g.detail}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Le problème */}
      <div>
        <label className="field-label">En une phrase</label>
        <input
          className="field-input"
          maxLength={140}
          placeholder="Ex. : le PDF de la facture s'ouvre vide"
          value={sujet}
          onChange={(e) => setSujet(e.target.value)}
        />
      </div>

      <div>
        <label className="field-label">Qu&apos;est-ce qui s&apos;est passé ?</label>
        <textarea
          className="field-input min-h-[130px]"
          placeholder={
            "Racontez simplement :\n· ce que vous faisiez (ex. : j'ai cliqué sur PDF depuis le dossier 24-1187)\n· ce que vous attendiez\n· ce qui s'est affiché à la place"
          }
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="mt-1 text-[11px] text-white/45">
          Plus c&apos;est précis, plus la correction est rapide. Le numéro de dossier concerné aide beaucoup.
        </p>
      </div>

      {/* 4. Contact */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label">Email pour la réponse</label>
          <input
            className="field-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Téléphone (si urgent)</label>
          <input
            className="field-input"
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            placeholder="06…"
          />
        </div>
      </div>

      {/* 5. Contexte capté automatiquement */}
      <div className="glass-soft rounded-lg p-3">
        <button
          type="button"
          onClick={() => setDetailsOuverts((v) => !v)}
          className="flex w-full items-center justify-between text-left text-xs text-white/60 hover:text-white"
        >
          <span>🔒 Informations techniques jointes automatiquement</span>
          <span>{detailsOuverts ? "−" : "+"}</span>
        </button>
        {detailsOuverts && (
          <ul className="mt-2 space-y-1 text-[11px] text-white/50">
            <li>Page : {ctx.page || "—"}</li>
            <li>Version de l&apos;appli : v{ctx.version_app}</li>
            <li className="break-words">Appareil : {ctx.navigateur || "—"}</li>
            <li className="text-white/40">
              Aucune donnée de vos dossiers n&apos;est transmise.
            </li>
          </ul>
        )}
      </div>

      {erreur && (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
          {erreur}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button onClick={onFerme} className="btn-ghost">
          Annuler
        </button>
        <button onClick={envoyer} disabled={busy} className="btn-primary">
          {busy ? "Envoi…" : "Envoyer le signalement"}
        </button>
      </div>
    </ModalShell>
  );
}
