"use client";

// BANDEAU D'ÉTAT DU COMPTE (v10.1) — piloté par l'éditeur (comptes_etat).
//  · suspendu      : voile BLOQUANT sur toute l'appli (impayé, CGV art. 5),
//                    avec le message de l'éditeur et le contact ;
//  · lecture_seule : bandeau permanent + écritures bloquées (supabaseClient),
//                    export des données toujours possible ;
//  · ferme         : même chose, avec la date de purge.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EtatCompte, chargerEtatCompte } from "@/lib/compteEtat";
import { formatDate } from "@/lib/format";
import { SOCIETE } from "@/components/vitrine/societe";
import { supabase } from "@/lib/supabaseClient";

export default function BandeauCompte() {
  const [etat, setEtat] = useState<EtatCompte | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    let actif = true;
    chargerEtatCompte().then((e) => actif && setEtat(e));
    // Recharge à chaque changement de page : une levée de suspension doit
    // se voir sans attendre.
    return () => {
      actif = false;
    };
  }, [pathname]);

  if (!etat || etat.etat === "actif") return null;

  if (etat.etat === "suspendu") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
        <div className="glass-card max-w-lg p-6 text-center">
          <div className="text-4xl">⛔</div>
          <h2 className="mt-3 text-lg font-bold text-white">Accès suspendu</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-white/80">
            {etat.message ||
              "Votre abonnement est suspendu pour défaut de paiement (conditions générales, article 5). L'accès sera rétabli dès régularisation ; les mensualités continuent de courir pendant la suspension."}
          </p>
          <p className="mt-3 text-xs text-white/50">
            Suspendu depuis le {formatDate(etat.depuis)}. Pour régulariser ou en discuter :{" "}
            <a href={`mailto:${SOCIETE.email}`} className="text-accent-teal underline">{SOCIETE.email}</a>
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <a href={`mailto:${SOCIETE.email}?subject=${encodeURIComponent("Régularisation de mon abonnement My Easy Auto")}`} className="btn-primary">Contacter IDEAFORMA</a>
            <button onClick={() => supabase.auth.signOut()} className="btn-ghost">Se déconnecter</button>
          </div>
        </div>
      </div>
    );
  }

  const ferme = etat.etat === "ferme";
  return (
    <div className={`border-b-2 px-3 py-2 text-center text-sm ${ferme ? "border-rose-400/60 bg-rose-500/20 text-rose-100" : "border-amber-400/60 bg-amber-500/15 text-amber-100"}`}>
      <b>{ferme ? "Compte fermé" : "Compte en lecture seule"}</b>
      {" — "}
      {etat.message ||
        (ferme
          ? "Votre contrat est terminé. Vos données seront supprimées"
          : "Votre contrat est terminé : vous pouvez consulter et exporter vos données, mais plus les modifier.")}
      {etat.purge_le && <> {ferme ? "le" : "Suppression définitive le"} <b>{formatDate(etat.purge_le)}</b>.</>}{" "}
      <Link href="/sauvegarde" className="underline">Exporter mes données</Link>
      {" · "}
      <a href={`mailto:${SOCIETE.email}`} className="underline">Réactiver mon abonnement</a>
    </div>
  );
}
