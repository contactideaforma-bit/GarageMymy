"use client";

// TABLEAU DE BORD DE L'ÉDITEUR (v53) : ce que rapporte le portefeuille,
// ce qui reste à encaisser et à payer, ce qui demande une action.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell, { euros, moisFr } from "@/components/admin/AdminShell";
import { Abonnement, Collaborateur, Demande, Mensualite, Reglement, lireParametres, lireTable, nomCollab } from "@/lib/admin/client";
import { PARAMETRES_DEFAUT, Parametres, margeAbonnement, retrocessionMensuelle } from "@/lib/admin/economie";

export default function AdminAccueil() {
  const [p, setP] = useState<Parametres>(PARAMETRES_DEFAUT);
  const [abos, setAbos] = useState<Abonnement[]>([]);
  const [mens, setMens] = useState<Mensualite[]>([]);
  const [regs, setRegs] = useState<Reglement[]>([]);
  const [collabs, setCollabs] = useState<Collaborateur[]>([]);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [a, m, r, c, d, pp] = await Promise.all([
        lireTable<Abonnement>("abonnements"), lireTable<Mensualite>("abonnement_mensualites"), lireTable<Reglement>("collaborateur_reglements"),
        lireTable<Collaborateur>("collaborateurs"), lireTable<Demande>("collaborateur_demandes"), lireParametres(),
      ]);
      setAbos(a); setMens(m); setRegs(r); setCollabs(c); setDemandes(d); setP(pp); setErreur(null);
    } catch (e) { setErreur(e instanceof Error ? e.message : "Lecture impossible — la migration v53 est-elle passée ?"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const k = useMemo(() => {
    const actifs = abos.filter((a) => a.statut === "actif");
    const ca = actifs.reduce((s, a) => s + Number(a.prix_ht), 0);
    const retro = actifs.reduce((s, a) => s + (a.secretaire_id ? retrocessionMensuelle(p.formules[a.formule].heures, collabs.find((c) => c.id === a.secretaire_id)?.taux_horaire ?? null, p) : 0), 0);
    const tech = actifs.length * p.coutTechnique;
    const margeMensuelle = ca - retro - tech - p.coutsFixes;
    const aujourdhui = new Date();
    const impayees = mens.filter((m) => !m.payee_le && new Date(m.periode) <= aujourdhui);
    const aPayer = regs.filter((r) => r.statut === "a_payer");
    const margeCumulee = abos.reduce((s, a) => s + margeAbonnement(a, mens, regs, p), 0) - 0;
    const encaisse = mens.filter((m) => m.payee_le).reduce((s, m) => s + Number(m.montant_ht), 0);
    return { actifs: actifs.length, ca, retro, tech, margeMensuelle, impayees, aPayer, margeCumulee, encaisse, demandesOuvertes: demandes.filter((d) => d.statut !== "close") };
  }, [abos, mens, regs, collabs, demandes, p]);

  const parAbo = useMemo(() => new Map(abos.map((a) => [a.id, a])), [abos]);

  return (
    <AdminShell titre="Tableau de bord">
      {erreur && <p className="badge badge-danger">{erreur}</p>}
      {loading ? <p className="text-sm text-white/40">Chargement…</p> : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi titre="Garages actifs" valeur={String(k.actifs)} sous={`${collabs.filter((c) => c.statut === "actif" && c.type === "commercial").length} commerciaux · ${collabs.filter((c) => c.statut === "actif" && c.type === "secretaire").length} secrétaires actifs`} />
            <Kpi titre="CA mensuel récurrent" valeur={euros(k.ca)} sous={`secrétaires ${euros(k.retro)} · technique ${euros(k.tech)}`} />
            <Kpi titre="Résultat mensuel théorique" valeur={euros(k.margeMensuelle)} sous={`après coûts fixes ${euros(p.coutsFixes)}, hors commissions`} accent />
            <Kpi titre="Encaissé depuis le début" valeur={euros(k.encaisse)} sous={`marge nette cumulée ${euros(k.margeCumulee)} (commissions déduites)`} />
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <Bloc titre="À encaisser" lien="/admin/abonnements" compteur={k.impayees.length} vide="Toutes les mensualités échues sont encaissées.">
              {k.impayees.slice(0, 6).map((m) => (
                <li key={m.id} className="flex justify-between gap-2 text-sm"><span className="truncate text-white/80">{parAbo.get(m.abonnement_id)?.garage_nom || "—"} · {moisFr(m.periode)}</span><span className="tabular-nums text-rose-300">{euros(m.montant_ht)}</span></li>
              ))}
            </Bloc>
            <Bloc titre="À payer aux collaborateurs" lien="/admin/reglements" compteur={k.aPayer.length} vide="Rien à payer. Pensez à « Générer le relevé » après le pointage.">
              {Object.entries(k.aPayer.reduce<Record<string, number>>((acc, r) => { acc[r.collaborateur_id] = (acc[r.collaborateur_id] || 0) + Number(r.montant); return acc; }, {})).map(([id, total]) => (
                <li key={id} className="flex justify-between gap-2 text-sm"><span className="truncate text-white/80">{nomCollab(collabs.find((c) => c.id === id))}</span><span className="tabular-nums text-amber-300">{euros(total)}</span></li>
              ))}
            </Bloc>
            <Bloc titre="Demandes à traiter" lien="/admin/demandes" compteur={k.demandesOuvertes.length} vide="Aucune demande en attente.">
              {k.demandesOuvertes.slice(0, 6).map((d) => (
                <li key={d.id} className="truncate text-sm text-white/80">{d.objet} <span className="text-white/40">· {nomCollab(collabs.find((c) => c.id === d.collaborateur_id))}</span></li>
              ))}
            </Bloc>
          </section>

          <section className="glass-card p-4">
            <h2 className="titre-section mb-2">Pour commencer</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-white/70">
              <li>Créez vos <Link href="/admin/collaborateurs" className="text-accent-pink hover:underline">collaborateurs</Link> (commerciaux et secrétaires).</li>
              <li>Saisissez chaque <Link href="/admin/abonnements" className="text-accent-pink hover:underline">abonnement</Link> de garage en le rattachant à son commercial et sa secrétaire ; pointez les mensualités quand elles sont encaissées.</li>
              <li>Chaque début de mois, <Link href="/admin/reglements" className="text-accent-pink hover:underline">générez le relevé</Link> : primes et rétrocessions dues apparaissent, vous les marquez payées après virement.</li>
              <li>Testez vos hypothèses dans le <Link href="/admin/simulateur" className="text-accent-pink hover:underline">simulateur</Link> — ses paramètres sont ceux des relevés.</li>
            </ol>
          </section>
        </>
      )}
    </AdminShell>
  );
}

function Kpi({ titre, valeur, sous, accent }: { titre: string; valeur: string; sous?: string; accent?: boolean }) {
  return (
    <div className={`glass-card p-3 sm:p-4 ${accent ? "border-accent-pink" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{titre}</div>
      <div className={`valeur-hud mt-1 font-bold ${accent ? "text-accent-pink" : "text-white"}`}>{valeur}</div>
      {sous && <div className="mt-1 text-[11px] text-white/45">{sous}</div>}
    </div>
  );
}
function Bloc({ titre, lien, compteur, vide, children }: { titre: string; lien: string; compteur: number; vide: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="titre-section">{titre}{compteur > 0 && <span className="ml-2 badge badge-warn">{compteur}</span>}</h2>
        <Link href={lien} className="text-xs text-accent-pink hover:underline">Ouvrir</Link>
      </div>
      {compteur === 0 ? <p className="text-xs text-white/40">{vide}</p> : <ul className="space-y-1">{children}</ul>}
    </div>
  );
}
