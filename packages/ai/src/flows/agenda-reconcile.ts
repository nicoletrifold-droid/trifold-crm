/**
 * Story 87-3 — reconciliação diária entre o que a Nicole AFIRMOU na conversa e o
 * que existe em `appointments`.
 *
 * Origem: em 28/06 a lead Célia escreveu "As 9" e a Nicole respondeu "Perfeito!
 * Agendei sua visita para este sábado às 9h". O banco tem ZERO appointments dela
 * até hoje — 40 dias. Ninguém percebeu, porque nada no sistema comparava a fala
 * com a linha no banco. Foram necessários sete casos e uma auditoria manual para
 * o padrão aparecer.
 *
 * Este módulo é observabilidade pura: **não muda uma palavra do que a Nicole
 * fala e não escreve em nenhuma tabela de negócio** (AC5). Além do alarme, ele é
 * o instrumento que publica a taxa de lastro — o número que dimensiona o Epic 88.
 *
 * As três armadilhas que o desenho existe para evitar (todas medidas em produção
 * pelo @po em 07/08, não inferidas):
 *
 *  1. **O relógio.** `detectAffirmedSlot` resolve expressão relativa contra `now`.
 *     Rodar 60 dias retroativos com `now = new Date()` faz "este sábado às 9h"
 *     da Célia (28/06) resolver para o próximo sábado a partir de hoje. **25 dos
 *     30 disparos mudam de valor.** Aqui `now` é SEMPRE `messages.created_at`.
 *  2. **`Invalid Date` silencioso.** `new Date("2026-06-28 13:37:40.123+00")` — o
 *     texto que o Postgres devolve para `timestamptz` — é `Invalid Date` em JS, e
 *     a `detectAffirmedSlot` propaga isso devolvendo um `Date` INVÁLIDO, não
 *     `null`. As distâncias viram `NaN`, tudo cai em `sem_lastro`, e o job
 *     publica 0 % com todas as AC verdes. Ver `parseTimestamptz` e o descarte
 *     `data_invalida`.
 *  3. **A precedência dos baldes.** `com_lastro` e `lembrete` se sobrepõem: o
 *     INSERT do appointment PRECEDE a persistência da fala em 0,09 a 0,87 s nos 6
 *     appointments `created_by='nicole'` do projeto. Com `lembrete` avaliado
 *     primeiro, `com_lastro` fica **inalcançável por construção** e o
 *     instrumento publica 0 % para sempre. A ordem é NORMATIVA — ver
 *     `ORDEM_NORMATIVA` e `classificarBalde`.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { detectAffirmedSlot } from "./visit-slot"

const BRT_OFFSET_HOURS = 3
const MIN_MS = 60_000

/**
 * Janela BILATERAL entre o INSERT do appointment e a fala para que ele conte como
 * lastro do "mesmo turno". Bilateral porque **o lado que importa é o de ANTES da
 * fala**: o appointment é gravado antes de a mensagem ser persistida, sempre.
 * Os 15 min saem da medição — o maior Δ real num turno de confirmação é o do
 * Ailton (12,8 min); os outros cinco casos do projeto são < 1 s. Curta de
 * propósito: um appointment que a Nicole criou dias antes é `lembrete`, não
 * lastro do lembrete de hoje.
 */
export const JANELA_MESMO_TURNO_MIN = 15

/**
 * Janela de CLASSIFICAÇÃO — decide o balde. `|scheduled_at − afirmado| ≤ 30 min`.
 * **Não afrouxar.** Uma janela de ±60 min faria o Ailton (appointment às 10h,
 * fala afirmando 9h) "aparecer" como lastro por acaso, reproduzindo com mais
 * código a cegueira da `detectSlotMismatch` que esta story existe para corrigir.
 */
export const JANELA_CLASSIFICACAO_MIN = 30

/**
 * Janela de RELATÓRIO — ±24 h, só para preencher `divergencia_min` e
 * `appointment_id_proximo` na linha. **Sem nenhum efeito sobre o balde.** Existe
 * porque o Ailton não tem candidato dentro dos ±30 min (o appointment dele está
 * a 60 min) e a AC1-a exige `divergencia_min: 60` na linha dele.
 */
export const JANELA_RELATORIO_MIN = 24 * 60

