/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
