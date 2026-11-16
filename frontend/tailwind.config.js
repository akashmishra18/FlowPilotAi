/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Shared FlowPilot dark workspace surfaces.
        canvas: '#0A111D',
        panel: '#111B2A',
        raised: '#172437',
        brand: {
          50: '#101f38', 100: '#172b4a', 200: '#25416a', 300: '#87aaff', 400: '#7199ff',
          500: '#5f86f5', 600: '#4b74e6', 700: '#3a63d1', 800: '#2e50ad',
        },
        // Restrained amber accent, reserved for small highlights and activity states.
        accent: { 300: '#fcd34d', 400: '#f59e0b', 500: '#d97706' },
      },
      boxShadow: {
        panel: '0 12px 28px -18px rgba(0, 0, 0, 0.6)',
        premium: '0 20px 44px -22px rgba(0, 0, 0, 0.7)',
      },
    },
  },
  plugins: [],
};
