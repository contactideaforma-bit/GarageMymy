"use client";

/* ====================================================================
 *  IMPORT — un ou PLUSIEURS documents → un dossier sinistre (v13.0)
 *
 *  Cas courant : on dépose le rapport, l'IA pré-remplit le dossier (rien ne
 *  change depuis la v6.9).
 *
 *  REPRISE D'UN DOSSIER EN COURS : le garage dépose d'un coup le rapport,
 *  la facture déjà faite ailleurs, la carte grise, le constat… Chaque
 *  fichier est reconnu (nom d'abord, IA ensuite) et le type reste
 *  CORRIGEABLE. À l'enregistrement :
 *    · rapport   → analyse habituelle, chiffrage conservé sur le dossier ;
 *    · facture   → rangée comme facture EXTÉRIEURE (numéro, totaux et PDF
 *                  d'origine, + ce qui a déjà été encaissé) — et l'appli ne
 *                  génère alors NI devis NI facture, qui feraient doublon ;
 *    · le reste  → pièces du dossier.
 * ==================================================================== */

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { analyserRapport, type Extraction } from "@/lib/extraction";
import DossierForm from "@/components/DossierForm";
import ConfigBanner from "@/components/ConfigBanner";
import BarreChargement from "@/components/BarreChargement";
import { ChampsFactureExterne } from "@/components/FactureExterne";
import { useMetier } from "@/components/MetierProvider";
import { messageErreur } from "@/lib/format";
import {
  FactureLue,
  SaisieFactureExterne,
  TYPES_FICHIER_IMPORT,
  TypeFichierImport,
  creerFactureExterne,
  deposerPieceImportee,
  devinerTypeParNom,
  erreursSaisieFacture,
  prefillDepuisFacture,
  saisieDepuisLecture,
  saisieFactureVide,
  trierDocument,
} from "@/lib/reprise";

type FichierDepose = {
  id: string;
  file: File;
  type: TypeFichierImport;
  /** attente → encours → ok | echec (échec = on garde l'estimation par le nom). */
  tri: "attente" | "encours" | "ok" | "echec";
  /** Type choisi À LA MAIN : le tri automatique ne l'écrase plus. */
  manuel: boolean;
  lue: FactureLue | null;
  saisie: SaisieFactureExterne;
};

type Bilan = { id: string; faits: string[]; rates: string[] };

const TAILLE_MAX = 15 * 1024 * 1024;

