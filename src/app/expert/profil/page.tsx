"use client";

/* ====================================================================
 *  PROFIL EXPERT (v13.7) — l'expert connecté : nom, agrément, coordonnées,
 *  signature électronique. Le procès-verbal est signé à SON nom (à défaut,
 *  au nom de l'expert du cabinet). À terme : un compte par expert, tous
 *  partageant les dossiers du cabinet.
 * ==================================================================== */

import { useEffect, useRef, useState } from "react";
import ModalShell from "@/components/ModalShell";
import SignaturePad from "@/components/SignaturePad";
import Icone from "@/components/expert/Icone";
import { Bloc, Champ, EnTete, Erreur } from "@/components/expert/ui";
import { BUCKET_EXPERT, chargerProfilExpert, enregistrerProfilExpert, urlFichierExpert, dataUrlVersBlob } from "@/lib/expertise/data";
import { ProfilExpert } from "@/lib/expertise/types";
import { deposerFichier } from "@/lib/storage";
import { supabase } from "@/lib/supabaseClient";
import { messageErreur } from "@/lib/format";

export default function PageProfilExpert() {
  const [p, setP] = useState<Partial<ProfilExpert> | null>(null);
  const [emailCompte, setEmailCompte] = useState<string>("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [padOuvert, setPadOuvert] = useState(false);
  const [trace, setTrace] = useState<string | null>(null);
  const fichierSig = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmailCompte(data.user?.email || ""));
    chargerProfilExpert().then(async (prof) => {
      setP(prof || { fonction: "Expert automobile" });
      if (prof?.signature_path) setSignatureUrl(await urlFichierExpert(prof.signature_path));
    });
  }, []);

  const set = (k: keyof ProfilExpert, v: unknown) => setP((x) => ({ ...(x || {}), [k]: v }));
  const txt = (k: keyof ProfilExpert, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className="field-input" value={(p?.[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} {...props} />
  );

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!p) return;
    setEnvoi(true); setErreur(null); setOk(false);
    try {
      const { owner_id: _o, ...reste } = p as ProfilExpert;
      await enregistrerProfilExpert(reste);
      setOk(true);
    } catch (err) { setErreur(messageErreur(err, "Enregistrement impossible (migration v77 exécutée ?).")); } finally { setEnvoi(false); }
  }

  async function enregistrerSignature(dataUrl: string) {
    try {
      const blob = dataUrlVersBlob(dataUrl);
      const path = await deposerFichier(BUCKET_EXPERT, `expertise/experts/signature-${Date.now()}.png`, blob, { contentType: "image/png", upsert: true });
      await enregistrerProfilExpert({ ...(p as ProfilExpert), signature_path: path });
      set("signature_path", path);
      setSignatureUrl(await urlFichierExpert(path));
      setPadOuvert(false);
    } catch (err) { setErreur(messageErreur(err, "Enregistrement de la signature impossible.")); }
  }

  if (!p) return <div className="skeleton h-40 rounded-2xl" />;

  return (
    <div className="space-y-4">
      <EnTete titre="Profil expert" sousTitre="Identité et signature de l'expert connecté : chaque procès-verbal est émis et signé à son nom." />
      <form onSubmit={enregistrer} className="space-y-4">
        <Erreur message={erreur} />
        {ok && <div className="alerte alerte-ok text-sm">Profil enregistré.</div>}
        <Bloc titre="Identité">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Champ label="Prénom">{txt("prenom")}</Champ>
            <Champ label="Nom">{txt("nom", { placeholder: "ROUSSEL" })}</Champ>
            <Champ label="N° d'agrément" aide="Imprimé sous le nom sur le PV (ex. 002931 -VE).">{txt("numero_agrement")}</Champ>
            <Champ label="Fonction">{txt("fonction", { placeholder: "Expert automobile" })}</Champ>
            <Champ label="Téléphone direct">{txt("tel", { type: "tel" })}</Champ>
            <Champ label="Email professionnel">{txt("email", { type: "email", placeholder: emailCompte })}</Champ>
          </div>
          <p className="mt-3 text-[11px] text-white/45">Compte connecté : {emailCompte || "—"}. Les coordonnées du cabinet (en-tête du PV) se règlent dans « Le cabinet ».</p>
        </Bloc>
        <Bloc titre="Signature électronique">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-24 w-56 items-center justify-center rounded-xl border border-white/15 bg-white">
              {signatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signatureUrl} alt="Signature" className="max-h-20 max-w-full object-contain" />
              ) : (
                <span className="text-xs text-gray-400">Aucune signature</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" className="btn-ghost btn-compact" onClick={() => setPadOuvert(true)}><Icone nom="signature" /> Signer à l&apos;écran</button>
              <input ref={fichierSig} type="file" accept="image/png,image/jpeg" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => enregistrerSignature(String(r.result)); r.readAsDataURL(f); e.target.value = ""; }} />
              <button type="button" className="btn-ghost btn-compact" onClick={() => fichierSig.current?.click()}><Icone nom="trombone" /> Importer une image</button>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-white/45">La signature est apposée sous « EXPERT : » sur la première page du procès-verbal.</p>
        </Bloc>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={envoi}>{envoi ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </form>
      {padOuvert && (
        <ModalShell title="Signature de l'expert" onClose={() => setPadOuvert(false)}>
          <SignaturePad onChange={setTrace} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setPadOuvert(false)}>Annuler</button>
            <button type="button" className="btn-primary" disabled={!trace} onClick={() => trace && enregistrerSignature(trace)}>Enregistrer la signature</button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
