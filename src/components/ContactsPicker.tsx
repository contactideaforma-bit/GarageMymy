"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Assureur, Client, Expert } from "@/lib/types";
import { formatDate, messageErreur } from "@/lib/format";
import ModalShell from "@/components/ModalShell";

/**
 * CONTACTS (façon carnet d'adresses Apple Mail) :
 * tous les contacts de la base (clients, assurances, experts) avec email,
 * filtrables par catégorie, triables par nom ou date d'ajout.
 * On coche → on écrit un email à la sélection, ou on crée une liste de diffusion.
 */

export type ContactAnnuaire = {
  cle: string; // identifiant unique (table:id[:champ])
  nom: string;
  email: string;
  categorie: "client" | "assurance" | "expert";
  ajout: string; // created_at
};

const CATEGORIES: { id: "tous" | ContactAnnuaire["categorie"]; label: string }[] = [
  { id: "tous", label: "Tous" },
  { id: "client", label: "Clients" },
  { id: "assurance", label: "Assurances" },
  { id: "expert", label: "Experts" },
];

const BADGE: Record<ContactAnnuaire["categorie"], string> = {
  client: "bg-teal-500/20 text-teal-200 border-teal-400/30",
  assurance: "bg-violet-500/20 text-violet-200 border-violet-400/30",
  expert: "bg-pink-500/20 text-pink-200 border-pink-400/30",
};

const LABEL_CAT: Record<ContactAnnuaire["categorie"], string> = {
  client: "Client",
  assurance: "Assurance",
  expert: "Expert",
};

