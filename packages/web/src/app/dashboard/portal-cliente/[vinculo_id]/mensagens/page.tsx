import { redirect } from "next/navigation"
import { requireViewerAccess, getViewerVinculo } from "@web/lib/portal/viewer"
import { MensagensList } from "@web/app/cliente/[obra_id]/_components/mensagens-list"

// Story 78-1 — Chat em SOMENTE LEITURA. Diferente do portal real, NÃO marca read_at e
// não usa ChatFeed (composer/realtime). Filtra por (obra_id + cliente_id do portal user)
// para mostrar apenas a conversa DESTE cliente.
export default async function ViewerMensagensPage({
  params,
}: {
  params: Promise<{ vinculo_id: string }>
}) {
  const { vinculo_id } = await params
  const { user, admin } = await requireViewerAccess()

  const ctx = await getViewerVinculo(admin, vinculo_id, user.orgId)
  if (!ctx) redirect("/dashboard/portal-cliente")

  if (!ctx.portalUserId) {
    return (
      <div className="rounded-xl border border-stone-800 bg-stone-900 px-6 py-12 text-center">
        <p className="text-sm text-stone-400">
          Este cliente ainda não tem acesso ao portal — sem histórico de mensagens.
        </p>
      </div>
    )
  }

  const { data: mensagens } = await admin
    .from("obra_mensagens")
    .select("id, content, created_at, sender_type")
    .eq("obra_id", ctx.obra.id)
    .eq("cliente_id", ctx.portalUserId)
    .order("created_at", { ascending: true })

  return (
    <div>
      <div className="mb-4 rounded-lg border border-stone-800 bg-stone-900/60 px-3 py-2 text-xs text-stone-500">
        Somente leitura — as mensagens não podem ser respondidas por aqui.
      </div>
      <MensagensList mensagens={mensagens ?? []} />
    </div>
  )
}
