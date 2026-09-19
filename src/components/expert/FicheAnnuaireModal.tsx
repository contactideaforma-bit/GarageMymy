"use client";

// Fiche de l'annuaire expert (v13.6) : assurance, client ou réparateur.
// « 🔍 SIREN » : recherche par nom OU par SIRET/SIREN tapé dans le champ nom,
// via l'annuaire officiel des entreprises → auto-remplissage (nom, adresse,
// CP, ville, SIREN, SIRET). Rien n'est écrasé s'il y a déjà une adresse.

import { useEffect, useState } from "react";
import Icone from "@/components/expert/Icone";
import ModalShell from "@/components/ModalShell";
import RechercheSiren, { ResultatSiren } from "@/components/RechercheSiren";
import { Champ, Erreur } from "@/components/expert/ui";
import { messageErreur } from "@/lib/format";
import { CategorieAnnuaire } from "@/lib/expertise/importAnnuaire";
import { chargerAssurances, enregistrerAssurance, enregistrerClient, enregistrerGarage } from "@/lib/expertise/data";
import { Agrement, AssuranceExpert, ClientExpert, GarageExpert } from "@/lib/expertise/types";

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
  const { nom, adresse, code_postal, ville, siret, tel, email, contact, notes, taux_t1, taux_t2, taux_t3, taux_peinture, id, agree, agrements } = f;
  const propres = (agrements || []).filter((a) => a.assurance && a.assurance.trim());
  return enregistrerGarage({ id, nom: nom || "", adresse, code_postal, ville, siret, tel, email, contact, notes, taux_t1: taux_t1 ?? 65, taux_t2: taux_t2 ?? 70, taux_t3: taux_t3 ?? 75, taux_peinture: taux_peinture ?? 70, agree: Boolean(agree) || propres.length > 0, agrements: propres } as Partial<GarageExpert>);
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
  const [assurances, setAssurances] = useState<AssuranceExpert[]>([]);
  useEffect(() => { if (categorie === "garages") chargerAssurances().then(setAssurances).catch(() => undefined); }, [categorie]);
  const set = (k: keyof FicheQuelconque, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const agrements: Agrement[] = f.agrements || [];
  const majAgrement = (i: number, patch: Partial<Agrement>) => set("agrements", agrements.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const numAgr = (i: number, k: keyof Agrement, placeholder?: string) => (
    <input type="number" step="0.5" className="field-input field-compact" placeholder={placeholder} value={(agrements[i][k] as number) ?? ""} onChange={(e) => majAgrement(i, { [k]: e.target.value === "" ? null : Number(e.target.value) })} />
  );
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

        {categorie === "garages" && (
          <div className="glass-soft p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={Boolean(f.agree) || agrements.length > 0} onChange={(e) => { set("agree", e.target.checked); if (!e.target.checked) set("agrements", []); }} />
                Garage agréé par une ou plusieurs assurances
              </label>
              {(f.agree || agrements.length > 0) && (
                <button type="button" className="btn-ghost btn-compact" onClick={() => set("agrements", [...agrements, { assurance: "", tarif_preferentiel: false }])}><Icone nom="plus" /> Agrément</button>
              )}
            </div>
            {(f.agree || agrements.length > 0) && (
              <div className="mt-3 space-y-3">
                {agrements.length === 0 && <p className="text-xs text-white/55">Ajoute un agrément par assurance : elle sera reconnue sur les dossiers dont elle est le mandant.</p>}
                {agrements.map((a, i) => (
                  <div key={i} className="rounded-xl border border-white/15 p-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Champ label="Assurance" className="sm:col-span-2" aide="Choisis dans la base ou saisis le nom.">
                        <input className="field-input field-compact" list={`assurances-${i}`} value={a.assurance} onChange={(e) => majAgrement(i, { assurance: e.target.value })} placeholder="AXA, MAIF, Groupama…" />
                        <datalist id={`assurances-${i}`}>{assurances.map((x) => <option key={x.id} value={x.nom} />)}</datalist>
                      </Champ>
                      <div className="flex items-end justify-between gap-2">
                        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={a.tarif_preferentiel} onChange={(e) => majAgrement(i, { tarif_preferentiel: e.target.checked })} /> Tarif préférentiel</label>
                        <button type="button" className="btn-danger btn-compact mb-1" onClick={() => set("agrements", agrements.filter((_, j) => j !== i))} aria-label="Retirer">×</button>
                      </div>
                    </div>
                    {a.tarif_preferentiel && (
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <Champ label="T1 €/h">{numAgr(i, "taux_t1", String(f.taux_t1 ?? ""))}</Champ>
                        <Champ label="T2 €/h">{numAgr(i, "taux_t2", String(f.taux_t2 ?? ""))}</Champ>
                        <Champ label="T3 €/h">{numAgr(i, "taux_t3", String(f.taux_t3 ?? ""))}</Champ>
                        <Champ label="Peinture €/h">{numAgr(i, "taux_peinture", String(f.taux_peinture ?? ""))}</Champ>
                        <Champ label="Remise pièces %">{numAgr(i, "remise_pieces", "0")}</Champ>
                      </div>
                    )}
                    <div className="mt-2">
                      <input className="field-input field-compact" placeholder="Conditions : véhicule de courtoisie, franchise offerte, délai de prise en charge, n° d'agrément…" value={a.conditions || ""} onChange={(e) => majAgrement(i, { conditions: e.target.value || null })} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn-primary" disabled={envoi}>{envoi ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </form>
    </ModalShell>
  );
}
