import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bgPrimary: "#050816",
        bgSecondary: "#0B1023",
        cardBg: "rgba(17, 25, 40, 0.55)",
        purplePrimary: "#7C3AED",
        purpleSecondary: "#9333EA",
        cyanPrimary: "#06B6D4",
        pinkPrimary: "#EC4899",
        textPrimary: "#FFFFFF",
        textSecondary: "#A1A1AA",
        borderGlow: "rgba(124, 58, 237, 0.35)"
      },
      boxShadow: {
        neon: "0 0 40px rgba(124,58,237,0.25)"
      },
      backdropBlur: {
        glass: "20px"
      }
    }
  },
  plugins: []
};

export default config;
