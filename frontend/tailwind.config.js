/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aicte: {
          50: '#f0f7ff',
          100: '#e0effe',
          500: '#0284c7',
          600: '#0369a1',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          navy: '#0f172a',
        }
      }
    },
  },
  plugins: [],
}
