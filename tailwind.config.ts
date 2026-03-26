import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "cursive"],
        mono: ["var(--font-mono)", "monospace"],
        body: ["var(--font-body)", "sans-serif"],
      },
      colors: {
        chalk: "#F5F0E8",
        rock: "#1A1A1A",
        granite: "#2D2D2D",
        hold: {
          red: "#E63946",
          yellow: "#F4D03F",
          green: "#2ECC71",
          blue: "#3498DB",
        },
        accent: "#E63946",
      },
      animation: {
        "slide-up": "slideUp 0.4s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "rank-change": "rankChange 0.6s ease-out",
        "counter-up": "counterUp 0.5s ease-out",
      },
      keyframes: {
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(230,57,70,0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(230,57,70,0.7)" },
        },
        rankChange: {
          "0%": { transform: "scale(1.05)", backgroundColor: "rgba(230,57,70,0.2)" },
          "100%": { transform: "scale(1)", backgroundColor: "transparent" },
        },
        counterUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
