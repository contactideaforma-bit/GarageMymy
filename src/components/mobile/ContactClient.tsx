"use client";

// ============================================================
//  CONTACT CLIENT EN UN TAP (v13.50) — feuille mobile : appeler, SMS,
//  WhatsApp, e-mail, fiche récap. Depuis la fiche dossier (barre d'actions)
//  ou depuis le raccourci « + » après avoir choisi un dossier.
// ============================================================

import { useRouter } from "next/navigation";
import type { Dossier } from "@/lib/types";
import Feuille from "@/components/mobile/Feuille";
import { lienSms, lienTel, lienWhatsApp } from "@/lib/mobile";

type DossierContact = Pick<Dossier, "id" | "client_nom" | "client_tel" | "client_email" | "immatriculation" | "marque_modele" | "numero_sinistre">;

export default function ContactClient({
  dossier,
  onClose,
  onRecap,
}: {
  dossier: DossierContact;
  onClose: () => void;
  /** Ouvre la fiche récap sur place (fiche dossier) ; sinon on y va par la fiche. */
  onRecap?: () => void;
}) {
  const router = useRouter();
  const tel = lienTel(dossier.client_tel);
  const sms = lienSms(dossier.client_tel);
  const wa = lienWhatsApp(dossier.client_tel);
  const mail = dossier.client_email ? `mailto:${dossier.client_email}` : null;
  const vehicule = [dossier.marque_modele, dossier.immatriculation].filter(Boolean).join(" · ");

  const Ligne = ({ href, ico, lib, sous, desactive, onClick }: { href?: string | null; ico: string; lib: string; sous?: string; desactive?: boolean; onClick?: () => void }) => {
    const contenu = (
      <>
        <span className="tuile-ico" aria-hidden>{ico}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{lib}</span>
          {sous && <span className="block truncate text-xs" style={{ color: "var(--mea-texte-3)" }}>{sous}</span>}
        </span>
        <span aria-hidden style={{ color: "var(--mea-texte-3)" }}>›</span>
      </>
    );
    if (desactive) return <div className="ligne-liste opacity-40">{contenu}</div>;
    if (href) return <a href={href} className="ligne-liste" onClick={onClose} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{contenu}</a>;
    return <button type="button" className="ligne-liste" onClick={onClick}>{contenu}</button>;
  };

  return (
    <Feuille titre={dossier.client_nom || "Client"} onClose={onClose}>
      <p className="mb-3 text-xs" style={{ color: "var(--mea-texte-3)" }}>
        {vehicule || "Véhicule non renseigné"}
        {dossier.numero_sinistre ? ` · n° ${dossier.numero_sinistre}` : ""}
      </p>
      <div className="groupe-liste">
        <Ligne href={tel} ico="📞" lib="Appeler" sous={dossier.client_tel || "Pas de numéro sur le dossier"} desactive={!tel} />
        <Ligne href={sms} ico="💬" lib="Envoyer un SMS" sous={dossier.client_tel || "Pas de numéro"} desactive={!sms} />
        <Ligne href={wa} ico="🟢" lib="WhatsApp" sous={dossier.client_tel || "Pas de numéro"} desactive={!wa} />
        <Ligne href={mail} ico="✉️" lib="E-mail" sous={dossier.client_email || "Pas d'adresse sur le dossier"} desactive={!mail} />
      </div>
      <div className="groupe-liste mt-3">
        <Ligne
          ico="📋"
          lib="Fiche récap"
          sous="Tout le dossier sur un écran, à copier ou envoyer"
          onClick={() => {
            onClose();
            if (onRecap) onRecap();
            else router.push(`/sinistres/${dossier.id}?recap=1`);
          }}
        />
        <Ligne
          ico="📁"
          lib="Ouvrir le dossier"
          onClick={() => {
            onClose();
            router.push(`/sinistres/${dossier.id}`);
          }}
        />
      </div>
    </Feuille>
  );
}
