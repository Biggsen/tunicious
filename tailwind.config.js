/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    fontFamily: {
      chivo: ["Chivo", "sans-serif"],
    },
    extend: {
      colors: {
        mindero: "#FFFD98",
        primrose: "#FEFDE1",
        gorse: "#F6F350",
        "delft-blue": "rgb(var(--c-delft) / <alpha-value>)",
        wedgwood: "#8EA3C4",
        faience: "#3F5B87",
        inkwell: "#18273E",
        celadon: "#B9E3C6",
        ash: "#EDF6F0",
        verdigris: "#79D194",
        malachite: "#2B8C49",
        mint: "rgb(var(--c-mint) / <alpha-value>)",
        spearmint: "#95D5C0",
        jade: "#2DA37D",
        pine: "#1E5C48",
        raspberry: "#D81E5B",
        sorbet: "#E05E88",
        claret: "#950F3B",
      },
    },
  },
  plugins: [],
};
