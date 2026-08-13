import { NextResponse } from 'next/server';
import { createClient } from '@web/lib/supabase/server';
import { can } from '@web/lib/permissions';
import type { CapabilityKey } from '@web/lib/capabilities';
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
    .select('id, name, role, org_id, is_active')
    .eq('auth_id', user.id)
    .single();

  if (!appUser) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  // Story 75-54 — usuário desativado não acessa nada (regra geral p/ todos os perfis).
  if ((appUser as { is_active?: boolean }).is_active === false) {
    return { error: NextResponse.json({ error: 'Conta desativada' }, { status: 403 }) };
  }

  return { supabase, user, appUser };
}

export function requireRole(appUser: AppUser, allowedRoles: string[]): NextResponse | null {
  if (!allowedRoles.includes(appUser.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/**
 * Perfis de Acesso 2.0 (Story 75-303) — espelho ASYNC do `requireRole` para o
 * modelo de capabilities: 403 quando o usuário não tem a AÇÃO na matriz
 * (perfil + exceções individuais, resolução da F1). PADRÃO F3: toda rota
 * migrada troca `requireRole(appUser, [...])` por
 * `await requireCapability(appUser, "modulo.acao")`.
 */
export async function requireCapability(
  appUser: AppUser,
  capability: CapabilityKey
): Promise<NextResponse | null> {
  const allowed = await can(appUser.id, appUser.org_id, capability);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
