import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: "#050505",
        card: "#151515",
        field: "#1a1a1a",
        neon: { purple: "#9D00FF", pink: "#FF00A8", green: "#00FF88", yellow: "#FFD700" },
        gold: "#D4AF37",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        neon: "0 0 12px rgba(157, 0, 255, 0.6), inset 0 0 12px rgba(157, 0, 255, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
