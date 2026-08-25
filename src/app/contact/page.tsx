"use client";

// CONTACT — page PUBLIQUE (v9.4). Même formulaire que l'accueil.

import { VitrineNav, VitrineFooter, Icone } from "@/components/vitrine/Vitrine";
import FormulaireContact from "@/components/vitrine/FormulaireContact";
import { SOCIETE } from "@/components/vitrine/societe";

export default function ContactPage() {
  return (
    <div className="landing-pro min-h-screen">
      <VitrineNav />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
          <div>
            <span className="lp-chip">{SOCIETE.signature}</span>
            <h1 className="mt-3">Parlons de vos dossiers.</h1>
            <p className="mt-4 text-slate-500">
              Démonstration, question, devis : écrivez-nous, nous répondons sous 24 h ouvrées.
            </p>
            <ul className="mt-8 space-y-4 text-sm text-slate-600">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 text-violet-700"><Icone nom="mail" className="h-4 w-4" /></span>
                <a href={`mailto:${SOCIETE.email}`} className="hover:underline">{SOCIETE.email}</a>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 text-violet-700"><Icone nom="lieu" className="h-4 w-4" /></span>
                <span>
                  {SOCIETE.editeur}
                  <br />
                  {SOCIETE.adresse}
                  <br />
                  {SOCIETE.codePostal} {SOCIETE.ville}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 text-violet-700"><Icone nom="support" className="h-4 w-4" /></span>
                <span>Déjà client ? Utilisez le menu « Assistance » dans l&apos;application : votre demande arrive avec tout le contexte technique.</span>
              </li>
            </ul>
          </div>
          <FormulaireContact />
        </div>
      </div>
      <VitrineFooter />
    </div>
  );
}
