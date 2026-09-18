"use client";

// RÉPARATEURS (garages partenaires) du mode expert — v13.5.
// Taux horaires mémorisés : ils pré-remplissent le chiffrage.

import { useEffect, useState } from "react";
import ModalShell from "@/components/ModalShell";
import { Champ, EnTete, Erreur, Vide } from "@/components/expert/ui";
import { chargerGarages, enregistrerGarage, supprimerGarage } from "@/lib/expertise/data";
import { GarageExpert } from "@/lib/expertise/types";
import { formatEuros, messageErreur } from "@/lib/format";

const VIDE: Partial<GarageExpert> = { nom: "", taux_t1: 65, taux_t2: 70, taux_t3: 75, taux_peinture: 70 };

export default function PageGaragesExpert() {
  const [garages, setGarages] = useState<GarageExpert[]>([]);
  const [edition, setEdition] = useState<Partial<GarageExpert> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [recherche, setRecherche] = useState("");

  const recharger = () => chargerGarages().then(setGarages);
  useEffect(() => { recharger(); }, []);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!edition) return;
    setEnvoi(true); setErreur(null);
    try {
      await enregistrerGarage(edition);
      setEdition(null);
      await recharger();
    } catch (err) { setErreur(messageErreur(err)); } finally { setEnvoi(false); }
  }

  const set = (k: keyof GarageExpert, v: unknown) => setEdition((g) => ({ ...(g || {}), [k]: v }));
  const num = (k: keyof GarageExpert) => (
    <input type="number" step="0.5" className="field-input" value={(edition?.[k] as number) ?? ""} onChange={(e) => set(k, e.target.value === "" ? null : Number(e.target.value))} />
  );
  const txt = (k: keyof GarageExpert, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className="field-input" value={(edition?.[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} {...props} />
  );

  const q = recherche.trim().toLowerCase();
  const liste = garages.filter((g) => !q || [g.nom, g.ville, g.siret, g.contact].some((v) => (v || "").toLowerCase().includes(q)));

  return (
    <div className="space-y-4">
      <EnTete titre="Réparateurs" sousTitre="Garages et carrosseries partenaires, avec leurs taux horaires." actions={<button className="btn-primary" onClick={() => setEdition({ ...VIDE })}>+ Ajouter un réparateur</button>} />
      <div className="glass-card flex items-center gap-2 p-3">
        <input className="field-input field-compact max-w-xs" placeholder="Rechercher…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <span className="text-xs text-white/50">{liste.length} réparateur(s)</span>
      </div>
      {liste.length === 0 ? (
        <div className="glass-card p-4"><Vide titre="Aucun réparateur" texte="Ajoute les garages avec lesquels le cabinet travaille : ils seront proposés à la création d'une mission." /></div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {liste.map((g) => (
            <div key={g.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{g.nom}</div>
                  <div className="text-sm text-white/60">{[g.adresse, [g.code_postal, g.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}</div>
                  {g.siret && <div className="text-xs text-white/45">SIRET {g.siret}</div>}
                </div>
                <div className="flex gap-1">
                  <button className="btn-ghost btn-compact" onClick={() => setEdition({ ...g })}>Modifier</button>
                  <button className="btn-danger btn-compact" onClick={async () => { if (confirm(`Supprimer ${g.nom} ?`)) { await supprimerGarage(g.id); recharger(); } }}>×</button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                {[["T1", g.taux_t1], ["T2", g.taux_t2], ["T3", g.taux_t3], ["Peint.", g.taux_peinture]].map(([l, v]) => (
                  <div key={String(l)} className="glass-soft px-1 py-1.5">
                    <div className="text-white/50">{l}</div>
                    <div className="font-semibold">{v ? formatEuros(Number(v)) : "—"}</div>
                  </div>
                ))}
              </div>
              {(g.tel || g.email || g.contact) && (
                <div className="mt-2 text-xs text-white/60">{[g.contact, g.tel, g.email].filter(Boolean).join(" · ")}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {edition && (
        <ModalShell title={edition.id ? "Modifier le réparateur" : "Nouveau réparateur"} onClose={() => setEdition(null)} maxWidth="max-w-2xl">
          <form onSubmit={enregistrer} className="space-y-3">
            <Erreur message={erreur} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Champ label="Nom" className="sm:col-span-2">{txt("nom", { required: true })}</Champ>
              <Champ label="SIRET">{txt("siret")}</Champ>
              <Champ label="Adresse" className="sm:col-span-3">{txt("adresse")}</Champ>
              <Champ label="Code postal">{txt("code_postal")}</Champ>
              <Champ label="Ville" className="sm:col-span-2">{txt("ville")}</Champ>
              <Champ label="Contact">{txt("contact")}</Champ>
              <Champ label="Téléphone">{txt("tel", { type: "tel" })}</Champ>
              <Champ label="Email">{txt("email", { type: "email" })}</Champ>
              <Champ label="Taux T1 €/h">{num("taux_t1")}</Champ>
              <Champ label="Taux T2 €/h">{num("taux_t2")}</Champ>
              <Champ label="Taux T3 €/h">{num("taux_t3")}</Champ>
              <Champ label="Taux peinture €/h">{num("taux_peinture")}</Champ>
              <Champ label="Notes" className="sm:col-span-2">{txt("notes")}</Champ>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setEdition(null)}>Annuler</button>
              <button type="submit" className="btn-primary" disabled={envoi}>{envoi ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}
