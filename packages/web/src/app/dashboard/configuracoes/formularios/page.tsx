import Link from "next/link"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { createAdminClient } from "@web/lib/supabase/admin"
import { FormulariosClient, type FormularioRow } from "./formularios-client"

// Story 75-330 (Epic 89) — configuração dos formulários de qualificação.
// É esta tela que cumpre a AC8: marketing edita as perguntas SEM deploy. Sem
// ela, "formulário editável" viraria promessa e todo ajuste de campanha
// dependeria de uma release.
//
// `lead_forms` tem RLS sem policies (232): a leitura é por service-role DEPOIS
// do gate, com org_id explícito no WHERE.

export const dynamic = "force-dynamic"

export default async function FormulariosConfigPage() {
  const user = await getServerUser()
  const podeEditar = await canAccess(user.id, user.orgId, "configuracoes")

  const admin = createAdminClient()
  const { data } = await admin
    .from("lead_forms")
    .select("id, nome, token, schema, is_active, created_at")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })

  const formularios = (data ?? []) as FormularioRow[]

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/configuracoes"
          className="text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          ← Configurações
        </Link>
        <h1 className="mt-2 text-xl font-bold text-stone-900 dark:text-stone-100">
          Formulários de qualificação
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          O link público vai no anúncio. As perguntas ramificam conforme as respostas, e quem
          preenche vira lead com a origem “Formulário de Qualificação”.
        </p>
      </div>

      <FormulariosClient formularios={formularios} podeEditar={podeEditar} />
    </div>
  )
}
