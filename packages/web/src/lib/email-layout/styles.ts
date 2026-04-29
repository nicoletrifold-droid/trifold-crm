export const emailTokens = {
  colors: {
    primary: '#1a1a2e',
    accent: '#4f46e5',
    background: '#f3f4f6',
    surface: '#ffffff',
    muted: '#f9fafb',
    border: '#e5e7eb',
    text: {
      primary: '#111827',
      secondary: '#6b7280',
      // NOTE: text.muted (#9ca3af) fails WCAG AA on #f9fafb (3.13:1).
      // Use text.secondary for readable body text; muted is decorative-only.
      muted: '#9ca3af',
      inverse: '#ffffff',
    },
  },
  fonts: {
    base: 'Inter, Arial, sans-serif',
    sizes: { sm: '12px', base: '14px', md: '16px', lg: '20px' },
  },
  spacing: { sm: '8px', md: '16px', lg: '24px', xl: '32px' },
  maxWidth: '600px',
  borderRadius: { card: '8px', button: '6px' },
} as const
