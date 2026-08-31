"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CATEGORIES_PARTICULARITE,
  Particularite,
  TarifsAgrement,
  aDesTarifs,
  badgeParticularite,
  chargerLiens,
  chargerParticularites,
  creerParticularite,
  enregistrerTarifs,
  poserParticularite,
  resumeTarifs,
  retirerParticularite,
  supprimerParticularite,
} from "@/lib/particularites";
import { messageErreur } from "@/lib/format";

/**
 * PARTICULARITÉS d'un dossier (v7.0) : courtier, agrément, apporteur…
 *
 * Les étiquettes sont RÉUTILISABLES : on les crée une fois, on les pose
 * ensuite sur autant de dossiers qu'on veut, et la liste des sinistres permet
 * de filtrer dessus.
 */
const TARIFS_VIDES: Record<keyof TarifsAgrement, string> = {
  taux_t1: "",
  taux_t2: "",
  taux_t3: "",
  taux_peinture: "",
  taux_ingredients: "",
  remise_pieces: "",
  remise_mo: "",
  assureurs: "",
};

export default function ParticularitesPanel({
  dossierId,
  onChanged,
}: {
  dossierId: string;
  onChanged?: () => void;
}) {
  const [catalogue, setCatalogue] = useState<Particularite[]>([]);
  const [posees, setPosees] = useState<string[]>([]);
  const [nouveau, setNouveau] = useState("");
  const [categorie, setCategorie] = useState("courtier");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [gestion, setGestion] = useState(false);
  // TARIFS D'AGRÉMENT (v11.2) : édition en place dans le catalogue.
  const [tarifsDe, setTarifsDe] = useState<string | null>(null);
  const [tarifs, setTarifs] = useState<Record<keyof TarifsAgrement, string>>(TARIFS_VIDES);
  const [tarifsBusy, setTarifsBusy] = useState(false);

  function ouvrirTarifs(p: Particularite) {
    setTarifsDe(p.id);
    setTarifs({
      taux_t1: p.taux_t1 != null ? String(p.taux_t1) : "",
      taux_t2: p.taux_t2 != null ? String(p.taux_t2) : "",
      taux_t3: p.taux_t3 != null ? String(p.taux_t3) : "",
      taux_peinture: p.taux_peinture != null ? String(p.taux_peinture) : "",
      taux_ingredients: p.taux_ingredients != null ? String(p.taux_ingredients) : "",
      remise_pieces: p.remise_pieces != null ? String(p.remise_pieces) : "",
      remise_mo: p.remise_mo != null ? String(p.remise_mo) : "",
      assureurs: p.assureurs || "",
    });
  }

  async function sauverTarifs() {
    if (!tarifsDe || tarifsBusy) return;
    setTarifsBusy(true);
    setErreur(null);
    const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")) || null);
    try {
      await enregistrerTarifs(tarifsDe, {
        taux_t1: num(tarifs.taux_t1),
        taux_t2: num(tarifs.taux_t2),
        taux_t3: num(tarifs.taux_t3),
        taux_peinture: num(tarifs.taux_peinture),
        taux_ingredients: num(tarifs.taux_ingredients),
        remise_pieces: num(tarifs.remise_pieces),
        remise_mo: num(tarifs.remise_mo),
        assureurs: tarifs.assureurs.trim() || null,
      });
      setTarifsDe(null);
      await charger();
      onChanged?.();
    } catch (err) {
      setErreur(messageErreur(err, "Tarifs non enregistrés (migration v61 exécutée ?)."));
    } finally {
      setTarifsBusy(false);
    }
  }

  const charger = useCallback(async () => {
    const [cat, liens] = await Promise.all([chargerParticularites(), chargerLiens(dossierId)]);
    setCatalogue(cat);
    setPosees(liens.map((l) => l.particularite_id));
  }, [dossierId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function basculer(p: Particularite) {
    setErreur(null);
    const active = posees.includes(p.id);
    setPosees((prev) => (active ? prev.filter((x) => x !== p.id) : [...prev, p.id]));
    try {
      if (active) await retirerParticularite(dossierId, p.id);
      else await poserParticularite(dossierId, p.id);
      onChanged?.();
    } catch (err) {
      setPosees((prev) => (active ? [...prev, p.id] : prev.filter((x) => x !== p.id)));
      setErreur(messageErreur(err, "Modification impossible (migration v37 exécutée ?)."));
    }
  }

  async function ajouter() {
    const nom = nouveau.trim();
    if (!nom || busy) return;
    setBusy(true);
    setErreur(null);
    try {
      // Étiquette déjà au catalogue ? on la pose simplement.
      const existante = catalogue.find((p) => p.nom.toLowerCase() === nom.toLowerCase());
      const p = existante || (await creerParticularite(nom, categorie));
      await poserParticularite(dossierId, p.id);
      setNouveau("");
      await charger();
      onChanged?.();
    } catch (err) {
      setErreur(messageErreur(err, "Création impossible (migration v37 exécutée ?)."));
    } finally {
      setBusy(false);
    }
  }

  async function supprimerDuCatalogue(p: Particularite) {
    if (!confirm(`Supprimer « ${p.nom} » du catalogue ? Elle sera retirée de tous les dossiers.`)) return;
    try {
      await supprimerParticularite(p.id);
      await charger();
      onChanged?.();
    } catch (err) {
      setErreur(messageErreur(err, "Suppression impossible."));
    }
  }

  const actives = catalogue.filter((p) => posees.includes(p.id));
  const inactives = catalogue.filter((p) => !posees.includes(p.id));

  return (
    <div className="space-y-2.5">
      {/* Étiquettes posées sur ce dossier */}
      <div className="flex flex-wrap items-center gap-1.5">
        {actives.length === 0 && (
          <span className="text-xs text-white/40">
            Aucune particularité. Ajoute « courtier X », « agrément Y »… pour retrouver ensuite
            tous les dossiers concernés.
          </span>
        )}
        {actives.map((p) => (
          <button
            key={p.id}
            onClick={() => basculer(p)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeParticularite(p.couleur)}`}
            title={aDesTarifs(p) ? `Tarifs de l'agrément : ${resumeTarifs(p)} — cliquer pour retirer du dossier` : "Retirer de ce dossier"}
          >
            {p.nom}
            {aDesTarifs(p) && <span title="Tarif particulier">€</span>}
            <span className="opacity-50">×</span>
          </button>
        ))}
      </div>

      {/* AGRÉMENT À TARIF PARTICULIER (v11.2) : rappel des conditions négociées.
          L'éditeur de facture propose de les appliquer et signale les écarts. */}
      {actives.filter(aDesTarifs).map((p) => (
        <div key={`tarifs-${p.id}`} className="alerte alerte-info text-xs">
          <span className="font-semibold">Agrément « {p.nom} » — tarif particulier :</span> {resumeTarifs(p)}
          {p.notes ? <span className="block opacity-80">{p.notes}</span> : null}
          <span className="block opacity-80">
            Dans le devis / la facture, le bouton « Appliquer les tarifs de l&apos;agrément » reprend ces conditions ; les écarts avec le rapport sont signalés.
          </span>
        </div>
      ))}

      {/* Étiquettes disponibles (un clic pour poser) */}
      {inactives.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-white/30">Disponibles</span>
          {inactives.map((p) => (
            <button
              key={p.id}
              onClick={() => basculer(p)}
              className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-white/60 hover:border-white/40 hover:text-white"
              title="Ajouter à ce dossier"
            >
              + {p.nom}
            </button>
          ))}
        </div>
      )}

      {/* Création */}
      <div className="flex flex-wrap gap-2">
        <input
          className="field-input min-w-[10rem] flex-1 py-1.5 text-xs"
          placeholder="Nouvelle particularité (ex. Courtier ABC, Agrément MAIF…)"
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ajouter();
            }
          }}
        />
        <select
          className="field-input w-auto py-1.5 text-xs"
          value={categorie}
          onChange={(e) => setCategorie(e.target.value)}
          title="Famille"
        >
          {Object.entries(CATEGORIES_PARTICULARITE).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button onClick={ajouter} disabled={busy || !nouveau.trim()} className="btn-ghost py-1.5 px-3 text-xs">
          Ajouter
        </button>
        {catalogue.length > 0 && (
          <button onClick={() => setGestion((g) => !g)} className="btn-ghost py-1.5 px-3 text-xs">
            {gestion ? "Fermer" : "Gérer"}
          </button>
        )}
      </div>

      {gestion && (
        <div className="glass-soft rounded-lg p-2.5">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-white/35">
            Catalogue — supprimer une étiquette la retire de TOUS les dossiers
          </div>
          <ul className="divide-y divide-white/5">
            {catalogue.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${badgeParticularite(p.couleur)}`}>
                    {p.nom}
                  </span>
                  <span className="truncate text-white/35">
                    {CATEGORIES_PARTICULARITE[p.categorie] || "Autre"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {p.categorie === "agrement" && (
                    <button
                      onClick={() => (tarifsDe === p.id ? setTarifsDe(null) : ouvrirTarifs(p))}
                      className="text-accent-teal hover:underline"
                      title="Taux horaires, remises et assureur de l'agrément"
                    >
                      {aDesTarifs(p) ? "Tarifs €" : "+ Tarifs"}
                    </button>
                  )}
                  <button
                    onClick={() => supprimerDuCatalogue(p)}
                    className="text-white/40 hover:text-rose-300"
                  >
                    Suppr.
                  </button>
                </span>
              </li>
            ))}
          </ul>

          {/* Formulaire des tarifs d'un agrément (v11.2) */}
          {tarifsDe && (
            <div className="mt-2 rounded-lg border border-white/15 p-2.5">
              <div className="mb-2 text-xs font-semibold text-white/80">
                Tarifs de l&apos;agrément « {catalogue.find((p) => p.id === tarifsDe)?.nom} » — laisse vide ce qui n&apos;est pas négocié.
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(
                  [
                    ["taux_t1", "T1 €/h"],
                    ["taux_t2", "T2 €/h"],
                    ["taux_t3", "T3 €/h"],
                    ["taux_peinture", "Peinture €/h"],
                    ["taux_ingredients", "Ingrédients €/h"],
                    ["remise_pieces", "Remise pièces %"],
                    ["remise_mo", "Remise MO %"],
                  ] as [keyof TarifsAgrement, string][]
                ).map(([k, label]) => (
                  <label key={k} className="block text-[11px] text-white/60">
                    {label}
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      className="field-input field-compact mt-0.5 text-right tabular-nums"
                      value={tarifs[k]}
                      onChange={(e) => setTarifs((t) => ({ ...t, [k]: e.target.value }))}
                    />
                  </label>
                ))}
                <label className="col-span-2 block text-[11px] text-white/60 sm:col-span-3">
                  Assureur(s) concerné(s) — mots clés séparés par des virgules (rattachement automatique à l&apos;import)
                  <input
                    className="field-input field-compact mt-0.5"
                    placeholder="ex. MAIF, Filia"
                    value={tarifs.assureurs}
                    onChange={(e) => setTarifs((t) => ({ ...t, assureurs: e.target.value }))}
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={sauverTarifs} disabled={tarifsBusy} className="btn-primary btn-compact">
                  {tarifsBusy ? "Enregistrement…" : "Enregistrer les tarifs"}
                </button>
                <button onClick={() => setTarifsDe(null)} className="btn-ghost btn-compact">
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {erreur && (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
          {erreur}
        </div>
      )}
    </div>
  );
}
