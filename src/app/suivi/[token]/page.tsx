"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatDate, formatDateTime } from "@/lib/format";
import { labelAngle } from "@/lib/photosEtat";

/**
 * PORTAIL DE SUIVI CLIENT (v48) — page PUBLIQUE.
 *
 * C'est la seule page que verra le particulier : elle porte l'image du
 * garage, pas la nôtre. On reprend donc l'habillage sobre de la vitrine
 * (`landing-pro`) plutôt que le thème rétro interne.
 *
 * Elle répond à la seule question qu'il se pose — « où en est ma
 * voiture ? » — et lui évite d'appeler.
 */

type Etape = { code: string; label: string; faite: boolean; actuelle: boolean };
type Photo = { angle: string; url: string; prise_le: string; moment: string };

type Suivi = {
  garage: {
    nom: string;
    tel: string | null;
    email: string | null;
    ville: string | null;
    adresse: string | null;
    logoUrl: string | null;
    lienAvis: string | null;
  };
  vehicule: { marque_modele: string | null; immatriculation: string | null };
  client: { prenom_nom: string | null };
  suivi: {
    statutLabel: string;
    progression: number;
    auGarage: boolean;
    debut: string | null;
    fin: string | null;
    termine: boolean;
  };
  etapes: Etape[];
  jalons: { titre: string; date_evenement: string }[];
  photos: Photo[];
  aSigner: { type: string; titre: string; token: string }[];
};

