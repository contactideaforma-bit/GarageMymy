"use client";

// Liste des courriers envoyés par La Poste (Maileva) — v13.27.
// Partagée par la fiche dossier et la page « Courriers La Poste ».

import Link from "next/link";
import { useState } from "react";
import { EnvoiPostal, LIBELLE_TYPE_ENVOI, STATUT_ENVOI } from "@/lib/envoisPostaux";
import { ouvrirPreuve } from "@/lib/envoisPostauxClient";
import { ouvrirFichier } from "@/lib/storage";
import { formatDateTime } from "@/lib/format";

export default function EnvoisPostauxListe({
  envois,
  dossiers,
}: {
  envois: EnvoiPostal[];
  /** id → libellé du dossier (page globale). */
  dossiers?: Record<string, string>;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function preuve(e: EnvoiPostal, quoi: "ar" | "depot" | "archive") {
    setErreur(null);
    const err = await ouvrirPreuve(e.id, quoi);
    if (err) setErreur(err);
  }

  if (!envois.length) return null;
  return (
    <div className="space-y-1.5">
      {erreur && <p className="text-xs text-rose-300">{erreur}</p>}
      <ul className="space-y-1.5">
        {envois.map((e) => {
          const st = STATUT_ENVOI[e.statut] || STATUT_ENVOI.soumis;
          const envoye = Boolean(e.maileva_sending_id);
          return (
            <li key={e.id} className="carte-liste text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{e.type === "lrar" ? "📮" : "✉"} {LIBELLE_TYPE_ENVOI[e.type]}</span>
                    <span className={`badge ${st.badge}`} title={st.aide}>{st.label}</span>
                    {e.environnement === "sandbox" && <span className="badge badge-neutral" title="Envoi simulé : rien n'est imprimé">TEST</span>}
                    {e.numero_suivi && <span className="font-mono text-xs text-white/70">n° {e.numero_suivi}</span>}
                  </div>
                  <div className="truncate text-xs text-white/60">
                    → {e.destinataire_nom || "—"}{e.objet ? ` · ${e.objet}` : ""}
                  </div>
                  <div className="text-xs text-white/40">
                    {formatDateTime(e.soumis_le || e.created_at)}
                    {dossiers && e.dossier_id && dossiers[e.dossier_id] && (
                      <> · <Link href={`/sinistres/${e.dossier_id}`} className="text-accent-teal hover:underline">{dossiers[e.dossier_id]}</Link></>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {e.pdf_path && <button onClick={() => ouvrirFichier("pieces", e.pdf_path!)} className="btn-ghost btn-compact" title="Le PDF tel qu'il a été envoyé">📄 PDF</button>}
                  {envoye && e.type === "lrar" && <button onClick={() => preuve(e, "depot")} className="btn-ghost btn-compact">Preuve de dépôt</button>}
                  {envoye && e.type === "lrar" && e.ar_scanne && <button onClick={() => preuve(e, "ar")} className="btn-ghost btn-compact">Avis de réception</button>}
                  <button onClick={() => setOuvert(ouvert === e.id ? null : e.id)} className="btn-ghost btn-compact">{ouvert === e.id ? "▴" : "Suivi ▾"}</button>
                </div>
              </div>
              {e.statut === "erreur" && e.erreur && <p className="mt-1 text-xs text-rose-300">{e.erreur}</p>}
              {ouvert === e.id && (
                <div className="mt-2 space-y-1 rounded-lg bg-white/5 p-2 text-xs text-white/70">
                  <div className="whitespace-pre-line text-white/80">{(e.adresse_lignes || []).filter(Boolean).join("\n")}</div>
                  <div className="text-white/50">
                    {e.recto_verso ? "Recto verso" : "Recto"} · {e.couleur ? "couleur" : "noir et blanc"}{e.type === "lrar" ? ` · AR ${e.ar_scanne ? "scanné" : "papier"}` : ""}
                    {e.statut_maileva ? ` · Maileva : ${e.statut_maileva}` : ""}
                  </div>
                  <ul className="mt-1 space-y-0.5 border-t border-white/10 pt-1">
                    {(e.historique || []).map((h, i) => (
                      <li key={i}><span className="text-white/40">{h.date ? formatDateTime(h.date) : "—"}</span> · {STATUT_ENVOI[h.statut as keyof typeof STATUT_ENVOI]?.label || h.statut}{h.detail ? ` — ${h.detail}` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
