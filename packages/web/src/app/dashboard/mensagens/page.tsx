import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { MensagensInbox } from "./_components/mensagens-inbox"
import type { ClienteConversa } from "@web/app/api/admin/mensagens/route"

const PAGE_LIMIT = 30

async function getInboxPage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<{ conversas: ClienteConversa[]; total: number }> {
  try {
    const { data: msgs } = await supabase
      .from("obra_mensagens")
      .select("obra_id, cliente_id, content, message_type, sender_type, read_at, created_at")
      .eq("org_id", orgId)
      .not("cliente_id", "is", null)
      .order("created_at", { ascending: false })

    if (!msgs?.length) return { conversas: [], total: 0 }

    const conversaMap = new Map<string, ClienteConversa>()
    for (const msg of msgs) {
      const key = `${msg.obra_id}::${msg.cliente_id}`
      if (!conversaMap.has(key)) {
        conversaMap.set(key, {
          conversa_id: key,
          obra_id: msg.obra_id,
          obra_name: "",
          cliente_id: msg.cliente_id as string,
          cliente_name: "",
          unread_count: 0,
          last_message_at: msg.created_at,
          last_message: {
            content: msg.content,
            message_type: msg.message_type,
            sender_type: msg.sender_type,
            created_at: msg.created_at,
          },
        })
      }
      if (msg.sender_type === "cliente" && !msg.read_at) {
        conversaMap.get(key)!.unread_count++
      }
    }

    const obraIds = [...new Set([...conversaMap.values()].map((c) => c.obra_id))]
    const clienteIds = [...new Set([...conversaMap.values()].map((c) => c.cliente_id))]

    const { data: obrasRaw } = await supabase
      .from("obras")
      .select("id, name")
      .in("id", obraIds)

    const obraNameMap = new Map<string, string>()
    for (const o of obrasRaw ?? []) obraNameMap.set(o.id, o.name)
    for (const c of conversaMap.values()) c.obra_name = obraNameMap.get(c.obra_id) ?? ""

    const { data: usersRaw } = await supabase
      .from("users")
      .select("id, name")
      .in("id", clienteIds)

    const userNameMap = new Map<string, string>()
    for (const u of usersRaw ?? []) userNameMap.set(u.id, u.name ?? "")
    for (const c of conversaMap.values()) c.cliente_name = userNameMap.get(c.cliente_id) ?? ""

    const all = [...conversaMap.values()].sort(
      (a, b) =>
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    )

    return { conversas: all.slice(0, PAGE_LIMIT), total: all.length }
  } catch {
    return { conversas: [], total: 0 }
  }
}

export default async function MensagensPage() {
  const user = await getServerUser()

  if (user.role !== "admin" && user.role !== "supervisor") {
    redirect("/dashboard")
  }

  const supabase = await createClient()
  const { conversas, total } = await getInboxPage(supabase, user.orgId)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Mensagens</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Central de atendimento — conversas com clientes por obra
        </p>
      </div>
      <MensagensInbox
        initialConversas={conversas}
        initialTotal={total}
        adminName={user.name ?? "Admin"}
      />
    </div>
  )
}
