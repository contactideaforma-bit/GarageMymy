"use client";

// ============================================================
//  « Être rappelé » (v13.41) — petit formulaire disponible à TOUTES les
//  étapes de l'inscription en ligne (et sur la page merci). Il envoie une
//  demande de rappel à IDEAFORMA sans interrompre le parcours.
// ============================================================

import { useState } from "react";
import { lireReponse } from "@/lib/apiClient";
import { CRENEAUX_RAPPEL } from "@/lib/inscription";
import Ico from "@/components/Ico";

type Props = {
  /** Pré-remplissage depuis le parcours (modifiable). */
  defauts: { garage_nom?: string; contact_nom?: string; tel?: string; email?: string };
  etape: string;
  source_connaissance?: string | null;
  formule_conseillee?: string | null;
  /** Rendu compact (bouton qui déplie) ou ouvert. */
  ouvert?: boolean;
};

export default function DemandeRappel({ defauts, etape, source_connaissance, formule_conseillee, ouvert }: Props) {
  const [visible, setVisible] = useState(Boolean(ouvert));
  const [f, setF] = useState({ contact_nom: "", tel: "", creneau: "matin", message: "" });
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const tel = f.tel || defauts.tel || "";
  const nom = f.contact_nom || defauts.contact_nom || "";

  async function envoyer() {
    setErreur(null);
    if (tel.replace(/\D/g, "").length < 9) return setErreur("Indiquez un numéro de téléphone.");
    setEnvoi(true);
    try {
      const res = await fetch("/api/inscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rappel", tel, contact_nom: nom, garage_nom: defauts.garage_nom || "", email: defauts.email || "",
          creneau: f.creneau, message: f.message, etape, source_connaissance: source_connaissance || "", formule_conseillee: formule_conseillee || "",
        }),
      });
      const r = await lireReponse(res);
      if (!r.ok) throw new Error(r.error || "Envoi impossible.");
      setFait(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  if (fait) {
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <Ico n="check" /> C&apos;est noté : nous vous rappelons au {tel} {CRENEAUX_RAPPEL.find((c) => c.cle === f.creneau)?.label.toLowerCase()}. Vous pouvez continuer votre inscription ou attendre notre appel.
      </div>
    );
  }
  if (!visible) {
    return (
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <span>Une question, un doute sur la formule ? On vous rappelle quand vous voulez, sans engagement.</span>
        <button type="button" className="lp-btn-ghost !py-1.5 !text-sm" onClick={() => setVisible(true)}><Ico n="phone" /> Être rappelé</button>
      </div>
    );
  }
  return (
    <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-violet-900"><Ico n="phone" /> Être rappelé par My Easy Auto</div>
          <p className="mt-0.5 text-xs text-slate-600">Sans engagement. Nous vous appelons au créneau choisi, du lundi au vendredi.</p>
        </div>
        {!ouvert && <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setVisible(false)}>Fermer</button>}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Votre nom</label>
          <input className="lp-input" value={nom} onChange={(e) => setF((x) => ({ ...x, contact_nom: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Téléphone *</label>
          <input className="lp-input" type="tel" value={tel} onChange={(e) => setF((x) => ({ ...x, tel: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Quand ?</label>
          <select className="lp-input" value={f.creneau} onChange={(e) => setF((x) => ({ ...x, creneau: e.target.value }))}>
            {CRENEAUX_RAPPEL.map((c) => <option key={c.cle} value={c.cle}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Votre question (facultatif)</label>
          <input className="lp-input" value={f.message} onChange={(e) => setF((x) => ({ ...x, message: e.target.value }))} placeholder="ex. la formule Plus suffit-elle pour 30 dossiers / mois ?" />
        </div>
      </div>
      {erreur && <p className="mt-2 text-xs text-rose-700">{erreur}</p>}
      <div className="mt-3">
        <button type="button" className="lp-btn !py-2 !text-sm" onClick={envoyer} disabled={envoi}>{envoi ? "Envoi…" : "Demander à être rappelé"}</button>
      </div>
    </div>
  );
}
