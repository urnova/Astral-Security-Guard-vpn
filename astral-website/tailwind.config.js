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
        vanguard: {
          bg: '#080b11',
          surface: '#0e131f',
          card: '#121826',
          elevated: '#171f30',
          border: 'rgba(255, 255, 255, 0.08)',
          muted: '#94a3b8',
          dim: '#64748b',
          cyan: '#38bdf8',
          green: '#22c55e',
          purple: '#a78bfa',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
