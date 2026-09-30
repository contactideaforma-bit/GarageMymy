"use client";

// ============================================================
//  COMPTE GARAGE DE A À Z (v13.31) — depuis l'espace éditeur.
//
//  Sans passer par un commercial ni une vente : l'éditeur saisit le garage
//  (recherche SIREN possible), l'offre, éventuellement le commercial / le
//  chargé de mission rattachés, et en un clic on crée l'abonnement + ses
//  mensualités, le compte My Easy Auto (mot de passe provisoire), le profil
//  entreprise pré-rempli et on envoie l'email de bienvenue.
// ============================================================

import { useMemo, useState } from "react";
import ModalShell from "@/components/ModalShell";
import RechercheSiren from "@/components/RechercheSiren";
import { ChampAdmin, euros } from "@/components/admin/AdminShell";
import { Collaborateur, SaisieCompteManuel, creerCompteGarageManuel, nomCollab } from "@/lib/admin/client";
import { FORMULES, Formule, Parametres, Periodicite, prixVente } from "@/lib/admin/economie";

type Etape = "saisie" | "fini";
type Resultat = Awaited<ReturnType<typeof creerCompteGarageManuel>>;

const premierDuMoisProchain = () => {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`;
};

export default function CompteGarageModal({ p, collabs, onClose, onCree }: { p: Parametres; collabs: Collaborateur[]; onClose: () => void; onCree: () => void }) {
  const [etape, setEtape] = useState<Etape>("saisie");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [res, setRes] = useState<Resultat | null>(null);

  const [g, setG] = useState<SaisieCompteManuel["garage"]>({ nom: "", email: "", siret: "", adresse: "", cp: "", ville: "", tel: "", contactNom: "", contactFonction: "Gérant(e)" });
  const [o, setO] = useState<SaisieCompteManuel["offre"]>({ formule: "essentiel", engagement_12: true, periodicite: "mensuel", remise_supp_pct: 0, date_debut: premierDuMoisProchain(), commercial_id: null, secretaire_id: null, notes: "" });
  const [avecAbonnement, setAvecAbonnement] = useState(true);
  const [envoyerEmail, setEnvoyerEmail] = useState(true);

  const commerciaux = collabs.filter((c) => c.type === "commercial" && c.statut !== "termine");
  const secretaires = collabs.filter((c) => c.type === "secretaire" && c.statut !== "termine");
  const setGf = (k: keyof SaisieCompteManuel["garage"]) => (e: React.ChangeEvent<HTMLInputElement>) => setG((x) => ({ ...x, [k]: e.target.value }));

  const prix = useMemo(
    () => prixVente(o.formule, { engagement12: o.engagement_12 || o.periodicite === "annuel", periodicite: o.periodicite, remiseSupp: Number(o.remise_supp_pct) || 0 }, p),
    [o, p]
  );

  async function creer() {
    setErreur(null);
    if (!g.nom.trim()) return setErreur("Le nom du garage est obligatoire.");
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(g.email.trim())) return setErreur("Indique l'email du garage : c'est son identifiant de connexion.");
    setBusy(true);
    try {
      const r = await creerCompteGarageManuel({ garage: g, offre: { ...o, engagement_12: o.engagement_12 || o.periodicite === "annuel" }, avecAbonnement, envoyerEmail });
      setRes(r);
      setEtape("fini");
      onCree();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (etape === "fini" && res) {
    return (
      <ModalShell title={`Compte créé — ${g.nom}`} onClose={onClose} maxWidth="max-w-xl">
        <div className="space-y-3 text-sm">
          <p className="badge badge-ok">{res.dejaExistant ? "Compte déjà existant : rattaché, mot de passe inchangé" : "Compte My Easy Auto créé"}</p>
          <div className="glass-soft p-3">
            <div className="text-white">Identifiant : <b>{g.email.trim().toLowerCase()}</b></div>
            {avecAbonnement && <div className="text-white/70">Abonnement {p.formules[o.formule].libelle} créé, mensualités générées (onglet Abonnements).</div>}
            {res.dejaExistant ? (
              <div className="mt-1 text-white/60">Le garage garde son mot de passe actuel (aucun email envoyé).</div>
            ) : res.emailEnvoye ? (
              <div className="mt-1 text-emerald-300">Email de bienvenue envoyé avec le mot de passe provisoire.</div>
            ) : (
              <div className="mt-1 space-y-1">
                <div className="text-amber-300">{envoyerEmail ? `Email non envoyé : ${res.erreurEmail || "erreur"}` : "Email de bienvenue non envoyé (à ta demande)."}</div>
                {res.motDePasse && (
                  <div className="text-white">
                    Mot de passe provisoire à transmettre : <code className="rounded bg-white/10 px-2 py-0.5 font-mono text-base tracking-wide">{res.motDePasse}</code>
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-white/50">Le profil du garage (nom, SIRET, adresse, téléphone) est déjà pré-rempli : il n&apos;a plus qu&apos;à ajouter son logo et son IBAN dans « Profil ».</p>
          <div className="flex justify-end"><button className="btn-primary" onClick={onClose}>Fermer</button></div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Créer un compte garage de A à Z" onClose={onClose} maxWidth="max-w-3xl">
      <p className="text-xs text-white/50">Pour un garage signé sans commercial (ou un compte d&apos;essai) : tout est créé d&apos;un coup — abonnement, compte, profil, email de bienvenue.</p>

      <div className="glass-soft mt-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wider text-white/40">Le garage</div>
          <RechercheSiren
            compact
            nom={g.nom}
            onChoisir={(r) => setG((x) => ({ ...x, nom: x.nom || r.nom, siret: r.siret || r.siren, adresse: x.adresse || r.adresse, cp: x.cp || r.codePostal, ville: x.ville || r.ville }))}
          />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ChampAdmin label="Nom du garage *"><input className="field-input" value={g.nom} onChange={setGf("nom")} /></ChampAdmin>
          <ChampAdmin label="Email * (identifiant de connexion)"><input className="field-input" type="email" value={g.email} onChange={setGf("email")} /></ChampAdmin>
          <ChampAdmin label="SIRET"><input className="field-input" value={g.siret || ""} onChange={setGf("siret")} /></ChampAdmin>
          <ChampAdmin label="Téléphone"><input className="field-input" value={g.tel || ""} onChange={setGf("tel")} /></ChampAdmin>
          <ChampAdmin label="Adresse"><input className="field-input" value={g.adresse || ""} onChange={setGf("adresse")} /></ChampAdmin>
          <div className="grid grid-cols-3 gap-2">
            <ChampAdmin label="CP"><input className="field-input" value={g.cp || ""} onChange={setGf("cp")} /></ChampAdmin>
            <div className="col-span-2"><ChampAdmin label="Ville"><input className="field-input" value={g.ville || ""} onChange={setGf("ville")} /></ChampAdmin></div>
          </div>
          <ChampAdmin label="Contact (prénom nom)"><input className="field-input" value={g.contactNom || ""} onChange={setGf("contactNom")} /></ChampAdmin>
          <ChampAdmin label="Fonction"><input className="field-input" value={g.contactFonction || ""} onChange={setGf("contactFonction")} /></ChampAdmin>
        </div>
      </div>

      <div className="glass-soft mt-3 p-3">
        <label className="flex items-center gap-2 text-sm text-white/85">
          <input type="checkbox" checked={avecAbonnement} onChange={(e) => setAvecAbonnement(e.target.checked)} />
          Créer l&apos;abonnement (décocher pour un simple compte d&apos;essai / démo sans facturation)
        </label>
        {avecAbonnement && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChampAdmin label="Formule">
              <select className="field-input" value={o.formule} onChange={(e) => setO((x) => ({ ...x, formule: e.target.value as Formule }))}>
                {FORMULES.map((f) => <option key={f} value={f}>{p.formules[f].libelle} — {euros(p.formules[f].prix)} HT / mois</option>)}
              </select>
            </ChampAdmin>
            <ChampAdmin label="Périodicité">
              <select className="field-input" value={o.periodicite} onChange={(e) => setO((x) => ({ ...x, periodicite: e.target.value as Periodicite }))}>
                <option value="mensuel">Mensuel</option>
                <option value="annuel">Annuel, payé en une fois</option>
              </select>
            </ChampAdmin>
            <ChampAdmin label="Remise exceptionnelle (%)"><input className="field-input text-right tabular-nums" type="number" min="0" max="30" step="0.5" value={o.remise_supp_pct ?? 0} onChange={(e) => setO((x) => ({ ...x, remise_supp_pct: Number(e.target.value) || 0 }))} /></ChampAdmin>
            <ChampAdmin label="1re mensualité"><input className="field-input" type="date" value={o.date_debut || ""} onChange={(e) => setO((x) => ({ ...x, date_debut: e.target.value }))} /></ChampAdmin>
            <ChampAdmin label="Commercial (prime)"><select className="field-input" value={o.commercial_id || ""} onChange={(e) => setO((x) => ({ ...x, commercial_id: e.target.value || null }))}><option value="">— sans commercial —</option>{commerciaux.map((c) => <option key={c.id} value={c.id}>{nomCollab(c)}</option>)}</select></ChampAdmin>
            <ChampAdmin label="Chargé de mission"><select className="field-input" value={o.secretaire_id || ""} onChange={(e) => setO((x) => ({ ...x, secretaire_id: e.target.value || null }))}><option value="">— aucun —</option>{secretaires.map((c) => <option key={c.id} value={c.id}>{nomCollab(c)}</option>)}</select></ChampAdmin>
            <label className="flex items-center gap-2 text-sm text-white/80 sm:col-span-2">
              <input type="checkbox" checked={o.engagement_12 || o.periodicite === "annuel"} disabled={o.periodicite === "annuel"} onChange={(e) => setO((x) => ({ ...x, engagement_12: e.target.checked }))} />
              Engagement 12 mois (mise en service offerte)
            </label>
            <div className="text-sm text-white/75 sm:col-span-2">
              {o.periodicite === "annuel" ? <>Année en une fois : <b className="text-white">{euros(prix.montantAnnuel)} HT</b></> : <>Mensualité : <b className="text-white">{euros(prix.mensualite)} HT / mois</b></>}
              {" · "}mise en service {Number(prix.miseEnService) > 0 ? `${euros(prix.miseEnService)} HT` : "offerte"}
            </div>
            <ChampAdmin label="Notes (abonnement)"><input className="field-input" value={o.notes || ""} onChange={(e) => setO((x) => ({ ...x, notes: e.target.value }))} /></ChampAdmin>
          </div>
        )}
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-white/85">
        <input type="checkbox" checked={envoyerEmail} onChange={(e) => setEnvoyerEmail(e.target.checked)} />
        Envoyer l&apos;email de bienvenue avec le mot de passe provisoire (sinon il te sera affiché pour le transmettre toi-même)
      </label>

      {erreur && <p className="mt-3 badge badge-danger">{erreur}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Annuler</button>
        <button className="btn-primary" onClick={creer} disabled={busy}>{busy ? "Création…" : "Créer le compte garage"}</button>
      </div>
    </ModalShell>
  );
}
