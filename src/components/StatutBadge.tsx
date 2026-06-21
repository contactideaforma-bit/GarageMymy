import { badgeStatut, labelStatut } from "@/lib/format";

export default function StatutBadge({ statut }: { statut: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeStatut(
        statut
      )}`}
    >
      {labelStatut(statut)}
    </span>
  );
}
