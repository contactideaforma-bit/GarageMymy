"use client";

// ============================================================
//  BOUTON « SITE INTERNET » DE LA FICHE CLIENT (v13.42)
//  Le commercial voit tout de suite si le garage possède déjà un site :
//   🌐 vert   = oui (ouvre le site) ;
//   🌐 gris   = vérifié, pas de site ;
//   🌐 orange = pas encore vérifié → recherche Google + saisie en 1 clic.
// ============================================================

import { useState } from "react";
import { Prospect, SITE_AUCUN, etatSite, urlSite } from "@/lib/prospects";

export default function SiteInternetProspect({ p, onSave }: { p: Prospect; onSave: (patch: Partial<Prospect>) => Promise<void> }) {
  const etat = etatSite(p);
  const [ouvert, setOuvert] = useState(false);
  const [url, setUrl] = useState(etat === "oui" ? p.site || "" : "");
  const [busy, setBusy] = useState(false);
  const recherche = `https://www.google.com/search?q=${encodeURIComponent(`${p.nom} ${p.ville || p.cp || ""} site officiel`)}`;

  async function enregistrer(valeur: string | null) {
    setBusy(true);
    try { await onSave({ site: valeur }); setOuvert(false); } finally { setBusy(false); }
  }

  const classe = etat === "oui" ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100" : etat === "non" ? "border-white/20 bg-white/5 text-white/60" : "border-amber-400/50 bg-amber-500/15 text-amber-100";
  const libelle = etat === "oui" ? "Site internet ✓" : etat === "non" ? "Pas de site internet" : "Site internet ?";

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        {etat === "oui" ? (
          <a href={urlSite(p.site!)} target="_blank" rel="noreferrer" className={`btn-compact rounded-full border px-3 text-xs font-semibold ${classe}`} title={`Ouvrir ${p.site}`}>🌐 {libelle}</a>
        ) : (
          <button type="button" onClick={() => setOuvert((o) => !o)} className={`btn-compact rounded-full border px-3 text-xs font-semibold ${classe}`} title={etat === "non" ? "Vérifié : ce garage n'a pas de site (argument pour une offre site web)" : "À vérifier : le garage a-t-il déjà un site ?"}>🌐 {libelle}</button>
        )}
        {etat === "oui" && <button type="button" onClick={() => setOuvert((o) => !o)} className="text-xs text-white/50 hover:text-white" title="Modifier">✎</button>}
      </div>
      {ouvert && (
        <div className="absolute right-0 z-20 mt-2 w-80 max-w-[90vw] glass-card p-3 shadow-xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Site internet du garage</div>
          <a href={recherche} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-accent-teal hover:underline">🔎 Chercher sur Google ({p.nom})</a>
          <input className="field-input field-compact mt-2 w-full" placeholder="www.le-garage.fr" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => enregistrer(SITE_AUCUN)} className="btn-ghost btn-compact">Il n&apos;a pas de site</button>
            <button type="button" disabled={busy || !url.trim()} onClick={() => enregistrer(url.trim())} className="btn-primary btn-compact">Enregistrer</button>
          </div>
          {etat !== "inconnu" && <button type="button" disabled={busy} onClick={() => enregistrer(null)} className="mt-2 text-[11px] text-white/40 hover:text-white">Remettre « à vérifier »</button>}
        </div>
      )}
    </div>
  );
}
