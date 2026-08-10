"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Entreprise } from "@/lib/types";
import ConfigBanner from "@/components/ConfigBanner";
import SignaturePad from "@/components/SignaturePad";
import FilePicker from "@/components/FilePicker";
import MailSettings from "@/components/MailSettings";
import CompteSettings from "@/components/CompteSettings";
import ConsommationIA from "@/components/ConsommationIA";
import { useMetier } from "@/components/MetierProvider";
import { METIER_INFOS } from "@/lib/metier";
import { MODELES_PDF, COULEURS_PDF, MODELE_PDF_DEFAUT, COULEUR_PDF_DEFAUT } from "@/lib/pdfTheme";

type FormE = Omit<Entreprise, "id" | "created_at">;

const EMPTY: FormE = {
  nom: "", adresse: "", code_postal: "", ville: "", tel: "", email: "",
  siret: "", tva_intra: "", iban: "", bic: "", mentions: "",
  logo_path: null, modele_facture_path: null,
  signature_mail: "", rib_path: null, signature_path: null,
  modele_pdf: MODELE_PDF_DEFAUT, couleur_pdf: COULEUR_PDF_DEFAUT,
};

function Field({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input className="field-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function ProfilPage() {
  const { metier } = useMetier();
  const [id, setId] = useState<string | null>(null);
  const [form, setForm] = useState<FormE>(EMPTY);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [modeleFile, setModeleFile] = useState<File | null>(null);
  const [ribFile, setRibFile] = useState<File | null>(null);
  // Signature du garage : soit un fichier importé, soit un tracé à l'écran.
  const [signatureFichier, setSignatureFichier] = useState<File | null>(null);
  const [signatureTrace, setSignatureTrace] = useState<string | null>(null);
  const [signatureApercu, setSignatureApercu] = useState<string | null>(null);
  const [tracer, setTracer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("entreprise").select("*").limit(1).maybeSingle();
      if (data) {
        const e = data as Entreprise;
        setId(e.id);
        setForm({
          nom: e.nom ?? "", adresse: e.adresse ?? "", code_postal: e.code_postal ?? "",
          ville: e.ville ?? "", tel: e.tel ?? "", email: e.email ?? "",
          siret: e.siret ?? "", tva_intra: e.tva_intra ?? "", iban: e.iban ?? "",
          bic: e.bic ?? "", mentions: e.mentions ?? "",
          logo_path: e.logo_path, modele_facture_path: e.modele_facture_path,
          signature_mail: e.signature_mail ?? "", rib_path: e.rib_path ?? null,
          signature_path: e.signature_path ?? null,
          modele_pdf: e.modele_pdf ?? MODELE_PDF_DEFAUT,
          couleur_pdf: e.couleur_pdf ?? COULEUR_PDF_DEFAUT,
        });
        // Aperçu de la signature enregistrée (lien signé, bucket privé).
        if (e.signature_path) chargerApercuSignature(e.signature_path);
      }
      setLoading(false);
    })();
  }, []);

  const set = (k: keyof FormE, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // bucket 'entreprise' = public (logo, modèle) ; 'prive' = RIB & docs
  // sensibles (v33) — jamais accessibles par simple URL.
  async function upload(file: File, prefix: string, bucket: "entreprise" | "prive" = "entreprise"): Promise<string> {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${prefix}_${Date.now()}_${safe}`;
    const { error: e } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (e) throw e;
    return path;
  }

  // Ouvre le RIB : lien signé 5 min sur le bucket privé, repli sur l'ancien
  // emplacement public pour les RIB uploadés avant la v33.
  async function voirRib() {
    if (!form.rib_path) return;
    const { data } = await supabase.storage.from("prive").createSignedUrl(form.rib_path, 300);
    const url =
      data?.signedUrl ||
      supabase.storage.from("entreprise").getPublicUrl(form.rib_path).data.publicUrl;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // Signature du garage : tracée à l'écran ou importée (v7.6).
  async function chargerApercuSignature(path: string | null | undefined) {
    if (!path) { setSignatureApercu(null); return; }
    const { data } = await supabase.storage.from("prive").createSignedUrl(path, 600);
    setSignatureApercu(data?.signedUrl || null);
  }

  // Convertit le tracé (dataURL PNG) en fichier prêt à téléverser.
  function dataUrlVersFichier(dataUrl: string): File {
    const [entete, base64] = dataUrl.split(",");
    const type = /:(.*?);/.exec(entete)?.[1] || "image/png";
    const bin = atob(base64);
    const octets = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) octets[i] = bin.charCodeAt(i);
    return new File([octets], "signature.png", { type });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      let logo_path = form.logo_path;
      let modele_facture_path = form.modele_facture_path;
      let rib_path = form.rib_path;
      let signature_path = form.signature_path;
      if (logoFile) logo_path = await upload(logoFile, "logo");
      if (modeleFile) modele_facture_path = await upload(modeleFile, "modele");
      if (ribFile) rib_path = await upload(ribFile, "rib", "prive");
      // Signature : bucket PRIVÉ, jamais accessible par simple URL.
      if (signatureFichier) signature_path = await upload(signatureFichier, "signature", "prive");
      else if (signatureTrace) {
        signature_path = await upload(dataUrlVersFichier(signatureTrace), "signature", "prive");
      }

      const payload = { ...form, logo_path, modele_facture_path, rib_path, signature_path };

      if (id) {
        const { error: e } = await supabase.from("entreprise").update(payload).eq("id", id);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.from("entreprise").insert(payload).select("id").single();
        if (e) throw e;
        setId(data!.id);
      }
      setForm((f) => ({ ...f, logo_path, modele_facture_path, rib_path, signature_path }));
      setLogoFile(null);
      setModeleFile(null);
      setRibFile(null);
      setSignatureFichier(null);
      setSignatureTrace(null);
      setTracer(false);
      await chargerApercuSignature(signature_path);
      setMsg("✓ Profil enregistré. Les devis et factures utiliseront ces informations.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  const logoUrl = form.logo_path
    ? supabase.storage.from("entreprise").getPublicUrl(form.logo_path).data.publicUrl
    : null;
  const modeleUrl = form.modele_facture_path
    ? supabase.storage.from("entreprise").getPublicUrl(form.modele_facture_path).data.publicUrl
    : null;

  if (loading) return <p className="text-white/40">Chargement…</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="titre-page mb-2">Profil du garage</h1>
      <p className="text-white/60 mb-6">
        Ces informations apparaissent en en-tête et pied de page de tes devis et factures.
      </p>
      <ConfigBanner />

      <div className="glass-card p-6 space-y-6">
        <section>
          <h2 className="text-sm font-semibold text-accent-pink mb-3">Type de compte</h2>
          <div className="glass-soft p-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-pixel text-[0.7rem] text-white">{METIER_INFOS[metier].label}</div>
              <div className="mt-1 text-xs text-white/50">{METIER_INFOS[metier].accroche}</div>
            </div>
            <span className="shrink-0 rounded-full border border-accent-teal/40 px-3 py-1 text-xs text-accent-teal">
              Compte {METIER_INFOS[metier].label.toLowerCase()}
            </span>
          </div>
          <p className="text-xs text-white/40 mt-2">
            Défini à la création du compte et non modifiable ici. Un compte carrosserie et un
            compte vitrage sont totalement séparés. Pour changer, contacte l&apos;administrateur.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-accent-pink mb-3">Identité</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nom du garage" value={form.nom ?? ""} onChange={(v) => set("nom", v)} />
            <Field label="Téléphone" value={form.tel ?? ""} onChange={(v) => set("tel", v)} />
            <Field label="Email" value={form.email ?? ""} onChange={(v) => set("email", v)} />
            <Field label="Adresse" value={form.adresse ?? ""} onChange={(v) => set("adresse", v)} />
            <Field label="Code postal" value={form.code_postal ?? ""} onChange={(v) => set("code_postal", v)} />
            <Field label="Ville" value={form.ville ?? ""} onChange={(v) => set("ville", v)} />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-accent-pink mb-3">Informations légales & bancaires</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="SIRET" value={form.siret ?? ""} onChange={(v) => set("siret", v)} />
            <Field label="N° TVA intracommunautaire" value={form.tva_intra ?? ""} onChange={(v) => set("tva_intra", v)} />
            <Field label="IBAN" value={form.iban ?? ""} onChange={(v) => set("iban", v)} />
            <Field label="BIC" value={form.bic ?? ""} onChange={(v) => set("bic", v)} />
          </div>
          <div className="mt-4">
            <label className="field-label">Mentions (conditions de paiement, garantie…)</label>
            <textarea className="field-input" rows={2} value={form.mentions ?? ""} onChange={(e) => set("mentions", e.target.value)} />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-accent-pink mb-3">Logo & modèle</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass-soft p-4">
              <label className="field-label">Logo (PNG/JPEG) — affiché sur les PDF</label>
              <input type="file" accept="image/png,image/jpeg" onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                className="text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white" />
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="logo" className="mt-3 h-16 object-contain bg-white/10 rounded p-1" />
              )}
            </div>
            <div className="glass-soft p-4">
              <label className="field-label">Facture type (PDF) — référence de mise en page</label>
              <input type="file" accept="application/pdf" onChange={(e) => setModeleFile(e.target.files?.[0] || null)}
                className="text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white" />
              {modeleUrl && (
                <a href={modeleUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-accent-teal hover:underline">
                  Voir le modèle enregistré
                </a>
              )}
              <p className="text-xs text-white/40 mt-2">
                Stocké comme référence. Les PDF sont générés à ta charte (logo + infos ci-dessus).
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-accent-pink mb-3">Apparence des factures & documents PDF</h2>
          <p className="text-xs text-white/50 mb-3">
            Choisis le modèle et la couleur de tes PDF (devis, factures, ordres, cession…).
            Quel que soit le modèle, la facture reste conforme : toutes les mentions
            obligatoires (échéance, pénalités de retard, indemnité de recouvrement,
            escompte, SIRET, TVA…) sont toujours imprimées.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {MODELES_PDF.map((m) => {
              const actif = (form.modele_pdf ?? MODELE_PDF_DEFAUT) === m.code;
              const c = form.couleur_pdf ?? COULEUR_PDF_DEFAUT;
              return (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => set("modele_pdf", m.code)}
                  className={`glass-soft p-3 text-left transition ${actif ? "ring-2 ring-accent-teal" : "opacity-80 hover:opacity-100"}`}
                >
                  {/* Mini-aperçu du modèle */}
                  <div className="h-20 rounded bg-white overflow-hidden border border-black/20">
                    {m.code === "bandeau" && <div className="h-5" style={{ background: c }} />}
                    {m.code === "classique" && (
                      <div className="flex items-center justify-between px-2 pt-2">
                        <div className="h-2 w-10 rounded-sm" style={{ background: c }} />
                        <div className="h-2 w-6 rounded-sm bg-neutral-800" />
                      </div>
                    )}
                    {m.code === "epure" && (
                      <>
                        <div className="flex items-center justify-between px-2 pt-2">
                          <div className="h-2 w-10 rounded-sm bg-neutral-800" />
                          <div className="h-2 w-6 rounded-sm bg-neutral-400" />
                        </div>
                        <div className="mx-2 mt-1.5 h-[2px]" style={{ background: c }} />
                      </>
                    )}
                    <div className="px-2 mt-2 space-y-1">
                      <div
                        className="h-2 rounded-sm"
                        style={{ background: m.code === "epure" ? "#e5e5ea" : c, opacity: m.code === "epure" ? 1 : 0.85 }}
                      />
                      <div className="h-1.5 rounded-sm bg-neutral-200" />
                      <div className="h-1.5 rounded-sm bg-neutral-100" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{m.label}</span>
                    {actif && <span className="text-xs text-accent-teal">✓ choisi</span>}
                  </div>
                  <p className="text-xs text-white/40 mt-1">{m.description}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <label className="field-label">Couleur des documents</label>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {COULEURS_PDF.map((c) => {
                const actif = (form.couleur_pdf ?? COULEUR_PDF_DEFAUT).toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.label}
                    onClick={() => set("couleur_pdf", c.hex)}
                    className={`h-9 w-9 rounded-full border-2 transition ${actif ? "border-white scale-110" : "border-transparent opacity-80 hover:opacity-100"}`}
                    style={{ background: c.hex }}
                    aria-label={`Couleur ${c.label}`}
                    aria-pressed={actif}
                  />
                );
              })}
              <input
                type="color"
                value={form.couleur_pdf ?? COULEUR_PDF_DEFAUT}
                onChange={(e) => set("couleur_pdf", e.target.value)}
                title="Couleur personnalisée"
                className="h-9 w-12 cursor-pointer rounded border border-white/20 bg-transparent p-0.5"
              />
              <span className="text-xs text-white/40">ou une couleur personnalisée</span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-accent-pink mb-3">Emails — signature & RIB</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass-soft p-4">
              <label className="field-label">Signature ajoutée en bas de chaque email</label>
              <textarea
                className="field-input"
                rows={5}
                value={form.signature_mail ?? ""}
                onChange={(e) => set("signature_mail", e.target.value)}
                placeholder={"Ex.\nJean Dupont\nCarrosserie Dupont\n12 rue des Ateliers, 75000 Paris\n01 23 45 67 89"}
              />
              <button
                type="button"
                onClick={() =>
                  set(
                    "signature_mail",
                    [
                      form.nom,
                      form.adresse,
                      `${form.code_postal || ""} ${form.ville || ""}`.trim(),
                      form.tel,
                      form.email,
                    ].filter(Boolean).join("\n")
                  )
                }
                className="mt-2 text-sm text-accent-teal hover:underline"
              >
                Remplir automatiquement depuis les infos du garage
              </button>
              <p className="text-xs text-white/40 mt-1">
                Elle s&apos;ajoute toute seule à la fin de chaque nouvel email (modifiable avant envoi).
              </p>
            </div>
            <div className="glass-soft p-4">
              <label className="field-label">RIB officiel (PDF) — joint aux emails</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setRibFile(e.target.files?.[0] || null)}
                className="text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white"
              />
              {form.rib_path && !ribFile && (
                <button
                  type="button"
                  onClick={voirRib}
                  className="mt-3 inline-block text-sm text-accent-teal hover:underline"
                >
                  Voir le RIB enregistré
                </button>
              )}
              {ribFile && <p className="mt-2 text-xs text-emerald-300">Nouveau RIB prêt : {ribFile.name} (enregistre le profil)</p>}
              <p className="text-xs text-white/40 mt-2">
                Quand tu coches « RIB du garage » en pièce jointe d&apos;un email, c&apos;est CE fichier
                qui part. Sans fichier, un RIB est généré depuis l&apos;IBAN/BIC ci-dessus.
              </p>
            </div>

            {/* SIGNATURE DU GARAGE (v7.6) — superposée au tampon des documents */}
            <div className="glass-soft p-4">
              <label className="field-label">Signature du garage</label>
              <p className="mb-2 text-xs text-white/50">
                Elle est <span className="text-white/80">superposée au tampon</span> sur les
                factures, devis, ordres de réparation et attestations. Trace-la à l&apos;écran
                (doigt ou souris) ou importe une image à fond transparent (PNG).
              </p>

              {/* Signature déjà enregistrée */}
              {form.signature_path && !signatureTrace && !signatureFichier && (
                <div className="mb-3">
                  {signatureApercu ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={signatureApercu}
                      alt="Signature du garage"
                      className="max-h-24 rounded-md bg-white/90 p-2"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => chargerApercuSignature(form.signature_path)}
                      className="text-sm text-accent-teal hover:underline"
                    >
                      Voir la signature enregistrée
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, signature_path: null }));
                      setSignatureApercu(null);
                    }}
                    className="mt-2 block text-xs text-white/40 hover:text-rose-300"
                  >
                    Retirer la signature (enregistre ensuite le profil)
                  </button>
                </div>
              )}

              {/* Tracé à l'écran */}
              {tracer ? (
                <div className="space-y-2">
                  <SignaturePad onChange={setSignatureTrace} />
                  <button
                    type="button"
                    onClick={() => { setTracer(false); setSignatureTrace(null); }}
                    className="text-xs text-white/45 hover:text-white hover:underline"
                  >
                    Annuler le tracé
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button type="button" onClick={() => setTracer(true)} className="btn-ghost py-1.5 px-3 text-xs">
                    Tracer la signature
                  </button>
                  <FilePicker
                    value={signatureFichier}
                    onChange={setSignatureFichier}
                    accept="image/*"
                    label="Importer une image"
                    aide="PNG à fond transparent de préférence"
                    avecPhoto={false}
                  />
                </div>
              )}

              {(signatureTrace || signatureFichier) && (
                <p className="mt-2 text-xs text-emerald-300">
                  Nouvelle signature prête — enregistre le profil pour l&apos;appliquer.
                </p>
              )}
            </div>
          </div>
        </section>

        {error && <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>}
        {msg && <div className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200">{msg}</div>}

        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? "Enregistrement…" : "Enregistrer le profil"}
          </button>
        </div>
      </div>

      <div className="glass-card p-6 mt-6">
        <h2 className="text-sm font-semibold text-accent-pink mb-3">Envoi des emails (SMTP)</h2>
        <MailSettings />
      </div>

      <div className="glass-card p-6 mt-6">
        <h2 className="text-sm font-semibold text-accent-pink mb-3">Assistant IA — consommation</h2>
        <ConsommationIA />
      </div>

      <div className="glass-card p-6 mt-6">
        <h2 className="text-sm font-semibold text-accent-pink mb-3">Mon compte</h2>
        <CompteSettings />
      </div>
    </div>
  );
}
