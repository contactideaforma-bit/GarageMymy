"use client";

// MÉMOIRE DE L'ANALYSE (v7.7) — ce que l'appli a appris des corrections du
// garage sur les devis/factures générés depuis un rapport d'expertise.
//
// Le garage garde la main : chaque règle se désactive ou se supprime, et il
// peut en écrire lui-même (« TOLERIE va dans Autres », « n'extrais jamais les
// frais de gestion »). Rien n'est appliqué en douce sur les montants : voir
// l'avertissement en tête de lib/apprentissage.ts.

import { useCallback, useEffect, useState } from "react";
import { IaRegle, TypeRegle } from "@/lib/types";
import { LIBELLE_TYPE_REGLE, SEUIL_APPRENTISSAGE, normaliseCle } from "@/lib/apprentissage";
import {
  basculerRegle,
  chargerRegles,
  compterCorrectionsEnAttente,
  enregistrerRegleManuelle,
  supprimerRegle,
} from "@/lib/apprentissageDb";
import { messageErreur } from "@/lib/format";

const BADGE_TYPE: Record<TypeRegle, string> = {
  libelle: "bg-violet-100 text-violet-700",
  categorie: "bg-teal-100 text-teal-700",
  taux: "bg-amber-100 text-amber-700",
  ignorer: "bg-rose-100 text-rose-700",
  consigne: "bg-blue-100 text-blue-700",
};

const AIDE_TYPE: Record<TypeRegle, string> = {
  libelle: "Le libellé de gauche est réécrit avec celui de droite dans les lignes extraites.",
  categorie: "La ligne est rangée d'office dans ce tableau de la facture.",
  taux: "Taux horaire habituel, utilisé seulement si le rapport est illisible sur ce poste — jamais à la place du rapport.",
  ignorer: "Cette ligne n'est pas reprise dans le chiffrage (sauf si le total du rapport ne tombe plus juste).",
  consigne: "Phrase libre transmise telle quelle à l'analyse.",
};

const CATEGORIES: { key: string; label: string }[] = [
  { key: "piece", label: "Pièces & fournitures" },
  { key: "mo", label: "Main d'œuvre & peinture" },
  { key: "autre", label: "Autres éléments" },
];

