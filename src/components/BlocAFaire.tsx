"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dossier, LigneArdoise } from "@/lib/types";
import { messageErreur } from "@/lib/format";
import {
  ajouterRappel,
  basculerRappel,
  chargerRappels,
  definirEcheance,
  definirPour,
  modifierRappel,
  estAujourdhui,
  estEnRetard,
  isoVersLocal,
  libelleEcheance,
  localVersIso,
  supprimerRappel,
} from "@/lib/ardoise";
import { RoleConversation, lireRole } from "@/lib/conversation";
import DossierPicker, { libelleDossier } from "./DossierPicker";
import ModalShell from "./ModalShell";
import ChampEcheance from "./ChampEcheance";

/**
 * BLOC « À FAIRE » (v41 → refondu v10.7).
 *
 * PLUS DE TÂCHES AUTOMATIQUES : en pratique, le logiciel ajoutait « faire
 * signer », « envoyer la facture »… alors que sur le terrain rien ne part
 * sans le feu vert du chef d'atelier, chaque garage a sa procédure (devis,
 * OR, ou facture directe) et les aléas s'accumulent → tâches parasites.
 *
 * Désormais UNE seule liste : les tâches écrites — à la main (ici ou dans
 * la Conversation) ou PROGRAMMÉES en un clic depuis les suggestions de la
 * fiche dossier. Chaque tâche peut viser quelqu'un (« pour la secrétaire »
 * / « pour le garage ») : les onglets filtrent par destinataire.
 *
 * Règles conservées : SEULE la case coche (clic texte = modifier),
 * retour en arrière Ctrl+Z, échéance → RDV d'agenda.
 */

type Item = { cle: string; ligne: LigneArdoise; dossier?: Dossier; fait: boolean };

type Filtre = "tout" | "secretaire" | "garage";

type Annulation = {
  libelle: string;
  restaurer: () => void | Promise<void>;
};

const PROFONDEUR_HISTORIQUE = 10;

