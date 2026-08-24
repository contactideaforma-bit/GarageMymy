"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchAuth, lireReponse } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { TicketAdmin, TicketMessage } from "@/lib/types";
import {
  STATUTS_TICKET,
  estAdmin,
  estOuvert,
  iconeCategorie,
  infoGravite,
  infoStatut,
  labelCategorie,
  resumeNavigateur,
} from "@/lib/support";
import StatCard from "@/components/StatCard";
import IncidentsPanel from "@/components/IncidentsPanel";

/**
 * CONSOLE D'ASSISTANCE (v43) — réservée à l'éditeur.
 *
 * Tous les tickets de tous les garages, le fil de discussion et la
 * réponse. Le garage est prévenu automatiquement (notification + email)
 * dès qu'on répond ou qu'on change le statut.
 *
 * ⚠️ Le contrôle d'accès qui COMPTE est côté serveur (/api/support/admin,
 * variable ADMIN_EMAILS). Ici, on masque simplement l'écran.
 */

type Filtre = "ouverts" | "tous" | "nouveau" | "en_cours" | "resolu" | "ferme";

export default function SupportAdminPage() {
  const [autorise, setAutorise] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<TicketAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [filtre, setFiltre] = useState<Filtre>("ouverts");
  const [recherche, setRecherche] = useState("");

  const [ouvert, setOuvert] = useState<TicketAdmin | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [reponse, setReponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAutorise(estAdmin(data.user?.email)));
  }, []);

  const charger = useCallback(async () => {
    setLoading(true);
    const res = await fetchAuth("/api/support/admin");
    const { ok, data, error } = await lireReponse<{ tickets: TicketAdmin[] }>(res);
    if (!ok) setErreur(error);
    else {
      setTickets(data?.tickets || []);
      setErreur(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (autorise) charger();
  }, [autorise, charger]);

  async function ouvrir(t: TicketAdmin) {
    setOuvert(t);
    setReponse("");
    setInfo(null);
    const res = await fetchAuth(`/api/support/admin?id=${t.id}`);
    const { ok, data } = await lireReponse<{ ticket: TicketAdmin; messages: TicketMessage[] }>(res);
    if (ok && data) {
      setMessages(data.messages);
      setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, lu_admin: true } : x)));
    }
  }

  async function envoyer(statut?: string) {
    if (!ouvert || busy) return;
    if (!reponse.trim() && !statut) return;
    setBusy(true);
    setInfo(null);
    const res = await fetchAuth("/api/support/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: ouvert.id, message: reponse.trim() || undefined, statut }),
    });
    const { ok, data, error } = await lireReponse<{ message: TicketMessage | null; statut: string }>(res);
    if (!ok) setInfo(error);
    else {
      if (data?.message) setMessages((prev) => [...prev, data.message as TicketMessage]);
      const nouveauStatut = data?.statut || ouvert.statut;
      setOuvert({ ...ouvert, statut: nouveauStatut });
      setTickets((prev) =>
        prev.map((x) => (x.id === ouvert.id ? { ...x, statut: nouveauStatut, lu_admin: true } : x))
      );
      setReponse("");
      setInfo("Envoyé — le garage a été prévenu.");
    }
    setBusy(false);
  }

  /* ------------------------------ Données ---------------------------- */

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filtre === "ouverts" && !estOuvert(t)) return false;
      if (filtre !== "ouverts" && filtre !== "tous" && t.statut !== filtre) return false;
      if (!q) return true;
      return [t.sujet, t.description, t.numero, t.entreprise_nom, t.compte_email, t.garage_nom]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [tickets, filtre, recherche]);

  const nonLus = tickets.filter((t) => !t.lu_admin).length;
  const bloquants = tickets.filter((t) => estOuvert(t) && t.gravite === "bloquant").length;
  const garages = new Set(tickets.map((t) => t.owner_id)).size;

  if (autorise === null) return <p className="text-sm text-white/50">Vérification du compte…</p>;

  if (!autorise) {
    return (
      <div className="glass-card p-6 text-center">
        <div className="text-3xl">🔒</div>
        <h1 className="titre-page mt-2">Console d&apos;assistance</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
          Cet écran est réservé à l&apos;éditeur de l&apos;application. Pour signaler un problème,
          utilisez « Aide &amp; incidents ».
        </p>
      </div>
    );
  }

  const onglet = (v: Filtre, label: string) => (
    <button
      key={v}
      onClick={() => setFiltre(v)}
      className={`segment-btn ${filtre === v ? "actif" : ""}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titre-page">Console d&apos;assistance</h1>
          <p className="mt-1 text-xs text-white/50">
            Tickets de tous les garages · réponse instantanée côté client (notification + email).
          </p>
        </div>
        <button onClick={charger} className="btn-ghost btn-compact">
          Rafraîchir
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard accent="pink" icone="🔔" label="Non lus" value={String(nonLus)} hint="jamais ouverts" />
        <StatCard accent="amber" icone="🚨" label="Bloquants ouverts" value={String(bloquants)} hint="à traiter en priorité" />
        <StatCard accent="violet" icone="🎫" label="Tickets ouverts" value={String(tickets.filter(estOuvert).length)} hint="reçus ou en cours" />
        <StatCard accent="teal" icone="🏭" label="Garages concernés" value={String(garages)} hint="comptes distincts" />
      </div>

      {erreur && (
        <div className="mb-4 rounded-lg border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm text-rose-200">
          {erreur}
        </div>
      )}

      {/* Pilotage de la page publique d'état du service (v45) */}
      <div className="mb-6">
        <IncidentsPanel />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="segment">
          {onglet("ouverts", "À traiter")}
          {onglet("nouveau", "Reçus")}
          {onglet("en_cours", "En cours")}
          {onglet("resolu", "Résolus")}
          {onglet("tous", "Tous")}
        </div>
        <input
          className="field-input field-compact flex-1 sm:max-w-xs"
          placeholder="Rechercher (garage, sujet, n°…)"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
        <section className="glass-card p-3 sm:p-4">
          <h2 className="titre-section mb-3">
            {visibles.length} ticket{visibles.length > 1 ? "s" : ""}
          </h2>
          {loading ? (
            <div className="space-y-2">
              <div className="skeleton h-20 w-full" />
              <div className="skeleton h-20 w-full" />
              <div className="skeleton h-20 w-full" />
            </div>
          ) : visibles.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/45">
              Rien dans cette vue. Bonne nouvelle.
            </p>
          ) : (
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {visibles.map((t) => (
                <button
                  key={t.id}
                  onClick={() => ouvrir(t)}
                  className={`carte-liste w-full p-3 text-left ${ouvert?.id === t.id ? "carte-liste-active" : ""}`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-start gap-2">
                      <span className="text-base leading-none">{iconeCategorie(t.categorie)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">
                          {t.sujet}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-white/50">
                          {t.entreprise_nom || t.garage_nom || "Garage"} · {t.compte_email || "—"}
                        </span>
                      </span>
                    </span>
                    {!t.lu_admin && <span className="pastille-neuve" title="Non lu" />}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={infoStatut(t.statut).badge}>{infoStatut(t.statut).label}</span>
                    <span className={infoGravite(t.gravite).badge}>{infoGravite(t.gravite).label}</span>
                    <span className="text-[10px] text-white/35">{formatDateTime(t.created_at)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="glass-card p-3 sm:p-4">
          {!ouvert ? (
            <div className="py-10 text-center">
              <div className="text-3xl">🛠️</div>
              <p className="mt-2 text-sm text-white/55">
                Sélectionnez un ticket pour lire le fil et répondre.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="titre-bloc break-words">{ouvert.sujet}</h2>
                  <p className="mt-1 text-[11px] text-white/45">
                    {ouvert.numero} · {labelCategorie(ouvert.categorie)} ·{" "}
                    {formatDateTime(ouvert.created_at)}
                  </p>
                </div>
                <span className={infoStatut(ouvert.statut).badge}>
                  {infoStatut(ouvert.statut).label}
                </span>
              </div>

              {/* Fiche technique du signalement */}
              <div className="glass-soft mb-3 grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg p-3 text-[11px] text-white/60 sm:grid-cols-2">
                <div>
                  <span className="text-white/40">Garage : </span>
                  {ouvert.entreprise_nom || ouvert.garage_nom || "—"}
                </div>
                <div>
                  <span className="text-white/40">Compte : </span>
                  {ouvert.compte_email || "—"}
                </div>
                <div>
                  <span className="text-white/40">Rappeler : </span>
                  {ouvert.contact_tel || "—"} · {ouvert.contact_email || "—"}
                </div>
                <div>
                  <span className="text-white/40">Version : </span>v{ouvert.version_app || "?"}
                </div>
                <div>
                  <span className="text-white/40">Page : </span>
                  {ouvert.page || "—"}
                </div>
                <div>
                  <span className="text-white/40">Appareil : </span>
                  {resumeNavigateur(ouvert.navigateur)}
                </div>
              </div>

              <div className="max-h-[42vh] space-y-2.5 overflow-y-auto pr-1">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg border-2 p-3 text-sm ${
                      m.auteur === "support"
                        ? "border-accent-teal/40 bg-white/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-white/70">
                        {m.auteur === "support" ? "Vous (assistance)" : ouvert.entreprise_nom || "Le garage"}
                      </span>
                      <span className="text-white/35">{formatDateTime(m.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-white/85">{m.message}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3">
                <textarea
                  className="field-input min-h-[100px]"
                  placeholder="Votre réponse au garage… (elle lui arrive par notification et par email)"
                  value={reponse}
                  onChange={(e) => setReponse(e.target.value)}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button onClick={() => envoyer()} disabled={busy || !reponse.trim()} className="btn-primary btn-compact">
                    Répondre
                  </button>
                  {STATUTS_TICKET.filter((s) => s.code !== ouvert.statut).map((s) => (
                    <button
                      key={s.code}
                      onClick={() => envoyer(s.code)}
                      disabled={busy}
                      className="btn-ghost btn-compact"
                      title={`Passer le ticket en « ${s.label} »`}
                    >
                      → {s.label}
                    </button>
                  ))}
                </div>
                {info && <p className="mt-2 text-xs text-accent-teal">{info}</p>}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
