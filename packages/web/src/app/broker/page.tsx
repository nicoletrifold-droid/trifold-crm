import { createClient } from "@web/lib/supabase/server"
import { propertyStatusLabel } from "@web/lib/property-status"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import {
  Users, Bell, ChevronRight, UserPlus,
  AlertCircle, Calendar, CheckCircle2, Filter, UserX, AlarmClock,
} from "lucide-react"
import { SOURCE_LABELS } from "@web/lib/constants"

const AGUARDANDO_STAGE_ID = "00000000-0000-0000-0001-000000000001"

const MOTIVATIONAL_PHRASES = [
  "Cada lead é uma porta. Você decide qual abre hoje.",
  "O corretor que liga primeiro, vende primeiro.",
  "Persistência transforma interessados em compradores.",
  "Uma ligação a mais hoje pode ser a venda do mês.",
  "Bons corretores esperam oportunidades. Grandes corretores as criam.",
  "O não de hoje é o sim de amanhã. Continue.",
  "Seu próximo cliente está esperando o seu contato.",
  "Foco, consistência e atendimento: a fórmula da venda.",
  "Quem atende rápido, atende melhor.",
  "Cada objeção superada é um passo mais perto do fechamento.",
  "O mercado imobiliário premia quem não desiste.",
  "Hoje é um ótimo dia para fechar um negócio.",
  "A diferença entre tentar e conseguir é a persistência.",
  "Um sorriso no atendimento vale mais que qualquer desconto.",
  "O cliente não compra um imóvel, compra um sonho. Ajude-o a realizá-lo.",
  "Pequenas ações todos os dias constroem grandes resultados.",
  "Seu pipeline cheio hoje é sua renda garantida amanhã.",
  "Cada follow-up é uma demonstração de comprometimento.",
  "Conhecimento do produto mais empatia com o cliente: venda garantida.",
  "O melhor horário para ligar para um lead é agora.",
  "Quem organiza o dia, domina os resultados.",
  "Tarefas em dia, mente tranquila, vendas fluindo.",
  "Cada imóvel tem o comprador certo. Seja o corretor certo para encontrá-lo.",
  "Sucesso em vendas é 10% inspiração e 90% follow-up.",
  "Um atendimento excepcional gera indicações para sempre.",
  "Não espere o lead perfeito. Trabalhe o lead que você tem.",
  "A venda começa antes do primeiro contato: começa no preparo.",
  "Cada dia de trabalho focado é um investimento no seu futuro.",
  "Leads bem atendidos se tornam clientes fiéis e indicadores.",
  "Você não está vendendo imóveis, está transformando vidas.",
  "O segredo do sucesso em vendas? Aparecer todos os dias.",
  "Cada tarefa concluída hoje é um obstáculo a menos amanhã.",
  "Grandes vendedores ouvem mais do que falam.",
  "A motivação te faz começar. O hábito te faz continuar.",
  "Corra atrás do seu pipeline como se cada lead fosse o último.",
  "Resultados extraordinários vêm de esforços ordinários feitos de forma consistente.",
  "O cliente lembra de como você o fez sentir. Faça-o sentir especial.",
  "Quem domina o follow-up, domina as vendas.",
  "Hoje é o dia certo para retomar aquele lead que ficou parado.",
  "Cada não te aproxima do próximo sim.",
]

function getDailyPhrase(): string {
  const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
  let hash = 0
  for (let i = 0; i < today.length; i++) {
    hash = (hash * 31 + today.charCodeAt(i)) & 0xffffffff
  }
  return MOTIVATIONAL_PHRASES[Math.abs(hash) % MOTIVATIONAL_PHRASES.length]!
}

