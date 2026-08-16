"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ActionFaite, Dossier, LigneArdoise } from "@/lib/types";
import { messageErreur } from "@/lib/format";
import { ProchaineAction, URGENCE_STYLE } from "@/lib/actions";
import { estActionFaite } from "@/lib/aFaire";
import {
  ajouterRappel,
  basculerRappel,
  chargerRappels,
  definirEcheance,
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
    } catch (err) {
      setErreur(messageErreur(err, "Rappel non ajouté (migrations v38 et v41 exécutées ?)."));
    }
    setBusy(false);
  }

  async function cocher(ligne: LigneArdoise, fait: boolean) {
    const avant = rappels;
    setRappels((prev) => prev.map((x) => (x.id === ligne.id ? { ...x, fait } : x)));
    try {
      await basculerRappel(ligne, fait);
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
    } catch (err) {
      setRappels(avant);
      setErreur(messageErreur(err, "Suppression impossible."));
    }
  }

  async function enregistrerEcheance(ligne: LigneArdoise, valeur: string) {
    setErreur(null);
    try {
      const maj = await definirEcheance(ligne, localVersIso(valeur));
      setRappels((prev) => prev.map((x) => (x.id === maj.id ? maj : x)));
      setEditionId(null);
    } catch (err) {
      setErreur(messageErreur(err, "Échéance non enregistrée (migration v41 exécutée ?)."));
    }
  }

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
        className={`flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm ${fait ? "opacity-50" : ""}`}
      >
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={fait}
            onChange={(e) => onBasculerAuto(d.id, action, e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
            title={fait ? "Remettre dans la liste à faire" : "Marquer comme fait"}
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              {!fait && (
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${st.badge}`}>
                  {st.label}
                </span>
              )}
              <span className={`font-medium text-white ${fait ? "line-through" : ""}`}>{action.titre}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-white/50">
              {d.client_nom || "—"} · {d.marque_modele || ""}
              {d.immatriculation ? ` (${d.immatriculation})` : ""} · dossier {d.numero_sinistre || "—"}
            </span>
          </span>
        </label>
        <span className="flex shrink-0 items-center gap-3">
          <Link href={`/sinistres/${d.id}`} className="text-white/50 hover:text-white hover:underline">
            Dossier
          </Link>
          {!fait && (
            <Link href={action.href} className="btn-ghost py-1.5 px-3 text-xs">
              {action.ctaLabel}
            </Link>
          )}
        </span>
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={fait}
              onChange={(e) => cocher(ligne, e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
            />
            <span className="min-w-0">
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
            </span>
          </label>

          <span className="flex shrink-0 items-center gap-2.5 text-xs">
            {d && (
              <Link href={`/sinistres/${d.id}`} className="max-w-[12rem] truncate text-white/50 hover:text-white hover:underline" title={libelleDossier(d)}>
                {d.immatriculation || d.numero_sinistre || "Dossier"}
              </Link>
            )}
            <button
              onClick={() => {
                setEditionId(editionId === ligne.id ? null : ligne.id);
                setEditionValeur(isoVersLocal(ligne.echeance));
              }}
              className="text-white/40 hover:text-accent-teal"
              title={ligne.echeance ? "Modifier l'échéance (agenda)" : "Programmer dans l'agenda"}
            >
              📅
            </button>
            <button
              onClick={() => supprimer(ligne)}
              className="text-white/30 hover:text-rose-300"
              title="Supprimer ce rappel"
            >
              ×
            </button>
          </span>
        </div>

        {editionId === ligne.id && (
          <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
            <input
              type="datetime-local"
              className="field-input field-compact w-auto"
              value={editionValeur}
              onChange={(e) => setEditionValeur(e.target.value)}
            />
            <button
              onClick={() => enregistrerEcheance(ligne, editionValeur)}
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
            <span className="text-[11px] text-white/40">
              Une date crée un rendez-vous dans l&apos;agenda.
            </span>
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
      className={`rounded-lg px-2.5 py-1 text-xs transition ${
        filtre === valeur ? "bg-white/15 font-semibold text-white" : "text-white/50 hover:text-white"
      }`}
    >
      {label}
      {typeof n === "number" && <span className="ml-1 text-white/40">{n}</span>}
    </button>
  );

  return (
    <section className="glass-card mb-6 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="titre-bloc">
          À faire
          <span className="ml-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            {aFaire.length}
          </span>
        </h2>
        <div className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5">
          {onglet("tout", "Tout", nbAuto + nbPerso)}
          {onglet("auto", "Automatique", nbAuto)}
          {dispo && onglet("perso", "Mes rappels", nbPerso)}
        </div>
      </div>

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
                Décoche une ligne pour la remettre à faire. Une coche automatique disparaît d&apos;elle-même dès que le
                dossier avance.
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
