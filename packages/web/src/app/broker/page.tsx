import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { now } from "@web/lib/time"
import Link from "next/link"
import {
  Users, CalendarDays, Bell, ChevronRight, MapPin, Clock,
  AlertCircle, Calendar, CheckCircle2, Filter, UserX, AlarmClock,
} from "lucide-react"
import { NewAppointmentButton } from "./_components/new-appointment-modal"

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "numeric", month: "short",
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
  })
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
  const nowIso = new Date(now()).toISOString()

  const todayStart = new Date(new Date().toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo" }))
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)

  const [
    countsResult,
    funnelResult,
    roletaConfigResult,
    brokerResult,
    upcomingAppointments,
    pendingLogs,
    tasksAtrasadas,
    tasksHoje,
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
    supabase
      .from("appointments")
      .select(`id, scheduled_at, duration_minutes, location, status, client_name,
               lead:leads!lead_id(id, name, phone),
               property:properties!property_id(id, name)`)
      .eq("broker_id", user.id)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
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

      {/* ── Próximos compromissos + Follow-ups ───────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">

        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-stone-800">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-stone-300">Próximos compromissos</h2>
            <Link href="/broker/agenda" className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 dark:text-orange-500 dark:hover:text-orange-400">
              Ver agenda <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {!upcomingAppointments.data || upcomingAppointments.data.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10">
              <CalendarDays className="h-8 w-8 text-gray-300 dark:text-stone-700" />
              <p className="text-sm text-gray-400 dark:text-stone-600">Nenhum compromisso agendado.</p>
              <NewAppointmentButton />
            </div>
          ) : (
            <>
              <ul className="divide-y divide-gray-100 dark:divide-stone-800/70">
                {upcomingAppointments.data.map((appt) => {
                  const lead = Array.isArray(appt.lead) ? appt.lead[0] : appt.lead
                  const property = Array.isArray(appt.property) ? appt.property[0] : appt.property
                  const clientDisplay =
                    (lead as { name?: string | null } | null)?.name ||
                    appt.client_name || "Cliente não identificado"
                  return (
                    <li key={appt.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="w-14 flex-shrink-0 text-center">
                        <p className="text-xs font-medium text-blue-500 dark:text-blue-400">{formatDate(appt.scheduled_at)}</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-stone-100">{formatTime(appt.scheduled_at)}</p>
                      </div>
                      <div className="h-8 w-px flex-shrink-0 bg-gray-200 dark:bg-stone-800" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800 dark:text-stone-200">{clientDisplay}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400 dark:text-stone-500">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">
                            {appt.location ?? "Stand Trifold"}
                            {(property as { name?: string } | null)?.name ? ` · ${(property as { name: string }).name}` : ""}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1 text-xs text-gray-400 dark:text-stone-500">
                        <Clock className="h-3 w-3" />
                        {appt.duration_minutes}min
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="border-t border-gray-100 px-5 py-3 dark:border-stone-800">
                <NewAppointmentButton />
              </div>
            </>
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
