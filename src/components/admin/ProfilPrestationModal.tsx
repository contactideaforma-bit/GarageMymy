"use client";

// ====================================================================
//  QUESTIONNAIRE DE PRESTATION (v11.3) — /admin/collaborateurs/[id]
//
//  Rempli AVEC la collaboratrice au moment d'éditer son contrat. Il
//  alimente les annexes 2, 3 et 4 du contrat de prestation :
//    · annexe 2 — périmètre des tâches convenues (ce qui n'est pas
//      coché n'entre pas dans la mission et peut être refusé) ;
//    · annexe 3 — moyens dont ELLE dispose, disponibilités et limites
//      qu'ELLE pose (formulation volontaire : ce sont ses déclarations,
//      pas des consignes — c'est ce qui protège de la requalification) ;
//    · annexe 4 — régime social, qui sert à afficher le NET réel.
//
//  L'aperçu « ce qu'elle touchera vraiment » est affiché en direct :
//  l'entretien doit être transparent sur le brut/net, c'est la demande
//  explicite de l'éditeur et cela évite un litige plus tard.
// ====================================================================

import { useState } from "react";
import ModalShell from "@/components/ModalShell";
import {
  FAMILLES_TACHES, MATERIELS, ProfilPrestation, lireProfil, toutesLesTaches,
} from "@/lib/admin/tachesSecretaire";
import { DATE_TAUX, REGIMES, netAvantImpot, netApresVersementLiberatoire, regimeDe, tauxPrelevements } from "@/lib/admin/remuneration";

