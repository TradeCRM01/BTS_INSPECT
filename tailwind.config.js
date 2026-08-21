/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      colors: {
        navy: '#0A2540',
        accent: '#2E75B6',
        cream: '#F5F0E6',
        pass: '#1B7F3A',
        fail: '#B42318',
        warning: '#B54708',
        ink: '#1A1A1A',
        muted: '#4A5568',
        rule: '#E5E7EB',
        zebra: '#F9FAFB',
      },
      borderRadius: {
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
        xl: '10px',
        '2xl': '12px',
        full: '9999px',
      },
    },
  },
  plugins: [
    function({ addUtilities, addBase }) {
      addBase({
        '@keyframes fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        '@keyframes slide-in-from-bottom-4': { from: { transform: 'translateY(1rem) translateX(-50%)' }, to: { transform: 'translateY(0) translateX(-50%)' } },
      });
      addUtilities({
        '.animate-in': { 'animation-duration': '300ms', 'animation-fill-mode': 'both', 'animation-timing-function': 'ease-out' },
        '.fade-in': { 'animation-name': 'fade-in' },
        '.slide-in-from-bottom-4': { 'animation-name': 'slide-in-from-bottom-4' },
        '.duration-300': { 'animation-duration': '300ms' },
      });
    },
  ],
};
