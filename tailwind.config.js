/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Work Sans", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        display: ["Space Grotesk", "PingFang SC", "Microsoft YaHei", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(148, 163, 184, 0.08), 0 20px 40px -20px rgba(0, 0, 0, 0.8)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: 0, transform: "translateY(16px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: 0.6 },
          "50%": { opacity: 1 },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out both",
        "fade-in": "fade-in 0.4s ease-out both",
        "float-slow": "float-slow 6s ease-in-out infinite",
        "pulse-soft": "pulse-soft 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
