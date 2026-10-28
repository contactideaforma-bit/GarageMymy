"use client";

import { useMemo, useState } from "react";
import ModalShell from "@/components/ModalShell";
import type { Document, Dossier } from "@/lib/types";
import { liensPartage, sectionsRecap, texteRecap } from "@/lib/ficheRecap";

/**
 * FICHE RÉCAP (v13.49) : toutes les infos du dossier en un coup d'œil,
 * un bouton « Copier » et des raccourcis WhatsApp / Messages / Mail qui
 * ouvrent l'application avec le texte déjà rempli. Chaque section peut
 * être décochée avant de partager (on n'envoie pas le montant au client,
 * par exemple).
 */
export default function FicheRecapModal({ dossier, documents, onClose }: { dossier: Dossier; documents: Document[]; onClose: () => void }) {
  const sections = useMemo(() => sectionsRecap(dossier, documents), [dossier, documents]);
  const [cochees, setCochees] = useState<Set<string>>(new Set(sections.map((s) => s.titre)));
  const [copie, setCopie] = useState<"non" | "ok" | "erreur">("non");
  const [destinataire, setDestinataire] = useState<"libre" | "client" | "expert">("libre");

  const texte = useMemo(() => texteRecap(dossier, documents, { sections: cochees }), [dossier, documents, cochees]);
  const tel = destinataire === "client" ? dossier.client_tel : destinataire === "expert" ? dossier.expert_tel || dossier.cabinet_tel : null;
  const liens = liensPartage(texte, tel);

  async function copier() {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie("ok");
    } catch {
      // Repli (vieux navigateurs / contexte non sécurisé) : sélection d'un textarea invisible.
      try {
        const ta = document.createElement("textarea");
        ta.value = texte;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopie("ok");
      } catch {
        setCopie("erreur");
      }
    }
    setTimeout(() => setCopie("non"), 2500);
  }

  function basculer(titre: string) {
    const n = new Set(cochees);
    if (n.has(titre)) n.delete(titre); else n.add(titre);
    setCochees(n);
  }

  return (
    <ModalShell title={`Fiche récap — ${dossier.numero_sinistre || "dossier"}${dossier.immatriculation ? ` · ${dossier.immatriculation}` : ""}`} onClose={onClose} maxWidth="max-w-2xl">
      {sections.length === 0 && <p className="text-white/60">Le dossier ne contient encore aucune information à récapituler.</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sections.map((s) => {
          const active = cochees.has(s.titre);
          return (
            <div key={s.titre} className={`glass-soft p-3 transition-opacity ${active ? "" : "opacity-50"}`}>
              <label className="mb-2 flex cursor-pointer items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/60">{s.titre}</span>
                <input type="checkbox" checked={active} onChange={() => basculer(s.titre)} title={active ? "Exclure du texte partagé" : "Inclure dans le texte partagé"} />
              </label>
              <dl className="space-y-1">
                {s.lignes.filter((l) => l.cle !== "montant_source").map((l) => (
                  <div key={l.cle} className="flex justify-between gap-3 text-sm">
                    <dt className="shrink-0 text-white/50">{l.label}</dt>
                    <dd className="min-w-0 break-words text-right font-medium text-white">
                      {l.tel ? <a href={`tel:${l.valeur.replace(/\s/g, "")}`} className="hover:underline">{l.valeur}</a>
                        : l.email ? <a href={`mailto:${l.valeur}`} className="hover:underline">{l.valeur}</a>
                        : l.valeur}
                    </dd>
                  </div>
                ))}
                {s.lignes.some((l) => l.cle === "montant_source") && (
                  <div className="pt-1 text-[11px] text-white/40">d&apos;après {s.lignes.find((l) => l.cle === "montant_source")!.valeur}</div>
                )}
              </dl>
            </div>
          );
        })}
      </div>

      {/* Aperçu du texte copié / partagé */}
      <details className="glass-soft mt-3 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-white/60">Aperçu du texte partagé</summary>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-white/80">{texte}</pre>
      </details>

      {/* Destinataire des raccourcis */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/70">
        <span>Envoyer à :</span>
        {([
          ["libre", "choisir dans l'appli"],
          ["client", dossier.client_tel ? `le client (${dossier.client_tel})` : "le client (pas de n°)"],
          ["expert", dossier.expert_tel || dossier.cabinet_tel ? `l'expert (${dossier.expert_tel || dossier.cabinet_tel})` : "l'expert (pas de n°)"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setDestinataire(k)}
            disabled={(k === "client" && !dossier.client_tel) || (k === "expert" && !dossier.expert_tel && !dossier.cabinet_tel)}
            className={`rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-40 ${destinataire === k ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <a href={liens.whatsapp} target="_blank" rel="noopener noreferrer" className="btn-ghost" title="Ouvre WhatsApp avec le texte prêt à envoyer">WhatsApp</a>
          <a href={liens.sms} className="btn-ghost" title="Ouvre Messages / SMS avec le texte prêt à envoyer">Messages</a>
          <a href={liens.mail} className="btn-ghost" title="Ouvre un nouvel email avec le texte">Mail</a>
        </div>
        <div className="flex gap-2">
          <button onClick={copier} className="btn-primary">
            {copie === "ok" ? "Copié" : copie === "erreur" ? "Copie impossible" : "Copier la fiche"}
          </button>
          <button onClick={onClose} className="btn-ghost">Fermer</button>
        </div>
      </div>
      <p className="mt-2 text-xs text-white/40">
        Décoche une section pour ne pas l&apos;envoyer (le montant au client, par exemple). Les raccourcis ouvrent l&apos;application sur ton téléphone ou ton ordinateur avec le texte déjà écrit.
      </p>
    </ModalShell>
  );
}
