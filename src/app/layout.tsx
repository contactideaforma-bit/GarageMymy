import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";

export const metadata: Metadata = {
  title: "GarageMYMY — Gestion carrosserie",
  description: "Suivi des dossiers de sinistres",
};

// Applique le thème avant le rendu pour éviter le flash.
// Mode clair par défaut ; mode sombre seulement si explicitement choisi.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t!=='dark'){document.documentElement.classList.add('light');}}catch(e){document.documentElement.classList.add('light');}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <AuthGate>
          <AppShell>{children}</AppShell>
        </AuthGate>
      </body>
    </html>
  );
}
