import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { RoletaConfigPanel } from "./_components/roleta-config-panel"
import { RoletaFilaPanel } from "./_components/roleta-fila-panel"

export default async function RoletaPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const [
    { data: config },
    { data: filaRaw },
    { data: brokers },
  ] = await Promise.all([
    supabase
      .from("roleta_config")
      .select("*")
      .eq("org_id", user.orgId)
      .maybeSingle(),
    supabase
      .from("roleta_fila")
      .select("id, position, is_active, broker_id, brokers!inner(id, user_id, users!inner(name, email, phone))")
      .eq("org_id", user.orgId)
      .order("position", { ascending: true }),
    supabase
      .from("brokers")
      .select("id, user_id, is_available, users!inner(name, email)")
      .eq("org_id", user.orgId)
      .eq("is_available", true),
  ])

  // Normalize fila entries
  type FilaEntry = {
    id: string
    position: number
    is_active: boolean
    broker_id: string
    brokerName: string
    brokerEmail: string
    brokerPhone: string | null
  }

  const fila: FilaEntry[] = (filaRaw ?? []).map((e) => {
    const broker = Array.isArray(e.brokers) ? e.brokers[0] : e.brokers
    const user = broker ? (Array.isArray(broker.users) ? broker.users[0] : broker.users) : null
    return {
      id: e.id as string,
      position: e.position as number,
      is_active: e.is_active as boolean,
      broker_id: e.broker_id as string,
      brokerName: (user?.name as string) ?? "",
      brokerEmail: (user?.email as string) ?? "",
      brokerPhone: (user?.phone as string | null) ?? null,
    }
  })

  // Brokers not yet in fila
  const inFilaIds = new Set(fila.map((f) => f.broker_id))
  type BrokerOption = { brokerId: string; name: string; email: string }
  const availableBrokers: BrokerOption[] = (brokers ?? [])
    .filter((b) => !inFilaIds.has(b.id as string))
    .map((b) => {
      const u = Array.isArray(b.users) ? b.users[0] : b.users
      return {
        brokerId: b.id as string,
        name: (u?.name as string) ?? "",
        email: (u?.email as string) ?? "",
      }
    })

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Roleta de Leads</h1>
          {config?.is_active ? (
            <span className="rounded-full bg-emerald-950 border border-emerald-700 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              Ativa
            </span>
          ) : (
            <span className="rounded-full bg-stone-800 border border-stone-700 px-2.5 py-0.5 text-xs font-semibold text-stone-400">
              Pausada
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-stone-400">
          Distribuição automática de leads por round-robin entre os corretores ativos.
        </p>
      </div>

      <RoletaConfigPanel initialConfig={config} />
      <RoletaFilaPanel fila={fila} availableBrokers={availableBrokers} />
    </div>
  )
}
