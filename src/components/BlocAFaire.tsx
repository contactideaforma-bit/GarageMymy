"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionFaite, Dossier, LigneArdoise } from "@/lib/types";
import { messageErreur } from "@/lib/format";
import { ProchaineAction, URGENCE_STYLE } from "@/lib/actions";
import { estActionFaite } from "@/lib/aFaire";
import {
  ajouterRappel,
  basculerRappel,
  chargerRappels,
  definirEcheance,
  modifierRappel,
  estAujourdhui,
  estEnRetard,
  isoVersLocal,
  libelleEcheance,
  localVersIso,
  supprimerRappel,
} from "@/lib/ardoise";
import DossierPicker, { libelleDossier } from "./DossierPicker";

/**
 * BLOC « À FAIRE » (v41) — remplace les DEUX blocs précédents du tableau de
 * bord, « Ardoise » et « À faire aujourd'hui », qui faisaient le même travail
 * à deux endroits différents.
 *
 * Une seule liste, deux origines :
 *   · AUTOMATIQUE — calculé par `lib/actions.ts` à partir de l'état des
 *     dossiers (« Envoyer la facture », « Relancer l'expert »…). Non
 *     supprimable : la ligne disparaît quand le dossier avance.
 *   · MES RAPPELS — ce que le garage écrit lui-même (l'ancienne ardoise).
 *     Rattachable à un dossier, et datable → crée un RDV dans l'agenda.
 *
 * Le filtre en haut à droite permet de n'afficher qu'une origine.
 */

type Item =
  | { genre: "auto"; cle: string; dossier: Dossier; action: ProchaineAction; fait: boolean }
  | { genre: "perso"; cle: string; ligne: LigneArdoise; dossier?: Dossier; fait: boolean };

type Filtre = "tout" | "auto" | "perso";

/**
 * RETOUR EN ARRIÈRE (v8.2).
 *
 * Cocher une ligne la fait disparaître de la liste : d'un clic de trop, on
 * perd de vue une tâche. Chaque geste (coche, décoche, suppression, ajout,
 * échéance) empile donc une ANNULATION réversible — les 10 derniers gestes
 * sont rattrapables, au bouton ou au clavier (Ctrl+Z / ⌘Z).
 */
type Annulation = {
  /** Ce qui sera défait, montré dans l'info-bulle du bouton. */
  libelle: string;
  restaurer: () => void | Promise<void>;
};

const PROFONDEUR_HISTORIQUE = 10;

