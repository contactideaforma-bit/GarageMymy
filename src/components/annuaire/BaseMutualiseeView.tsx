"use client";

// ============================================================
//  BASE MUTUALISÉE DANS LA BASE DE DONNÉES (v13.56) — onglet réservé à
//  l'éditeur (compte admin) : tous les experts et assureurs connus de
//  l'ensemble des garages, avec un bouton « Charger / actualiser » qui
//  lance la consolidation, et « Ajouter à ma base » pour copier un contact
//  dans ses propres fiches (source « mutualise »). Les clients ne sont
//  jamais concernés.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { messageErreur } from "@/lib/format";
import { consoliderAnnuaire, lireTable } from "@/lib/admin/client";
import { normaliserTexte, type MutualiseAssureur, type MutualiseExpert } from "@/lib/admin/annuaireMutualise";
import CarteContact, { LigneContact, formaterTel, lienCarte, lienTelephone } from "@/components/annuaire/CarteContact";
import { BarreAnnuaire, GrilleContacts, type TriAnnuaire } from "@/components/annuaire/GrilleContacts";
import Ico from "@/components/Ico";

type Famille = "experts" | "assureurs";

export default function BaseMutualiseeView() {
  const [famille, setFamille] = useState<Famille>("experts");
  const [experts, setExperts] = useState<MutualiseExpert[]>([]);
  const [assureurs, setAssureurs] = useState<MutualiseAssureur[]>([]);
  const [mesExperts, setMesExperts] = useState<Set<string>>(new Set());
  const [mesAssureurs, setMesAssureurs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tri, setTri] = useState<TriAnnuaire>("az");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, a, me, ma] = await Promise.all([
        lireTable<MutualiseExpert>("mutualise_experts"),
        lireTable<MutualiseAssureur>("mutualise_assureurs"),
        supabase.from("experts").select("cabinet, email, tel"),
        supabase.from("assureurs").select("nom, email, tel"),
      ]);
      setExperts(e); setAssureurs(a);
      setMesExperts(new Set(((me.data as { cabinet: string | null; email: string | null; tel: string | null }[]) || []).map((x) => normaliserTexte(x.email || x.tel || x.cabinet))));
      setMesAssureurs(new Set(((ma.data as { nom: string | null; email: string | null; tel: string | null }[]) || []).map((x) => normaliserTexte(x.email || x.tel || x.nom))));
      setErreur(null);
    } catch (e) { setErreur(e instanceof Error ? e.message : "Lecture impossible."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function charger() {
    setBusy(true); setInfo(null);
    try {
      const r = await consoliderAnnuaire();
      setInfo(`${r.lus.experts} fiches expert et ${r.lus.assureurs} fiches assureur lues chez les garages → ${r.experts} cabinets et ${r.assureurs} assureurs distincts.`);
      await load();
    } catch (e) { setErreur(`Chargement impossible — ${e instanceof Error ? e.message : "erreur"}.`); }
    finally { setBusy(false); }
  }

  const dejaExpert = (r: MutualiseExpert) => mesExperts.has(normaliserTexte(r.email || r.tel || r.cabinet));
  const dejaAssureur = (r: MutualiseAssureur) => mesAssureurs.has(normaliserTexte(r.email || r.tel || r.nom));

  async function ajouterExpert(r: MutualiseExpert) {
    const { error } = await supabase.from("experts").insert({ cabinet: r.cabinet, adresse: r.adresse, code_postal: r.code_postal, ville: r.ville, tel: r.tel, email: r.email, expert_nom: r.expert_nom, expert_tel: r.expert_tel, expert_email: r.expert_email, notes: r.notes, source: "mutualise" });
    if (error) return alert(messageErreur(error, "Ajout impossible."));
    setMesExperts((s) => new Set(s).add(normaliserTexte(r.email || r.tel || r.cabinet)));
  }
  async function ajouterAssureur(r: MutualiseAssureur) {
    const { error } = await supabase.from("assureurs").insert({ nom: r.nom, adresse: r.adresse, code_postal: r.code_postal, ville: r.ville, tel: r.tel, email: r.email, siren: r.siren, notes: r.notes, source: "mutualise" });
    if (error) return alert(messageErreur(error, "Ajout impossible."));
    setMesAssureurs((s) => new Set(s).add(normaliserTexte(r.email || r.tel || r.nom)));
  }

  const terme = normaliserTexte(q);
  const expertsVisibles = useMemo(() => (terme ? experts.filter((r) => normaliserTexte([r.cabinet, r.expert_nom, r.ville, r.email, r.tel].join(" ")).includes(terme)) : experts), [experts, terme]);
  const assureursVisibles = useMemo(() => (terme ? assureurs.filter((r) => normaliserTexte([r.nom, r.ville, r.email, r.tel, r.siren].join(" ")).includes(terme)) : assureurs), [assureurs, terme]);
  const total = famille === "experts" ? experts.length : assureurs.length;
  const visibles = famille === "experts" ? expertsVisibles.length : assureursVisibles.length;

  const etiquetteGarages = (n: number) => <span className="etiquette-contact" title="Nombre de garages qui ont ce contact"><Ico n="users" /> {n} garage{n > 1 ? "s" : ""}</span>;
  const boutonAjout = (deja: boolean, onClick: () => void) =>
    deja ? <span className="etiquette-contact ok"><Ico n="check" /> Dans ma base</span> : <button type="button" onClick={onClick} className="tuile-info-bouton tuile-info-bouton-principal"><Ico n="plus" /> Ajouter à ma base</button>;

  return (
    <div>
      <div className="mb-3 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--mea-neon-bordure)", background: "var(--mea-neon-fond)", color: "var(--mea-texte)" }}>
        <strong>Base mutualisée</strong> — tous les cabinets d&apos;expertise et assureurs connus de l&apos;ensemble des garages, dédoublonnés. Réservée à l&apos;éditeur. Les clients ne sont jamais mutualisés.
      </div>
      <BarreAnnuaire
        q={q}
        onQ={setQ}
        placeholder="Rechercher dans la base mutualisée…"
        tri={tri}
        onTri={setTri}
        total={total}
        visibles={visibles}
        actions={
          <>
            <div className="segment">
              <button type="button" className={`segment-btn ${famille === "experts" ? "actif" : ""}`} onClick={() => setFamille("experts")}>Experts <span className="ml-1 opacity-60">{experts.length}</span></button>
              <button type="button" className={`segment-btn ${famille === "assureurs" ? "actif" : ""}`} onClick={() => setFamille("assureurs")}>Assureurs <span className="ml-1 opacity-60">{assureurs.length}</span></button>
            </div>
            <button type="button" onClick={charger} disabled={busy} className="btn-primary whitespace-nowrap"><Ico n="refresh" /> {busy ? "Chargement…" : "Charger / actualiser"}</button>
          </>
        }
      />
      {info && <p className="mb-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{info}</p>}
      {erreur && <p className="mb-3 badge badge-danger">{erreur}</p>}

      {famille === "experts" ? (
        <GrilleContacts
          lignes={expertsVisibles}
          nomDe={(r) => r.cabinet}
          tri={tri}
          loading={loading}
          vide={<><strong>Base mutualisée vide.</strong><br />Cliquez sur « Charger / actualiser » pour la construire à partir de tous les garages.</>}
          rendre={(r) => (
            <CarteContact
              key={r.id}
              famille="expert"
              nom={r.cabinet}
              sousTitre={r.expert_nom ? <>Expert : <span style={{ color: "var(--mea-texte-2)" }}>{r.expert_nom}</span></> : "Expert non renseigné"}
              lignes={
                <>
                  <LigneContact ico="phone" href={lienTelephone(r.tel || r.expert_tel)}>{r.tel ? formaterTel(r.tel) : r.expert_tel ? formaterTel(r.expert_tel) : null}</LigneContact>
                  <LigneContact ico="mail" href={r.email || r.expert_email ? `mailto:${r.email || r.expert_email}` : null}>{r.email || r.expert_email}</LigneContact>
                  <LigneContact ico="map-pin" href={lienCarte(r.adresse, r.code_postal, r.ville)} externe>{[r.adresse, [r.code_postal, r.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null}</LigneContact>
                </>
              }
              note={r.notes}
              etiquettes={<>{etiquetteGarages(r.garages)}{r.verifie && <span className="etiquette-contact ok"><Ico n="check" /> Vérifié</span>}</>}
              actionsSupplementaires={boutonAjout(dejaExpert(r), () => ajouterExpert(r))}
              onModifier={() => (window.location.href = "/admin/annuaire")}
              onSupprimer={() => (window.location.href = "/admin/annuaire")}
            />
          )}
        />
      ) : (
        <GrilleContacts
          lignes={assureursVisibles}
          nomDe={(r) => r.nom}
          tri={tri}
          loading={loading}
          vide={<><strong>Base mutualisée vide.</strong><br />Cliquez sur « Charger / actualiser » pour la construire à partir de tous les garages.</>}
          rendre={(r) => (
            <CarteContact
              key={r.id}
              famille="assureur"
              nom={r.nom}
              sousTitre={r.siren ? <>SIREN <span className="font-mono">{r.siren}</span></> : "SIREN non renseigné"}
              lignes={
                <>
                  <LigneContact ico="phone" href={lienTelephone(r.tel)}>{r.tel ? formaterTel(r.tel) : null}</LigneContact>
                  <LigneContact ico="mail" href={r.email ? `mailto:${r.email}` : null}>{r.email}</LigneContact>
                  <LigneContact ico="map-pin" href={lienCarte(r.adresse, r.code_postal, r.ville)} externe>{[r.adresse, [r.code_postal, r.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null}</LigneContact>
                </>
              }
              note={r.notes}
              etiquettes={<>{etiquetteGarages(r.garages)}{r.verifie && <span className="etiquette-contact ok"><Ico n="check" /> Vérifié</span>}</>}
              actionsSupplementaires={boutonAjout(dejaAssureur(r), () => ajouterAssureur(r))}
              onModifier={() => (window.location.href = "/admin/annuaire")}
              onSupprimer={() => (window.location.href = "/admin/annuaire")}
            />
          )}
        />
      )}
    </div>
  );
}
