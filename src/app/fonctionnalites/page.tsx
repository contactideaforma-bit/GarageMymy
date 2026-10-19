import Link from "next/link";
import { VitrineNav, VitrineFooter } from "@/components/vitrine/Vitrine";
import { COMPARATIF, DOMAINES, Verdict } from "@/components/vitrine/fonctionnalites";

// ============================================================
//  TOUTES LES FONCTIONNALITÉS — page PUBLIQUE (v13.48), rendue côté serveur.
//  Montre que My Easy Auto est un logiciel de gestion complet pour la
//  carrosserie (pas seulement un outil de relance), puis le comparatif
//  face à un DMS d'atelier classique. Contenu : vitrine/fonctionnalites.ts.
// ============================================================

export default function PageFonctionnalites() {
  const total = DOMAINES.reduce((n, d) => n + d.fonctions.length, 0);
  return (
    <div className="landing-pro min-h-screen">
      <VitrineNav />

      {/* ------------------------------ En-tête ------------------------------ */}
      <header className="mx-auto max-w-6xl px-4 pt-12 sm:pt-16">
        <span className="lp-chip">Toutes les fonctionnalités</span>
        <h1 className="mt-3 max-w-3xl">
          Un logiciel de gestion complet pour la carrosserie. Et des gens derrière.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Planning, devis et factures, rentabilité, comptabilité, véhicules de prêt, facture électronique : tout ce
          qu&apos;un atelier attend d&apos;un logiciel de gestion. Plus ce que les autres ne font pas : la lecture
          automatique des rapports d&apos;expertise et des chargés de mission qui débloquent vos dossiers.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/inscription" className="lp-btn">S&apos;abonner en ligne</Link>
          <Link href="/contact" className="lp-btn-ghost">Voir une démo sur mes dossiers</Link>
          <span className="text-sm text-slate-400">{total} fonctions, {DOMAINES.length} domaines, un seul abonnement.</span>
        </div>

        {/* Sommaire */}
        <nav aria-label="Domaines" className="mt-8 flex flex-wrap gap-2">
          {DOMAINES.map((d) => (
            <a key={d.id} href={`#${d.id}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-violet-400 hover:text-violet-700">
              {d.titre}
            </a>
          ))}
          <a href="#comparatif" className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1.5 text-sm font-medium text-fuchsia-700 hover:border-fuchsia-400">
            Comparatif avec un DMS classique
          </a>
        </nav>
      </header>

      {/* ------------------------------ Domaines ------------------------------ */}
      <main className="mx-auto max-w-6xl px-4 pb-16">
        {DOMAINES.map((d, i) => (
          <section key={d.id} id={d.id} className={`scroll-mt-20 pt-12 sm:pt-16 ${i > 0 ? "border-t border-slate-200/80" : ""}`}>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <IconeDomaine nom={d.icone} />
              </div>
              <div>
                <h2>{d.titre}</h2>
                <p className="mt-1 max-w-2xl text-slate-500">{d.accroche}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {d.fonctions.map((f) => (
                <div key={f.titre} className="lp-card lp-card-hover p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-slate-900">{f.titre}</div>
                    {f.service && (
                      <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-700" title="Inclus dans les formules Adhésion Service">
                        Adhésion Service
                      </span>
                    )}
                    {f.nouveau && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Nouveau</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.texte}</p>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* ------------------------------ Comparatif ------------------------------ */}
        <section id="comparatif" className="scroll-mt-20 border-t border-slate-200/80 pt-12 sm:pt-16">
          <span className="lp-chip">Comparatif</span>
          <h2 className="mt-3 max-w-2xl">Face à un logiciel de gestion d&apos;atelier classique</h2>
          <p className="mt-3 max-w-2xl text-slate-500">
            Comparaison honnête avec la catégorie des DMS carrosserie historiques, pas avec un produit en particulier.
            Là où ils sont devant, c&apos;est écrit.
          </p>

          <div className="lp-card mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-500">Critère</th>
                  <th scope="col" className="bg-violet-50 px-4 py-3 font-semibold text-violet-800">My Easy Auto</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-500">DMS d&apos;atelier classique</th>
                </tr>
              </thead>
              <tbody>
                {COMPARATIF.map((l) => (
                  <tr key={l.critere} className="border-b border-slate-100 last:border-0 align-top">
                    <th scope="row" className="px-4 py-3 text-left font-medium text-slate-800">{l.critere}</th>
                    <td className="bg-violet-50/60 px-4 py-3">
                      <Pastille v={l.mea} /> <span className="text-slate-700">{l.meaTexte}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Pastille v={l.dms} /> <span className="text-slate-600">{l.dmsTexte}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Comparatif établi en octobre 2026 à partir des fonctionnalités publiques des éditeurs de la catégorie ; chaque offre varie selon l&apos;abonnement choisi.
          </p>
        </section>

        {/* ------------------------------ Appel ------------------------------ */}
        <section className="mt-12 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-8 text-white sm:p-10">
          <h2 className="!text-white">Vous avez lu jusqu&apos;ici : le plus simple est d&apos;essayer sur un de vos dossiers qui coince.</h2>
          <p className="mt-3 max-w-2xl text-white/85">
            Vingt minutes, à l&apos;atelier ou en visio, sur un vrai dossier en attente de paiement. Vous repartez avec le dossier avancé, abonnement ou pas.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/contact" className="lp-btn-ghost !border-white !bg-white !text-violet-700">Demander une démo</Link>
            <Link href="/#comparateur" className="lp-btn-ghost !border-white/60 !bg-transparent !text-white hover:!bg-white/10">Comparer les formules et les prix</Link>
          </div>
        </section>
      </main>

      <VitrineFooter />
    </div>
  );
}

function Pastille({ v }: { v: Verdict }) {
  const cfg = {
    oui: { txt: "Oui", cls: "bg-emerald-100 text-emerald-700" },
    partiel: { txt: "Partiel", cls: "bg-amber-100 text-amber-700" },
    non: { txt: "Non", cls: "bg-slate-200 text-slate-600" },
  }[v];
  return <span className={`mr-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.cls}`}>{cfg.txt}</span>;
}

/** Icônes simples, trait fin, cohérentes avec l'accueil. */
function IconeDomaine({ nom }: { nom: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const trace: Record<string, React.ReactNode> = {
    dossier: <><path {...p} d="M4 6h6l2 2h8v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z" /><path {...p} d="M4 10h16" /></>,
    document: <><path {...p} d="M7 3h7l5 5v13H7z" /><path {...p} d="M14 3v5h5M10 13h6M10 17h6" /></>,
    poignee: <><path {...p} d="M8 12 5 15a3 3 0 0 0 4 4l3-3M16 12l3-3a3 3 0 0 0-4-4l-3 3" /><path {...p} d="m9 15 6-6" /></>,
    euro: <><path {...p} d="M17 7a6 6 0 1 0 0 10" /><path {...p} d="M5 11h9M5 14h9" /></>,
    cle: <><path {...p} d="M14 7a4 4 0 1 0-3 6.9L5 20l-1-1 6-6" /><path {...p} d="M15 9h.01" /></>,
    voiture: <><path {...p} d="M5 16 6.5 10h11L19 16M3 16h18v3H3zM7 19v1M17 19v1" /></>,
    bulle: <><path {...p} d="M4 5h16v11H9l-5 4z" /><path {...p} d="M8 9h8M8 12h5" /></>,
    bouclier: <><path {...p} d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" /><path {...p} d="m9 12 2 2 4-4" /></>,
    personne: <><circle {...p} cx="12" cy="8" r="4" /><path {...p} d="M4 21a8 8 0 0 1 16 0" /></>,
  };
  return <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">{trace[nom] || trace.dossier}</svg>;
}
