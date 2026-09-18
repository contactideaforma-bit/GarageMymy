import ExpertShell from "@/components/expert/ExpertShell";

// MODE EXPERT (v13.5) : tout /expert/* passe par la coque Alliance Experts
// (connexion, comptes autorisés, charte, barre latérale dédiée).
export default function ExpertLayout({ children }: { children: React.ReactNode }) {
  return <ExpertShell>{children}</ExpertShell>;
}
