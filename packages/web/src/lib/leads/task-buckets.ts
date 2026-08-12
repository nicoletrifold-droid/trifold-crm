/**
 * Story 75-298 — buckets de tarefas pendentes por vencimento, em UM lugar.
 *
 * A lógica nasceu inline em `/broker/leads/page.tsx` (filtro `?tasks=`) e agora é
 * reusada pelo drill-down dos cards de tarefas do dashboard do gerente
 * (`/dashboard/leads?tasks=`). Extraída SEM mudança de comportamento.
 *
 * ⚠️ ESPELHO DE SQL: a régua aqui reproduz a RPC `get_broker_dashboard_counts`
 * (versão vigente em `supabase/migrations/209_hotfix_rls_org_scope.sql:313-359`),
 * que alimenta os cards. Mexer em um lado sem o outro faz o número do card deixar
 * de bater com a lista — que é exatamente o defeito que a 75-298 consertou.
 *
 * Duas regras não-óbvias, herdadas da RPC:
 * - `due_at NULL` NÃO entra em nenhum dos 3 baldes de vencimento, mas CONTA como
 *   "tem tarefa" (o `NOT EXISTS` do `sem_tarefas` ignora `due_at`).
 * - Um lead com 2 tarefas em baldes diferentes aparece nos DOIS. A RPC usa
 *   `COUNT(DISTINCT l.id)` por balde, então os conjuntos se sobrepõem por desenho.
 *
 * O helper é PURO e SEM RELÓGIO: recebe as fronteiras do dia por parâmetro. Isso é
 * obrigatório para o teste — o vitest não executa `instrumentation.ts`, logo não
 * herda `TZ=America/Sao_Paulo`, e um helper que lesse o relógio passaria ou falharia
 * conforme a máquina.
 */

export const TASK_FILTER_VALUES = ["atrasadas", "para-hoje", "futuras", "sem-tarefas"] as const
export type TaskFilterValue = (typeof TASK_FILTER_VALUES)[number]

export const TASK_FILTER_LABELS: Record<TaskFilterValue, string> = {
  atrasadas: "Tarefas atrasadas",
  "para-hoje": "Tarefas para hoje",
  futuras: "Tarefas futuras",
  "sem-tarefas": "Sem tarefas",
}

/** Devolve o valor só se estiver na whitelist; qualquer outra coisa → null. */
export function parseTaskFilter(raw?: string | null): TaskFilterValue | null {
  return TASK_FILTER_VALUES.includes(raw as TaskFilterValue) ? (raw as TaskFilterValue) : null
}

/** Linha mínima de `lead_tasks` que a bucketização precisa. */
export type PendingTask = { lead_id: string; due_at: string | null }

export type TaskBucketBoundaries = { todayStart: Date; tomorrowStart: Date }

export type TaskBuckets = {
  /** ≥1 tarefa aberta vencida (due_at < todayStart). */
  atrasadas: Set<string>
  /** ≥1 tarefa aberta vencendo hoje (todayStart ≤ due_at < tomorrowStart). */
  paraHoje: Set<string>
  /** ≥1 tarefa aberta vencendo de amanhã em diante. */
  futuras: Set<string>
  /** ≥1 tarefa aberta, COM ou SEM due_at — é o complemento de "sem tarefas". */
  comTarefa: Set<string>
}

/**
 * Fronteiras do dia em curso no fuso do SERVIDOR.
 *
 * O servidor roda em `America/Sao_Paulo` desde a Story 75-33
 * (`instrumentation.ts` seta `process.env.TZ` no boot do runtime Node), então
 * `setHours(0,0,0,0)` JÁ é meia-noite de Brasília — idêntico ao
 * `date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')` da RPC. NÃO
 * reimplementar aritmética de fuso aqui.
 *
 * `now` é parâmetro (com default) para manter o relógio fora do corpo dos server
 * components e deixar o cálculo testável.
 */
export function taskBucketBoundaries(now: Date = new Date()): TaskBucketBoundaries {
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  return { todayStart, tomorrowStart }
}

/** Bucketiza tarefas ABERTAS (`completed_at IS NULL`) por `due_at`. */
export function bucketByTaskDue(
  tasks: readonly PendingTask[] | null | undefined,
  { todayStart, tomorrowStart }: TaskBucketBoundaries
): TaskBuckets {
  const buckets: TaskBuckets = {
    atrasadas: new Set<string>(),
    paraHoje: new Set<string>(),
    futuras: new Set<string>(),
    comTarefa: new Set<string>(),
  }

  for (const t of tasks ?? []) {
    if (!t.lead_id) continue
    // Antes do `due_at`: tarefa sem vencimento não tem balde, mas o lead TEM tarefa.
    buckets.comTarefa.add(t.lead_id)
    if (!t.due_at) continue

    const due = new Date(t.due_at)
    // Defensivo: `due_at` é timestamptz, então na prática sempre parseia. Sem esta
    // guarda um valor inválido cairia no `else` e viraria "futura" — mentira pior
    // que ficar de fora dos baldes de vencimento.
    if (Number.isNaN(due.getTime())) continue

    if (due < todayStart) buckets.atrasadas.add(t.lead_id)
    else if (due < tomorrowStart) buckets.paraHoje.add(t.lead_id)
    else buckets.futuras.add(t.lead_id)
  }

  return buckets
}

/**
 * Conjunto de `lead_id` que o filtro deve INCLUIR.
 *
 * `sem-tarefas` devolve `null`: ele não é uma lista de inclusão, é a EXCLUSÃO de
 * `buckets.comTarefa` (quem chama inverte o filtro).
 */
export function taskFilterLeadIds(buckets: TaskBuckets, filter: TaskFilterValue): Set<string> | null {
  switch (filter) {
    case "atrasadas":
      return buckets.atrasadas
    case "para-hoje":
      return buckets.paraHoje
    case "futuras":
      return buckets.futuras
    case "sem-tarefas":
      return null
  }
}
