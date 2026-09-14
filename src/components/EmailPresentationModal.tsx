"use client";

// EMAILS PROSPECT (v12.8) — modale commune au commercial et à l'éditeur.
// Deux modèles : PRÉSENTATION (après l'appel) et CONFIRMATION DE RENDEZ-VOUS.
// Réglages à gauche de l'esprit, APERÇU du vrai email, envoi via
// /api/send-email (boîte de l'utilisateur connecté, journalisé côté serveur).
// Le téléphone de l'expéditeur est mémorisé sur l'appareil : c'est LUI qui
// s'affiche en grand dans l'email (« appelez-moi »).

import { useEffect, useMemo, useState } from "react";
import ModalShell from "@/components/ModalShell";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import { messageErreur } from "@/lib/format";
import { Formule, Parametres, grilleTarifs } from "@/lib/admin/economie";
import { SOCIETE } from "@/components/vitrine/societe";
import {
  LIEUX_RDV, LieuRdv,
  emailConfirmationRdvHtml, emailConfirmationRdvTexte, emailPresentationHtml, emailPresentationTexte,
  messageConfirmationDefaut, messagePresentationDefaut, sujetConfirmationRdv, sujetPresentation,
} from "@/lib/emailPresentation";

export type TypeEmailProspect = "presentation" | "rdv";

