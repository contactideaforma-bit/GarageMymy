"use client";

// FORMULAIRE DE CONTACT PUBLIC (v9.4) — envoie vers /api/contact.
// Sans compte, sans cookie : nom, email, téléphone (facultatif), garage,
// message. Un champ « site » invisible sert de piège à robots (honeypot).

import { useState } from "react";
import { SOCIETE } from "./societe";

type Etat = "idle" | "envoi" | "ok" | "erreur";

export default function FormulaireContact({ sujetDefaut = "" }: { sujetDefaut?: string }) {
  const [etat, setEtat] = useState<Etat>("idle");
  const [erreur, setErreur] = useState("");
  const [form, setForm] = useState({
    nom: "",
    email: "",
    telephone: "",
    garage: "",
    message: sujetDefaut,
    site: "", // honeypot — doit rester vide
  });

  const maj = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (etat === "envoi") return;
    setEtat("envoi");
    setErreur("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Envoi impossible pour le moment.");
      setEtat("ok");
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Envoi impossible pour le moment.");
      setEtat("erreur");
    }
  }

  if (etat === "ok") {
    return (
      <div className="lp-card p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h3 className="mt-4 !text-lg font-semibold">Message bien reçu.</h3>
        <p className="mt-2 text-sm text-slate-500">
          Nous vous répondons sous 24 h ouvrées, généralement bien plus vite. Une
          copie part sur <strong className="text-slate-700">{form.email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={envoyer} className="lp-card p-6 sm:p-8" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Votre nom" requis>
          <input className="lp-input" required autoComplete="name" value={form.nom} onChange={maj("nom")} />
        </Champ>
        <Champ label="Email" requis>
          <input className="lp-input" type="email" required autoComplete="email" value={form.email} onChange={maj("email")} />
        </Champ>
        <Champ label="Téléphone">
          <input className="lp-input" type="tel" autoComplete="tel" value={form.telephone} onChange={maj("telephone")} />
        </Champ>
        <Champ label="Garage / société">
          <input className="lp-input" autoComplete="organization" value={form.garage} onChange={maj("garage")} />
        </Champ>
      </div>
      <div className="mt-4">
        <Champ label="Votre message" requis>
          <textarea
            className="lp-input min-h-[8rem]"
            required
            placeholder="Ex. : je souhaite une démonstration avec l'un de mes rapports d'expertise."
            value={form.message}
            onChange={maj("message")}
          />
        </Champ>
      </div>
      {/* Honeypot : invisible pour un humain, rempli par les robots. */}
      <div className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>
          Site web
          <input tabIndex={-1} autoComplete="off" value={form.site} onChange={maj("site")} />
        </label>
      </div>

      {etat === "erreur" && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {erreur} Vous pouvez aussi nous écrire directement à{" "}
          <a href={`mailto:${SOCIETE.email}`} className="underline">{SOCIETE.email}</a>.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          Vos coordonnées servent uniquement à vous répondre —{" "}
          <a href="/confidentialite" className="underline hover:text-slate-600">politique de confidentialité</a>.
        </p>
        <button type="submit" className="lp-btn" disabled={etat === "envoi"}>
          {etat === "envoi" ? "Envoi…" : "Envoyer le message"}
        </button>
      </div>
    </form>
  );
}

function Champ({ label, requis, children }: { label: string; requis?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
        {requis && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
