"use client";

/* ====================================================================
 *  SEUIL VEI (mode expert, v13.25)
 *
 *  Réparations retenues (TTC, ou HT si TVA récupérable) comparées à la
 *  valeur de remplacement moins la valeur de sauvegarde. Alerte « proche »
 *  au-delà du seuil du cabinet (80 % par défaut), « VEI » au-delà de 100 %.
 *  La VRADE se saisit ici, elle est enregistrée sur le dossier.
 * ==================================================================== */

import { useEffect, useState } from "react";
import { formatEuros, messageErreur } from "@/lib/format";
import { majDossier } from "@/lib/expertise/data";
import { analyseVei } from "@/lib/expertise/controle";
import { Cabinet, DossierExpert } from "@/lib/expertise/types";

export default function PanneauVei({
  dossier,
  cabinet,
  totalHT,
  onDossierChange,
  lectureSeule,
}: {
  dossier: DossierExpert;
  cabinet: Cabinet | null;
  totalHT: number;
  onDossierChange: (d: DossierExpert) => void;
  lectureSeule?: boolean;
}) {
  const [vrade, setVrade] = useState(dossier.valeur_remplacement ? String(dossier.valeur_remplacement) : "");
  const [sauvegarde, setSauvegarde] = useState(dossier.valeur_sauvegarde ? String(dossier.valeur_sauvegarde) : "");
  const [etat, setEtat] = useState<string | null>(null);
  useEffect(() => { setVrade(dossier.valeur_remplacement ? String(dossier.valeur_remplacement) : ""); setSauvegarde(dossier.valeur_sauvegarde ? String(dossier.valeur_sauvegarde) : ""); }, [dossier.id, dossier.valeur_remplacement, dossier.valeur_sauvegarde]);

  const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, "").replace(",", ".")) || 0 : null);
  const a = analyseVei({ totalHT, tauxTva: cabinet?.taux_tva, tvaRecuperable: dossier.conclusions?.tva_recuperable, vrade: num(vrade), sauvegarde: num(sauvegarde), seuilPct: cabinet?.seuil_vei });

  async function enregistrer() {
    const v = num(vrade);
    const s = num(sauvegarde);
    if (v === (dossier.valeur_remplacement ?? null) && s === (dossier.valeur_sauvegarde ?? null)) return;
    setEtat("…");
    try {
      onDossierChange(await majDossier(dossier.id, { valeur_remplacement: v, valeur_sauvegarde: s }));
      setEtat("✓");
    } catch (e) { setEtat(messageErreur(e, "Non enregistré (migration v88 exécutée ?)")); }
  }

  const couleur = a?.niveau === "vei" ? "bg-rose-500" : a?.niveau === "proche" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className={`rounded-xl border-2 p-3 ${a?.niveau === "vei" ? "border-rose-500" : a?.niveau === "proche" ? "border-amber-500" : "border-white/10"}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="font-semibold">Seuil VEI</div>
        <label className="text-xs">VRADE (TTC)
          <input className="field-input field-compact mt-0.5 w-28 text-right" inputMode="decimal" disabled={lectureSeule} value={vrade} onChange={(e) => setVrade(e.target.value)} onBlur={enregistrer} placeholder="ex. 7 000" />
        </label>
        <label className="text-xs">Valeur de sauvegarde
          <input className="field-input field-compact mt-0.5 w-28 text-right" inputMode="decimal" disabled={lectureSeule} value={sauvegarde} onChange={(e) => setSauvegarde(e.target.value)} onBlur={enregistrer} placeholder="épave" />
        </label>
        {etat && <span className="text-xs text-white/50">{etat}</span>}
      </div>
      {a ? (
        <div className="mt-2">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span>Réparations retenues : <b>{formatEuros(a.montant)} {a.base}</b> / seuil {formatEuros(a.seuilMontant)}</span>
            <b className={a.niveau === "vei" ? "text-rose-600" : a.niveau === "proche" ? "text-amber-600" : "text-emerald-600"}>{a.ratio} %</b>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${couleur}`} style={{ width: `${Math.min(100, a.ratio)}%` }} /></div>
          {a.niveau === "vei" && <p className="mt-1 text-sm font-semibold text-rose-600">Réparations supérieures à la valeur du véhicule : procédure VEI à envisager avant toute validation.</p>}
          {a.niveau === "proche" && <p className="mt-1 text-sm text-amber-700">Proche du seuil : attention aux suppléments (démontage, pièces).</p>}
        </div>
      ) : (
        <p className="mt-1 text-xs text-white/50">Renseigne la valeur de remplacement pour être alerté quand les réparations approchent la valeur du véhicule.</p>
      )}
    </div>
  );
}
