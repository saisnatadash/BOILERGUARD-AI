import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: "#0a0c0f",
          900: "#0f1217",
          800: "#161b22",
          700: "#1d232c",
          600: "#2a313c",
        },
        steel: {
          100: "#e6ebf1",
          200: "#c9d1d9",
          300: "#aab4c1",
          400: "#8b96a5",
          500: "#6b7584",
        },
        amber: { DEFAULT: "#f5a623", dim: "#8a5f17" },
        cyan: { DEFAULT: "#22d3ee", dim: "#135b66" },
        ok: "#3fb950",
        crit: "#ff5c39",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
