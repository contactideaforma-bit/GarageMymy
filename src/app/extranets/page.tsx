"use client";

import { useEffect, useState } from "react";
import ConfigBanner from "@/components/ConfigBanner";
import ModalShell from "@/components/ModalShell";
import { fetchAuth } from "@/lib/apiClient";
import { messageErreur } from "@/lib/format";

/**
 * ESPACES EXPERTS — coffre des accès aux extranets des cabinets d'expertise
 * (BCA, Alliance, IDEA…). Identifiant + mot de passe CHIFFRÉ côté serveur :
 * le mot de passe n'est déchiffré qu'à la demande (Afficher / Copier).
 */

type AccesExtranet = {
  id: string;
  nom: string;
  url: string;
  identifiant: string;
  notes: string;
  hasPassword: boolean;
};

// Suggestions de cabinets courants (le nom seul — l'URL de l'extranet varie
// selon le compte du garage, à récupérer auprès du cabinet).
const CABINETS_SUGGERES = [
  "BCA Expertise",
  "Alliance Experts",
  "IDEA Expertise",
  "Stelliant Expertise",
  "Creativ'Expertiz",
  "Expertise Concept",
  "Roadia (Adenes)",
  "Saretec Automobile",
];

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function urlOuvrable(url: string): string {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export default function ExtranetsPage() {
  const [acces, setAcces] = useState<AccesExtranet[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<{ edit: AccesExtranet | null } | null>(null);

  // Mots de passe révélés (id → clair) + feedback de copie (id/champ).
  const [reveles, setReveles] = useState<Record<string, string>>({});
  const [copie, setCopie] = useState<string | null>(null);

  async function load() {
    setErreur(null);
    try {
      const res = await fetchAuth("/api/extranets");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur de chargement.");
      setAcces(json.acces || []);
    } catch (e) {
      setErreur(messageErreur(e, "Impossible de charger les accès (migration v30 exécutée ?)."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function revelerPass(id: string): Promise<string | null> {
    if (reveles[id] !== undefined) return reveles[id];
    try {
      const res = await fetchAuth(`/api/extranets?reveal=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur.");
      setReveles((r) => ({ ...r, [id]: json.password }));
      return json.password as string;
    } catch (e) {
      alert(messageErreur(e, "Impossible de récupérer le mot de passe."));
      return null;
    }
  }

  function masquer(id: string) {
    setReveles((r) => {
      const copy = { ...r };
      delete copy[id];
      return copy;
    });
  }

  async function copier(texte: string, cle: string) {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(cle);
      setTimeout(() => setCopie((c) => (c === cle ? null : c)), 2000);
    } catch {
      alert("Copie impossible dans ce navigateur.");
    }
  }

  async function copierPass(a: AccesExtranet) {
    const pass = await revelerPass(a.id);
    if (pass !== null) {
      // On copie sans forcément l'afficher à l'écran.
      masquer(a.id);
      await copier(pass, `pass-${a.id}`);
    }
  }

  async function supprimer(a: AccesExtranet) {
    if (!confirm(`Supprimer l'accès « ${a.nom} » ?`)) return;
    try {
      const res = await fetchAuth(`/api/extranets?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur.");
      load();
    } catch (e) {
      alert(messageErreur(e, "Suppression impossible."));
    }
  }

  const term = q.trim().toLowerCase();
  const filtres = term
    ? acces.filter((a) =>
        [a.nom, a.url, a.identifiant, a.notes].some((v) => v.toLowerCase().includes(term))
      )
    : acces;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl font-semibold text-white">Espaces experts</h1>
        <button className="btn-primary" onClick={() => setModal({ edit: null })}>
          + Ajouter un accès
        </button>
      </div>
      <p className="text-white/60 mb-6 text-sm">
        Tes accès aux extranets des cabinets d&apos;expertise (BCA, Alliance, IDEA…) pour consulter
        les dossiers en cours. Les mots de passe sont chiffrés (AES-256) et stockés hors de portée
        du navigateur : ils ne sont déchiffrés qu&apos;au moment où tu cliques sur Afficher ou Copier.
      </p>
      <ConfigBanner />

      <div className="mb-4">
        <input
          className="field-input max-w-sm"
          placeholder="Rechercher (cabinet, identifiant…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {erreur && (
        <div className="glass-card p-4 mb-4 text-sm text-rose-300">{erreur}</div>
      )}

      {loading && <div className="glass-card p-8 text-center text-white/40">Chargement…</div>}

      {!loading && filtres.length === 0 && !erreur && (
        <div className="glass-card p-8 text-center text-white/40 text-sm">
          {acces.length === 0
            ? "Aucun accès enregistré. Ajoute les portails de tes experts pour ouvrir leurs dossiers en un clic."
            : "Aucun résultat."}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {filtres.map((a) => (
          <div key={a.id} className="glass-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-white break-words">{a.nom}</div>
                {a.url && (
                  <div className="text-xs text-white/40 break-words">{hostDe(a.url)}</div>
                )}
              </div>
              {a.url && (
                <a
                  href={urlOuvrable(a.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary shrink-0 text-xs"
                >
                  Ouvrir le portail
                </a>
              )}
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-white/50 w-24 shrink-0">Identifiant</span>
                <span className="text-white/90 break-all">{a.identifiant || "—"}</span>
                {a.identifiant && (
                  <button className="btn-ghost text-xs" onClick={() => copier(a.identifiant, `id-${a.id}`)}>
                    {copie === `id-${a.id}` ? "Copié !" : "Copier"}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-white/50 w-24 shrink-0">Mot de passe</span>
                {a.hasPassword ? (
                  <>
                    <span className="text-white/90 break-all font-mono">
                      {reveles[a.id] !== undefined ? reveles[a.id] : "••••••••"}
                    </span>
                    {reveles[a.id] !== undefined ? (
                      <button className="btn-ghost text-xs" onClick={() => masquer(a.id)}>
                        Masquer
                      </button>
                    ) : (
                      <button className="btn-ghost text-xs" onClick={() => revelerPass(a.id)}>
                        Afficher
                      </button>
                    )}
                    <button className="btn-ghost text-xs" onClick={() => copierPass(a)}>
                      {copie === `pass-${a.id}` ? "Copié !" : "Copier"}
                    </button>
                  </>
                ) : (
                  <span className="text-white/40">non renseigné</span>
                )}
              </div>
              {a.notes && (
                <div className="flex flex-wrap items-start gap-2">
                  <span className="text-white/50 w-24 shrink-0">Notes</span>
                  <span className="text-white/70 break-words whitespace-pre-wrap flex-1">{a.notes}</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className="btn-ghost text-xs" onClick={() => setModal({ edit: a })}>
                Modifier
              </button>
              <button className="btn-danger text-xs" onClick={() => supprimer(a)}>
                Suppr.
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <AccesModal
          edit={modal.edit}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            setReveles({});
            load();
          }}
        />
      )}
    </div>
  );
}

function AccesModal({
  edit,
  onClose,
  onSaved,
}: {
  edit: AccesExtranet | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nom, setNom] = useState(edit?.nom ?? "");
  const [url, setUrl] = useState(edit?.url ?? "");
  const [identifiant, setIdentifiant] = useState(edit?.identifiant ?? "");
  const [password, setPassword] = useState("");
  const [voirPass, setVoirPass] = useState(false);
  const [notes, setNotes] = useState(edit?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function enregistrer() {
    if (!nom.trim()) {
      alert("Renseigne le nom du cabinet d'expertise.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetchAuth("/api/extranets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: edit?.id,
          nom,
          url,
          identifiant,
          password, // vide = mot de passe inchangé (en édition)
          notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur.");
      onSaved();
    } catch (e) {
      alert(messageErreur(e, "Enregistrement impossible (migration v30 exécutée ?)."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={edit ? `Modifier — ${edit.nom}` : "Ajouter un accès expert"} onClose={onClose}>
      <div>
        <label className="field-label">Cabinet d&apos;expertise</label>
        <input
          className="field-input"
          list="cabinets-suggeres"
          placeholder="BCA Expertise, Alliance, IDEA…"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
        />
        <datalist id="cabinets-suggeres">
          {CABINETS_SUGGERES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="field-label">Adresse de l&apos;espace extranet</label>
        <input
          className="field-input"
          type="url"
          placeholder="https://extranet.exemple.fr"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div>
        <label className="field-label">Identifiant</label>
        <input
          className="field-input"
          autoComplete="off"
          placeholder="Identifiant du garage sur le portail"
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
        />
      </div>
      <div>
        <label className="field-label">
          Mot de passe{edit?.hasPassword ? " (laisser vide pour ne pas le changer)" : ""}
        </label>
        <div className="flex gap-2">
          <input
            className="field-input flex-1"
            type={voirPass ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" className="btn-ghost text-xs" onClick={() => setVoirPass(!voirPass)}>
            {voirPass ? "Masquer" : "Voir"}
          </button>
        </div>
        <p className="mt-1 text-xs text-white/40">
          Chiffré (AES-256) avant stockage — jamais enregistré en clair.
        </p>
      </div>
      <div>
        <label className="field-label">Notes (n° de compte, contact du cabinet…)</label>
        <textarea
          className="field-input min-h-[70px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={enregistrer} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </ModalShell>
  );
}
