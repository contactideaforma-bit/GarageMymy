"use client";

// SESSION D'APPELS (v12.9) — le mode « démarchage » du commercial.
// La file du jour est calculée toute seule : rappels en retard / du jour,
// puis garages jamais appelés, puis rappels à venir. Un garage à la fois :
// le numéro en grand, le script en 5 temps sous les yeux, et le résultat en
// un clic → la fiche se met à jour, le suivant s'affiche.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import InteractionModal from "@/components/InteractionModal";
import StatCard from "@/components/StatCard";
import { formatDate, messageErreur } from "@/lib/format";
import { Prospect, ProspectInteraction, RESULTATS_CONTACT, chargerInteractionsRecentes, chargerProspects, etatRappel, fileAppels, jamaisContacte, liensRecherche } from "@/lib/prospects";

const SCRIPT: { t: string; d: string }[] = [
  { t: "1 · Qui je suis", d: "Nom, société, le sujet en 6 mots : « au sujet des dossiers d'assurance de la carrosserie »." },
  { t: "2 · La question", d: "« Entre le rapport de l'expert et le virement de l'assurance, ça vous prend combien de temps ? Combien de dossiers traînent depuis plus de deux mois ? »" },
  { t: "3 · La promesse", d: "« Une application qui lit le rapport et sort devis et facture toute seule, et un chargé de mission qui appelle l'assurance à votre place jusqu'à ce que ça paie. »" },
  { t: "4 · L'alternative", d: "« Je passe vous le montrer sur un de VOS rapports, 20 minutes. Plutôt jeudi 8 h 30 ou mardi 13 h 30 ? »" },
  { t: "5 · Le verrouillage", d: "Jour, heure, lieu, durée. Son portable pour le SMS de confirmation. Un rapport d'expertise récent sous la main." },
];