export default function SuiviPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<Suivi | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/suivi/${params.token}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) setErreur(json.error || "Ce lien de suivi n'est pas valable.");
        else setData(json as Suivi);
      } catch {
        setErreur("Impossible de charger le suivi. Vérifiez votre connexion.");
      }
      setCharge(true);
    })();
  }, [params.token]);

  if (!charge) {
    return (
      <div className="landing-pro min-h-screen px-4 py-16">
        <div className="mx-auto max-w-2xl space-y-3">
          <div className="skeleton h-8 w-52" />
          <div className="skeleton h-40 w-full" />
        </div>
      </div>
    );
  }

  if (erreur || !data) {
    return (
      <div className="landing-pro flex min-h-screen items-center justify-center px-4">
        <div className="lp-card max-w-md p-8 text-center">
          <div className="text-4xl">🔗</div>
          <h1 className="mt-3 text-xl font-bold">Lien indisponible</h1>
          <p className="mt-2 text-sm text-slate-500">{erreur}</p>
          <p className="mt-4 text-xs text-slate-400">
            Contactez votre carrossier pour recevoir un nouveau lien.
          </p>
        </div>
      </div>
    );
  }

  const { garage, vehicule, suivi, etapes, jalons, photos, aSigner } = data;
  const photosEntree = photos.filter((p) => p.moment === "entree");
  const photosSortie = photos.filter((p) => p.moment === "sortie");

  return (
    <div className="landing-pro min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-5">
        {/* En-tête : c'est le garage qu'on met en avant */}
        <header className="flex items-center gap-3">
          {garage.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={garage.logoUrl} alt={garage.nom} className="h-12 w-12 rounded-lg object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-200 text-xl">🔧</div>
          )}
          <div className="min-w-0">
            <p className="lp-chip">Suivi de réparation</p>
            <h1 className="truncate text-xl font-bold">{garage.nom}</h1>
          </div>
        </header>

        {/* Où en est le véhicule */}
        <section className="lp-card p-5">
          <p className="text-sm text-slate-500">
            {vehicule.marque_modele || "Votre véhicule"}
            {vehicule.immatriculation && (
              <span className="ml-2 rounded border border-slate-300 px-1.5 py-0.5 font-mono text-xs uppercase">
                {vehicule.immatriculation}
              </span>
            )}
          </p>
          <h2 className="mt-2 text-2xl font-bold">{suivi.statutLabel}</h2>

          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all"
              style={{ width: `${suivi.progression}%` }}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
            {suivi.debut && (
              <p>
                <span className="text-slate-400">Début des travaux : </span>
                {formatDate(suivi.debut)}
              </p>
            )}
            {suivi.fin && (
              <p>
                <span className="text-slate-400">
                  {suivi.termine ? "Fin des travaux : " : "Restitution prévue : "}
                </span>
                {formatDate(suivi.fin)}
              </p>
            )}
            <p>
              <span className="text-slate-400">Véhicule : </span>
              {suivi.auGarage ? "actuellement au garage" : suivi.termine ? "restitué" : "pas encore au garage"}
            </p>
          </div>
        </section>

        {/* Ce qui reste à signer */}
        {aSigner.length > 0 && (
          <section className="lp-card border-l-4 border-l-violet-500 p-5">
            <h3 className="text-base font-bold">Un document attend votre signature</h3>
            <p className="mt-1 text-sm text-slate-500">
              La signature se fait depuis ce téléphone, en 30 secondes. Les travaux ne peuvent pas
              démarrer sans elle.
            </p>
            <div className="mt-3 space-y-2">
              {aSigner.map((doc) => (
                <a
                  key={doc.token}
                  href={`/signer/${doc.token}`}
                  className="lp-btn w-full"
                >
                  Signer — {doc.type}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Les étapes */}
        <section className="lp-card p-5">
          <h3 className="mb-3 text-base font-bold">Les étapes</h3>
          <ol className="space-y-2.5">
            {etapes.map((e) => (
              <li key={e.code} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    e.faite ? "bg-emerald-500 text-white" : "border border-slate-300 text-slate-400"
                  }`}
                >
                  {e.faite ? "✓" : ""}
                </span>
                <span
                  className={`text-sm ${
                    e.actuelle ? "font-bold text-slate-900" : e.faite ? "text-slate-600" : "text-slate-400"
                  }`}
                >
                  {e.label}
                  {e.actuelle && <span className="ml-2 text-xs font-normal text-violet-600">en cours</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Photos d'état */}
        {photos.length > 0 && (
          <section className="lp-card p-5">
            <h3 className="text-base font-bold">
              État du véhicule {photosSortie.length > 0 ? "à l'entrée et à la sortie" : "à la prise en charge"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Photos prises et horodatées par le garage. Elles vous protègent autant qu&apos;elles le
              protègent.
            </p>
            {[
              { titre: "À l'entrée", lot: photosEntree },
              { titre: "À la sortie", lot: photosSortie },
            ]
              .filter((g) => g.lot.length > 0)
              .map((g) => (
                <div key={g.titre} className="mt-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {g.titre}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {g.lot.map((p) => (
                      <figure key={p.url} className="overflow-hidden rounded-lg border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={labelAngle(p.angle)} className="h-24 w-full object-cover" />
                        <figcaption className="truncate px-1.5 py-1 text-[10px] text-slate-500">
                          {labelAngle(p.angle)} · {formatDate(p.prise_le)}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              ))}
          </section>
        )}

        {/* Journal */}
        {jalons.length > 0 && (
          <section className="lp-card p-5">
            <h3 className="mb-3 text-base font-bold">Ce qui s&apos;est passé</h3>
            <ul className="space-y-2">
              {jalons.map((j, i) => (
                <li key={`${j.date_evenement}-${i}`} className="flex justify-between gap-3 text-sm">
                  <span className="text-slate-700">{j.titre}</span>
                  <span className="shrink-0 text-slate-400">{formatDateTime(j.date_evenement)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Avis, une fois le véhicule rendu */}
        {suivi.termine && garage.lienAvis && (
          <section className="lp-card border-l-4 border-l-amber-400 p-5 text-center">
            <div className="text-2xl">⭐</div>
            <h3 className="mt-1 text-base font-bold">Content du travail ?</h3>
            <p className="mt-1 text-sm text-slate-500">
              Un avis, c&apos;est deux minutes pour vous et beaucoup pour un garage indépendant.
            </p>
            <a
              href={garage.lienAvis}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-btn mt-3"
            >
              Laisser un avis
            </a>
          </section>
        )}

        {/* Contact */}
        <section className="lp-card p-5">
          <h3 className="text-base font-bold">Une question ?</h3>
          <p className="mt-1 text-sm text-slate-500">
            {garage.nom}
            {garage.adresse ? ` — ${garage.adresse}` : ""}
            {garage.ville ? `, ${garage.ville}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {garage.tel && (
              <a href={`tel:${garage.tel.replace(/\s/g, "")}`} className="lp-btn">
                Appeler {garage.tel}
              </a>
            )}
            {garage.email && (
              <a href={`mailto:${garage.email}`} className="lp-btn-ghost">
                Écrire au garage
              </a>
            )}
          </div>
        </section>

        <p className="pb-6 text-center text-xs text-slate-400">
          Suivi propulsé par My Easy Auto · ce lien est personnel, ne le partagez pas publiquement.
        </p>
      </div>
    </div>
  );
}
