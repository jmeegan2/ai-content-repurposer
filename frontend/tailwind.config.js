/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6723ff',
          hover: '#5a1fe0',
        },
        surface: '#09090b',
        panel: '#18181b',
      },
    },
  },
  plugins: [],
}

