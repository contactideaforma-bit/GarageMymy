"use client";

/* ====================================================================
 *  DEVIS À CONTRÔLER (mode expert, v13.23) — l'écran d'accueil de l'expert
 *
 *  Tous les contrôles de devis (dernier tour de chaque dossier) : à
 *  trancher, en attente du garage, validés. Un clic ouvre le contrôle.
 * ==================================================================== */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import StatCard from "@/components/StatCard";
import Icone from "@/components/expert/Icone";
import NouveauControleModal from "@/components/expert/NouveauControleModal";
import DepotGroupeModal from "@/components/expert/DepotGroupeModal";
import { EnTete, Vide } from "@/components/expert/ui";
import { chargerCabinet, chargerDossiers } from "@/lib/expertise/data";
import { chargerControles } from "@/lib/expertise/controleData";
import { creerDossierDemo } from "@/lib/expertise/demo";
import { creerControleDemo } from "@/lib/expertise/controleDemo";
import { Controle, STATUTS_CONTROLE, StatutControle, aRelancer, joursAttente, resumer } from "@/lib/expertise/controle";
import { DossierExpert } from "@/lib/expertise/types";
import { formatDateTime, formatEuros, messageErreur } from "@/lib/format";

type Filtre = "en_cours" | StatutControle | "tous";

