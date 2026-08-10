import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0b",
        panel: "#131316",
        panel2: "#1a1a1f",
        border: "#26262c",
        text: "#e8e8ea",
        muted: "#8b8b93",
        accent: "#6366f1",
      },
    },
  },
  plugins: [],
};

export default config;
