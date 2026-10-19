import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";
import MetierProvider from "@/components/MetierProvider";
import { IMAGE_PARTAGE, NOM_SITE, SITE_URL, metaPage } from "@/lib/seo";
import { SOCIETE } from "@/components/vitrine/societe";

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

// SEO (v13.45) : les métadonnées de la RACINE sont celles de la page
// d'accueil (title, description, canonical, Open Graph). Chaque page
// publique a les siennes dans son layout.tsx (voir src/lib/seo.ts).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  ...metaPage({
    titre: "Logiciel de gestion carrosserie et sinistres | My Easy Auto",
    description:
      "Logiciel de gestion pour carrosseries : sinistres, devis, factures, signature et relances sur une seule page, avec import IA du rapport. Demandez une démo.",
    chemin: "/",
  }),
  applicationName: NOM_SITE,
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
  // Google Search Console (v13.49) : balise <meta name="google-site-verification">
  // rendue seulement si NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION est définie sur
  // Vercel (valeur = le jeton donné par Search Console, méthode « Balise HTML »).
  // Si la propriété est validée par DNS (méthode recommandée), la variable
  // est inutile et aucune balise n'est émise.
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
    : {}),
};

// Données structurées (Schema.org) : l'éditeur et le logiciel.
const donneesStructurees = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organisation`,
      name: NOM_SITE,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/logo.png`,
      email: SOCIETE.email,
      address: {
        "@type": "PostalAddress",
        streetAddress: SOCIETE.adresse,
        postalCode: SOCIETE.codePostal,
        addressLocality: SOCIETE.ville,
        addressCountry: "FR",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#site`,
      name: NOM_SITE,
      url: `${SITE_URL}/`,
      inLanguage: "fr-FR",
      publisher: { "@id": `${SITE_URL}/#organisation` },
    },
    {
      "@type": "SoftwareApplication",
      name: NOM_SITE,
      url: `${SITE_URL}/`,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, iOS, Android",
      inLanguage: "fr-FR",
      description:
        "Logiciel de gestion des sinistres pour carrosseries et vitrage : import du rapport d'expertise par IA, devis, factures, ordres de réparation, cessions de créance, signature électronique et relances.",
      image: `${SITE_URL}${IMAGE_PARTAGE.url}`,
      publisher: { "@id": `${SITE_URL}/#organisation` },
    },
  ],
};

export const viewport = {
  themeColor: "#e6e8f1",
  width: "device-width",
  initialScale: 1,
};

// Applique le thème avant le rendu pour éviter le flash.
// Mode clair par défaut ; mode sombre seulement si explicitement choisi.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t!=='dark'){document.documentElement.classList.add('light');}}catch(e){document.documentElement.classList.add('light');}})();`;

// SEO (v13.45) : l'accueil est rendu CÔTÉ SERVEUR (titre H1, textes, liens)
// pour Google et les visiteurs. Si cet appareil a déjà une session ou un
// espace mémorisé, on marque <html data-session> AVANT l'affichage : la
// vitrine reste masquée (CSS .accueil-ssr) le temps de la reconnexion, sans
// flash de la page d'accueil pour un garage déjà connecté.
const sessionInit = `(function(){try{var s=localStorage.getItem('mea.auth.espace');for(var i=0;!s&&i<localStorage.length;i++){if(/^sb-.*-auth-token$/.test(localStorage.key(i)||''))s=1;}if(s)document.documentElement.setAttribute('data-session','1');}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${sans.variable} ${titre.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script dangerouslySetInnerHTML={{ __html: sessionInit }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(donneesStructurees) }}
        />
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
