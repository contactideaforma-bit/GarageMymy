"use client";

import { useRef, useState } from "react";
import ModalShell from "@/components/ModalShell";
import { messageErreur } from "@/lib/format";
import {
  ArchiveLue,
  ResultatImport,
  exporterFlotte,
  importerFlotte,
  lireArchiveFlotte,
  normaliserImmat,
} from "@/lib/flotteTransfert";

/**
 * TRANSFERT DE FLOTTE (v13.46) : exporter l'onglet courant dans un ZIP, ou
 * importer un ZIP venant d'un autre compte (client qui change de garage).
 */
export default function TransfertFlotteModal({
  horsGarage,
  nbVehicules,
  onClose,
  onImported,
}: {
  horsGarage: boolean;
  nbVehicules: number;
  onClose: () => void;
  onImported: () => void;
}) {
  const [mode, setMode] = useState<"choix" | "export" | "import">("choix");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportFait, setExportFait] = useState<{ nbVehicules: number; nbDocuments: number; nbDocumentsManques: number } | null>(null);
  const [lu, setLu] = useState<ArchiveLue | null>(null);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const occupe = progress !== null;
  const nomOnglet = horsGarage ? "flotte hors garage" : "flotte du garage";

  async function lancerExport() {
    setError(null);
    setProgress("Préparation…");
    try {
      const r = await exporterFlotte({ horsGarage, onProgress: setProgress });
      setExportFait(r);
    } catch (err) {
      setError(messageErreur(err, "Export impossible."));
    } finally {
      setProgress(null);
    }
  }

  async function choisirFichier(file: File) {
    setError(null);
    setResultat(null);
    setProgress("Lecture du fichier…");
    try {
      const r = await lireArchiveFlotte(file);
      setLu(r);
      setChoisis(new Set(r.archive.vehicules.map((v) => normaliserImmat(v.vehicule.immatriculation))));
    } catch (err) {
      setError(messageErreur(err, "Fichier illisible."));
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function lancerImport() {
    if (!lu) return;
    setError(null);
    setProgress("Import…");
    try {
      const r = await importerFlotte({ lu, horsGarage, immatsChoisies: choisis, onProgress: setProgress });
      setResultat(r);
      if (r.crees > 0) onImported();
    } catch (err) {
      setError(messageErreur(err, "Import impossible."));
    } finally {
      setProgress(null);
    }
  }

  const titre = mode === "export" ? "Exporter la flotte" : mode === "import" ? "Importer une flotte" : "Transférer la flotte";

  return (
    <ModalShell title={titre} onClose={onClose} maxWidth="max-w-2xl">
      {mode === "choix" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button onClick={() => setMode("export")} className="glass-soft p-4 text-left hover:bg-white/10 transition-colors">
            <div className="font-semibold text-white">Exporter ↓</div>
            <p className="mt-1 text-sm text-white/60">
              Télécharge un fichier ZIP avec les {nbVehicules} véhicule{nbVehicules > 1 ? "s" : ""} de la {nomOnglet}, leurs documents (cartes grises, assurances, photos…) et leur carnet d&apos;entretien. À donner au nouveau garage, ou à garder comme sauvegarde.
            </p>
          </button>
          <button onClick={() => setMode("import")} className="glass-soft p-4 text-left hover:bg-white/10 transition-colors">
            <div className="font-semibold text-white">Importer ↑</div>
            <p className="mt-1 text-sm text-white/60">
              Reprends un fichier ZIP exporté depuis un autre compte My Easy Auto : les véhicules sont recréés dans la {nomOnglet}, avec leurs documents. Rien n&apos;est écrasé.
            </p>
          </button>
        </div>
      )}

      {mode === "export" && (
        <div className="space-y-3">
          <p className="text-sm text-white/70">
            Le fichier contient tout ce qu&apos;il faut pour reprendre la {nomOnglet} ailleurs : <code className="text-white/90">flotte.json</code> (données), <code className="text-white/90">flotte.csv</code> (lisible dans Excel) et un dossier de documents par immatriculation. Les véhicules restent ici : l&apos;export est une copie.
          </p>
          {exportFait ? (
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100">
              ZIP téléchargé : {exportFait.nbVehicules} véhicule{exportFait.nbVehicules > 1 ? "s" : ""}, {exportFait.nbDocuments} document{exportFait.nbDocuments > 1 ? "s" : ""}.
              {exportFait.nbDocumentsManques > 0 && ` ${exportFait.nbDocumentsManques} document(s) introuvable(s) sur le serveur n'ont pas pu être joints.`}
            </div>
          ) : (
            <button onClick={lancerExport} disabled={occupe || nbVehicules === 0} className="btn-primary">
              {occupe ? progress : `Télécharger le ZIP (${nbVehicules} véhicule${nbVehicules > 1 ? "s" : ""})`}
            </button>
          )}
        </div>
      )}

      {mode === "import" && (
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) choisirFichier(f); }}
          />
          {!lu && (
            <>
              <p className="text-sm text-white/70">
                Choisis le ZIP exporté depuis l&apos;ancien compte (bouton « Transférer → Exporter » de son onglet Flotte). Les véhicules dont l&apos;immatriculation existe déjà ici sont ignorés.
              </p>
              <button onClick={() => inputRef.current?.click()} disabled={occupe} className="btn-primary">
                {occupe ? progress : "Choisir le fichier ZIP…"}
              </button>
            </>
          )}

          {lu && !resultat && (
            <>
              <div className="text-sm text-white/70">
                Export du compte <span className="text-white">{lu.archive.compte || "inconnu"}</span>
                {" "}({lu.archive.hors_garage ? "flotte hors garage" : "flotte du garage"}) du {new Date(lu.archive.exporte_le).toLocaleDateString("fr-FR")} —
                {" "}{lu.archive.vehicules.length} véhicule{lu.archive.vehicules.length > 1 ? "s" : ""}. Coche ceux à importer dans la {nomOnglet} :
              </div>
              <div className="glass-soft max-h-64 overflow-y-auto divide-y divide-white/5">
                {lu.archive.vehicules.map((item) => {
                  const cle = normaliserImmat(item.vehicule.immatriculation);
                  const nbDocs = (item.documents || []).filter((d) => d.fichier).length;
                  return (
                    <label key={cle} className="flex items-center gap-3 px-3 py-2 text-sm text-white/80 cursor-pointer hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={choisis.has(cle)}
                        onChange={(e) => {
                          const n = new Set(choisis);
                          if (e.target.checked) n.add(cle); else n.delete(cle);
                          setChoisis(n);
                        }}
                      />
                      <span className="font-medium text-white">{item.vehicule.immatriculation}</span>
                      <span className="text-white/50">{item.vehicule.marque_modele || "—"}</span>
                      <span className="ml-auto text-xs text-white/40">
                        {nbDocs} doc{nbDocs > 1 ? "s" : ""}{item.entretiens?.length ? ` · ${item.entretiens.length} entretien${item.entretiens.length > 1 ? "s" : ""}` : ""}
                        {item.vehicule.titulaire_cg ? ` · CG : ${item.vehicule.titulaire_cg}` : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={lancerImport} disabled={occupe || choisis.size === 0} className="btn-primary">
                  {occupe ? progress : `Importer ${choisis.size} véhicule${choisis.size > 1 ? "s" : ""}`}
                </button>
                <button onClick={() => setLu(null)} disabled={occupe} className="btn-ghost">Autre fichier</button>
              </div>
            </>
          )}

          {resultat && (
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-emerald-100">
                {resultat.crees} véhicule{resultat.crees > 1 ? "s" : ""} importé{resultat.crees > 1 ? "s" : ""}, {resultat.documents} document{resultat.documents > 1 ? "s" : ""}, {resultat.entretiens} entretien{resultat.entretiens > 1 ? "s" : ""}.
              </div>
              {resultat.ignores.length > 0 && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-amber-100">
                  Déjà présents, ignorés : {resultat.ignores.join(", ")}.
                </div>
              )}
              {resultat.erreurs.length > 0 && (
                <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-rose-100">
                  {resultat.erreurs.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</div>}
      <div className="mt-4 flex justify-between gap-3">
        {mode !== "choix" ? (
          <button onClick={() => { setMode("choix"); setError(null); }} disabled={occupe} className="btn-ghost">← Retour</button>
        ) : <span />}
        <button onClick={onClose} disabled={occupe} className="btn-ghost">{resultat || exportFait ? "Fermer" : "Annuler"}</button>
      </div>
    </ModalShell>
  );
}
