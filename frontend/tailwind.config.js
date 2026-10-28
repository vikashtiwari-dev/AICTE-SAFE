/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: '#06070a',
        surface: '#0b0b0d',
        card: 'rgba(18, 18, 22, 0.85)',
        apple: {
          blue: '#0071e3',
          'blue-bright': '#2997ff',
          green: '#30d158',
          orange: '#ff9f0a',
          red: '#ff453a',
          purple: '#bf5af2',
        },
        aicte: {
          50: '#f0f7ff',
          100: '#e0effe',
          500: '#0071e3',
          600: '#0062c4',
          700: '#004fb0',
          800: '#003d8c',
          900: '#0a101f',
          navy: '#06070a',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderColor: {
        subtle: 'rgba(255, 255, 255, 0.08)',
        highlight: 'rgba(255, 255, 255, 0.16)',
      }
    },
  },
  plugins: [],
}
