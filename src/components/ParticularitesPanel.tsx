"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CATEGORIES_PARTICULARITE,
  Particularite,
  badgeParticularite,
  chargerLiens,
  chargerParticularites,
  creerParticularite,
  poserParticularite,
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
            title="Retirer de ce dossier"
          >
            {p.nom}
            <span className="opacity-50">×</span>
          </button>
        ))}
      </div>

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
                <button
                  onClick={() => supprimerDuCatalogue(p)}
                  className="shrink-0 text-white/40 hover:text-rose-300"
                >
                  Suppr.
                </button>
              </li>
            ))}
          </ul>
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
