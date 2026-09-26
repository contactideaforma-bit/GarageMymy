"use client";

/**
 * COURRIERS LA POSTE DU DOSSIER (v13.27)
 *
 * Envoie un PDF par La Poste (Maileva) sans sortir de la fiche : lettre
 * simple ou recommandé AR papier, au client, à l'assureur, à l'expert ou à
 * une autre adresse. Source du PDF : un courrier déjà rédigé dans l'appli
 * (recouvrement, litige) ou n'importe quel PDF de l'ordinateur / du téléphone.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CourrierRecouvrement, Dossier } from "@/lib/types";
import { EnvoiPostal, suiviActif } from "@/lib/envoisPostaux";
import { actualiserSuivi, fichierEnBase64 } from "@/lib/envoisPostauxClient";
import { cibleAssurance, cibleClient, cibleExpert } from "@/lib/recouvrement";
import { courrierRecouvrementPdfBase64, nomFichierCourrier } from "@/lib/pdf";
import { formatDate } from "@/lib/format";
import { usePliage } from "@/lib/pliage";
import ModalShell from "./ModalShell";
import FilePicker from "./FilePicker";
import EnvoiPostalModal from "./EnvoiPostalModal";
import EnvoisPostauxListe from "./EnvoisPostauxListe";

type Cible = "client" | "assurance" | "expert" | "autre";

export default function EnvoisPostauxDossier({ dossier }: { dossier: Dossier }) {
  const [envois, setEnvois] = useState<EnvoiPostal[]>([]);
  const [courriers, setCourriers] = useState<CourrierRecouvrement[]>([]);
  const [charge, setCharge] = useState(false);
  const [choix, setChoix] = useState(false);
  const [envoi, setEnvoi] = useState<Parameters<typeof EnvoiPostalModal>[0] | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const { plie, basculerPliage } = usePliage("dossier.envoisPostaux", true);

  const charger = useCallback(async () => {
    const [e, c] = await Promise.all([
      supabase.from("envois_postaux").select("*").eq("dossier_id", dossier.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("courriers_recouvrement").select("*").eq("dossier_id", dossier.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setEnvois((e.data as EnvoiPostal[]) || []);
    setCourriers((c.data as CourrierRecouvrement[]) || []);
    setCharge(true);
  }, [dossier.id]);
  useEffect(() => { charger(); }, [charger]);

  async function actualiser() {
    const ids = envois.filter((x) => suiviActif(x.statut)).map((x) => x.id);
    if (!ids.length) { await charger(); return; }
    setBusy(true);
    const r = await actualiserSuivi(ids);
    setBusy(false);
    if (r.error) setInfo(r.error);
    await charger();
  }

  const ouvrir = (p: Omit<Parameters<typeof EnvoiPostalModal>[0], "onClose" | "onEnvoye">, courrier?: CourrierRecouvrement) =>
    setEnvoi({
      ...p,
      dossierId: dossier.id,
      courrierId: courrier?.id || null,
      onClose: () => setEnvoi(null),
      onEnvoye: async (e) => {
        if (courrier && courrier.statut !== "envoye") {
          await supabase.from("courriers_recouvrement").update({ statut: "envoye", envoye_le: new Date().toISOString(), canal_envoi: e.type === "lrar" ? "lrar" : "courrier" }).eq("id", courrier.id);
          try {
            await supabase.from("relances").insert({ dossier_id: dossier.id, document_id: courrier.document_id, date_relance: new Date().toISOString().slice(0, 10), canal: "courrier", interlocuteur: courrier.destinataire === "tiers" ? "autre" : courrier.destinataire, notes: `${courrier.objet || "Courrier"} envoyé par La Poste (${e.type === "lrar" ? "recommandé AR" : "lettre simple"})` });
          } catch { /* journal facultatif */ }
        }
        setEnvoi(null);
        setInfo(e.type === "lrar" ? "Recommandé transmis à La Poste ✓ — le n° de suivi apparaîtra après impression." : "Lettre transmise à La Poste ✓");
        setTimeout(() => setInfo(null), 6000);
        charger();
      },
    });

  const enCours = envois.filter((x) => suiviActif(x.statut)).length;

  return (
    <section className="glass-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 sm:px-4 sm:py-2.5">
        <button onClick={basculerPliage} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={!plie}>
          <span className={`shrink-0 text-white/40 transition-transform ${plie ? "" : "rotate-90"}`} aria-hidden>▸</span>
          <h2 className="titre-bloc truncate">📮 Courriers La Poste{charge ? ` (${envois.length})` : ""}</h2>
        </button>
        {enCours > 0 && <span className="badge badge-warn">{enCours} en cours</span>}
        <div className="flex flex-1 justify-end gap-1">
          {!plie && <button onClick={actualiser} disabled={busy} className="btn-ghost btn-compact" title="Actualiser le suivi La Poste">{busy ? "…" : "↻"}</button>}
          <button onClick={() => setChoix(true)} className="btn-primary btn-compact">+ Envoyer un courrier</button>
        </div>
      </div>
      {!plie && (
        <div className="space-y-2 px-3 py-3 sm:px-4">
          {info && <p className="text-xs font-medium text-emerald-300">{info}</p>}
          {charge && envois.length === 0 && (
            <p className="text-sm text-white/45">Aucun courrier postal pour ce dossier. Envoie un PDF en lettre simple ou en recommandé AR : La Poste l&apos;imprime et le distribue, sans passer au bureau de poste.</p>
          )}
          <EnvoisPostauxListe envois={envois} />
        </div>
      )}

      {choix && (
        <ChoixSource
          dossier={dossier}
          courriers={courriers}
          onClose={() => setChoix(false)}
          onCourrier={(c) => {
            setChoix(false);
            ouvrir({
              titre: `Envoyer par La Poste — ${c.objet || "courrier"}`,
              getPdfBase64: () => courrierRecouvrementPdfBase64(c, dossier),
              nomFichier: nomFichierCourrier(c),
              objet: c.objet || "Courrier",
              destinataireNom: c.destinataire_nom || "",
              destinataireAdresse: c.destinataire_adresse || "",
              typeInitial: ["mise_en_demeure", "mise_en_demeure_retrait", "reclamation_assureur", "attribution_gage", "position_assureur"].includes(c.type) ? "lrar" : "simple",
            }, c);
          }}
          onFichier={(f, cible) => {
            setChoix(false);
            const t = cible === "client" ? cibleClient(dossier) : cible === "assurance" ? cibleAssurance(dossier) : cible === "expert" ? cibleExpert(dossier) : null;
            ouvrir({
              getPdfBase64: () => fichierEnBase64(f),
              nomFichier: f.name,
              objet: `${f.name.replace(/\.pdf$/i, "")} — dossier ${dossier.numero_sinistre || dossier.immatriculation || ""}`.trim(),
              destinataireNom: t?.nom || "",
              destinataireAdresse: t?.adresse || "",
            });
          }}
        />
      )}
      {envoi && <EnvoiPostalModal {...envoi} />}
    </section>
  );
}

