"use client";

// COLLABORATEURS (v53 → v10.6) : commerciaux et secrétaires — fiches,
// garages rattachés, solde dû / payé, demandes ouvertes. Chaque carte
// OUVRE LA FICHE (/admin/collaborateurs/[id]) : compte commercial,
// contrat de collaboration à signer, documents d'information.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminShell, { dateFr, euros } from "@/components/admin/AdminShell";
import CollaborateurFormModal from "@/components/admin/CollaborateurFormModal";
import { Abonnement, Collaborateur, CompteAuth, Demande, Reglement, lireComptes, lireTable, nomCollab, supprimerLigne } from "@/lib/admin/client";

const VIDE: Partial<Collaborateur> = { type: "commercial", nom: "", prenom: "", email: "", tel: "", siret: "", adresse: "", statut: "actif", date_debut: "", date_fin: "", iban: "", taux_retrocession: null, taux_horaire: null, notes: "", code_apporteur: "" };

export default function CollaborateursPage() {
  const [collabs, setCollabs] = useState<Collaborateur[]>([]);
  const [abos, setAbos] = useState<Abonnement[]>([]);
  const [regs, setRegs] = useState<Reglement[]>([]);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<"tous" | "commercial" | "secretaire">("tous");
  const [form, setForm] = useState<Partial<Collaborateur> | null>(null);
  const [comptes, setComptes] = useState<CompteAuth[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, a, r, d, cp] = await Promise.all([
        lireTable<Collaborateur>("collaborateurs"), lireTable<Abonnement>("abonnements"),
        lireTable<Reglement>("collaborateur_reglements"), lireTable<Demande>("collaborateur_demandes"), lireComptes(),
      ]);
      setCollabs(c); setAbos(a); setRegs(r); setDemandes(d); setComptes(cp); setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Lecture impossible.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const m = new Map<string, { garages: number; actifs: number; du: number; paye: number; demandes: number }>();
    for (const c of collabs) m.set(c.id, { garages: 0, actifs: 0, du: 0, paye: 0, demandes: 0 });
    for (const a of abos) for (const id of [a.commercial_id, a.secretaire_id]) {
      const s = id ? m.get(id) : null;
      if (s) { s.garages += 1; if (a.statut === "actif") s.actifs += 1; }
    }
    for (const r of regs) {
      const s = m.get(r.collaborateur_id);
      if (!s) continue;
      if (r.statut === "a_payer") s.du += Number(r.montant) || 0;
      if (r.statut === "paye") s.paye += Number(r.montant) || 0;
    }
    for (const d of demandes) { const s = m.get(d.collaborateur_id); if (s && d.statut !== "close") s.demandes += 1; }
    return m;
  }, [collabs, abos, regs, demandes]);

  const visibles = collabs.filter((c) => filtre === "tous" || c.type === filtre);

  async function supprimer(c: Collaborateur) {
    if (!confirm(`Supprimer ${nomCollab(c)} ? Ses relevés, contrats et demandes seront effacés.`)) return;
    try { await supprimerLigne("collaborateurs", c.id); load(); } catch (e) { alert(e instanceof Error ? e.message : "Suppression impossible."); }
  }

  return (
    <AdminShell titre="Collaborateurs" actions={<button className="btn-primary" onClick={() => setForm({ ...VIDE })}>+ Collaborateur</button>}>
      {erreur && <p className="badge badge-danger">{erreur}</p>}
      <div className="segment">
        {([["tous", "Tous"], ["commercial", "Commerciaux"], ["secretaire", "Secrétaires"]] as const).map(([v, l]) => (
          <button key={v} className={`segment-btn ${filtre === v ? "actif" : ""}`} onClick={() => setFiltre(v)}>{l}</button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading && <p className="text-sm text-white/40">Chargement…</p>}
        {!loading && visibles.length === 0 && <p className="text-sm text-white/40">Aucun collaborateur.</p>}
        {visibles.map((c) => {
          const s = stats.get(c.id)!;
          return (
            <div key={c.id} className="glass-card p-4 transition-colors hover:border-white/25">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/admin/collaborateurs/${c.id}`} className="block truncate font-semibold text-white hover:text-accent-pink hover:underline">
                    {nomCollab(c)}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className={`badge ${c.type === "commercial" ? "badge-info" : "badge-ok"}`}>{c.type === "commercial" ? "Commercial" : "Secrétaire"}</span>
                    <span className={`badge ${c.statut === "actif" ? "badge-ok" : c.statut === "pause" ? "badge-warn" : "badge-neutral"}`}>{c.statut === "actif" ? "Actif" : c.statut === "pause" ? "En pause" : "Terminé"}</span>
                    {s.demandes > 0 && <span className="badge badge-warn">{s.demandes} demande{s.demandes > 1 ? "s" : ""}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2 text-sm">
                  <Link href={`/admin/collaborateurs/${c.id}`} className="text-accent-pink hover:underline">Fiche</Link>
                  <button className="text-white/40 hover:text-rose-300" onClick={() => supprimer(c)}>Suppr.</button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><div className="valeur-hud text-white">{s.actifs}<span className="text-xs text-white/40">/{s.garages}</span></div><div className="text-[11px] text-white/45">garages actifs</div></div>
                <div><div className="valeur-hud text-amber-300">{euros(s.du)}</div><div className="text-[11px] text-white/45">à payer</div></div>
                <div><div className="valeur-hud text-emerald-300">{euros(s.paye)}</div><div className="text-[11px] text-white/45">déjà payé</div></div>
              </div>
              <div className="mt-3 space-y-0.5 text-xs text-white/60">
                {c.email && <div className="truncate">{c.email}</div>}
                {c.tel && <div>{c.tel}</div>}
                {c.siret && <div>SIRET {c.siret}</div>}
                {c.type === "secretaire" && <div>Taux horaire : {c.taux_horaire != null ? `${Number(c.taux_horaire)} €/h` : "17 €/h (défaut)"}</div>}
                {c.type === "commercial" && (c.zone || c.portefeuille) && <div>Zone : {c.zone || "—"}{c.portefeuille ? ` · portefeuille : ${c.portefeuille}` : ""}</div>}
                {c.type === "commercial" && <div>Compte : {c.owner_id ? comptes.find((x) => x.id === c.owner_id)?.email || c.owner_id : <span className="text-amber-300">non rattaché — ouvre la fiche pour le créer</span>}</div>}
                {c.type === "commercial" && (
                  <div>
                    Code apporteur :{" "}
                    {c.code_apporteur ? <b className="font-mono text-white">{c.code_apporteur}</b> : <span className="text-amber-300">à définir (page /vente)</span>}
                  </div>
                )}
                {c.date_debut && <div>Depuis le {dateFr(c.date_debut)}{c.date_fin ? ` · fin le ${dateFr(c.date_fin)}` : ""}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {form && <CollaborateurFormModal initial={form} comptes={comptes} onClose={() => setForm(null)} onSaved={load} />}
    </AdminShell>
  );
}
