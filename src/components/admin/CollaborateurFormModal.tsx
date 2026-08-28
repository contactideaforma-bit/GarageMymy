"use client";

// FORMULAIRE COLLABORATEUR (v10.6) — partagé entre la liste
// (/admin/collaborateurs) et la fiche (/admin/collaborateurs/[id]).
// Pour un commercial : possibilité de créer DIRECTEMENT son compte
// My Easy Auto depuis la création de la fiche (plus de passage par
// Supabase → Authentication).

import { useState } from "react";
import ModalShell from "@/components/ModalShell";
import { ChampAdmin } from "@/components/admin/AdminShell";
import { Collaborateur, CompteAuth, creerCompteCollaborateur, definirMetierCompte, upsertLigne } from "@/lib/admin/client";

/** Code apporteur lisible : 2 lettres du nom + 4 chiffres (ex. DU4821). */
export function genererCode(nom: string): string {
  const lettres = (nom || "XX").normalize("NFD").replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase().padEnd(2, "X");
  return `${lettres}${String(Math.floor(1000 + Math.random() * 9000))}`;
}

export default function CollaborateurFormModal({
  initial,
  comptes,
  onClose,
  onSaved,
}: {
  initial: Partial<Collaborateur>;
  comptes: CompteAuth[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Collaborateur>>({ ...initial });
  const [saving, setSaving] = useState(false);
  const [creerCompte, setCreerCompte] = useState(false);
  const set = <K extends keyof Collaborateur>(k: K, v: Collaborateur[K]) => setForm((f) => ({ ...(f || {}), [k]: v }));

  async function enregistrer() {
    if (!form?.nom?.trim()) return alert("Le nom est obligatoire.");
    if (creerCompte && !form.email?.trim()) return alert("Renseigne l'email perso du commercial pour créer son compte.");
    setSaving(true);
    try {
      const res = await upsertLigne<Collaborateur>("collaborateurs", {
        ...form,
        taux_horaire: form.taux_horaire == null || form.taux_horaire === ("" as unknown) ? null : Number(form.taux_horaire),
      });
      if ((res as { metierPose?: string | null }).metierPose === "commercial") {
        alert("Le compte rattaché est maintenant en métier « commercial ». Sur ce compte : se déconnecter puis se reconnecter (ou recharger la page).");
      }
      // Création directe du compte commercial (v10.6) — depuis l'email perso saisi.
      if (creerCompte && form.type === "commercial") {
        const id = (res as { row?: Collaborateur }).row?.id || form.id;
        if (id) {
          try {
            const r = await creerCompteCollaborateur(id, form.email || undefined);
            if (r.dejaExistant) alert("Un compte existait déjà avec cet email : il a été rattaché à la fiche et passé en métier « commercial ».");
            else if (r.emailEnvoye) alert("Compte commercial créé ✔ — l'email de bienvenue (identifiants) vient de partir.");
            else alert(`Compte créé, mais l'email de bienvenue n'est pas parti (${r.erreurEmail || "envoi impossible"}).\nMot de passe provisoire à transmettre : ${r.motDePasse || "—"}`);
          } catch (e) {
            alert(`Fiche enregistrée, mais création du compte impossible : ${e instanceof Error ? e.message : "erreur"}`);
          }
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={form.id ? "Modifier le collaborateur" : "Nouveau collaborateur"} onClose={onClose} maxWidth="max-w-2xl">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ChampAdmin label="Type"><select className="field-input" value={form.type} onChange={(e) => set("type", e.target.value as Collaborateur["type"])}><option value="commercial">Commercial (apporteur d&apos;affaires)</option><option value="secretaire">Secrétaire</option></select></ChampAdmin>
        <ChampAdmin label="Statut"><select className="field-input" value={form.statut} onChange={(e) => set("statut", e.target.value as Collaborateur["statut"])}><option value="actif">Actif</option><option value="pause">En pause</option><option value="termine">Terminé</option></select></ChampAdmin>
        <ChampAdmin label="Nom *"><input className="field-input" value={form.nom || ""} onChange={(e) => set("nom", e.target.value)} /></ChampAdmin>
        <ChampAdmin label="Prénom"><input className="field-input" value={form.prenom || ""} onChange={(e) => set("prenom", e.target.value)} /></ChampAdmin>
        <ChampAdmin label={form.type === "commercial" ? "Email perso (compte + contact)" : "Email"}><input className="field-input" type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} /></ChampAdmin>
        <ChampAdmin label="Téléphone"><input className="field-input" value={form.tel || ""} onChange={(e) => set("tel", e.target.value)} /></ChampAdmin>
        <ChampAdmin label="SIRET"><input className="field-input" value={form.siret || ""} onChange={(e) => set("siret", e.target.value)} /></ChampAdmin>
        {form.type === "commercial" && !form.owner_id && (
          <ChampAdmin label="Compte My Easy Auto">
            <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
              <input type="checkbox" checked={creerCompte} onChange={(e) => setCreerCompte(e.target.checked)} />
              Créer directement son compte commercial (email perso ci-dessus)
            </label>
            <p className="mt-1 text-xs text-white/40">Le compte est créé avec un mot de passe provisoire et l&apos;email de bienvenue part aussitôt — plus besoin de Supabase.</p>
          </ChampAdmin>
        )}
        {form.type === "commercial" && form.owner_id && (
          <ChampAdmin label="Compte My Easy Auto du commercial">
            <div className="flex gap-2">
              <select className="field-input" value={form.owner_id || ""} onChange={(e) => set("owner_id", e.target.value || null)}>
                <option value="">— aucun compte —</option>
                {comptes.map((c) => <option key={c.id} value={c.id}>{c.email}</option>)}
              </select>
              <button
                type="button"
                className="btn-ghost btn-compact shrink-0"
                disabled={!form.owner_id}
                title="Pose metier = commercial sur ce compte (il doit ensuite se déconnecter / reconnecter)"
                onClick={async () => {
                  try {
                    await definirMetierCompte(form.owner_id!, "commercial");
                    alert("Compte passé en métier « commercial ». Il doit se déconnecter puis se reconnecter.");
                  } catch (e) { alert(e instanceof Error ? e.message : "Impossible."); }
                }}
              >
                Rendre commercial
              </button>
            </div>
          </ChampAdmin>
        )}
        {form.type === "commercial" && (
          <>
            <ChampAdmin label="Zone attribuée (départements, villes…)"><input className="field-input" value={form.zone || ""} onChange={(e) => set("zone", e.target.value)} placeholder="ex. 92, 78 nord, Nanterre – Rueil – Suresnes" /></ChampAdmin>
            <ChampAdmin label="Portefeuille attribué (liste ou description)"><textarea className="field-input" rows={2} value={form.portefeuille || ""} onChange={(e) => set("portefeuille", e.target.value)} placeholder="ex. carrosseries indépendantes de la zone, hors réseaux constructeurs" /></ChampAdmin>
            <ChampAdmin label="Code apporteur (saisi sur /vente)">
              <div className="flex gap-2">
                <input className="field-input font-mono uppercase" value={form.code_apporteur || ""} onChange={(e) => set("code_apporteur", e.target.value.toUpperCase())} />
                <button type="button" className="btn-ghost btn-compact shrink-0" onClick={() => set("code_apporteur", genererCode(form.nom || ""))}>Générer</button>
              </div>
            </ChampAdmin>
          </>
        )}
        <ChampAdmin label="IBAN (pour les virements)"><input className="field-input" value={form.iban || ""} onChange={(e) => set("iban", e.target.value)} /></ChampAdmin>
        <ChampAdmin label="Adresse"><input className="field-input" value={form.adresse || ""} onChange={(e) => set("adresse", e.target.value)} /></ChampAdmin>
        {form.type === "secretaire" && (
          <ChampAdmin label="Taux horaire négocié, € HT / heure (vide = 17 € par défaut)"><input className="field-input" type="number" step="0.5" min="0" placeholder="17" value={form.taux_horaire ?? ""} onChange={(e) => set("taux_horaire", e.target.value === "" ? null : Number(e.target.value))} /></ChampAdmin>
        )}
        <ChampAdmin label="Début de collaboration"><input className="field-input" type="date" value={form.date_debut || ""} onChange={(e) => set("date_debut", e.target.value)} /></ChampAdmin>
        <ChampAdmin label="Fin (le cas échéant)"><input className="field-input" type="date" value={form.date_fin || ""} onChange={(e) => set("date_fin", e.target.value)} /></ChampAdmin>
      </div>
      <ChampAdmin label="Notes"><textarea className="field-input mt-3" rows={2} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></ChampAdmin>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={saving} onClick={enregistrer}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </ModalShell>
  );
}