export type Balde = "com_lastro" | "reparo_humano" | "lembrete" | "sem_lastro"
export type Descarte = "ligacao" | "transicao_humana" | "data_invalida"
export type OrdemBaldes = "normativa" | "lembrete_primeiro"

/** Ordem NORMATIVA de avaliação. Ver o bloco 3 do cabeçalho — trocar isto publica 0 %. */
export const ORDEM_NORMATIVA: OrdemBaldes = "normativa"

export interface AppointmentDoLead {
  id: string
  scheduled_at: Date
  created_at: Date
  created_by: string
  status: string
}

export interface ClassificacaoFala {
  /** A `detectAffirmedSlot` disparou nesta fala? É o denominador bruto do instrumento. */
  disparou: boolean
  /** Horário afirmado, ancorado em `faladoEm`. Nunca um `Date` inválido. */
  afirmou: Date | null
  balde: Balde | null
  appointmentId: string | null
  appointmentStatus: string | null
  /** `|afirmado − agendado|` do appointment mais próximo dentro da janela de RELATÓRIO (±24 h). */
  divergenciaMin: number | null
  /** O appointment de onde saiu a `divergenciaMin` — pode não ser o que classificou. */
  appointmentIdProximo: string | null
  descarte: Descarte | null
}

/**
 * O discriminador visita × ligação (Desenho §5). Mora AQUI, no módulo, **nunca**
 * dentro da `detectAffirmedSlot`: mexer na função compartilhada invalidaria o
 * baseline e invadiria o escopo do Epic 88.
 *
 * Por que ele existe: a frase da Silvana (24/07 23:41) — "Segunda-feira às 9h o
 * corretor te liga" — tem dia + hora únicos, não é ambígua, a função dispara, e
 * ela tem ZERO appointments (tem `lead_tasks` com `action_type='ligacao'`,
 * cumprida às 09:39). Sem este filtro ela cai em `sem_lastro` e gera alerta
 * nomeado no primeiro dia de operação, sobre o único caso que a AC1-b promete
 * excluir. Aplicado aos 30 disparos de 60 dias pelo @po: descarta **exatamente a
 * Silvana e mais nada**.
 *
 * Reconciliar compromisso de ligação está OUT (o artefato dele é `lead_tasks`, e
 * é item próprio no backlog). DESCARTAR ligação está IN — são coisas diferentes.
 */
export const PADROES_LIGACAO: RegExp[] = [
  /\bo corretor te liga\b/,
  /\bo corretor vai te ligar\b/,
  /\bvou te ligar\b/,
  /\bte ligo\b/,
  /\bligacao\b/,
  /\bte ligamos\b/,
  /\bte retorno por telefone\b/,
  /\bentro em contato por telefone\b/,
]

/**
 * Regra de precedência, e ela importa: se a fala tem padrão de ligação **e**
 * compromisso de visita, ela NÃO é descartada — vale como visita. Sem isto, um
 * "te ligo para confirmar a visita de sábado às 10h" sumiria do relatório.
 */
export const PADROES_VISITA: RegExp[] = [
  /\bvisita/,
  /\bte esper/,
  /\bno stand\b/,
  /\bapartamento decorado\b/,
]

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function normalizar(texto: string): string {
  return stripAccents(texto).toLowerCase()
}

/** A fala promete SÓ uma ligação (e nenhuma visita)? Ver `PADROES_LIGACAO`. */
export function ehCompromissoDeLigacao(conteudo: string): boolean {
  const t = normalizar(conteudo ?? "")
  if (!PADROES_LIGACAO.some((re) => re.test(t))) return false
  if (PADROES_VISITA.some((re) => re.test(t))) return false
  return true
}

function ehDataValida(d: Date | null | undefined): d is Date {
  return d instanceof Date && Number.isFinite(d.getTime())
}

/**
 * O texto cru de `timestamptz` do Postgres (`2026-06-28 13:37:40.123+00`) **não é
 * ISO-8601** para o `new Date()` do JS: o espaço no lugar do `T` e o offset `+00`
 * sem `:00` produzem `Invalid Date` — silenciosamente. Normalize SEMPRE antes de
 * construir o `Date`. A guarda `data_invalida` continua existindo mesmo assim,
 * porque o modo de falha é mudo e o preço dele é publicar 0 %.
 */
