"use client";

// ============================================================
//  ÉCHÉANCE D'UNE TÂCHE (v10.9) — remplace le <input datetime-local>.
//
//  Le sélecteur natif affichait deux colonnes de chiffres SANS dire
//  laquelle était l'heure et laquelle les minutes (retour utilisateur).
//  Ici : trois champs étiquetés en toutes lettres — Date · Heure · Minutes.
//
//  `valeur` garde le format de l'input datetime-local ("AAAA-MM-JJTHH:MM",
//  heure locale, "" = pas d'échéance) : composant ÉCHANGEABLE avec l'ancien
//  input, aucun changement dans localVersIso / isoVersLocal.
// ============================================================

const HEURES = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

export default function ChampEcheance({
  valeur,
  onChange,
  className = "",
}: {
  /** "AAAA-MM-JJTHH:MM" (local) ou "". */
  valeur: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [date, reste] = valeur ? valeur.split("T") : ["", ""];
  const [heure, minute] = reste ? reste.split(":") : ["", ""];

  // Minute libre (ex. 09:37 venant de l'agenda) : on l'affiche telle quelle.
  const minutes = minute && !MINUTES.includes(minute) ? [minute, ...MINUTES] : MINUTES;

  const emettre = (d: string, h: string, m: string) => {
    if (!d) return onChange("");
    // Une date sans heure choisie : 9h00, l'heure par défaut de l'appli.
    onChange(`${d}T${h || "09"}:${m || "00"}`);
  };

  const etiquette = "block text-center text-[9px] font-semibold uppercase tracking-wider text-white/40";

  return (
    // v11.5 — l'ancien `inline-flex` sans repli débordait des colonnes étroites
    // (colonne Tâches de /conversation) : les minutes et la croix sortaient du
    // cadre. Les trois champs se replient maintenant et se partagent la largeur.
    <div className={`flex w-full min-w-0 flex-wrap items-end gap-1 ${className}`}>
      <label className="min-w-0 flex-1 basis-[8.5rem]">
        <span className={etiquette}>Date</span>
        <input
          type="date"
          className="field-input field-compact w-full min-w-0"
          value={date}
          onChange={(e) => emettre(e.target.value, heure, minute)}
        />
      </label>
      <label className="min-w-0 basis-[4.5rem]">
        <span className={etiquette}>Heure</span>
        <select
          className="field-input field-compact w-full min-w-0 disabled:opacity-40"
          value={heure || "09"}
          disabled={!date}
          onChange={(e) => emettre(date, e.target.value, minute)}
          title="Heure (0 à 23)"
        >
          {HEURES.map((h) => (
            <option key={h} value={h}>{h} h</option>
          ))}
        </select>
      </label>
      <label className="min-w-0 basis-[4.5rem]">
        <span className={etiquette}>Minutes</span>
        <select
          className="field-input field-compact w-full min-w-0 disabled:opacity-40"
          value={minute || "00"}
          disabled={!date}
          onChange={(e) => emettre(date, heure, e.target.value)}
          title="Minutes"
        >
          {minutes.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </label>
      {date && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="pb-1.5 text-xs text-white/35 hover:text-rose-300"
          title="Retirer l'échéance"
        >
          ×
        </button>
      )}
    </div>
  );
}
