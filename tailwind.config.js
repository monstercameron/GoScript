/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./docs/**/*.html",
    "./docs/**/*.js"
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
