"use client";

/* ====================================================================
 *  BASE DE DONNÉES du cabinet (v13.6) : Assurances · Clients · Réparateurs.
 *  Ajout manuel (avec recherche SIREN/SIRET), import Excel / CSV / PDF,
 *  recherche, modification, suppression. Les fiches sont proposées à la
 *  création d'une mission (mandant, lésé, réparateur).
 * ==================================================================== */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FicheAnnuaireModal, { FicheQuelconque, TITRES } from "@/components/expert/FicheAnnuaireModal";
import ImportAnnuaireModal from "@/components/expert/ImportAnnuaireModal";
import { EnTete, Vide } from "@/components/expert/ui";
import { chargerAssurances, chargerClients, chargerGarages, supprimerAssurance, supprimerClient, supprimerGarage } from "@/lib/expertise/data";
import { CategorieAnnuaire } from "@/lib/expertise/importAnnuaire";
import { adresseFiche } from "@/lib/expertise/types";
import { formatEuros } from "@/lib/format";

const ONGLETS: { code: CategorieAnnuaire; label: string; icone: string }[] = [
  { code: "assurances", label: "Assurances", icone: "🛡" },
  { code: "clients", label: "Clients", icone: "👤" },
  { code: "garages", label: "Réparateurs", icone: "🔧" },
];

function Annuaire() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get("onglet") as CategorieAnnuaire | null;
  const [onglet, setOnglet] = useState<CategorieAnnuaire>(initial && ONGLETS.some((o) => o.code === initial) ? initial : "assurances");
  const [listes, setListes] = useState<Record<CategorieAnnuaire, FicheQuelconque[]>>({ assurances: [], clients: [], garages: [] });
  const [dispo, setDispo] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [edition, setEdition] = useState<FicheQuelconque | null | "nouveau">(null);
  const [importOuvert, setImportOuvert] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    const [a, c, g] = await Promise.all([chargerAssurances(), chargerClients(), chargerGarages()]);
    setListes({ assurances: a, clients: c, garages: g });
  }, []);
  useEffect(() => {
    recharger().catch(() => setDispo(false));
  }, [recharger]);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return listes[onglet].filter((f) => !q || [f.nom, f.ville, f.code_postal, f.siren, f.siret, f.contact, f.email, f.tel].some((v) => (v || "").toLowerCase().includes(q)));
  }, [listes, onglet, recherche]);

  async function supprimer(f: FicheQuelconque) {
    if (!f.id || !confirm(`Supprimer « ${f.nom} » ?`)) return;
    if (onglet === "assurances") await supprimerAssurance(f.id);
    else if (onglet === "clients") await supprimerClient(f.id);
    else await supprimerGarage(f.id);
    recharger();
  }

  const t = TITRES[onglet];
  return (
    <div className="space-y-4">
      <EnTete
        titre="Base de données"
        sousTitre="Assurances, clients et réparateurs du cabinet — proposés automatiquement à la création d'une mission."
        actions={
          <>
            <button className="btn-ghost btn-compact whitespace-nowrap" onClick={() => setImportOuvert(true)}>📥 Importer (Excel, CSV, PDF)</button>
            <button className="btn-primary whitespace-nowrap" onClick={() => setEdition("nouveau")}>+ {t.un[0].toUpperCase() + t.un.slice(1)}</button>
          </>
        }
      />
      {!dispo && <div className="alerte alerte-warn text-sm">Exécute <code className="font-mono">supabase/migration_v76.sql</code> dans Supabase → SQL Editor pour activer les assurances et les clients.</div>}
      {info && <div className="alerte alerte-ok text-sm flex items-center justify-between"><span>{info}</span><button className="text-xs underline" onClick={() => setInfo(null)}>fermer</button></div>}

      <div className="glass-card flex flex-wrap items-center gap-2 p-2">
        <div className="flex gap-1">
          {ONGLETS.map((o) => (
            <button key={o.code} className={`al-onglet ${onglet === o.code ? "actif" : ""}`} onClick={() => { setOnglet(o.code); router.replace(`/expert/annuaire?onglet=${o.code}`); }}>
              {o.icone} {o.label} <span className="ml-1 text-xs opacity-60">{listes[o.code].length}</span>
            </button>
          ))}
        </div>
        <input className="field-input field-compact ml-auto w-full sm:w-64" placeholder="Rechercher…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      </div>

      {liste.length === 0 ? (
        <div className="glass-card p-4">
          <Vide
            titre={recherche ? "Aucun résultat" : `Aucun ${t.un} enregistré`}
            texte={recherche ? "Modifie la recherche." : "Ajoute une fiche (recherche SIREN/SIRET pour tout remplir) ou importe une liste Excel, CSV ou PDF."}
            action={!recherche && <div className="flex gap-2"><button className="btn-primary" onClick={() => setEdition("nouveau")}>+ Ajouter</button><button className="btn-ghost" onClick={() => setImportOuvert(true)}>📥 Importer</button></div>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {liste.map((f) => (
            <div key={f.id} className="glass-card flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold" title={f.nom}>{f.nom}</div>
                  {onglet === "clients" && <span className={`badge ${f.type === "societe" ? "badge-info" : "badge-neutral"} mt-0.5`}>{f.type === "societe" ? "Société" : "Particulier"}</span>}
                  <div className="mt-1 text-sm text-white/60">{adresseFiche(f) || "Adresse non renseignée"}</div>
                  {(f.siret || f.siren) && <div className="text-xs text-white/45">{f.siret ? `SIRET ${f.siret}` : `SIREN ${f.siren}`}</div>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="btn-ghost btn-compact whitespace-nowrap" onClick={() => setEdition(f)}>Modifier</button>
                  <button className="btn-danger btn-compact" onClick={() => supprimer(f)} aria-label="Supprimer">×</button>
                </div>
              </div>
              {onglet === "garages" && (
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                  {[["T1", f.taux_t1], ["T2", f.taux_t2], ["T3", f.taux_t3], ["Peint.", f.taux_peinture]].map(([l, v]) => (
                    <div key={String(l)} className="glass-soft px-1 py-1.5">
                      <div className="text-white/50">{l}</div>
                      <div className="font-semibold whitespace-nowrap">{v ? formatEuros(Number(v)) : "—"}</div>
                    </div>
                  ))}
                </div>
              )}
              {(f.contact || f.tel || f.email) && (
                <div className="mt-2 truncate text-xs text-white/60" title={[f.contact, f.tel, f.email].filter(Boolean).join(" · ")}>{[f.contact, f.tel, f.email].filter(Boolean).join(" · ")}</div>
              )}
              {f.notes && <div className="mt-1 line-clamp-2 text-xs text-white/45">{f.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {edition && (
        <FicheAnnuaireModal
          categorie={onglet}
          initial={edition === "nouveau" ? null : edition}
          onClose={() => setEdition(null)}
          onSaved={() => { setEdition(null); recharger(); }}
        />
      )}
      {importOuvert && (
        <ImportAnnuaireModal
          categorie={onglet}
          existants={listes[onglet].map((f) => ({ nom: f.nom || "" }))}
          onClose={() => setImportOuvert(false)}
          onDone={(n) => { setImportOuvert(false); setInfo(`${n} fiche(s) importée(s) dans ${t.pluriel.toLowerCase()}.`); recharger(); }}
        />
      )}
    </div>
  );
}

export default function PageAnnuaireExpert() {
  return (
    <Suspense fallback={<div className="skeleton h-40 rounded-2xl" />}>
      <Annuaire />
    </Suspense>
  );
}