function taille(o: number): string {
  if (o < 1024 * 1024) return `${Math.max(1, Math.round(o / 1024))} Ko`;
  return `${(o / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function ImportPage() {
  const router = useRouter();
  const { metier } = useMetier();
  const estVitrage = metier === "vitrage";

  const [fichiers, setFichiers] = useState<FichierDepose[]>([]);
  const [survol, setSurvol] = useState(false);
  const [analyse, setAnalyse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Extraction | null>(null);
  const [showForm, setShowForm] = useState(false);
  // Après création du dossier : rangement de la facture et des pièces.
  const [rangement, setRangement] = useState<string | null>(null);
  const [bilan, setBilan] = useState<Bilan | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const compteur = useRef(0);

  const maj = useCallback((id: string, patch: (f: FichierDepose) => FichierDepose) => {
    setFichiers((liste) => liste.map((f) => (f.id === id ? patch(f) : f)));
  }, []);

  /** Tri automatique d'un fichier — n'écrase jamais un choix fait à la main. */
  const trier = useCallback(
    async (f: FichierDepose) => {
      maj(f.id, (x) => ({ ...x, tri: "encours" }));
      try {
        const r = await trierDocument(f.file);
        maj(f.id, (x) => ({
          ...x,
          tri: "ok",
          type: x.manuel ? x.type : r.type,
          lue: r.facture,
          saisie: saisieDepuisLecture(r.facture, x.saisie),
        }));
      } catch {
        maj(f.id, (x) => ({ ...x, tri: "echec" }));
      }
    },
    [maj]
  );

  function ajouter(liste: FileList | File[] | null) {
    if (!liste) return;
    setError(null);
    const nouveaux: FichierDepose[] = [];
    const refuses: string[] = [];
    for (const file of Array.from(liste)) {
      if (file.size > TAILLE_MAX) {
        refuses.push(`${file.name} (plus de 15 Mo)`);
        continue;
      }
      // Même fichier déposé deux fois : on l'ignore.
      if (fichiers.some((x) => x.file.name === file.name && x.file.size === file.size)) continue;
      compteur.current += 1;
      nouveaux.push({
        id: `f${compteur.current}`,
        file,
        type: devinerTypeParNom(file.name),
        tri: "attente",
        manuel: false,
        lue: null,
        saisie: saisieFactureVide(),
      });
    }
    if (refuses.length) setError(`Fichier(s) refusé(s) : ${refuses.join(", ")}.`);
    if (!nouveaux.length) return;
    setFichiers((l) => [...l, ...nouveaux]);
    // Tri en série (3 fichiers, 3 appels courts) : pas de rafale sur le quota IA.
    (async () => {
      for (const f of nouveaux) await trier(f);
    })();
  }

  const rapports = fichiers.filter((f) => f.type === "rapport");
  const factures = fichiers.filter((f) => f.type === "facture");
  const pieces = fichiers.filter((f) => f.type !== "rapport" && f.type !== "facture");
  const triEnCours = fichiers.some((f) => f.tri === "attente" || f.tri === "encours");
  const reprise = factures.length > 0;

  /** Ce qui empêche de préparer le dossier (null = c'est bon). */
  function blocage(): string | null {
    if (rapports.length > 1) {
      return "Deux fichiers sont marqués « Rapport d'expertise » : un dossier n'en prend qu'un. Passe l'autre en « Rapport définitif de l'expert (pièce) » ou retire-le.";
    }
    for (const f of factures) {
      const manques = erreursSaisieFacture(f.saisie);
      if (manques.length) return `Facture « ${f.file.name} » : il manque ${manques.join(", ")}.`;
    }
    const numeros = factures.map((f) => f.saisie.numero.trim().toLowerCase());
    if (new Set(numeros).size !== numeros.length) return "Deux factures portent le même numéro.";
    return null;
  }

  async function preparer() {
    const b = blocage();
    if (b) {
      setError(b);
      return;
    }
    setError(null);
    setAvertissement(null);
    const statutReprise = reprise ? { statut: "facture" } : {};
    if (!rapports.length) {
      // Pas de rapport : on part de ce que dit la facture (ou d'une page blanche).
      const f = factures[0];
      setPrefill(f ? { ...prefillDepuisFacture(f.lue, f.saisie), ...statutReprise } : null);
      setShowForm(true);
      return;
    }
    setAnalyse(true);
    try {
      // Identités et chiffrage sont demandés EN PARALLÈLE (v6.9).
      const { data, avertissement: avert } = await analyserRapport(rapports[0].file);
      setPrefill({ ...data, ...statutReprise });
      setAvertissement(avert);
      setShowForm(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setAnalyse(false);
    }
  }

  function saisieManuelle() {
    const b = blocage();
    if (b) {
      setError(b);
      return;
    }
    const f = factures[0];
    setPrefill(f ? { ...prefillDepuisFacture(f.lue, f.saisie), statut: "facture" } : null);
    setShowForm(true);
  }

  /** Dossier créé → on range la facture extérieure et les pièces dessus. */
  async function ranger(id: string) {
    const faits: string[] = [];
    const rates: string[] = [];
    for (const f of factures) {
      setRangement(`Facture ${f.saisie.numero}…`);
      try {
        await creerFactureExterne(id, f.file, f.saisie);
        const enc = Number(String(f.saisie.encaisse_montant).replace(",", ".")) || 0;
        faits.push(`Facture ${f.saisie.numero} rangée dans les documents${enc > 0 ? " (encaissement enregistré)" : ""}`);
      } catch (err) {
        rates.push(messageErreur(err, `Facture ${f.saisie.numero} non rangée.`));
      }
    }
    for (const p of pieces) {
      setRangement(`${p.file.name}…`);
      try {
        await deposerPieceImportee(id, p.file, p.type);
        faits.push(`${TYPES_FICHIER_IMPORT.find((t) => t.type === p.type)?.label || "Pièce"} : ${p.file.name}`);
      } catch (err) {
        rates.push(messageErreur(err, `${p.file.name} non rangé.`));
      }
    }
    setRangement(null);
    setBilan({ id, faits, rates });
  }

  function dossierSuivant() {
    setFichiers([]);
    setBilan(null);
    setPrefill(null);
    setError(null);
    setAvertissement(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const occupe = analyse || Boolean(rangement);

  /* ---------------------------- BILAN ---------------------------- */
  if (bilan) {
    return (
      <div className="max-w-2xl">
        <h1 className="titre-page mb-4">Dossier créé</h1>
        <div className="glass-card p-6">
          {bilan.faits.length > 0 && (
            <ul className="space-y-1 text-sm text-emerald-200">
              {bilan.faits.map((t, i) => <li key={i}>✓ {t}</li>)}
            </ul>
          )}
          {bilan.rates.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
              <div className="font-semibold">À reprendre depuis la fiche du dossier :</div>
              <ul className="mt-1 space-y-1">
                {bilan.rates.map((t, i) => <li key={i}>• {t}</li>)}
              </ul>
              <p className="mt-2 text-xs text-amber-100/80">
                Le dossier, lui, est bien créé. Une facture se rajoute avec « + Facture extérieure », une pièce dans « Pièces du dossier ».
              </p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/sinistres/${bilan.id}`} className="btn-primary">Ouvrir le dossier</Link>
            <button onClick={dossierSuivant} className="btn-ghost">Dossier suivant →</button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------------------- PAGE ----------------------------- */
  return (
    <div className="max-w-3xl">
      <h1 className="titre-page mb-2">
        {estVitrage ? "Importer une prise en charge" : "Importer un dossier"}
      </h1>
      <p className="text-white/60 mb-6">
        {estVitrage
          ? "Dépose le document reçu de l'assureur (ordre de mission, accord de prise en charge). L'IA en extrait les informations (véhicule, client, assurance) et pré-remplit un dossier. Tu peux y joindre d'autres documents."
          : "Dépose le rapport reçu du cabinet d'expert : l'IA pré-remplit un dossier complet. Pour un dossier déjà en cours, dépose aussi la facture déjà faite, la carte grise, le constat… tout sera rangé au bon endroit."}
      </p>

      <ConfigBanner />

      <div className="glass-card p-6">
        <label className="field-label mb-2 block">Documents du dossier</label>

        <div
          onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSurvol(false);
            if (!occupe) ajouter(e.dataTransfer.files);
          }}
          onClick={() => !occupe && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          className={`cursor-pointer rounded-xl border-2 border-dashed px-5 text-center transition-colors ${
            fichiers.length ? "py-4" : "py-7"
          } ${survol ? "border-accent-teal bg-white/10" : "border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10"}`}
        >
          <div className="text-sm text-white/70">
            {fichiers.length
              ? "Glisse d'autres documents ici"
              : "PDF, JPG ou PNG — glisse ici un ou plusieurs documents (rapport, facture, carte grise, constat…)"}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button type="button" disabled={occupe} className="btn-primary py-2 px-4 text-sm"
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
              {fichiers.length ? "Ajouter des documents" : "Choisir les documents"}
            </button>
            <button type="button" disabled={occupe} className="btn-ghost py-2 px-4 text-sm"
              onClick={(e) => { e.stopPropagation(); photoRef.current?.click(); }}>
              Prendre en photo
            </button>
          </div>
          <input ref={inputRef} type="file" multiple accept="application/pdf,image/*" className="hidden"
            onChange={(e) => { ajouter(e.target.files); e.target.value = ""; }} />
          <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { ajouter(e.target.files); e.target.value = ""; }} />
        </div>

        {/* LISTE DES FICHIERS : type proposé, corrigeable */}
        {fichiers.length > 0 && (
          <div className="mt-4 space-y-2">
            {fichiers.map((f) => (
              <div key={f.id} className="glass-soft rounded-xl p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{f.file.name}</div>
                    <div className="text-xs text-white/50">
                      {taille(f.file.size)}
                      {f.tri === "encours" || f.tri === "attente"
                        ? " · reconnaissance en cours…"
                        : f.tri === "echec" && !f.manuel
                          ? " · non reconnu automatiquement — vérifie le type"
                          : f.manuel
                            ? " · type choisi à la main"
                            : " · reconnu automatiquement"}
                    </div>
                  </div>
                  <select
                    className="field-input w-auto py-1.5 text-sm"
                    value={f.type}
                    disabled={occupe}
                    onChange={(e) => maj(f.id, (x) => ({ ...x, type: e.target.value as TypeFichierImport, manuel: true }))}
                    aria-label={`Type du document ${f.file.name}`}
                  >
                    {TYPES_FICHIER_IMPORT.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.type === "rapport" && estVitrage ? "Document de prise en charge (à analyser)" : t.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={occupe}
                    onClick={() => setFichiers((l) => l.filter((x) => x.id !== f.id))}
                    className="text-xs text-rose-200 hover:text-rose-100">
                    Retirer
                  </button>
                </div>

                {f.type === "facture" && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <p className="mb-3 text-xs text-white/60">
                      Facture faite <b>hors de l&apos;appli</b> : son numéro et ses montants sont repris tels quels, le
                      document d&apos;origine est conservé. {f.lue ? "Vérifie ce qui a été lu :" : "Renseigne ce qui est imprimé dessus :"}
                    </p>
                    <ChampsFactureExterne
                      value={f.saisie}
                      onChange={(s) => maj(f.id, (x) => ({ ...x, saisie: s }))}
                      disabled={occupe}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {reprise && (
          <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">
            <b className="text-white">Dossier repris en cours de route.</b> Comme une facture existe déjà, l&apos;appli ne
            générera ni devis, ni facture, ni ordre de réparation à la création — tu pourras toujours les créer depuis la
            fiche du dossier.
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}
        {avertissement && (
          <div className="mt-4 rounded-lg bg-amber-500/15 border border-amber-400/30 px-3 py-2 text-sm text-amber-100">
            {avertissement}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={preparer} disabled={!fichiers.length || occupe || triEnCours} className="btn-primary">
            {analyse
              ? "Analyse en cours…"
              : triEnCours
                ? "Reconnaissance des documents…"
                : rapports.length
                  ? estVitrage ? "Analyser et créer le dossier" : "Analyser le rapport et créer le dossier"
                  : "Créer le dossier"}
          </button>
          <button onClick={saisieManuelle} disabled={occupe} className="btn-ghost">
            Saisie manuelle
          </button>
        </div>
        {!fichiers.length && (
          <p className="mt-2 text-xs text-white/40">
            Choisis d&apos;abord un ou plusieurs documents — ou passe en saisie manuelle.
          </p>
        )}
        {fichiers.length > 0 && !rapports.length && !triEnCours && (
          <p className="mt-2 text-xs text-white/40">
            Aucun rapport d&apos;expertise dans le lot : le dossier sera pré-rempli avec ce qui a pu être lu
            {factures.length ? " sur la facture" : ""}, à compléter à la main.
          </p>
        )}

        <BarreChargement actif={analyse || Boolean(rangement)} />
        {rangement && <p className="mt-2 text-xs text-white/60">Rangement des documents — {rangement}</p>}
      </div>

      {showForm && (
        <DossierForm
          prefill={prefill}
          prefillFile={rapports[0]?.file ?? null}
          prefillLignes={prefill?.lignes}
          prefillMentions={prefill?.mentions ?? null}
          prefillTva={prefill?.tva ?? null}
          sansDocumentsAuto={reprise}
          onClose={() => setShowForm(false)}
          onSaved={(id) => {
            if (!id) {
              router.push("/sinistres");
              return;
            }
            // Import classique (un rapport seul) : on ouvre la fiche, comme avant.
            if (!factures.length && !pieces.length) {
              router.push(`/sinistres/${id}`);
              return;
            }
            void ranger(id);
          }}
        />
      )}
    </div>
  );
}
