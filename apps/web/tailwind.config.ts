import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#07080c',
        panel: '#10131a',
        line: '#232936',
        acid: '#b8ff4d',
        cyan: '#54f4ff',
        violet: '#a976ff'
      },
      boxShadow: {
        glow: '0 0 32px rgba(84, 244, 255, 0.16)'
      }
    }
  },
  plugins: []
};

export default config;
