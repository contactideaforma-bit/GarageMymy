import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";
import MetierProvider from "@/components/MetierProvider";

// Polices (v12.1) : Inter pour le corps de texte, Space Grotesk pour les
// titres et le logo-texte — géométrique, légèrement futuriste, jamais enfantin.
// La police pixel est abandonnée (rendu « brouillon, pas sérieux »).
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const titre = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-titre",
  display: "swap",
});

export const metadata: Metadata = {
  title: "My Easy Auto — Gestion carrosserie & vitrage",
  description: "Suivi des sinistres, devis, factures et encaissements — simple comme un jeu.",
  // PWA : installable sur l'écran d'accueil du téléphone
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    title: "My Easy Auto",
    statusBarStyle: "default",
  },
};

export const viewport = {
  themeColor: "#f5f6fb",
  width: "device-width",
  initialScale: 1,
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
    <html lang="fr" className={`${sans.variable} ${titre.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <AuthGate>
          <MetierProvider>
            <AppShell>{children}</AppShell>
          </MetierProvider>
        </AuthGate>
      </body>
    </html>
  );
}
