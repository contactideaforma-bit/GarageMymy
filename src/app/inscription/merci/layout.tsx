import type { Metadata } from "next";

// Page de confirmation personnelle : pas d'indexation (v13.45).
export const metadata: Metadata = {
  title: { absolute: "Inscription confirmée | My Easy Auto" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
