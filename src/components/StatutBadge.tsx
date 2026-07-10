"use client";

import { badgeStatut, libelleStatut } from "@/lib/format";
import { useMetier } from "@/components/MetierProvider";

export default function StatutBadge({ statut }: { statut: string }) {
  const { metier } = useMetier();
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeStatut(
        statut
      )}`}
    >
      {libelleStatut(statut, metier)}
    </span>
  );
}
