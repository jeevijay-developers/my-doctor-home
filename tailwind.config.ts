import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        heading: ['"Plus Jakarta Sans"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        script: ['Caveat', 'cursive'],
        // Doctor public site only (see src/styles/doctor-site.css).
        "ds-display": ['Newsreader', 'Georgia', '"Times New Roman"', 'serif'],
      },
      // Doctor public site design tokens. Values live in src/styles/doctor-site.css under
      // `.doctor-site` (light) and `.dark .doctor-site` (dark); nothing else reads them.
      fontSize: {
        "ds-display": ["clamp(2.5rem, 1.55rem + 4.2vw, 4.75rem)", { lineHeight: "1.02", letterSpacing: "-0.02em" }],
        "ds-h2": ["clamp(2rem, 1.45rem + 2.4vw, 3.25rem)", { lineHeight: "1.08", letterSpacing: "-0.015em" }],
        "ds-h3": ["clamp(1.25rem, 1.12rem + 0.6vw, 1.5rem)", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        "ds-lead": ["clamp(1.125rem, 1.07rem + 0.3vw, 1.25rem)", { lineHeight: "1.55" }],
        "ds-body": ["1.0625rem", { lineHeight: "1.6" }],
        "ds-small": ["0.9375rem", { lineHeight: "1.5" }],
        "ds-label": ["0.875rem", { lineHeight: "1.4" }],
      },
      transitionTimingFunction: {
        "ds-out": "cubic-bezier(0.22, 1, 0.36, 1)",
        "ds-in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
      },
      transitionDuration: {
        "ds-1": "160ms",
        "ds-2": "240ms",
        "ds-3": "420ms",
        "ds-4": "700ms",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          400: '#60a5fa',
          500: '#3C83FC',
          600: '#2563eb',
        },
        text: {
          dark: '#1f2937',
          muted: '#6b7280',
          light: '#9ca3af'
        },
        surface: {
          light: '#f8fafc',
          card: '#ffffff'
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        navy: "hsl(var(--navy))",
        royal: "hsl(var(--royal))",
        teal: "hsl(var(--teal))",
        spark: "hsl(var(--spark))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        "ai-purple": "hsl(var(--ai-purple))",
        pink: "hsl(var(--pink))",
        orange: "hsl(var(--orange))",
        "cloud-blue": "hsl(var(--cloud-blue))",
        "text-gray": "hsl(var(--text-gray))",
        "near-black": "hsl(var(--near-black))",
        ds: {
          paper: "rgb(var(--ds-paper) / <alpha-value>)",
          "paper-2": "rgb(var(--ds-paper-2) / <alpha-value>)",
          surface: "rgb(var(--ds-surface) / <alpha-value>)",
          ink: "rgb(var(--ds-ink) / <alpha-value>)",
          "ink-2": "rgb(var(--ds-ink-2) / <alpha-value>)",
          "ink-3": "rgb(var(--ds-ink-3) / <alpha-value>)",
          line: "rgb(var(--ds-line) / <alpha-value>)",
          accent: "rgb(var(--ds-accent) / <alpha-value>)",
          "accent-hover": "rgb(var(--ds-accent-hover) / <alpha-value>)",
          "accent-ink": "rgb(var(--ds-accent-ink) / <alpha-value>)",
          "accent-soft": "rgb(var(--ds-accent-soft) / <alpha-value>)",
          live: "rgb(var(--ds-live) / <alpha-value>)",
          "live-dot": "rgb(var(--ds-live-dot) / <alpha-value>)",
          warm: "rgb(var(--ds-warm) / <alpha-value>)",
          star: "rgb(var(--ds-star) / <alpha-value>)",
          danger: "rgb(var(--ds-danger) / <alpha-value>)",
        },
      },
      // Single source of truth for readable text: the bright brand/status hues are fills (`bg-*`, borders),
      // so `text-*` resolves to their darker "ink" tone (>= 4.5:1 on white; lighter in dark mode).
      // Use `text-teal-bright` / `text-spark-bright` only where that text sits on a dark background.
      textColor: {
        teal: "hsl(var(--teal-ink))",
        "teal-bright": "hsl(var(--teal))",
        spark: "hsl(var(--spark-ink))",
        "spark-bright": "hsl(var(--spark))",
        success: "hsl(var(--success-ink))",
        warning: "hsl(var(--warning-ink))",
        destructive: {
          DEFAULT: "hsl(var(--danger-ink))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "12px",
        "2xl": "16px",
        pill: "9999px",
        "ds-sm": "10px",
        "ds-md": "16px",
        "ds-lg": "28px",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        "ds-1": "var(--ds-shadow-1)",
        "ds-2": "var(--ds-shadow-2)",
        "ds-3": "var(--ds-shadow-3)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "count-up": {
          from: { opacity: "0", transform: "scale(0.8)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.6s ease-out forwards",
        "count-up": "count-up 0.5s ease-out forwards",
        "float": "float 3s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
