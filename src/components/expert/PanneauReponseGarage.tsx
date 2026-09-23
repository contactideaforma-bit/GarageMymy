"use client";

/* ====================================================================
 *  RÉPONSE DU GARAGE (côté expert, v13.25)
 *
 *  La réponse reçue sur le lien unique : accord / contestation par point,
 *  commentaire, pièces jointes. Deux suites possibles, toujours confirmées :
 *  · le garage accepte tout → clore sur le chiffrage de l'expert ;
 *  · des points sont contestés → rouvrir le contrôle, les points contestés
 *    repassent « à trancher » (les autres décisions restent).
 * ==================================================================== */

import { useState } from "react";
import Icone from "@/components/expert/Icone";
import { formatDateTime } from "@/lib/format";
import { urlFichierExpert } from "@/lib/expertise/data";
import { Controle } from "@/lib/expertise/controle";

export default function PanneauReponseGarage({
  controle,
  onClore,
  onReexaminer,
  enCours,
}: {
  controle: Controle;
  onClore: () => void;
  onReexaminer: () => void;
  enCours: boolean;
}) {
  const rep = controle.reponse_garage;
  const [ouverture, setOuverture] = useState<string | null>(null);
  if (!rep) return null;
  const accords = rep.lignes.filter((l) => l.accord).length;
  const contestations = rep.lignes.length - accords;
  const traitee = Boolean(rep.traitee_le);

  async function ouvrir(path: string) {
    setOuverture(path);
    const url = await urlFichierExpert(path);
    setOuverture(null);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else alert("Pièce jointe introuvable.");
  }

  return (
    <div className={`rounded-xl border-2 p-3 ${traitee ? "border-white/15" : contestations ? "border-amber-500" : "border-emerald-500"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">
          <Icone nom="mail" /> Réponse du garage — {formatDateTime(rep.recu_le)}{rep.contact ? ` · ${rep.contact}` : ""}
          {traitee && <span className="badge badge-neutral ml-2">traitée</span>}
        </div>
        <div className="text-sm"><span className="badge badge-ok">{accords} accord(s)</span> <span className={`badge ${contestations ? "badge-warn" : "badge-neutral"}`}>{contestations} contestation(s)</span></div>
      </div>
      {rep.commentaire && <p className="mt-1 text-sm text-white/70">« {rep.commentaire} »</p>}
      <ul className="mt-2 space-y-1.5 text-sm">
        {rep.lignes.map((l) => {
          const e = controle.ecarts.find((x) => x.id === l.ecart_id);
          return (
            <li key={l.ecart_id} className="flex flex-wrap items-start gap-x-2">
              <span className={`badge ${l.accord ? "badge-ok" : "badge-warn"}`}>{l.accord ? "Accord" : "Conteste"}</span>
              <span className="font-medium">{e?.libelle || "Point"}</span>
              {l.commentaire && <span className="text-white/65">— {l.commentaire}</span>}
              {l.photos.map((p, i) => (
                <button key={p} className="btn-ghost btn-compact" disabled={ouverture === p} onClick={() => ouvrir(p)}><Icone nom="galerie" /> Pièce {i + 1}</button>
              ))}
            </li>
          );
        })}
      </ul>
      {!traitee && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {contestations > 0 ? (
            <button className="btn-primary btn-compact" disabled={enCours} onClick={onReexaminer}>Réexaminer les {contestations} point(s) contesté(s) <Icone nom="droite" /></button>
          ) : (
            <button className="btn-primary btn-compact" disabled={enCours} onClick={onClore}><Icone nom="check" /> Le garage s&apos;aligne : clore le contrôle</button>
          )}
        </div>
      )}
    </div>
  );
}
