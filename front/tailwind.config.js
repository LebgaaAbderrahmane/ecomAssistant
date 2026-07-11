/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#E1F5EE',
          100: '#D0ECDE',
          200: '#A8D9BD',
          300: '#80C69C',
          400: '#45A87C',
          500: '#208A62',
          600: '#0F6E56',
          700: '#0B5443',
          800: '#084234',
          900: '#052E24',
        },
        surface: {
          DEFAULT: 'var(--bg)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
        },
        on: {
          DEFAULT: 'var(--text)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          faint: 'var(--text-faint)',
        },
        outline: {
          DEFAULT: 'var(--border)',
          light: 'var(--border-light)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translate(-50%, 100%)', opacity: '0' },
          '100%': { transform: 'translate(-50%, 0)', opacity: '1' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.2s ease-out',
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities }) {
      addUtilities({
        '.bg-surface': { background: 'var(--bg)' },
        '.bg-surface-secondary': { background: 'var(--bg-secondary)' },
        '.bg-surface-tertiary': { background: 'var(--bg-tertiary)' },
        '.text-on': { color: 'var(--text)' },
        '.text-on-secondary': { color: 'var(--text-secondary)' },
        '.text-on-muted': { color: 'var(--text-muted)' },
        '.text-on-faint': { color: 'var(--text-faint)' },
        '.border-on': { borderColor: 'var(--border)' },
        '.border-on-light': { borderColor: 'var(--border-light)' },
      })
    }),
  ],
}
