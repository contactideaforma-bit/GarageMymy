import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";
import MetierProvider from "@/components/MetierProvider";

// Police pixel (titres uniquement — le corps de texte reste une police
// classique très lisible, l'appli vise un public peu à l'aise avec l'informatique).
const pixel = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
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
  themeColor: "#241f3d",
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
    <html lang="fr" className={pixel.variable}>
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