export default function ContactsPicker({
  onClose,
  onEcrire,
  onListeCreee,
}: {
  onClose: () => void;
  /** L'utilisateur veut écrire aux contacts cochés. */
  onEcrire: (contacts: ContactAnnuaire[]) => void;
  /** Une liste de diffusion vient d'être créée (pour rafraîchir ailleurs). */
  onListeCreee?: () => void;
}) {
  const [contacts, setContacts] = useState<ContactAnnuaire[]>([]);
  const [chargement, setChargement] = useState(true);
  const [categorie, setCategorie] = useState<"tous" | ContactAnnuaire["categorie"]>("tous");
  const [tri, setTri] = useState<"nom" | "recent">("nom");
  const [recherche, setRecherche] = useState("");
  const [coches, setCoches] = useState<Set<string>>(new Set());

  // création de liste
  const [creationListe, setCreationListe] = useState(false);
  const [nomListe, setNomListe] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [cli, ass, exp] = await Promise.all([
        supabase.from("clients").select("id,nom,email,created_at").not("email", "is", null),
        supabase.from("assureurs").select("id,nom,email,created_at").not("email", "is", null),
        supabase.from("experts").select("id,cabinet,email,expert_nom,expert_email,created_at"),
      ]);
      const liste: ContactAnnuaire[] = [];
      for (const c of ((cli.data as Client[]) || []))
        if (c.email) liste.push({ cle: `c:${c.id}`, nom: c.nom || "Client", email: c.email, categorie: "client", ajout: c.created_at });
      for (const a of ((ass.data as Assureur[]) || []))
        if (a.email) liste.push({ cle: `a:${a.id}`, nom: a.nom || "Assurance", email: a.email, categorie: "assurance", ajout: a.created_at });
      for (const e of ((exp.data as Expert[]) || [])) {
        if (e.email) liste.push({ cle: `e:${e.id}`, nom: e.cabinet || "Cabinet d'expertise", email: e.email, categorie: "expert", ajout: e.created_at });
        if (e.expert_email && e.expert_email !== e.email)
          liste.push({ cle: `e:${e.id}:p`, nom: e.expert_nom || "Expert", email: e.expert_email, categorie: "expert", ajout: e.created_at });
      }
      setContacts(liste);
      setChargement(false);
    })();
  }, []);

  const visibles = useMemo(() => {
    let l = contacts;
    if (categorie !== "tous") l = l.filter((c) => c.categorie === categorie);
    const q = recherche.trim().toLowerCase();
    if (q) l = l.filter((c) => c.nom.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    return [...l].sort((x, y) =>
      tri === "nom" ? x.nom.localeCompare(y.nom, "fr") : y.ajout.localeCompare(x.ajout)
    );
  }, [contacts, categorie, recherche, tri]);

  const selection = useMemo(
    () => contacts.filter((c) => coches.has(c.cle)),
    [contacts, coches]
  );

  function basculer(cle: string) {
    setCoches((prev) => {
      const s = new Set(prev);
      if (s.has(cle)) s.delete(cle);
      else s.add(cle);
      return s;
    });
  }

  const toutesVisiblesCochees = visibles.length > 0 && visibles.every((c) => coches.has(c.cle));
  function toutCocher() {
    setCoches((prev) => {
      const s = new Set(prev);
      if (toutesVisiblesCochees) visibles.forEach((c) => s.delete(c.cle));
      else visibles.forEach((c) => s.add(c.cle));
      return s;
    });
  }

  async function creerListe() {
    if (!nomListe.trim()) {
      setErreur("Donne un nom à la liste (ex. Assurances partenaires).");
      return;
    }
    setEnregistrement(true);
    setErreur(null);
    // dédoublonne les adresses
    const emails = Array.from(new Set(selection.map((c) => c.email.trim().toLowerCase()))).join(", ");
    const { error } = await supabase.from("listes_diffusion").insert({ nom: nomListe.trim(), emails });
    setEnregistrement(false);
    if (error) {
      setErreur(messageErreur(error, "Création impossible (migration v23 exécutée ?)."));
      return;
    }
    setConfirmation(`Liste « ${nomListe.trim()} » créée (${selection.length} contact${selection.length > 1 ? "s" : ""}).`);
    setCreationListe(false);
    setNomListe("");
    setCoches(new Set());
    onListeCreee?.();
  }

  return (
    <ModalShell title="Contacts" onClose={onClose}>
      {/* Filtres : catégories + tri + recherche */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategorie(c.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              categorie === c.id
                ? "border-white/40 bg-white/20 text-white"
                : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {c.label}
            {c.id !== "tous" && (
              <span className="ml-1 text-white/40">
                {contacts.filter((x) => x.categorie === c.id).length}
              </span>
            )}
          </button>
        ))}
        <select
          className="field-input ml-auto !w-auto py-1 text-xs"
          value={tri}
          onChange={(e) => setTri(e.target.value as "nom" | "recent")}
        >
          <option value="nom">Tri : nom A → Z</option>
          <option value="recent">Tri : ajout récent</option>
        </select>
      </div>

      <input
        className="field-input"
        placeholder="Rechercher un nom ou une adresse email…"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
      />

      {/* Liste des contacts */}
      <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-white/10">
        <label className="flex cursor-pointer items-center gap-3 border-b border-white/10 bg-white/5 px-3 py-2">
          <input type="checkbox" checked={toutesVisiblesCochees} onChange={toutCocher} className="h-4 w-4 accent-teal-400" />
          <span className="text-xs text-white/50">
            {toutesVisiblesCochees ? "Tout décocher" : "Tout cocher"} ({visibles.length} affiché{visibles.length > 1 ? "s" : ""})
          </span>
        </label>

        {chargement && <p className="px-3 py-6 text-center text-sm text-white/40">Chargement…</p>}
        {!chargement && visibles.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-white/40">
            Aucun contact avec email. Les contacts s&apos;ajoutent automatiquement depuis les dossiers, ou via l&apos;Annuaire.
          </p>
        )}
        {visibles.map((c) => (
          <label
            key={c.cle}
            className={`flex cursor-pointer items-center gap-3 border-b border-white/5 px-3 py-2 transition-colors last:border-b-0 ${
              coches.has(c.cle) ? "bg-white/10" : "hover:bg-white/5"
            }`}
          >
            <input
              type="checkbox"
              checked={coches.has(c.cle)}
              onChange={() => basculer(c.cle)}
              className="h-4 w-4 shrink-0 accent-teal-400"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{c.nom}</div>
              <div className="truncate text-xs text-white/50">{c.email}</div>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${BADGE[c.categorie]}`}>
              {LABEL_CAT[c.categorie]}
            </span>
            <span className="hidden shrink-0 text-[10px] text-white/30 sm:block">{formatDate(c.ajout)}</span>
          </label>
        ))}
      </div>

      {confirmation && (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
          {confirmation}
        </div>
      )}
      {erreur && (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{erreur}</div>
      )}

      {/* Création de liste à partir de la sélection */}
      {creationListe ? (
        <div className="glass-soft space-y-3 p-3">
          <div className="text-sm font-semibold text-white">
            Nouvelle liste de diffusion — {selection.length} contact{selection.length > 1 ? "s" : ""} coché{selection.length > 1 ? "s" : ""}
          </div>
          <input
            className="field-input"
            placeholder="Nom de la liste (ex. Assurances partenaires)"
            value={nomListe}
            onChange={(e) => setNomListe(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-3">
            <button onClick={() => setCreationListe(false)} className="btn-ghost">Annuler</button>
            <button onClick={creerListe} disabled={enregistrement} className="btn-primary">
              {enregistrement ? "Création…" : "Créer la liste"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
          <span className="text-sm text-white/50">
            {selection.length === 0
              ? "Coche des contacts pour écrire un email ou créer une liste."
              : `${selection.length} contact${selection.length > 1 ? "s" : ""} sélectionné${selection.length > 1 ? "s" : ""}`}
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => { setConfirmation(null); setCreationListe(true); }}
              disabled={selection.length === 0}
              className="btn-ghost disabled:opacity-40"
            >
              Créer une liste de diffusion
            </button>
            <button
              onClick={() => onEcrire(selection)}
              disabled={selection.length === 0}
              className="btn-primary disabled:opacity-40"
            >
              Écrire un email
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
