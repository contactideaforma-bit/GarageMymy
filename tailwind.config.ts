import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Charte "rose gris" : rose poudré + gris chauds
        brand: {
          DEFAULT: "#b8546a",
          dark: "#8f3f51",
          light: "#d98a9a",
          50: "#fbf4f6",
          100: "#f5e4e9",
          200: "#ecc8d2",
        },
        ink: {
          DEFAULT: "#3a3338", // texte principal (gris chaud)
          soft: "#6f6670", // texte secondaire
          faint: "#a59ba2", // texte tertiaire
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f4f0f2", // fond gris rosé
          line: "#e8e1e5", // bordures
        },
      },
    },
  },
  plugins: [],
};

export default config;