const eur2 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProfilPrestationModal({
  valeur,
  tauxHoraire,
  onFermer,
  onEnregistrer,
}: {
  valeur: unknown;
  tauxHoraire: number;
  onFermer: () => void;
  onEnregistrer: (p: ProfilPrestation) => Promise<void> | void;
}) {
  const [p, setP] = useState<ProfilPrestation>(() => lireProfil(valeur));
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const taches = new Set(p.taches || []);
  const materiel = new Set(p.materiel || []);
  const basculer = (set: Set<string>, cle: string, champ: "taches" | "materiel") => {
    const n = new Set(set);
    if (n.has(cle)) n.delete(cle);
    else n.add(cle);
    setP((v) => ({ ...v, [champ]: Array.from(n) }));
  };
  const maj = (champ: keyof ProfilPrestation, v: unknown) => setP((x) => ({ ...x, [champ]: v }));

  const regime = regimeDe(p.regime);
  const net = netAvantImpot(tauxHoraire, regime);
  const netVl = netApresVersementLiberatoire(tauxHoraire, regime);

  async function enregistrer() {
    setBusy(true);
    setErreur(null);
    try {
      await onEnregistrer(p);
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Questionnaire de prestation — à remplir avec la collaboratrice" onClose={onFermer} maxWidth="max-w-4xl">
      <div className="space-y-5 px-6 py-5">
        {erreur && <p className="badge badge-danger">{erreur}</p>}

        {/* ---------------- Périmètre des tâches ---------------- */}
        <section>
          <h3 className="font-semibold text-white">1. Périmètre des tâches convenues</h3>
          <p className="mb-2 text-xs text-white/45">
            Coche UNIQUEMENT ce qu&apos;elle accepte de prendre en charge. Tout ce qui n&apos;est pas coché
            n&apos;entre pas dans la mission : elle pourra le refuser sans que ce soit une faute (annexe 2 du contrat).
            <b> {taches.size} / {toutesLesTaches().length} tâches cochées.</b>
          </p>
          <div className="space-y-3">
            {FAMILLES_TACHES.map((f) => (
              <div key={f.cle} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white/85">{f.titre}</span>
                  <button
                    type="button"
                    className="text-xs text-accent-teal hover:underline"
                    onClick={() => {
                      const cles = f.taches.map((t) => t.cle);
                      const tout = cles.every((k) => taches.has(k));
                      const n = new Set(taches);
                      cles.forEach((k) => (tout ? n.delete(k) : n.add(k)));
                      setP((v) => ({ ...v, taches: Array.from(n) }));
                    }}
                  >
                    {f.taches.every((t) => taches.has(t.cle)) ? "Tout décocher" : "Tout cocher"}
                  </button>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {f.taches.map((t) => (
                    <label key={t.cle} className="flex cursor-pointer items-start gap-2 text-xs text-white/75">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0"
                        checked={taches.has(t.cle)}
                        onChange={() => basculer(taches, t.cle, "taches")}
                      />
                      <span className="min-w-0">
                        {t.libelle}
                        {t.detail && <span className="block text-[0.9em] text-white/40">{t.detail}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- Moyens ---------------- */}
        <section>
          <h3 className="font-semibold text-white">2. Moyens dont elle dispose</h3>
          <p className="mb-2 text-xs text-white/45">
            Ce sont SES moyens, pas du matériel fourni : c&apos;est un point clé de son indépendance.
            L&apos;éditeur ne fournit que l&apos;accès à la plateforme et la formation.
          </p>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {MATERIELS.map((m) => (
              <label key={m.cle} className="flex cursor-pointer items-center gap-2 text-xs text-white/75">
                <input type="checkbox" className="h-4 w-4 shrink-0" checked={materiel.has(m.cle)} onChange={() => basculer(materiel, m.cle, "materiel")} />
                <span className="min-w-0">{m.libelle}</span>
              </label>
            ))}
          </div>
          <label className="mt-2 block text-xs text-white/60">
            Autre matériel (texte libre)
            <input className="field-input mt-0.5" value={p.materiel_autre || ""} onChange={(e) => maj("materiel_autre", e.target.value)} placeholder="ex. imprimante A3, second poste" />
          </label>
        </section>

        {/* ---------------- Disponibilités, limites, contraintes ---------------- */}
        <section>
          <h3 className="font-semibold text-white">3. Ce qu&apos;elle annonce, ce qu&apos;elle pose comme limites</h3>
          <p className="mb-2 text-xs text-white/45">
            À rédiger de SON point de vue (« je suis joignable… », « je ne prends pas… »). Ce ne sont pas des horaires imposés :
            elle organise librement son temps. Ces lignes bornent ce qu&apos;on peut lui demander.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-white/60">
              Disponibilités annoncées
              <input className="field-input mt-0.5" value={p.disponibilites || ""} onChange={(e) => maj("disponibilites", e.target.value)} placeholder="ex. joignable du lundi au vendredi en journée" />
            </label>
            <label className="block text-xs text-white/60">
              Volume maximum accepté (h / mois, toutes affectations)
              <input type="number" min="0" step="1" inputMode="numeric" className="field-input mt-0.5 text-right tabular-nums" value={p.heures_max_mois ?? ""} onChange={(e) => maj("heures_max_mois", e.target.value === "" ? null : Number(e.target.value))} placeholder="ex. 80" />
            </label>
            <label className="block text-xs text-white/60 sm:col-span-2">
              Limites qu&apos;elle pose
              <textarea className="field-input mt-0.5" rows={2} value={p.limites || ""} onChange={(e) => maj("limites", e.target.value)} placeholder="ex. pas de week-end, pas d'accueil téléphonique, 3 garages maximum" />
            </label>
            <label className="block text-xs text-white/60 sm:col-span-2">
              Contraintes à connaître
              <textarea className="field-input mt-0.5" rows={2} value={p.contraintes || ""} onChange={(e) => maj("contraintes", e.target.value)} placeholder="ex. congés en août, délai de réponse 24 h, autre client le mercredi" />
            </label>
          </div>
        </section>

        {/* ---------------- Régime et rémunération réelle ---------------- */}
        <section>
          <h3 className="font-semibold text-white">4. Régime social et rémunération réelle</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block text-xs text-white/60">
              Régime déclaré
              <select className="field-input mt-0.5" value={p.regime || "bic"} onChange={(e) => maj("regime", e.target.value)}>
                {Object.values(REGIMES).map((r) => (
                  <option key={r.cle} value={r.cle}>{r.libelle}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-white/60">
              Assurance RC pro (assureur, n° police)
              <input className="field-input mt-0.5" value={p.rc_pro || ""} onChange={(e) => maj("rc_pro", e.target.value)} />
            </label>
            <label className="block text-xs text-white/60">
              Attestation de vigilance URSSAF remise le
              <input type="date" className="field-input mt-0.5" value={p.vigilance_le || ""} onChange={(e) => maj("vigilance_le", e.target.value)} />
            </label>
          </div>
          <p className="mt-1 text-[11px] text-white/40">{regime.aide}</p>

          <div className="alerte alerte-info mt-3 text-xs">
            <div className="alerte-titre">Ce qu&apos;elle percevra réellement — à dire pendant l&apos;entretien</div>
            <p className="mt-1">
              Le taux de <b>{eur2(tauxHoraire)} € HT / heure</b> est un revenu <b>BRUT</b> (son chiffre d&apos;affaires).
              Aucune retenue n&apos;est faite : elle paie ensuite l&apos;URSSAF ({eur2(tauxPrelevements(regime))} % au {DATE_TAUX}) puis son impôt.
            </p>
            <ul className="ml-4 mt-1 list-disc">
              <li>Net avant impôt : <b>{eur2(net)} € / heure</b></li>
              <li>Net après versement libératoire de l&apos;impôt (si elle a opté) : <b>{eur2(netVl)} € / heure</b></li>
              <li>Sur un forfait de 20 h / mois : {eur2(tauxHoraire * 20)} € brut → <b>{eur2(netAvantImpot(tauxHoraire * 20, regime))} € net</b> avant impôt</li>
            </ul>
            <p className="mt-1 opacity-80">Taux fixés par la loi, susceptibles d&apos;évoluer. Le guide de déclaration de revenus lui est remis avec le contrat.</p>
          </div>
        </section>

        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <button className="btn-primary" onClick={enregistrer} disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer le questionnaire"}
          </button>
          <button className="btn-ghost" onClick={onFermer}>Annuler</button>
          <span className="self-center text-xs text-white/40">Le contrat généré ensuite reprendra ces réponses dans ses annexes.</span>
        </div>
      </div>
    </ModalShell>
  );
}