function Champ({ label, value, onChange, type = "text", placeholder, obligatoire }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; obligatoire?: boolean }) {
  return (
    <div>
      <label className="field-label">{label}{obligatoire ? " *" : ""}</label>
      <input className="field-input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const CLE_COORD = "mea.presentation.coordonnees"; // tél. + email de l'expéditeur, mémorisés sur l'appareil

export default function EmailPresentationModal({
  parametres,
  commercialNom,
  codeApporteur,
  type: typeInitial = "presentation",
  garageNom: garageNomInitial = "",
  contactNom: contactNomInitial = "",
  email: emailInitial = "",
  onClose,
  onSent,
}: {
  parametres: Parametres;
  commercialNom: string;
  codeApporteur?: string | null;
  type?: TypeEmailProspect;
  garageNom?: string;
  contactNom?: string;
  email?: string;
  onClose: () => void;
  onSent?: (infos: { type: TypeEmailProspect; to: string; date?: string; heure?: string }) => void;
}) {
  const [type, setType] = useState<TypeEmailProspect>(typeInitial);
  const [garageNom, setGarageNom] = useState(garageNomInitial);
  const [contactNom, setContactNom] = useState(contactNomInitial);
  const [to, setTo] = useState(emailInitial);
  const [sujet, setSujet] = useState("");
  const [message, setMessage] = useState("");
  const [sujetTouche, setSujetTouche] = useState(false);
  const [messageTouche, setMessageTouche] = useState(false);
  const [formule, setFormule] = useState<Formule | "">("confort");
  // rendez-vous
  const [date, setDate] = useState("");
  const [heure, setHeure] = useState("10:00");
  const [duree, setDuree] = useState("20");
  const [lieu, setLieu] = useState<LieuRdv>("atelier");
  const [adresse, setAdresse] = useState("");
  const [lienVisio, setLienVisio] = useState("");
  // expéditeur
  const [tel, setTel] = useState("");
  const [emailExp, setEmailExp] = useState("");
  const [vue, setVue] = useState<"reglages" | "apercu">("reglages");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLE_COORD);
      if (raw) { const c = JSON.parse(raw); setTel(c.tel || ""); setEmailExp(c.email || ""); }
    } catch { /* stockage indisponible : on continue sans */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(CLE_COORD, JSON.stringify({ tel, email: emailExp })); } catch { /* idem */ }
  }, [tel, emailExp]);

  // Sujet et message suivent le modèle, le garage et le rendez-vous tant qu'on ne les a pas retouchés.
  useEffect(() => {
    const g = garageNom || "votre carrosserie";
    if (!sujetTouche) setSujet(type === "rdv" ? sujetConfirmationRdv(g, date || "…", heure || "…") : sujetPresentation(g));
    if (!messageTouche) setMessage(type === "rdv" ? messageConfirmationDefaut() : messagePresentationDefaut(contactNom || null));
  }, [type, garageNom, contactNom, date, heure, sujetTouche, messageTouche]);
  // Changer de modèle remet les textes par défaut de ce modèle.
  function changerType(t: TypeEmailProspect) { setType(t); setSujetTouche(false); setMessageTouche(false); setErreur(null); }

  const tarifs = useMemo(() => grilleTarifs(parametres), [parametres]);
  const expediteur = useMemo(() => ({ nom: commercialNom, tel: tel || null, email: emailExp || null, codeApporteur: codeApporteur || null }), [commercialNom, tel, emailExp, codeApporteur]);
  const rdvComplet = Boolean(date && heure);

  const { html, texte } = useMemo(() => {
    const g = garageNom || "votre carrosserie";
    if (type === "rdv") {
      const b = { garageNom: g, contactNom: contactNom || null, date: date || new Date().toISOString().slice(0, 10), heure: heure || "10:00", dureeMin: Number(duree) || 20, lieu, adresse: adresse || null, lienVisio: lienVisio || null, messagePerso: message, expediteur };
      return { html: emailConfirmationRdvHtml(b), texte: emailConfirmationRdvTexte(b) };
    }
    const b = { garageNom: g, contactNom: contactNom || null, messagePerso: message, formuleSuggeree: formule || null, tarifs, expediteur };
    return { html: emailPresentationHtml(b), texte: emailPresentationTexte(b) };
  }, [type, garageNom, contactNom, date, heure, duree, lieu, adresse, lienVisio, message, formule, tarifs, expediteur]);

  async function envoyer() {
    setErreur(null);
    if (!to.trim()) { setErreur("Indique l'adresse email du garage."); return; }
    if (type === "rdv" && !rdvComplet) { setErreur("Indique la date et l'heure du rendez-vous."); return; }
    if (!tel.trim() && !confirm("Aucun téléphone renseigné : l'email demandera au garage de répondre par écrit plutôt que d'appeler. Envoyer quand même ?")) return;
    setEnvoi(true);
    try {
      const res = await fetchAuth("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject: sujet.trim(), html, text: texte, replyTo: emailExp.trim() || undefined }),
      });
      const r = await lireReponse<{ ok: boolean }>(res);
      if (!r.ok) throw new Error(r.error || "Envoi refusé.");
      setOk(true);
      onSent?.({ type, to: to.trim(), date: type === "rdv" ? date : undefined, heure: type === "rdv" ? heure : undefined });
    } catch (e) {
      setErreur(messageErreur(e, "L'email n'est pas parti."));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <ModalShell title={type === "rdv" ? "Confirmation de rendez-vous" : "Email de présentation"} onClose={onClose} maxWidth="max-w-3xl">
      {ok ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
            {type === "rdv" ? `Confirmation envoyée à ${to}. La fiche passe en « RDV pris » avec un rappel à la date du rendez-vous.` : `Email envoyé à ${to}. Pense à programmer un rappel pour relancer dans quelques jours.`}
          </p>
          <div className="flex justify-end"><button className="btn-primary" onClick={onClose}>Fermer</button></div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="segment">
              <button className={`segment-btn ${type === "presentation" ? "actif" : ""}`} onClick={() => changerType("presentation")}>Présentation</button>
              <button className={`segment-btn ${type === "rdv" ? "actif" : ""}`} onClick={() => changerType("rdv")}>Confirmation de RDV</button>
            </div>
            <div className="segment">
              <button className={`segment-btn ${vue === "reglages" ? "actif" : ""}`} onClick={() => setVue("reglages")}>Réglages</button>
              <button className={`segment-btn ${vue === "apercu" ? "actif" : ""}`} onClick={() => setVue("apercu")}>Aperçu</button>
            </div>
          </div>

          {vue === "reglages" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ label="Garage" value={garageNom} onChange={setGarageNom} placeholder="Carrosserie Dupont" />
                <Champ label="Prénom / nom du contact" value={contactNom} onChange={setContactNom} placeholder="M. Dupont" />
              </div>
              <Champ label="Email du garage (destinataire)" value={to} onChange={setTo} type="email" placeholder="contact@carrosserie.fr" obligatoire />

              {type === "rdv" && (
                <div className="rounded-xl border border-white/15 p-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Champ label="Date" value={date} onChange={setDate} type="date" obligatoire />
                    <Champ label="Heure" value={heure} onChange={setHeure} type="time" obligatoire />
                    <Champ label="Durée (minutes)" value={duree} onChange={setDuree} type="number" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="field-label">Où</label>
                      <select className="field-input" value={lieu} onChange={(e) => setLieu(e.target.value as LieuRdv)}>
                        {(Object.keys(LIEUX_RDV) as LieuRdv[]).map((l) => <option key={l} value={l}>{LIEUX_RDV[l]}</option>)}
                      </select>
                    </div>
                    {lieu === "atelier" && <Champ label="Adresse de l'atelier (facultatif)" value={adresse} onChange={setAdresse} placeholder="12 rue des Forges, 13000 Marseille" />}
                    {lieu === "visio" && <Champ label="Lien de visio (facultatif)" value={lienVisio} onChange={setLienVisio} placeholder="https://meet.google.com/…" />}
                  </div>
                </div>
              )}

              <Champ label="Objet" value={sujet} onChange={(v) => { setSujet(v); setSujetTouche(true); }} />
              <div>
                <label className="field-label">Votre message (en tête de l&apos;email)</label>
                <textarea className="field-input min-h-[90px]" value={message} onChange={(e) => { setMessage(e.target.value); setMessageTouche(true); }} />
                <p className="mt-1 text-xs text-white/40">Deux ou trois phrases suffisent : l&apos;échange a déjà eu lieu, l&apos;email ne fait que le prolonger.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {type === "presentation" && (
                  <div>
                    <label className="field-label">Formule conseillée</label>
                    <select className="field-input" value={formule} onChange={(e) => setFormule(e.target.value as Formule | "")}>
                      <option value="">Aucune mise en avant</option>
                      {tarifs.map((t) => <option key={t.formule} value={t.formule}>{t.libelle}{t.heures ? ` — ${t.heures} h` : ""}</option>)}
                    </select>
                  </div>
                )}
                <Champ label="Votre téléphone (affiché en grand)" value={tel} onChange={setTel} type="tel" placeholder="06 …" obligatoire />
                <Champ label="Votre email (réponses)" value={emailExp} onChange={setEmailExp} type="email" placeholder={SOCIETE.email} />
              </div>
              <p className="text-xs text-white/40">
                L&apos;email part depuis votre boîte configurée (Profil → Envoi des emails) et est journalisé. Logo et vignette vidéo sont chargés depuis myeasyauto.fr, rien en pièce jointe.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/15 bg-white">
              <iframe title="Aperçu de l'email" srcDoc={html} className="h-[70vh] w-full" sandbox="" />
            </div>
          )}

          {erreur && <p className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{erreur}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-white/40">Expéditeur : {commercialNom}{codeApporteur ? ` · code ${codeApporteur}` : ""}</span>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={onClose} disabled={envoi}>Annuler</button>
              {vue === "reglages" && <button className="btn-ghost" onClick={() => setVue("apercu")}>Voir l&apos;aperçu</button>}
              <button className="btn-primary" onClick={envoyer} disabled={envoi}>{envoi ? "Envoi…" : "Envoyer l'email"}</button>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
