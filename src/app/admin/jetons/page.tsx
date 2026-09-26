"use client";

// JETONS COURRIERS — console éditeur (v13.28) : soldes des garages, achats
// Qonto (payés / en attente), consommation, crédit manuel (geste commercial,
// virement reçu hors lien de paiement, correction).

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell, { ChampAdmin, dateFr, euros } from "@/components/admin/AdminShell";
import ModalShell from "@/components/ModalShell";
import { fetchAuth, lireReponse } from "@/lib/apiClient";

type Donnees = {
  comptes: { id: string; email: string }[];
  garages: Record<string, string | null>;
  soldes: { owner_id: string; solde: number; updated_at: string }[];
  achats: { id: string; owner_id: string; pack: string; jetons: number; montant_ht: number; montant_ttc: number; statut: string; created_at: string; paye_le: string | null; qonto_url: string | null }[];
  envois: { owner_id: string; type: string; jetons: number; statut: string; created_at: string }[];
};

export default function AdminJetonsPage() {
  const [d, setD] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [credit, setCredit] = useState<{ ownerId: string; jetons: string; libelle: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await lireReponse<Donnees>(await fetchAuth("/api/jetons/admin"));
    if (r.error) setErreur(r.error); else { setD(r.data); setErreur(null); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const nom = useCallback((id: string) => d?.garages[id] || d?.comptes.find((c) => c.id === id)?.email || id.slice(0, 8), [d]);

  const k = useMemo(() => {
    if (!d) return null;
    const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0);
    const payes = d.achats.filter((a) => a.statut === "paye");
    const mois = payes.filter((a) => new Date(a.paye_le || a.created_at) >= debutMois);
    return {
      caMoisHt: mois.reduce((s, a) => s + Number(a.montant_ht), 0),
      caTotalHt: payes.reduce((s, a) => s + Number(a.montant_ht), 0),
      enCirculation: d.soldes.reduce((s, x) => s + x.solde, 0),
      consommesMois: d.envois.filter((e) => new Date(e.created_at) >= debutMois).reduce((s, e) => s + (e.jetons || 0), 0),
      attente: d.achats.filter((a) => a.statut === "en_attente").length,
    };
  }, [d]);

  async function envoyer(body: Record<string, unknown>) {
    setBusy(true);
    const r = await lireReponse(await fetchAuth("/api/jetons/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    setBusy(false);
    if (r.error) { alert(r.error); return false; }
    await load();
    return true;
  }

  const lignes = useMemo(() => {
    if (!d) return [];
    const ids = new Set<string>([...d.soldes.map((s) => s.owner_id), ...d.comptes.map((c) => c.id)]);
    return Array.from(ids).map((id) => ({
      id,
      solde: d.soldes.find((s) => s.owner_id === id)?.solde ?? 0,
      envois: d.envois.filter((e) => e.owner_id === id).length,
      achete: d.achats.filter((a) => a.owner_id === id && a.statut === "paye").reduce((s, a) => s + Number(a.montant_ht), 0),
    })).sort((a, b) => b.envois - a.envois || b.solde - a.solde);
  }, [d]);

  return (
    <AdminShell titre="Jetons courriers La Poste" actions={<button onClick={load} className="btn-ghost btn-compact">↻ Actualiser (vérifie les paiements)</button>}>
      {erreur && <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{erreur}</div>}
      {k && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[["Ventes du mois (HT)", euros(k.caMoisHt)], ["Ventes totales (HT)", euros(k.caTotalHt)], ["Jetons non consommés", String(k.enCirculation)], ["Consommés ce mois", String(k.consommesMois)], ["Paiements en attente", String(k.attente)]].map(([l, v]) => (
            <div key={l} className="glass-soft p-3"><div className="text-[11px] uppercase tracking-wide text-white/50">{l}</div><div className="text-xl font-bold text-white">{v}</div></div>
          ))}
        </div>
      )}

      <section className="glass-card p-4">
        <h2 className="titre-bloc mb-2">Garages</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-white/50"><th className="py-1">Garage</th><th>Solde</th><th>Envois</th><th>Acheté (HT)</th><th /></tr></thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} className="border-t border-white/10">
                  <td className="py-1.5 text-white">{nom(l.id)}</td>
                  <td className={l.solde < 5 ? "text-amber-300" : "text-white"}>{l.solde}</td>
                  <td>{l.envois}</td>
                  <td>{euros(l.achete)}</td>
                  <td className="text-right"><button onClick={() => setCredit({ ownerId: l.id, jetons: "10", libelle: "Jetons offerts" })} className="btn-ghost btn-compact">± Jetons</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-card p-4">
        <h2 className="titre-bloc mb-2">Achats</h2>
        {!d?.achats.length && <p className="text-sm text-white/45">Aucun achat pour l&apos;instant.</p>}
        <ul className="divide-y divide-white/10 text-sm">
          {d?.achats.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="text-white/85">{dateFr(a.created_at)} · <strong className="text-white">{nom(a.owner_id)}</strong> · {a.pack} ({a.jetons} j.) · {euros(Number(a.montant_ttc))} TTC · réf. {a.id.slice(0, 8).toUpperCase()}</span>
              <span className="flex items-center gap-1">
                <span className={`badge ${a.statut === "paye" ? "badge-ok" : a.statut === "en_attente" ? "badge-warn" : "badge-neutral"}`}>{a.statut === "paye" ? "Payé" : a.statut === "en_attente" ? "En attente" : a.statut === "expire" ? "Expiré" : "Annulé"}</span>
                {a.statut === "en_attente" && (
                  <button disabled={busy} onClick={() => { if (confirm(`Marquer payé (virement reçu) et créditer ${a.jetons} jetons à ${nom(a.owner_id)} ?`)) envoyer({ achatId: a.id }); }} className="btn-ghost btn-compact">Payé par virement</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {credit && (
        <ModalShell title={`Jetons — ${nom(credit.ownerId)}`} onClose={() => setCredit(null)}>
          <ChampAdmin label="Nombre de jetons (négatif pour retirer)"><input type="number" className="field-input field-compact w-full" value={credit.jetons} onChange={(e) => setCredit({ ...credit, jetons: e.target.value })} /></ChampAdmin>
          <ChampAdmin label="Motif (visible par le garage)"><input className="field-input field-compact w-full" value={credit.libelle} onChange={(e) => setCredit({ ...credit, libelle: e.target.value })} /></ChampAdmin>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCredit(null)} className="btn-ghost btn-compact">Annuler</button>
            <button disabled={busy} onClick={async () => { const n = Number(credit.jetons); if (await envoyer({ ownerId: credit.ownerId, jetons: n, libelle: credit.libelle, motif: n > 0 ? "geste" : "ajustement" })) setCredit(null); }} className="btn-primary btn-compact">Valider</button>
          </div>
        </ModalShell>
      )}
    </AdminShell>
  );
}
