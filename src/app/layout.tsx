import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "GarageMYMY — Gestion carrosserie",
  description: "Suivi des dossiers de sinistres",
};

// Applique le thème avant le rendu pour éviter le flash
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.add('light');}}catch(e){}})();`;

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
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
