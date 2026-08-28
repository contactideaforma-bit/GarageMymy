"use client";

// MES DOCUMENTS (v10.6) — espace commercial. Le commercial retrouve :
//   · son CONTRAT DE COLLABORATION (généré et signé sur sa fiche dans
//     l'espace éditeur — lecture RLS sur collaborateur_documents) ;
//   · toute la DOCUMENTATION du pack commercial (guide, kit de vente,
//     grille de commissions, plaquettes, modèles papier), servie par
//     /api/commercial/pack (liste blanche).

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { messageErreur, formatDate } from "@/lib/format";
import { ContexteCommercial, chargerContexteCommercial, nomCommercial } from "@/lib/commercialClient";
import type { CollaborateurDocument } from "@/lib/admin/client";
import type { ContenuContrat } from "@/lib/admin/contratCollaborateur";
import { construireContratCollaborateurPdf, prechargerLogoPdf } from "@/lib/admin/contratPdf";
import { DOCS_COMMERCIAL, DocPack, nomFichierDoc } from "@/lib/admin/packDocs";
import { fetchAuth } from "@/lib/apiClient";

async function telechargerPack(d: DocPack) {
  const res = await fetchAuth(`/api/commercial/pack?cle=${encodeURIComponent(d.cle)}`);
  if (!res.ok) throw new Error("Téléchargement impossible.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichierDoc(d);
  a.click();
  URL.revokeObjectURL(url);
}

export default function MesDocumentsPage() {
  const [ctx, setCtx] = useState<ContexteCommercial | null>(null);
  const [contrats, setContrats] = useState<CollaborateurDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    chargerContexteCommercial().then(setCtx).catch((e) => setErreur(messageErreur(e, "Espace commercial indisponible.")));
    supabase
      .from("collaborateur_documents")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setErreur(messageErreur(error, "Lecture impossible (migration v58 ?)."));
        else setContrats((data || []) as CollaborateurDocument[]);
        setLoading(false);
      });
  }, []);

  async function telechargerContrat(d: CollaborateurDocument) {
    await prechargerLogoPdf();
    const pdf = construireContratCollaborateurPdf(d.contenu as ContenuContrat, {
      nomCollaborateur: nomCommercial(ctx?.collaborateur || null),
      signatureEditeur: d.signature_editeur,
      signatureCollaborateur: d.signature_collaborateur,
      signeLe: d.signe_le,
    });
    pdf.save(`${d.titre.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.pdf`);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="titre-page">Mes documents</h1>
          <p className="text-sm text-white/50">Contrat de collaboration et documentation commerciale{ctx?.collaborateur ? ` — ${nomCommercial(ctx.collaborateur)}` : ""}.</p>
        </div>
        <Link href="/prospects" className="btn-ghost">👥 Mes clients</Link>
      </div>
      {erreur && <p className="badge badge-danger mb-4">{erreur}</p>}

      <div className="glass-card mb-4 p-4">
        <h2 className="mb-2 font-semibold text-white">Mon contrat de collaboration</h2>
        {loading && <p className="text-sm text-white/40">Chargement…</p>}
        {!loading && contrats.length === 0 && (
          <p className="text-sm text-white/40">Aucun contrat pour l&apos;instant — il est généré et signé avec l&apos;éditeur, puis apparaît ici.</p>
        )}
        <div className="space-y-2">
          {contrats.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">{d.titre}{d.version ? ` · ${d.version}` : ""}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-white/45">
                  <span className={`badge ${d.statut === "signe" ? "badge-ok" : "badge-warn"}`}>{d.statut === "signe" ? "Signé" : "Brouillon"}</span>
                  {d.signe_le ? <span>signé le {formatDate(d.signe_le)}</span> : <span>créé le {formatDate(d.created_at)}</span>}
                </div>
              </div>
              <button className="shrink-0 text-sm text-accent-pink hover:underline" onClick={() => telechargerContrat(d).catch((e) => alert(messageErreur(e, "PDF impossible.")))}>
                Télécharger le PDF
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card p-4">
        <h2 className="mb-2 font-semibold text-white">Documentation commerciale</h2>
        <p className="mb-3 text-xs text-white/45">Toujours la dernière version : guide, kit de vente, grille de commissions, plaquettes et modèles papier.</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {DOCS_COMMERCIAL.map((d) => (
            <div key={d.cle} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <span className="truncate text-sm text-white/80">📄 {d.titre}</span>
              <button className="shrink-0 text-sm text-accent-pink hover:underline" onClick={() => telechargerPack(d).catch((e) => alert(messageErreur(e, "Téléchargement impossible.")))}>
                Télécharger
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
