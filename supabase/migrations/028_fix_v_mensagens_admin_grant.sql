-- Migration 028: grant SELECT on v_mensagens_admin to authenticated role
-- Root cause fix for bug where the view returned empty results for admin users
-- via the anon key client (authenticated role had no GRANT on the view).
-- The page no longer queries this view directly, but the GRANT is needed
-- for any future use via the authenticated role.

GRANT SELECT ON v_mensagens_admin TO authenticated;
