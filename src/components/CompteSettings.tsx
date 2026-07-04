"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { messageErreur } from "@/lib/format";

/**
 * Mon compte : changer l'email de connexion et le mot de passe.
 * - Email : Supabase envoie des liens de confirmation (par sécurité, aux
 *   DEUX adresses — ancienne et nouvelle — selon la config du projet).
 * - Mot de passe : changement immédiat (session déjà authentifiée).
 */
export default function CompteSettings() {
  const [emailActuel, setEmailActuel] = useState<string | null>(null);

  // Changement d'email
  const [nouvelEmail, setNouvelEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);

  // Changement de mot de passe
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passMsg, setPassMsg] = useState<string | null>(null);
  const [passErr, setPassErr] = useState<string | null>(null);
  const [passSaving, setPassSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmailActuel(data.user?.email ?? null));
  }, []);

  async function changerEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    setEmailErr(null);
    if (!nouvelEmail.trim() || nouvelEmail.trim().toLowerCase() === (emailActuel || "").toLowerCase()) {
      setEmailErr("Saisis une adresse différente de l'actuelle.");
      return;
    }
    setEmailSaving(true);
    const { error } = await supabase.auth.updateUser(
      { email: nouvelEmail.trim() },
      { emailRedirectTo: `${window.location.origin}/` }
    );
    setEmailSaving(false);
    if (error) {
      setEmailErr(messageErreur(error, "Changement impossible."));
      return;
    }
    setEmailMsg(
      "Emails de confirmation envoyés. Clique sur le lien reçu (selon la config, sur l'ancienne ET la nouvelle adresse) pour valider le changement. Regarde aussi les spams."
    );
    setNouvelEmail("");
  }

  async function changerMotDePasse(e: React.FormEvent) {
    e.preventDefault();
    setPassMsg(null);
    setPassErr(null);
    if (pass.length < 8) {
      setPassErr("Choisis un mot de passe d'au moins 8 caractères.");
      return;
    }
    if (pass !== confirm) {
      setPassErr("Les deux mots de passe ne sont pas identiques.");
      return;
    }
    setPassSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    setPassSaving(false);
    if (error) {
      setPassErr(messageErreur(error, "Changement impossible."));
      return;
    }
    setPassMsg("Mot de passe modifié. Il sera demandé à ta prochaine connexion.");
    setPass("");
    setConfirm("");
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Email de connexion */}
      <form onSubmit={changerEmail} className="glass-soft p-4 space-y-3">
        <div className="font-semibold text-white text-sm">Email de connexion</div>
        <p className="text-xs text-white/50">
          Adresse actuelle : <span className="text-white/80">{emailActuel || "…"}</span>
        </p>
        <div>
          <label className="field-label">Nouvelle adresse</label>
          <input
            type="email"
            className="field-input"
            value={nouvelEmail}
            onChange={(e) => setNouvelEmail(e.target.value)}
            placeholder="nouvelle@adresse.fr"
            required
          />
        </div>
        {emailErr && (
          <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{emailErr}</div>
        )}
        {emailMsg && (
          <div className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200">{emailMsg}</div>
        )}
        <button type="submit" disabled={emailSaving} className="btn-ghost w-full justify-center">
          {emailSaving ? "Envoi…" : "Changer l'email"}
        </button>
      </form>

      {/* Mot de passe */}
      <form onSubmit={changerMotDePasse} className="glass-soft p-4 space-y-3">
        <div className="font-semibold text-white text-sm">Mot de passe</div>
        <div>
          <label className="field-label">Nouveau mot de passe</label>
          <input
            type="password"
            className="field-input"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div>
          <label className="field-label">Confirme le mot de passe</label>
          <input
            type="password"
            className="field-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        {passErr && (
          <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{passErr}</div>
        )}
        {passMsg && (
          <div className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200">{passMsg}</div>
        )}
        <button type="submit" disabled={passSaving} className="btn-ghost w-full justify-center">
          {passSaving ? "Enregistrement…" : "Changer le mot de passe"}
        </button>
      </form>
    </div>
  );
}
