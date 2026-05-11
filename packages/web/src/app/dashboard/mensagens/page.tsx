import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { MensagensInbox } from "./_components/mensagens-inbox"

interface ObraInbox {
  obra_id: string
  obra_name: string
  unread_count: number
  last_message: {
    content: string | null
    message_type: string
    sender_type: string
    created_at: string
  } | null
  clientes: { name: string }[]
}

async function getInboxObras(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<ObraInbox[]> {
  const { data: msgs } = await supabase
    .from("obra_mensagens")
    .select("obra_id, content, message_type, sender_type, read_at, created_at, obras(name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })

  if (!msgs?.length) return []

  const obraMap = new Map<string, ObraInbox>()
  for (const msg of msgs) {
    const obraName = (msg.obras as { name: string }[] | null)?.[0]?.name ?? "Obra"
    if (!obraMap.has(msg.obra_id)) {
      obraMap.set(msg.obra_id, {
        obra_id: msg.obra_id,
        obra_name: obraName,
        unread_count: 0,
        last_message: {
          content: msg.content,
          message_type: msg.message_type,
          sender_type: msg.sender_type,
          created_at: msg.created_at,
        },
        clientes: [],
      })
    }
    if (msg.sender_type === "cliente" && !msg.read_at) {
      obraMap.get(msg.obra_id)!.unread_count++
    }
  }

  const obraIds = [...obraMap.keys()]
  const { data: clientesRaw } = await supabase
    .from("cliente_obras")
    .select("obra_id, users(id, name)")
    .in("obra_id", obraIds)

  for (const row of clientesRaw ?? []) {
    const u = Array.isArray(row.users) ? row.users[0] : row.users
    if (u) obraMap.get(row.obra_id)?.clientes.push({ name: u.name as string })
  }

  return [...obraMap.values()]
}

export default async function MensagensPage() {
  const user = await getServerUser()

  if (user.role !== "admin" && user.role !== "supervisor") {
    redirect("/dashboard")
  }

  const supabase = await createClient()
  const obras = await getInboxObras(supabase, user.orgId)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mensagens</h1>
        <p className="mt-1 text-sm text-gray-500">
          Central de atendimento — conversas com clientes por obra
        </p>
      </div>
      <MensagensInbox initialObras={obras} adminName={user.name ?? "Admin"} />
    </div>
  )
}
