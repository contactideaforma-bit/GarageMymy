"use client";

/* ====================================================================
 *  FICHE D'UN DOSSIER D'EXPERTISE (v13.5 → v13.23)
 *  Onglets : CONTRÔLE DU DEVIS (par défaut, v13.23) · Dossier · Documents ·
 *  Rapport · Photos · Pièces.
 *  Tous les onglets restent montés (cachés) : le rapport continue de
 *  s'enregistrer, une pièce retenue part directement dans le chiffrage,
 *  un devis déposé peut lancer la génération du rapport.
 * ==================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import Icone from "@/components/expert/Icone";
import { useParams, useRouter } from "next/navigation";
import DossierExpertForm from "@/components/expert/DossierExpertForm";
import PhotosExpertPanel from "@/components/expert/PhotosExpertPanel";
import DocumentsExpertPanel from "@/components/expert/DocumentsExpertPanel";
import RapportEditeur from "@/components/expert/RapportEditeur";
import ControleDevis from "@/components/expert/ControleDevis";
import PiecesRecherche from "@/components/expert/PiecesRecherche";
import RdvModal from "@/components/expert/RdvModal";
import { BadgeStatutExpert, Bloc, EnTete, Info } from "@/components/expert/ui";
import { chargerCabinet, chargerDossier, chargerGarages, chargerRdv, changerStatut, supprimerDossier } from "@/lib/expertise/data";
import { Cabinet, DocumentExpert, DossierExpert, GarageExpert, Operation, PhotoExpert, RdvExpert, STATUTS_EXPERTISE, agrementPour, labelTypeRdv } from "@/lib/expertise/types";
import { formatDate } from "@/lib/format";

type Onglet = "controle" | "dossier" | "photos" | "documents" | "rapport" | "pieces";
const ONGLETS: { code: Onglet; label: string }[] = [
  { code: "controle", label: "Contrôle du devis" },
  { code: "dossier", label: "Dossier" },
  { code: "documents", label: "Documents" },
  { code: "rapport", label: "Rapport" },
  { code: "photos", label: "Photos" },
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
  const [onglet, setOnglet] = useState<Onglet>("controle");
  const [versionDocs, setVersionDocs] = useState(0);
  const [versionRapport, setVersionRapport] = useState(0);
  const [demandeDevis, setDemandeDevis] = useState<{ doc: DocumentExpert; cle: number } | null>(null);
  // Lien direct vers un onglet : /expert/dossiers/<id>?onglet=dossier
  useEffect(() => {
    const o = new URLSearchParams(window.location.search).get("onglet");
    if (o && ONGLETS.some((x) => x.code === o)) setOnglet(o as Onglet);
  }, []);
  const [edition, setEdition] = useState(false);
  const [introuvable, setIntrouvable] = useState(false);
  const [demandeSource, setDemandeSource] = useState<{ doc: DocumentExpert; mode: "devis" | "facture"; cle: number; but?: "comparer" } | null>(null);
  const [nbPiecesEnvoyees, setNbPiecesEnvoyees] = useState(0);
  const [rdvs, setRdvs] = useState<RdvExpert[]>([]);
  const [rdvModal, setRdvModal] = useState<Partial<RdvExpert> | null | "nouveau">(null);
  const rechargerRdv = useCallback(() => { if (id) chargerRdv({ dossierId: id }).then(({ rdv }) => setRdvs(rdv)); }, [id]);
  useEffect(() => { rechargerRdv(); }, [rechargerRdv]);
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

      {/* ------------------------- Contrôle du devis (v13.23) ---------------- */}
      <div className={onglet === "controle" ? "" : "hidden"}>
        <ControleDevis
          dossier={dossier}
          cabinet={cabinet}
          garage={garage}
          documents={documents}
          onDocumentsChange={() => setVersionDocs((v) => v + 1)}
          onDossierChange={setDossier}
          onOuvrirRapport={() => { setDemandeSource(null); setVersionRapport((v) => v + 1); setOnglet("rapport"); }}
          demandeDevis={demandeDevis}
        />
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
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-white/45">Rendez-vous</span>
                <button className="btn-ghost btn-compact" onClick={() => setRdvModal("nouveau")}><Icone nom="calendrier" /> Planifier</button>
              </div>
              {rdvs.length === 0 ? (
                <p className="text-sm text-white/40">Aucun rendez-vous planifié.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {rdvs.map((r) => (
                    <li key={r.id} className={`flex items-center justify-between gap-2 ${r.statut === "annule" ? "opacity-50" : ""}`}>
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{r.date.split("-").reverse().join("/")}{r.heure ? ` ${r.heure.slice(0, 5)}` : ""}</span>
                        <span className="text-white/60"> · {labelTypeRdv(r.type)} · {r.lieu || "—"}</span>
                        {r.statut === "fait" && <span className="badge badge-ok ml-1">Effectué</span>}
                      </span>
                      <button className="btn-ghost btn-compact" onClick={() => setRdvModal(r)}>Modifier</button>
                    </li>
                  ))}
                </ul>
              )}
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
              {garage && (garage.agree || (garage.agrements && garage.agrements.length > 0)) && (() => {
                const a = agrementPour(garage, dossier.mandant_nom);
                return (
                  <div className="col-span-2">
                    <div className="text-[11px] uppercase tracking-wider text-white/45">Agrément</div>
                    {a ? (
                      <div className="text-sm">
                        <span className={`badge ${a.tarif_preferentiel ? "badge-ok" : "badge-info"}`}>Agréé {a.assurance}{a.tarif_preferentiel ? " · tarif préférentiel" : ""}</span>
                        {a.tarif_preferentiel && <span className="ml-2 text-white/70">T1 {a.taux_t1 ?? garage.taux_t1} · T2 {a.taux_t2 ?? garage.taux_t2} · peint. {a.taux_peinture ?? garage.taux_peinture} €/h{a.remise_pieces ? ` · pièces -${a.remise_pieces} %` : ""}</span>}
                        {a.conditions && <div className="text-xs text-white/55">{a.conditions}</div>}
                      </div>
                    ) : (
                      <div className="text-sm text-white/60">Agréé {(garage.agrements || []).map((x) => x.assurance).join(", ") || "(assurances non précisées)"} — pas d&apos;agrément pour {dossier.mandant_nom || "ce mandant"}.</div>
                    )}
                  </div>
                );
              })()}
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
              <div className="col-span-2 sm:col-span-4 text-sm text-white/75">{dossier.dommage_description || <span className="text-white/35">Aucune description — les photos et l&apos;analyse automatique peuvent la compléter.</span>}</div>
            </div>
          </Bloc>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <button className="btn-primary" onClick={() => setOnglet("controle")}><Icone nom="check" /> Contrôle du devis</button>
          <button className="btn-ghost" onClick={() => setOnglet("photos")}><Icone nom="photo" /> Photographier</button>
          <button className="btn-ghost" onClick={() => setOnglet("documents")}><Icone nom="trombone" /> Documents</button>
          <button className="btn-ghost" onClick={() => setOnglet("pieces")}><Icone nom="recherche" /> Pièces & prix</button>
          <button className="btn-ghost" onClick={() => setOnglet("rapport")}><Icone nom="rapport" /> Rapport d&apos;expertise</button>
        </div>
      </div>

      {/* ------------------------------ Photos ------------------------------ */}
      <div className={onglet === "photos" ? "" : "hidden"}>
        <PhotosExpertPanel dossierId={dossier.id} onChange={onPhotos} />
      </div>

      {/* ---------------------------- Documents ----------------------------- */}
      <div className={onglet === "documents" ? "" : "hidden"}>
        <DocumentsExpertPanelSync
          key={versionDocs}
          dossierId={dossier.id}
          onDocuments={setDocuments}
          onUtiliserPourRapport={(doc, mode) => { setDemandeSource({ doc, mode, cle: Date.now() }); setOnglet("rapport"); }}
          onComparer={(doc) => { setDemandeDevis({ doc, cle: Date.now() }); setOnglet("controle"); }}
        />
      </div>

      {/* ------------------------------ Rapport ----------------------------- */}
      <div className={onglet === "rapport" ? "" : "hidden"}>
        <RapportEditeur
          key={versionRapport}
          dossier={dossier}
          cabinet={cabinet}
          garage={garage}
          photos={photos}
          documents={documents}
          demandeSource={demandeSource}
          onDossierChange={setDossier}
          onOperationExterne={enregistrerRecepteur}
          onComparerDevis={() => setOnglet("controle")}
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

      {rdvModal && (
        <RdvModal
          dossier={dossier}
          initial={rdvModal === "nouveau" ? null : rdvModal}
          onClose={() => setRdvModal(null)}
          onSaved={async () => { setRdvModal(null); rechargerRdv(); const d = await chargerDossier(dossier.id); if (d) setDossier(d); }}
        />
      )}
      {edition && <DossierExpertForm initial={dossier} onClose={() => setEdition(false)} onSaved={(d) => { setDossier(d); setEdition(false); }} />}
    </div>
  );
}

/** Le panneau Documents expose sa liste à la fiche (onglet Rapport). */
function DocumentsExpertPanelSync({ dossierId, onDocuments, onUtiliserPourRapport, onComparer }: { dossierId: string; onDocuments: (d: DocumentExpert[]) => void; onUtiliserPourRapport: (doc: DocumentExpert, mode: "devis" | "facture") => void; onComparer: (doc: DocumentExpert) => void }) {
  return <DocumentsExpertPanel dossierId={dossierId} onUtiliserPourRapport={onUtiliserPourRapport} onComparer={onComparer} onChange={onDocuments} />;
}
