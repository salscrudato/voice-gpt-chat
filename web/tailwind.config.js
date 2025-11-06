/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f0ff',
          100: '#e8e8ff',
          200: '#d0d0ff',
          300: '#b8b8ff',
          400: '#9b9bff',
          500: '#7b7bff',
          600: '#5b5bff',
          700: '#4a4ae8',
          800: '#3a3ad0',
          900: '#2a2ab8',
        },
        neutral: {
          50: '#f8f9ff',
          100: '#f0f0ff',
          200: '#e8e8ff',
          300: '#e0e0f0',
          400: '#d0d0e0',
          500: '#c0c0d0',
          600: '#8a8aaa',
          700: '#4a4a6a',
          800: '#1a1a2e',
          900: '#0d0d0d',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"Roboto"', '"Oxygen"', '"Ubuntu"', '"Cantarell"', '"Fira Sans"', '"Droid Sans"', '"Helvetica Neue"', 'sans-serif'],
        mono: ['"Menlo"', '"Monaco"', '"Courier New"', 'monospace'],
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(91, 91, 255, 0.04)',
        sm: '0 2px 4px 0 rgba(91, 91, 255, 0.08), 0 1px 2px 0 rgba(91, 91, 255, 0.04)',
        md: '0 4px 12px -2px rgba(91, 91, 255, 0.12), 0 2px 4px -1px rgba(91, 91, 255, 0.06)',
        lg: '0 12px 24px -4px rgba(91, 91, 255, 0.15), 0 4px 8px -2px rgba(91, 91, 255, 0.1)',
        xl: '0 20px 32px -8px rgba(91, 91, 255, 0.18), 0 8px 16px -4px rgba(91, 91, 255, 0.12)',
        '2xl': '0 32px 48px -12px rgba(91, 91, 255, 0.2), 0 12px 24px -6px rgba(91, 91, 255, 0.15)',
        inner: 'inset 0 2px 4px 0 rgba(91, 91, 255, 0.06)',
        primary: '0 8px 24px -4px rgba(91, 91, 255, 0.2)',
      },
      borderRadius: {
        sm: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-in-up': 'slideInUp 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-in-down': 'slideInDown 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        'scale-in': 'scaleIn 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        'pop-in': 'popIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideInUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInDown: {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.9) translateY(10px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

