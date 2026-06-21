"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Evenement } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import ConfigBanner from "@/components/ConfigBanner";

export default function AgendaPage() {
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("evenements")
        .select("*")
        .order("date_evenement", { ascending: true });
      if (data) setEvenements(data as Evenement[]);
      setLoading(false);
    })();
  }, []);

  const now = new Date();
  const aVenir = evenements.filter((e) => new Date(e.date_evenement) >= now);
  const passes = evenements
    .filter((e) => new Date(e.date_evenement) < now)
    .reverse();

  function Liste({ items }: { items: Evenement[] }) {
    if (items.length === 0)
      return <p className="text-sm text-slate-400">Aucun événement.</p>;
    return (
      <ul className="divide-y divide-slate-100">
        {items.map((e) => (
          <li key={e.id} className="py-3">
            <div className="font-medium text-slate-800">{e.titre}</div>
            {e.description && (
              <div className="text-sm text-slate-500">{e.description}</div>
            )}
            <div className="text-xs text-slate-400 mt-0.5">
              {formatDateTime(e.date_evenement)}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Agenda</h1>
      <ConfigBanner />

      {loading ? (
        <p className="text-slate-400">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-3">
              Événements à venir
            </h2>
            <Liste items={aVenir} />
          </section>
          <section className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-3">
              Événements passés
            </h2>
            <Liste items={passes} />
          </section>
        </div>
      )}
    </div>
  );
}
