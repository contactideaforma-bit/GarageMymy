"use client";

/* ====================================================================
 *  RÉPONSE DU GARAGE À L'EXPERT — page PUBLIQUE (v13.25)
 *
 *  Un seul lien par demande : le garage répond à TOUS les points en une
 *  fois (« j'accepte la correction » / « je conteste » + explication +
 *  photos), puis envoie. Brouillon gardé sur l'appareil, récapitulatif
 *  et confirmation avant l'envoi ; après l'envoi, la réponse est figée.
 * ==================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useChartAlliance } from "@/components/expert/ExpertShell";

type Ecart = { id: string; libelle: string; precision: string | null; avant: string | null; apres: string | null; motif: string | null; montant_avant: number; montant_apres: number };
type Donnees = {
  type: "devis" | "facture";
  titre: string;
  document: string | null;
  dossier: { numero: string; immatriculation: string | null; vehicule: string | null; reparateur: string | null } | null;
  cabinet: { nom: string | null; tel: string | null; email: string | null; expert: string | null } | null;
  ouvert: boolean;
  statut: string;
  commentaire: string | null;
  demande_le: string | null;
  total_attendu: number | null;
  refuses: Ecart[];
  acceptes: Ecart[];
  reponse: { recu_le: string; contact: string | null; commentaire: string | null; lignes: { ecart_id: string; accord: boolean; commentaire: string | null; nb_photos: number }[] } | null;
};
type Ligne = { accord: boolean | null; commentaire: string; fichiers: File[] };

const eur = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

/** Photo réduite (1600 px, JPEG) : l'envoi reste léger, même en 4G. */
async function reduire(f: File): Promise<File> {
  if (!f.type.startsWith("image/") || f.size < 400_000) return f;
  try {
    const url = URL.createObjectURL(f);
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const r = Math.min(1, 1600 / Math.max(img.width, img.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
    cv.getContext("2d")?.drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/jpeg", 0.8));
    return blob ? new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch { return f; }
}

export default function PageReponseGarage() {
  useChartAlliance();
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lignes, setLignes] = useState<Record<string, Ligne>>({});
  const [contact, setContact] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [recap, setRecap] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState<{ accords: number; contestations: number } | null>(null);
  const cleBrouillon = `reponse-garage-${token}`;
  const charge = useRef(false);

  useEffect(() => {
    fetch(`/api/reponse-garage/${token}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => null); if (!r.ok) throw new Error(j?.error || "Lien invalide."); return j as Donnees; })
      .then((j) => {
        setD(j);
        const base: Record<string, Ligne> = Object.fromEntries(j.refuses.map((e) => [e.id, { accord: null, commentaire: "", fichiers: [] }]));
        // Brouillon (sans les fichiers) gardé sur l'appareil.
        try {
          const b = JSON.parse(localStorage.getItem(cleBrouillon) || "null");
          if (b?.lignes) for (const [k, v] of Object.entries(b.lignes as Record<string, { accord: boolean | null; commentaire: string }>)) if (base[k]) base[k] = { ...base[k], accord: v.accord, commentaire: v.commentaire || "" };
          if (b?.contact) setContact(b.contact);
          if (b?.commentaire) setCommentaire(b.commentaire);
        } catch { /* pas de brouillon */ }
        setLignes(base);
        charge.current = true;
      })
      .catch((e) => setErreur(e.message));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!charge.current || envoye) return;
    try { localStorage.setItem(cleBrouillon, JSON.stringify({ contact, commentaire, lignes: Object.fromEntries(Object.entries(lignes).map(([k, v]) => [k, { accord: v.accord, commentaire: v.commentaire }])) })); } catch { /* ignoré */ }
  }, [lignes, contact, commentaire, envoye, cleBrouillon]);

  const maj = (id: string, patch: Partial<Ligne>) => setLignes((l) => ({ ...l, [id]: { ...l[id], ...patch } }));
  const manquants = useMemo(() => (d ? d.refuses.filter((e) => { const l = lignes[e.id]; return !l || l.accord === null || (l.accord === false && !l.commentaire.trim()); }) : []), [d, lignes]);
  const nbAccords = Object.values(lignes).filter((l) => l.accord === true).length;
  const poids = Object.values(lignes).reduce((s, l) => s + l.fichiers.reduce((a, f) => a + f.size, 0), 0);

  async function envoyer() {
    if (!d) return;
    setEnvoi(true); setErreur(null);
    try {
      const form = new FormData();
      form.append("reponse", JSON.stringify({ contact, commentaire, lignes: d.refuses.map((e) => ({ ecart_id: e.id, accord: lignes[e.id].accord, commentaire: lignes[e.id].commentaire })) }));
      for (const e of d.refuses) for (const f of lignes[e.id].fichiers) form.append(`fichiers_${e.id}`, f);
      const r = await fetch(`/api/reponse-garage/${token}`, { method: "POST", body: form });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "Envoi impossible.");
      setEnvoye({ accords: j.accords, contestations: j.contestations });
      try { localStorage.removeItem(cleBrouillon); } catch { /* ignoré */ }
      setRecap(false);
    } catch (e) { setErreur(e instanceof Error ? e.message : "Envoi impossible."); } finally { setEnvoi(false); }
  }

  const cadre = (children: React.ReactNode) => (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300 pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/alliance/logo.png" alt="Alliance Experts" className="h-12 w-auto" />
          <div className="text-right text-xs text-gray-600">
            {d?.cabinet?.nom && <div className="font-semibold text-gray-900">{d.cabinet.nom}</div>}
            {d?.cabinet?.tel && <div>{d.cabinet.tel}</div>}
            {d?.cabinet?.email && <div>{d.cabinet.email}</div>}
          </div>
        </header>
        {children}
      </div>
    </div>
  );

  if (erreur && !d) return cadre(<div className="rounded-xl border-2 border-black p-6 text-center">{erreur}</div>);
  if (!d) return cadre(<p className="py-10 text-center text-gray-500">Chargement de la demande…</p>);

  const entete = (
    <div className="rounded-xl border-2 border-black p-4">
      <h1 className="text-lg font-bold">{d.titre}</h1>
      <div className="mt-1 text-sm text-gray-700">
        Dossier <b>{d.dossier?.numero}</b>{d.dossier?.immatriculation ? ` · ${d.dossier.immatriculation}` : ""}{d.dossier?.vehicule ? ` · ${d.dossier.vehicule}` : ""}
        {d.document && <> · {d.type === "facture" ? "facture" : "devis"} « {d.document} »</>}
        {d.demande_le && <> · demande du {date(d.demande_le)}</>}
      </div>
      {d.total_attendu !== null && <div className="mt-2 text-sm">Montant HT attendu par l&apos;expert : <b>{eur(d.total_attendu)}</b></div>}
      {d.commentaire && <p className="mt-2 text-sm text-gray-700">« {d.commentaire} »</p>}
    </div>
  );

  // Réponse déjà envoyée (ou envoyée à l'instant) : figée.
  if (envoye || d.reponse) {
    const rep = d.reponse;
    return cadre(
      <>
        {entete}
        <div className="rounded-xl border-2 border-black p-5">
          <div className="text-lg font-bold">✓ Réponse envoyée à l&apos;expert</div>
          <p className="mt-1 text-sm text-gray-700">
            {envoye ? `${envoye.accords} accord(s), ${envoye.contestations} contestation(s).` : `Reçue le ${date(rep!.recu_le)}${rep!.contact ? ` (${rep!.contact})` : ""}.`} L&apos;expert l&apos;examine et reviendra vers vous. Pour la modifier, contactez le cabinet.
          </p>
          {rep && (
            <ul className="mt-3 space-y-1 text-sm">
              {d.refuses.map((e) => { const l = rep.lignes.find((x) => x.ecart_id === e.id); return <li key={e.id}><b>{e.libelle}</b> : {l?.accord ? "accord" : `contesté${l?.commentaire ? ` — ${l.commentaire}` : ""}`}{l?.nb_photos ? ` (${l.nb_photos} pièce(s) jointe(s))` : ""}</li>; })}
            </ul>
          )}
        </div>
      </>
    );
  }

  if (!d.ouvert) {
    return cadre(<>{entete}<div className="rounded-xl border-2 border-black p-5 text-sm">Cette demande a été traitée par l&apos;expert : aucune réponse n&apos;est attendue. Pour toute question, contactez le cabinet.</div></>);
  }

  return cadre(
    <>
      {entete}
      <p className="text-sm text-gray-700">
        Pour <b>chaque point</b> ci-dessous, indiquez si vous acceptez la correction de l&apos;expert ou si vous la contestez (explication obligatoire, photos conseillées). <b>Une seule réponse</b> regroupe tous les points ; votre saisie est gardée sur cet appareil tant que vous n&apos;avez pas envoyé.
      </p>

      <div className="space-y-3">
        {d.refuses.map((e, i) => {
          const l = lignes[e.id];
          if (!l) return null;
          return (
            <div key={e.id} className={`rounded-xl border-2 p-4 ${l.accord === true ? "border-emerald-600" : l.accord === false ? "border-amber-600" : "border-gray-300"}`}>
              <div className="font-semibold">{i + 1}. {e.libelle}</div>
              {e.precision && <div className="text-xs text-gray-600">{e.precision}</div>}
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-gray-300 p-2"><div className="text-[11px] uppercase text-gray-500">Votre {d.type === "facture" ? "facture" : "devis"}</div><div className="font-medium">{e.apres || "ligne absente"}</div><div className="text-xs text-gray-500">{eur(e.montant_apres)} HT</div></div>
                <div className="rounded-lg border-2 border-black p-2"><div className="text-[11px] uppercase text-gray-500">Retenu par l&apos;expert</div><div className="font-semibold">{e.avant || "ligne non retenue"}</div><div className="text-xs text-gray-500">{eur(e.montant_avant)} HT</div></div>
              </div>
              {e.motif && <div className="mt-1 text-xs text-gray-700">Motif de l&apos;expert : {e.motif}</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => maj(e.id, { accord: true })} className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold ${l.accord === true ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-gray-300"}`}>✓ J&apos;accepte la correction</button>
                <button type="button" onClick={() => maj(e.id, { accord: false })} className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold ${l.accord === false ? "border-amber-700 bg-amber-50 text-amber-900" : "border-gray-300"}`}>Je conteste</button>
              </div>
              {l.accord === false && (
                <div className="mt-3 space-y-2">
                  <textarea className="w-full rounded-lg border-2 border-gray-300 p-2 text-sm" rows={3} placeholder="Expliquez pourquoi (obligatoire) : dommage découvert au démontage, référence constructeur, temps barème…" value={l.commentaire} onChange={(ev) => maj(e.id, { commentaire: ev.target.value })} />
                  <label className="block text-sm">
                    <span className="font-medium">Photos / documents (5 maximum)</span>
                    <input type="file" multiple accept="image/*,application/pdf" className="mt-1 block text-sm" onChange={async (ev) => { const f = Array.from(ev.target.files || []).slice(0, 5); maj(e.id, { fichiers: await Promise.all(f.map(reduire)) }); }} />
                  </label>
                  {l.fichiers.length > 0 && <div className="text-xs text-gray-600">{l.fichiers.length} fichier(s) prêt(s) · {(l.fichiers.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(1)} Mo</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {d.acceptes.length > 0 && (
        <div className="rounded-xl border border-gray-300 p-4 text-sm">
          <div className="font-semibold">Modifications de votre {d.type === "facture" ? "facture" : "devis"} déjà acceptées par l&apos;expert</div>
          <ul className="mt-1 list-disc pl-5 text-gray-700">{d.acceptes.map((e) => <li key={e.id}>{e.libelle} : {e.apres || "ligne retirée"}</li>)}</ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm"><span className="font-medium">Votre nom</span><input className="mt-1 w-full rounded-lg border-2 border-gray-300 p-2" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Nom et fonction" /></label>
        <label className="text-sm sm:col-span-2"><span className="font-medium">Message à l&apos;expert (facultatif)</span><textarea className="mt-1 w-full rounded-lg border-2 border-gray-300 p-2" rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} /></label>
      </div>

      {erreur && <div className="rounded-lg border-2 border-black bg-white p-3 text-sm font-medium">{erreur}</div>}
      {poids > 4 * 1024 * 1024 && <div className="rounded-lg border-2 border-black p-3 text-sm">Les pièces jointes dépassent 4 Mo : retirez-en quelques-unes.</div>}

      <div className="sticky bottom-0 -mx-4 border-t border-gray-300 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-gray-700">{manquants.length ? `${manquants.length} point(s) sans réponse complète` : `Prêt : ${nbAccords} accord(s), ${d.refuses.length - nbAccords} contestation(s)`}</span>
          <button type="button" disabled={manquants.length > 0 || poids > 4 * 1024 * 1024} onClick={() => setRecap(true)} className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Vérifier et envoyer</button>
        </div>
      </div>

      {recap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border-2 border-black bg-white p-5">
            <div className="text-lg font-bold">Votre réponse</div>
            <ul className="mt-2 space-y-1 text-sm">
              {d.refuses.map((e) => { const l = lignes[e.id]; return <li key={e.id}><b>{e.libelle}</b> : {l.accord ? "j'accepte" : `je conteste — ${l.commentaire}`}{l.fichiers.length ? ` (${l.fichiers.length} pièce(s))` : ""}</li>; })}
            </ul>
            <p className="mt-3 text-xs text-gray-600">Une fois envoyée, la réponse ne peut plus être modifiée en ligne.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border-2 border-gray-300 px-3 py-2 text-sm" disabled={envoi} onClick={() => setRecap(false)}>Modifier</button>
              <button type="button" className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white" disabled={envoi} onClick={envoyer}>{envoi ? "Envoi…" : "Envoyer à l'expert"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
