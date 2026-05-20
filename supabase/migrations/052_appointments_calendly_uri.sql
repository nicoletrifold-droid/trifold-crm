ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS calendly_event_uri text UNIQUE;