export function parseTimestamptz(valor: string | Date | null | undefined): Date | null {
  if (valor == null) return null
  if (valor instanceof Date) return ehDataValida(valor) ? valor : null

  const direto = new Date(valor)
  if (ehDataValida(direto)) return direto

  const normalizado = valor
    .trim()
    .replace(" ", "T")
    // "+00" / "-03" → "+00:00" / "-03:00"; "+0000" → "+00:00"
    .replace(/([+-]\d{2})$/, "$1:00")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
  const tentativa = new Date(normalizado)
  if (ehDataValida(tentativa)) return tentativa

  // Sem offset nenhum → o Postgres devolve UTC; o `new Date()` leria como local.
  const comUtc = new Date(`${normalizado}Z`)
  return ehDataValida(comUtc) ? comUtc : null
}

/** Componentes BRT (UTC-3 fixo — Brasil sem horário de verão desde 2019). */
function brtParts(d: Date) {
  const brt = new Date(d.getTime() - BRT_OFFSET_HOURS * 3600_000)
  return {
    y: brt.getUTCFullYear(),
    m: brt.getUTCMonth() + 1,
    d: brt.getUTCDate(),
    hh: brt.getUTCHours(),
    mm: brt.getUTCMinutes(),
  }
}

const pad = (n: number) => String(n).padStart(2, "0")

