"use client";

// Fiche de l'annuaire expert (v13.6) : assurance, client ou réparateur.
// « 🔍 SIREN » : recherche par nom OU par SIRET/SIREN tapé dans le champ nom,
// via l'annuaire officiel des entreprises → auto-remplissage (nom, adresse,
// CP, ville, SIREN, SIRET). Rien n'est écrasé s'il y a déjà une adresse.

import { useState } from "react";
import Icone from "@/components/expert/Icone";
import ModalShell from "@/components/ModalShell";
import RechercheSiren, { ResultatSiren } from "@/components/RechercheSiren";
import { Champ, Erreur } from "@/components/expert/ui";
import { messageErreur } from "@/lib/format";
import { CategorieAnnuaire } from "@/lib/expertise/importAnnuaire";
import { enregistrerAssurance, enregistrerClient, enregistrerGarage } from "@/lib/expertise/data";
import { AssuranceExpert, ClientExpert, GarageExpert } from "@/lib/expertise/types";

export type FicheQuelconque = Partial<AssuranceExpert & ClientExpert & GarageExpert>;

export const TITRES: Record<CategorieAnnuaire, { un: string; pluriel: string }> = {
  assurances: { un: "assurance", pluriel: "Assurances" },
  clients: { un: "client", pluriel: "Clients" },
  garages: { un: "réparateur", pluriel: "Réparateurs" },
};

export async function enregistrerFiche(categorie: CategorieAnnuaire, f: FicheQuelconque): Promise<FicheQuelconque> {
  if (categorie === "assurances") {
    const { nom, adresse, code_postal, ville, siren, tel, email, contact, notes, id } = f;
    return enregistrerAssurance({ id, nom: nom || "", adresse, code_postal, ville, siren, tel, email, contact, notes } as Partial<AssuranceExpert>);
  }
  if (categorie === "clients") {
    const { nom, type, adresse, code_postal, ville, siren, tel, email, contact, notes, id } = f;
    return enregistrerClient({ id, nom: nom || "", type: type || "particulier", adresse, code_postal, ville, siren, tel, email, contact, notes } as Partial<ClientExpert>);
  }
  const { nom, adresse, code_postal, ville, siret, tel, email, contact, notes, taux_t1, taux_t2, taux_t3, taux_peinture, id } = f;
  return enregistrerGarage({ id, nom: nom || "", adresse, code_postal, ville, siret, tel, email, contact, notes, taux_t1: taux_t1 ?? 65, taux_t2: taux_t2 ?? 70, taux_t3: taux_t3 ?? 75, taux_peinture: taux_peinture ?? 70 } as Partial<GarageExpert>);
}

export default function FicheAnnuaireModal({
  categorie,
  initial,
  onClose,
  onSaved,
}: {
  categorie: CategorieAnnuaire;
  initial?: FicheQuelconque | null;
  onClose: () => void;
  onSaved: (f: FicheQuelconque) => void;
}) {
  const [f, setF] = useState<FicheQuelconque>(initial ? { ...initial } : { nom: "", type: "particulier" });
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const set = (k: keyof FicheQuelconque, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const txt = (k: keyof FicheQuelconque, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className="field-input" value={(f[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} {...props} />
  );
  const num = (k: keyof FicheQuelconque) => (
    <input type="number" step="0.5" className="field-input" value={(f[k] as number) ?? ""} onChange={(e) => set(k, e.target.value === "" ? null : Number(e.target.value))} />
  );

  function appliquerSiren(r: ResultatSiren) {
    setF((p) => ({
      ...p,
      nom: p.nom && !/^\d[\d\s]+$/.test(p.nom) ? p.nom : r.nom,
      siren: r.siren || p.siren,
      siret: r.siret || p.siret,
      adresse: p.adresse || r.adresse || null,
      code_postal: p.code_postal || r.codePostal || null,
      ville: p.ville || r.ville || null,
      type: categorie === "clients" ? "societe" : p.type,
    }));
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!f.nom?.trim()) { setErreur("Le nom est obligatoire."); return; }
    setEnvoi(true); setErreur(null);
    try {
      onSaved(await enregistrerFiche(categorie, { ...f, nom: f.nom.trim() }));
    } catch (err) { setErreur(messageErreur(err)); } finally { setEnvoi(false); }
  }

  const t = TITRES[categorie];
  return (
    <ModalShell title={initial?.id ? `Modifier — ${initial.nom}` : `Nouveau ${t.un}`} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={enregistrer} className="space-y-3">
        <Erreur message={erreur} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Champ label={categorie === "clients" ? "Nom / raison sociale" : "Raison sociale"} className="sm:col-span-2" aide="Tape un nom ou un SIRET puis « SIREN » pour remplir la fiche depuis l'annuaire officiel.">
            <div className="flex gap-2">
              {txt("nom", { required: true, autoFocus: true })}
              <RechercheSiren nom={f.nom || ""} onChoisir={appliquerSiren} compact libelle={<><Icone nom="recherche" /> SIREN</>} />
            </div>
          </Champ>
          {categorie === "clients" ? (
            <Champ label="Type">
              <select className="field-input" value={f.type || "particulier"} onChange={(e) => set("type", e.target.value)}>
                <option value="particulier">Particulier</option><option value="societe">Société</option>
              </select>
            </Champ>
          ) : categorie === "garages" ? (
            <Champ label="SIRET">{txt("siret")}</Champ>
          ) : (
            <Champ label="SIREN">{txt("siren")}</Champ>
          )}
          {categorie === "clients" && f.type === "societe" && <Champ label="SIREN">{txt("siren")}</Champ>}
          <Champ label="Adresse" className="sm:col-span-3">{txt("adresse")}</Champ>
          <Champ label="Code postal">{txt("code_postal")}</Champ>
          <Champ label="Ville" className="sm:col-span-2">{txt("ville")}</Champ>
          <Champ label={categorie === "clients" ? "Interlocuteur" : "Contact"}>{txt("contact")}</Champ>
          <Champ label="Téléphone">{txt("tel", { type: "tel" })}</Champ>
          <Champ label="Email">{txt("email", { type: "email" })}</Champ>
          {categorie === "garages" && (
            <>
              <Champ label="Taux T1 €/h">{num("taux_t1")}</Champ>
              <Champ label="Taux T2 €/h">{num("taux_t2")}</Champ>
              <Champ label="Taux T3 €/h">{num("taux_t3")}</Champ>
              <Champ label="Taux peinture €/h">{num("taux_peinture")}</Champ>
            </>
          )}
          <Champ label="Notes" className="sm:col-span-3">{txt("notes")}</Champ>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn-primary" disabled={envoi}>{envoi ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </form>
    </ModalShell>
  );
}
