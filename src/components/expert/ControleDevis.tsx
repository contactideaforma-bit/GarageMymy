"use client";

/* ====================================================================
 *  CONTRÔLE DU DEVIS DU RÉPARATEUR (mode expert, v13.23) — l'écran clé.
 *
 *  ① Préparer : le pré-rapport (PDF de son logiciel, ou rapport chiffré
 *     dans l'appli) et le devis du garage. Lecture automatique, total lu
 *     confronté au total imprimé, correction possible de la lecture.
 *  ② Trancher : un écart = une carte « Pré-rapport | Devis ». Accepter
 *     (valeur du devis) ou maintenir le pré-rapport, avec un motif d'un
 *     clic. Clavier : A / R, ↑ ↓, Ctrl+Z. Rien n'est décidé d'office.
 *  ③ Conclure : devis validé, mise en conformité demandée au garage
 *     (courrier prêt), ou chiffrage de l'expert maintenu. Documents :
 *     courrier, note de contrôle, chiffrage à reporter, rapport définitif.
 *
 *  Garde-fous : enregistrement automatique, bouton Annuler (pile de 50),
 *  confirmation avant toute action groupée ou conclusion, contrôle
 *  rouvrable, journal horodaté, 2e tour quand le garage renvoie son devis.
 * ==================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "@/components/ModalShell";
import Icone from "@/components/expert/Icone";
import LectureControleModal from "@/components/expert/LectureControleModal";
import { Bloc, Erreur, Vide } from "@/components/expert/ui";
import { formatDate, formatDateTime, formatEuros, messageErreur } from "@/lib/format";
import { Cabinet, DocumentExpert, DossierExpert, GarageExpert, ProfilExpert, RapportExpert, agrementPour, nomExpert } from "@/lib/expertise/types";
import { ajouterDocument, chargerProfilExpert, chargerRapports, creerRapport, majDossier, ouvrirFichierExpert } from "@/lib/expertise/data";
import {
  ConclusionControle, Controle, CoteControle, DecisionControle, EcartControle, LIBELLE_CONCLUSION, LIBELLE_NATURE_CONTROLE, LigneConforme,
  MOTIFS_ACCEPTATION, MOTIFS_REFUS, STATUTS_CONTROLE, alerteLecture, appliquerControle, chiffrageAttendu, comparerControle, fusionnerDecisions,
  journaliser, lignesARessaisir, maintenant, resumer, texteDemandeConformite, totalHT,
} from "@/lib/expertise/controle";
import {
  chargerControlesDossier, coteAttendu, coteDepuisLecture, coteDepuisRapport, creerControle, deposerPourControle, lectureMemorisee, lireDocument, majControle, supprimerControle,
} from "@/lib/expertise/controleData";
import { CtxControlePdf, nomFichier, ouvrirPdf, pdfChiffrageDefinitif, pdfCourrierGarage, pdfNoteControle } from "@/lib/expertise/controlePdf";

type Role = "reference" | "devis";
type Filtre = "a_trancher" | "tous" | "accepte" | "refuse";

const signe = (n: number) => (n > 0.004 ? "+" : "") + formatEuros(n);

export default function ControleDevis({
  dossier,
  cabinet,
  garage,
  documents,
  onDocumentsChange,
  onDossierChange,
  onOuvrirRapport,
  demandeDevis,
}: {
  dossier: DossierExpert;
  cabinet: Cabinet | null;
  garage: GarageExpert | null;
  documents: DocumentExpert[];
  /** Recharge la liste des documents du dossier (après un dépôt / archivage). */
  onDocumentsChange: () => void;
  onDossierChange: (d: DossierExpert) => void;
  onOuvrirRapport: () => void;
  /** Un devis choisi depuis l'onglet Documents (« Contrôler ce devis »). */
  demandeDevis?: { doc: DocumentExpert; cle: number } | null;
}) {
  const [controles, setControles] = useState<Controle[]>([]);
  const [dispo, setDispo] = useState(true);
  const [chargement, setChargement] = useState(true);
  const [ctl, setCtl] = useState<Controle | null>(null);
  const [rapports, setRapports] = useState<RapportExpert[]>([]);
  const [expert, setExpert] = useState<ProfilExpert | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [lecture, setLecture] = useState<{ role: Role; nom: string } | null>(null);
  const [sauvegarde, setSauvegarde] = useState<"ok" | "attente" | "encours" | "erreur">("ok");
  const [filtre, setFiltre] = useState<Filtre>("a_trancher");
  const [typeFiltre, setTypeFiltre] = useState<"tous" | "poste" | "operation">("tous");
  const [recents, setRecents] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [pile, setPile] = useState<EcartControle[][]>([]);
  const [edition, setEdition] = useState<Role | null>(null);
  const [conclure, setConclure] = useState<ConclusionControle | "choix" | null>(null);
  const [archiver, setArchiver] = useState(true);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [voirConformes, setVoirConformes] = useState(false);
  const [voirJournal, setVoirJournal] = useState(false);
  const [texteCourrier, setTexteCourrier] = useState<string | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aSauver = useRef<Partial<Controle> | null>(null);
  const cartes = useRef<Map<string, HTMLDivElement>>(new Map());
  const fichierRef = useRef<HTMLInputElement>(null);
  const roleFichier = useRef<Role>("devis");
  const derniereDemande = useRef(0);

  /* ------------------------------ Chargement ------------------------- */

  const recharger = useCallback(async (garderId?: string) => {
    const [{ controles: c, dispo: ok }, r, e] = await Promise.all([chargerControlesDossier(dossier.id), chargerRapports(dossier.id), chargerProfilExpert()]);
    setControles(c);
    setDispo(ok);
    setRapports(r);
    setExpert(e);
    const choisi = (garderId && c.find((x) => x.id === garderId)) || c[c.length - 1] || null;
    setCtl(choisi);
    setChargement(false);
    return choisi;
  }, [dossier.id]);
  useEffect(() => { recharger(); }, [recharger]);

  /* --------------------------- Enregistrement ------------------------ */

  const vider = useCallback(async () => {
    if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; }
    const patch = aSauver.current;
    const id = patch?.id;
    if (!patch || !id) return;
    aSauver.current = null;
    setSauvegarde("encours");
    try {
      const { id: _i, ...reste } = patch;
      await majControle(id, reste);
      setSauvegarde(aSauver.current ? "attente" : "ok");
    } catch (e) {
      setSauvegarde("erreur");
      setErreur(messageErreur(e, "Enregistrement impossible : vérifie la connexion (tes décisions restent affichées)."));
      aSauver.current = { ...patch, ...(aSauver.current || {}) };
    }
  }, []);

  /** Modifie le contrôle courant ; enregistrement différé (700 ms). */
  const modifier = useCallback((patch: Partial<Controle>, immediat = false) => {
    setCtl((c) => {
      if (!c) return c;
      const n = { ...c, ...patch };
      aSauver.current = { ...(aSauver.current || {}), ...patch, id: c.id };
      return n;
    });
    setSauvegarde("attente");
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(vider, immediat ? 0 : 700);
  }, [vider]);

  // Garde-fou : prévenir avant de quitter avec des décisions non enregistrées.
  useEffect(() => {
    const avant = (e: BeforeUnloadEvent) => { if (aSauver.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", avant);
    return () => { window.removeEventListener("beforeunload", avant); vider(); };
  }, [vider]);

  /* ------------------------------ Calculs ---------------------------- */

  const resume = useMemo(() => (ctl ? resumer(ctl) : null), [ctl]);
  const conformes: LigneConforme[] = useMemo(() => (ctl?.reference && ctl.devis ? comparerControle(ctl.reference, ctl.devis).conformes : []), [ctl?.reference, ctl?.devis]); // eslint-disable-line react-hooks/exhaustive-deps
  const conclu = Boolean(ctl && ctl.statut !== "a_trancher");
  const dernierTour = ctl ? controles.length === 0 || controles[controles.length - 1].id === ctl.id : true;
  const agrement = useMemo(() => agrementPour(garage, dossier.mandant_nom), [garage, dossier.mandant_nom]);

  const visibles = useMemo(() => {
    if (!ctl) return [];
    return ctl.ecarts.filter((e) => {
      if (typeFiltre !== "tous" && e.type !== typeFiltre) return false;
      if (filtre === "tous") return true;
      if (filtre === "a_trancher") return e.decision === "a_trancher" || recents.has(e.id);
      return e.decision === filtre;
    });
  }, [ctl, filtre, typeFiltre, recents]);

  // Filtre par défaut : « À trancher » s'il en reste, sinon « Tous ».
  const idCourant = ctl?.id;
  useEffect(() => {
    if (!ctl) return;
    setFiltre(ctl.ecarts.some((e) => e.decision === "a_trancher") && ctl.statut === "a_trancher" ? "a_trancher" : "tous");
    setRecents(new Set());
    setPile([]);
    setFocus(0);
  }, [idCourant]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----------------------------- Décisions --------------------------- */

  const empiler = useCallback((avant: EcartControle[]) => setPile((p) => [...p.slice(-49), avant]), []);

  const decider = useCallback((id: string, decision: DecisionControle, motif?: string | null) => {
    if (!ctl || conclu) return;
    empiler(ctl.ecarts);
    const ecarts = ctl.ecarts.map((e) => (e.id === id ? { ...e, decision, motif: motif !== undefined ? motif : e.decision === decision ? e.motif : null } : e));
    modifier({ ecarts });
    if (filtre === "a_trancher") setRecents((s) => new Set(s).add(id));
    // Focus sur le prochain écart encore à trancher.
    const i = visibles.findIndex((e) => e.id === id);
    const suivant = visibles.findIndex((e, j) => j > i && e.decision === "a_trancher" && e.id !== id);
    if (suivant >= 0) setFocus(suivant);
  }, [ctl, conclu, empiler, modifier, filtre, visibles]);

  const motiver = useCallback((id: string, motif: string) => {
    if (!ctl || conclu) return;
    modifier({ ecarts: ctl.ecarts.map((e) => (e.id === id ? { ...e, motif: motif || null } : e)) });
  }, [ctl, conclu, modifier]);

  const annuler = useCallback(() => {
    if (!ctl || conclu || !pile.length) return;
    const precedent = pile[pile.length - 1];
    setPile((p) => p.slice(0, -1));
    modifier({ ecarts: precedent });
  }, [ctl, conclu, pile, modifier]);

  function groupe(decision: DecisionControle, seulementATrancher: boolean) {
    if (!ctl) return;
    const cibles = ctl.ecarts.filter((e) => (seulementATrancher ? e.decision === "a_trancher" : e.decision !== "a_trancher"));
    if (!cibles.length) return;
    const libelle = decision === "accepte" ? "ACCEPTER (valeur du devis)" : decision === "refuse" ? "REFUSER (maintenir le pré-rapport)" : "remettre À TRANCHER";
    if (!confirm(`${libelle} : ${cibles.length} écart(s) concerné(s).\n\nTu pourras revenir en arrière avec « Annuler ».`)) return;
    empiler(ctl.ecarts);
    const ids = new Set(cibles.map((e) => e.id));
    modifier({ ecarts: ctl.ecarts.map((e) => (ids.has(e.id) ? { ...e, decision, motif: decision === "a_trancher" ? null : e.motif } : e)) });
  }

  // Raccourcis clavier (hors saisie, hors modale).
  const modaleOuverte = Boolean(edition || conclure || texteCourrier);
  useEffect(() => {
    if (!ctl || conclu || modaleOuverte) return;
    const surTouche = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") { ev.preventDefault(); annuler(); return; }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const e = visibles[focus];
      const k = ev.key.toLowerCase();
      if (k === "arrowdown" || k === "j") { ev.preventDefault(); setFocus((f) => Math.min(visibles.length - 1, f + 1)); }
      else if (k === "arrowup" || k === "k") { ev.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
      else if (k === "a" && e) { ev.preventDefault(); decider(e.id, "accepte"); }
      else if (k === "r" && e) { ev.preventDefault(); decider(e.id, "refuse"); }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ctl, conclu, modaleOuverte, visibles, focus, decider, annuler]);

  useEffect(() => {
    const e = visibles[focus];
    if (e) cartes.current.get(e.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----------------------- Pré-rapport et devis ---------------------- */

  /** Pose un côté ; recalcule les écarts en gardant les décisions inchangées. */
  const poserCote = useCallback(async (role: Role, cote: CoteControle, action: string) => {
    let courant = ctl;
    if (!courant) {
      courant = await creerControle({ dossierId: dossier.id, ...(role === "reference" ? { reference: cote } : { devis: cote }), action: "Contrôle ouvert" });
      setControles((l) => [...l, courant as Controle]);
    }
    const reference = role === "reference" ? cote : courant.reference;
    const devis = role === "devis" ? cote : courant.devis;
    let ecarts = courant.ecarts;
    if (reference && devis) ecarts = fusionnerDecisions(courant.ecarts, comparerControle(reference, devis).ecarts);
    const patch: Partial<Controle> = { ...(role === "reference" ? { reference: cote } : { devis: cote }), ecarts, journal: journaliser(courant.journal, action) };
    // Les écarts changent de base : la pile d'annulation ne s'applique plus.
    setPile([]);
    setCtl({ ...courant, ...patch });
    aSauver.current = { ...(aSauver.current || {}), ...patch, id: courant.id };
    await vider();
    if (reference && devis) setFiltre(ecarts.some((e) => e.decision === "a_trancher") ? "a_trancher" : "tous");
  }, [ctl, dossier.id, vider]);

  /** Garde-fou avant de remplacer un document sur lequel des décisions existent. */
  const confirmerRemplacement = (role: Role) =>
    !(ctl && (role === "reference" ? ctl.reference : ctl.devis) && ctl.ecarts.some((e) => e.decision !== "a_trancher"))
    || confirm("Remplacer ce document ?\n\nLes décisions prises sur les lignes inchangées sont conservées ; les autres repasseront « à trancher ».");

  const lire = useCallback(async (role: Role, doc: DocumentExpert, opts: { forcer?: boolean; confirme?: boolean } = {}) => {
    const forcer = Boolean(opts.forcer);
    const autre = role === "reference" ? ctl?.devis : ctl?.reference;
    if (autre?.document_id === doc.id) { setErreur("Ce document est déjà utilisé de l'autre côté de la comparaison."); return; }
    if (!forcer && !opts.confirme && !confirmerRemplacement(role)) return;
    setErreur(null);
    const mode = role === "reference" ? "rapport" : "devis";
    setLecture({ role, nom: doc.nom });
    try {
      const l = await lireDocument({ dossier, doc, mode, forcer });
      await poserCote(role, coteDepuisLecture(l, doc), `${role === "reference" ? "Pré-rapport" : "Devis"} lu : ${doc.nom}`);
      onDocumentsChange();
    } catch (e) {
      setErreur(messageErreur(e, "Lecture impossible."));
    } finally {
      setLecture(null);
    }
  }, [ctl, dossier, poserCote, onDocumentsChange]); // eslint-disable-line react-hooks/exhaustive-deps

  async function deposer(role: Role, file: File) {
    setErreur(null);
    setLecture({ role, nom: file.name });
    try {
      const doc = await deposerPourControle(dossier.id, file, role);
      onDocumentsChange();
      setLecture(null);
      await lire(role, doc, { confirme: true });
    } catch (e) {
      setErreur(messageErreur(e, "Dépôt impossible."));
      setLecture(null);
    }
  }

  // Devis choisi depuis l'onglet Documents.
  useEffect(() => {
    if (!demandeDevis || demandeDevis.cle === derniereDemande.current || chargement) return;
    derniereDemande.current = demandeDevis.cle;
    if (conclu) { setInfo("Ce contrôle est conclu : ouvre un nouveau tour (ou rouvre-le) pour contrôler un autre devis."); return; }
    lire("devis", demandeDevis.doc);
  }, [demandeDevis, chargement]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------ Conclusion ------------------------- */

  const ctxPdf = (c: Controle): CtxControlePdf => ({ dossier, cabinet, expert, controle: c });

  async function archiverPdf(type: "courrier" | "note", c: Controle) {
    const pdf = type === "courrier" ? await pdfCourrierGarage(ctxPdf(c)) : await pdfNoteControle(ctxPdf(c));
    const blob = pdf.output("blob");
    await ajouterDocument({ dossierId: dossier.id, type: type === "courrier" ? "courrier" : "autre", file: blob, nom: nomFichier(type, ctxPdf(c)) });
  }

  async function executerConclusion(conclusion: ConclusionControle) {
    if (!ctl || !resume) return;
    setEnCours("conclusion");
    setErreur(null);
    try {
      await vider();
      const resultat = appliquerControle(ctl.reference!, ctl.ecarts);
      const statut = conclusion === "conformite_demandee" ? "attente_garage" : "valide";
      const detail = `${resume.acceptes} accepté(s), ${resume.refuses} refusé(s) — retenu ${formatEuros(resume.totalRetenu)} HT`;
      const maj = await majControle(ctl.id, {
        statut, conclusion, cloture_le: maintenant(),
        resultat: { ...resultat, total_ht: totalHT(resultat) },
        journal: journaliser(ctl.journal, LIBELLE_CONCLUSION[conclusion], detail),
      });
      setCtl(maj);
      setControles((l) => l.map((x) => (x.id === maj.id ? maj : x)));
      setPile([]);
      if (archiver) {
        try {
          await archiverPdf(conclusion === "conformite_demandee" ? "courrier" : "note", maj);
          onDocumentsChange();
        } catch { /* l'archivage est un plus : la conclusion reste valable */ }
      }
      if (conclusion === "conformite_demandee") setTexteCourrier(texteCourrierDe(maj));
      setInfo(conclusion === "conformite_demandee"
        ? "Demande de mise en conformité prête : copie le texte dans l'extranet ou envoie le courrier PDF. Quand le garage renvoie son devis, ouvre le tour suivant."
        : "Contrôle conclu. Reporte les lignes du « Chiffrage définitif » dans ton logiciel, ou crée le rapport définitif ici.");
      setConclure(null);
    } catch (e) {
      setErreur(messageErreur(e, "Conclusion impossible."));
    } finally {
      setEnCours(null);
    }
  }

  async function rouvrir() {
    if (!ctl) return;
    if (!confirm("Rouvrir ce contrôle ?\n\nLes décisions sont conservées et redeviennent modifiables. Les documents déjà archivés restent dans le dossier.")) return;
    try {
      const maj = await majControle(ctl.id, { statut: "a_trancher", conclusion: null, cloture_le: null, journal: journaliser(ctl.journal, "Contrôle rouvert") });
      setCtl(maj);
      setControles((l) => l.map((x) => (x.id === maj.id ? maj : x)));
    } catch (e) { setErreur(messageErreur(e)); }
  }

  async function tourSuivant() {
    if (!ctl) return;
    try {
      const attendu = chiffrageAttendu(ctl);
      const n = await creerControle({ dossierId: dossier.id, tour: ctl.tour + 1, parentId: ctl.id, reference: coteAttendu(ctl, attendu) });
      await majControle(ctl.id, { journal: journaliser(ctl.journal, `Tour ${n.tour} ouvert pour le devis rectifié`) });
      await recharger(n.id);
      setInfo(`Tour ${n.tour} : la référence est le chiffrage attendu (pré-rapport + écarts acceptés). Dépose le devis rectifié du garage.`);
    } catch (e) { setErreur(messageErreur(e, "Ouverture du tour suivant impossible.")); }
  }

  async function supprimer() {
    if (!ctl) return;
    if (!confirm(`Supprimer le contrôle${ctl.tour > 1 ? ` (tour ${ctl.tour})` : ""} ?\n\nLes documents (pré-rapport, devis, courriers) restent dans le dossier. Cette suppression est définitive.`)) return;
    try {
      await supprimerControle(ctl.id);
      await recharger();
    } catch (e) { setErreur(messageErreur(e)); }
  }

  async function creerRapportDefinitif() {
    if (!ctl || !resume) return;
    if (ctl.rapport_id) { onOuvrirRapport(); return; }
    setEnCours("rapport");
    try {
      const resultat = ctl.resultat || appliquerControle(ctl.reference!, ctl.ecarts);
      const base = ctl.reference?.rapport_id ? rapports.find((r) => r.id === ctl.reference!.rapport_id) : null;
      const r = await creerRapport({
        dossier, source: "devis", chocs: resultat.chocs, operations: resultat.operations,
        taux_tva: base?.taux_tva ?? (Number(cabinet?.taux_tva) || 20),
        remise: base?.remise ?? 0, vetuste: base?.vetuste ?? 0, srgc: base?.srgc ?? 0,
        comparaison: {
          document_id: ctl.devis?.document_id ?? null,
          document_nom: ctl.devis?.nom ?? null,
          rapport_base_id: base?.id || "",
          base_version: base?.version || ctl.reference?.rapport_version || 1,
          date: new Date().toISOString().slice(0, 10),
          total_pre_rapport: resume.totalReference,
          total_devis: resume.totalDevis,
          commentaire: ctl.commentaire,
          ecarts: ctl.ecarts.map((e) => ({
            id: e.id, type: e.type, nature: e.nature, libelle: e.libelle, avant: e.avant, apres: e.apres,
            montant_avant: e.montant_avant, montant_apres: e.montant_apres,
            decision: e.decision === "accepte" ? "accepte" as const : "refuse" as const, commentaire: e.motif ?? null,
          })),
        },
      });
      const maj = await majControle(ctl.id, { rapport_id: r.id, journal: journaliser(ctl.journal, `Rapport définitif v${r.version} créé`) });
      setCtl(maj);
      setControles((l) => l.map((x) => (x.id === maj.id ? maj : x)));
      if (["mission", "visite", "chiffrage"].includes(dossier.statut)) onDossierChange(await majDossier(dossier.id, { statut: "rapport" }));
      setInfo(`Rapport définitif v${r.version} créé : relis-le puis émets-le depuis l'onglet Rapport.`);
    } catch (e) {
      setErreur(messageErreur(e, "Création du rapport définitif impossible."));
    } finally {
      setEnCours(null);
    }
  }

  function texteCourrierDe(c: Controle) {
    return texteDemandeConformite({
      garage: dossier.reparateur_nom, dossierNumero: dossier.numero, immatriculation: dossier.immatriculation,
      vehicule: [dossier.marque, dossier.modele].filter(Boolean).join(" ") || null, sinistre: dossier.numero_sinistre,
      devisNom: c.devis?.nom ?? null, ecarts: c.ecarts, commentaire: c.commentaire,
      expert: nomExpert(expert) || cabinet?.expert_nom || null, cabinet: cabinet?.nom || "Alliance Experts",
      totalAttendu: totalHT(chiffrageAttendu(c)),
    });
  }

  async function documentPdf(type: "courrier" | "note" | "chiffrage", sortie: "voir" | "telecharger") {
    if (!ctl) return;
    setEnCours(`${type}-${sortie}`);
    try {
      const c = ctxPdf(ctl);
      const pdf = type === "courrier" ? await pdfCourrierGarage(c) : type === "note" ? await pdfNoteControle(c) : await pdfChiffrageDefinitif(c);
      if (sortie === "voir") ouvrirPdf(pdf); else pdf.save(nomFichier(type, c));
    } catch (e) { setErreur(messageErreur(e, "PDF impossible.")); } finally { setEnCours(null); }
  }

  /* --------------------------------- UI ------------------------------ */

  if (chargement) return <div className="skeleton h-40 rounded-2xl" />;
  if (!dispo) {
    return (
      <div className="alerte alerte-warn text-sm">
        Le contrôle du devis a besoin de sa table : exécute <code className="font-mono">supabase/migration_v87.sql</code> dans Supabase → SQL Editor, puis recharge la page.
      </div>
    );
  }

  const docsPre = documents.filter((d) => d.type === "pre_rapport" || d.type === "rapport");
  const docsDevis = documents.filter((d) => d.type === "devis_garage");
  const docDe = (c: CoteControle | null | undefined) => (c?.document_id ? documents.find((d) => d.id === c.document_id) || null : null);
  const pret = Boolean(ctl?.reference && ctl?.devis);

  /** Carte d'un côté (pré-rapport ou devis) — fonction de rendu, pas un sous-composant. */
  const renderCote = (role: Role) => {
    const cote = role === "reference" ? ctl?.reference : ctl?.devis;
    const titre = role === "reference" ? (ctl && ctl.tour > 1 ? "Référence : chiffrage attendu" : "① Pré-rapport de l'expert") : "② Devis du garage";
    const enLecture = lecture?.role === role;
    const alerte = alerteLecture(cote);
    const doc = docDe(cote);
    const verrou = conclu || (role === "reference" && cote?.source === "tour_precedent");
    return (
      <div className={`glass-soft flex flex-col gap-2 p-3 ${cote ? "border border-emerald-400/40" : "border border-dashed border-white/25"}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{titre}</span>
          {cote && <span className="text-lg font-semibold">{formatEuros(totalHT(cote))} <span className="text-xs font-normal text-white/50">HT lu</span></span>}
        </div>
        {enLecture ? (
          <div className="py-3">
            <div className="skeleton h-2.5 w-3/4 rounded-full" />
            <p className="mt-2 text-sm text-white/60">Lecture de « {lecture?.nom} » ligne par ligne… (20 à 50 s)</p>
          </div>
        ) : cote ? (
          <>
            <div className="min-w-0 text-sm">
              <div className="truncate font-medium" title={cote.nom || ""}>{cote.nom}</div>
              <div className="text-xs text-white/55">
                {cote.source === "rapport" ? "Chiffré dans l'appli" : cote.source === "tour_precedent" ? "Pré-rapport + écarts acceptés au tour précédent" : cote.source === "manuel" ? "Saisi" : "Lu automatiquement"}
                {" · "}{(cote.chocs || []).reduce((n, c) => n + c.postes.filter((p) => Number(p.heures) > 0 || Number(p.forfait) > 0).length, 0)} poste(s) MO · {(cote.operations || []).length} opération(s)
                {cote.confiance && cote.source === "pdf" && <> · lecture {cote.confiance}</>}
                {cote.corrige && <> · corrigée</>}
              </div>
            </div>
            {alerte && (
              <div className="alerte alerte-warn text-xs">
                Total imprimé {formatEuros(alerte.imprime)} ≠ total lu {formatEuros(alerte.lu)} (écart {formatEuros(alerte.ecart)}). Vérifie la lecture avant de trancher.
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              <button className="btn-ghost btn-compact" onClick={() => setEdition(role)}><Icone nom="oeil" /> {verrou ? "Voir la lecture" : "Vérifier / corriger"}</button>
              {doc && <button className="btn-ghost btn-compact" onClick={() => ouvrirFichierExpert(doc.path)}><Icone nom="document" /> Document</button>}
              {!verrou && doc && <button className="btn-ghost btn-compact" title="Relire le document (nouvelle lecture automatique)" onClick={() => { if (confirm("Relancer la lecture automatique de ce document ?")) lire(role, doc, { forcer: true }); }}><Icone nom="ia" /> Relire</button>}
            </div>
            {!verrou && renderChoix(role, true)}
          </>
        ) : (
          renderChoix(role, false)
        )}
      </div>
    );
  };

  /** Boutons pour choisir / déposer le document d'un côté. */
  const renderChoix = (role: Role, remplacement: boolean) => {
    const docs = role === "reference" ? docsPre : docsDevis;
    const courantId = (role === "reference" ? ctl?.reference : ctl?.devis)?.document_id;
    const rapportsDispo = role === "reference" ? rapports.filter((r) => r.id !== ctl?.reference?.rapport_id) : [];
    const autres = docs.filter((d) => d.id !== courantId);
    if (remplacement && !autres.length && !rapportsDispo.length) {
      return <button className="btn-ghost btn-compact self-start" disabled={Boolean(lecture)} onClick={() => { if (!confirmerRemplacement(role)) return; roleFichier.current = role; fichierRef.current?.click(); }}><Icone nom="importer" /> Remplacer par un autre fichier</button>;
    }
    return (
      <div className={remplacement ? "border-t border-white/10 pt-2" : ""}>
        {remplacement && <div className="mb-1 text-[11px] uppercase tracking-wider text-white/45">Remplacer par</div>}
        <div className="flex flex-wrap gap-1">
          {autres.map((d) => (
            <button key={d.id} className="btn-ghost btn-compact max-w-full truncate" disabled={Boolean(lecture)} title={d.nom} onClick={() => lire(role, d)}>
              {lectureMemorisee(d, role === "reference" ? "rapport" : "devis") ? <Icone nom="check" /> : <Icone nom="document" />} {d.nom}
            </button>
          ))}
          {rapportsDispo.map((r) => (
            <button key={r.id} className="btn-ghost btn-compact" disabled={Boolean(lecture)} onClick={() => { if (confirmerRemplacement("reference")) poserCote("reference", coteDepuisRapport(r), `Pré-rapport : rapport v${r.version} de l'appli`); }}>
              <Icone nom="rapport" /> Rapport v{r.version} ({formatEuros(totalHT(r))})
            </button>
          ))}
          <button className={`${remplacement ? "btn-ghost" : "btn-primary"} btn-compact`} disabled={Boolean(lecture)} onClick={() => { if (!confirmerRemplacement(role)) return; roleFichier.current = role; fichierRef.current?.click(); }}>
            <Icone nom="importer" /> {role === "reference" ? "Déposer le pré-rapport (PDF)" : "Déposer le devis (PDF / photo)"}
          </button>
        </div>
        {!remplacement && (
          <p className="mt-2 text-[11px] text-white/45">
            {role === "reference"
              ? "Le PDF édité par ton logiciel d'expertise, tel quel. Il est lu ligne par ligne ; tu peux vérifier la lecture."
              : "Le devis reçu par l'extranet ou par email. Une photo nette convient aussi."}
          </p>
        )}
      </div>
    );
  };

  /** Taux agréé correspondant à un poste (garde-fou visuel). */
  const tauxAgree = (poste: string): number | null => {
    if (!agrement?.tarif_preferentiel) return null;
    const p = poste.toLowerCase();
    if (/peinture|vernis/.test(p)) return Number(agrement.taux_peinture ?? garage?.taux_peinture) || null;
    if (/t2/.test(p)) return Number(agrement.taux_t2 ?? garage?.taux_t2) || null;
    if (/t1|t[ôo]lerie/.test(p)) return Number(agrement.taux_t1 ?? garage?.taux_t1) || null;
    return null;
  };

  const renderEcart = (e: EcartControle, i: number) => {
    const d = e.montant_apres - e.montant_avant;
    const actif = i === focus && !conclu;
    const motifs = e.decision === "refuse" ? MOTIFS_REFUS : e.decision === "accepte" ? MOTIFS_ACCEPTATION : [];
    const taux = e.type === "poste" && /taux/.test(e.precision || "") ? tauxAgree(e.libelle) : null;
    const cadre = e.decision === "accepte" ? "border-emerald-400/70" : e.decision === "refuse" ? "border-rose-400/70" : actif ? "border-accent-teal/70" : "border-white/10";
    return (
      <div
        key={e.id}
        ref={(el) => { if (el) cartes.current.set(e.id, el); else cartes.current.delete(e.id); }}
        className={`glass-soft border-2 p-3 transition ${cadre} ${actif ? "shadow-lg" : ""}`}
        onClick={() => !conclu && setFocus(i)}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`badge ${e.nature === "ajout" ? "badge-warn" : e.nature === "suppression" ? "badge-danger" : "badge-info"}`}>{LIBELLE_NATURE_CONTROLE[e.nature]}</span>
              <span className="text-[11px] uppercase tracking-wider text-white/45">{e.type === "poste" ? "Main-d'œuvre" : "Opération / pièce"}</span>
            </div>
            <div className="mt-1 font-semibold">{e.libelle}</div>
            {e.precision && <div className="text-xs text-white/60">{e.precision}</div>}
            {taux && <div className="mt-0.5 text-xs"><span className="badge badge-ok">Taux agréé {agrement?.assurance} : {formatEuros(taux)}/h</span></div>}
          </div>
          <div className={`text-right text-lg font-bold tabular-nums ${d > 0.004 ? "text-rose-600" : d < -0.004 ? "text-emerald-600" : "text-white/60"}`}>
            {signe(d)}
            <div className="text-[10px] font-normal uppercase tracking-wider text-white/45">écart HT</div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={conclu}
            onClick={(ev) => { ev.stopPropagation(); decider(e.id, e.decision === "refuse" ? "a_trancher" : "refuse"); }}
            className={`rounded-xl border-2 p-2 text-left transition ${e.decision === "refuse" ? "border-rose-400 bg-rose-500/10" : "border-white/15 hover:border-rose-300"}`}
            title="Maintenir la valeur du pré-rapport (touche R)"
          >
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-white/50">
              <span>Pré-rapport</span>
              <span className={`font-semibold ${e.decision === "refuse" ? "text-rose-600" : ""}`}>{e.decision === "refuse" ? "✓ Maintenu" : "Maintenir (R)"}</span>
            </div>
            <div className="mt-0.5 font-medium">{e.avant || <span className="text-white/40">ligne absente</span>}</div>
            <div className="text-xs text-white/50">{formatEuros(e.montant_avant)} HT</div>
          </button>
          <button
            type="button"
            disabled={conclu}
            onClick={(ev) => { ev.stopPropagation(); decider(e.id, e.decision === "accepte" ? "a_trancher" : "accepte"); }}
            className={`rounded-xl border-2 p-2 text-left transition ${e.decision === "accepte" ? "border-emerald-400 bg-emerald-500/10" : "border-white/15 hover:border-emerald-300"}`}
            title="Accepter la valeur du devis (touche A)"
          >
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-white/50">
              <span>Devis du garage</span>
              <span className={`font-semibold ${e.decision === "accepte" ? "text-emerald-600" : ""}`}>{e.decision === "accepte" ? "✓ Accepté" : "Accepter (A)"}</span>
            </div>
            <div className="mt-0.5 font-medium">{e.apres || <span className="text-white/40">ligne retirée par le garage</span>}</div>
            <div className="text-xs text-white/50">{formatEuros(e.montant_apres)} HT</div>
          </button>
        </div>

        {e.decision !== "a_trancher" && (
          <div className="mt-2 space-y-1.5" onClick={(ev) => ev.stopPropagation()}>
            {!conclu && (
              <div className="flex flex-wrap gap-1">
                {motifs.map((m) => (
                  <button key={m} type="button" className={`rounded-full border px-2 py-0.5 text-[11px] transition ${e.motif === m ? "border-accent-teal bg-accent-teal/15 font-semibold" : "border-white/20 text-white/65 hover:border-white/40"}`} onClick={() => motiver(e.id, e.motif === m ? "" : m)}>{m}</button>
                ))}
              </div>
            )}
            {conclu ? (
              e.motif ? <div className="text-xs text-white/65">Motif : {e.motif}</div> : null
            ) : (
              <input className="field-input field-compact w-full text-xs" placeholder={e.decision === "refuse" ? "Motif du refus (repris dans le courrier au garage)" : "Motif (facultatif)"} value={e.motif || ""} onChange={(ev) => motiver(e.id, ev.target.value)} />
            )}
          </div>
        )}
      </div>
    );
  };

  const nb = (f: Filtre) => (ctl ? ctl.ecarts.filter((e) => (typeFiltre === "tous" || e.type === typeFiltre) && (f === "tous" || e.decision === f)).length : 0);
  const pct = resume && resume.total ? Math.round(((resume.total - resume.aTrancher) / resume.total) * 100) : 100;
  const aReporter = ctl ? lignesARessaisir(ctl.ecarts) : [];

  return (
    <div className="space-y-4">
      <input ref={fichierRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) deposer(roleFichier.current, f); e.target.value = ""; }} />
      <Erreur message={erreur} />
      {info && <div className="alerte alerte-ok flex items-start justify-between gap-2 text-sm"><span>{info}</span><button className="text-xs underline" onClick={() => setInfo(null)}>fermer</button></div>}

      {/* ------------------------- Tours & statut ------------------------ */}
      {ctl && (
        <div className="glass-card flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {controles.length > 1 && (
              <select className="field-input field-compact w-auto" value={ctl.id} onChange={async (e) => { await vider(); const liste = controles.map((x) => (x.id === ctl.id ? ctl : x)); setControles(liste); setCtl(liste.find((c) => c.id === e.target.value) || null); }}>
                {controles.map((c) => <option key={c.id} value={c.id}>Tour {c.tour} · {STATUTS_CONTROLE[c.statut]?.label} · {formatDate(c.created_at)}</option>)}
              </select>
            )}
            {controles.length <= 1 && <span className="text-sm font-semibold">Contrôle du devis{ctl.tour > 1 ? ` · tour ${ctl.tour}` : ""}</span>}
            <span className={`badge ${STATUTS_CONTROLE[ctl.statut]?.badge}`}>{STATUTS_CONTROLE[ctl.statut]?.label}</span>
            {!conclu && <span className={`text-xs ${sauvegarde === "erreur" ? "text-rose-600" : "text-white/45"}`}>{sauvegarde === "ok" ? "✓ Enregistré" : sauvegarde === "encours" ? "Enregistrement…" : sauvegarde === "erreur" ? "Non enregistré — nouvel essai à la prochaine action" : "Modifications en attente…"}</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            {!conclu && pret && <button className="btn-ghost btn-compact" disabled={!pile.length} onClick={annuler} title="Annuler la dernière action (Ctrl+Z)"><Icone nom="gauche" /> Annuler{pile.length ? ` (${pile.length})` : ""}</button>}
            <button className="btn-ghost btn-compact" onClick={() => setVoirJournal((v) => !v)}><Icone nom="horloge" /> Historique</button>
            {dernierTour && <button className="btn-ghost btn-compact" onClick={supprimer} title="Supprimer ce contrôle"><Icone nom="poubelle" /></button>}
          </div>
        </div>
      )}

      {voirJournal && ctl && (
        <Bloc titre="Historique du contrôle">
          <ul className="space-y-1 text-sm">
            {[...ctl.journal].reverse().map((j, i) => (
              <li key={i} className="flex flex-wrap gap-x-2"><span className="text-white/45 tabular-nums">{formatDateTime(j.date)}</span><span className="font-medium">{j.action}</span>{j.detail && <span className="text-white/60">— {j.detail}</span>}</li>
            ))}
            {!ctl.journal.length && <li className="text-white/45">Aucune action enregistrée.</li>}
          </ul>
        </Bloc>
      )}

      {/* ------------------------ ① Préparation -------------------------- */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {renderCote("reference")}
        {renderCote("devis")}
      </div>

      {!ctl && !lecture && (
        <p className="text-center text-sm text-white/55">Dépose les deux documents : les écarts apparaissent aussitôt, du plus lourd au plus léger.</p>
      )}

      {/* ------------------------- Synthèse chiffrée --------------------- */}
      {pret && resume && (
        <div className="glass-card space-y-3 p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 text-center lg:grid-cols-4">
            <div className="glass-soft p-2"><div className="text-[11px] uppercase tracking-wider text-white/45">Pré-rapport</div><div className="text-lg font-semibold tabular-nums">{formatEuros(resume.totalReference)}</div><div className="text-xs text-white/45">HT</div></div>
            <div className="glass-soft p-2"><div className="text-[11px] uppercase tracking-wider text-white/45">Devis du garage</div><div className="text-lg font-semibold tabular-nums">{formatEuros(resume.totalDevis)}</div><div className={`text-xs ${resume.totalDevis - resume.totalReference > 0 ? "text-rose-600" : "text-emerald-600"}`}>{signe(resume.totalDevis - resume.totalReference)} vs pré-rapport</div></div>
            <div className="glass-soft border-2 border-accent-teal/60 p-2"><div className="text-[11px] uppercase tracking-wider text-white/45">Retenu</div><div className="text-lg font-bold tabular-nums">{formatEuros(resume.totalRetenu)}</div><div className="text-xs text-white/45">HT, selon tes décisions</div></div>
            <div className="glass-soft p-2"><div className="text-[11px] uppercase tracking-wider text-white/45">Non retenu</div><div className="text-lg font-semibold tabular-nums text-emerald-600">{formatEuros(resume.economie)}</div><div className="text-xs text-white/45">devis − retenu</div></div>
          </div>
          {resume.total > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>{resume.total - resume.aTrancher} / {resume.total} écart(s) tranché(s) · {resume.acceptes} accepté(s) · {resume.refuses} refusé(s)</span>
                <span>{pct} %</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-accent-teal transition-all" style={{ width: `${pct}%` }} /></div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------- ② Écarts --------------------------- */}
      {pret && ctl && (
        ctl.ecarts.length === 0 ? (
          <div className="alerte alerte-ok text-sm">Aucun écart : le devis du garage est <b>conforme</b> au {ctl.tour > 1 ? "chiffrage attendu" : "pré-rapport"} ({conformes.length} ligne(s) identique(s)).</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {([["a_trancher", "À trancher"], ["tous", "Tous"], ["accepte", "Acceptés"], ["refuse", "Refusés"]] as const).map(([code, label]) => (
                  <button key={code} className={`al-onglet ${filtre === code ? "actif" : ""}`} onClick={() => { setFiltre(code); setRecents(new Set()); setFocus(0); }}>
                    {label} <span className="ml-1 text-xs opacity-60">{code === "a_trancher" ? ctl.ecarts.filter((e) => e.decision === "a_trancher" && (typeFiltre === "tous" || e.type === typeFiltre)).length : nb(code)}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <select className="field-input field-compact w-auto" value={typeFiltre} onChange={(e) => { setTypeFiltre(e.target.value as typeof typeFiltre); setFocus(0); }}>
                  <option value="tous">Main-d&apos;œuvre et pièces</option>
                  <option value="poste">Main-d&apos;œuvre seulement</option>
                  <option value="operation">Pièces / opérations seulement</option>
                </select>
                {!conclu && (
                  <details className="relative">
                    <summary className="btn-ghost btn-compact cursor-pointer list-none">Actions groupées ▾</summary>
                    <div className="glass-card absolute right-0 z-20 mt-1 flex w-64 flex-col gap-1 p-2">
                      <button className="btn-ghost btn-compact justify-start" disabled={!resume?.aTrancher} onClick={() => groupe("accepte", true)}>Accepter les {resume?.aTrancher || 0} restants</button>
                      <button className="btn-ghost btn-compact justify-start" disabled={!resume?.aTrancher} onClick={() => groupe("refuse", true)}>Refuser les {resume?.aTrancher || 0} restants</button>
                      <button className="btn-ghost btn-compact justify-start" disabled={!resume || resume.aTrancher === resume.total} onClick={() => groupe("a_trancher", false)}>Tout remettre à trancher</button>
                    </div>
                  </details>
                )}
              </div>
            </div>

            {!conclu && <p className="hidden text-[11px] text-white/45 md:block">Clavier : <b>A</b> accepter le devis · <b>R</b> maintenir le pré-rapport · <b>↑ ↓</b> écart précédent / suivant · <b>Ctrl+Z</b> annuler. Un 2e clic sur la valeur choisie la remet « à trancher ».</p>}

            {visibles.length === 0 ? (
              <div className="glass-card p-4">
                <Vide
                  titre={filtre === "a_trancher" ? "Tous les écarts sont tranchés" : "Aucun écart dans ce filtre"}
                  texte={filtre === "a_trancher" ? "Relis au besoin (filtre « Tous »), ajoute un commentaire, puis conclus ci-dessous." : undefined}
                  action={filtre === "a_trancher" ? <button className="btn-ghost" onClick={() => setFiltre("tous")}>Voir tous les écarts</button> : undefined}
                />
              </div>
            ) : (
              <div className="space-y-2">{visibles.map(renderEcart)}</div>
            )}
          </div>
        )
      )}

      {pret && conformes.length > 0 && (
        <div className="glass-card p-3">
          <button className="flex w-full items-center justify-between text-sm font-medium" onClick={() => setVoirConformes((v) => !v)}>
            <span><Icone nom="check" className="text-emerald-600" /> {conformes.length} ligne(s) identique(s) au {ctl && ctl.tour > 1 ? "chiffrage attendu" : "pré-rapport"}</span>
            <span className="text-xs text-white/50">{voirConformes ? "masquer" : "afficher"}</span>
          </button>
          {voirConformes && (
            <table className="al-table mt-2">
              <tbody>{conformes.map((l, i) => <tr key={i}><td>{l.libelle}</td><td className="text-white/60">{l.valeur}</td><td className="num">{formatEuros(l.montant)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {/* ---------------------------- ③ Conclure ------------------------- */}
      {pret && ctl && resume && (
        <Bloc titre={conclu ? `Conclusion : ${ctl.conclusion ? LIBELLE_CONCLUSION[ctl.conclusion] : ""}` : "③ Conclure"}>
          <div className="space-y-3">
            <div>
              <label className="field-label">Commentaire de l&apos;expert (repris dans le courrier et la note)</label>
              <textarea className="field-input" rows={2} disabled={conclu} value={ctl.commentaire || ""} onChange={(e) => modifier({ commentaire: e.target.value || null })} placeholder="Ex. : temps de peinture ramenés au barème ; pièce de réemploi exigée sur le hayon…" />
            </div>

            {!conclu ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-white/60">
                  {resume.aTrancher > 0
                    ? <>Encore <b>{resume.aTrancher}</b> écart(s) à trancher avant de conclure.</>
                    : resume.refuses === 0
                      ? <>Tous les écarts sont acceptés : le devis du garage peut être <b>validé</b> ({formatEuros(resume.totalRetenu)} HT).</>
                      : <><b>{resume.refuses}</b> écart(s) refusé(s) : demande la mise en conformité au garage, ou maintiens ton chiffrage.</>}
                </p>
                {resume.aTrancher > 0 ? (
                  <button className="btn-ghost" onClick={() => { setFiltre("a_trancher"); setRecents(new Set()); setFocus(0); }}>Aller au prochain écart <Icone nom="droite" /></button>
                ) : resume.refuses === 0 ? (
                  <button className="btn-primary" onClick={() => setConclure("devis_valide")}><Icone nom="check" /> Valider le devis du garage</button>
                ) : (
                  <button className="btn-primary" onClick={() => setConclure("choix")}>Conclure le contrôle <Icone nom="droite" /></button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-white/65">
                  Conclu le {formatDateTime(ctl.cloture_le)} · retenu <b>{formatEuros(ctl.resultat?.total_ht ?? resume.totalRetenu)} HT</b>
                  {aReporter.length > 0 ? <> · <b>{aReporter.length}</b> ligne(s) à reporter dans ton logiciel</> : <> · pré-rapport inchangé</>}
                </div>
                {ctl.statut === "attente_garage" && dernierTour && (
                  <div className="alerte alerte-info flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>En attente du devis rectifié de {dossier.reparateur_nom || "du garage"}.</span>
                    <button className="btn-primary btn-compact" onClick={tourSuivant}><Icone nom="importer" /> Le garage a renvoyé son devis → contrôler</button>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {resume.refuses > 0 && (
                    <div className="glass-soft p-3">
                      <div className="font-semibold"><Icone nom="mail" /> Courrier au garage</div>
                      <p className="mt-0.5 text-xs text-white/55">Demande de mise en conformité ({resume.refuses} point(s)).</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button className="btn-primary btn-compact" onClick={() => setTexteCourrier(texteCourrierDe(ctl))}>Texte à copier</button>
                        <button className="btn-ghost btn-compact" disabled={enCours !== null} onClick={() => documentPdf("courrier", "voir")}><Icone nom="oeil" /> PDF</button>
                        <button className="btn-ghost btn-compact" disabled={enCours !== null} onClick={() => documentPdf("courrier", "telecharger")}><Icone nom="telecharger" /></button>
                      </div>
                    </div>
                  )}
                  <div className="glass-soft p-3">
                    <div className="font-semibold"><Icone nom="document" /> Note de contrôle</div>
                    <p className="mt-0.5 text-xs text-white/55">Tous les écarts, décisions et motifs.</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button className="btn-ghost btn-compact" disabled={enCours !== null} onClick={() => documentPdf("note", "voir")}><Icone nom="oeil" /> PDF</button>
                      <button className="btn-ghost btn-compact" disabled={enCours !== null} onClick={() => documentPdf("note", "telecharger")}><Icone nom="telecharger" /></button>
                    </div>
                  </div>
                  <div className="glass-soft p-3">
                    <div className="font-semibold"><Icone nom="stylo" /> Chiffrage définitif</div>
                    <p className="mt-0.5 text-xs text-white/55">Les seules lignes à reporter dans ton logiciel, puis le chiffrage complet.</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button className="btn-ghost btn-compact" disabled={enCours !== null} onClick={() => documentPdf("chiffrage", "voir")}><Icone nom="oeil" /> PDF</button>
                      <button className="btn-ghost btn-compact" disabled={enCours !== null} onClick={() => documentPdf("chiffrage", "telecharger")}><Icone nom="telecharger" /></button>
                    </div>
                  </div>
                  <div className="glass-soft p-3">
                    <div className="font-semibold"><Icone nom="rapport" /> Rapport définitif</div>
                    <p className="mt-0.5 text-xs text-white/55">{ctl.rapport_id ? "Créé : relis-le et émets-le." : "PV complet au modèle du cabinet, avec le tableau des écarts."}</p>
                    <button className="btn-ghost btn-compact mt-2" disabled={enCours !== null} onClick={creerRapportDefinitif}>{enCours === "rapport" ? "Création…" : ctl.rapport_id ? <>Ouvrir le rapport <Icone nom="droite" /></> : "Créer le rapport définitif"}</button>
                  </div>
                </div>
                {aReporter.length > 0 && (
                  <details className="glass-soft p-3">
                    <summary className="cursor-pointer text-sm font-semibold">Lignes à reporter dans ton logiciel ({aReporter.length})</summary>
                    <table className="al-table mt-2">
                      <thead><tr><th>Action</th><th>Ligne</th><th>Pré-rapport</th><th>Nouvelle valeur</th><th className="num">Écart HT</th></tr></thead>
                      <tbody>{aReporter.map((l, i) => <tr key={i}><td className="font-semibold">{l.action}</td><td>{l.libelle}</td><td className="text-white/60">{l.avant || "—"}</td><td className="font-medium">{l.valeur || "à retirer"}</td><td className="num">{signe(l.delta)}</td></tr>)}</tbody>
                    </table>
                  </details>
                )}
                {dernierTour && <button className="btn-ghost btn-compact" onClick={rouvrir}>Rouvrir le contrôle</button>}
              </div>
            )}
          </div>
        </Bloc>
      )}

      {/* ---------------------------- Modales ---------------------------- */}
      {edition && ctl && (edition === "reference" ? ctl.reference : ctl.devis) && (
        <LectureControleModal
          titre={edition === "reference" ? "Lecture du pré-rapport" : "Lecture du devis du garage"}
          cote={(edition === "reference" ? ctl.reference : ctl.devis)!}
          lectureSeule={conclu || (edition === "reference" && ctl.reference?.source === "tour_precedent")}
          onClose={() => setEdition(null)}
          onOuvrirDocument={docDe(edition === "reference" ? ctl.reference : ctl.devis) ? () => ouvrirFichierExpert(docDe(edition === "reference" ? ctl.reference : ctl.devis)!.path) : undefined}
          onValider={async (c) => { const role = edition; setEdition(null); await poserCote(role, c, `Lecture ${role === "reference" ? "du pré-rapport" : "du devis"} corrigée à la main`); }}
        />
      )}

      {conclure && ctl && resume && (
        <ModalShell title={conclure === "choix" ? "Conclure le contrôle" : conclure === "devis_valide" ? "Valider le devis du garage" : LIBELLE_CONCLUSION[conclure]} onClose={() => enCours === null && setConclure(null)} maxWidth="max-w-xl">
          {conclure === "choix" ? (
            <div className="space-y-2">
              <p className="text-sm text-white/65">{resume.refuses} écart(s) refusé(s), {resume.acceptes} accepté(s). Retenu : <b>{formatEuros(resume.totalRetenu)} HT</b> (devis : {formatEuros(resume.totalDevis)}).</p>
              <button className="carte-liste block w-full text-left" onClick={() => setConclure("conformite_demandee")}>
                <div className="font-semibold"><Icone nom="mail" /> Demander la mise en conformité au garage <span className="badge badge-info ml-1">conseillé</span></div>
                <div className="text-xs text-white/55">Courrier prêt (texte à coller dans l&apos;extranet + PDF). Le contrôle attend le devis rectifié, que tu contrôleras en un clic (tour suivant).</div>
              </button>
              <button className="carte-liste block w-full text-left" onClick={() => setConclure("chiffrage_expert")}>
                <div className="font-semibold"><Icone nom="stylo" /> Maintenir mon chiffrage</div>
                <div className="text-xs text-white/55">Tu établis le définitif sur tes montants (écarts acceptés inclus), sans attendre de nouveau devis.</div>
              </button>
              <div className="flex justify-end"><button className="btn-ghost" onClick={() => setConclure(null)}>Annuler</button></div>
            </div>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-1 text-sm">
                <li>· {resume.acceptes} écart(s) accepté(s), {resume.refuses} refusé(s){resume.total === 0 ? " — devis conforme" : ""}</li>
                <li>· Montant HT retenu : <b>{formatEuros(resume.totalRetenu)}</b> (pré-rapport {formatEuros(resume.totalReference)}, devis {formatEuros(resume.totalDevis)})</li>
                {conclure === "conformite_demandee" && <li>· Le contrôle passera « En attente du garage »</li>}
                <li>· Tu pourras <b>rouvrir</b> le contrôle à tout moment</li>
              </ul>
              {conclure === "conformite_demandee" && resume.refuses > 0 && ctl.ecarts.some((e) => e.decision === "refuse" && !e.motif) && (
                <div className="alerte alerte-warn text-xs">Certains refus n&apos;ont pas de motif : le garage comprendra mieux avec un motif. Tu peux fermer et en ajouter.</div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={archiver} onChange={(e) => setArchiver(e.target.checked)} />
                Archiver {conclure === "conformite_demandee" ? "le courrier au garage" : "la note de contrôle"} (PDF) dans les documents du dossier
              </label>
              <div className="flex justify-end gap-2">
                <button className="btn-ghost" disabled={enCours !== null} onClick={() => setConclure(resume.refuses > 0 ? "choix" : null)}>Retour</button>
                <button className="btn-primary" disabled={enCours !== null} onClick={() => executerConclusion(conclure)}>{enCours === "conclusion" ? "Enregistrement…" : <><Icone nom="check" /> Confirmer</>}</button>
              </div>
            </div>
          )}
        </ModalShell>
      )}

      {texteCourrier && (
        <ModalShell title="Courrier au garage — texte à copier" onClose={() => setTexteCourrier(null)} maxWidth="max-w-2xl">
          <p className="text-xs text-white/55">À coller dans l&apos;extranet ou dans un email. Tu peux l&apos;ajuster avant de copier.</p>
          <textarea className="field-input font-mono text-xs" rows={18} value={texteCourrier} onChange={(e) => setTexteCourrier(e.target.value)} />
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-ghost" onClick={() => documentPdf("courrier", "telecharger")}><Icone nom="telecharger" /> PDF</button>
            {dossier.reparateur_nom && garage?.email && (
              <a className="btn-ghost" href={`mailto:${garage.email}?subject=${encodeURIComponent(`Dossier ${dossier.numero} — ${dossier.immatriculation || ""} — mise en conformité du devis`)}&body=${encodeURIComponent(texteCourrier)}`}><Icone nom="mail" /> Email</a>
            )}
            <button className="btn-primary" onClick={async () => { try { await navigator.clipboard.writeText(texteCourrier); setInfo("Texte du courrier copié."); setTexteCourrier(null); } catch { alert("Copie impossible : sélectionne le texte et copie-le à la main."); } }}><Icone nom="clone" /> Copier le texte</button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