/** "2026-06-28 10:37 BRT" — a convenção de relatório fixada pela story. */
export function formatarBrt(d: Date): string {
  const p = brtParts(d)
  return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.hh)}:${pad(p.mm)}`
}

/** "2026-07-04" (BRT) — a chave de agrupamento do ALERTA é `lead + dia afirmado`. */
export function diaBrt(d: Date): string {
  const p = brtParts(d)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

function classificarBalde(
  candidatos: AppointmentDoLead[],
  faladoEm: Date,
  ordem: OrdemBaldes
): { balde: Balde; appointment: AppointmentDoLead | null } {
  const janelaTurnoMs = JANELA_MESMO_TURNO_MIN * MIN_MS

  const comLastro = candidatos.find(
    (a) =>
      a.created_by === "nicole" &&
      Math.abs(a.created_at.getTime() - faladoEm.getTime()) <= janelaTurnoMs
  )
  // Guardado antes dos `return` porque o TS estreita `comLastro` para `never`
  // depois deles — e a regra do `lembrete` precisa excluir justamente este id.
  const comLastroId = comLastro?.id ?? null
  const reparo = candidatos.find(
    (a) =>
      (a.created_by === "broker" || a.created_by === "admin") &&
      faladoEm.getTime() < a.created_at.getTime()
  )

  if (ordem === "lembrete_primeiro") {
    // A leitura ERRADA, mantida em código só para a AC3-(i-b)(c) poder publicar a
    // sensibilidade lado a lado. Ela zera o `com_lastro` por construção.
    const lembrete = candidatos.find((a) => a.created_at.getTime() < faladoEm.getTime())
    if (lembrete) return { balde: "lembrete", appointment: lembrete }
    if (comLastro) return { balde: "com_lastro", appointment: comLastro }
    if (reparo) return { balde: "reparo_humano", appointment: reparo }
    return { balde: "sem_lastro", appointment: null }
  }

  // Ordem NORMATIVA (Desenho §2.2), de cima para baixo.
  if (comLastro) return { balde: "com_lastro", appointment: comLastro }
  if (reparo) return { balde: "reparo_humano", appointment: reparo }
  const lembrete = candidatos.find(
    (a) => a.created_at.getTime() < faladoEm.getTime() && a.id !== comLastroId
  )
  if (lembrete) return { balde: "lembrete", appointment: lembrete }
  // Residual: candidato que não casou com regra nenhuma (empate exato de
  // timestamp). Cai no balde que alerta — nunca no que silencia.
  return { balde: "sem_lastro", appointment: null }
}

/**
 * Classifica UMA fala da Nicole. Puro. A unidade do relatório é a fala
 * (`message_id`) — não o incidente, não o lead: é o que a `detectAffirmedSlot`
 * produz e é auditável um a um.
 */
export function classificarFala(input: {
  falaId: string
  conteudo: string
  /** `messages.created_at` da própria fala. **NUNCA `new Date()`** — ver o bloco 1 do cabeçalho. */
  faladoEm: Date
  appointmentsDoLead: AppointmentDoLead[]
  /** `metadata.is_transition` — fala HUMANA gravada como `role='assistant'` (Dev Note 1). */
  isTransicaoHumana?: boolean
  ordemBaldes?: OrdemBaldes
}): ClassificacaoFala {
  const { conteudo, faladoEm, appointmentsDoLead, isTransicaoHumana = false } = input
  const ordem = input.ordemBaldes ?? ORDEM_NORMATIVA

  const vazio: ClassificacaoFala = {
    disparou: false,
    afirmou: null,
    balde: null,
    appointmentId: null,
    appointmentStatus: null,
    divergenciaMin: null,
    appointmentIdProximo: null,
    descarte: null,
  }

  // (2) A âncora tem de ser uma data de verdade. Sem esta guarda a fala seguiria
  // com `NaN` em toda comparação, cairia em `sem_lastro` e o job publicaria 0 %
  // com a AC1 e a AC2 verdes. Conta como disparo para o denominador não mentir.
  if (!ehDataValida(faladoEm)) {
    return { ...vazio, disparou: true, descarte: "data_invalida" }
  }

  // (1) A âncora é o instante da fala, sempre.
  const afirmadoBruto = detectAffirmedSlot({ assistantMessage: conteudo ?? "", now: faladoEm })
  // A função pode devolver um `Date` INVÁLIDO (não `null`) quando a âncora é
  // suja. Tratar como `null` é o que impede o `NaN` de andar adiante.
  const afirmou = ehDataValida(afirmadoBruto) ? afirmadoBruto : null
  if (!afirmou) return vazio

  // (3) Ligação não é visita. A Silvana sai AQUI.
  if (ehCompromissoDeLigacao(conteudo ?? "")) {
    return { ...vazio, disparou: true, afirmou, descarte: "ligacao" }
  }

  // (4) Promessa de gente não é promessa da Nicole.
  if (isTransicaoHumana) {
    return { ...vazio, disparou: true, afirmou, descarte: "transicao_humana" }
  }

  // (5) Só então: os quatro baldes, na ordem normativa.
  const candidatos = appointmentsDoLead.filter(
    (a) =>
      ehDataValida(a.scheduled_at) &&
      ehDataValida(a.created_at) &&
      Math.abs(a.scheduled_at.getTime() - afirmou.getTime()) <= JANELA_CLASSIFICACAO_MIN * MIN_MS
  )
  const { balde, appointment } = classificarBalde(candidatos, faladoEm, ordem)

  // Janela de RELATÓRIO (±24 h) — só preenche a divergência. Sem efeito no balde.
  const proximo = appointmentsDoLead
    .filter(
      (a) =>
        ehDataValida(a.scheduled_at) &&
        Math.abs(a.scheduled_at.getTime() - afirmou.getTime()) <= JANELA_RELATORIO_MIN * MIN_MS
    )
    .sort(
      (a, b) =>
        Math.abs(a.scheduled_at.getTime() - afirmou.getTime()) -
        Math.abs(b.scheduled_at.getTime() - afirmou.getTime())
    )[0]

  return {
    disparou: true,
    afirmou,
    balde,
    appointmentId: appointment?.id ?? null,
    appointmentStatus: appointment?.status ?? null,
    divergenciaMin: proximo
      ? Math.round(Math.abs(proximo.scheduled_at.getTime() - afirmou.getTime()) / MIN_MS)
      : null,
    appointmentIdProximo: proximo?.id ?? null,
    descarte: null,
  }
}

export interface LinhaRelatorio {
  lead_id: string
  lead_nome: string
  conversation_id: string
  message_id: string
  falado_em_utc: string
  falado_em_brt: string
  trecho: string
  afirmado_para_utc: string | null
  afirmado_para_brt: string | null
  dia_afirmado_brt: string | null
  balde: Balde | null
  descarte: Descarte | null
  appointment_id: string | null
  /** `cancelled` e `no_show` CONTAM (Desenho §2.1) — o status vai por linha para quem quiser recortar. */
  status: string | null
  divergencia_min: number | null
  appointment_id_proximo: string | null
  /** O alerta foi suprimido por uma fala posterior do mesmo `lead+dia` que resolveu `com_lastro`. */
  alerta_suprimido: boolean
  suprimido_por_message_id: string | null
}

export interface AlertaLastro {
  lead_id: string
  lead_nome: string
  conversation_id: string
  message_id: string
  falado_em_brt: string
  afirmado_para_brt: string
  dia_afirmado_brt: string
  trecho: string
}

export interface RelatorioLastro {
  unidade: "fala"
  janela: { desde: string; ate: string; dias: number }
  total_disparos: number
  descartes: { ligacao: number; transicao_humana: number; data_invalida: number }
  lembrete: number
  denominador: number
  com_lastro: number
  reparo_humano: number
  sem_lastro: number
  lastro_pct: number
  lastro_frouxo_pct: number
  lastro_frouxo_rotulo: string
  /**
   * AC3-(i-b)(c) — o número nas DUAS leituras, lado a lado. A diferença entre
   * elas é o tamanho da armadilha da precedência, publicada como número em vez de
   * virar uma pergunta que ninguém faz.
   */
  sensibilidade: {
    ordem_normativa: { com_lastro: number; lembrete: number; denominador: number; lastro_pct: number }
    lembrete_primeiro: { com_lastro: number; lembrete: number; denominador: number; lastro_pct: number }
  }
  mensagens_lidas: number
  linhas: LinhaRelatorio[]
  alertas: AlertaLastro[]
}

interface ContagemBaldes {
  com_lastro: number
  reparo_humano: number
  lembrete: number
  sem_lastro: number
  denominador: number
  lastro_pct: number
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0
  return Math.round((n / d) * 1000) / 10
}

function contar(baldes: Array<Balde | null>): ContagemBaldes {
  const c = {
    com_lastro: baldes.filter((b) => b === "com_lastro").length,
    reparo_humano: baldes.filter((b) => b === "reparo_humano").length,
    lembrete: baldes.filter((b) => b === "lembrete").length,
    sem_lastro: baldes.filter((b) => b === "sem_lastro").length,
  }
  // `lembrete` fica FORA do numerador E do denominador: a visita já existia
  // quando ela falou — ninguém consertou nada, e contá-lo como conserto humano
  // é viés na direção da decisão que a métrica alimenta.
  const denominador = c.com_lastro + c.reparo_humano + c.sem_lastro
  return { ...c, denominador, lastro_pct: pct(c.com_lastro, denominador) }
}

type LinhaSupabase = Record<string, unknown>

const PAGINA = 1000

async function selecionarPaginado(
  monta: (cursor: string | null) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<LinhaSupabase[]> {
  const out: LinhaSupabase[] = []
  const vistos = new Set<string>()
  let cursor: string | null = null
  for (let i = 0; i < 200; i++) {
    const { data, error } = await monta(cursor)
    if (error) throw new Error(`agenda-reconcile: consulta falhou: ${JSON.stringify(error)}`)
    const rows = (data as LinhaSupabase[] | null) ?? []
    let novas = 0
    for (const r of rows) {
      const id = String(r.id)
      if (vistos.has(id)) continue
      vistos.add(id)
      out.push(r)
      novas++
    }
    if (rows.length < PAGINA || novas === 0) break
    cursor = String(rows[rows.length - 1]!.created_at)
  }
  return out
}

/** `in()` em lote — o PostgREST tem limite de tamanho de URL. */
function emLotes<T>(items: T[], tamanho = 200): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += tamanho) out.push(items.slice(i, i + tamanho))
  return out
}

/**
 * Reconcilia a janela inteira. **Read-only:** só emite `select` — o único write
 * autorizado (`system_events`) é da camada web, não deste módulo (AC5).
 */
export async function reconciliarAgenda(
  supabase: SupabaseClient,
  opts: { desde: Date; ate: Date; orgId?: string | null }
): Promise<RelatorioLastro> {
  const { desde, ate, orgId = null } = opts
  const desdeIso = desde.toISOString()
  const ateIso = ate.toISOString()

  // 1. As falas da Nicole na janela. `role='broker'` não entra (é fala do
  //    corretor, outro item); `is_transition` entra e é DESCARTADA e contada.
  const mensagens = await selecionarPaginado((cursor) => {
    let q = supabase
      .from("messages")
      .select("id, conversation_id, content, metadata, created_at")
      .eq("role", "assistant")
      .gte("created_at", desdeIso)
      .lte("created_at", ateIso)
    if (cursor) q = q.gt("created_at", cursor)
    return q.order("created_at", { ascending: true }).limit(PAGINA)
  })

  const conversationIds = [...new Set(mensagens.map((m) => String(m.conversation_id)))]

  // 2. conversation → lead (e a guarda de org).
  const conversas: LinhaSupabase[] = []
  for (const lote of emLotes(conversationIds)) {
    let q = supabase.from("conversations").select("id, lead_id, org_id").in("id", lote)
    if (orgId) q = q.eq("org_id", orgId)
    const { data, error } = await q
    if (error) throw new Error(`agenda-reconcile: conversations: ${JSON.stringify(error)}`)
    conversas.push(...(((data as LinhaSupabase[] | null) ?? [])))
  }
  const leadPorConversa = new Map<string, string>()
  for (const c of conversas) leadPorConversa.set(String(c.id), String(c.lead_id))

  const leadIds = [...new Set([...leadPorConversa.values()])]

  // 3. Nome do lead — o alerta precisa NOMEAR.
  const nomePorLead = new Map<string, string>()
  for (const lote of emLotes(leadIds)) {
    const { data, error } = await supabase.from("leads").select("id, name").in("id", lote)
    if (error) throw new Error(`agenda-reconcile: leads: ${JSON.stringify(error)}`)
    for (const l of ((data as LinhaSupabase[] | null) ?? [])) {
      nomePorLead.set(String(l.id), String(l.name ?? "(sem nome)"))
    }
  }

  // 4. Os appointments desses leads. **Qualquer `status`** — `cancelled` e
  //    `no_show` CONTAM: a pergunta é "quando ela falou, existia a linha no
  //    banco?", e uma visita desmarcada depois EXISTIU (Desenho §2.1).
  const appointmentsPorLead = new Map<string, AppointmentDoLead[]>()
  for (const lote of emLotes(leadIds)) {
    let q = supabase
      .from("appointments")
      .select("id, lead_id, scheduled_at, created_at, created_by, status")
      .in("lead_id", lote)
    if (orgId) q = q.eq("org_id", orgId)
    const { data, error } = await q
    if (error) throw new Error(`agenda-reconcile: appointments: ${JSON.stringify(error)}`)
    for (const a of ((data as LinhaSupabase[] | null) ?? [])) {
      const scheduled = parseTimestamptz(a.scheduled_at as string)
      const criado = parseTimestamptz(a.created_at as string)
      if (!scheduled || !criado) continue
      const leadId = String(a.lead_id)
      const lista = appointmentsPorLead.get(leadId) ?? []
      lista.push({
        id: String(a.id),
        scheduled_at: scheduled,
        created_at: criado,
        created_by: String(a.created_by),
        status: String(a.status),
      })
      appointmentsPorLead.set(leadId, lista)
    }
  }

  const linhas: LinhaRelatorio[] = []
  const baldesNormativa: Array<Balde | null> = []
  const baldesLembretePrimeiro: Array<Balde | null> = []
  const descartes = { ligacao: 0, transicao_humana: 0, data_invalida: 0 }
  let totalDisparos = 0

  for (const m of mensagens) {
    const conversationId = String(m.conversation_id)
    const leadId = leadPorConversa.get(conversationId)
    if (!leadId) continue // conversa de outra org, ou órfã

    const conteudo = String(m.content ?? "")
    const faladoEm = parseTimestamptz(m.created_at as string) ?? new Date(NaN)
    const metadata = (m.metadata ?? {}) as Record<string, unknown>
    const isTransicao = metadata.is_transition === true
    const appointmentsDoLead = appointmentsPorLead.get(leadId) ?? []

    const base = {
      falaId: String(m.id),
      conteudo,
      faladoEm,
      appointmentsDoLead,
      isTransicaoHumana: isTransicao,
    }

    const r = classificarFala({ ...base, ordemBaldes: ORDEM_NORMATIVA })
    if (!r.disparou) continue
    totalDisparos++

    // A leitura alternativa, só para a sensibilidade da AC3-(i-b)(c).
    const alt = classificarFala({ ...base, ordemBaldes: "lembrete_primeiro" })

    if (r.descarte) descartes[r.descarte]++
    baldesNormativa.push(r.balde)
    baldesLembretePrimeiro.push(alt.balde)

    linhas.push({
      lead_id: leadId,
      lead_nome: nomePorLead.get(leadId) ?? "(sem nome)",
      conversation_id: conversationId,
      message_id: String(m.id),
      falado_em_utc: ehDataValida(faladoEm) ? faladoEm.toISOString() : String(m.created_at),
      falado_em_brt: ehDataValida(faladoEm) ? formatarBrt(faladoEm) : "(data inválida)",
      trecho: conteudo.replace(/\s+/g, " ").trim().slice(0, 180),
      afirmado_para_utc: r.afirmou ? r.afirmou.toISOString() : null,
      afirmado_para_brt: r.afirmou ? formatarBrt(r.afirmou) : null,
      dia_afirmado_brt: r.afirmou ? diaBrt(r.afirmou) : null,
      balde: r.balde,
      descarte: r.descarte,
      appointment_id: r.appointmentId,
      status: r.appointmentStatus,
      divergencia_min: r.divergenciaMin,
      appointment_id_proximo: r.appointmentIdProximo,
      alerta_suprimido: false,
      suprimido_por_message_id: null,
    })
  }

  // Supressão por `lead + dia afirmado`: uma fala POSTERIOR que resolve
  // `com_lastro` suprime o alerta da anterior. Medido no Ailton: 01:17 afirma
  // 09:00 (sem_lastro) e 01:18 afirma 10:00 (com_lastro) — sem isto o time
  // recebe "o Ailton está sem lastro" ao lado de "o Ailton tem lastro" no mesmo
  // push, e para de ler no terceiro dia.
  //
  // A supressão vale para o ALERTA, nunca para o RELATÓRIO: a linha permanece no
  // JSON e no denominador. Suprimir a linha maquiaria o `lastro_pct` para cima —
  // o erro simétrico ao que a AC3 combate.
  for (const linha of linhas) {
    if (linha.balde !== "sem_lastro" || !linha.dia_afirmado_brt) continue
    const corretiva = linhas.find(
      (o) =>
        o.balde === "com_lastro" &&
        o.lead_id === linha.lead_id &&
        o.dia_afirmado_brt === linha.dia_afirmado_brt &&
        o.falado_em_utc > linha.falado_em_utc
    )
    if (corretiva) {
      linha.alerta_suprimido = true
      linha.suprimido_por_message_id = corretiva.message_id
    }
  }

  // A unidade do ALERTA é `lead + dia`, não a fala (Desenho §2.0).
  const alertas: AlertaLastro[] = []
  const jaAlertado = new Set<string>()
  for (const linha of linhas) {
    if (linha.balde !== "sem_lastro" || linha.alerta_suprimido) continue
    const chave = `${linha.lead_id}|${linha.dia_afirmado_brt}`
    if (jaAlertado.has(chave)) continue
    jaAlertado.add(chave)
    alertas.push({
      lead_id: linha.lead_id,
      lead_nome: linha.lead_nome,
      conversation_id: linha.conversation_id,
      message_id: linha.message_id,
      falado_em_brt: linha.falado_em_brt,
      afirmado_para_brt: linha.afirmado_para_brt ?? "",
      dia_afirmado_brt: linha.dia_afirmado_brt ?? "",
      trecho: linha.trecho,
    })
  }

  const norm = contar(baldesNormativa)
  const alt = contar(baldesLembretePrimeiro)
  const dias = Math.max(1, Math.round((ate.getTime() - desde.getTime()) / 86400_000))

  return {
    unidade: "fala",
    janela: { desde: desdeIso, ate: ateIso, dias },
    total_disparos: totalDisparos,
    descartes,
    lembrete: norm.lembrete,
    denominador: norm.denominador,
    com_lastro: norm.com_lastro,
    reparo_humano: norm.reparo_humano,
    sem_lastro: norm.sem_lastro,
    lastro_pct: norm.lastro_pct,
    lastro_frouxo_pct: pct(norm.com_lastro + norm.reparo_humano, norm.denominador),
    lastro_frouxo_rotulo: "NÃO é lastro — inclui conserto humano posterior",
    sensibilidade: {
      ordem_normativa: {
        com_lastro: norm.com_lastro,
        lembrete: norm.lembrete,
        denominador: norm.denominador,
        lastro_pct: norm.lastro_pct,
      },
      lembrete_primeiro: {
        com_lastro: alt.com_lastro,
        lembrete: alt.lembrete,
        denominador: alt.denominador,
        lastro_pct: alt.lastro_pct,
      },
    },
    mensagens_lidas: mensagens.length,
    linhas,
    alertas,
  }
}
