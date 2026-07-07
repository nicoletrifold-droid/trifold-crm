import "server-only"

import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"
import { isPastaManager } from "@web/lib/pastas/roles"

// Story 75-88 / 75-93 — guard das rotas do módulo IMOB: autenticado + acesso ao módulo "imob"
// pela matriz de Perfil de Acesso (Story 75-93 — antes era role fixo admin/supervisor).
// As tabelas imob_* têm RLS sem policy → acesso só via admin client, por isso o gate aqui
// é a fronteira de segurança.
export async function imobGuard() {
  const auth = await requireAuth()
  if (auth.error) return { error: auth.error as Response }

  const allowed = await canAccess(auth.appUser.id, auth.appUser.org_id, "imob")
  if (!allowed) {
    return {
      error: NextResponse.json({ error: "Sem acesso ao módulo IMOB" }, { status: 403 }) as unknown as Response,
    }
  }
  return { admin: createAdminClient(), appUser: auth.appUser }
}

// Story 75-148 — o CADASTRO de imobiliárias é uma base COMPARTILHADA: além do módulo IMOB,
// o módulo Pastas usa a mesma tabela (as pastas referenciam a imobiliária). Perfis que só
// têm Pastas (isPastaManager) precisam listar/criar/editar imobiliária sem acesso ao IMOB.
// Este guard libera quem tem acesso ao IMOB OU é gestor de Pastas. As tabelas imob_* têm RLS
// sem policy → acesso só via admin client, então este gate é a fronteira de segurança.
export async function imobiliariasGuard() {
  const auth = await requireAuth()
  if (auth.error) return { error: auth.error as Response }

  const allowed =
    (await canAccess(auth.appUser.id, auth.appUser.org_id, "imob")) ||
    isPastaManager(auth.appUser.role)
  if (!allowed) {
    return {
      error: NextResponse.json({ error: "Sem acesso ao cadastro de imobiliárias" }, { status: 403 }) as unknown as Response,
    }
  }
  return { admin: createAdminClient(), appUser: auth.appUser }
}
