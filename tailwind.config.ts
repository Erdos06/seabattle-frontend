import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        sea: "#0a2540",
        accent: "#4f9cf9",
      },
    },
  },
  plugins: [],
} satisfies Config;
