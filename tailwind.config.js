/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    fontFamily: {
      chivo: ["Chivo", "sans-serif"],
    },
    extend: {
      colors: {
        mindero: "#FFFD98",
        "delft-blue": "#23395B",
        celadon: "#B9E3C6",
        mint: "#59C9A5",
        raspberry: "#D81E5B",
      },
    },
  },
  plugins: [],
};