function greeting() {
  const h = parseInt(
    new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false,
    })
  )
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d} ${d === 1 ? "dia" : "dias"}`
}

type Counts = {
  total: number; novos: number; trabalhados: number
  sem_tarefas: number; atrasadas: number; para_hoje: number; futuras: number
}

type FunnelRow = {
  stage_id: string; stage_name: string; stage_slug: string
  stage_color: string; stage_position: number; total_leads: number
  leads_atrasadas: number; leads_para_hoje: number; leads_futuras: number
}

export default async function BrokerHomePage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const todayStart = new Date(new Date().toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo" }))
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)

  const [
    countsResult,
    funnelResult,
    roletaConfigResult,
    brokerResult,
    novosLeads,
    pendingLogs,
    tasksAtrasadas,
    tasksHoje,
    propertiesResult,
  ] = await Promise.all([
    supabase.rpc("get_broker_dashboard_counts", {
      p_org_id: user.orgId, p_broker_id: user.id,
    }),
    supabase.rpc("get_broker_funnel_stats", {
      p_org_id: user.orgId, p_broker_id: user.id,
    }),
    supabase.from("roleta_config").select("is_active").eq("org_id", user.orgId).maybeSingle(),
    supabase
      .from("brokers")
      .select("id, is_available, roleta_fila(position, is_active)")
      .eq("user_id", user.id)
      .eq("org_id", user.orgId)
      .maybeSingle(),
    // Novos leads disponíveis: atribuídos ao corretor, ainda na etapa "Aguardando atendimento"
    supabase
      .from("leads")
      .select("id, name, phone, source, created_at")
      .eq("org_id", user.orgId)
      .eq("assigned_broker_id", user.id)
      .eq("stage_id", AGUARDANDO_STAGE_ID)
      .eq("is_active", true)
      // "Perdido" é ETAPA, não lost_reason: já filtramos pela etapa "Aguardando atendimento"
      // (ativa). Não filtrar por lost_reason — leads reativados podem ter lost_reason residual.
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("follow_up_log")
      .select(`id, type, message, created_at, lead:leads!lead_id(id, name, phone, assigned_broker_id)`)
      .eq("org_id", user.orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
    // Tarefas atrasadas: vencidas antes de hoje, não concluídas, de leads do corretor
    supabase
      .from("lead_tasks")
      .select("id, title, action_type, due_at, lead:leads!inner(id, name, phone, assigned_broker_id)")
      .eq("org_id", user.orgId)
      .is("completed_at", null)
      .lt("due_at", todayStart.toISOString())
      .eq("leads.assigned_broker_id", user.id)
      .order("due_at", { ascending: true })
      .limit(5),
    // Tarefas para hoje: vencem hoje, não concluídas, de leads do corretor
    supabase
      .from("lead_tasks")
      .select("id, title, action_type, due_at, lead:leads!inner(id, name, phone, assigned_broker_id)")
      .eq("org_id", user.orgId)
      .is("completed_at", null)
      .gte("due_at", todayStart.toISOString())
      .lt("due_at", todayEnd.toISOString())
      .eq("leads.assigned_broker_id", user.id)
      .order("due_at", { ascending: true })
      .limit(5),
    // Empreendimentos (somente leitura) — disponibilidade e % vendido
    supabase
      .from("properties")
      .select("id, name, status, total_units, available_units, city")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
  ])

  type TaskItem = {
    id: string; title: string; action_type: string; due_at: string | null
    lead: { id: string; name: string | null; phone: string } | Array<{ id: string; name: string | null; phone: string }> | null
  }
  const atrasadasList = (tasksAtrasadas.data ?? []) as TaskItem[]
  const hojeList = (tasksHoje.data ?? []) as TaskItem[]

  const actionTypeLabel: Record<string, string> = {
    ligacao: "Ligação", whatsapp: "WhatsApp", email: "E-mail",
    visita: "Visita", reuniao: "Reunião", outro: "Outro",
  }

  const counts = (countsResult.data ?? {
    total: 0, novos: 0, trabalhados: 0, sem_tarefas: 0, atrasadas: 0, para_hoje: 0, futuras: 0,
  }) as Counts

  const funnel = (funnelResult.data ?? []) as FunnelRow[]

  const properties = (propertiesResult.data ?? []) as Array<{
    id: string; name: string; status: string
    total_units: number | null; available_units: number | null; city: string | null
  }>

  const roletaAtiva = roletaConfigResult.data?.is_active ?? false
  const broker = brokerResult.data
  const roletaFila = broker?.roleta_fila
  const roletaEntry = Array.isArray(roletaFila) ? roletaFila[0] : roletaFila
  const isOnline = roletaEntry?.is_active ?? false
  const roletaPosition = roletaEntry?.position ?? null

  const myPendingLogs = ((pendingLogs.data ?? []) as Array<{
    id: string; type: string; message: string | null; created_at: string
    lead: { id: string; name: string | null; phone: string; assigned_broker_id: string | null } | null | Array<unknown>
  }>)
    .filter((log) => {
      const lead = Array.isArray(log.lead) ? log.lead[0] : log.lead
      return (lead as { assigned_broker_id?: string | null } | null)?.assigned_broker_id === user.id
    })
    .slice(0, 5)

  const logTypeLabel: Record<string, string> = {
    email: "E-mail", whatsapp: "WhatsApp", call: "Ligação", manual: "Manual",
  }

  // Card base classes — light + dark
  const card = "rounded-xl border border-gray-200 bg-white p-4 transition-all dark:border-stone-800 dark:bg-stone-900"
  const cardHover = `${card} hover:border-gray-300 dark:hover:border-stone-700`

  return (
    <div className="space-y-6">

      {/* ── Greeting ─────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-medium text-orange-500">{greeting()},</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-gray-900 dark:text-stone-100">
            {user.name}
          </h1>
          <p className="mt-1 text-xs italic text-stone-500 dark:text-stone-500">
            &ldquo;{getDailyPhrase()}&rdquo;
          </p>
        </div>
        <p className="text-xs text-gray-400 dark:text-stone-600">
          {new Date().toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long",
          })}
        </p>
      </div>

      {/* ── Meus Leads Ativos ────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-stone-200">Meus Leads Ativos</h2>
          <span className="flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-0.5 text-sm font-bold text-orange-600 dark:bg-orange-500/20 dark:text-orange-400">
            <Users className="h-3.5 w-3.5" />
            {counts.total}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Link href="/broker/leads?stage=00000000-0000-0000-0001-000000000001" className={`flex flex-col ${cardHover} hover:border-orange-300 dark:hover:border-orange-500/40`}>
            <div className="mb-2"><Users className="h-5 w-5 text-orange-500" /></div>
            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{counts.novos}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase leading-tight text-gray-400 dark:text-stone-500">
              Novos Leads<br /><span className="text-gray-500 dark:text-stone-400">Disponíveis</span>
            </p>
          </Link>

          <Link href="/broker/leads?filter=trabalhados" className={`flex flex-col ${cardHover}`}>
            <div className="mb-2"><Users className="h-5 w-5 text-gray-400 dark:text-stone-500" /></div>
            <p className="text-3xl font-bold text-gray-900 dark:text-stone-100">{counts.trabalhados}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase leading-tight text-gray-400 dark:text-stone-500">
              Leads Já<br /><span className="text-gray-500 dark:text-stone-400">Trabalhados</span>
            </p>
          </Link>

          <Link href="/broker/leads?tasks=sem-tarefas" className={`flex flex-col rounded-xl border p-4 transition-all ${
            counts.sem_tarefas > 0
              ? "border-red-200 bg-red-50 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:hover:bg-red-500/15"
              : `${cardHover}`
          }`}>
            <div className="mb-2"><UserX className={`h-5 w-5 ${counts.sem_tarefas > 0 ? "text-red-500" : "text-gray-400 dark:text-stone-500"}`} /></div>
            <p className={`text-3xl font-bold ${counts.sem_tarefas > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-stone-100"}`}>
              {counts.sem_tarefas}
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase leading-tight text-gray-400 dark:text-stone-500">
              Total Leads<br /><span className={counts.sem_tarefas > 0 ? "text-red-500 dark:text-red-400" : "text-gray-500 dark:text-stone-400"}>Sem Tarefas</span>
            </p>
          </Link>

          <Link href="/broker/leads?tasks=atrasadas" className={`flex flex-col rounded-xl border p-4 transition-all ${
            counts.atrasadas > 0
              ? "border-red-200 bg-red-50 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:hover:bg-red-500/15"
              : `${cardHover}`
          }`}>
            <div className="mb-2"><AlertCircle className={`h-5 w-5 ${counts.atrasadas > 0 ? "text-red-500" : "text-gray-400 dark:text-stone-500"}`} /></div>
            <p className={`text-3xl font-bold ${counts.atrasadas > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-stone-100"}`}>
              {counts.atrasadas}
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase leading-tight text-gray-400 dark:text-stone-500">
              Com Tarefas<br /><span className={counts.atrasadas > 0 ? "text-red-500 dark:text-red-400" : "text-gray-500 dark:text-stone-400"}>Atrasadas</span>
            </p>
          </Link>

          <Link href="/broker/leads?tasks=para-hoje" className={`flex flex-col ${cardHover} hover:border-amber-300 dark:hover:border-amber-500/40`}>
            <div className="mb-2"><Calendar className="h-5 w-5 text-amber-500" /></div>
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{counts.para_hoje}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase leading-tight text-gray-400 dark:text-stone-500">
              Com Tarefas<br /><span className="text-amber-600 dark:text-amber-400">Para Hoje</span>
            </p>
          </Link>

          <Link href="/broker/leads?tasks=futuras" className={`flex flex-col ${cardHover} hover:border-emerald-300 dark:hover:border-emerald-500/40`}>
            <div className="mb-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" /></div>
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{counts.futuras}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase leading-tight text-gray-400 dark:text-stone-500">
              Com Tarefas<br /><span className="text-emerald-600 dark:text-emerald-400">Futuras</span>
            </p>
          </Link>
        </div>
      </div>

      {/* ── Empreendimentos ──────────────────────────────────────── */}
      {properties.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900 dark:text-stone-200">Empreendimentos</h2>
            <Link href="/broker/properties" className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 dark:text-orange-500 dark:hover:text-orange-400">
              Ver todos <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {properties.map((property) => {
              const soldPct =
                property.total_units && property.available_units != null
                  ? Math.round(
                      ((property.total_units - property.available_units) / property.total_units) * 100
                    )
                  : null
              return (
                <Link
                  key={property.id}
                  href={`/broker/properties/${property.id}`}
                  className="rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900 dark:text-stone-100">{property.name}</p>
                      <p className="text-sm text-gray-500 dark:text-stone-400">
                        {property.city ?? "-"}
                        {property.total_units != null && <> &middot; {property.total_units} unidades</>}
                        {property.available_units != null && (
                          <>
                            {" · "}
                            <span className="font-medium text-emerald-600 dark:text-emerald-300">
                              {property.available_units} disponíveis
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <span
                      className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        property.status === "selling"
                          ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                          : property.status === "launching"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                          : "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
                      }`}
                    >
                      {propertyStatusLabel(property.status)}
                    </span>
                  </div>
                  {soldPct != null && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-stone-800">
                        <div
                          className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                          style={{ width: `${soldPct}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium tabular-nums text-gray-400 dark:text-stone-500">
                        {soldPct}% vendido
                      </span>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Tarefas Atrasadas + Para Hoje ────────────────────────── */}
      {(atrasadasList.length > 0 || hojeList.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">

          {/* Atrasadas */}
          <div className="flex flex-col rounded-2xl border-l-4 border-red-500 bg-stone-900 ring-1 ring-red-500/20">
            <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <h2 className="text-sm font-semibold text-stone-200">Tarefas Atrasadas</h2>
                {atrasadasList.length > 0 && (
                  <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-bold text-red-400">
                    {counts.atrasadas}
                  </span>
                )}
              </div>
              <Link href="/broker/leads?tasks=atrasadas" className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">
                Ver todas <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {atrasadasList.length === 0 ? (
              <div className="flex flex-1 items-center justify-center gap-2 px-6 py-8">
                <CheckCircle2 className="h-5 w-5 text-stone-700" />
                <p className="text-sm text-stone-600">Nenhuma tarefa atrasada!</p>
              </div>
            ) : (
              <ul className="divide-y divide-stone-800/70">
                {atrasadasList.map((task) => {
                  const lead = Array.isArray(task.lead) ? task.lead[0] : task.lead
                  return (
                    <li key={task.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="flex-shrink-0 rounded bg-red-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-400">
                        {actionTypeLabel[task.action_type] ?? task.action_type}
                      </span>
                      <div className="min-w-0 flex-1">
                        {lead ? (
                          <Link href={`/broker/leads/${(lead as { id: string }).id}`} className="block truncate text-sm font-medium text-stone-200 hover:text-orange-400">
                            {(lead as { name?: string | null }).name || (lead as { phone: string }).phone}
                          </Link>
                        ) : (
                          <p className="truncate text-sm text-stone-500">Lead removido</p>
                        )}
                        <p className="truncate text-xs text-stone-500">{task.title}</p>
                      </div>
                      {task.due_at && (
                        <p className="flex-shrink-0 text-xs font-medium text-red-400">
                          {new Date(task.due_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" })}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Para Hoje */}
          <div className="flex flex-col rounded-2xl border-l-4 border-amber-500 bg-stone-900 ring-1 ring-amber-500/20">
            <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
              <div className="flex items-center gap-2">
                <AlarmClock className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-stone-200">Tarefas para Hoje</h2>
                {hojeList.length > 0 && (
                  <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-xs font-bold text-amber-400">
                    {counts.para_hoje}
                  </span>
                )}
              </div>
              <Link href="/broker/leads?tasks=para-hoje" className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
                Ver todas <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {hojeList.length === 0 ? (
              <div className="flex flex-1 items-center justify-center gap-2 px-6 py-8">
                <CheckCircle2 className="h-5 w-5 text-stone-700" />
                <p className="text-sm text-stone-600">Nenhuma tarefa para hoje.</p>
              </div>
            ) : (
              <ul className="divide-y divide-stone-800/70">
                {hojeList.map((task) => {
                  const lead = Array.isArray(task.lead) ? task.lead[0] : task.lead
                  return (
                    <li key={task.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="flex-shrink-0 rounded bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-400">
                        {actionTypeLabel[task.action_type] ?? task.action_type}
                      </span>
                      <div className="min-w-0 flex-1">
                        {lead ? (
                          <Link href={`/broker/leads/${(lead as { id: string }).id}`} className="block truncate text-sm font-medium text-stone-200 hover:text-orange-400">
                            {(lead as { name?: string | null }).name || (lead as { phone: string }).phone}
                          </Link>
                        ) : (
                          <p className="truncate text-sm text-stone-500">Lead removido</p>
                        )}
                        <p className="truncate text-xs text-stone-500">{task.title}</p>
                      </div>
                      {task.due_at && (
                        <p className="flex-shrink-0 text-xs font-medium text-amber-400">
                          {new Date(task.due_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

        </div>
      )}

      {/* ── Meu Funil de Vendas ──────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-stone-200">Meu Funil de Vendas</h2>
          <Link href="/broker/pipeline" className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 dark:text-orange-500 dark:hover:text-orange-400">
            Ver pipeline <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {funnel.map((stage) => (
            <Link
              key={stage.stage_id}
              href={`/broker/leads?stage=${stage.stage_id}`}
              className="relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700"
            >
              <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: stage.stage_color }} />
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="mt-1 text-[11px] font-semibold uppercase leading-tight text-gray-400 dark:text-stone-500">
                  {stage.stage_name}
                </p>
                <Filter className="h-4 w-4 flex-shrink-0 text-gray-300 dark:text-stone-700" />
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-stone-100">{stage.total_leads}</p>
              <div className="mt-3 flex gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${stage.leads_atrasadas > 0 ? "bg-red-500 text-white" : "bg-gray-100 text-gray-400 dark:bg-stone-800 dark:text-stone-600"}`}>
                  {stage.leads_atrasadas}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${stage.leads_para_hoje > 0 ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-400 dark:bg-stone-800 dark:text-stone-600"}`}>
                  {stage.leads_para_hoje}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${stage.leads_futuras > 0 ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-400 dark:bg-stone-800 dark:text-stone-600"}`}>
                  {stage.leads_futuras}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Novos Leads Disponíveis + Follow-ups ─────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">

        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-stone-800">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-stone-300">Novos Leads Disponíveis</h2>
              {counts.novos > 0 && (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-500/20 dark:text-orange-400">
                  {counts.novos}
                </span>
              )}
            </div>
            <Link href={`/broker/leads?stage=${AGUARDANDO_STAGE_ID}`} className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 dark:text-orange-500 dark:hover:text-orange-400">
              Ver todos <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {!novosLeads.data || novosLeads.data.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10">
              <UserPlus className="h-8 w-8 text-gray-300 dark:text-stone-700" />
              <p className="text-sm text-gray-400 dark:text-stone-600">Nenhum lead novo no momento.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-stone-800/70">
              {(novosLeads.data as Array<{
                id: string; name: string | null; phone: string | null
                source: string | null; created_at: string
              }>).map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/broker/leads/${lead.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-stone-800/50"
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-500/15">
                      <UserPlus className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800 dark:text-stone-200">
                        {lead.name || lead.phone || "Lead sem nome"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-stone-500">
                        {lead.source ? (SOURCE_LABELS[lead.source] ?? lead.source) : "Origem não informada"}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-xs text-gray-400 dark:text-stone-500">
                      {timeAgo(lead.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-stone-800">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-stone-300">Pendências de follow-up</h2>
          </div>
          {myPendingLogs.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10">
              <Bell className="h-8 w-8 text-gray-300 dark:text-stone-700" />
              <p className="text-sm text-gray-400 dark:text-stone-600">Nenhuma pendência. Tudo em dia!</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-stone-800/70">
              {myPendingLogs.map((log) => {
                const lead = Array.isArray(log.lead) ? log.lead[0] : log.lead
                return (
                  <li key={log.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="flex-shrink-0 rounded-lg bg-yellow-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400">
                      {logTypeLabel[log.type] ?? log.type}
                    </span>
                    <div className="min-w-0 flex-1">
                      {lead ? (
                        <Link href={`/broker/leads/${(lead as { id: string }).id}`} className="block truncate text-sm font-medium text-gray-800 hover:text-orange-600 dark:text-stone-200 dark:hover:text-orange-300">
                          {(lead as { name?: string | null }).name || (lead as { phone?: string | null }).phone || "Lead"}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-medium text-gray-400 dark:text-stone-500">Lead removido</p>
                      )}
                      {log.message && (
                        <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-stone-600">{log.message}</p>
                      )}
                    </div>
                    <p className="flex-shrink-0 text-xs text-gray-400 dark:text-stone-600">
                      {new Date(log.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
