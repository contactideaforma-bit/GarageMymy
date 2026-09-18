"use client";

// Import d'une liste dans l'annuaire expert (v13.6) : Excel / CSV (colonnes
// reconnues automatiquement) ou PDF / image (lecture par l'IA). Aperçu avec
// cases à cocher, doublons détectés sur le nom, puis enregistrement.

import { useRef, useState } from "react";
import ModalShell from "@/components/ModalShell";
import { Erreur } from "@/components/expert/ui";
import { messageErreur } from "@/lib/format";
import { CategorieAnnuaire, cleFiche, lireFichierAnnuaire } from "@/lib/expertise/importAnnuaire";
import { FicheAnnuaire, adresseFiche } from "@/lib/expertise/types";
import { TITRES, enregistrerFiche } from "@/components/expert/FicheAnnuaireModal";

export default function ImportAnnuaireModal({
  categorie,
  existants,
  onClose,
  onDone,
}: {
  categorie: CategorieAnnuaire;
  existants: { nom: string }[];
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const [fiches, setFiches] = useState<FicheAnnuaire[]>([]);
  const [coche, setCoche] = useState<boolean[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [lecture, setLecture] = useState(false);
  const [envoi, setEnvoi] = useState<{ fait: number; total: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const fichier = useRef<HTMLInputElement>(null);
  const cles = new Set(existants.map((e) => cleFiche(e.nom)));

  async function lire(file: File) {
    setLecture(true); setErreur(null); setFiches([]);
    try {
      const r = await lireFichierAnnuaire(file, categorie);
      if (!r.fiches.length) throw new Error("Aucune ligne exploitable dans ce fichier (il faut au moins une colonne « Nom »).");
      setFiches(r.fiches);
      setCoche(r.fiches.map((f) => !cles.has(cleFiche(f.nom))));
      setSource(r.source === "ia" ? `${file.name} — lu par l'IA` : `${file.name} — colonnes : ${Object.keys(r.colonnes || {}).join(", ")}`);
    } catch (e) { setErreur(messageErreur(e, "Lecture impossible.")); } finally { setLecture(false); }
  }

  async function importer() {
    const selection = fiches.filter((_, i) => coche[i]);
    if (!selection.length) return;
    setEnvoi({ fait: 0, total: selection.length }); setErreur(null);
    let n = 0;
    try {
      for (const f of selection) {
        await enregistrerFiche(categorie, { ...f, type: f.type || (categorie === "clients" ? (f.siren ? "societe" : "particulier") : undefined) } as never);
        n += 1;
        setEnvoi({ fait: n, total: selection.length });
      }
      onDone(n);
    } catch (e) {
      setErreur(messageErreur(e, `Import interrompu après ${n} fiche(s).`));
      setEnvoi(null);
    }
  }

  const t = TITRES[categorie];
  return (
    <ModalShell title={`Importer des ${t.pluriel.toLowerCase()}`} onClose={onClose} maxWidth="max-w-4xl">
      <p className="text-sm text-white/60">
        Fichier <span className="font-medium">Excel (.xlsx)</span> ou <span className="font-medium">CSV</span> avec une ligne d&apos;en-têtes (Nom, Adresse, CP, Ville, SIRET, Téléphone, Email, Contact…), ou <span className="font-medium">PDF / photo</span> d&apos;une liste : l&apos;IA en extrait les fiches.
      </p>
      <input ref={fichier} type="file" accept=".xlsx,.xlsm,.csv,.txt,application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) lire(f); e.target.value = ""; }} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={lecture || Boolean(envoi)} onClick={() => fichier.current?.click()}>{lecture ? "Lecture…" : "📎 Choisir un fichier"}</button>
        {source && <span className="text-xs text-white/50">{source}</span>}
      </div>
      <Erreur message={erreur} />

      {fiches.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{coche.filter(Boolean).length} / {fiches.length} fiche(s) sélectionnée(s) · <span className="text-white/50">les doublons (nom déjà présent) sont décochés</span></span>
            <div className="flex gap-1">
              <button type="button" className="btn-ghost btn-compact" onClick={() => setCoche(fiches.map(() => true))}>Tout cocher</button>
              <button type="button" className="btn-ghost btn-compact" onClick={() => setCoche(fiches.map((f) => !cles.has(cleFiche(f.nom))))}>Sans doublons</button>
            </div>
          </div>
          <div className="max-h-80 overflow-auto rounded-xl border border-white/10">
            <table className="al-table">
              <thead><tr><th></th><th>Nom</th><th>Adresse</th><th>SIRET / SIREN</th><th>Téléphone</th><th>Email</th><th>Contact</th></tr></thead>
              <tbody>
                {fiches.map((f, i) => {
                  const doublon = cles.has(cleFiche(f.nom));
                  return (
                    <tr key={i} className={doublon ? "opacity-60" : ""}>
                      <td><input type="checkbox" checked={coche[i]} onChange={(e) => setCoche(coche.map((c, j) => (j === i ? e.target.checked : c)))} /></td>
                      <td className="font-medium">{f.nom}{doublon && <span className="badge badge-warn ml-1">déjà présent</span>}</td>
                      <td className="text-xs">{adresseFiche(f) || "—"}</td>
                      <td className="font-mono text-xs">{f.siret || f.siren || "—"}</td>
                      <td className="text-xs">{f.tel || "—"}</td>
                      <td className="text-xs">{f.email || "—"}</td>
                      <td className="text-xs">{f.contact || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-white/50">{envoi ? `Enregistrement ${envoi.fait} / ${envoi.total}…` : ""}</span>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Fermer</button>
          <button type="button" className="btn-primary" disabled={!fiches.length || Boolean(envoi) || !coche.some(Boolean)} onClick={importer}>Importer la sélection</button>
        </div>
      </div>
    </ModalShell>
  );
}
