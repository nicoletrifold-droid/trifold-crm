ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system'
    CONSTRAINT users_theme_check CHECK (theme IN ('light', 'dark', 'system'));
