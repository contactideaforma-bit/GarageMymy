"use client";

/* ====================================================================
 *  NOUVEAU CONTRÔLE DE DEVIS (mode expert, v13.23)
 *
 *  Le dossier vit déjà dans le logiciel de l'expert : on ne lui fait pas
 *  ressaisir une mission complète. Soit il retrouve un dossier existant,
 *  soit il en crée un en 20 secondes (immatriculation + réparateur
 *  suffisent), puis il arrive directement sur le contrôle du devis.
 * ==================================================================== */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ModalShell from "@/components/ModalShell";
import Icone from "@/components/expert/Icone";
import { BadgeStatutExpert, Champ, Erreur } from "@/components/expert/ui";
import { chargerDossiers, chargerGarages, creerDossier } from "@/lib/expertise/data";
import { DossierExpert, GarageExpert } from "@/lib/expertise/types";
import { formatDate, messageErreur } from "@/lib/format";

const cle = (s: string | null | undefined) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export default function NouveauControleModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"existant" | "nouveau">("existant");
  const [dossiers, setDossiers] = useState<DossierExpert[]>([]);
  const [garages, setGarages] = useState<GarageExpert[]>([]);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ numero: "", immatriculation: "", numero_sinistre: "", reparateur: "", mandant_nom: "", lese_nom: "", marque: "", modele: "" });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([chargerDossiers(), chargerGarages()]).then(([{ dossiers: d }, g]) => {
      setDossiers(d);
      setGarages(g);
      if (!d.length) setMode("nouveau");
    });
  }, []);

  // La navigation démonte la page (et la modale) : pas d'onClose ici.
  const ouvrir = (d: DossierExpert) => router.push(`/expert/dossiers/${d.id}?onglet=controle`);

  const trouves = useMemo(() => {
    const t = q.trim().toLowerCase();
    const k = cle(q);
    const liste = t
      ? dossiers.filter((d) => [d.numero, d.immatriculation, d.lese_nom, d.assure_nom, d.numero_sinistre, d.reparateur_nom, d.marque, d.modele].some((v) => (v || "").toLowerCase().includes(t)) || (k.length >= 3 && cle(d.immatriculation).includes(k)))
      : dossiers.filter((d) => d.statut !== "cloture");
    return liste.slice(0, 8);
  }, [q, dossiers]);

  // Garde-fou : un dossier existe peut-être déjà pour cette immatriculation.
  const doublon = useMemo(() => {
    const k = cle(f.immatriculation);
    return k.length >= 5 ? dossiers.find((d) => cle(d.immatriculation) === k && d.statut !== "cloture") || null : null;
  }, [f.immatriculation, dossiers]);

  async function creer() {
    if (!f.immatriculation.trim() && !f.numero_sinistre.trim()) { setErreur("Indique au moins l'immatriculation ou le n° de sinistre."); return; }
    setEnCours(true);
    setErreur(null);
    try {
      const g = garages.find((x) => x.nom.toLowerCase() === f.reparateur.trim().toLowerCase()) || null;
      const d = await creerDossier({
        numero: f.numero.trim() || undefined,
        statut: "chiffrage",
        date_mission: new Date().toISOString().slice(0, 10),
        immatriculation: f.immatriculation.trim().toUpperCase() || null,
        marque: f.marque.trim() || null,
        modele: f.modele.trim() || null,
        numero_sinistre: f.numero_sinistre.trim() || null,
        mandant_nom: f.mandant_nom.trim() || null,
        lese_nom: f.lese_nom.trim() || null,
        garage_id: g?.id ?? null,
        reparateur_nom: g?.nom || f.reparateur.trim() || null,
        reparateur_adresse: g ? [g.adresse, [g.code_postal, g.ville].filter(Boolean).join(" ")].filter(Boolean).join("\n") || null : null,
        reparateur_siret: g?.siret ?? null,
      });
      ouvrir(d);
    } catch (e) {
      setErreur(messageErreur(e, "Création du dossier impossible."));
      setEnCours(false);
    }
  }

  const champ = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }) });

  return (
    <ModalShell title="Nouveau contrôle de devis" onClose={() => !enCours && onClose()} maxWidth="max-w-2xl">
      <div className="flex gap-1">
        <button className={`al-onglet ${mode === "existant" ? "actif" : ""}`} onClick={() => setMode("existant")}>Dossier existant</button>
        <button className={`al-onglet ${mode === "nouveau" ? "actif" : ""}`} onClick={() => setMode("nouveau")}>Nouveau dossier</button>
      </div>

      {mode === "existant" ? (
        <div className="space-y-2">
          <input className="field-input" autoFocus placeholder="Immatriculation, n° de dossier, n° de sinistre, nom…" value={q} onChange={(e) => setQ(e.target.value)} />
          {trouves.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/20 p-4 text-center text-sm text-white/60">
              Aucun dossier trouvé.
              <button className="btn-primary btn-compact ml-2" onClick={() => { setMode("nouveau"); setF((x) => ({ ...x, immatriculation: /\d/.test(q) ? q.toUpperCase() : x.immatriculation })); }}>Créer le dossier</button>
            </div>
          ) : (
            <div className="max-h-[50vh] space-y-1.5 overflow-auto">
              {trouves.map((d) => (
                <button key={d.id} className="carte-liste block w-full text-left" onClick={() => ouvrir(d)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{d.immatriculation || "sans immat."} <span className="font-normal text-white/60">· {d.numero}</span></span>
                    <BadgeStatutExpert statut={d.statut} />
                  </div>
                  <div className="truncate text-xs text-white/55">{[[d.marque, d.modele].filter(Boolean).join(" "), d.reparateur_nom, d.lese_nom || d.assure_nom, d.numero_sinistre && `sinistre ${d.numero_sinistre}`, `mission du ${formatDate(d.date_mission)}`].filter(Boolean).join(" · ")}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-white/55">Le dossier complet reste dans ton logiciel : ici, l&apos;essentiel suffit. Tu pourras compléter la fiche plus tard.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Champ label="Immatriculation *"><input className="field-input uppercase" autoFocus {...champ("immatriculation")} placeholder="GK-512-AZ" /></Champ>
            <Champ label="Réparateur">
              <input className="field-input" list="garages-controle" {...champ("reparateur")} placeholder="Nom du garage" />
              <datalist id="garages-controle">{garages.map((g) => <option key={g.id} value={g.nom} />)}</datalist>
            </Champ>
            <Champ label="Marque"><input className="field-input" {...champ("marque")} /></Champ>
            <Champ label="Modèle"><input className="field-input" {...champ("modele")} /></Champ>
            <Champ label="N° de sinistre"><input className="field-input" {...champ("numero_sinistre")} /></Champ>
            <Champ label="Mandant (assureur)"><input className="field-input" {...champ("mandant_nom")} /></Champ>
            <Champ label="Lésé / assuré"><input className="field-input" {...champ("lese_nom")} /></Champ>
            <Champ label="N° de dossier" aide="Celui de ton logiciel ; vide = numéro automatique."><input className="field-input" {...champ("numero")} /></Champ>
          </div>
          {doublon && (
            <div className="alerte alerte-warn flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>Un dossier en cours existe déjà pour <b>{doublon.immatriculation}</b> ({doublon.numero}).</span>
              <button className="btn-ghost btn-compact" onClick={() => ouvrir(doublon)}>Ouvrir ce dossier</button>
            </div>
          )}
          <Erreur message={erreur} />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" disabled={enCours} onClick={onClose}>Annuler</button>
            <button className="btn-primary" disabled={enCours} onClick={creer}>{enCours ? "Création…" : <>Créer et contrôler le devis <Icone nom="droite" /></>}</button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