export default function DemarchagePage() {
  const router = useRouter();
  const [liste, setListe] = useState<Prospect[]>([]);
  const [recentes, setRecentes] = useState<ProspectInteraction[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [courant, setCourant] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [session, setSession] = useState({ appels: 0, rdv: 0, refus: 0 });

  useEffect(() => {
    Promise.all([chargerProspects(), chargerInteractionsRecentes(7)])
      .then(([p, i]) => { setListe(p); setRecentes(i); })
      .catch((e) => setErr(messageErreur(e, "Lecture impossible (migration v71 ?).")))
      .finally(() => setLoading(false));
  }, []);

  const file = useMemo(() => fileAppels(liste), [liste]);
  const p = file.find((x) => x.id === courant) || file[0] || null;

  const auj = new Date().toISOString().slice(0, 10);
  const appelsAuj = recentes.filter((i) => i.canal === "appel" && i.created_at.slice(0, 10) === auj).length;
  const rdvSemaine = recentes.filter((i) => i.resultat === "rdv").length;
  const appelsSemaine = recentes.filter((i) => i.canal === "appel").length;

  function apresContact(n: Prospect, resultat?: string) {
    setListe((l) => l.map((x) => (x.id === n.id ? n : x)));
    setSession((s) => ({ appels: s.appels + 1, rdv: s.rdv + (n.dernier_resultat === "rdv" ? 1 : 0), refus: s.refus + (n.dernier_resultat === "refus" || n.dernier_resultat === "injoignable" ? 1 : 0) }));
    void resultat;
    // suivant dans la file
    const idx = file.findIndex((x) => x.id === n.id);
    const suivant = file[idx + 1] || file.find((x) => x.id !== n.id) || null;
    setCourant(suivant?.id || null);
    setModal(false);
    chargerInteractionsRecentes(7).then(setRecentes).catch(() => null);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={() => router.push("/prospects")} className="text-xs text-white/50 hover:underline">← Mes clients</button>
          <h1 className="titre-page">Session d&apos;appels</h1>
          <p className="text-sm text-white/50">Objectif d&apos;une session : 45 minutes d&apos;affilée, 15 appels, 1 rendez-vous.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="badge badge-neutral">Cette session : {session.appels} contact{session.appels > 1 ? "s" : ""}</span>
          {session.rdv > 0 && <span className="badge badge-ok">{session.rdv} RDV</span>}
        </div>
      </div>
      {err && <p className="badge badge-danger mb-3">{err}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Dans la file" value={String(file.length)} hint="à appeler maintenant" accent="violet" />
        <StatCard label="Appels aujourd'hui" value={String(appelsAuj)} hint="notés dans le journal" accent="pink" />
        <StatCard label="Appels sur 7 jours" value={String(appelsSemaine)} hint="objectif : 60 par semaine" accent="amber" />
        <StatCard label="RDV sur 7 jours" value={String(rdvSemaine)} hint={appelsSemaine ? `${Math.round((rdvSemaine / appelsSemaine) * 100)} % des appels` : "objectif : 4 par semaine"} accent="teal" />
      </div>

      {loading ? (
        <p className="text-sm text-white/40">Chargement…</p>
      ) : !p ? (
        <div className="glass-card p-6 text-sm text-white/60">
          🎉 File vide : aucun rappel en attente et tous vos garages ont été contactés. Ajoutez de nouveaux garages depuis « Mes clients » (+ Nouveau client) pour remplir la prochaine session.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* ---- Le garage en cours ---- */}
          <div className="space-y-4">
            <div className="glass-card border border-accent-pink/40 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {etatRappel(p) === "echu" && <span className="badge badge-danger">Rappel en retard · {formatDate(p.prochaine_date!)}</span>}
                {etatRappel(p) === "aujourdhui" && <span className="badge badge-warn">À rappeler aujourd&apos;hui</span>}
                {etatRappel(p) === "bientot" && <span className="badge badge-warn">Rappel prévu le {formatDate(p.prochaine_date!)}</span>}
                {jamaisContacte(p) && <span className="badge badge-info">Jamais appelé</span>}
                {p.nb_appels ? <span className="text-white/50">{p.nb_appels} appel{p.nb_appels > 1 ? "s" : ""} déjà passé{p.nb_appels > 1 ? "s" : ""}</span> : null}
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">{p.nom}</h2>
              <p className="text-sm text-white/60">{[p.adresse, `${p.cp || ""} ${p.ville || ""}`.trim()].filter(Boolean).join(" · ")}</p>
              <p className="mt-1 text-sm text-white/80">{p.contact_nom || p.gerant ? `Demander : ${p.contact_nom || p.gerant}${p.contact_fonction ? ` (${p.contact_fonction})` : ""}` : "Nom du patron inconnu — le demander à l'accueil"}</p>

              {p.tel ? (
                <a href={`tel:${p.tel.replace(/\s/g, "")}`} className="btn-primary mt-4 block w-full py-4 text-center text-xl">📞 {p.tel}</a>
              ) : (
                <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm">
                  <div>Pas de numéro sur la fiche : trouve-le ici puis enregistre-le depuis la fiche.</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {liensRecherche(p).slice(0, 3).map((l) => (
                      <a key={l.key} href={l.url} target="_blank" rel="noreferrer" className="btn-ghost btn-compact" title={l.aide}>{l.icone} {l.label}</a>
                    ))}
                  </div>
                </div>
              )}

              {p.prochaine_action && (
                <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-sm"><span className="text-white/50">Pourquoi cet appel :</span> {p.prochaine_action}</p>
              )}
              {p.dernier_resultat && p.dernier_contact && (
                <p className="mt-2 text-xs text-white/50">Dernier contact {formatDate(p.dernier_contact)} : {RESULTATS_CONTACT[p.dernier_resultat].label}</p>
              )}
              {p.notes && <p className="mt-2 text-xs text-white/60">📝 {p.notes}</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-primary" onClick={() => setModal(true)}>✅ Noter le résultat</button>
                <button className="btn-ghost" onClick={() => router.push(`/prospects/${p.id}`)}>Ouvrir la fiche</button>
                <button className="btn-ghost" onClick={() => { const i = file.findIndex((x) => x.id === p.id); setCourant(file[i + 1]?.id || file[0]?.id || null); }}>Passer →</button>
              </div>
            </div>

            <div className="glass-card p-4">
              <h3 className="titre-bloc">Le script en 5 temps</h3>
              <ol className="mt-2 space-y-2 text-sm">
                {SCRIPT.map((s) => (
                  <li key={s.t} className="flex gap-2"><span className="shrink-0 font-semibold text-accent-pink">{s.t}</span><span className="text-white/75">{s.d}</span></li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-white/45">Un appel = un rendez-vous. Pas de prix au téléphone, pas de liste de fonctions. Deux objections maximum, puis une date de rappel.</p>
            </div>
          </div>

          {/* ---- La file ---- */}
          <div className="glass-card p-4">
            <h3 className="titre-bloc">La file du jour ({file.length})</h3>
            <ul className="mt-2 max-h-[70vh] divide-y divide-white/10 overflow-y-auto">
              {file.map((x) => {
                const e = etatRappel(x);
                return (
                  <li key={x.id}>
                    <button onClick={() => setCourant(x.id)} className={`w-full px-2 py-2 text-left text-sm hover:bg-white/5 ${x.id === p.id ? "bg-white/10" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-white">{x.nom}</span>
                        <span className={`badge ${e === "echu" ? "badge-danger" : e === "aujourdhui" ? "badge-warn" : jamaisContacte(x) ? "badge-info" : "badge-neutral"}`}>
                          {e === "echu" ? "retard" : e === "aujourdhui" ? "aujourd'hui" : jamaisContacte(x) ? "nouveau" : x.prochaine_date ? formatDate(x.prochaine_date) : "à suivre"}
                        </span>
                      </div>
                      <div className="truncate text-xs text-white/50">{[x.ville, x.tel, x.prochaine_action].filter(Boolean).join(" · ")}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {modal && p && <InteractionModal prospect={p} onClose={() => setModal(false)} onSaved={(n) => apresContact(n)} />}
    </div>
  );
}
