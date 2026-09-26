/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          light: '#D4AF37',
          DEFAULT: '#C5A059',
          dark: '#B8934A',
          hover: '#9E7B35',
        },
        graphite: {
          light: '#3F4245',
          DEFAULT: '#2B2D2F',
          dark: '#1E2022',
        },
        surface: {
          base: '#F8F9FA',
          alt: '#F4F5F7',
          card: '#FFFFFF',
          border: '#E5E7EB',
        }
      }
    },
  },
  plugins: [],
}
