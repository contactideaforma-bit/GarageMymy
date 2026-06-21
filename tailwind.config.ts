import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          violet: "#8b5cf6",
          pink: "#ec4899",
          blue: "#3b82f6",
          teal: "#2dd4bf",
          DEFAULT: "#8b5cf6",
        },
      },
      keyframes: {
        aurora: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
      },
      animation: {
        aurora: "aurora 18s ease infinite",
      },
    },
  },
  plugins: [],
};

export default config;
