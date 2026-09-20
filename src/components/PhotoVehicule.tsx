"use client";

import { useEffect, useState } from "react";
import { fetchAuth } from "@/lib/apiClient";

/**
 * Vignette d'illustration du modèle (v13.10) — photo générique du modèle
 * tirée de Wikipédia, affichée en tête du bloc « Véhicule ». Rien n'est
 * affiché tant que la photo n'est pas trouvée : aucun espace vide, aucune
 * erreur visible. La couleur et l'année réelles peuvent différer.
 */
export default function PhotoVehicule({ marqueModele }: { marqueModele?: string | null }) {
  const [photo, setPhoto] = useState<{ url: string; titre?: string; page?: string } | null>(null);

  useEffect(() => {
    setPhoto(null);
    const q = (marqueModele || "").trim();
    if (!q) return;
    let actif = true;
    fetchAuth(`/api/photo-vehicule?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (actif && j?.url) setPhoto(j); })
      .catch(() => {});
    return () => { actif = false; };
  }, [marqueModele]);

  if (!photo) return null;

  return (
    <figure className="mb-3">
      <div className="overflow-hidden rounded-lg bg-white/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.titre || "Illustration du modèle"}
          className="mx-auto max-h-40 w-auto object-contain"
          loading="lazy"
          onError={() => setPhoto(null)}
        />
      </div>
      <figcaption className="mt-1 text-[11px] text-white/35">
        Illustration du modèle{photo.titre ? ` — ${photo.titre}` : ""} (photo générique, couleur et finition peuvent différer)
      </figcaption>
    </figure>
  );
}
