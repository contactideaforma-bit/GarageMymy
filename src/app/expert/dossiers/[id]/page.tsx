"use client";

/* ====================================================================
 *  FICHE D'UN DOSSIER D'EXPERTISE (v13.5)
 *  Onglets : Dossier · Photos · Documents · Rapport · Pièces.
 *  Tous les onglets restent montés (cachés) : le rapport continue de
 *  s'enregistrer, une pièce retenue part directement dans le chiffrage,
 *  un devis déposé peut lancer la génération du rapport.
 * ==================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DossierExpertForm from "@/components/expert/DossierExpertForm";
import PhotosExpertPanel from "@/components/expert/PhotosExpertPanel";
import DocumentsExpertPanel from "@/components/expert/DocumentsExpertPanel";
import RapportEditeur from "@/components/expert/RapportEditeur";
import PiecesRecherche from "@/components/expert/PiecesRecherche";
import { BadgeStatutExpert, Bloc, EnTete, Info } from "@/components/expert/ui";
import { chargerCabinet, chargerDossier, chargerGarages, changerStatut, supprimerDossier } from "@/lib/expertise/data";
import { Cabinet, DocumentExpert, DossierExpert, GarageExpert, Operation, PhotoExpert, STATUTS_EXPERTISE } from "@/lib/expertise/types";
import { formatDate } from "@/lib/format";

type Onglet = "dossier" | "photos" | "documents" | "rapport" | "pieces";
const ONGLETS: { code: Onglet; label: string }[] = [
  { code: "dossier", label: "Dossier" },
  { code: "photos", label: "Photos" },
  { code: "documents", label: "Documents" },
  { code: "rapport", label: "Rapport" },
  { code: "pieces", label: "Pièces & prix" },
];

export default function FicheDossierExpert() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [dossier, setDossier] = useState<DossierExpert | null>(null);
  const [cabinet, setCabinet] = useState<Cabinet | null>(null);
  const [garages, setGarages] = useState<GarageExpert[]>([]);
  const [photos, setPhotos] = useState<PhotoExpert[]>([]);
  const [documents, setDocuments] = useState<DocumentExpert[]>([]);
  const [onglet, setOnglet] = useState<Onglet>("dossier");
  const [edition, setEdition] = useState(false);
  const [introuvable, setIntrouvable] = useState(false);
  const [demandeSource, setDemandeSource] = useState<{ doc: DocumentExpert; mode: "devis" | "facture"; cle: number } | null>(null);
  const [nbPiecesEnvoyees, setNbPiecesEnvoyees] = useState(0);
  const recepteurOperation = useRef<((op: Operation) => void) | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([chargerDossier(id), chargerCabinet(), chargerGarages()]).then(([d, c, g]) => {
      if (!d) { setIntrouvable(true); return; }
      setDossier(d); setCabinet(c); setGarages(g);
    });
  }, [id]);

  const garage = dossier?.garage_id ? garages.find((g) => g.id === dossier.garage_id) || null : null;

  const onPhotos = useCallback((p: PhotoExpert[]) => setPhotos(p), []);
  const enregistrerRecepteur = useCallback((r: (op: Operation) => void) => { recepteurOperation.current = r; }, []);

  if (introuvable) return <div className="glass-card p-6 text-center text-sm text-white/60">Dossier introuvable.</div>;
  if (!dossier) return <div className="skeleton h-40 rounded-2xl" />;

  const vehicule = [dossier.marque, dossier.modele, dossier.finition].filter(Boolean).join(" ");

  return (
    <div className="space-y-4">
      <EnTete
        titre={`${dossier.numero} · ${dossier.immatriculation || "sans immat."}`}
        sousTitre={[vehicule, dossier.lese_nom || dossier.assure_nom, dossier.mandant_nom].filter(Boolean).join(" — ")}
        retour={{ href: "/expert/dossiers", label: "Dossiers" }}
        actions={
          <>
            <select className="field-input field-compact w-auto" value={dossier.statut} onChange={async (e) => { await changerStatut(dossier.id, e.target.value as DossierExpert["statut"]); setDossier({ ...dossier, statut: e.target.value as DossierExpert["statut"] }); }}>
              {STATUTS_EXPERTISE.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
            <button className="btn-ghost btn-compact" onClick={() => setEdition(true)}>Modifier</button>
            <button className="btn-danger btn-compact" onClick={async () => { if (confirm(`Supprimer le dossier ${dossier.numero} et tous ses fichiers ?`)) { await supprimerDossier(dossier.id); router.push("/expert/dossiers"); } }}>Supprimer</button>
          </>
        }
      />

      <div className="glass-card flex gap-1 overflow-x-auto p-1.5">
        {ONGLETS.map((o) => (
          <button key={o.code} className={`al-onglet ${onglet === o.code ? "actif" : ""}`} onClick={() => setOnglet(o.code)}>
            {o.label}
            {o.code === "photos" && photos.length > 0 && <span className="ml-1 text-xs opacity-60">{photos.length}</span>}
            {o.code === "documents" && documents.length > 0 && <span className="ml-1 text-xs opacity-60">{documents.length}</span>}
          </button>
        ))}
      </div>

      {/* ------------------------------ Dossier ----------------------------- */}
      <div className={onglet === "dossier" ? "space-y-4" : "hidden"}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Bloc titre="Mission">
            <div className="grid grid-cols-2 gap-3">
              <Info label="Statut" valeur={<BadgeStatutExpert statut={dossier.statut} />} />
              <Info label="Type" valeur={dossier.type_expertise} />
              <Info label="Date de mission" valeur={formatDate(dossier.date_mission)} />
              <Info label="Date de visite" valeur={formatDate(dossier.date_visite)} />
              <Info label="Lieu" valeur={dossier.lieu_expertise} className="col-span-2" />
            </div>
          </Bloc>
          <Bloc titre="Mandant">
            <div className="grid grid-cols-2 gap-3">
              <Info label="Société" valeur={dossier.mandant_nom} className="col-span-2" />
              <Info label="N° de sinistre" valeur={dossier.numero_sinistre} />
              <Info label="Date du sinistre" valeur={formatDate(dossier.date_sinistre)} />
              <Info label="N° de police" valeur={dossier.numero_police} />
              <Info label="Assuré" valeur={dossier.assure_nom} />
            </div>
          </Bloc>
          <Bloc titre="Lésé">
            <div className="grid grid-cols-2 gap-3">
              <Info label="Nom" valeur={dossier.lese_nom} className="col-span-2" />
              <Info label="Adresse" valeur={dossier.lese_adresse} className="col-span-2" />
              <Info label="Email" valeur={dossier.lese_email} />
              <Info label="Téléphone" valeur={dossier.lese_tel} />
            </div>
          </Bloc>
          <Bloc titre="Réparateur">
            <div className="grid grid-cols-2 gap-3">
              <Info label="Nom" valeur={dossier.reparateur_nom} className="col-span-2" />
              <Info label="Adresse" valeur={dossier.reparateur_adresse?.replace(/\n/g, ", ")} className="col-span-2" />
              <Info label="SIRET" valeur={dossier.reparateur_siret} />
              <Info label="Taux T1 / T2 / peinture" valeur={garage ? `${garage.taux_t1 ?? "—"} / ${garage.taux_t2 ?? "—"} / ${garage.taux_peinture ?? "—"} €/h` : "—"} />
            </div>
          </Bloc>
          <Bloc titre="Véhicule" className="lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Info label="Immatriculation" valeur={dossier.immatriculation} />
              <Info label="Marque / modèle" valeur={[dossier.marque, dossier.modele].filter(Boolean).join(" ")} />
              <Info label="Finition" valeur={dossier.finition} />
              <Info label="Énergie" valeur={dossier.energie} />
              <Info label="N° de série" valeur={dossier.vin} className="col-span-2" />
              <Info label="Date MEC" valeur={formatDate(dossier.date_mec)} />
              <Info label="Kilométrage" valeur={dossier.kilometrage ? `${dossier.kilometrage.toLocaleString("fr-FR")} km` : null} />
              <Info label="Genre" valeur={dossier.genre} className="col-span-2" />
              <Info label="Carrosserie" valeur={dossier.carrosserie} />
              <Info label="Couleur / places" valeur={[dossier.couleur, dossier.places ? `${dossier.places} pl.` : null].filter(Boolean).join(" · ")} />
              <Info label="Pneus AVG / AVD / ARG / ARD" valeur={[dossier.pneu_avg, dossier.pneu_avd, dossier.pneu_arg, dossier.pneu_ard].map((p) => p || "—").join(" / ")} className="col-span-2" />
              <Info label="État général" valeur={dossier.etat_general} />
              <Info label="Validité CT" valeur={formatDate(dossier.validite_ct)} />
            </div>
          </Bloc>
          <Bloc titre="Dommage" className="lg:col-span-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Info label="Nature" valeur={dossier.dommage_type} />
              <Info label="Imputable" valeur={dossier.dommage_imputable} />
              <Info label="Intensité" valeur={dossier.dommage_intensite} />
              <Info label="Véhicule" valeur={dossier.vehicule_reparable === false ? "Économiquement irréparable" : "Réparable"} />
              <div className="col-span-2 sm:col-span-4 text-sm text-white/75">{dossier.dommage_description || <span className="text-white/35">Aucune description — les photos et l&apos;analyse IA peuvent la compléter.</span>}</div>
            </div>
          </Bloc>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button className="btn-ghost" onClick={() => setOnglet("photos")}>📷 Photographier</button>
          <button className="btn-ghost" onClick={() => setOnglet("documents")}>📎 Documents</button>
          <button className="btn-ghost" onClick={() => setOnglet("pieces")}>🔎 Pièces & prix</button>
          <button className="btn-primary" onClick={() => setOnglet("rapport")}>📄 Rapport d&apos;expertise</button>
        </div>
      </div>

      {/* ------------------------------ Photos ------------------------------ */}
      <div className={onglet === "photos" ? "" : "hidden"}>
        <PhotosExpertPanel dossierId={dossier.id} onChange={onPhotos} />
      </div>

      {/* ---------------------------- Documents ----------------------------- */}
      <div className={onglet === "documents" ? "" : "hidden"}>
        <DocumentsExpertPanelSync
          dossierId={dossier.id}
          onDocuments={setDocuments}
          onUtiliserPourRapport={(doc, mode) => { setDemandeSource({ doc, mode, cle: Date.now() }); setOnglet("rapport"); }}
        />
      </div>

      {/* ------------------------------ Rapport ----------------------------- */}
      <div className={onglet === "rapport" ? "" : "hidden"}>
        <RapportEditeur
          dossier={dossier}
          cabinet={cabinet}
          garage={garage}
          photos={photos}
          documents={documents}
          demandeSource={demandeSource}
          onDossierChange={setDossier}
          onOperationExterne={enregistrerRecepteur}
        />
      </div>

      {/* ------------------------------ Pièces ------------------------------ */}
      <div className={onglet === "pieces" ? "" : "hidden"}>
        {nbPiecesEnvoyees > 0 && (
          <div className="alerte alerte-ok mb-3 flex items-center justify-between text-sm">
            <span>{nbPiecesEnvoyees} pièce(s) ajoutée(s) au chiffrage du rapport.</span>
            <button className="btn-ghost btn-compact" onClick={() => setOnglet("rapport")}>Voir le rapport →</button>
          </div>
        )}
        <PiecesRecherche
          dossier={dossier}
          onAjouterAuChiffrage={(op) => {
            if (recepteurOperation.current) { recepteurOperation.current(op); setNbPiecesEnvoyees((n) => n + 1); }
            else alert("Crée d'abord le rapport (onglet Rapport) pour y ajouter des pièces.");
          }}
        />
      </div>

      {edition && <DossierExpertForm initial={dossier} onClose={() => setEdition(false)} onSaved={(d) => { setDossier(d); setEdition(false); }} />}
    </div>
  );
}

/** Le panneau Documents expose sa liste à la fiche (onglet Rapport). */
function DocumentsExpertPanelSync({ dossierId, onDocuments, onUtiliserPourRapport }: { dossierId: string; onDocuments: (d: DocumentExpert[]) => void; onUtiliserPourRapport: (doc: DocumentExpert, mode: "devis" | "facture") => void }) {
  return <DocumentsExpertPanel dossierId={dossierId} onUtiliserPourRapport={onUtiliserPourRapport} onChange={onDocuments} />;
}
