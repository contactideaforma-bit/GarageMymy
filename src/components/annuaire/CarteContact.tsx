"use client";

// ============================================================
//  BASE DE DONNÉES — CARTES DE CONTACT (v13.52)
//  Les trois onglets (clients, assurances, experts) partagent le même
//  langage visuel : une CARTE par contact — pastille d'initiales colorée
//  par famille, nom, sous-titre, lignes de contact cliquables (appel,
//  e-mail, itinéraire), étiquettes, actions. Fini les tableaux à 8
//  colonnes qui se cassaient lettre par lettre.
// ============================================================

import type { ReactNode } from "react";

export type FamilleContact = "client" | "assureur" | "expert";

const TEINTES: Record<FamilleContact, { fond: string; texte: string; bordure: string }> = {
  client: { fond: "rgba(139, 92, 246, 0.16)", texte: "#8b5cf6", bordure: "rgba(139, 92, 246, 0.35)" },
  assureur: { fond: "rgba(20, 184, 166, 0.16)", texte: "#0f9488", bordure: "rgba(20, 184, 166, 0.35)" },
  expert: { fond: "rgba(236, 72, 153, 0.14)", texte: "#db2777", bordure: "rgba(236, 72, 153, 0.35)" },
};

export function initiales(nom: string | null | undefined): string {
  const mots = String(nom || "")
    .replace(/\b(monsieur|madame|mme|mr|m\.|sarl|sas|sa|eurl|cabinet|ste|societe|société)\b/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

export function lienTelephone(tel: string | null | undefined): string | null {
  const t = String(tel || "").replace(/[^\d+]/g, "");
  return t.length >= 6 ? `tel:${t}` : null;
}
export function formaterTel(tel: string | null | undefined): string {
  const t = String(tel || "").replace(/\s+/g, "");
  if (/^0\d{9}$/.test(t)) return t.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  return String(tel || "");
}
export function lienCarte(adresse: string | null | undefined, cp: string | null | undefined, ville: string | null | undefined): string | null {
  const q = [adresse, cp, ville].filter(Boolean).join(" ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** Une ligne « icône + valeur » cliquable, ou grisée si absente. */
export function LigneContact({ ico, href, children, vide = "Non renseigné", externe = false }: { ico: string; href?: string | null; children?: ReactNode; vide?: string; externe?: boolean }) {
  const contenu = (
    <>
      <span className="carte-contact-ico" aria-hidden>{ico}</span>
      <span className="min-w-0 flex-1 truncate">{children || <span className="opacity-50">{vide}</span>}</span>
    </>
  );
  if (href && children) {
    return (
      <a href={href} target={externe ? "_blank" : undefined} rel={externe ? "noreferrer" : undefined} className="carte-contact-ligne carte-contact-lien" onClick={(e) => e.stopPropagation()}>
        {contenu}
      </a>
    );
  }
  return <span className="carte-contact-ligne">{contenu}</span>;
}

export default function CarteContact({
  famille,
  nom,
  sousTitre,
  etiquettes,
  lignes,
  note,
  onModifier,
  onSupprimer,
  actionsSupplementaires,
}: {
  famille: FamilleContact;
  nom: string | null | undefined;
  sousTitre?: ReactNode;
  etiquettes?: ReactNode;
  lignes: ReactNode;
  note?: string | null;
  onModifier: () => void;
  onSupprimer: () => void;
  actionsSupplementaires?: ReactNode;
}) {
  const t = TEINTES[famille];
  return (
    <article className="carte-contact" style={{ ["--cc-bordure" as string]: t.bordure }}>
      <header className="flex items-start gap-3">
        <span className="carte-contact-avatar" style={{ background: t.fond, color: t.texte, borderColor: t.bordure }} aria-hidden>
          {initiales(nom)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-tight" style={{ color: "var(--mea-texte)" }} title={nom || ""}>
            {nom || <span className="opacity-50">Sans nom</span>}
          </h3>
          {sousTitre && <div className="mt-0.5 truncate text-xs" style={{ color: "var(--mea-texte-3)" }}>{sousTitre}</div>}
        </div>
        <button type="button" onClick={onModifier} className="carte-contact-modifier" title="Modifier" aria-label="Modifier">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </header>

      <div className="mt-3 space-y-1">{lignes}</div>

      {note && <p className="carte-contact-note">{note}</p>}

      <footer className="mt-3 flex flex-wrap items-center gap-1.5">
        {etiquettes}
        <span className="flex-1" />
        {actionsSupplementaires}
        <button type="button" onClick={onSupprimer} className="carte-contact-suppr" title="Supprimer">
          Supprimer
        </button>
      </footer>
    </article>
  );
}
