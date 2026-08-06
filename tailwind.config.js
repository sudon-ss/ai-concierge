/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef1f7',
          100: '#cbd3e3',
          200: '#94a3c0',
          300: '#5c739a',
          400: '#324e7d',
          500: '#1e3a5f',
          600: '#162e4d',
          700: '#0f223b',
          800: '#0a1a30',
          900: '#050f1e',
          950: '#020815',
        },
        gold: {
          50: '#fbf7eb',
          100: '#f4e8c4',
          200: '#ead498',
          300: '#dfbe6c',
          400: '#d4ac4a',
          500: '#c9a55c',
          600: '#a98442',
          700: '#856732',
          800: '#5c4823',
          900: '#382b13',
        },
        cream: {
          50: '#fdfcf8',
          100: '#f7f4ea',
          200: '#efe9d3',
        },
      },
      fontFamily: {
        serif: [
          '"Cormorant Garamond"',
          '"Noto Serif JP"',
          'Georgia',
          '"Hiragino Mincho ProN"',
          'Yu Mincho',
          'serif',
        ],
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"Hiragino Sans"',
          '"Yu Gothic UI"',
          'Meiryo',
          'sans-serif',
        ],
      },
      animation: {
        'flash-pulse': 'flashPulse 1.6s ease-in-out infinite',
        'wave-pulse': 'wavePulse 1.6s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'gold-shimmer': 'goldShimmer 3s ease-in-out infinite',
      },
      keyframes: {
        flashPulse: {
          '0%, 100%': { backgroundColor: 'rgba(30, 58, 95, 0.45)' },
          '50%': { backgroundColor: 'rgba(201, 165, 92, 0.55)' },
        },
        wavePulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.5' },
          '50%': { transform: 'scale(1.15)', opacity: '0.8' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        goldShimmer: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
      boxShadow: {
        gold: '0 0 0 1px rgba(201, 165, 92, 0.4), 0 8px 24px -8px rgba(30, 58, 95, 0.25)',
        'gold-lg': '0 0 0 2px rgba(201, 165, 92, 0.5), 0 16px 32px -12px rgba(30, 58, 95, 0.35)',
      },
    },
  },
  plugins: [],
}
