"use client";

// FICHE COLLABORATEUR (v10.6) — /admin/collaborateurs/[id]
//   · identité + statut (modifiable via le formulaire partagé) ;
//   · COMPTE : création directe du compte commercial depuis l'email
//     perso (la secrétaire, elle, utilise le compte du garage de son
//     portefeuille : pas de compte dédié) ;
//   · CONTRAT DE COLLABORATION : prérempli depuis la fiche (modèles du
//     pack — apporteur d'affaires / prestation de services), MODIFIABLE
//     article par article, SIGNÉ EN DIRECT (pad de signature éditeur +
//     collaborateur), PDF à la charte régénérable à tout moment ;
//   · DOCUMENTS D'INFORMATION : téléchargement du pack + envoi par
//     email (contrat signé joint) — le commercial les retrouve aussi
//     dans son espace « Mes documents ».

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminShell, { ChampAdmin, dateFr, euros } from "@/components/admin/AdminShell";
import ModalShell from "@/components/ModalShell";
import SignaturePad from "@/components/SignaturePad";
import CollaborateurFormModal from "@/components/admin/CollaborateurFormModal";
import {
  Abonnement, Collaborateur, CollaborateurDocument, CompteAuth, Reglement,
  creerCompteCollaborateur, envoyerDocsCollaborateur, lireComptes, lireParametres, lireTable, nomCollab, supprimerLigne, upsertLigne,
} from "@/lib/admin/client";
import { Parametres } from "@/lib/admin/economie";
import { ContenuContrat, avenantAffectationDefaut, contratDefaut, titreContrat } from "@/lib/admin/contratCollaborateur";
import ProfilPrestationModal from "@/components/admin/ProfilPrestationModal";
import { ProfilPrestation, lireProfil, perimetreConvenu, toutesLesTaches } from "@/lib/admin/tachesSecretaire";
import { DATE_TAUX, netAvantImpot, regimeDe, tauxPrelevements } from "@/lib/admin/remuneration";
import { construireContratCollaborateurPdf, prechargerLogoPdf } from "@/lib/admin/contratPdf";
import { docsPour, DocPack } from "@/lib/admin/packDocs";
import { fetchAuth } from "@/lib/apiClient";

