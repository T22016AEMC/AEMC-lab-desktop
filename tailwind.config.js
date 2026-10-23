/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Segoe UI"',
          '"Noto Sans TC"',
          '"PingFang TC"',
          '"Microsoft JhengHei"',
          'sans-serif',
        ],
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '0.9' },
          '50%': { opacity: '0.25' },
        },
      },
      animation: {
        blink: 'blink 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
