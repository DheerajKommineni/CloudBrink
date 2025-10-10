/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0097A7',
        accent: '#006778',
        lightBg: '#F5FAFA',
        darkText: '#0A1F2B',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
