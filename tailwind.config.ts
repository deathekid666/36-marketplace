import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        acid: "#FF385C",
        ink: "#070806",
        panel: "#10120E",
      },
    },
  },
  plugins: [],
} satisfies Config;