export default function MemoireIA() {
  const [regles, setRegles] = useState<IaRegle[]>([]);
  const [enAttente, setEnAttente] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // Formulaire d'ajout manuel
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<TypeRegle>("categorie");
  const [cle, setCle] = useState("");
  const [valeur, setValeur] = useState("mo");
  const [enregistrement, setEnregistrement] = useState(false);

  const recharger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const [r, n] = await Promise.all([chargerRegles(), compterCorrectionsEnAttente()]);
      setRegles(r);
      setEnAttente(n);
    } catch (err) {
      setErreur(
        messageErreur(err, "Mémoire de l'analyse indisponible — la migration v40 est-elle passée ?")
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    recharger();
  }, [recharger]);

  async function ajouter() {
    const c = type === "consigne" ? "consigne" : normaliseCle(cle);
    if (type !== "consigne" && !c) return;
    // « Ligne ignorée » n'a pas de valeur, « Tableau » a toujours une valeur.
    if (type !== "categorie" && type !== "ignorer" && !valeur.trim()) return;
    setEnregistrement(true);
    setErreur(null);
    try {
      await enregistrerRegleManuelle({
        type,
        // Une consigne libre n'a pas de désignation cible : on lui donne une
        // clé unique pour ne pas écraser la précédente.
        cle: type === "consigne" ? `consigne-${Date.now()}` : c,
        valeur: type === "ignorer" ? "" : valeur.trim(),
      });
      setCle("");
      setValeur(type === "categorie" ? "mo" : "");
      setOuvert(false);
      await recharger();
    } catch (err) {
      setErreur(messageErreur(err, "Enregistrement de la règle impossible."));
    } finally {
      setEnregistrement(false);
    }
  }

  async function basculer(r: IaRegle) {
    try {
      await basculerRegle(r.id, !r.actif);
      setRegles((prev) => prev.map((x) => (x.id === r.id ? { ...x, actif: !x.actif } : x)));
    } catch (err) {
      setErreur(messageErreur(err, "Modification impossible."));
    }
  }

  async function retirer(r: IaRegle) {
    if (!confirm("Oublier définitivement cette règle ?")) return;
    try {
      await supprimerRegle(r.id);
      setRegles((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      setErreur(messageErreur(err, "Suppression impossible."));
    }
  }

  const actives = regles.filter((r) => r.actif).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/60">
        Chaque fois que tu corriges un devis ou une facture issus d&apos;un rapport, l&apos;écart est
        noté. Une correction faite <strong className="text-white/80">{SEUIL_APPRENTISSAGE} fois</strong>{" "}
        devient une règle : elle est transmise à l&apos;analyse et appliquée d&apos;office aux rapports
        suivants.
        <span className="mt-1 block text-[11px] text-white/40">
          Les libellés et les tableaux d&apos;affectation sont corrigés automatiquement. Les montants,
          eux, restent TOUJOURS ceux du rapport : un taux appris n&apos;est qu&apos;une indication.
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          {actives} règle{actives > 1 ? "s" : ""} active{actives > 1 ? "s" : ""}
        </span>
        {enAttente > 0 && (
          <span className="text-xs text-white/45">
            {enAttente} correction{enAttente > 1 ? "s" : ""} observée{enAttente > 1 ? "s" : ""} —
            encore une fois et elle{enAttente > 1 ? "s deviennent" : " devient"} une règle.
          </span>
        )}
        <button onClick={() => setOuvert((v) => !v)} className="btn-ghost ml-auto py-1.5 px-3 text-xs">
          {ouvert ? "Annuler" : "+ Écrire une règle"}
        </button>
      </div>

      {ouvert && (
        <div className="glass-soft space-y-3 rounded-xl p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="field-label">Type de règle</label>
              <select
                className="field-input"
                value={type}
                onChange={(e) => {
                  const t = e.target.value as TypeRegle;
                  setType(t);
                  setValeur(t === "categorie" ? "mo" : "");
                }}
              >
                {(Object.keys(LIBELLE_TYPE_REGLE) as TypeRegle[]).map((t) => (
                  <option key={t} value={t}>
                    {LIBELLE_TYPE_REGLE[t]}
                  </option>
                ))}
              </select>
            </div>

            {type !== "consigne" && (
              <div>
                <label className="field-label">Désignation concernée</label>
                <input
                  className="field-input"
                  value={cle}
                  onChange={(e) => setCle(e.target.value)}
                  placeholder="ex : forfait tolerie"
                />
              </div>
            )}

            {type === "categorie" && (
              <div>
                <label className="field-label">Tableau de la facture</label>
                <select className="field-input" value={valeur} onChange={(e) => setValeur(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {type === "libelle" && (
              <div>
                <label className="field-label">Écrire à la place</label>
                <input
                  className="field-input"
                  value={valeur}
                  onChange={(e) => setValeur(e.target.value)}
                  placeholder="ex : Forfait tôlerie"
                />
              </div>
            )}

            {type === "taux" && (
              <div>
                <label className="field-label">Taux horaire habituel (€/h)</label>
                <input
                  type="number"
                  step="0.01"
                  className="field-input"
                  value={valeur}
                  onChange={(e) => setValeur(e.target.value)}
                />
              </div>
            )}

            {type === "consigne" && (
              <div className="sm:col-span-2">
                <label className="field-label">Consigne transmise à l&apos;analyse</label>
                <input
                  className="field-input"
                  value={valeur}
                  onChange={(e) => setValeur(e.target.value)}
                  placeholder="ex : les ingrédients de peinture ont leur propre taux, jamais celui de la peinture"
                />
              </div>
            )}
          </div>

          <p className="text-[11px] text-white/40">{AIDE_TYPE[type]}</p>

          <div className="flex justify-end">
            <button onClick={ajouter} disabled={enregistrement} className="btn-primary py-1.5 px-3 text-xs">
              {enregistrement ? "Enregistrement…" : "Ajouter la règle"}
            </button>
          </div>
        </div>
      )}

      {erreur && (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
          {erreur}
        </div>
      )}

      {chargement && <p className="py-4 text-sm text-white/40">Chargement…</p>}

      {!chargement && regles.length === 0 && !erreur && (
        <p className="glass-soft rounded-xl p-4 text-sm text-white/45">
          Rien en mémoire pour l&apos;instant. Corrige un devis ou une facture généré depuis un
          rapport : dès la deuxième fois, la correction sera retenue et appliquée toute seule.
        </p>
      )}

      {!chargement && regles.length > 0 && (
        <ul className="divide-y divide-white/10">
          {regles.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE_TYPE[r.type]}`}
                  >
                    {LIBELLE_TYPE_REGLE[r.type] || r.type}
                  </span>
                  <span className="truncate text-sm text-white/85">
                    {r.type === "consigne" ? r.valeur : r.cle}
                    {r.type !== "consigne" && r.valeur ? (
                      <span className="text-white/45"> → {r.valeur}</span>
                    ) : null}
                  </span>
                  {r.source === "manuel" && (
                    <span className="text-[10px] uppercase tracking-wide text-white/30">écrite à la main</span>
                  )}
                </div>
                {r.exemple && <p className="mt-0.5 truncate text-[11px] text-white/35">{r.exemple}</p>}
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <span className="text-[11px] text-white/30" title="Nombre de fois observée">
                  ×{r.occurrences}
                </span>
                <button
                  onClick={() => basculer(r)}
                  className={`text-xs hover:underline ${
                    r.actif ? "text-emerald-300" : "text-white/35"
                  }`}
                  title={r.actif ? "Désactiver cette règle" : "Réactiver cette règle"}
                >
                  {r.actif ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => retirer(r)}
                  className="text-white/30 hover:text-rose-300"
                  title="Oublier cette règle"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
