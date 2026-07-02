import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#07090D",
        panel: "#0C1017",
        raised: "#111722",
        edge: "#1B2331",
        accent: "#33B6FF",
        "accent-dim": "#1A5C80",
        up: "#2FD576",
        down: "#F0525F",
        warn: "#E8B93E",
        ink: "#D7DEE8",
        muted: "#6B7789",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};

export default config;
