/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1E3A8A', soft: '#E0E7FF' },
        accent: '#B45309',
        success: '#15803D',
        danger: '#B91C1C',
        page: '#F5F7FB',
        surface: '#FFFFFF',
        border: '#E2E8F0',
        text: '#0F172A',
        muted: '#64748B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        devanagari: ['"Noto Sans Devanagari"', 'sans-serif'],
      },
      fontSize: { base: '15px' },
      borderRadius: { DEFAULT: '10px' },
      boxShadow: { subtle: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.08)' },
    },
  },
  plugins: [],
};
