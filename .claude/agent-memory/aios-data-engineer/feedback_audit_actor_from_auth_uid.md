---
name: audit-actor-from-auth-uid
description: Audit/log functions must derive the acting user from public.public_user_id(), never accept it as a parameter
metadata:
  type: feedback
---

For audit-trail functions (e.g. `log_pii_access`), the recording user's id (`admin_user_id`) MUST be derived internally from `public.public_user_id()` (returns `public.users.id` via `auth_id = auth.uid()`), never accepted as a parameter.

**Why:** QA SEC-003 (Story 52-4) flagged that accepting `p_admin_user_id` lets a caller forge the trail in another user's name. The chosen fix removes the parameter entirely so there is no surface to inject a foreign id — unforgeable by construction, cleaner than accept-and-validate.

**How to apply:** In any SECURITY DEFINER logging/audit function, derive the actor from `public.public_user_id()` and fail-closed (RETURN FALSE) if it is NULL. When changing the arg count of an existing function, add `DROP FUNCTION IF EXISTS public.fn(old,arg,types)` before `CREATE OR REPLACE` — CREATE OR REPLACE does NOT replace a different overload, you'd end up with two functions. See [[role-source-user-role-not-jwt]].
