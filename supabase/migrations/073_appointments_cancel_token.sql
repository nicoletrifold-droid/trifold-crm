ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS cancel_token uuid DEFAULT gen_random_uuid() NOT NULL,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS client_phone text,
  ADD COLUMN IF NOT EXISTS google_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_cancel_token_key ON appointments(cancel_token);
