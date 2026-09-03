"use client";

import { useEffect, useState } from "react";
import { FlotteDocument, FlotteVehicule } from "@/lib/types";
import { formatDate, messageErreur } from "@/lib/format";
import { TYPES_DOC_FLOTTE, deposerDocumentFlotte, labelDocFlotte, supprimerDocumentFlotte, urlFichierFlotte } from "@/lib/flotte";
import { ouvrirFichier } from "@/lib/storage";
import { usePliage } from "@/lib/pliage";
import ModalShell from "@/components/ModalShell";
import FilePicker from "@/components/FilePicker";

/**
 * Documents du véhicule (v12.3) : carte grise, assurance, CNI du titulaire,
 * contrôle technique, photos, PV reçus… Chaque pièce a un type, un nom et
 * éventuellement une date d'expiration (alerte visuelle quand elle approche).
 */
export default function FlotteDocumentsPanel({
  vehicule,
  documents,
  onChanged,
}: {
  vehicule: FlotteVehicule;
  documents: FlotteDocument[];
  onChanged: () => void;
}) {
  const { plie, basculerPliage } = usePliage("flotte.documents", false);
  const [ajout, setAjout] = useState(false);
  const [vignettes, setVignettes] = useState<Record<string, string>>({});

  // Miniatures des photos (liens signés, bucket privé).
  useEffect(() => {
    let vivant = true;
    (async () => {
      const images = documents.filter((d) => /\.(jpe?g|png|webp|heic)$/i.test(d.path));
      const paires = await Promise.all(images.map(async (d) => [d.id, (await urlFichierFlotte(d.path)) || ""] as const));
      if (vivant) setVignettes(Object.fromEntries(paires));
    })();
    return () => { vivant = false; };
  }, [documents]);

  async function supprimer(d: FlotteDocument) {
    if (!confirm(`Supprimer « ${d.nom || labelDocFlotte(d.type)} » ?`)) return;
    try {
      await supprimerDocumentFlotte(d);
      onChanged();
    } catch (err) {
      alert(messageErreur(err, "Suppression impossible."));
    }
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const dans30j = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const presents = new Set(documents.map((d) => d.type));
  const manquants = TYPES_DOC_FLOTTE.filter((t) => ["carte_grise", "assurance", "controle_technique"].includes(t.type) && !presents.has(t.type));

  return (
    <section className="glass-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 sm:px-4 sm:py-2.5">
        <button onClick={basculerPliage} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={!plie}>
          <span className={`shrink-0 text-white/40 transition-transform ${plie ? "" : "rotate-90"}`} aria-hidden>▸</span>
          <h2 className="titre-bloc truncate">Documents du véhicule</h2>
          <span className="badge">{documents.length}</span>
        </button>
        {!plie && (
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <button onClick={() => setAjout(true)} className="btn-ghost py-1.5 px-3 text-xs">+ Document</button>
          </div>
        )}
      </div>

      {!plie && (
        <div className="space-y-3 px-4 py-4 sm:px-5">
          {manquants.length > 0 && (
            <p className="text-xs text-amber-200/80">
              Manque : {manquants.map((m) => m.label.toLowerCase()).join(", ")}.
            </p>
          )}
          {documents.length === 0 && (
            <p className="text-sm text-white/40">
              Aucun document. Ajoute la carte grise, l&apos;attestation d&apos;assurance, le contrôle technique, la pièce d&apos;identité du titulaire, des photos…
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((d) => {
              const expire = d.date_expiration;
              const etat = !expire ? null : expire < aujourdhui ? "expiré" : expire <= dans30j ? "expire bientôt" : null;
              return (
                <div key={d.id} className="glass-soft flex gap-3 p-3">
                  {vignettes[d.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={vignettes[d.id]} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/5 text-2xl">📄</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-white/50">{labelDocFlotte(d.type)}</div>
                    <div className="truncate text-sm text-white">{d.nom || "—"}</div>
                    <div className="text-xs text-white/40">
                      {formatDate(d.created_at)}
                      {expire ? ` · expire le ${formatDate(expire)}` : ""}
                    </div>
                    {etat && (
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${etat === "expiré" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                        {etat}
                      </span>
                    )}
                    <div className="mt-1 flex gap-3 text-xs">
                      <button onClick={() => ouvrirFichier("pieces", d.path)} className="text-accent-teal hover:underline">Ouvrir</button>
                      <button onClick={() => supprimer(d)} className="text-white/40 hover:text-rose-300">Supprimer</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ajout && (
        <AjoutDocumentModal vehicule={vehicule} onClose={() => setAjout(false)} onSaved={() => { setAjout(false); onChanged(); }} />
      )}
    </section>
  );
}

function AjoutDocumentModal({ vehicule, onClose, onSaved }: { vehicule: FlotteVehicule; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState("carte_grise");
  const [nom, setNom] = useState("");
  const [expiration, setExpiration] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typeInfo = TYPES_DOC_FLOTTE.find((t) => t.type === type);

  async function save() {
    if (!fichier) { setError("Choisis un fichier ou prends une photo."); return; }
    setSaving(true);
    setError(null);
    try {
      await deposerDocumentFlotte({
        vehiculeId: vehicule.id,
        type,
        fichier,
        nom: nom.trim() || fichier.name,
        dateExpiration: expiration || null,
      });
      onSaved();
    } catch (err) {
      setError(messageErreur(err, "Dépôt impossible (migration v67 exécutée ?)."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Document — ${vehicule.immatriculation}`} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label">Type</label>
          <select className="field-input" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES_DOC_FLOTTE.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Nom (optionnel)</label>
          <input className="field-input" value={nom} onChange={(e) => setNom(e.target.value)} placeholder={typeInfo?.label} />
        </div>
        {typeInfo?.expire && (
          <div>
            <label className="field-label">Date d&apos;expiration</label>
            <input type="date" className="field-input" value={expiration} onChange={(e) => setExpiration(e.target.value)} />
          </div>
        )}
      </div>
      <FilePicker value={fichier} onChange={setFichier} accept="application/pdf,image/*" label="Choisir le fichier" aide="PDF ou photo — ou prends-le en photo" />
      {error && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</div>}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Envoi…" : "Enregistrer"}</button>
      </div>
    </ModalShell>
  );
}
