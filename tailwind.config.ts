import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0f0f0f',
        'bg-secondary': '#1a1a1a',
        'bg-tertiary': '#262626',
        'bg-hover': '#333333',
        'text-primary': '#f5f5f5',
        'text-secondary': '#a3a3a3',
        'accent': '#3b82f6',
        'accent-hover': '#2563eb',
      },
    },
  },
  plugins: [],
}
export default config