function ListeControles() {
  const router = useRouter();
  const params = useSearchParams();
  const [controles, setControles] = useState<Controle[]>([]);
  const [dossiers, setDossiers] = useState<DossierExpert[]>([]);
  const [dispo, setDispo] = useState(true);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>("en_cours");
  const [q, setQ] = useState("");
  const [nouveau, setNouveau] = useState(false);
  const [demo, setDemo] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [depot, setDepot] = useState(false);
  const [delaiRelance, setDelaiRelance] = useState(5);
  useEffect(() => { chargerCabinet().then((c) => setDelaiRelance(Number(c?.delai_relance_jours) || 5)); }, []);

  async function charger() {
    const [{ controles: c, dispo: ok }, { dossiers: d }] = await Promise.all([chargerControles(), chargerDossiers()]);
    setControles(c);
    setDossiers(d);
    setDispo(ok);
    setChargement(false);
  }
  useEffect(() => { charger(); }, []);
  useEffect(() => { if (params.get("nouveau") === "1") setNouveau(true); }, [params]);

  // Dernier tour de chaque dossier + synthèse chiffrée.
  const lignes = useMemo(() => {
    const parDossier = new Map<string, Controle>();
    for (const c of controles) {
      const x = parDossier.get(c.dossier_id);
      // Le plus récent (tour suivant ou contrôle de facture).
      if (!x || c.created_at > x.created_at) parDossier.set(c.dossier_id, c);
    }
    return Array.from(parDossier.values())
      .map((c) => ({ c, d: dossiers.find((x) => x.id === c.dossier_id) || null, r: resumer(c) }))
      .sort((a, b) => b.c.updated_at.localeCompare(a.c.updated_at));
  }, [controles, dossiers]);

  const stats = useMemo(() => {
    const mois = new Date().toISOString().slice(0, 7);
    const valides = lignes.filter((l) => l.c.statut === "valide" && (l.c.cloture_le || "").slice(0, 7) === mois);
    return {
      aTrancher: lignes.filter((l) => l.c.statut === "a_trancher").length,
      attente: lignes.filter((l) => l.c.statut === "attente_garage").length,
      valides: valides.length,
      economie: valides.reduce((s, l) => s + Math.max(0, l.r.economie), 0),
    };
  }, [lignes]);

  const reponses = lignes.filter(({ c }) => c.reponse_garage && !c.reponse_garage.traitee_le);
  const relances = lignes.filter(({ c }) => aRelancer(c, delaiRelance));

  const visibles = lignes.filter(({ c, d }) => {
    if (filtre === "en_cours" && c.statut === "valide") return false;
    if (filtre !== "en_cours" && filtre !== "tous" && c.statut !== filtre) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return [d?.numero, d?.immatriculation, d?.reparateur_nom, d?.lese_nom, d?.numero_sinistre, d?.marque, d?.modele, c.devis?.nom].some((v) => (v || "").toLowerCase().includes(t));
  });

  async function chargerDemo() {
    setDemo(true);
    setErreur(null);
    try {
      await creerDossierDemo();
      const cree = await creerControleDemo();
      await charger();
      if (!cree) setErreur("La démonstration est déjà en place (dossier AE00034915).");
    } catch (e) {
      setErreur(messageErreur(e, "Démonstration impossible (migrations v75 et v87 exécutées ?)."));
    } finally {
      setDemo(false);
    }
  }

  return (
    <div className="space-y-4">
      <EnTete
        titre="Devis à contrôler"
        sousTitre="Le devis du garage confronté ligne à ligne à ton pré-rapport : tu tranches, l'appli rédige."
        actions={
          <>
            <button className="btn-ghost" onClick={() => setDepot(true)} title="Plusieurs PDF d'un coup : reconnus et rangés dans leurs dossiers"><Icone nom="importer" /> Dépôt groupé</button>
            <button className="btn-primary" onClick={() => setNouveau(true)}><Icone nom="plus" /> Nouveau contrôle</button>
          </>
        }
      />

      {!dispo && (
        <div className="alerte alerte-warn text-sm">
          La table des contrôles est absente : exécute <code className="font-mono">supabase/migration_v87.sql</code> dans Supabase → SQL Editor.
        </div>
      )}
      {erreur && <div className="alerte alerte-warn text-sm">{erreur}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="À trancher" value={String(stats.aTrancher)} accent="amber" />
        <StatCard label="En attente du garage" value={String(stats.attente)} accent="blue" />
        <StatCard label="Validés ce mois" value={String(stats.valides)} accent="emerald" />
        <StatCard label="Non retenu ce mois (HT)" value={formatEuros(stats.economie)} hint="devis − montant retenu" accent="teal" />
      </div>

      {(reponses.length > 0 || relances.length > 0) && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {reponses.length > 0 && (
            <div className="glass-card border-2 border-emerald-500/60 p-3">
              <div className="mb-2 font-semibold"><Icone nom="mail" /> Réponses de garage à traiter · {reponses.length}</div>
              <ul className="space-y-1 text-sm">
                {reponses.map(({ c, d }) => {
                  const contest = c.reponse_garage!.lignes.filter((l) => !l.accord).length;
                  return <li key={c.id}><button className="hover:underline" onClick={() => router.push(`/expert/dossiers/${c.dossier_id}?onglet=controle`)}><b>{d?.immatriculation || d?.numero}</b> · {d?.reparateur_nom || "garage"} — {contest ? `${contest} contestation(s)` : "accord sur tout"}</button></li>;
                })}
              </ul>
            </div>
          )}
          {relances.length > 0 && (
            <div className="glass-card border-2 border-amber-500/60 p-3">
              <div className="mb-2 font-semibold"><Icone nom="horloge" /> À relancer (sans réponse depuis {delaiRelance} j et plus) · {relances.length}</div>
              <ul className="space-y-1 text-sm">
                {relances.map(({ c, d }) => <li key={c.id}><button className="hover:underline" onClick={() => router.push(`/expert/dossiers/${c.dossier_id}?onglet=controle`)}><b>{d?.immatriculation || d?.numero}</b> · {d?.reparateur_nom || "garage"} — {joursAttente(c)} j{Number(c.nb_relances) ? ` · ${c.nb_relances} relance(s)` : ""}</button></li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="glass-card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap gap-1">
          {([["en_cours", "En cours"], ["a_trancher", "À trancher"], ["attente_garage", "Attente garage"], ["valide", "Validés"], ["tous", "Tous"]] as const).map(([code, label]) => (
            <button key={code} className={`al-onglet ${filtre === code ? "actif" : ""}`} onClick={() => setFiltre(code)}>{label}</button>
          ))}
        </div>
        <input className="field-input field-compact max-w-xs" placeholder="Rechercher : immat, garage, n° dossier…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {chargement ? (
        <div className="skeleton h-40 rounded-2xl" />
      ) : visibles.length === 0 ? (
        <div className="glass-card p-4">
          <Vide
            titre={lignes.length ? "Aucun contrôle dans ce filtre" : "Aucun devis contrôlé pour l'instant"}
            texte={lignes.length ? undefined : "Dépose ton pré-rapport et le devis du garage : les écarts sont listés du plus lourd au plus léger, tu acceptes ou refuses chacun, l'appli rédige le courrier au garage et le chiffrage définitif."}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn-primary" onClick={() => setNouveau(true)}><Icone nom="plus" /> Nouveau contrôle</button>
                {!lignes.length && <button className="btn-ghost" disabled={demo} onClick={chargerDemo}>{demo ? "Création…" : "Voir un exemple"}</button>}
              </div>
            }
          />
        </div>
      ) : (
        <>
          {/* Grand écran : tableau */}
          <div className="glass-card hidden overflow-x-auto md:block">
            <table className="al-table">
              <thead>
                <tr><th>Dossier</th><th>Réparateur</th><th className="num">Devis HT</th><th className="num">Retenu HT</th><th>Écarts</th><th>Statut</th><th>Mis à jour</th></tr>
              </thead>
              <tbody>
                {visibles.map(({ c, d, r }) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-white/5" onClick={() => router.push(`/expert/dossiers/${c.dossier_id}?onglet=controle`)}>
                    <td>
                      <div className="font-semibold">{d?.immatriculation || "—"} <span className="font-normal text-white/55">· {d?.numero}</span></div>
                      <div className="text-xs text-white/55">{c.type === "facture" && <span className="badge badge-info mr-1">Facture</span>}{[d?.marque, d?.modele].filter(Boolean).join(" ")}{c.tour > 1 ? ` · tour ${c.tour}` : ""}</div>
                    </td>
                    <td>{d?.reparateur_nom || "—"}</td>
                    <td className="num">{c.devis ? formatEuros(r.totalDevis) : <span className="text-white/40">à déposer</span>}</td>
                    <td className="num font-semibold">{c.devis && c.reference ? formatEuros(r.totalRetenu) : "—"}</td>
                    <td>
                      {c.devis && c.reference ? (
                        r.total ? (
                          <div className="min-w-[7rem]">
                            <div className="text-xs">{r.total - r.aTrancher}/{r.total} tranché(s)</div>
                            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-accent-teal" style={{ width: `${Math.round(((r.total - r.aTrancher) / r.total) * 100)}%` }} /></div>
                          </div>
                        ) : <span className="text-xs text-emerald-600">conforme</span>
                      ) : <span className="text-xs text-white/45">{c.reference ? "devis manquant" : "pré-rapport manquant"}</span>}
                    </td>
                    <td><span className={`badge ${STATUTS_CONTROLE[c.statut]?.badge}`}>{STATUTS_CONTROLE[c.statut]?.label}</span></td>
                    <td className="whitespace-nowrap text-xs text-white/55">{formatDateTime(c.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Téléphone : cartes */}
          <div className="space-y-2 md:hidden">
            {visibles.map(({ c, d, r }) => (
              <button key={c.id} className="carte-liste block w-full text-left" onClick={() => router.push(`/expert/dossiers/${c.dossier_id}?onglet=controle`)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{d?.immatriculation || d?.numero}</span>
                  <span className={`badge ${STATUTS_CONTROLE[c.statut]?.badge}`}>{STATUTS_CONTROLE[c.statut]?.label}</span>
                </div>
                <div className="text-xs text-white/55">{d?.reparateur_nom || "—"}{c.tour > 1 ? ` · tour ${c.tour}` : ""}</div>
                {c.devis && c.reference && (
                  <div className="mt-1 text-sm">Devis {formatEuros(r.totalDevis)} → retenu <b>{formatEuros(r.totalRetenu)}</b>{r.total ? ` · ${r.total - r.aTrancher}/${r.total} tranché(s)` : " · conforme"}</div>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {depot && <DepotGroupeModal onClose={() => setDepot(false)} onTermine={charger} />}
      {nouveau && <NouveauControleModal onClose={() => { setNouveau(false); if (params.get("nouveau")) router.replace("/expert/controles"); }} />}
    </div>
  );
}

export default function PageControles() {
  return (
    <Suspense fallback={<div className="skeleton h-40 rounded-2xl" />}>
      <ListeControles />
    </Suspense>
  );
}
