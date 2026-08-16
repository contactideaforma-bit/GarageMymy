"use client";

import { useMemo, useState } from "react";
import { Dossier } from "@/lib/types";
import { estActif, labelStatut } from "@/lib/format";
import ModalShell from "./ModalShell";

/**
 * RECHERCHE DE DOSSIER (v41) — petite modale utilisée pour rattacher un
 * rappel de l'ardoise à un dossier en cours.
 *
 * On cherche sur tout ce que le garage a en tête : n° de sinistre, client,
 * immatriculation, marque/modèle. Par défaut on ne propose que les dossiers
 * EN COURS (une case permet d'inclure les dossiers terminés).
 */

/** Libellé court d'un dossier, réutilisé par les pastilles de rappel. */
export function libelleDossier(d?: Dossier | null): string {
  if (!d) return "";
  const vehicule = [d.marque_modele, d.immatriculation ? `(${d.immatriculation})` : ""]
    .filter(Boolean)
    .join(" ");
  return [d.numero_sinistre, vehicule, d.client_nom].filter(Boolean).join(" · ") || "Dossier";
}

export default function DossierPicker({
  dossiers,
  onChoisir,
  onFermer,
  titre = "Lier à un dossier",
}: {
  dossiers: Dossier[];
  onChoisir: (d: Dossier) => void;
  onFermer: () => void;
  titre?: string;
}) {
  const [q, setQ] = useState("");
  const [tous, setTous] = useState(false);

  const resultats = useMemo(() => {
    const base = tous ? dossiers : dossiers.filter((d) => estActif(d.statut));
    const terme = q.trim().toLowerCase();
    const liste = terme
      ? base.filter((d) =>
          [d.numero_sinistre, d.client_nom, d.immatriculation, d.marque_modele, d.cabinet_expert]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(terme)
        )
      : base;
    return liste.slice(0, 40);
  }, [dossiers, q, tous]);

  return (
    <ModalShell title={titre} onClose={onFermer} maxWidth="max-w-lg">
      <input
        autoFocus
        className="field-input"
        placeholder="N° de sinistre, client, immatriculation, véhicule…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <label className="flex cursor-pointer items-center gap-2 text-xs text-white/50">
        <input
          type="checkbox"
          checked={tous}
          onChange={(e) => setTous(e.target.checked)}
          className="h-3.5 w-3.5 accent-emerald-500"
        />
        Inclure les dossiers terminés
      </label>

      {resultats.length === 0 ? (
        <p className="py-4 text-sm text-white/40">
          Aucun dossier ne correspond{q.trim() ? ` à « ${q.trim()} »` : ""}.
        </p>
      ) : (
        <ul className="max-h-[50vh] divide-y divide-white/5 overflow-y-auto">
          {resultats.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => onChoisir(d)}
                className="w-full rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
              >
                <span className="block truncate text-sm font-medium text-white">
                  {d.marque_modele || "Véhicule à renseigner"}
                  {d.immatriculation ? ` (${d.immatriculation})` : ""}
                </span>
                <span className="mt-0.5 block truncate text-xs text-white/50">
                  {d.client_nom || "—"} · dossier {d.numero_sinistre || "—"} · {labelStatut(d.statut)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}
