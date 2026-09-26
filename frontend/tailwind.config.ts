import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0907",
        "bg-2": "#110d08",
        surface: "#16110a",
        "surface-2": "#1e170e",
        "surface-3": "#281e12",
        border: "#2a1f12",
        "border-2": "#3a2c1a",
        text: "#f4ecda",
        "text-2": "#c9bd9f",
        // Ajustados pra manter contraste >=4.5:1 contra as superfícies do app
        // (eram #8a7a60 / #5a4d39 — falhavam contra surface-3 #281e12).
        muted: "#a89478",
        dim: "#9c8a6e",
        primary: "#f5b528",
        "primary-2": "#ffc94a",
        amber: "#c68410",
        "amber-deep": "#6e4a0a",
        // tiers
        great: "#f5b528",
        good: "#8ad36b",
        okay: "#6aa7e8",
        rough: "#e87a6a",
        miss: "#5a4d39",
        // brand-flat
        ink: "#1a1408",
      },
      fontFamily: {
        display: ['"Oswald"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        card: "10px",
        lg2: "14px",
      },
      backgroundImage: {
        "warm-radial":
          "radial-gradient(ellipse 1200px 600px at 18% -10%, rgba(245,181,40,0.08), transparent 60%), radial-gradient(ellipse 900px 500px at 110% 0%, rgba(245,181,40,0.04), transparent 60%)",
      },
      boxShadow: {
        glow: "0 8px 24px -8px rgba(245,181,40,0.6)",
        card: "0 1px 0 rgba(255,255,255,0.04) inset",
      },
    },
  },
  plugins: [],
} satisfies Config;
