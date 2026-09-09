import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: "#090314",
        surface: "#130924",
        stroke: "#2D1B4E",
        royal: "#8B5CF6",
        royalDeep: "#7C3AED",
        aurum: "#FFD700",
        amberGold: "#F59E0B",
      },
      boxShadow: {
        neon: "0 0 36px rgba(139, 92, 246, 0.32)",
        gold: "0 0 34px rgba(255, 215, 0, 0.22)",
      },
      backgroundImage: {
        "obsidian-radial":
          "radial-gradient(circle at 20% 0%, rgba(139,92,246,0.24), transparent 32%), radial-gradient(circle at 82% 12%, rgba(245,158,11,0.18), transparent 28%), linear-gradient(180deg, #090314 0%, #0D061A 58%, #090314 100%)",
      },
      animation: {
        pulseGlow: "pulseGlow 2.8s ease-in-out infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 22px rgba(139,92,246,0.24)" },
          "50%": { boxShadow: "0 0 42px rgba(255,215,0,0.24)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;