import { createAdminClient } from "@web/lib/supabase/admin"

/**
 * Sets `app_metadata.role = "cliente"` on the given auth user.
 *
 * Called by admin-side flows (Story 20.5) after creating a `cliente` user, so
 * that the middleware can read the role directly from the JWT (`user.app_metadata.role`)
 * without an extra DB query per request.
 *
 * `app_metadata` is server-controlled (only the service role can modify it),
 * which is why this helper exists separately from regular profile updates.
 *
 * @throws Error when the Supabase admin call fails — caller should propagate
 *         (do not swallow: a missing role on `app_metadata` silently degrades
 *         the middleware to the DB fallback path on every request).
 */
export async function setClienteRoleMetadata(authId: string): Promise<void> {
  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.updateUserById(authId, {
    app_metadata: { role: "cliente" },
  })
  if (error) {
    throw new Error(`Failed to set cliente role metadata: ${error.message}`)
  }
}
