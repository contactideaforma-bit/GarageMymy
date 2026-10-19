"use client";

import { useEffect, useState } from "react";
import ModalShell from "@/components/ModalShell";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import { INFOS_PLAQUE_ACTIF, LIGNES_INFOS, ReponseInfosPlaque, formaterPlaque } from "@/lib/infosPlaque";
import { formatDate } from "@/lib/format";

/**
 * INFOS PLAQUE (v13.47) : « je tape la plaque, j'ai la carte d'identité du
 * véhicule » — depuis la flotte, la fiche véhicule ou un dossier sinistre.
 * `onAppliquer` permet de recopier les infos dans la fiche / le dossier.
 */
export default function InfosPlaqueModal({
  immat,
  onClose,
  onAppliquer,
  libelleAppliquer = "Compléter la fiche avec ces infos",
}: {
  immat: string;
  onClose: () => void;
  onAppliquer?: (r: ReponseInfosPlaque) => Promise<void> | void;
  libelleAppliquer?: string;
}) {
  const [rep, setRep] = useState<ReponseInfosPlaque | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applique, setApplique] = useState<"non" | "encours" | "fait">("non");

  async function charger(force = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAuth(`/api/infos-plaque?immat=${encodeURIComponent(immat)}${force ? "&force=1" : ""}`);
      const r = await lireReponse<ReponseInfosPlaque>(res);
      if (!r.ok || !r.data) throw new Error(r.error || "Recherche impossible.");
      setRep(r.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [immat]);

  const lignes = rep ? LIGNES_INFOS.filter((l) => rep.infos[l.key] != null && rep.infos[l.key] !== "") : [];

  return (
    <ModalShell title={`Véhicule ${formaterPlaque(immat)}`} onClose={onClose} maxWidth="max-w-xl">
      {loading && <p className="py-6 text-center text-white/60">Recherche du véhicule…</p>}

      {!loading && error && (
        <div className="space-y-3">
          <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</div>
          <button onClick={() => charger()} className="btn-ghost">Réessayer</button>
        </div>
      )}

      {!loading && rep && (
        <div className="space-y-3">
          <div className="glass-soft p-3">
            <div className="text-lg font-semibold text-white">
              {[rep.infos.marque, rep.infos.modele].filter(Boolean).join(" ") || "Véhicule"}
            </div>
            {rep.infos.version && <div className="text-sm text-white/60">{rep.infos.version}</div>}
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {rep.infos.energie && <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/80">{rep.infos.energie}</span>}
              {rep.infos.puissance_fiscale != null && <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/80">{rep.infos.puissance_fiscale} CV</span>}
              {rep.infos.date_mise_circulation && <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/80">{formatDate(rep.infos.date_mise_circulation)}</span>}
              {rep.infos.boite && <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/80">{rep.infos.boite}</span>}
            </div>
          </div>

          <div className="glass-soft divide-y divide-white/5">
            {lignes.map((l) => {
              const v = rep.infos[l.key];
              return (
                <div key={l.key} className="flex justify-between gap-4 px-3 py-1.5 text-sm">
                  <span className="shrink-0 text-white/50">{l.label}</span>
                  <span className="min-w-0 break-words text-right font-medium text-white">{l.fmt ? l.fmt(v) : String(v)}</span>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-white/40">
            {rep.depuis_cache ? `Données déjà consultées le ${formatDate(rep.consulte_le)} (sans nouvelle requête).` : "Données obtenues à l'instant auprès du fournisseur."}
            {" "}Source : registre d&apos;immatriculation via API{rep.fournisseur ? ` (${rep.fournisseur})` : ""}. Ces caractéristiques décrivent le véhicule à sa mise en circulation.
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            {rep.depuis_cache && (
              <button onClick={() => charger(true)} className="btn-ghost" title="Nouvelle requête au fournisseur (payante)">Actualiser</button>
            )}
            {onAppliquer && (
              <button
                onClick={async () => { setApplique("encours"); try { await onAppliquer(rep); setApplique("fait"); } catch { setApplique("non"); } }}
                disabled={applique !== "non"}
                className="btn-primary"
              >
                {applique === "encours" ? "Enregistrement…" : applique === "fait" ? "Fiche complétée ✓" : libelleAppliquer}
              </button>
            )}
            <button onClick={onClose} className="btn-ghost">Fermer</button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/** Petit bouton « loupe » à poser à côté d'une immatriculation. */
export function BoutonInfosPlaque({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  if (!INFOS_PLAQUE_ACTIF) return null; // masqué tant que le service n'est pas souscrit
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      className={`inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white/80 hover:bg-white/20 ${className}`}
      title="Infos du véhicule d'après sa plaque (marque, modèle, énergie, VIN…)"
    >
      🔍 Infos plaque
    </button>
  );
}
