"use client";

// ============================================================
//  BASE MUTUALISÉE EXPERTS & ASSUREURS (v13.51) — espace éditeur.
//  Tous les cabinets d'expertise, experts et assureurs connus des comptes
//  garage, fusionnés et dédoublonnés, avec le nombre de garages qui ont
//  chaque contact. Sert à débloquer un dossier (le rapport n'a pas le
//  numéro de l'assurance ? il est peut-être ici) et prépare la base à
//  proposer aux garages. Les clients des garages ne sont JAMAIS lus.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminShell, { ChampAdmin, dateFr } from "@/components/admin/AdminShell";
import ModalShell from "@/components/ModalShell";
import { consoliderAnnuaire, lireTable, supprimerLigne, upsertLigne } from "@/lib/admin/client";
import { normaliserTexte, type MutualiseAssureur, type MutualiseExpert } from "@/lib/admin/annuaireMutualise";
import { exporterXlsx, type ColonneExcel } from "@/lib/excel";
import Ico from "@/components/Ico";

type Onglet = "experts" | "assureurs";

export default function AnnuaireMutualisePage() {
  const [onglet, setOnglet] = useState<Onglet>("experts");
  const [experts, setExperts] = useState<MutualiseExpert[]>([]);
  const [assureurs, setAssureurs] = useState<MutualiseAssureur[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [formE, setFormE] = useState<Partial<MutualiseExpert> | null>(null);
  const [formA, setFormA] = useState<Partial<MutualiseAssureur> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, a] = await Promise.all([lireTable<MutualiseExpert>("mutualise_experts"), lireTable<MutualiseAssureur>("mutualise_assureurs")]);
      setExperts(e); setAssureurs(a); setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Lecture impossible (migration v102 exécutée ?).");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Première visite : la base est vide → on la construit tout seul.
  const autoLance = useRef(false);
  useEffect(() => {
    if (loading || erreur || autoLance.current) return;
    if (experts.length + assureurs.length === 0) {
      autoLance.current = true;
      consolider();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, erreur, experts.length, assureurs.length]);

  async function consolider() {
    setBusy(true); setInfo(null);
    try {
      const r = await consoliderAnnuaire();
      setInfo(`Consolidation terminée : ${r.lus.experts} fiches expert et ${r.lus.assureurs} fiches assureur lues dans les garages → ${r.experts} cabinets / experts et ${r.assureurs} assureurs distincts.`);
      setErreur(null);
      await load();
    } catch (e) { setErreur(`Consolidation impossible — ${e instanceof Error ? e.message : "erreur inconnue"}. Vérifiez que les migrations v102 et v105 sont exécutées dans Supabase.`); }
    finally { setBusy(false); }
  }

  const terme = normaliserTexte(q);
  const expertsVisibles = useMemo(() => {
    if (!terme) return experts;
    return experts.filter((r) => normaliserTexte([r.cabinet, r.expert_nom, r.ville, r.code_postal, r.email, r.expert_email, r.tel, r.expert_tel, r.notes].join(" ")).includes(terme));
  }, [experts, terme]);
  const assureursVisibles = useMemo(() => {
    if (!terme) return assureurs;
    return assureurs.filter((r) => normaliserTexte([r.nom, r.ville, r.code_postal, r.email, r.tel, r.siren, r.notes].join(" ")).includes(terme));
  }, [assureurs, terme]);

  async function basculer<T extends { id: string }>(table: "mutualise_experts" | "mutualise_assureurs", row: T, patch: Partial<T>) {
    try { await upsertLigne<T>(table, { id: row.id, ...patch }); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Impossible."); }
  }
  async function supprimer(table: "mutualise_experts" | "mutualise_assureurs", id: string) {
    if (!confirm("Retirer ce contact de la base mutualisée ? (il reviendra à la prochaine consolidation s'il existe encore chez un garage)")) return;
    try { await supprimerLigne(table, id); await load(); } catch (e) { alert(e instanceof Error ? e.message : "Impossible."); }
  }

  async function exporter() {
    if (onglet === "experts") {
      const colonnes: ColonneExcel[] = [
        { header: "Cabinet", key: "cabinet", width: 28 }, { header: "Expert", key: "expert_nom", width: 24 },
        { header: "Tél. cabinet", key: "tel", width: 16 }, { header: "E-mail cabinet", key: "email", width: 30 },
        { header: "Tél. expert", key: "expert_tel", width: 16 }, { header: "E-mail expert", key: "expert_email", width: 30 },
        { header: "Adresse", key: "adresse", width: 30 }, { header: "CP", key: "code_postal", width: 8 }, { header: "Ville", key: "ville", width: 18 },
        { header: "Garages", key: "garages", type: "number", width: 9 }, { header: "Vérifié", key: "verifie_txt", width: 9 }, { header: "Notes", key: "notes", width: 30 },
      ];
      await exporterXlsx("base-experts-mutualisee", "Experts", colonnes, expertsVisibles.map((r) => ({ ...r, verifie_txt: r.verifie ? "Oui" : "" })));
    } else {
      const colonnes: ColonneExcel[] = [
        { header: "Assureur", key: "nom", width: 28 }, { header: "Tél.", key: "tel", width: 16 }, { header: "E-mail", key: "email", width: 30 },
        { header: "Adresse", key: "adresse", width: 30 }, { header: "CP", key: "code_postal", width: 8 }, { header: "Ville", key: "ville", width: 18 },
        { header: "SIREN", key: "siren", width: 12 }, { header: "Garages", key: "garages", type: "number", width: 9 }, { header: "Vérifié", key: "verifie_txt", width: 9 }, { header: "Notes", key: "notes", width: 30 },
      ];
      await exporterXlsx("base-assureurs-mutualisee", "Assureurs", colonnes, assureursVisibles.map((r) => ({ ...r, verifie_txt: r.verifie ? "Oui" : "" })));
    }
  }

  async function enregistrerExpert() {
    if (!formE) return;
    setBusy(true);
    try { await upsertLigne<MutualiseExpert>("mutualise_experts", { ...formE, maj_le: new Date().toISOString() }); setFormE(null); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Impossible."); }
    finally { setBusy(false); }
  }
  async function enregistrerAssureur() {
    if (!formA) return;
    setBusy(true);
    try { await upsertLigne<MutualiseAssureur>("mutualise_assureurs", { ...formA, maj_le: new Date().toISOString() }); setFormA(null); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Impossible."); }
    finally { setBusy(false); }
  }

  const derniereMaj = [...experts, ...assureurs].map((r) => r.maj_le).sort().pop();
  const Lien = ({ href, children }: { href: string | null; children: React.ReactNode }) =>
    href ? <a href={href} className="text-accent-teal hover:underline">{children}</a> : <span className="text-white/35">—</span>;
  const tel = (t: string | null) => (t ? `tel:${t.replace(/[^\d+]/g, "")}` : null);
  const mail = (m: string | null) => (m ? `mailto:${m}` : null);

  return (
    <AdminShell
      titre="Base mutualisée experts & assureurs"
      actions={
        <>
          <button className="btn-ghost" onClick={exporter} disabled={loading}><Ico n="download" /> Excel</button>
          <button className="btn-primary" onClick={consolider} disabled={busy}>{busy ? "Consolidation…" : "Consolider depuis les garages"}</button>
        </>
      }
    >
      <p className="text-sm text-white/60">
        Les cabinets d&apos;expertise, experts et assureurs présents dans la base de données de <strong className="text-white">tous</strong> les comptes garage, fusionnés et dédoublonnés (même e-mail, sinon même téléphone, sinon même nom + ville).
        La colonne « Garages » indique combien de comptes connaissent le contact. Les clients des garages ne sont jamais lus.
        {derniereMaj && <span className="block mt-1 text-xs text-white/40">Dernière consolidation : {dateFr(derniereMaj)}.</span>}
      </p>
      {erreur && <p className="badge badge-danger">{erreur}</p>}
      {info && <p className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{info}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="segment">
          <button className={`segment-btn ${onglet === "experts" ? "actif" : ""}`} onClick={() => setOnglet("experts")}>Experts & cabinets <span className="ml-1 text-white/50">{experts.length}</span></button>
          <button className={`segment-btn ${onglet === "assureurs" ? "actif" : ""}`} onClick={() => setOnglet("assureurs")}>Assureurs <span className="ml-1 text-white/50">{assureurs.length}</span></button>
        </div>
        <input className="field-input field-compact min-w-[12rem] flex-1 sm:max-w-sm" placeholder="Rechercher : nom, ville, e-mail, téléphone…" value={q} onChange={(e) => setQ(e.target.value)} />
        {onglet === "experts" ? (
          <button className="btn-ghost btn-compact" onClick={() => setFormE({ cabinet: "", cle: `m:${Date.now()}`, garages: 0, verifie: true, partage: false })}>+ Ajouter</button>
        ) : (
          <button className="btn-ghost btn-compact" onClick={() => setFormA({ nom: "", cle: `m:${Date.now()}`, garages: 0, verifie: true, partage: false })}>+ Ajouter</button>
        )}
      </div>

      {loading && <p className="text-sm text-white/40">Chargement…</p>}
      {!loading && !erreur && experts.length + assureurs.length === 0 && (
        <div className="glass-card p-6 text-center text-sm text-white/60">
          La base est vide. Cliquez sur <strong className="text-white">Consolider depuis les garages</strong> pour la construire.
        </div>
      )}

      {/* ---------- EXPERTS ---------- */}
      {!loading && onglet === "experts" && expertsVisibles.length > 0 && (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-white/50">
              <tr className="border-b border-white/10">
                <th className="cellule font-medium">Cabinet / expert</th>
                <th className="cellule font-medium">Contact cabinet</th>
                <th className="cellule font-medium">Contact expert</th>
                <th className="cellule font-medium">Ville</th>
                <th className="cellule text-center font-medium" title="Nombre de garages qui ont ce contact">Garages</th>
                <th className="cellule font-medium">État</th>
                <th className="cellule" />
              </tr>
            </thead>
            <tbody>
              {expertsVisibles.map((r) => (
                <tr key={r.id} className="border-t border-white/5 align-top">
                  <td className="cellule">
                    <div className="font-medium text-white">{r.cabinet || <span className="text-white/35">Cabinet non renseigné</span>}</div>
                    {r.expert_nom && <div className="text-xs text-white/60">{r.expert_nom}</div>}
                    {r.notes && <div className="mt-1 text-xs text-amber-200/80">{r.notes}</div>}
                  </td>
                  <td className="cellule text-xs">
                    <div><Lien href={tel(r.tel)}>{r.tel}</Lien></div>
                    <div className="truncate max-w-[14rem]"><Lien href={mail(r.email)}>{r.email}</Lien></div>
                  </td>
                  <td className="cellule text-xs">
                    <div><Lien href={tel(r.expert_tel)}>{r.expert_tel}</Lien></div>
                    <div className="truncate max-w-[14rem]"><Lien href={mail(r.expert_email)}>{r.expert_email}</Lien></div>
                  </td>
                  <td className="cellule text-xs text-white/70">{[r.code_postal, r.ville].filter(Boolean).join(" ") || "—"}</td>
                  <td className="cellule text-center"><span className="badge badge-info">{r.garages}</span></td>
                  <td className="cellule">
                    <div className="flex flex-wrap gap-1">
                      <button className={`badge ${r.verifie ? "badge-ok" : "badge-neutral"}`} onClick={() => basculer("mutualise_experts", r, { verifie: !r.verifie })} title="Coché quand vous avez vérifié le contact">{r.verifie ? "Vérifié" : "À vérifier"}</button>
                      <button className={`badge ${r.partage ? "badge-info" : "badge-neutral"}`} onClick={() => basculer("mutualise_experts", r, { partage: !r.partage })} title="Proposé aux garages (étape suivante)">{r.partage ? "Partagé" : "Privé"}</button>
                    </div>
                  </td>
                  <td className="cellule whitespace-nowrap text-right">
                    <button className="text-xs text-white/60 hover:text-white" onClick={() => setFormE(r)}>Modifier</button>
                    <button className="ml-2 text-xs text-rose-300 hover:text-rose-200" onClick={() => supprimer("mutualise_experts", r.id)}>Retirer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && onglet === "experts" && experts.length > 0 && expertsVisibles.length === 0 && <p className="text-sm text-white/40">Aucun expert ne correspond à « {q} ».</p>}

      {/* ---------- ASSUREURS ---------- */}
      {!loading && onglet === "assureurs" && assureursVisibles.length > 0 && (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-white/50">
              <tr className="border-b border-white/10">
                <th className="cellule font-medium">Assureur</th>
                <th className="cellule font-medium">Téléphone</th>
                <th className="cellule font-medium">E-mail</th>
                <th className="cellule font-medium">Adresse</th>
                <th className="cellule text-center font-medium">Garages</th>
                <th className="cellule font-medium">État</th>
                <th className="cellule" />
              </tr>
            </thead>
            <tbody>
              {assureursVisibles.map((r) => (
                <tr key={r.id} className="border-t border-white/5 align-top">
                  <td className="cellule">
                    <div className="font-medium text-white">{r.nom || <span className="text-white/35">Nom non renseigné</span>}</div>
                    {r.siren && <div className="text-xs text-white/50">SIREN {r.siren}</div>}
                    {r.notes && <div className="mt-1 text-xs text-amber-200/80">{r.notes}</div>}
                  </td>
                  <td className="cellule text-xs"><Lien href={tel(r.tel)}>{r.tel}</Lien></td>
                  <td className="cellule text-xs truncate max-w-[14rem]"><Lien href={mail(r.email)}>{r.email}</Lien></td>
                  <td className="cellule text-xs text-white/70">{[r.adresse, [r.code_postal, r.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}</td>
                  <td className="cellule text-center"><span className="badge badge-info">{r.garages}</span></td>
                  <td className="cellule">
                    <div className="flex flex-wrap gap-1">
                      <button className={`badge ${r.verifie ? "badge-ok" : "badge-neutral"}`} onClick={() => basculer("mutualise_assureurs", r, { verifie: !r.verifie })}>{r.verifie ? "Vérifié" : "À vérifier"}</button>
                      <button className={`badge ${r.partage ? "badge-info" : "badge-neutral"}`} onClick={() => basculer("mutualise_assureurs", r, { partage: !r.partage })}>{r.partage ? "Partagé" : "Privé"}</button>
                    </div>
                  </td>
                  <td className="cellule whitespace-nowrap text-right">
                    <button className="text-xs text-white/60 hover:text-white" onClick={() => setFormA(r)}>Modifier</button>
                    <button className="ml-2 text-xs text-rose-300 hover:text-rose-200" onClick={() => supprimer("mutualise_assureurs", r.id)}>Retirer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && onglet === "assureurs" && assureurs.length > 0 && assureursVisibles.length === 0 && <p className="text-sm text-white/40">Aucun assureur ne correspond à « {q} ».</p>}

      {/* ---------- Modales ---------- */}
      {formE && (
        <ModalShell title={formE.id ? "Modifier le cabinet / expert" : "Ajouter un cabinet / expert"} onClose={() => setFormE(null)}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChampAdmin label="Cabinet"><input className="field-input" value={formE.cabinet ?? ""} onChange={(e) => setFormE({ ...formE, cabinet: e.target.value })} /></ChampAdmin>
            <ChampAdmin label="Expert (nom)"><input className="field-input" value={formE.expert_nom ?? ""} onChange={(e) => setFormE({ ...formE, expert_nom: e.target.value })} /></ChampAdmin>
            <ChampAdmin label="Tél. cabinet"><input className="field-input" value={formE.tel ?? ""} onChange={(e) => setFormE({ ...formE, tel: e.target.value })} /></ChampAdmin>
            <ChampAdmin label="E-mail cabinet"><input className="field-input" value={formE.email ?? ""} onChange={(e) => setFormE({ ...formE, email: e.target.value })} /></ChampAdmin>
            <ChampAdmin label="Tél. expert"><input className="field-input" value={formE.expert_tel ?? ""} onChange={(e) => setFormE({ ...formE, expert_tel: e.target.value })} /></ChampAdmin>
            <ChampAdmin label="E-mail expert"><input className="field-input" value={formE.expert_email ?? ""} onChange={(e) => setFormE({ ...formE, expert_email: e.target.value })} /></ChampAdmin>
            <ChampAdmin label="Adresse"><input className="field-input" value={formE.adresse ?? ""} onChange={(e) => setFormE({ ...formE, adresse: e.target.value })} /></ChampAdmin>
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <ChampAdmin label="CP"><input className="field-input" value={formE.code_postal ?? ""} onChange={(e) => setFormE({ ...formE, code_postal: e.target.value })} /></ChampAdmin>
              <ChampAdmin label="Ville"><input className="field-input" value={formE.ville ?? ""} onChange={(e) => setFormE({ ...formE, ville: e.target.value })} /></ChampAdmin>
            </div>
            <div className="sm:col-span-2"><ChampAdmin label="Notes (ex. « ne répond qu'au standard », « demander M. X »)"><textarea className="field-input" rows={2} value={formE.notes ?? ""} onChange={(e) => setFormE({ ...formE, notes: e.target.value })} /></ChampAdmin></div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button className="btn-ghost w-full sm:w-auto" onClick={() => setFormE(null)}>Annuler</button>
            <button className="btn-primary w-full sm:w-auto" onClick={enregistrerExpert} disabled={busy}>Enregistrer</button>
          </div>
        </ModalShell>
      )}
      {formA && (
        <ModalShell title={formA.id ? "Modifier l'assureur" : "Ajouter un assureur"} onClose={() => setFormA(null)}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChampAdmin label="Assureur"><input className="field-input" value={formA.nom ?? ""} onChange={(e) => setFormA({ ...formA, nom: e.target.value })} /></ChampAdmin>
            <ChampAdmin label="SIREN"><input className="field-input" value={formA.siren ?? ""} onChange={(e) => setFormA({ ...formA, siren: e.target.value })} /></ChampAdmin>
            <ChampAdmin label="Téléphone"><input className="field-input" value={formA.tel ?? ""} onChange={(e) => setFormA({ ...formA, tel: e.target.value })} /></ChampAdmin>
            <ChampAdmin label="E-mail"><input className="field-input" value={formA.email ?? ""} onChange={(e) => setFormA({ ...formA, email: e.target.value })} /></ChampAdmin>
            <ChampAdmin label="Adresse"><input className="field-input" value={formA.adresse ?? ""} onChange={(e) => setFormA({ ...formA, adresse: e.target.value })} /></ChampAdmin>
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <ChampAdmin label="CP"><input className="field-input" value={formA.code_postal ?? ""} onChange={(e) => setFormA({ ...formA, code_postal: e.target.value })} /></ChampAdmin>
              <ChampAdmin label="Ville"><input className="field-input" value={formA.ville ?? ""} onChange={(e) => setFormA({ ...formA, ville: e.target.value })} /></ChampAdmin>
            </div>
            <div className="sm:col-span-2"><ChampAdmin label="Notes"><textarea className="field-input" rows={2} value={formA.notes ?? ""} onChange={(e) => setFormA({ ...formA, notes: e.target.value })} /></ChampAdmin></div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button className="btn-ghost w-full sm:w-auto" onClick={() => setFormA(null)}>Annuler</button>
            <button className="btn-primary w-full sm:w-auto" onClick={enregistrerAssureur} disabled={busy}>Enregistrer</button>
          </div>
        </ModalShell>
      )}
    </AdminShell>
  );
}
