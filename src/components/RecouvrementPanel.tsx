"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Document, Dossier, Paiement, Relance } from "@/lib/types";
import { formatEuros, messageErreur } from "@/lib/format";
import {
  EtatRecouvrement,
  etatRecouvrement,
  euroRecuperes,
  libelleEtat,
} from "@/lib/recouvrement";
import { generateMiseEnDemeurePdf } from "@/lib/pdf";

/**
 * RECOUVREMENT (v50) — le poste de pilotage des impayés.
 *
 * Trois choses seulement, dans cet ordre :
 *   1. ce que les relances ont RAPPORTÉ (c'est ce qui donne envie de s'en
 *      servir) ;
 *   2. ce qu'il faut faire AUJOURD'HUI, facture par facture ;
 *   3. le bouton qui produit la mise en demeure, prête à envoyer.
 *
 * Les relances 1 et 2 partent toutes seules (cron). Seule la mise en
 * demeure attend une décision humaine : c'est un acte juridique.
 */

export type LigneRecouvrement = Document & {
  dossier: Dossier | null;
  paiements: Paiement[];
  relances: Relance[];
};

export default function RecouvrementPanel({
  lignes,
  onRelancer,
}: {
  lignes: LigneRecouvrement[];
  /** Ouvre le composeur d'email sur cette facture. */
  onRelancer?: (l: LigneRecouvrement) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const etats = useMemo(
    () =>
      lignes
        .map((l) => ({
          ligne: l,
          etat: etatRecouvrement(l, l.paiements, l.relances),
        }))
        .filter((x) => x.etat.reste > 0.01 && x.etat.retard > 0)
        .sort((a, b) => b.etat.retard - a.etat.retard),
    [lignes]
  );

  const recupere = useMemo(
    () =>
      euroRecuperes(
        lignes,
        lignes.flatMap((l) => l.paiements),
        lignes.flatMap((l) => l.relances)
      ),
    [lignes]
  );

  const aFaire = etats.filter((x) => x.etat.aFaire);
  const enDemeure = etats.filter((x) => x.etat.aFaire?.manuel);
  const totalDu = etats.reduce((s, x) => s + x.etat.reste, 0);

  async function miseEnDemeure(l: LigneRecouvrement, etat: EtatRecouvrement) {
    if (!l.dossier) return;
    setBusy(l.id);
    setErreur(null);
    try {
      // Destinataire : l'assurance quand elle est le débiteur (cession ou
      // prise en charge), sinon le client. Les pénalités « pro » ne
      // s'appliquent qu'au premier cas.
      const versAssurance = Boolean(l.dossier.mode_cession || l.dossier.mode_pec);
      await generateMiseEnDemeurePdf(
        l,
        l.dossier,
        versAssurance
          ? {
              nom: l.dossier.assureur || "L'assureur",
              adresse: l.dossier.assureur_adresse || null,
              codePostalVille: null,
              professionnel: true,
            }
          : {
              nom: l.dossier.client_nom || "Le client",
              adresse: l.dossier.client_adresse || null,
              codePostalVille: `${l.dossier.client_code_postal || ""} ${l.dossier.client_ville || ""}`.trim(),
              professionnel: false,
            },
        etat.reste
      );
    } catch (err) {
      setErreur(messageErreur(err, "Mise en demeure impossible à générer."));
    }
    setBusy(null);
  }

  return (
    <section className="glass-card mb-6 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="titre-section">
          Recouvrement
          {aFaire.length > 0 && <span className="badge badge-warn ml-2">{aFaire.length} à traiter</span>}
        </h2>
        {recupere.montant > 0 && (
          <p className="text-xs text-emerald-300">
            {formatEuros(recupere.montant)} encaissés après relance sur {recupere.factures} facture
            {recupere.factures > 1 ? "s" : ""}
          </p>
        )}
      </div>

      {etats.length === 0 ? (
        <p className="py-4 text-sm text-emerald-300/80">
          Aucune facture en retard. Les relances des paliers 1 et 2 partent toutes seules.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-white/45">
            {formatEuros(totalDu)} en souffrance · escalade automatique J+15 (courtoise) puis J+30
            (ferme) ; la mise en demeure J+45 reste à votre décision.
            {enDemeure.length > 0 && (
              <span className="ml-1 text-rose-300">
                {enDemeure.length} mise{enDemeure.length > 1 ? "s" : ""} en demeure à envoyer.
              </span>
            )}
          </p>

          <div className="space-y-2">
            {etats.slice(0, 20).map(({ ligne, etat }) => (
              <div key={ligne.id} className="carte-liste p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {ligne.numero || "Facture"} · {formatEuros(etat.reste)} dus
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-white/50">
                      {ligne.dossier?.client_nom || "—"}
                      {ligne.dossier?.assureur ? ` · ${ligne.dossier.assureur}` : ""}
                      {ligne.dossier?.numero_sinistre ? ` · sinistre ${ligne.dossier.numero_sinistre}` : ""}
                    </p>
                  </div>
                  <span className={etat.aFaire?.badge || (etat.contentieux ? "badge badge-danger" : "badge badge-neutral")}>
                    {libelleEtat(etat)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-white/40">
                    {etat.faites} relance{etat.faites > 1 ? "s" : ""} envoyée{etat.faites > 1 ? "s" : ""}
                  </span>
                  {onRelancer && (
                    <button onClick={() => onRelancer(ligne)} className="btn-ghost btn-compact">
                      Relancer par email
                    </button>
                  )}
                  {(etat.aFaire?.manuel || etat.contentieux || etat.faites >= 2) && (
                    <button
                      onClick={() => miseEnDemeure(ligne, etat)}
                      disabled={busy === ligne.id}
                      className="btn-primary btn-compact"
                    >
                      {busy === ligne.id ? "PDF…" : "Mise en demeure (PDF)"}
                    </button>
                  )}
                  {ligne.dossier && (
                    <Link
                      href={`/sinistres/${ligne.dossier.id}`}
                      className="text-xs text-white/45 hover:text-white hover:underline"
                    >
                      Ouvrir le dossier
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          {etats.length > 20 && (
            <p className="mt-2 text-xs text-white/35">
              {etats.length - 20} autre(s) facture(s) en retard, visibles dans la liste ci-dessous.
            </p>
          )}
        </>
      )}

      {erreur && (
        <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
          {erreur}
        </div>
      )}
    </section>
  );
}
