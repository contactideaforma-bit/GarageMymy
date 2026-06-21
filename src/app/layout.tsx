import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "GarageMYMY — Gestion carrosserie",
  description: "Suivi des dossiers de sinistres",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-6 lg:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
