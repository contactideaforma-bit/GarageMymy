"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, FlotteDocument, FlotteEntretien, FlotteMiseADispo, FlottePhoto, FlotteVehicule } from "@/lib/types";
import { formatDate, messageErreur } from "@/lib/format";
import {
  ALERTE_INFO,
  alerteAssurance,
  chargerFicheVehicule,
  dossierActifPourImmat,
  joursAvantAlerte,
  madEnCours,
  synchroniserStatutVehicule,
} from "@/lib/flotte";
import VehiculeForm from "@/components/flotte/VehiculeForm";
import FlotteDocumentsPanel from "@/components/flotte/FlotteDocumentsPanel";
import FlotteEntretiensPanel from "@/components/flotte/FlotteEntretiensPanel";
import MiseADispoPanel from "@/components/flotte/MiseADispoPanel";
import MiseADispoModal from "@/components/flotte/MiseADispoModal";

/**
 * FICHE VÉHICULE (v12.3) : identité, assurance (contrat, police, dates),
 * contrôle technique, kilométrage, documents, entretiens, notes — et le
 * suivi des prêts / locations.
 */
export default function FicheVehiculePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [vehicule, setVehicule] = useState<FlotteVehicule | null>(null);
  const [documents, setDocuments] = useState<FlotteDocument[]>([]);
  const [entretiens, setEntretiens] = useState<FlotteEntretien[]>([]);
  const [mads, setMads] = useState<FlotteMiseADispo[]>([]);
  const [photos, setPhotos] = useState<FlottePhoto[]>([]);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [migrationOk, setMigrationOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [nouveau, setNouveau] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [fiche, d] = await Promise.all([
      chargerFicheVehicule(id),
      supabase.from("dossiers").select("*").order("created_at", { ascending: false }),
    ]);
    setVehicule(fiche.vehicule);
    setDocuments(fiche.documents);
    setEntretiens(fiche.entretiens);
    setMads(fiche.mads);
    setPhotos(fiche.photos);
    setMigrationOk(fiche.migrationOk);
    setDossiers((d.data as Dossier[]) || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const dossierActif = useMemo(() => (vehicule ? dossierActifPourImmat(vehicule.immatriculation, dossiers) : null), [vehicule, dossiers]);
  const enCours = madEnCours(mads);

  async function supprimer() {
    if (!vehicule) return;
    if (!confirm(`Supprimer ${vehicule.immatriculation} de la flotte, avec ses documents, entretiens et contrats ?`)) return;
    const { error } = await supabase.from("flotte_vehicules").delete().eq("id", vehicule.id);
    if (error) return alert(messageErreur(error));
    router.push(vehicule.hors_garage ? "/flotte/hors-garage" : "/flotte");
  }

  if (loading) return <p className="text-white/50">Chargement…</p>;
  if (!vehicule) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-white/70">Véhicule introuvable.</p>
        <Link href="/flotte" className="btn-ghost mt-3 inline-block">← Retour à la flotte</Link>
      </div>
    );
  }

  const alerte = alerteAssurance(vehicule);
  const jAlerte = joursAvantAlerte(vehicule.date_assurance);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const ctDepasse = vehicule.date_prochain_ct && vehicule.date_prochain_ct < aujourdhui;
  const contratDepasse = vehicule.date_fin_contrat && vehicule.date_fin_contrat < aujourdhui;
  const retour = vehicule.hors_garage ? { href: "/flotte/hors-garage", label: "Flotte hors garage" } : { href: "/flotte", label: "Flotte du garage" };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={retour.href} className="text-xs text-white/40 hover:underline">← {retour.label}</Link>
          <h1 className="titre-page flex flex-wrap items-center gap-2">
            <span>{vehicule.immatriculation}</span>
            {enCours ? (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${enCours.type === "location" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}>
                {enCours.type === "location" ? "Loué" : "Prêté"} à {enCours.conducteur_nom || "—"}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Disponible</span>
            )}
            {dossierActif && (
              <Link href={`/sinistres/${dossierActif.id}`} className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700 hover:underline">Sinistré → dossier</Link>
            )}
            {vehicule.hors_garage && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">Hors garage</span>}
          </h1>
          <div className="text-sm text-white/60">
            {vehicule.marque_modele || "Modèle non renseigné"}
            {vehicule.couleur ? ` · ${vehicule.couleur}` : ""}
            {vehicule.carburant ? ` · ${vehicule.carburant}` : ""}
            {vehicule.kilometrage != null ? ` · ${vehicule.kilometrage.toLocaleString("fr-FR")} km` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!enCours && <button onClick={() => setNouveau("pret")} className="btn-ghost">Prêter</button>}
          {!enCours && <button onClick={() => setNouveau("location")} className="btn-primary">Louer</button>}
          <button onClick={() => setEdit(true)} className="btn-ghost">Modifier</button>
          <button onClick={supprimer} className="btn-danger">Supprimer</button>
        </div>
      </div>

      {!migrationOk && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
          Les tables de la fiche véhicule sont absentes : exécute <code>supabase/migration_v67.sql</code> dans Supabase → SQL Editor.
        </div>
      )}

      {/* Mentions importantes */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Bloc titre="Assurance">
          <Ligne k="Compagnie" v={vehicule.assurance} />
          <Ligne k="Type de contrat" v={vehicule.type_contrat_assurance} />
          <Ligne k="N° de police" v={vehicule.numero_police} />
          <Ligne k="Début du contrat" v={formatDate(vehicule.date_debut_contrat)} />
          <Ligne k="Échéance" v={vehicule.date_fin_contrat ? formatDate(vehicule.date_fin_contrat) : null} alerte={Boolean(contratDepasse)} />
          <Ligne k="Contact" v={[vehicule.assureur_tel, vehicule.assureur_email].filter(Boolean).join(" · ") || null} />
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-medium ${ALERTE_INFO[alerte].badge}`}>Alerte J+40 : {ALERTE_INFO[alerte].label}</span>
            {jAlerte !== null && <span className="text-white/40">{jAlerte < 0 ? `dépassée de ${-jAlerte} j` : `dans ${jAlerte} j`}</span>}
          </div>
        </Bloc>
        <Bloc titre="Contrôle technique & conformité">
          <Ligne k="Dernier CT" v={formatDate(vehicule.date_ct)} />
          <Ligne k="Prochain CT" v={formatDate(vehicule.date_prochain_ct)} alerte={Boolean(ctDepasse)} />
          <Ligne k="1ère mise en circulation" v={formatDate(vehicule.date_mise_circulation)} />
          <Ligne k="VIN" v={vehicule.vin} />
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Pastille ok={vehicule.ct_ok} label="CT" />
            <Pastille ok={vehicule.cg_ok} label="Carte grise" />
            <Pastille ok={vehicule.entretien_ok} label="Entretien" />
          </div>
        </Bloc>
        <Bloc titre="Titulaire & conducteur">
          <Ligne k="Carte grise au nom de" v={vehicule.titulaire_cg || (vehicule.hors_garage ? "—" : "Le garage")} />
          <Ligne k="Tél. titulaire" v={vehicule.titulaire_cg_tel} />
          <Ligne k="Conducteur habituel" v={[vehicule.conducteur, vehicule.conducteur_tel].filter(Boolean).join(" · ") || null} />
          <Ligne k="Tarif location" v={vehicule.prix_jour != null ? `${vehicule.prix_jour} € HT / jour` : null} />
          <Ligne k="Date de sinistre" v={formatDate(vehicule.date_sinistre)} />
        </Bloc>
      </div>

      {(vehicule.notes || vehicule.commentaire) && (
        <div className="glass-card px-4 py-3 sm:px-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/50">Notes</div>
          {vehicule.commentaire && <p className="mt-1 text-sm text-white/80">{vehicule.commentaire}</p>}
          {vehicule.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-white/70">{vehicule.notes}</p>}
        </div>
      )}

      <MiseADispoPanel vehicule={vehicule} mads={mads} photos={photos} dossiers={dossiers} onChanged={load} />
      <FlotteDocumentsPanel vehicule={vehicule} documents={documents} onChanged={load} />
      <FlotteEntretiensPanel vehicule={vehicule} entretiens={entretiens} onChanged={load} />

      {edit && (
        <VehiculeForm vehicule={vehicule} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load(); }} />
      )}
      {nouveau && (
        <MiseADispoModal
          vehicule={vehicule}
          type={nouveau}
          onClose={() => setNouveau(null)}
          onSaved={async () => { setNouveau(null); await synchroniserStatutVehicule(vehicule.id); load(); }}
        />
      )}
    </div>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="glass-card px-4 py-3 sm:px-5">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">{titre}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Ligne({ k, v, alerte }: { k: string; v: string | null | undefined; alerte?: boolean }) {
  const vide = !v || v === "—";
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-white/50">{k}</span>
      <span className={`text-right ${vide ? "text-white/30" : alerte ? "font-medium text-rose-300" : "text-white"}`}>{vide ? "—" : v}{alerte && !vide ? " ⚠" : ""}</span>
    </div>
  );
}

function Pastille({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}