/** Téléchargement authentifié d'un document du pack (l'API exige le jeton). */
async function telechargerDocPack(d: DocPack) {
  const res = await fetchAuth(`/api/admin/pack-doc?cle=${encodeURIComponent(d.cle)}`);
  if (!res.ok) throw new Error("Téléchargement impossible.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = d.fichier.split("/").pop() || `${d.cle}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FicheCollaborateurPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [collabs, setCollabs] = useState<Collaborateur[]>([]);
  const [abos, setAbos] = useState<Abonnement[]>([]);
  const [regs, setRegs] = useState<Reglement[]>([]);
  const [docs, setDocs] = useState<CollaborateurDocument[]>([]);
  const [comptes, setComptes] = useState<CompteAuth[]>([]);
  const [parametres, setParametres] = useState<Parametres | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<Collaborateur> | null>(null);
  // Questionnaire de prestation + avenants d'affectation (v11.3).
  const [profilOuvert, setProfilOuvert] = useState(false);
  const [avenant, setAvenant] = useState<{ garage: string; sens: "affectation" | "fin"; dateEffet: string; motif: string } | null>(null);
  const [emailCompte, setEmailCompte] = useState("");
  const [creationCompte, setCreationCompte] = useState(false);

  // Éditeur de contrat
  const [contrat, setContrat] = useState<{ docId: string | null; contenu: ContenuContrat } | null>(null);
  const [signature, setSignature] = useState<{ docId: string; contenu: ContenuContrat } | null>(null);
  const [signEditeur, setSignEditeur] = useState<string | null>(null);
  const [signCollab, setSignCollab] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Envoi des documents par email
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [joindreContrat, setJoindreContrat] = useState(true);
  const [envoi, setEnvoi] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, a, r, d, cp, p] = await Promise.all([
        lireTable<Collaborateur>("collaborateurs"), lireTable<Abonnement>("abonnements"), lireTable<Reglement>("collaborateur_reglements"),
        lireTable<CollaborateurDocument>("collaborateur_documents"), lireComptes(), lireParametres(),
      ]);
      setCollabs(c); setAbos(a); setRegs(r); setDocs(d); setComptes(cp); setParametres(p); setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Lecture impossible (migration v58 ?).");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const c = useMemo(() => collabs.find((x) => x.id === id) || null, [collabs, id]);
  useEffect(() => { if (c && !emailCompte) setEmailCompte(c.email || ""); }, [c, emailCompte]);

  const mesAbos = useMemo(() => abos.filter((a) => a.commercial_id === id || a.secretaire_id === id), [abos, id]);
  const mesDocs = useMemo(() => docs.filter((d) => d.collaborateur_id === id), [docs, id]);
  const contratSigne = mesDocs.find((d) => d.statut === "signe") || null;
  const solde = useMemo(() => {
    let du = 0, paye = 0;
    for (const r of regs) {
      if (r.collaborateur_id !== id) continue;
      if (r.statut === "a_payer") du += Number(r.montant) || 0;
      if (r.statut === "paye") paye += Number(r.montant) || 0;
    }
    return { du, paye };
  }, [regs, id]);

  const compteEmail = c?.owner_id ? comptes.find((x) => x.id === c.owner_id)?.email || c.owner_id : null;
  const packDocs = c ? docsPour(c.type) : [];

  /* ---------- compte commercial ---------- */
  async function creerCompte() {
    if (!c) return;
    if (!emailCompte.trim()) return alert("Renseigne l'email perso du commercial.");
    setCreationCompte(true);
    try {
      const r = await creerCompteCollaborateur(c.id, emailCompte.trim());
      if (r.dejaExistant) alert("Un compte existait déjà avec cet email : il est rattaché à la fiche et passé en métier « commercial ».");
      else if (r.emailEnvoye) alert("Compte commercial créé ✔ — l'email de bienvenue (identifiants + mot de passe provisoire) vient de partir.");
      else alert(`Compte créé, mais l'email de bienvenue n'est pas parti (${r.erreurEmail || "envoi impossible"}).\nMot de passe provisoire à transmettre : ${r.motDePasse || "—"}`);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Création impossible.");
    } finally {
      setCreationCompte(false);
    }
  }

  /* ---------- contrat ---------- */
  function nouveauContrat() {
    if (!c || !parametres) return;
    const garages = mesAbos.filter((a) => a.statut === "actif").map((a) => `${a.garage_nom} — ${parametres.formules[a.formule].libelle} (${a.heures} h / mois)`);
    setContrat({ docId: null, contenu: contratDefaut(c, parametres, garages) });
  }
  function ouvrirContrat(d: CollaborateurDocument) {
    setContrat({ docId: d.id, contenu: d.contenu as ContenuContrat });
  }
  async function enregistrerContrat(versSignature: boolean) {
    if (!c || !contrat) return;
    setBusy(true);
    try {
      const res = await upsertLigne<CollaborateurDocument>("collaborateur_documents", {
        ...(contrat.docId ? { id: contrat.docId } : {}),
        collaborateur_id: c.id,
        type: contrat.contenu.modele === "avenant" ? "avenant" : "contrat",
        modele: contrat.contenu.modele,
        titre: titreContrat(contrat.contenu.modele),
        version: contrat.contenu.version,
        contenu: contrat.contenu,
        ...(contrat.docId ? {} : { statut: "brouillon" }),
      });
      const docId = (res as { row?: CollaborateurDocument }).row?.id || contrat.docId;
      setContrat(null);
      await load();
      if (versSignature && docId) {
        setSignEditeur(null); setSignCollab(null);
        setSignature({ docId, contenu: contrat.contenu });
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }
  async function telechargerContrat(d: CollaborateurDocument) {
    await prechargerLogoPdf();
    const pdf = construireContratCollaborateurPdf(d.contenu as ContenuContrat, {
      nomCollaborateur: nomCollab(c),
      signatureEditeur: d.signature_editeur,
      signatureCollaborateur: d.signature_collaborateur,
      signeLe: d.signe_le,
    });
    pdf.save(`${d.titre.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}-${(c?.nom || "collaborateur").replace(/[^a-z0-9-]+/gi, "_")}.pdf`);
  }
  async function signerContrat() {
    if (!signature) return;
    if (!signCollab) return alert("La signature du collaborateur est obligatoire (« lu et approuvé »).");
    setBusy(true);
    try {
      await upsertLigne<CollaborateurDocument>("collaborateur_documents", {
        id: signature.docId,
        statut: "signe",
        signature_collaborateur: signCollab,
        signature_editeur: signEditeur,
        signe_le: new Date().toISOString(),
      });
      setSignature(null);
      await load();
      alert("Contrat signé ✔ — le PDF signé est régénérable à tout moment (et visible dans « Mes documents » pour un commercial).");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Signature impossible.");
    } finally {
      setBusy(false);
    }
  }
  async function supprimerContrat(d: CollaborateurDocument) {
    if (!confirm(d.statut === "signe" ? "Supprimer ce contrat SIGNÉ ? Cette action est définitive." : "Supprimer ce brouillon ?")) return;
    try { await supprimerLigne("collaborateur_documents", d.id); load(); } catch (e) { alert(e instanceof Error ? e.message : "Suppression impossible."); }
  }

  /* ---------- questionnaire de prestation (v11.3) ---------- */
  async function enregistrerProfil(profil: ProfilPrestation) {
    if (!c) return;
    await upsertLigne<Collaborateur>("collaborateurs", { id: c.id, profil_prestation: profil } as Partial<Collaborateur>);
    await load();
  }

  /* ---------- avenant d'affectation (v11.3) ---------- */
  function creerAvenant() {
    if (!c || !parametres || !avenant) return;
    const abo = mesAbos.find((a) => a.garage_nom === avenant.garage);
    const contenu = avenantAffectationDefaut(c, parametres, avenant.garage, avenant.sens, {
      formule: abo ? parametres.formules[abo.formule].libelle : null,
      heures: abo ? abo.heures : null,
      dateEffet: avenant.dateEffet || null,
      motif: avenant.motif || null,
    });
    setAvenant(null);
    setContrat({ docId: null, contenu });
  }

  /* ---------- envoi des documents ---------- */
  async function envoyerDocs() {
    if (!c) return;
    const cles = packDocs.filter((d) => selection[d.cle]).map((d) => d.cle);
    const avecContrat = joindreContrat && contratSigne;
    if (!cles.length && !avecContrat) return alert("Choisis au moins un document (ou le contrat signé).");
    if (!(c.email || "").trim()) return alert("Renseigne d'abord l'email du collaborateur sur sa fiche.");
    setEnvoi(true);
    try {
      let contratPdf: string | null = null;
      let contratNom: string | null = null;
      if (avecContrat && contratSigne) {
        await prechargerLogoPdf();
        const pdf = construireContratCollaborateurPdf(contratSigne.contenu as ContenuContrat, {
          nomCollaborateur: nomCollab(c),
          signatureEditeur: contratSigne.signature_editeur,
          signatureCollaborateur: contratSigne.signature_collaborateur,
          signeLe: contratSigne.signe_le,
        });
        contratPdf = pdf.output("datauristring");
        contratNom = `${contratSigne.titre.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}-signe.pdf`;
      }
      const r = await envoyerDocsCollaborateur({ collaborateur_id: c.id, cles, contrat_pdf: contratPdf, contrat_nom: contratNom });
      alert(`${r.envoyes} document${r.envoyes > 1 ? "s" : ""} envoyé${r.envoyes > 1 ? "s" : ""} à ${r.a} ✔`);
      setSelection({});
    } catch (e) {
      alert(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  /* ---------- rendu ---------- */
  return (
    <AdminShell
      titre={c ? nomCollab(c) : "Collaborateur"}
      actions={
        <div className="flex gap-2">
          <Link href="/admin/collaborateurs" className="btn-ghost">← Collaborateurs</Link>
          {c && <button className="btn-primary" onClick={() => setForm({ ...c })}>Modifier la fiche</button>}
        </div>
      }
    >
      {erreur && <p className="badge badge-danger">{erreur}</p>}
      {loading && <p className="text-sm text-white/40">Chargement…</p>}
      {!loading && !c && <p className="text-sm text-white/40">Fiche introuvable.</p>}

      {c && (
        <div className="space-y-4">
          {/* ------- identité ------- */}
          <div className="glass-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${c.type === "commercial" ? "badge-info" : "badge-ok"}`}>{c.type === "commercial" ? "Commercial (apporteur d'affaires)" : "Secrétaire"}</span>
              <span className={`badge ${c.statut === "actif" ? "badge-ok" : c.statut === "pause" ? "badge-warn" : "badge-neutral"}`}>{c.statut === "actif" ? "Actif" : c.statut === "pause" ? "En pause" : "Terminé"}</span>
              {c.type === "commercial" && c.code_apporteur && <span className="badge badge-neutral">Code <b className="font-mono">{c.code_apporteur}</b></span>}
            </div>
            <div className="mt-3 grid gap-x-6 gap-y-1 text-sm text-white/70 sm:grid-cols-2">
              {c.email && <div>📧 {c.email}</div>}
              {c.tel && <div>📞 {c.tel}</div>}
              {c.siret && <div>SIRET {c.siret}</div>}
              {c.adresse && <div>📍 {c.adresse}</div>}
              {c.type === "commercial" && c.zone && <div>Zone : {c.zone}</div>}
              {c.type === "commercial" && c.portefeuille && <div>Portefeuille : {c.portefeuille}</div>}
              {c.type === "secretaire" && <div>Taux horaire : {c.taux_horaire != null ? `${Number(c.taux_horaire)} €/h` : "17 €/h (défaut)"}</div>}
              {c.date_debut && <div>Collaboration depuis le {dateFr(c.date_debut)}{c.date_fin ? ` · fin le ${dateFr(c.date_fin)}` : ""}</div>}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div><div className="valeur-hud text-white">{mesAbos.filter((a) => a.statut === "actif").length}<span className="text-xs text-white/40">/{mesAbos.length}</span></div><div className="text-[11px] text-white/45">garages actifs</div></div>
              <div><div className="valeur-hud text-amber-300">{euros(solde.du)}</div><div className="text-[11px] text-white/45">à payer</div></div>
              <div><div className="valeur-hud text-emerald-300">{euros(solde.paye)}</div><div className="text-[11px] text-white/45">déjà payé</div></div>
            </div>
            {c.notes && <p className="mt-3 rounded-lg bg-white/5 p-2 text-xs text-white/60">{c.notes}</p>}
          </div>

          {/* ------- compte ------- */}
          <div className="glass-card p-4">
            <h2 className="mb-2 font-semibold text-white">Compte My Easy Auto</h2>
            {c.type === "secretaire" ? (
              <p className="text-sm text-white/60">
                La secrétaire n&apos;a <b>pas de compte dédié</b> : elle travaille sur le compte du garage de son portefeuille.
                Son contrat et ses documents d&apos;information lui sont <b>envoyés par email</b> (ci-dessous).
              </p>
            ) : c.owner_id ? (
              <p className="text-sm text-white/70">
                ✔ Compte commercial rattaché : <b>{compteEmail}</b>
                <span className="mt-1 block text-xs text-white/45">Il retrouve « Mes clients » et « Mes documents » (contrat + documentation) dans son espace commercial.</span>
              </p>
            ) : (
              <div>
                <p className="mb-2 text-sm text-white/60">
                  Crée son compte commercial <b>directement ici</b> avec son email perso : mot de passe provisoire + email de bienvenue, sans passer par Supabase.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input className="field-input max-w-xs" type="email" placeholder="email perso du commercial" value={emailCompte} onChange={(e) => setEmailCompte(e.target.value)} />
                  <button className="btn-primary" disabled={creationCompte} onClick={creerCompte}>{creationCompte ? "Création…" : "Créer le compte commercial"}</button>
                </div>
              </div>
            )}
          </div>

          {/* ------- profil de prestation (secrétaire, v11.3) ------- */}
          {c.type === "secretaire" && (() => {
            const profil = lireProfil(c.profil_prestation);
            const nb = (profil.taches || []).length;
            const total = toutesLesTaches().length;
            const regime = regimeDe(profil.regime);
            const taux = c.taux_horaire != null ? Number(c.taux_horaire) : 17;
            const perim = perimetreConvenu(profil);
            return (
              <div className="glass-card p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-white">Profil de prestation</h2>
                  <button className="btn-primary" onClick={() => setProfilOuvert(true)}>
                    {nb ? "Modifier le questionnaire" : "+ Remplir le questionnaire"}
                  </button>
                </div>
                <p className="mb-3 text-xs text-white/45">
                  À remplir <b>avec elle</b>, avant d&apos;éditer le contrat : périmètre des tâches, moyens dont elle dispose,
                  limites qu&apos;elle pose, régime social. Ces réponses deviennent les <b>annexes 2, 3 et 4</b> du contrat.
                </p>
                {nb === 0 ? (
                  <p className="alerte alerte-warn text-xs">
                    Questionnaire non rempli : le contrat sera généré avec des annexes à compléter à la main.
                  </p>
                ) : (
                  <div className="space-y-2 text-xs text-white/70">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="badge badge-ok">{nb} / {total} tâches convenues</span>
                      <span className="badge badge-neutral">{regime.libelle}</span>
                      {profil.heures_max_mois ? <span className="badge badge-neutral">max {profil.heures_max_mois} h / mois</span> : null}
                      {profil.rc_pro ? <span className="badge badge-ok">RC pro</span> : <span className="badge badge-warn">RC pro manquante</span>}
                      {profil.vigilance_le ? <span className="badge badge-ok">Vigilance URSSAF {dateFr(profil.vigilance_le)}</span> : <span className="badge badge-warn">Attestation de vigilance à réclamer</span>}
                    </div>
                    <div>{perim.map((f) => `${f.titre} (${f.lignes.length})`).join(" · ")}</div>
                    {profil.limites ? <div><b>Limites :</b> {profil.limites}</div> : null}
                    {profil.contraintes ? <div><b>Contraintes :</b> {profil.contraintes}</div> : null}
                    <div className="alerte alerte-info text-[11px]">
                      Rémunération : <b>{taux.toLocaleString("fr-FR")} € HT/h</b> = revenu <b>BRUT</b> (chiffre d&apos;affaires).
                      Net avant impôt ≈ <b>{netAvantImpot(taux, regime).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/h</b>
                      {" "}({tauxPrelevements(regime).toLocaleString("fr-FR")} % de prélèvements, taux au {DATE_TAUX}).
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ------- contrat de collaboration ------- */}
          <div className="glass-card p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-white">Contrat de collaboration</h2>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" onClick={nouveauContrat} disabled={!parametres}>+ Générer le contrat prérempli</button>
                {c.type === "secretaire" && (
                  <button
                    className="btn-ghost"
                    disabled={!parametres}
                    onClick={() => setAvenant({ garage: mesAbos[0]?.garage_nom || "", sens: "affectation", dateEffet: new Date().toISOString().slice(0, 10), motif: "" })}
                  >
                    + Avenant d&apos;affectation
                  </button>
                )}
              </div>
            </div>
            <p className="mb-3 text-xs text-white/45">
              Modèle du pack ({c.type === "commercial" ? "contrat d'apporteur d'affaires" : "contrat de prestation de services"}), prérempli avec la fiche,
              <b> modifiable article par article</b>, puis <b>signé en direct</b> (pad de signature). PDF à la charte, régénérable à tout moment.
            </p>
            {mesDocs.length === 0 && <p className="text-sm text-white/40">Aucun contrat pour l&apos;instant.</p>}
            <div className="space-y-2">
              {mesDocs.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{d.titre}{d.version ? ` · ${d.version}` : ""}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-white/45">
                      <span className={`badge ${d.statut === "signe" ? "badge-ok" : "badge-warn"}`}>{d.statut === "signe" ? "Signé" : "Brouillon"}</span>
                      {d.signe_le ? <span>signé le {dateFr(d.signe_le)}</span> : <span>créé le {dateFr(d.created_at)}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 text-sm">
                    <button className="text-accent-pink hover:underline" onClick={() => telechargerContrat(d)}>PDF</button>
                    {d.statut === "brouillon" && <button className="text-white/70 hover:underline" onClick={() => ouvrirContrat(d)}>Modifier</button>}
                    {d.statut === "brouillon" && (
                      <button
                        className="text-emerald-300 hover:underline"
                        onClick={() => { setSignEditeur(null); setSignCollab(null); setSignature({ docId: d.id, contenu: d.contenu as ContenuContrat }); }}
                      >
                        Signer
                      </button>
                    )}
                    <button className="text-white/40 hover:text-rose-300" onClick={() => supprimerContrat(d)}>Suppr.</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ------- documents d'information ------- */}
          <div className="glass-card p-4">
            <h2 className="mb-2 font-semibold text-white">Documents d&apos;information</h2>
            <p className="mb-3 text-xs text-white/45">
              {c.type === "commercial"
                ? "Le commercial retrouve aussi tous ces documents dans son espace « Mes documents »."
                : "La secrétaire n'ayant pas de compte, coche les documents à lui envoyer par email (le contrat signé peut être joint)."}
            </p>
            <div className="space-y-1.5">
              {packDocs.map((d) => (
                <div key={d.cle} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <label className="flex min-w-0 items-center gap-2 text-sm text-white/80">
                    <input type="checkbox" checked={!!selection[d.cle]} onChange={(e) => setSelection((s) => ({ ...s, [d.cle]: e.target.checked }))} />
                    <span className="truncate">📄 {d.titre}</span>
                  </label>
                  <button className="shrink-0 text-sm text-accent-pink hover:underline" onClick={() => telechargerDocPack(d).catch((e) => alert(e.message))}>Télécharger</button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {contratSigne && (
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input type="checkbox" checked={joindreContrat} onChange={(e) => setJoindreContrat(e.target.checked)} />
                  Joindre le contrat signé (PDF)
                </label>
              )}
              <button className="btn-primary" disabled={envoi} onClick={envoyerDocs}>
                {envoi ? "Envoi…" : `Envoyer par email${c.email ? ` à ${c.email}` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------- modales ------- */}
      {form && <CollaborateurFormModal initial={form} comptes={comptes} onClose={() => setForm(null)} onSaved={load} />}

      {/* Questionnaire de prestation (v11.3) */}
      {profilOuvert && c && (
        <ProfilPrestationModal
          valeur={c.profil_prestation}
          tauxHoraire={c.taux_horaire != null ? Number(c.taux_horaire) : 17}
          onFermer={() => setProfilOuvert(false)}
          onEnregistrer={enregistrerProfil}
        />
      )}

      {/* Avenant d'affectation (v11.3) — un par garage confié ou retiré */}
      {avenant && c && (
        <ModalShell title="Nouvel avenant d'affectation" onClose={() => setAvenant(null)} maxWidth="max-w-lg">
          <div className="space-y-3 px-6 py-5">
            <p className="text-xs text-white/45">
              Chaque garage confié ou retiré donne lieu à un avenant <b>signé des deux parties</b>. C&apos;est ce qui matérialise
              son accord : sans lui, l&apos;affectation ressemble à une affectation de personnel.
            </p>
            <label className="block text-xs text-white/60">
              Sens de l&apos;avenant
              <select className="field-input mt-0.5" value={avenant.sens} onChange={(e) => setAvenant({ ...avenant, sens: e.target.value as "affectation" | "fin" })}>
                <option value="affectation">Affectation d&apos;un garage</option>
                <option value="fin">Fin d&apos;affectation</option>
              </select>
            </label>
            <label className="block text-xs text-white/60">
              Garage
              <input className="field-input mt-0.5" list="garages-abos" value={avenant.garage} onChange={(e) => setAvenant({ ...avenant, garage: e.target.value })} placeholder="Nom du garage" />
              <datalist id="garages-abos">
                {mesAbos.map((a) => <option key={a.id} value={a.garage_nom} />)}
              </datalist>
            </label>
            <label className="block text-xs text-white/60">
              Date d&apos;effet
              <input type="date" className="field-input mt-0.5" value={avenant.dateEffet} onChange={(e) => setAvenant({ ...avenant, dateEffet: e.target.value })} />
            </label>
            {avenant.sens === "fin" && (
              <label className="block text-xs text-white/60">
                Motif (facultatif)
                <input className="field-input mt-0.5" value={avenant.motif} onChange={(e) => setAvenant({ ...avenant, motif: e.target.value })} placeholder="ex. résiliation de l'abonnement du garage" />
              </label>
            )}
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
              <button className="btn-primary" onClick={creerAvenant} disabled={!avenant.garage.trim()}>Générer l&apos;avenant</button>
              <button className="btn-ghost" onClick={() => setAvenant(null)}>Annuler</button>
            </div>
          </div>
        </ModalShell>
      )}

      {contrat && (
        <ModalShell title={`${titreContrat(contrat.contenu.modele)} — prérempli, modifiable`} onClose={() => setContrat(null)} maxWidth="max-w-3xl">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChampAdmin label="Fait à"><input className="field-input" value={contrat.contenu.lieu} onChange={(e) => setContrat((x) => x && { ...x, contenu: { ...x.contenu, lieu: e.target.value } })} /></ChampAdmin>
            <ChampAdmin label="Date du contrat"><input className="field-input" type="date" value={contrat.contenu.date} onChange={(e) => setContrat((x) => x && { ...x, contenu: { ...x.contenu, date: e.target.value } })} /></ChampAdmin>
            <ChampAdmin label="Partie IDEAFORMA"><textarea className="field-input" rows={4} value={contrat.contenu.blocEditeur} onChange={(e) => setContrat((x) => x && { ...x, contenu: { ...x.contenu, blocEditeur: e.target.value } })} /></ChampAdmin>
            <ChampAdmin label={contrat.contenu.modele === "apporteur" ? "Partie Apporteur (le collaborateur)" : "Partie Prestataire (le collaborateur)"}>
              <textarea className="field-input" rows={4} value={contrat.contenu.blocCollaborateur} onChange={(e) => setContrat((x) => x && { ...x, contenu: { ...x.contenu, blocCollaborateur: e.target.value } })} />
            </ChampAdmin>
          </div>
          <div className="mt-3 space-y-3">
            {contrat.contenu.articles.map((a, i) => (
              <div key={i}>
                <input
                  className="field-input mb-1 font-medium"
                  value={a.titre}
                  onChange={(e) => setContrat((x) => x && { ...x, contenu: { ...x.contenu, articles: x.contenu.articles.map((y, j) => (j === i ? { ...y, titre: e.target.value } : y)) } })}
                />
                <textarea
                  className="field-input text-xs leading-relaxed"
                  rows={Math.min(10, Math.max(3, Math.ceil(a.texte.length / 110)))}
                  value={a.texte}
                  onChange={(e) => setContrat((x) => x && { ...x, contenu: { ...x.contenu, articles: x.contenu.articles.map((y, j) => (j === i ? { ...y, texte: e.target.value } : y)) } })}
                />
                {contrat.contenu.table && contrat.contenu.table.apresArticle === i && (
                  <p className="mt-1 text-xs text-white/40">ℹ️ Le tableau des primes par formule (grille en vigueur) est inséré ici dans le PDF.</p>
                )}
              </div>
            ))}
            <ChampAdmin label={contrat.contenu.annexeTitre}>
              <textarea className="field-input text-xs leading-relaxed" rows={5} value={contrat.contenu.annexeTexte} onChange={(e) => setContrat((x) => x && { ...x, contenu: { ...x.contenu, annexeTexte: e.target.value } })} />
            </ChampAdmin>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button className="btn-ghost" onClick={() => setContrat(null)}>Annuler</button>
            <button
              className="btn-ghost"
              onClick={async () => {
                await prechargerLogoPdf();
                construireContratCollaborateurPdf(contrat.contenu, { nomCollaborateur: nomCollab(c) }).save("apercu-contrat.pdf");
              }}
            >
              Aperçu PDF
            </button>
            <button className="btn-ghost" disabled={busy} onClick={() => enregistrerContrat(false)}>{busy ? "…" : "Enregistrer le brouillon"}</button>
            <button className="btn-primary" disabled={busy} onClick={() => enregistrerContrat(true)}>{busy ? "…" : "Enregistrer → signer"}</button>
          </div>
        </ModalShell>
      )}

      {signature && (
        <ModalShell title="Signature en direct" onClose={() => setSignature(null)} maxWidth="max-w-2xl">
          <p className="mb-3 text-sm text-white/60">
            Faites signer le collaborateur ci-dessous (au doigt ou à la souris), puis signez pour {`IDEAFORMA`}. Les signatures sont apposées sur le PDF du contrat.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-sm font-medium text-white">{signature.contenu.modele === "apporteur" ? "L'Apporteur" : "Le Prestataire"} — « lu et approuvé » *</div>
              <SignaturePad onChange={setSignCollab} />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium text-white">Pour IDEAFORMA</div>
              <SignaturePad onChange={setSignEditeur} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setSignature(null)}>Annuler</button>
            <button className="btn-primary" disabled={busy || !signCollab} onClick={signerContrat}>{busy ? "Signature…" : "Signer le contrat"}</button>
          </div>
        </ModalShell>
      )}
    </AdminShell>
  );
}
