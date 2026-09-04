"use client";

// ====================================================================
//  BARRE D'ONGLETS DES DOSSIERS (v12.5) — au-dessus des pages /sinistres
//
//  « Liste » + un onglet par fiche ouverte (cf. lib/onglets.ts). L'onglet
//  actif suit l'URL. Croix pour fermer ; fermer l'onglet courant renvoie
//  vers l'onglet voisin, sinon vers la liste. Défile horizontalement sur
//  téléphone au lieu de se replier (les onglets restent sur une ligne).
// ====================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { OngletDossier, fermerOnglet, fermerTousLesOnglets, lireOnglets, surChangementOnglets } from "@/lib/onglets";

export default function OngletsDossiers() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [onglets, setOnglets] = useState<OngletDossier[]>([]);

  useEffect(() => {
    const maj = () => setOnglets(lireOnglets());
    maj();
    return surChangementOnglets(maj);
  }, []);

  const idCourant = pathname.match(/^\/sinistres\/([^/]+)/)?.[1] || null;
  const surListe = pathname === "/sinistres";

  // Fiche ouverte pas encore épinglée (le libellé arrive quand la fiche a chargé).
  const liste: OngletDossier[] =
    idCourant && !onglets.some((o) => o.id === idCourant)
      ? [...onglets, { id: idCourant, label: "Chargement…" }]
      : onglets;

  if (liste.length === 0) return null;

  function fermer(id: string) {
    const index = liste.findIndex((o) => o.id === id);
    fermerOnglet(id);
    if (id === idCourant) {
      const voisin = liste[index + 1] || liste[index - 1];
      router.push(voisin && voisin.id !== id ? `/sinistres/${voisin.id}` : "/sinistres");
    }
  }

  const base =
    "group inline-flex max-w-[14rem] shrink-0 items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-xs transition-colors";
  const inactif = "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90";
  const actif = "border-accent-pink/50 bg-white/15 text-white shadow-[0_-2px_12px_rgba(236,72,153,0.25)]";

  return (
    <div className="onglets-dossiers -mb-1 flex items-end gap-1 overflow-x-auto border-b border-white/10 pb-0" role="tablist" aria-label="Dossiers ouverts">
      <Link href="/sinistres" role="tab" aria-selected={surListe} className={`${base} ${surListe ? actif : inactif}`}>
        <span aria-hidden>☰</span> Liste
      </Link>
      {liste.map((o) => {
        const estActif = o.id === idCourant;
        return (
          <span key={o.id} role="tab" aria-selected={estActif} className={`${base} ${estActif ? actif : inactif}`}>
            <Link href={`/sinistres/${o.id}`} className="min-w-0 truncate" title={o.label}>
              📁 {o.label}
            </Link>
            <button
              type="button"
              onClick={() => fermer(o.id)}
              className="shrink-0 rounded px-0.5 leading-none text-white/40 hover:text-rose-300"
              aria-label={`Fermer ${o.label}`}
              title="Fermer l'onglet"
            >
              ×
            </button>
          </span>
        );
      })}
      {onglets.length > 1 && (
        <button
          type="button"
          onClick={() => {
            fermerTousLesOnglets();
            if (idCourant) router.push("/sinistres");
          }}
          className="ml-auto shrink-0 px-2 py-1.5 text-[11px] text-white/40 hover:text-white/80"
          title="Fermer tous les onglets"
        >
          Tout fermer
        </button>
      )}
    </div>
  );
}
