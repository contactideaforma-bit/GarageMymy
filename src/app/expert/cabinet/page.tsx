"use client";

// LE CABINET (v13.5) : coordonnées imprimées en tête des rapports, expert
// signataire, signature, numérotation.

import { useEffect, useRef, useState } from "react";
import SignaturePad from "@/components/SignaturePad";
import ModalShell from "@/components/ModalShell";
import { Bloc, Champ, EnTete, Erreur } from "@/components/expert/ui";
import { BUCKET_EXPERT, chargerCabinet, enregistrerCabinet, urlFichierExpert } from "@/lib/expertise/data";
import { Cabinet } from "@/lib/expertise/types";
import { deposerFichier } from "@/lib/storage";
import { messageErreur } from "@/lib/format";

export default function PageCabinet() {
  const [c, setC] = useState<Partial<Cabinet> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [padOuvert, setPadOuvert] = useState(false);
  const [trace, setTrace] = useState<string | null>(null);
  const fichierSig = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chargerCabinet().then(async (cab) => {
      setC(cab || {});
      if (cab?.signature_path) setSignatureUrl(await urlFichierExpert(cab.signature_path));
    });
  }, []);

  const set = (k: keyof Cabinet, v: unknown) => setC((p) => ({ ...(p || {}), [k]: v }));
  const txt = (k: keyof Cabinet, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className="field-input" value={(c?.[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} {...props} />
  );

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!c) return;
    setEnvoi(true); setErreur(null); setOk(false);
    try {
      const { owner_id: _o, ...reste } = c as Cabinet;
      await enregistrerCabinet(reste);
      setOk(true);
    } catch (err) { setErreur(messageErreur(err)); } finally { setEnvoi(false); }
  }

  async function enregistrerSignature(dataUrl: string) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const path = await deposerFichier(BUCKET_EXPERT, `expertise/cabinet/signature-${Date.now()}.png`, blob, { contentType: "image/png", upsert: true });
      await enregistrerCabinet({ signature_path: path });
      set("signature_path", path);
      setSignatureUrl(await urlFichierExpert(path));
      setPadOuvert(false);
    } catch (err) { setErreur(messageErreur(err, "Enregistrement de la signature impossible.")); }
  }

  if (!c) return <div className="skeleton h-40 rounded-2xl" />;

  return (
    <div className="space-y-4">
      <EnTete titre="Le cabinet" sousTitre="Ces informations figurent en tête de chaque procès-verbal d'expertise." />
      <form onSubmit={enregistrer} className="space-y-4">
        <Erreur message={erreur} />
        {ok && <div className="alerte alerte-ok text-sm">Enregistré.</div>}
        <Bloc titre="Coordonnées">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Champ label="Raison sociale" className="sm:col-span-2">{txt("nom")}</Champ>
            <Champ label="SIRET">{txt("siret")}</Champ>
            <Champ label="Adresse" className="sm:col-span-3">{txt("adresse")}</Champ>
            <Champ label="Code postal">{txt("code_postal")}</Champ>
            <Champ label="Ville" className="sm:col-span-2">{txt("ville")}</Champ>
            <Champ label="Téléphone">{txt("tel", { type: "tel" })}</Champ>
            <Champ label="Email" className="sm:col-span-2">{txt("email", { type: "email" })}</Champ>
          </div>
        </Bloc>
        <Bloc titre="Expert signataire">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Champ label="Nom de l'expert">{txt("expert_nom")}</Champ>
            <Champ label="N° d'agrément">{txt("expert_numero", { placeholder: "002931 -VE" })}</Champ>
            <Champ label="Taux de TVA par défaut (%)">
              <input type="number" step="0.1" className="field-input" value={c.taux_tva ?? 20} onChange={(e) => set("taux_tva", Number(e.target.value))} />
            </Champ>
            <Champ label="Prochain n° de rapport" aide="Incrémenté automatiquement à chaque mission (AE + 8 chiffres).">
              <input type="number" className="field-input" value={c.prochain_numero ?? 34915} onChange={(e) => set("prochain_numero", Number(e.target.value))} />
            </Champ>
          </div>
          <div className="mt-4">
            <div className="field-label">Signature (imprimée sous le nom de l&apos;expert)</div>
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
                <button type="button" className="btn-ghost btn-compact" onClick={() => setPadOuvert(true)}>✍️ Signer à l&apos;écran</button>
                <input ref={fichierSig} type="file" accept="image/png,image/jpeg" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => enregistrerSignature(String(r.result)); r.readAsDataURL(f); e.target.value = ""; }} />
                <button type="button" className="btn-ghost btn-compact" onClick={() => fichierSig.current?.click()}>📎 Importer une image</button>
              </div>
            </div>
          </div>
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
