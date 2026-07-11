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
          // Coupe les accès capteurs inutiles (la caméra passe par <input capture>, pas par getUserMedia)
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