/** Texte court d'une ligne, pour l'info-bulle (« … »). */
function extrait(texte: string, max = 42): string {
  const t = texte.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Ordre d'affichage : le retard d'abord, le pense-bête sans date en dernier. */
function rang(it: Item): number {
  if (it.genre === "perso") {
    if (estEnRetard(it.ligne.echeance)) return 0;
    if (estAujourdhui(it.ligne.echeance)) return 1;
    return it.ligne.echeance ? 2 : 4;
  }
  return it.action.urgence === "haute" ? 1 : 3;
}

export default function BlocAFaire({
  auto,
  dossiers,
  faites,
  onBasculerAuto,
  loading,
}: {
  auto: { dossier: Dossier; action: ProchaineAction }[];
  dossiers: Dossier[];
  faites: ActionFaite[];
  onBasculerAuto: (dossierId: string, action: ProchaineAction, fait: boolean) => void;
  loading: boolean;
}) {
  const router = useRouter();
  const [rappels, setRappels] = useState<LigneArdoise[]>([]);
  const [dispo, setDispo] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>("tout");
  const [voirFaites, setVoirFaites] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Saisie d'un nouveau rappel
  const [texte, setTexte] = useState("");
  const [dossierLie, setDossierLie] = useState<Dossier | null>(null);
  const [echeance, setEcheance] = useState("");
  const [pickerOuvert, setPickerOuvert] = useState(false);
  const [busy, setBusy] = useState(false);

  // Édition de l'échéance d'un rappel existant : id de la ligne + valeur saisie
  const [editionId, setEditionId] = useState<string | null>(null);
  const [editionValeur, setEditionValeur] = useState("");
  const [editionTexte, setEditionTexte] = useState("");

  // Pile des gestes annulables (le dernier en tête) + message éphémère.
  const [historique, setHistorique] = useState<Annulation[]>([]);
  const [annonce, setAnnonce] = useState<string | null>(null);

  const empiler = useCallback((a: Annulation) => {
    setHistorique((prev) => [a, ...prev].slice(0, PROFONDEUR_HISTORIQUE));
  }, []);

  const charger = useCallback(async () => {
    const { lignes, dispo: ok } = await chargerRappels();
    setDispo(ok);
    setRappels(lignes);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const dossierParId = useMemo(() => {
    const m = new Map<string, Dossier>();
    for (const d of dossiers) m.set(d.id, d);
    return m;
  }, [dossiers]);

  /* ----------------------------- Actions ------------------------------ */

  async function ajouter() {
    const t = texte.trim();
    if (!t || busy) return;
    setBusy(true);
    setErreur(null);
    // Nouvelle ligne en tête de liste.
    const ordre = Math.min(0, ...rappels.map((l) => l.ordre)) - 1;
    try {
      const ligne = await ajouterRappel({
        texte: t,
        dossierId: dossierLie?.id || null,
        echeance: localVersIso(echeance),
        ordre,
      });
      setRappels((prev) => [ligne, ...prev]);
      setTexte("");
      setDossierLie(null);
      setEcheance("");
      empiler({
        libelle: `l'ajout de « ${extrait(ligne.texte)} »`,
        restaurer: async () => {
          setRappels((prev) => prev.filter((x) => x.id !== ligne.id));
          await supprimerRappel(ligne);
        },
      });
    } catch (err) {
      setErreur(messageErreur(err, "Rappel non ajouté (migrations v38 et v41 exécutées ?)."));
    }
    setBusy(false);
  }

  async function cocher(ligne: LigneArdoise, fait: boolean, enregistrer = true) {
    const avant = rappels;
    setRappels((prev) => prev.map((x) => (x.id === ligne.id ? { ...x, fait } : x)));
    try {
      await basculerRappel(ligne, fait);
      if (enregistrer) {
        empiler({
          libelle: `${fait ? "la coche" : "la décoche"} de « ${extrait(ligne.texte)} »`,
          restaurer: () => cocher(ligne, !fait, false),
        });
      }
    } catch (err) {
      setRappels(avant);
      setErreur(messageErreur(err, "Modification impossible."));
    }
  }

  async function supprimer(ligne: LigneArdoise) {
    const avant = rappels;
    setRappels((prev) => prev.filter((x) => x.id !== ligne.id));
    try {
      await supprimerRappel(ligne);
      // Le rappel est recréé à l'identique (texte, dossier, échéance) :
      // une suppression par erreur n'est plus définitive.
      empiler({
        libelle: `la suppression de « ${extrait(ligne.texte)} »`,
        restaurer: async () => {
          const recree = await ajouterRappel({
            texte: ligne.texte,
            dossierId: ligne.dossier_id || null,
            echeance: ligne.echeance || null,
            ordre: ligne.ordre,
          });
          setRappels((prev) => [recree, ...prev]);
        },
      });
    } catch (err) {
      setRappels(avant);
      setErreur(messageErreur(err, "Suppression impossible."));
    }
  }

  async function enregistrerEcheance(ligne: LigneArdoise, valeur: string, enregistrer = true) {
    setErreur(null);
    const ancienne = ligne.echeance || null;
    try {
      const maj = await definirEcheance(ligne, localVersIso(valeur));
      setRappels((prev) => prev.map((x) => (x.id === maj.id ? maj : x)));
      setEditionId(null);
      if (enregistrer) {
        empiler({
          libelle: `l'échéance de « ${extrait(ligne.texte)} »`,
          restaurer: () => enregistrerEcheance(maj, isoVersLocal(ancienne), false),
        });
      }
    } catch (err) {
      setErreur(messageErreur(err, "Échéance non enregistrée (migration v41 exécutée ?)."));
    }
  }

  /**
   * Enregistre le nouveau libellé d'un rappel (v8.6). Cliquer sur le texte
   * d'une ligne ne doit PAS la cocher : ça ouvre sa modification.
   */
  async function enregistrerTexte(ligne: LigneArdoise, texte: string) {
    const t = texte.trim();
    if (!t || t === ligne.texte) return;
    const avant = ligne.texte;
    setErreur(null);
    try {
      const maj = await modifierRappel(ligne, t);
      setRappels((prev) => prev.map((x) => (x.id === maj.id ? maj : x)));
      empiler({
        libelle: `la modification de « ${extrait(t)} »`,
        restaurer: async () => {
          const retour = await modifierRappel(maj, avant);
          setRappels((prev) => prev.map((x) => (x.id === retour.id ? retour : x)));
        },
      });
    } catch (err) {
      setErreur(messageErreur(err, "Rappel non modifié."));
    }
  }

  /** Ouvre (ou referme) le panneau d'édition d'une ligne. */
  function ouvrirEdition(ligne: LigneArdoise) {
    const memeLigne = editionId === ligne.id;
    setEditionId(memeLigne ? null : ligne.id);
    setEditionValeur(isoVersLocal(ligne.echeance));
    setEditionTexte(ligne.texte);
  }

  /** Coche/décoche une action AUTOMATIQUE, en gardant le geste annulable. */
  function basculerAuto(d: Dossier, action: ProchaineAction, fait: boolean, enregistrer = true) {
    onBasculerAuto(d.id, action, fait);
    if (enregistrer) {
      empiler({
        libelle: `${fait ? "la coche" : "la décoche"} de « ${extrait(action.titre)} »`,
        restaurer: () => basculerAuto(d, action, !fait, false),
      });
    }
  }

  /* ------------------------- Retour en arrière ------------------------ */

  const annulerDernier = useCallback(async () => {
    const [dernier, ...reste] = historique;
    if (!dernier) return;
    setHistorique(reste);
    setErreur(null);
    try {
      await dernier.restaurer();
      setAnnonce(`Annulé : ${dernier.libelle}.`);
    } catch (err) {
      setErreur(messageErreur(err, "Impossible d'annuler cette action."));
    }
  }, [historique]);

  // Le message d'annulation s'efface tout seul.
  useEffect(() => {
    if (!annonce) return;
    const t = setTimeout(() => setAnnonce(null), 4000);
    return () => clearTimeout(t);
  }, [annonce]);

  // Ctrl+Z / ⌘Z — ignoré si l'utilisateur est en train de saisir du texte.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const cible = e.target as HTMLElement | null;
      const balise = cible?.tagName?.toLowerCase();
      if (balise === "input" || balise === "textarea" || cible?.isContentEditable) return;
      if (historique.length === 0) return;
      e.preventDefault();
      annulerDernier();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [historique, annulerDernier]);

  /* ------------------------------ Données ----------------------------- */

  const items: Item[] = useMemo(() => {
    const autos: Item[] = auto.map(({ dossier, action }) => ({
      genre: "auto",
      cle: `auto-${dossier.id}-${action.code}`,
      dossier,
      action,
      fait: estActionFaite(faites, dossier.id, action.code),
    }));
    const persos: Item[] = rappels.map((ligne) => ({
      genre: "perso",
      cle: `perso-${ligne.id}`,
      ligne,
      dossier: ligne.dossier_id ? dossierParId.get(ligne.dossier_id) : undefined,
      fait: ligne.fait,
    }));
    return [...autos, ...persos].sort((a, b) => rang(a) - rang(b));
  }, [auto, rappels, faites, dossierParId]);

  const visibles = items.filter((i) => filtre === "tout" || i.genre === filtre);
  const aFaire = visibles.filter((i) => !i.fait);
  const dejaFaites = visibles.filter((i) => i.fait);

  const nbAuto = items.filter((i) => i.genre === "auto" && !i.fait).length;
  const nbPerso = items.filter((i) => i.genre === "perso" && !i.fait).length;

  /* ------------------------------ Rendu ------------------------------- */

  // Fonctions de rendu (pas des sous-composants : un composant redéclaré à
  // chaque rendu serait remonté à chaque frappe et ferait perdre le focus).

  const renderAuto = (d: Dossier, action: ProchaineAction, fait: boolean) => {
    const st = URGENCE_STYLE[action.urgence];
    return (
      <li
        key={`auto-${d.id}-${action.code}`}
        className={`py-2.5 text-sm ${fait ? "opacity-50" : ""}`}
      >
        <div className="flex min-w-0 items-start gap-3">
          {/* SEULE la case à cocher coche la tâche (v8.6). */}
          <input
            type="checkbox"
            checked={fait}
            onChange={(e) => basculerAuto(d, action, e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
            title={fait ? "Remettre dans la liste à faire" : "Marquer comme fait"}
          />
          {/* Le texte prend toute la largeur et ouvre le dossier. */}
          <button
            type="button"
            onClick={() => router.push(`/sinistres/${d.id}`)}
            className="min-w-0 flex-1 text-left"
            title="Ouvrir le dossier"
          >
            <span className="flex flex-wrap items-center gap-2">
              {!fait && (
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${st.badge}`}>
                  {st.label}
                </span>
              )}
              <span className={`font-medium text-white ${fait ? "line-through" : ""}`}>{action.titre}</span>
            </span>
            <span className="mt-0.5 block text-xs text-white/50">
              {d.client_nom || "—"} · {d.marque_modele || ""}
              {d.immatriculation ? ` (${d.immatriculation})` : ""} · dossier {d.numero_sinistre || "—"}
            </span>
          </button>
        </div>
        {/* Actions SOUS le texte : sur téléphone, les mettre à droite
            écrasait le libellé sur une colonne de trois mots. */}
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
          <Link
            href={`/sinistres/${d.id}`}
            className="text-xs text-white/50 hover:text-white hover:underline"
          >
            Ouvrir le dossier
          </Link>
          {!fait && (
            <Link href={action.href} className="btn-ghost btn-compact">
              {action.ctaLabel}
            </Link>
          )}
        </div>
      </li>
    );
  };

  const renderPerso = (ligne: LigneArdoise, d: Dossier | undefined, fait: boolean) => {
    const retard = !fait && estEnRetard(ligne.echeance);
    const aujourdhui = !fait && estAujourdhui(ligne.echeance);
    const badgeEcheance = ligne.echeance
      ? retard
        ? "bg-rose-100 text-rose-700"
        : aujourdhui
          ? "bg-amber-100 text-amber-700"
          : "bg-white/10 text-white/70"
      : "";
    return (
      <li key={`perso-${ligne.id}`} className={`py-2.5 text-sm ${fait ? "opacity-50" : ""}`}>
        <div className="flex min-w-0 items-start gap-3">
          {/* SEULE la case à cocher coche le rappel (v8.6). */}
          <input
            type="checkbox"
            checked={fait}
            onChange={(e) => cocher(ligne, e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
          />
          {/* Cliquer sur le texte ouvre la modification (ou le dossier lié). */}
          <button
            type="button"
            onClick={() => ouvrirEdition(ligne)}
            className="min-w-0 flex-1 text-left"
            title="Modifier ce rappel"
          >
            <span className={`block break-words text-white/85 ${fait ? "line-through" : ""}`}>
              {ligne.texte}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                Mon rappel
              </span>
              {ligne.echeance && (
                <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeEcheance}`}>
                  {retard ? "En retard · " : ""}
                  {libelleEcheance(ligne.echeance)}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => supprimer(ligne)}
            className="shrink-0 text-white/30 hover:text-rose-300"
            title="Supprimer ce rappel"
          >
            ×
          </button>
        </div>

        {/* Actions sous le texte, pleine largeur sur téléphone. */}
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-7 text-xs">
          {d && (
            <Link
              href={`/sinistres/${d.id}`}
              className="max-w-[14rem] truncate text-white/50 hover:text-white hover:underline"
              title={libelleDossier(d)}
            >
              Ouvrir le dossier {d.immatriculation || d.numero_sinistre || ""}
            </Link>
          )}
          <button
            onClick={() => ouvrirEdition(ligne)}
            className="text-white/40 hover:text-accent-teal"
            title={ligne.echeance ? "Modifier le rappel et son échéance" : "Modifier le rappel"}
          >
            ✎ Modifier
          </button>
        </div>

        {editionId === ligne.id && (
          <div className="mt-2 space-y-2 rounded-lg border-2 border-white/10 bg-white/5 p-2 pl-3">
            <input
              className="field-input field-compact w-full"
              value={editionTexte}
              onChange={(e) => setEditionTexte(e.target.value)}
              placeholder="Texte du rappel"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  enregistrerTexte(ligne, editionTexte);
                  enregistrerEcheance(ligne, editionValeur);
                }
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                className="field-input field-compact w-auto"
                value={editionValeur}
                onChange={(e) => setEditionValeur(e.target.value)}
              />
              <button
                onClick={async () => {
                  await enregistrerTexte(ligne, editionTexte);
                  await enregistrerEcheance(ligne, editionValeur);
                }}
                className="btn-ghost btn-compact"
              >
                Enregistrer
              </button>
              {ligne.echeance && (
                <button
                  onClick={() => enregistrerEcheance(ligne, "")}
                  className="text-xs text-white/40 hover:text-rose-300 hover:underline"
                >
                  Retirer de l&apos;agenda
                </button>
              )}
            </div>
            <p className="text-[11px] text-white/40">
              Une date crée un rendez-vous dans l&apos;agenda.
            </p>
          </div>
        )}
      </li>
    );
  };

  const renderItem = (it: Item) =>
    it.genre === "auto"
      ? renderAuto(it.dossier, it.action, it.fait)
      : renderPerso(it.ligne, it.dossier, it.fait);

  const onglet = (valeur: Filtre, label: string, n?: number) => (
    <button
      key={valeur}
      onClick={() => setFiltre(valeur)}
      className={`segment-btn ${filtre === valeur ? "actif" : ""}`}
    >
      {label}
      {typeof n === "number" && <span className="ml-1 opacity-70">{n}</span>}
    </button>
  );

  return (
    <section className="glass-card mb-6 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="titre-section">
          À faire
          <span className="badge badge-warn ml-2">{aFaire.length}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* RETOUR EN ARRIÈRE : rattrape la dernière coche, suppression
              ou modification. Raccourci clavier Ctrl+Z / ⌘Z. */}
          <button
            onClick={annulerDernier}
            disabled={historique.length === 0}
            className="btn-ghost btn-compact inline-flex items-center gap-1.5 disabled:opacity-40"
            title={
              historique.length === 0
                ? "Rien à annuler pour l'instant"
                : `Annuler ${historique[0].libelle} (Ctrl+Z)`
            }
          >
            ↩ Annuler
            {historique.length > 1 && <span className="opacity-60">{historique.length}</span>}
          </button>
          <div className="segment">
            {onglet("tout", "Tout", nbAuto + nbPerso)}
            {onglet("auto", "Automatique", nbAuto)}
            {dispo && onglet("perso", "Mes rappels", nbPerso)}
          </div>
        </div>
      </div>

      {annonce && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border-2 border-accent-teal/40 bg-white/5 px-3 py-1.5 text-xs text-white/75 anim-apparition">
          <span>{annonce}</span>
          <button onClick={() => setAnnonce(null)} className="text-white/40 hover:text-white">
            ×
          </button>
        </div>
      )}

      {/* Saisie d'un rappel libre */}
      {dispo && (
        <div className="mb-3">
          <div className="flex gap-2">
            <input
              className="field-input flex-1"
              placeholder="Noter un rappel… (rappeler l'expert, commander la peinture…)"
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  ajouter();
                }
              }}
            />
            <button onClick={ajouter} disabled={busy || !texte.trim()} className="btn-ghost shrink-0">
              Ajouter
            </button>
          </div>

          {/* Options du rappel : dossier lié + date (agenda) */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setPickerOuvert(true)}
              className="btn-ghost btn-compact inline-flex items-center gap-1.5"
              title="Rechercher un dossier en cours"
            >
              🔍 {dossierLie ? dossierLie.immatriculation || dossierLie.numero_sinistre || "Dossier" : "Lier un dossier"}
            </button>
            {dossierLie && (
              <button
                onClick={() => setDossierLie(null)}
                className="text-xs text-white/40 hover:text-rose-300 hover:underline"
              >
                retirer
              </button>
            )}
            <label className="inline-flex items-center gap-1.5 text-xs text-white/45">
              📅
              <input
                type="datetime-local"
                className="field-input field-compact w-auto"
                value={echeance}
                onChange={(e) => setEcheance(e.target.value)}
                title="Programmer ce rappel dans l'agenda"
              />
            </label>
            {echeance && <span className="text-[11px] text-accent-teal">→ ajouté à l&apos;agenda</span>}
          </div>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <p className="py-3 text-sm text-white/40">Chargement…</p>
      ) : aFaire.length === 0 ? (
        <p className="py-3 text-sm text-emerald-300/80">
          {dejaFaites.length > 0
            ? "Tout est coché — plus rien à faire pour l'instant."
            : "Rien à faire dans cette vue. Écris un rappel ci-dessus si besoin."}
        </p>
      ) : (
        <>
          <ul className="max-h-[340px] divide-y divide-white/10 overflow-y-auto pr-1">
            {aFaire.map(renderItem)}
          </ul>
          {aFaire.length > 5 && (
            <p className="mt-2 text-xs text-white/40">Fais défiler pour voir les {aFaire.length} lignes.</p>
          )}
        </>
      )}

      {dejaFaites.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-2">
          <button
            onClick={() => setVoirFaites((v) => !v)}
            className="text-xs text-emerald-300/80 hover:text-emerald-200 hover:underline"
          >
            {voirFaites ? "Masquer" : "Voir"} les {dejaFaites.length} ligne{dejaFaites.length > 1 ? "s" : ""} faite
            {dejaFaites.length > 1 ? "s" : ""}
          </button>
          {voirFaites && (
            <>
              <ul className="mt-2 max-h-[220px] divide-y divide-white/5 overflow-y-auto pr-1">
                {dejaFaites.map(renderItem)}
              </ul>
              <p className="mt-2 text-xs text-white/30">
                Décoche une ligne pour la remettre à faire, ou utilise « ↩ Annuler » (Ctrl+Z) pour revenir en
                arrière. Une coche automatique disparaît d&apos;elle-même dès que le dossier avance.
              </p>
            </>
          )}
        </div>
      )}

      {erreur && (
        <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
          {erreur}
        </div>
      )}

      {pickerOuvert && (
        <DossierPicker
          dossiers={dossiers}
          onChoisir={(d) => {
            setDossierLie(d);
            setPickerOuvert(false);
          }}
          onFermer={() => setPickerOuvert(false)}
        />
      )}
    </section>
  );
}
