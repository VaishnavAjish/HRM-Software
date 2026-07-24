/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#E8EAF0',
          100: '#C5C9D6',
          200: '#9EA5B9',
          300: '#77819C',
          400: '#596687',
          500: '#3B4B72',
          600: '#354468',
          700: '#2C3A5B',
          800: '#24314E',
          900: '#0F172A',
          950: '#0A1020',
        },
        secondary: {
          50: '#F1F5F9',
          100: '#E2E8F0',
          200: '#CBD5E1',
          300: '#94A3B8',
          400: '#64748B',
          500: '#334155',
          600: '#1E293B',
          700: '#0F172A',
          800: '#0A1020',
          900: '#020617',
        },
        accent: {
          50: '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0369A1',
          700: '#075985',
          800: '#0C4A6E',
          900: '#042F4E',
        },
        success: {
          50: '#F0FDF4',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
        },
        warning: {
          50: '#FFF7ED',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
        },
        danger: {
          50: '#FEF2F2',
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626',
        },
        border: '#E2E8F0',
        background: '#F8FAFC',
        text: '#020617',
      },
      fontFamily: {
        heading: ['Lexend', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Source Sans 3', 'system-ui', 'sans-serif'],
        dashboard: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'heading-1': ['2.25rem', { lineHeight: '2.75rem', fontWeight: '700' }],
        'heading-2': ['1.875rem', { lineHeight: '2.375rem', fontWeight: '600' }],
        'heading-3': ['1.5rem', { lineHeight: '2rem', fontWeight: '600' }],
        'heading-4': ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-in-out',
        'fade-out': 'fadeOut 150ms ease-in-out',
        'slide-in': 'slideIn 200ms ease-out',
        'slide-out': 'slideOut 200ms ease-in',
        'scale-in': 'scaleIn 200ms ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideOut: {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(-8px)', opacity: '0' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};