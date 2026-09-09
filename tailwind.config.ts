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
        obsidian: "#090A0F",
        surface: "#0E1017",
        surfaceRaised: "#121521",
        stroke: "#262A36",
        strokeStrong: "#3B314D",
        royal: "#6D28D9",
        royalDeep: "#4C1D95",
        aurum: "#F59E0B",
        amberGold: "#D97706",
        muted: "#94A3B8",
      },
      boxShadow: {
        neon: "0 0 36px rgba(109, 40, 217, 0.28)",
        gold: "0 0 34px rgba(245, 158, 11, 0.18)",
      },
      backgroundImage: {
        "obsidian-radial":
          "radial-gradient(circle at 18% 0%, rgba(109,40,217,0.2), transparent 32%), radial-gradient(circle at 82% 12%, rgba(245,158,11,0.14), transparent 26%), linear-gradient(180deg, #090A0F 0%, #10121A 58%, #090A0F 100%)",
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