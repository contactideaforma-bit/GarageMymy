"use client";

// ============================================================
//  GUIDE « COURRIERS LA POSTE » (v13.28)
//  Ce que le garage doit savoir avant d'envoyer : fonctionnement,
//  délais, valeur légale, jetons, responsabilités. Affiché en entier
//  sur /courriers et, en version courte, au PREMIER envoi.
// ============================================================

import Link from "next/link";
import { FEUILLES_TRANCHE_1, JETONS_PAR_ENVOI } from "@/lib/jetons";

const CLE = "mea.courriers.guideVu";

export function guideCourriersVu(): boolean {
  try { return window.localStorage.getItem(CLE) === "1"; } catch { return true; }
}
export function marquerGuideCourriersVu() {
  try { window.localStorage.setItem(CLE, "1"); } catch { /* navigation privée */ }
}

const ETAPES = [
  ["Vous choisissez le courrier", "Un courrier rédigé dans l'appli (relance, mise en demeure, courrier à l'assureur ou à l'expert) ou n'importe quel PDF."],
  ["Vous vérifiez l'adresse", "Elle est reprise du dossier et mise au format postal. L'expéditeur est votre garage (adresse du Profil)."],
  ["La Poste s'occupe du reste", "Notre partenaire Maileva (groupe La Poste) imprime, met sous pli et dépose le courrier, le jour même pour un envoi avant 14 h."],
  ["Vous suivez dans l'appli", "Statut, n° de recommandé, preuve de dépôt et avis de réception sont rangés dans le dossier."],
];

export default function GuideCourriers({ compact = false, onCompris }: { compact?: boolean; onCompris?: () => void }) {
  return (
    <div className="space-y-3 text-sm text-white/80">
      {compact && <p className="font-semibold text-white">Premier envoi : voici comment ça marche.</p>}
      <ol className="grid gap-2 sm:grid-cols-2">
        {ETAPES.map(([titre, texte], i) => (
          <li key={titre} className="glass-soft p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent-teal">Étape {i + 1}</div>
            <div className="font-semibold text-white">{titre}</div>
            <div className="text-xs text-white/65">{texte}</div>
          </li>
        ))}
      </ol>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="glass-soft p-3">
          <div className="font-semibold text-white">✉ Lettre simple — {JETONS_PAR_ENVOI.simple} jeton</div>
          <div className="text-xs text-white/65">Déposée dans la boîte aux lettres du destinataire, en général sous 2 à 3 jours ouvrés. Pour les courriers d&apos;information, relances amiables, envois de factures.</div>
        </div>
        <div className="glass-soft p-3">
          <div className="font-semibold text-white">📮 Recommandé AR — {JETONS_PAR_ENVOI.lrar} jetons</div>
          <div className="text-xs text-white/65">Un vrai recommandé La Poste, remis par le facteur contre signature. Même valeur qu&apos;un recommandé déposé au guichet : preuve de dépôt, n° de suivi et avis de réception. Pour les mises en demeure et tout ce qui doit faire foi.</div>
        </div>
      </div>

      {!compact && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-white/65">
          <li>Au-delà de {FEUILLES_TRANCHE_1} feuilles (page adresse comprise), le pli change de tranche de poids : +{JETONS_PAR_ENVOI.supplementLourd} jeton. Le coût exact s&apos;affiche avant chaque envoi.</li>
          <li>Un courrier refusé par La Poste (adresse invalide, PDF illisible) ou qui n&apos;a pas pu partir : les jetons sont rendus automatiquement.</li>
          <li>Un pli non distribué (destinataire absent qui ne va pas le chercher, adresse inconnue) reste facturé : c&apos;est le cas aussi au guichet. Pour un recommandé, la date de première présentation et la preuve de dépôt restent disponibles : conservez-les dans le dossier.</li>
          <li>Le recto verso est coché par défaut (moins de feuilles, donc moins de poids). La couleur est possible.</li>
          <li>Les jetons se rachètent à tout moment depuis cette page (carte bancaire, Apple Pay ou PayPal). Ils n&apos;expirent pas.</li>
        </ul>
      )}

      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
        <strong>À vérifier avant d&apos;envoyer :</strong> le contenu du courrier et l&apos;adresse du destinataire sont sous votre responsabilité. Un courrier transmis à La Poste ne peut plus être annulé. Le PDF est transmis à Maileva (groupe La Poste, hébergement en France) uniquement pour l&apos;impression et la distribution.
      </div>

      {!compact && (
        <p className="text-xs text-white/50">Conditions complètes : <Link href="/cgu#jetons" className="text-accent-teal hover:underline">CGU — article « Courriers La Poste et jetons »</Link>.</p>
      )}

      {onCompris && (
        <div className="flex justify-end">
          <button type="button" onClick={onCompris} className="btn-primary btn-compact">J&apos;ai compris, continuer</button>
        </div>
      )}
    </div>
  );
}