function ChoixSource({ dossier, courriers, onClose, onCourrier, onFichier }: {
  dossier: Dossier;
  courriers: CourrierRecouvrement[];
  onClose: () => void;
  onCourrier: (c: CourrierRecouvrement) => void;
  onFichier: (f: File, cible: Cible) => void;
}) {
  const [fichier, setFichier] = useState<File | null>(null);
  const [cible, setCible] = useState<Cible>("client");
  const [erreur, setErreur] = useState<string | null>(null);
  const noms: Record<Cible, string> = {
    client: dossier.client_nom || "Client",
    assurance: dossier.assureur || "Assureur",
    expert: dossier.cabinet_expert || "Expert",
    autre: "Autre adresse",
  };
  return (
    <ModalShell title="Quel courrier envoyer ?" onClose={onClose} maxWidth="max-w-xl">
      {courriers.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/60">Courriers rédigés dans l&apos;appli</div>
          <ul className="space-y-1">
            {courriers.map((c) => (
              <li key={c.id}>
                <button onClick={() => onCourrier(c)} className="carte-liste w-full text-left text-sm hover:bg-white/10">
                  <span className="font-semibold text-white">{c.objet || c.type}</span>
                  <span className="text-white/55"> → {c.destinataire_nom || c.destinataire} · {formatDate(c.date_courrier)}</span>
                  {c.statut === "envoye" && <span className="badge badge-ok ml-1">déjà envoyé</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Ou un PDF de l&apos;appareil</div>
        <FilePicker value={fichier} onChange={(f) => { setErreur(null); setFichier(f); }} accept="application/pdf" label="Choisir le PDF" aide="PDF uniquement — glisse le fichier ici" avecPhoto={false} />
        <div>
          <label className="field-label text-[11px]">Destinataire</label>
          <div className="segment flex-wrap">
            {(Object.keys(noms) as Cible[]).map((k) => (
              <button key={k} type="button" onClick={() => setCible(k)} className={`segment-btn ${cible === k ? "actif" : ""}`}>{noms[k]}</button>
            ))}
          </div>
        </div>
        {erreur && <p className="text-xs text-rose-300">{erreur}</p>}
        <div className="flex justify-end">
          <button
            className="btn-primary btn-compact"
            disabled={!fichier}
            onClick={() => {
              if (!fichier) return;
              if (fichier.type && fichier.type !== "application/pdf") { setErreur("Seuls les PDF peuvent être envoyés."); return; }
              if (fichier.size > 10_000_000) { setErreur("PDF trop lourd (10 Mo maximum)."); return; }
              onFichier(fichier, cible);
            }}
          >
            Continuer →
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
