import { NextResponse } from 'next/server';
import { createClient } from '@web/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AppUser {
  id: string;
  name: string;
  role: string;
  org_id: string;
}

type AuthSuccess = {
  supabase: SupabaseClient;
  user: { id: string };
  appUser: AppUser;
  error?: undefined;
};

type AuthError = {
  error: NextResponse;
  supabase?: undefined;
  user?: undefined;
  appUser?: undefined;
};

export type AuthResult = AuthSuccess | AuthError;

export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: appUser } = await supabase
    .from('users')
    .select('id, name, role, org_id')
    .eq('auth_id', user.id)
    .single();

  if (!appUser) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  return { supabase, user, appUser };
}

export function requireRole(appUser: AppUser, allowedRoles: string[]): NextResponse | null {
  if (!allowedRoles.includes(appUser.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
