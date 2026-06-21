import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1e3a8a",
          dark: "#172554",
          light: "#3b82f6",
        },
      },
    },
  },
  plugins: [],
};

export default config;
