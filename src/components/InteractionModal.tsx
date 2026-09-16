"use client";

// NOTER UN CONTACT (v12.9) — la modale du démarchage : canal, résultat en un
// clic, motif du refus, commentaire, date de rappel ou de RDV. En validant,
// la fiche prospect est mise à jour toute seule (statut, rappel, compteurs).

import { useState } from "react";
import ModalShell from "@/components/ModalShell";
import { messageErreur } from "@/lib/format";
import {
  CANAUX_CONTACT, CanalContact, MOTIFS_REFUS, MotifRefus, Prospect, RESULTATS_CONTACT, ResultatContact, DELAIS_RAPPEL, dateDansJours, enregistrerInteraction,
} from "@/lib/prospects";

const ORDRE_RESULTATS: ResultatContact[] = ["pas_repondu", "messagerie", "rappeler", "interesse", "rdv", "refus", "injoignable", "autre"];

export default function InteractionModal({ prospect, canalDefaut = "appel", onClose, onSaved }: {
  prospect: Prospect;
  canalDefaut?: CanalContact;
  onClose: () => void;
  onSaved: (p: Prospect) => void;
}) {
  const [canal, setCanal] = useState<CanalContact>(canalDefaut);
  const [resultat, setResultat] = useState<ResultatContact | null>(null);
  const [motif, setMotif] = useState<MotifRefus>("deja_equipe");
  const [commentaire, setCommentaire] = useState("");
  const [rappel, setRappel] = useState("");
  const [rdvDate, setRdvDate] = useState("");
  const [rdvHeure, setRdvHeure] = useState("08:30");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const r = resultat ? RESULTATS_CONTACT[resultat] : null;

  async function valider() {
    if (!resultat) return setErr("Choisissez le résultat du contact.");
    if (resultat === "rdv" && !rdvDate) return setErr("Indiquez la date du rendez-vous.");
    setBusy(true); setErr(null);
    try {
      const { prospect: p } = await enregistrerInteraction(prospect, {
        canal,
        resultat,
        motif_refus: resultat === "refus" ? motif : null,
        commentaire: commentaire.trim() || null,
        prochaine_date: r?.rappelJours != null ? rappel || dateDansJours(r.rappelJours) : null,
        rdv_le: resultat === "rdv" && rdvDate ? new Date(`${rdvDate}T${rdvHeure || "08:30"}:00`).toISOString() : null,
      });
      onSaved(p);
    } catch (e) { setErr(messageErreur(e, "Enregistrement impossible (migration v71 ?).")); } finally { setBusy(false); }
  }

  return (
    <ModalShell title={`Noter un contact — ${prospect.nom}`} onClose={onClose} maxWidth="max-w-xl">
      {prospect.tel && (
        <a href={`tel:${prospect.tel.replace(/\s/g, "")}`} className="glass-soft flex items-center justify-between px-3 py-2 text-sm">
          <span>📞 {prospect.tel}{prospect.contact_nom || prospect.gerant ? ` · ${prospect.contact_nom || prospect.gerant}` : ""}</span>
          <span className="text-xs text-accent-teal">Appeler</span>
        </a>
      )}

      <div>
        <label className="field-label">Canal</label>
        <div className="segment flex-wrap">
          {(Object.keys(CANAUX_CONTACT) as CanalContact[]).map((c) => (
            <button key={c} className={`segment-btn ${canal === c ? "actif" : ""}`} onClick={() => setCanal(c)}>{CANAUX_CONTACT[c].icone} {CANAUX_CONTACT[c].label}</button>
          ))}
        </div>
      </div>

      <div>
        <label className="field-label">Résultat</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ORDRE_RESULTATS.map((k) => {
            const x = RESULTATS_CONTACT[k];
            const actif = resultat === k;
            return (
              <button key={k} onClick={() => setResultat(k)} className={`rounded-xl border px-2 py-2 text-left text-sm transition ${actif ? "border-accent-pink bg-accent-pink/15 text-white" : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"}`}>
                <span className="block font-medium">{x.label}</span>
              </button>
            );
          })}
        </div>
        {r && <p className="mt-1 text-xs text-white/50">{r.aide}</p>}
      </div>

      {resultat === "refus" && (
        <div>
          <label className="field-label">Pourquoi non ?</label>
          <select className="field-input" value={motif} onChange={(e) => setMotif(e.target.value as MotifRefus)}>
            {(Object.keys(MOTIFS_REFUS) as MotifRefus[]).map((m) => <option key={m} value={m}>{MOTIFS_REFUS[m]}</option>)}
          </select>
        </div>
      )}

      {resultat === "rdv" && (
        <div className="grid grid-cols-2 gap-2">
          <div><label className="field-label">Date du RDV</label><input type="date" className="field-input" value={rdvDate} onChange={(e) => setRdvDate(e.target.value)} /></div>
          <div><label className="field-label">Heure</label><input type="time" className="field-input" value={rdvHeure} onChange={(e) => setRdvHeure(e.target.value)} /></div>
        </div>
      )}

      {r && r.rappelJours != null && (
        <div>
          <label className="field-label">Rappeler le</label>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className="field-input field-compact w-auto" value={rappel || dateDansJours(r.rappelJours)} onChange={(e) => setRappel(e.target.value)} />
            {DELAIS_RAPPEL.map((d) => (
              <button key={d.jours} className="btn-ghost btn-compact" onClick={() => setRappel(dateDansJours(d.jours))}>{d.label}</button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="field-label">Ce qu&apos;il a dit (optionnel)</label>
        <textarea className="field-input" rows={2} placeholder={resultat === "refus" ? "ex. : « on a Alpha Scale, ça nous suffit »" : "ex. : rappeler après les congés, demander Madame Martin"} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
      </div>

      {err && <p className="text-sm text-rose-300">{err}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={valider} disabled={busy || !resultat}>{busy ? "…" : "Enregistrer"}</button>
      </div>
    </ModalShell>
  );
}