function extrait(texte: string, max = 42): string {
  const t = texte.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Ordre d'affichage : le retard d'abord, le pense-bête sans date en dernier. */
function rang(it: Item): number {
  if (estEnRetard(it.ligne.echeance)) return 0;
  if (estAujourdhui(it.ligne.echeance)) return 1;
  return it.ligne.echeance ? 2 : 3;
}

const LIBELLE_POUR: Record<string, string> = { secretaire: "Pour la secrétaire", garage: "Pour le garage" };

export default function BlocAFaire({ dossiers, loading }: { dossiers: Dossier[]; loading: boolean }) {
  const [rappels, setRappels] = useState<LigneArdoise[]>([]);
  const [dispo, setDispo] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>("tout");
  const [voirFaites, setVoirFaites] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [role, setRole] = useState<RoleConversation>("garage");

  // Saisie d'une nouvelle tâche — dans une MODALE (v11.1) : sur mobile,
  // la barre de saisie permanente rendait le bloc brouillon.
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [texte, setTexte] = useState("");
  const [dossierLie, setDossierLie] = useState<Dossier | null>(null);
  const [echeance, setEcheance] = useState("");
  const [pour, setPour] = useState<"" | "garage" | "secretaire">("");
  const [pickerOuvert, setPickerOuvert] = useState(false);
  const [busy, setBusy] = useState(false);

  // Édition d'une tâche existante
  const [editionId, setEditionId] = useState<string | null>(null);
  const [editionValeur, setEditionValeur] = useState("");
  const [editionTexte, setEditionTexte] = useState("");
  const [editionPour, setEditionPour] = useState<"" | "garage" | "secretaire">("");

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
    // Le rôle mémorisé sur l'appareil (bascule de la page Conversation)
    // pré-filtre la liste : le poste de la secrétaire ouvre sur SES tâches.
    const r = lireRole();
    setRole(r);
    setFiltre(r === "secretaire" ? "secretaire" : "tout");
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
    const ordre = Math.min(0, ...rappels.map((l) => l.ordre)) - 1;
    try {
      const ligne = await ajouterRappel({
        texte: t,
        dossierId: dossierLie?.id || null,
        echeance: localVersIso(echeance),
        ordre,
        auteur: role,
        pour: pour || null,
      });
      setRappels((prev) => [ligne, ...prev]);
      setTexte("");
      setDossierLie(null);
      setEcheance("");
      setPour("");
      setAjoutOuvert(false);
      empiler({
        libelle: `l'ajout de « ${extrait(ligne.texte)} »`,
        restaurer: async () => {
          setRappels((prev) => prev.filter((x) => x.id !== ligne.id));
          await supprimerRappel(ligne);
        },
      });
    } catch (err) {
      setErreur(messageErreur(err, "Tâche non ajoutée (migrations v38 et v41 exécutées ?)."));
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
      empiler({
        libelle: `la suppression de « ${extrait(ligne.texte)} »`,
        restaurer: async () => {
          const recree = await ajouterRappel({
            texte: ligne.texte,
            dossierId: ligne.dossier_id || null,
            echeance: ligne.echeance || null,
            ordre: ligne.ordre,
            auteur: ligne.auteur || null,
            pour: ligne.pour || null,
            origine: ligne.origine || null,
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
      setErreur(messageErreur(err, "Tâche non modifiée."));
    }
  }

  async function enregistrerPour(ligne: LigneArdoise, valeur: "" | "garage" | "secretaire") {
    const nouveau = valeur || null;
    if ((ligne.pour || null) === nouveau) return;
    try {
      const maj = await definirPour(ligne, nouveau);
      setRappels((prev) => prev.map((x) => (x.id === maj.id ? maj : x)));
    } catch (err) {
      setErreur(messageErreur(err, "Destinataire non enregistré (migration v59 exécutée ?)."));
    }
  }

  function ouvrirEdition(ligne: LigneArdoise) {
    const memeLigne = editionId === ligne.id;
    setEditionId(memeLigne ? null : ligne.id);
    setEditionValeur(isoVersLocal(ligne.echeance));
    setEditionTexte(ligne.texte);
    setEditionPour((ligne.pour as "" | "garage" | "secretaire") || "");
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

  useEffect(() => {
    if (!annonce) return;
    const t = setTimeout(() => setAnnonce(null), 4000);
    return () => clearTimeout(t);
  }, [annonce]);

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

  const items: Item[] = useMemo(
    () =>
      rappels
        .map((ligne) => ({
          cle: `perso-${ligne.id}`,
          ligne,
          dossier: ligne.dossier_id ? dossierParId.get(ligne.dossier_id) : undefined,
          fait: ligne.fait,
        }))
        .sort((a, b) => rang(a) - rang(b)),
    [rappels, dossierParId]
  );

  // Une tâche sans destinataire est pour tout le monde : visible partout.
  const visibles = items.filter((i) => filtre === "tout" || !i.ligne.pour || i.ligne.pour === filtre);
  const aFaire = visibles.filter((i) => !i.fait);
  const dejaFaites = visibles.filter((i) => i.fait);

  const compte = (f: Filtre) =>
    items.filter((i) => !i.fait && (f === "tout" || !i.ligne.pour || i.ligne.pour === f)).length;

  /* ------------------------------ Rendu ------------------------------- */

  const renderItem = (it: Item) => {
    const { ligne, dossier: d, fait } = it;
    const retard = !fait && estEnRetard(ligne.echeance);
    const aujourdhui = !fait && estAujourdhui(ligne.echeance);
    const badgeEcheance = retard
      ? "bg-rose-100 text-rose-700"
      : aujourdhui
        ? "bg-amber-100 text-amber-700"
        : "bg-white/10 text-white/70";
    return (
      <li key={it.cle} className={`py-1.5 text-sm ${fait ? "opacity-50" : ""}`}>
        {/* UNE seule ligne : case · texte + badges en ligne · chip dossier · ×
            (v10.9 — l'ancien rendu sur 3 lignes laissait trop de vide). */}
        <div className="flex min-w-0 items-start gap-2.5">
          {/* SEULE la case à cocher coche la tâche (v8.6). */}
          <input
            type="checkbox"
            checked={fait}
            onChange={(e) => cocher(ligne, e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
          />
          {/* Cliquer sur le texte ouvre la modification (v8.6 : clic ≠ coche). */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => ouvrirEdition(ligne)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                ouvrirEdition(ligne);
              }
            }}
            className="min-w-0 flex-1 cursor-pointer text-left"
            title="Modifier cette tâche (texte, échéance, destinataire)"
          >
            {/* v11.5 — le texte et les badges étaient dans UN MÊME flux inline :
                sur une tâche longue, les badges atterrissaient au hasard en fin
                de dernière ligne (« …demander le rapport définitif 📁EZ-427-MK »),
                d'où un effet brouillon. Désormais : le texte occupe sa ligne, les
                métadonnées forment une rangée alignée dessous. Toujours dense
                (pas de marge ajoutée), mais ordonné. */}
            <div className={`break-words text-white/85 ${fait ? "line-through" : ""}`}>{ligne.texte}</div>
            {(ligne.echeance || ligne.pour || d || ligne.origine?.startsWith("suggestion:")) && (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {ligne.echeance && (
                  <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeEcheance}`}>
                    {retard ? "⏰ " : ""}
                    {libelleEcheance(ligne.echeance)}
                  </span>
                )}
                {ligne.pour && (
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      ligne.pour === "secretaire" ? "bg-teal-100 text-teal-700" : "bg-violet-100 text-violet-700"
                    }`}
                  >
                    {ligne.pour === "secretaire" ? "Secrétaire" : "Garage"}
                  </span>
                )}
                {ligne.origine?.startsWith("suggestion:") && (
                  <span className="shrink-0 text-[10px] text-white/35" title="Programmée depuis la fiche du dossier">📌</span>
                )}
                {d && (
                  <Link
                    href={`/sinistres/${d.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold max-w-[11rem] truncate bg-white/10 font-medium text-white/60 hover:bg-white/20 hover:text-white"
                    title={`Ouvrir le dossier — ${libelleDossier(d)}`}
                  >
                    📁 {d.immatriculation || d.numero_sinistre || d.client_nom || "dossier"}
                  </Link>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => supprimer(ligne)}
            className="shrink-0 px-1 text-white/25 hover:text-rose-300"
            title="Supprimer cette tâche"
          >
            ×
          </button>
        </div>

        {editionId === ligne.id && (
          <div className="ml-6 mt-1.5 space-y-2 rounded-lg border-2 border-white/10 bg-white/5 p-2">
            <input
              className="field-input field-compact w-full"
              value={editionTexte}
              onChange={(e) => setEditionTexte(e.target.value)}
              placeholder="Texte de la tâche"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  enregistrerTexte(ligne, editionTexte);
                  enregistrerPour(ligne, editionPour);
                  enregistrerEcheance(ligne, editionValeur);
                }
              }}
            />
            <div className="flex flex-wrap items-end gap-2">
              <ChampEcheance valeur={editionValeur} onChange={setEditionValeur} />
              <select
                className="field-input field-compact w-auto"
                value={editionPour}
                onChange={(e) => setEditionPour(e.target.value as "" | "garage" | "secretaire")}
                title="Qui doit s'en occuper ?"
              >
                <option value="">Pour tout le monde</option>
                <option value="secretaire">Pour la secrétaire</option>
                <option value="garage">Pour le garage</option>
              </select>
              <button
                onClick={async () => {
                  await enregistrerTexte(ligne, editionTexte);
                  await enregistrerPour(ligne, editionPour);
                  await enregistrerEcheance(ligne, editionValeur);
                }}
                className="btn-primary btn-compact"
              >
                Enregistrer
              </button>
            </div>
            <p className="text-[11px] text-white/40">Une date crée un rendez-vous dans l&apos;agenda.</p>
          </div>
        )}
      </li>
    );
  };

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
          {/* ↩ visible SEULEMENT quand il y a quelque chose à annuler (v11.1
              — moins de boutons en vrac, surtout sur mobile). Ctrl+Z marche
              toujours. Le lien Conversation vit dans la barre latérale. */}
          {historique.length > 0 && (
            <button
              onClick={annulerDernier}
              className="btn-ghost btn-compact inline-flex items-center gap-1.5"
              title={`Annuler ${historique[0].libelle} (Ctrl+Z)`}
            >
              ↩{historique.length > 1 && <span className="opacity-60">{historique.length}</span>}
            </button>
          )}
          <div className="segment">
            {onglet("tout", "Tout", compte("tout"))}
            {onglet("secretaire", "Secrétaire", compte("secretaire"))}
            {onglet("garage", "Garage", compte("garage"))}
          </div>
          {dispo && (
            <button
              onClick={() => setAjoutOuvert(true)}
              className="btn-primary btn-compact px-3 text-base leading-none"
              title="Ajouter une tâche"
            >
              +
            </button>
          )}
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

      {/* Liste */}
      {loading ? (
        <p className="py-3 text-sm text-white/40">Chargement…</p>
      ) : aFaire.length === 0 ? (
        <p className="py-3 text-sm text-emerald-300/80">
          {dejaFaites.length > 0
            ? "Tout est coché — plus rien à faire dans cette vue."
            : "Rien à faire dans cette vue. Ajoute une tâche avec le bouton +, ou programme les suggestions depuis une fiche dossier."}
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
                arrière.
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

      {/* MODALE « Nouvelle tâche » (v11.1) : ouverte par le bouton (+). */}
      {ajoutOuvert && (
        <ModalShell title="Nouvelle tâche" onClose={() => setAjoutOuvert(false)} maxWidth="max-w-md">
          <input
            className="field-input w-full"
            placeholder="Quoi faire ? (rappeler l'expert, commander la peinture…)"
            value={texte}
            autoFocus
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                ajouter();
              }
            }}
          />

          {/* Pour qui — le même switch que la Conversation. */}
          <div className="mt-3">
            <span className="field-label text-[11px]">Pour qui ?</span>
            <div className="segment mt-1">
              {([["", "Tous"], ["secretaire", "🗂️ Secrétaire"], ["garage", "🔧 Garage"]] as const).map(([v, l]) => (
                <button key={v} type="button" className={`segment-btn ${pour === v ? "actif" : ""}`} onClick={() => setPour(v)}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Dossier lié */}
          <div className="mt-3">
            <span className="field-label text-[11px]">Dossier (facultatif)</span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setPickerOuvert(true)} className="btn-ghost btn-compact">
                📁 {dossierLie ? libelleDossier(dossierLie) : "Lier un dossier"}
              </button>
              {dossierLie && (
                <button type="button" onClick={() => setDossierLie(null)} className="text-xs text-white/40 hover:text-rose-300">
                  retirer
                </button>
              )}
            </div>
          </div>

          {/* Alerte datée */}
          <div className="mt-3">
            <span className="field-label text-[11px]">Alerte (facultative — crée un rendez-vous dans l&apos;agenda)</span>
            <div className="mt-1">
              <ChampEcheance valeur={echeance} onChange={setEcheance} />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setAjoutOuvert(false)}>Annuler</button>
            <button className="btn-primary" disabled={busy || !texte.trim()} onClick={ajouter}>
              {busy ? "Ajout…" : "Ajouter la tâche"}
            </button>
          </div>
        </ModalShell>
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
