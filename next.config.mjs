/** @type {import('next').NextConfig} */
const nextConfig = {
  // Images libres de droits (banque Unsplash) affichées sur la page d'accueil
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  // En-têtes de sécurité (audit v3.2)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Force HTTPS pendant 2 ans (navigateurs)
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Interdit d'afficher l'appli dans une iframe (clickjacking)
          { key: "X-Frame-Options", value: "DENY" },
          // Interdit au navigateur de deviner les types de fichiers
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Ne transmet pas l'URL complète aux sites externes
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Caméra AUTORISÉE pour l'appli elle-même : la prise de photo des
          // pièces (CameraModal) utilise getUserMedia. `camera=()` la bloquait
          // en production → « accès refusé » systématique. Micro et géoloc
          // restent coupés (inutiles).
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          // CSP : défense en profondeur, surtout pour la page publique
          // /signer/<jeton>. 'unsafe-inline'/'unsafe-eval' restent nécessaires
          // au runtime Next.js et à jsPDF.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
