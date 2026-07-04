"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Rappel du parcours d'un sinistre, étape par étape, avec pour chaque étape
 * le raccourci vers l'écran de l'appli. Pensé pour guider un utilisateur
 * peu à l'aise avec l'informatique.
 */

type Etape = {
  titre: string;
  detail: string;
  appli?: { label: string; href: string };
};

const ETAPES: Etape[] = [
  {
    titre: "Le client arrive avec un sinistre",
    detail: "Le client a eu un accident et choisit ton garage pour la réparation.",
  },
  {
    titre: "Le client déclare le sinistre à son assurance",
    detail: "Il transmet son constat amiable à son assureur. Rappelle-le-lui si besoin : rien ne démarre sans cette déclaration.",
  },
  {
    titre: "Tu crées le dossier",
    detail: "Informations personnelles du client, carte grise, constat amiable, assurance. Tout part de là.",
    appli: { label: "Sinistres, bouton + Ajouter un dossier", href: "/sinistres" },
  },
  {
    titre: "Un cabinet d'expert est mandaté",
    detail: "L'expert programme un rendez-vous d'expertise pour chiffrer les réparations. Note le rendez-vous pour ne pas le rater.",
    appli: { label: "Agenda, + RDV (type : RDV expert)", href: "/agenda" },
  },
  {
    titre: "L'expert envoie son chiffrage",
    detail: "Par email, quelques jours après l'expertise.",
  },
  {
    titre: "Tu fais le devis et tu l'envoies à l'expert et au client",
    detail: "Importe le rapport de l'expert : le dossier ET le devis se remplissent tout seuls, poste par poste.",
    appli: { label: "Importer un rapport (analyse automatique)", href: "/import" },
  },
  {
    titre: "Devis validé : l'expert envoie le rapport définitif",
    detail: "Si le devis est conforme, l'expert transmet son rapport définitif.",
  },
  {
    titre: "Ordre de réparation + facture, envoyés à l'expert et au client",
    detail: "Fais signer l'ordre de réparation au client (directement à l'écran), crée la facture et envoie-les.",
    appli: { label: "Fiche du dossier, bloc Atelier et Devis & Factures", href: "/sinistres" },
  },
  {
    titre: "Réparations et commande des pièces",
    detail: "En parallèle, planifie le véhicule à l'atelier et commande les pièces nécessaires.",
    appli: { label: "Planning atelier (vue mois)", href: "/planning" },
  },
  {
    titre: "La facture part vers l'assurance",
    detail: "Cas normal : le CLIENT envoie la facture à son assurance. L'assurance peut demander des documents complémentaires : réponds vite pour ne pas bloquer le paiement.",
  },
  {
    titre: "L'assurance paie, le client te règle",
    detail: "L'assurance traite le dossier et paie le client, qui te fait un virement. Les assurances sont parfois lentes : relance sans attendre.",
    appli: { label: "Finance : relances en 1 clic (ou automatiques)", href: "/finance" },
  },
  {
    titre: "Paiement reçu, véhicule restitué",
    detail: "Pointe le paiement (ou laisse le rapprochement bancaire le faire), puis fais signer le PV de restitution à la remise du véhicule. Dossier payé : la barre passe à 100 %.",
    appli: { label: "Banque : rapprochement du relevé", href: "/banque" },
  },
];

export default function GuideProcedure() {
  const [ouvert, setOuvert] = useState(false);

  return (
    <section className="glass-card">
      <button
        onClick={() => setOuvert((o) => !o)}
        className="w-full px-5 py-4 flex items-center justify-between text-left"
        aria-expanded={ouvert}
      >
        <h2 className="font-semibold text-white">Guide : le parcours d&apos;un sinistre</h2>
        <span className="font-pixel text-[0.6rem] text-accent-pink">{ouvert ? "− FERMER" : "+ OUVRIR"}</span>
      </button>

      {ouvert && (
        <div className="px-5 pb-5">
          <ol className="space-y-3">
            {ETAPES.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className="font-pixel mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-[0.6rem] text-white"
                  style={{ backgroundColor: "#8b5cf6", boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.3)" }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-white">{e.titre}</div>
                  <div className="text-sm text-white/60">{e.detail}</div>
                  {e.appli && (
                    <Link href={e.appli.href} className="text-sm text-accent-teal hover:underline">
                      Dans l&apos;appli : {e.appli.label}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-soft p-4 border-l-4" style={{ borderLeftColor: "#2dd4bf" }}>
              <div className="font-semibold text-white">Variante : cession de créance</div>
              <p className="mt-1 text-sm text-white/60">
                Au lieu d&apos;envoyer la facture au client, fais-lui signer une cession de créance :
                tu envoies alors la facture DIRECTEMENT à l&apos;assurance, qui te paie toi.
                Plus rapide, plus sûr. Pense à la franchise et à la vétusté éventuelles,
                qui restent en général à la charge du client.
              </p>
              <Link href="/sinistres" className="text-sm text-accent-teal hover:underline">
                Dans l&apos;appli : fiche du dossier, bloc Atelier, + Cession de créance
              </Link>
            </div>
            <div className="glass-soft p-4 border-l-4" style={{ borderLeftColor: "#f59e0b" }}>
              <div className="font-semibold text-white">Pendant les réparations : véhicule de prêt</div>
              <p className="mt-1 text-sm text-white/60">
                Si l&apos;assurance prend en charge (ou en geste commercial), propose un véhicule
                de prêt au client pendant l&apos;immobilisation.
              </p>
              <Link href="/flotte" className="text-sm text-accent-teal hover:underline">
                Dans l&apos;appli : Flotte du garage, bouton Louer
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
