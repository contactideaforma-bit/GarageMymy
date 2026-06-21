"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Dossier, Evenement } from "@/lib/types";
import { formatEuros, formatDate, formatDateTime } from "@/lib/format";
import StatutBadge from "@/components/StatutBadge";
import StatutPipeline from "@/components/StatutPipeline";
import DossierForm from "@/components/DossierForm";
import ConfigBanner from "@/components/ConfigBanner";

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-surface-line last:border-0">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="text-sm font-medium text-ink text-right">
        {value || "—"}
      </span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white border border-surface-line shadow-sm">
      <div className="px-5 py-3 border-b border-surface-line">
        <h2 className="font-semibold text-ink">{title}</h2>
      </div>
      <div className="px-5 py-2">{children}</div>
    </section>
  );
}

export default function DossierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  // mini-form événement
  const [evTitre, setEvTitre] = useState("");
  const [evDate, setEvDate] = useState("");
  const [evDesc, setEvDesc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [d, e] = await Promise.all([
      supabase.from("dossiers").select("*").eq("id", id).single(),
      supabase
        .from("evenements")
        .select("*")
        .eq("dossier_id", id)
        .order("date_evenement", { ascending: true }),
    ]);
    if (d.data) setDossier(d.data as Dossier);
    if (e.data) setEvenements(e.data as Evenement[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatut(s: string) {
    if (!dossier) return;
    setDossier({ ...dossier, statut: s }); // optimiste
    await supabase.from("dossiers").update({ statut: s }).eq("id", dossier.id);
  }

  async function supprimer() {
    if (!dossier) return;
    if (!confirm("Supprimer définitivement ce dossier ?")) return;
    await supabase.from("dossiers").delete().eq("id", dossier.id);
    router.push("/sinistres");
  }

  async function ajouterEvenement(e: React.FormEvent) {
    e.preventDefault();
    if (!evTitre || !evDate) return;
    await supabase.from("evenements").insert({
      dossier_id: id,
      titre: evTitre,
      description: evDesc || null,
      date_evenement: new Date(evDate).toISOString(),
    });
    setEvTitre("");
    setEvDate("");
    setEvDesc("");
    load();
  }

  function rapportUrl(path: string | null): string | null {
    if (!path) return null;
    const { data } = supabase.storage.from("rapports").getPublicUrl(path);
    return data.publicUrl;
  }

  if (loading) {
    return <p className="text-ink-faint">Chargement…</p>;
  }

  if (!dossier) {
    return (
      <div>
        <ConfigBanner />
        <p className="text-ink-soft">
          Dossier introuvable.{" "}
          <Link href="/sinistres" className="text-brand hover:underline">
            Retour à la liste
          </Link>
        </p>
      </div>
    );
  }

  const url = rapportUrl(dossier.rapport_path);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <Link href="/sinistres" className="text-sm text-brand hover:underline">
          ← Sinistres
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">
              Dossier {dossier.numero_sinistre || "sans numéro"}
            </h1>
            <StatutBadge statut={dossier.statut} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowEdit(true)}
              className="rounded-lg border border-surface-line px-4 py-2 text-sm text-ink-soft hover:bg-surface-muted"
            >
              Modifier
            </button>
            <button
              onClick={supprimer}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Supprimer
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <section className="rounded-xl bg-white border border-surface-line shadow-sm p-5">
        <div className="mb-4 text-sm font-medium text-ink-soft">
          Avancement du dossier
        </div>
        <StatutPipeline statut={dossier.statut} onChange={changeStatut} />
        <p className="mt-3 text-xs text-ink-faint">
          Clique sur une étape pour mettre à jour le statut.
        </p>
      </section>

      {/* Infos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Véhicule">
          <InfoRow label="Immatriculation" value={dossier.immatriculation} />
          <InfoRow label="Marque et modèle" value={dossier.marque_modele} />
          <InfoRow label="N° de série (VIN)" value={dossier.numero_serie} />
          <InfoRow
            label="1ère mise en circulation"
            value={formatDate(dossier.premiere_circulation)}
          />
        </Card>

        <Card title="Sinistre">
          <InfoRow label="Date du sinistre" value={formatDate(dossier.date_sinistre)} />
          <InfoRow label="N° de sinistre" value={dossier.numero_sinistre} />
          <InfoRow label="Cabinet d'expert" value={dossier.cabinet_expert} />
          <InfoRow label="Date d'expertise" value={formatDate(dossier.date_expertise)} />
          <InfoRow label="N° police" value={dossier.numero_police} />
          <InfoRow label="Assureur" value={dossier.assureur} />
        </Card>

        <Card title="Client">
          <InfoRow label="Nom et prénom" value={dossier.client_nom} />
          <InfoRow label="Adresse" value={dossier.client_adresse} />
          <InfoRow label="Code postal" value={dossier.client_code_postal} />
          <InfoRow label="Ville" value={dossier.client_ville} />
        </Card>

        <Card title="Suivi & documents">
          <InfoRow label="Montant" value={formatEuros(dossier.montant)} />
          <InfoRow label="Créé le" value={formatDate(dossier.created_at)} />
          <div className="flex justify-between gap-4 py-2">
            <span className="text-sm text-ink-soft">Rapport d&apos;expertise</span>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-brand hover:underline"
              >
                📄 {dossier.rapport_nom || "Voir le PDF"}
              </a>
            ) : (
              <span className="text-sm text-ink-faint">Aucun</span>
            )}
          </div>
        </Card>
      </div>

      {/* Événements liés */}
      <Card title="Événements liés à ce dossier">
        <form
          onSubmit={ajouterEvenement}
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 py-3"
        >
          <input
            className="field-input sm:col-span-1"
            placeholder="Titre (ex. RDV expertise)"
            value={evTitre}
            onChange={(e) => setEvTitre(e.target.value)}
          />
          <input
            type="datetime-local"
            className="field-input"
            value={evDate}
            onChange={(e) => setEvDate(e.target.value)}
          />
          <input
            className="field-input"
            placeholder="Description (optionnel)"
            value={evDesc}
            onChange={(e) => setEvDesc(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            + Ajouter
          </button>
        </form>

        <ul className="divide-y divide-surface-line">
          {evenements.length === 0 && (
            <li className="py-3 text-sm text-ink-faint">Aucun événement.</li>
          )}
          {evenements.map((ev) => (
            <li key={ev.id} className="py-3 flex justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-ink">{ev.titre}</div>
                {ev.description && (
                  <div className="text-sm text-ink-soft">{ev.description}</div>
                )}
              </div>
              <div className="text-xs text-ink-faint whitespace-nowrap">
                {formatDateTime(ev.date_evenement)}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {showEdit && (
        <DossierForm
          dossier={dossier}
          onClose={() => setShowEdit(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
