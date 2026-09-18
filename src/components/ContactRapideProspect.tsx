"use client";

import { useState } from "react";
import { Prospect, liensRecherche, telHref } from "@/lib/prospects";
import { messageErreur } from "@/lib/format";

/**
 * Bloc « Contact rapide » d'une fiche prospect (v13.3) : téléphone en grand
 * (appel en un clic), email, adresse, puis les boutons qui ouvrent la fiche
 * Google / Maps / PagesJaunes / annuaire officiel pour trouver ce que
 * l'annuaire des entreprises ne donne pas. Les coordonnées trouvées se
 * saisissent ICI, sans passer par l'onglet Fiche.
 */
export default function ContactRapideProspect({ p, onSave }: { p: Prospect; onSave: (patch: Partial<Prospect>) => Promise<void> }) {
  const [edition, setEdition] = useState(false);
  const [tel, setTel] = useState(p.tel || "");
  const [email, setEmail] = useState(p.email || "");
  const [site, setSite] = useState(p.site || "");
  const [contact, setContact] = useState(p.contact_nom || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const liens = liensRecherche(p);
  const adresse = [p.adresse, `${p.cp || ""} ${p.ville || ""}`.trim()].filter(Boolean).join(", ");
  const maps = liens.find((l) => l.key === "maps");

  function ouvrirEdition() {
    setTel(p.tel || ""); setEmail(p.email || ""); setSite(p.site || ""); setContact(p.contact_nom || "");
    setErr(null); setEdition(true);
  }
  async function enregistrer() {
    setSaving(true); setErr(null);
    try {
      await onSave({ tel: tel.trim() || null, email: email.trim() || null, site: site.trim() || null, contact_nom: contact.trim() || null });
      setEdition(false);
    } catch (e) { setErr(messageErreur(e, "Enregistrement impossible.")); } finally { setSaving(false); }
  }
  async function copier(v: string) {
    try { await navigator.clipboard.writeText(v); } catch { /* presse-papiers indisponible */ }
  }

  return (
    <section className="glass-card mb-4 p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Téléphone / email / adresse */}
        <div className="lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="titre-bloc">Contact rapide</h2>
            {!edition && <button type="button" className="btn-ghost btn-compact" onClick={ouvrirEdition}>✏️ Compléter les coordonnées</button>}
          </div>

          {!edition ? (
            <div className="space-y-2">
              {p.tel ? (
                <div className="flex flex-wrap items-center gap-2">
                  <a href={telHref(p.tel)} className="btn-primary px-5 py-3 text-xl tabular-nums">📞 {p.tel}</a>
                  <button type="button" className="btn-ghost btn-compact" onClick={() => copier(p.tel || "")} title="Copier le numéro">Copier</button>
                  {(p.contact_nom || p.gerant) && (
                    <span className="text-sm text-white/70">Demander : <b className="text-white">{p.contact_nom || p.gerant}</b>{p.contact_fonction ? ` (${p.contact_fonction})` : ""}</span>
                  )}
                </div>
              ) : (
                <div className="alerte alerte-warn">
                  <div className="alerte-titre">Pas encore de numéro</div>
                  <p className="text-xs">Clique sur « Fiche Google » ou « PagesJaunes » ci-contre : le téléphone y est presque toujours. Puis « Compléter les coordonnées » pour l&apos;enregistrer.</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/75">
                {p.email ? <a href={`mailto:${p.email}`} className="text-accent-teal hover:underline">✉️ {p.email}</a> : <span className="text-white/40">✉️ email inconnu</span>}
                {adresse && (
                  <a href={maps?.url} target="_blank" rel="noreferrer" className="hover:underline" title="Ouvrir dans Google Maps">📍 {adresse}</a>
                )}
                {p.site && <a href={liens.find((l) => l.key === "site")?.url} target="_blank" rel="noreferrer" className="text-accent-teal hover:underline">🌐 {p.site.replace(/^https?:\/\//, "")}</a>}
                {(p.siret || p.siren) && <span className="text-white/45">SIRET {p.siret || p.siren}</span>}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><label className="field-label">Téléphone</label><input type="tel" className="field-input" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="04 91 00 00 00" autoFocus /></div>
              <div><label className="field-label">Interlocuteur (patron, secrétaire…)</label><input className="field-input" value={contact} onChange={(e) => setContact(e.target.value)} /></div>
              <div><label className="field-label">Email</label><input type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><label className="field-label">Site web</label><input className="field-input" value={site} onChange={(e) => setSite(e.target.value)} placeholder="www.carrosserie-martin.fr" /></div>
              {err && <p className="text-xs text-rose-300 sm:col-span-2">{err}</p>}
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" className="btn-ghost btn-compact" onClick={() => setEdition(false)}>Annuler</button>
                <button type="button" className="btn-primary btn-compact" onClick={enregistrer} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
              </div>
            </div>
          )}
        </div>

        {/* Où trouver les infos */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">Trouver les infos du garage</div>
          <div className="grid grid-cols-2 gap-1.5">
            {liens.map((l) => (
              <a key={l.key} href={l.url} target="_blank" rel="noreferrer" title={l.aide} className="btn-ghost btn-compact justify-start whitespace-nowrap text-left">
                {l.icone} {l.label}
              </a>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-white/40">S&apos;ouvre dans un nouvel onglet. Le téléphone et les horaires sont dans l&apos;encart Google ; PagesJaunes donne souvent le nom du gérant.</p>
        </div>
      </div>
    </section>
  );
}
