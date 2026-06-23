"use client";

import { useEffect, useState } from "react";

type Cfg = {
  configured: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  from_name: string;
  from_email: string;
  hasPassword: boolean;
};

const PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  Gmail: { host: "smtp.gmail.com", port: 465, secure: true },
  "Outlook / Microsoft 365": { host: "smtp.office365.com", port: 587, secure: false },
  OVH: { host: "ssl0.ovh.net", port: 465, secure: true },
  Orange: { host: "smtp.orange.fr", port: 465, secure: true },
  Gandi: { host: "mail.gandi.net", port: 587, secure: false },
};

export default function MailSettings() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/mail-config");
        const d = (await res.json()) as Cfg & { error?: string };
        if (d && !d.error) {
          setConfigured(Boolean(d.configured));
          setHasPassword(Boolean(d.hasPassword));
          setHost(d.smtp_host || "");
          setPort(String(d.smtp_port || 587));
          setSecure(Boolean(d.smtp_secure));
          setUser(d.smtp_user || "");
          setFromName(d.from_name || "");
          setFromEmail(d.from_email || "");
        } else if (d?.error) {
          setError(d.error);
        }
      } catch {
        setError("Impossible de charger la configuration mail.");
      }
      setLoading(false);
    })();
  }, []);

  function applyPreset(name: string) {
    const p = PRESETS[name];
    if (!p) return;
    setHost(p.host);
    setPort(String(p.port));
    setSecure(p.secure);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/mail-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtp_host: host,
          smtp_port: port,
          smtp_secure: secure,
          smtp_user: user,
          smtp_pass: pass, // vide = inchangé
          from_name: fromName,
          from_email: fromEmail,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.ok) throw new Error(d?.error || `Erreur (HTTP ${res.status}).`);
      setMsg("✓ Configuration enregistrée.");
      if (pass) {
        setHasPassword(true);
        setPass("");
      }
      setConfigured(Boolean(host && user && (pass || hasPassword)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-white/40">Chargement de la configuration mail…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
            configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {configured ? "Boîte connectée" : "Non configuré"}
        </span>
        <span className="text-white/50">
          Les emails (devis, factures, relances) partiront de cette boîte.
        </span>
      </div>

      <div>
        <label className="field-label">Fournisseur (pré-remplit serveur & port)</label>
        <select className="field-input" defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
          <option value="">— Choisir —</option>
          {Object.keys(PRESETS).map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Serveur SMTP</label>
          <input className="field-input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Port</label>
            <input className="field-input" value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" />
          </div>
          <div>
            <label className="field-label">SSL (465)</label>
            <select className="field-input" value={secure ? "1" : "0"} onChange={(e) => setSecure(e.target.value === "1")}>
              <option value="0">Non (587/STARTTLS)</option>
              <option value="1">Oui (465/SSL)</option>
            </select>
          </div>
        </div>
        <div>
          <label className="field-label">Identifiant (email)</label>
          <input className="field-input" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" placeholder="contact@songarage.fr" />
        </div>
        <div>
          <label className="field-label">
            Mot de passe {hasPassword && <span className="text-white/40">(enregistré — laisser vide pour garder)</span>}
          </label>
          <input
            type="password"
            className="field-input"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="new-password"
            placeholder={hasPassword ? "••••••••" : "mot de passe d'application"}
          />
        </div>
        <div>
          <label className="field-label">Nom expéditeur</label>
          <input className="field-input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Garage MYMY" />
        </div>
        <div>
          <label className="field-label">Email expéditeur</label>
          <input className="field-input" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="contact@songarage.fr" />
        </div>
      </div>

      <p className="text-xs text-white/40">
        Gmail : active la validation en 2 étapes puis crée un « mot de passe d&apos;application »
        (les mots de passe normaux sont refusés). Le mot de passe est stocké côté serveur et n&apos;est
        jamais renvoyé au navigateur.
      </p>

      {error && <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">{error}</div>}
      {msg && <div className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200">{msg}</div>}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Enregistrement…" : "Enregistrer la configuration mail"}
        </button>
      </div>
    </div>
  );
}
