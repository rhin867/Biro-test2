export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe',
          500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 900: '#1e3a8a'
        },
        success: { 100: '#dcfce7', 500: '#22c55e', 600: '#16a34a' },
        danger:  { 100: '#fee2e2', 500: '#ef4444', 600: '#dc2626' },
        warning: { 100: '#fef9c3', 500: '#eab308', 600: '#ca8a04' },
        purple:  { 100: '#f3e8ff', 500: '#a855f7', 600: '#9333ea' }
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
}
