/**
 * Story 73-1 — parsing do dia/horário pedido pelo cliente (PT-BR) e checagem de
 * disponibilidade na agenda interna (tabela `appointments`, que já recebe Calendly
 * via cron `calendly-sync`). Visita = 60 min; desde 2026-07-23 as SUGESTÕES da
 * Nicole saem de 30 em 30 min (mesmo passo da grade interna, SLOT_STEP_MIN).
 *
 * Brasil não tem horário de verão desde 2019 → BRT é fixo em UTC-3.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
// Story 87-4 — import DE TIPO apenas: `agenda-state.ts` é puro e não importa
// nada daqui em runtime, então não há ciclo.
import type { AgendaState } from "./agenda-state"

const BRT_OFFSET_HOURS = 3
export const VISIT_DURATION_MIN = 60
/** Passo (min) do INÍCIO dos slots sugeridos — espelha a grade da agenda interna. */
const SLOT_STEP_MIN = 30
const OPEN_HOUR = 8

/** Hora de fechamento (BRT) por dia da semana, ou null se fechado (domingo). */
function closeHourFor(weekday: number): number | null {
  if (weekday === 0) return null // domingo
  if (weekday === 6) return 12 // sábado
  return 18 // seg–sex
}

export interface ParsedSlot {
  /** O cliente referenciou um dia (segunda, amanhã, "dia 20"…). */
  hasDay: boolean
  /** O cliente deu um horário explícito (15h, 15:30, "3 da tarde"…). */
  hasTime: boolean
  /** Início pedido em UTC — só quando dia+hora explícitos, no futuro e dentro do horário comercial. */
  startUtc: Date | null
  /** Dia+hora dados, mas fora do horário comercial (ou domingo). */
  outsideHours: boolean
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/** Story 75-245 \u2014 "10,00"/"10.00"/"10,30" \u2192 "10:00"/"10:30" (separador de minutos). */
function normalizeMinuteSeparator(s: string): string {
  return s.replace(/(?<![\d.,:])(\d{1,2})[.,](\d{2})(?!\d)/g, "$1:$2")
}

function brtToUtc(y: number, m: number, d: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(y, m, d, hour + BRT_OFFSET_HOURS, minute, 0, 0))
}

function brtParts(now: Date) {
  const brt = new Date(now.getTime() - BRT_OFFSET_HOURS * 3600_000)
  return {
    y: brt.getUTCFullYear(),
    m: brt.getUTCMonth(),
    d: brt.getUTCDate(),
    weekday: brt.getUTCDay(),
  }
}

/** Meses em pt-BR sem acento (índice = mês 0-based). Story 75-245. */
const MONTHS = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

const WEEKDAYS: Array<{ re: RegExp; dow: number }> = [
  { re: /\bdomingo\b/, dow: 0 },
  { re: /\bsegunda\b/, dow: 1 },
  { re: /\bterca\b/, dow: 2 },
  { re: /\bquarta\b/, dow: 3 },
  { re: /\bquinta\b/, dow: 4 },
  { re: /\bsexta\b/, dow: 5 },
  { re: /\bsabado\b/, dow: 6 },
]

/** Resolve o dia pedido (em componentes BRT) a partir do texto. */
function parseDay(text: string, now: Date): { y: number; m: number; d: number } | null {
  // Story 75-162 — minúsculo: o visit_availability costuma vir capitalizado
  // ("Sábado, 18 de julho…") e os padrões (weekday/dia/amanhã) são case-sensitive.
  const t = stripAccents(text).toLowerCase()
  const today = brtParts(now)

  const addDays = (n: number) => {
    const base = brtToUtc(today.y, today.m, today.d, 12) // meio-dia BRT evita virada
    const target = new Date(base.getTime() + n * 86400_000)
    const p = brtParts(target)
    return { y: p.y, m: p.m, d: p.d }
  }

  if (/\bdepois\s+de\s+amanha\b/.test(t)) return addDays(2)
  if (/\bamanha\b/.test(t)) return addDays(1)
  if (/\bhoje\b/.test(t)) return { y: today.y, m: today.m, d: today.d }

  // Story 75-245 — data com mês escrito ("1º de agosto", "10 de agosto"). Vem
  // ANTES do dia da semana: sem isso "segunda-feira, 10 de agosto" era lido como
  // a PRÓXIMA segunda (regra de dia da semana), errando a data por semanas — e
  // fazendo a guarda anti-alucinação acusar falso positivo.
  const monthMatch = t.match(
    /\b(\d{1,2})\s*(?:o|a|º|ª)?\s*de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/
  )
  if (monthMatch) {
    const dd = parseInt(monthMatch[1]!, 10)
    const mIdx = MONTHS.indexOf(monthMatch[2]!)
    if (dd >= 1 && dd <= 31 && mIdx >= 0) {
      // Data já passada neste ano → ano seguinte (o cliente fala do futuro).
      const y = mIdx < today.m || (mIdx === today.m && dd < today.d) ? today.y + 1 : today.y
      return { y, m: mIdx, d: dd }
    }
  }

  // "dia 20"
  const diaMatch = t.match(/\bdia\s+(\d{1,2})\b/)
  if (diaMatch) {
    const dd = parseInt(diaMatch[1]!, 10)
    if (dd >= 1 && dd <= 31) {
      let m = today.m
      let y = today.y
      if (dd < today.d) {
        m += 1
        if (m > 11) { m = 0; y += 1 }
      }
      return { y, m, d: dd }
    }
  }

  // dia da semana → próxima ocorrência (inclui hoje)
  for (const { re, dow } of WEEKDAYS) {
    if (re.test(t)) {
      const delta = (dow - today.weekday + 7) % 7
      return addDays(delta)
    }
  }

  return null
}

/**
 * Story 75-268 — opções do parse de hora. `bareNumberAllowed` aceita número SEM
 * marcador ("as 10", "umas 14"), e existe porque os leads escrevem assim: nos
 * dois incidentes de 03/08 ("Umas 14" da Sueli, "Na quinta as 10" da Valnira) a
 * hora era descartada e a visita nunca chegava a `appointments`.
 *
 * É opt-in DE PROPÓSITO: número solto no meio de uma conversa de imóvel quase
 * nunca é hora ("2 suítes", "andar 12", "500 mil"). Só ligue quando o próprio
 * sistema acabou de pedir o horário — ver `pipeline.ts`.
 */
export interface TimeParseOptions {
  bareNumberAllowed?: boolean
}

/** Faixa em que número pelado pode ser hora — expediente (8h–18h) com folga. */
const BARE_HOUR_MIN = 7
const BARE_HOUR_MAX = 19

/** Unidade logo DEPOIS do número prova que ele não é hora. */
const NOT_HOUR_UNIT_RE =
  /^\s*(?:m2|m²|mts?|metros?|mil|reais|%|vagas?|suites?|quartos?|dormitorios?|andar(?:es)?|anos?|dias?|meses|semanas?|pessoas?|filhos?|parcelas?)\b/
/** Palavra logo ANTES do número prova que ele não é hora. */
const NOT_HOUR_PREFIX_RE =
  /\b(?:dia|andar|acima do|abaixo do|apto|apartamento|numero|n[º°]|rua|av|avenida|cpf|bloco|torre|r\$)\s*$/

/**
 * Story 75-268 — a frase toda desqualifica o número pelado: aqui ele é
 * IMPEDIMENTO, não pedido ("não vou poder, tenho compromisso as 15", "só consigo
 * depois das 17"). Sem esta guarda, "as 15" viraria pedido de visita às 15h e a
 * Nicole confirmaria algo que o cliente não pediu — a mesma classe do
 * agendamento fantasma da 75-245. Aqui a regra da 75-245 vale inteira:
 * na dúvida, PERGUNTE. Quem quiser afirmar a hora escreve com marcador ("15h").
 */
const BARE_HOUR_BLOCKER_RE =
  /\bnao\s+(?:vou|posso|consigo|da|tenho|rola)\b|\bnao\s+da\b|\bcompromisso\b|\bocupad[ao]\b|\breuniao\b|\btrabalh[oa]\s+(?:ate|das)\b|\b(?:antes|depois)\s+d[ae]s\b|\bs[oó]\s+(?:consigo|posso|depois)\b|\bimpossivel\b/

/**
 * Story 75-268 — número pelado como hora, com as guardas todas. Recebe o texto
 * JÁ normalizado (sem acento, minúsculo, "10,30" → "10:30").
 */
function parseBareHour(t: string): { hour: number; minute: number } | null {
  if (BARE_HOUR_BLOCKER_RE.test(t)) return null
  for (const m of t.matchAll(/(?<![\d.,:/])(\d{1,2})(?![\d.,:h/])/g)) {
    const raw = m[1]!
    const hour = parseInt(raw, 10)
    if (hour < BARE_HOUR_MIN || hour > BARE_HOUR_MAX) continue
    const idx = m.index ?? 0
    const before = t.slice(0, idx)
    const after = t.slice(idx + raw.length)
    if (NOT_HOUR_UNIT_RE.test(after)) continue
    if (NOT_HOUR_PREFIX_RE.test(before)) continue
    // "10 de agosto" é data, não hora — quem resolve é o parseDay.
    if (new RegExp(`^\\s*(?:o|a|º|ª)?\\s*de\\s+(?:${MONTHS.join("|")})\\b`).test(after)) continue
    return { hour, minute: 0 }
  }
  return null
}

/** Resolve a hora pedida (BRT, 0-23) a partir do texto, ou null. */
function parseHour(text: string, opts?: TimeParseOptions): { hour: number; minute: number } | null {
  // Story 75-245 — "10,00 hora" (o lead escreve assim) precisa virar 10:00 ANTES
  // de qualquer regex: o padrão genérico casava o "00 hora" e devolvia 00:00,
  // que cai fora do expediente e o horário pedido era silenciosamente descartado.
  // O lookbehind e o (?!\d) protegem CPF ("174.677.569.68") e dinheiro
  // ("25.000,00"), que não podem virar horário.
  const t = normalizeMinuteSeparator(stripAccents(text).toLowerCase()) // Story 75-162 — robusto a "9H"/capitalização

  if (/\bmeio[\s-]?dia\b/.test(t)) return { hour: 12, minute: 0 }

  // período (tarde/noite) com número: "3 da tarde", "8 da noite"
  // Story 75-245 — "dia 5 de manhã" é DIA 5 + período, não 5h: o lookbehind
  // evita ler o número do dia como hora (quem resolve é parsePeriodParts).
  const periodMatch = t.match(/(?<!\bdia\s)\b(\d{1,2})(?:[:h](\d{2}))?\s*(?:da|de|à|a)\s*(tarde|noite|manha)\b/)
  if (periodMatch) {
    let hour = parseInt(periodMatch[1]!, 10)
    const minute = periodMatch[2] ? parseInt(periodMatch[2]!, 10) : 0
    const period = periodMatch[3]!
    if ((period === "tarde" || period === "noite") && hour < 12) hour += 12
    if (hour >= 0 && hour <= 23) return { hour, minute }
  }

  // "15h", "15:30", "15 horas", "15h30" — e, desde a Story 75-279, as grafias
  // coladas que o cliente realmente escreve: "11hrs", "11hs", "11hr".
  //
  // A regra antiga exigia fronteira de palavra logo depois do "h": em "11hrs"
  // vinha um "r" e ela desistia. O número também não era salvo pelo recurso de
  // número pelado (`parseBareHour`), que rejeita de propósito dígito seguido de
  // "h" — então a hora caía no vão entre as duas regras e a visita da lead Maria
  // Oliveira (06/08) nunca foi gravada.
  //
  // O `(?![a-z])` depois do sufixo é o que segura o afrouxamento: sem ele,
  // "11 hoje" viraria 11:00.
  const hMatch = t.match(/\b(\d{1,2})\s*(?::|h(?:rs?|s)?(?![a-z])|\s*horas?\b)\s*(\d{2})?(?!\d)/)
  if (hMatch) {
    const hour = parseInt(hMatch[1]!, 10)
    const minute = hMatch[2] ? parseInt(hMatch[2]!, 10) : 0
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute < 60) return { hour, minute }
  }

  // Story 75-268 — último recurso, só sob contexto explícito: "as 10", "umas 14".
  if (opts?.bareNumberAllowed) return parseBareHour(t)

  return null
}

/**
 * Story 75-245 — texto que NÃO pode virar um slot concreto: frase de horário de
 * atendimento ou lista de opções. Nasceu do incidente do lead Ailton: a própria
 * frase da Nicole ("Atendemos de segunda a sexta das 8h às 18h e sábado das 8h
 * ao meio-dia") foi gravada em `visit_availability` e o parser tirou dela
 * "segunda" + "meio-dia" → agendou segunda 12h sem o cliente ter dito nada.
 *
 * Ambíguo = 2+ dias da semana, 2+ horários, faixa ("das 8h às 18h") ou fórmula
 * de expediente ("atendemos", "horário de atendimento", "de segunda a sexta").
 * Slot único ("Sábado, 18 de julho, às 9h" — caso da 75-162) NÃO é ambíguo.
 */
export function isAmbiguousSlotText(text: string | null | undefined): boolean {
  if (!text) return false
  const t = normalizeMinuteSeparator(stripAccents(text).toLowerCase())

  // Fórmulas de expediente / faixa de horário.
  if (/\batendemos\b/.test(t)) return true
  if (/\bhorario[s]?\s+de\s+(?:atendimento|funcionamento)\b/.test(t)) return true
  if (/\bde\s+segunda\s+a\s+(?:sexta|sabado)\b/.test(t)) return true
  if (/\bd[ae]s?\s+\d{1,2}\s*(?:h|horas)?\s*(?::\d{2}\s*)?(?:as|ate|a)\s+(?:\d{1,2}|o\s+meio[\s-]?dia|meio[\s-]?dia)\b/.test(t)) return true

  // 2+ dias da semana distintos ("segunda a sexta … e sábado").
  const days = new Set<number>()
  for (const { re, dow } of WEEKDAYS) if (re.test(t)) days.add(dow)
  if (days.size >= 2) return true

  // 2+ horários distintos ("8h às 18h", "9h ou 10h").
  if (countTimeMentions(t) >= 2) return true

  return false
}

/** Quantos horários o texto menciona (já normalizado/sem acento). */
function countTimeMentions(t: string): number {
  const mentions = new Set<string>()
  if (/\bmeio[\s-]?dia\b/.test(t)) mentions.add("12:00")
  // Story 75-279 — o mesmo sufixo colado que `parseHour` passou a entender tem de
  // ser contado aqui. Senão "8hrs ou 9hrs" contaria ZERO horários, não seria
  // classificado como ambíguo, e viraria slot único — reabrindo exatamente o
  // agendamento fantasma que a 75-245 fechou.
  for (const m of t.matchAll(/(?<![\d.,:])(\d{1,2})\s*(?::(\d{2})|h(?:rs?|s)?(?![a-z])(\d{2})?|\s*horas?\b)/g)) {
    mentions.add(`${m[1]}:${m[2] ?? m[3] ?? "00"}`)
  }
  return mentions.size
}

/** Período do dia entendido sem número ("de manhã", "à tarde"). Story 75-245. */
export type DayPeriod = "manha" | "tarde"

/** Faixa (min desde 00:00 BRT) de cada período. */
const PERIOD_BOUNDS: Record<DayPeriod, { fromMin: number; toMin: number }> = {
  manha: { fromMin: OPEN_HOUR * 60, toMin: 12 * 60 },
  tarde: { fromMin: 12 * 60, toMin: 18 * 60 },
}

/**
 * Story 75-245 — período do dia SEM horário explícito ("pode ser de manhã").
 * Antes o parser não entendia e a Nicole preenchia a lacuna inventando um
 * horário ("9h"). Devolve null quando há hora explícita (parseHour resolve) ou
 * quando é "mais tarde" (= depois, não é o período da tarde).
 */
export function parsePeriodParts(text: string | null | undefined): DayPeriod | null {
  if (!text) return null
  // Saudação NÃO é período: "boa tarde" é "olá", não "quero à tarde".
  const t = normalizeMinuteSeparator(stripAccents(text).toLowerCase())
    .replace(/\bbo[am]\s+(?:tarde|dia|noite|manha)\b/g, " ")
  if (parseHour(t)) return null
  // "manha" não casa dentro de "amanha" (sem fronteira de palavra antes do m).
  if (/\bmanha\b|\bmanhazinha\b/.test(t)) return "manha"
  if (/\bmais\s+tarde\b/.test(t)) return null
  if (/\btarde\b|\btardinha\b/.test(t)) return "tarde"
  return null
}

export type DayParts = { y: number; m: number; d: number } // m = 0-based

/** Extrai só o dia referenciado (ou null). Exposto para combinar dia+hora entre turnos. */
export function parseDayParts(message: string, now: Date): DayParts | null {
  return parseDay(message, now)
}

/** Extrai só o horário referenciado (ou null). Exposto para combinar dia+hora entre turnos. */
export function parseTimeParts(
  message: string,
  opts?: TimeParseOptions
): { hour: number; minute: number } | null {
  return parseHour(message, opts)
}

export type TimeParts = { hour: number; minute: number }

// Story 75-163 — intenção de CANCELAR a visita (sem nova data).
const CANCEL_RE = /\bcancelar?\b|\bcancela\b|\bdesmarcar?\b|\bdesmarca\b|\bnao vou (?:poder|conseguir)? ?(?:mais )?ir\b|\bnao (?:posso|vou) mais\b|\bdesist[oiê]|\bnao quero mais (?:a )?visita\b/
// Story 75-163 — intenção de REMARCAR (trocar dia/horário).
const RESCHEDULE_RE = /\bremarca\w*\b|\breagenda\w*\b|\bmuda\w*\b|\btroca\w*\b|\badia\w*\b|\bantecipa\w*\b|\boutro dia\b|\boutro hor[aá]rio\b|\boutra hora\b|\bpassar para\b|\btransferir\b|\bmudar o (?:dia|hor[aá]rio)\b/

/** Story 75-163 — intenção clara de CANCELAR a visita (texto normalizado). */
export function detectCancelIntent(text: string | null | undefined): boolean {
  if (!text) return false
  return CANCEL_RE.test(stripAccents(text).toLowerCase())
}

/** Story 75-163 — intenção de REMARCAR (trocar dia/horário) a visita. */
export function detectRescheduleIntent(text: string | null | undefined): boolean {
  if (!text) return false
  return RESCHEDULE_RE.test(stripAccents(text).toLowerCase())
}

/**
 * Story 75-162 — resolve dia+hora do slot combinando a mensagem atual do lead
 * com o que ficou de turnos anteriores. Torna o agendamento robusto quando dia e
 * hora vieram em turnos diferentes. Puro.
 *
 * Story 87-4 — DUAS SUBTRAÇÕES, e elas são o coração da story:
 *
 * 1. **A herança nunca reancora.** Antes, o estado herdado chegava aqui como a
 *    STRING crua do `visit_availability` e esta função chamava
 *    `parseDayParts(string, now)` — reancorando a expressão relativa contra o
 *    relógio de cada leitura. A mesma frase da Edicleia ("sexta-feira às 15h")
 *    resolvia 07/08, 14/08, 21/08, 28/08 conforme o dia em que fosse lida.
 *    Agora a herança chega como `AgendaState.data_absoluta`, que é uma data já
 *    resolvida no momento da escrita; a `citacao` NUNCA é fonte de parse.
 *
 * 2. **A herança tem UMA porta, e a porta sabe de onde o dia veio.** Antes havia
 *    dois caminhos — `pendingDay` (que entrava SEMPRE, sem guarda) e
 *    `visitAvailability` (guardado pelo `periodWithoutDayInMessage`) — e as
 *    regras dos dois viviam em lugares diferentes. Agora entra tudo por aqui, e
 *    a decisão depende do `fonte` do estado, que é explícito:
 *
 *      • `mencao`    — dia colhido de texto solto. A guarda de período vale.
 *                      É a classe do incidente da Valnira: conferido na conversa
 *                      real (03/08 23:57), o sábado dela veio da fala da PRÓPRIA
 *                      Nicole ("…durante a semana ou sábado de manhã?"), e ela
 *                      não tinha pendência nenhuma — aquele era o primeiro turno
 *                      em que se perguntou o dia.
 *      • `pendencia` — dia que o lead deu respondendo a uma pergunta nossa. A
 *                      guarda NÃO vale: bloqueá-lo faz o pedido dele
 *                      ("quinta" → "de manhã") sumir em silêncio, e não teria
 *                      protegido a Valnira, que nunca teve pendência.
 *
 *    `ignorarMencao` existe porque o `HEAD` excluía o `visitAvailability` do ramo
 *    da visita já marcada de propósito ("NÃO do visit_availability, que guarda o
 *    slot ANTIGO"). Sem essa exclusão, um "Oi" REMARCA a visita de quem está em
 *    negociação avançada. A exclusão continua, agora declarada nesta porta em vez
 *    de por um `null` no chamador.
 */
export function resolveVisitSlotParts(input: {
  message: string
  now: Date
  /** Story 87-4 — o fato de agenda com âncora. Substitui pendingDay/pendingTime/visitAvailability. */
  agendaState?: AgendaState | null
  /**
   * Story 87-4 — descarta o estado quando ele é `mencao` (texto solto), mantendo
   * só a `pendencia`. Usado no ramo da visita JÁ MARCADA, onde uma menção antiga
   * não pode mover `scheduled_at`.
   */
  ignorarMencao?: boolean
  /** Story 75-268 — opções do parse de hora da MENSAGEM DO LEAD. */
  timeOptions?: TimeParseOptions
}): {
  day: DayParts | null
  time: TimeParts | null
  /** Story 87-4 — o que veio DESTE turno (o resto veio do estado). Insumo da citação. */
  fromMessage: { day: boolean; time: boolean }
} {
  const { message, now, timeOptions } = input
  // Story 87-4 — no ramo da visita já marcada, menção não entra (nem como dia nem
  // como hora): era o `visitAvailability: null` do `HEAD`.
  const agendaState =
    input.ignorarMencao && input.agendaState?.fonte === "mencao" ? null : (input.agendaState ?? null)

  const dayInMessage = parseDayParts(message, now)
  const timeInMessage = parseTimeParts(message, timeOptions)

  // Story 75-268 — período dado pelo lead NÃO herda dia velho. Quando ele diz só
  // o período ("Semana de manhã"), o dia antigo entrava e a Nicole oferecia outro
  // dia. Sem dia, o certo é PERGUNTAR o dia.
  // Story 87-4 — a guarda vale para a MENÇÃO, não para a pendência (ver acima).
  const periodWithoutDayInMessage = !dayInMessage && !!parsePeriodParts(message)
  const herancaDeDiaBloqueada = periodWithoutDayInMessage && agendaState?.fonte === "mencao"

  const inheritedDay = agendaState?.data_absoluta ? isoToDayParts(agendaState.data_absoluta) : null
  const inheritedTime =
    agendaState && agendaState.hora !== null
      ? { hour: agendaState.hora, minute: agendaState.minuto ?? 0 }
      : null

  const day = dayInMessage ?? (herancaDeDiaBloqueada ? null : inheritedDay)
  const time = timeInMessage ?? inheritedTime

  return {
    day,
    time,
    fromMessage: { day: !!dayInMessage, time: !!timeInMessage },
  }
}

/** Story 75-245 — Date UTC de um dia+hora BRT, sem as regras de expediente. */
export function slotToUtc(day: DayParts, time: TimeParts): Date {
  return brtToUtc(day.y, day.m, day.d, time.hour, time.minute)
}

/**
 * Story 75-279 — a Nicole AFIRMOU um dia+horário único nesta resposta? Devolve o
 * horário afirmado, ou null. Sem comparar com nada.
 *
 * Existe separado da `detectSlotMismatch` porque o caso mais grave é justamente
 * aquele em que **não há** slot autorizado para comparar: no incidente da lead
 * Maria Oliveira (06/08) o sistema mandou PERGUNTAR o horário, e a Nicole
 * inventou um bloco `[SISTEMA: … LIVRE]`, confirmou "sábado às 11h" e nada foi
 * agendado. A guarda da 75-245 exigia `authorizedSlotUtc` para rodar e por isso
 * era cega exatamente aí — em prod ela nunca disparou uma única vez.
 *
 * Mesma postura conservadora da 75-245: só AFIRMAÇÃO de dia+hora único. Texto
 * ambíguo (oferta de opções, frase de expediente) devolve null.
 *
 * Story 87-3 — mora AQUI (era `chat/pipeline.ts`) porque as três dependências
 * dela já estavam neste arquivo e porque `flows/agenda-reconcile.ts` precisa
 * consumi-la sem criar o ciclo `pipeline → flows/index → agenda-reconcile →
 * pipeline`. `chat/pipeline.ts` a re-exporta; o corpo é o mesmo.
 */
export function detectAffirmedSlot(input: {
  assistantMessage: string
  now: Date
}): Date | null {
  const { assistantMessage, now } = input
  if (!assistantMessage) return null
  if (isAmbiguousSlotText(assistantMessage)) return null
  const said = resolveVisitSlotParts({ message: assistantMessage, now })
  if (!said.day || !said.time) return null
  return slotToUtc(said.day, said.time)
}

/** Story 75-163 — DayParts (BRT) de uma data UTC (ex.: dia da visita atual, p/ troca só-de-horário). */
export function dayPartsFromUtc(d: Date): DayParts {
  const p = brtParts(d)
  return { y: p.y, m: p.m, d: p.d }
}

/** "YYYY-MM-DD" (mês 1-based) para persistir o dia pendente em conversation_state. */
export function dayPartsToIso(d: DayParts): string {
  return `${d.y}-${String(d.m + 1).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`
}

/** Inverso de dayPartsToIso. */
export function isoToDayParts(s: string): DayParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return { y: parseInt(m[1]!, 10), m: parseInt(m[2]!, 10) - 1, d: parseInt(m[3]!, 10) }
}

/**
 * Dado dia + hora, devolve `startUtc` (se no futuro e dentro do horário comercial)
 * ou marca `outsideHours`. Núcleo compartilhado entre o parse de turno único e a
 * combinação dia+hora ao longo de turnos.
 */
export function evaluateSlot(
  day: DayParts,
  time: { hour: number; minute: number },
  now: Date
): { startUtc: Date | null; outsideHours: boolean } {
  const startUtc = brtToUtc(day.y, day.m, day.d, time.hour, time.minute)

  // Passado → trata como sem slot preciso (Nicole pede de novo)
  if (startUtc.getTime() <= now.getTime()) return { startUtc: null, outsideHours: false }

  const targetWeekday = new Date(startUtc.getTime() - BRT_OFFSET_HOURS * 3600_000).getUTCDay()
  const close = closeHourFor(targetWeekday)
  // A visita de 60min precisa caber inteira no expediente (início + 60 ≤ fechamento)
  // — mesma regra da grade interna (2026-07-23). Antes 17:30 com fechamento 18:00
  // era aceito e a visita varava o expediente.
  const startMin = time.hour * 60 + time.minute
  if (close === null || startMin < OPEN_HOUR * 60 || startMin + VISIT_DURATION_MIN > close * 60) {
    return { startUtc: null, outsideHours: true }
  }
  return { startUtc, outsideHours: false }
}

/**
 * Faz o parse do dia+horário pedidos pelo cliente. Conservador: só devolve
 * `startUtc` quando há dia E hora explícitos, no futuro e dentro do horário comercial.
 */
export function parseRequestedSlot(message: string, now: Date): ParsedSlot {
  const day = parseDay(message, now)
  const time = parseHour(message)

  const result: ParsedSlot = {
    hasDay: !!day,
    hasTime: !!time,
    startUtc: null,
    outsideHours: false,
  }

  if (!day || !time) return result

  const { startUtc, outsideHours } = evaluateSlot(day, time, now)
  result.startUtc = startUtc
  result.outsideHours = outsideHours
  return result
}

/**
 * Story 87-18 — o resultado de UMA consulta de disponibilidade tem TRÊS estados,
 * porque a pergunta tem três respostas possíveis. `"unknown"` é ausência de
 * informação: não é "ocupado" (seria uma afirmação sem base) e não é "livre" (a
 * mentira que a story fecha).
 *
 * 🔴 As três strings são TRUTHY. `if (await isSlotFree(...))` e
 * `filter((_, i) => resultados[i])` compilam limpos com `tsc --strict` (medido
 * pelo @po: EXIT=0, zero linhas) e o repo não tem `strict-boolean-expressions` —
 * a forma booleana esquecida faz TODO horário `"occupied"` ser ofertado e
 * gravado como livre. A rede são dois testes (`visit-slot.test.ts` "compromisso
 * HOUSE no mesmo horário bloqueia" e "manhã de sábado com 10h ocupado") + a
 * `AC10` da story, que obriga as duas mutações que provam que eles reprovam.
 * SEMPRE comparar explicitamente com `"free"` / `"occupied"` / `"unknown"`.
 */
export type SlotCheck = "free" | "occupied" | "unknown"

/**
 * Story 87-18 — callback de observabilidade para a consulta de agenda que
 * falhou. O shape é ESTRUTURALMENTE igual ao `PipelineEvent` de
 * `chat/pipeline.ts`, mas declarado aqui de propósito: importar o tipo de lá
 * criaria dependência de `flows/` para `chat/` na direção errada. `pipeline.ts`
 * passa o `emit` que já tem (o mesmo cano do `NICOLE_SLOT_MISMATCH`), sem
 * adaptador e sem cruzar o limite `packages/ai` → `packages/web`.
 */
export type EmitSlotQueryError = (event: {
  level: "error" | "warn" | "info"
  category: string
  event_type: string
  message: string
  metadata?: Record<string, unknown>
}) => void

/** Story 87-18 — `event_type` do evento agregado (um por CHAMADA, nunca por candidato). */
const EVENT_SLOT_QUERY_ERROR = "NICOLE_SLOT_QUERY_ERROR"

/**
 * Slot livre se não há appointment ativo sobrepondo [start, start+60min).
 * Story 75-163 — `excludeAppointmentId` ignora a PRÓPRIA visita do lead ao remarcar
 * (senão mover pra perto do mesmo horário conflitaria consigo mesma).
 * Story 81-1 — a Nicole é da equipe HOUSE: só compromissos `team='house'` ocupam
 * o slot dela. Compromisso IMOB (Daiana/imobiliárias) no mesmo horário NÃO
 * bloqueia — equipes independentes (Epic 81), comportamento desejado.
 *
 * Story 87-18 — devolve `SlotCheck` (tri-estado), não `boolean`. Exportada pelo
 * mesmo motivo que `espalhar`: a `AC1` asserta os três estados DIRETO, em vez de
 * inferi-los das fixtures dos dois chamadores.
 */
export async function isSlotFree(
  supabase: SupabaseClient,
  orgId: string,
  startUtc: Date,
  excludeAppointmentId?: string | null
): Promise<SlotCheck> {
  const windowStart = new Date(startUtc.getTime() - (VISIT_DURATION_MIN - 1) * 60_000).toISOString()
  const windowEnd = new Date(startUtc.getTime() + (VISIT_DURATION_MIN - 1) * 60_000).toISOString()

  let q = supabase
    .from("appointments")
    .select("id")
    .eq("org_id", orgId)
    .eq("team", "house")
    .in("status", ["scheduled", "confirmed"])
    .gt("scheduled_at", windowStart)
    .lt("scheduled_at", windowEnd)
  if (excludeAppointmentId) q = q.neq("id", excludeAppointmentId)

  // Story 87-18 — o `error` NÃO pode ser descartado aqui. O PostgREST não
  // rejeita em erro de consulta: devolve `{ data: null, error }`. O `return
  // !data` do `HEAD` transformava RLS negado / coluna renomeada / timeout /
  // schema cache stale no MESMO resultado que "não há compromisso sobrepondo" —
  // `true`, "livre" — sem log, sem evento, sem rastro, e a Nicole ofertava E
  // gravava (`pipeline.ts:1563`) um horário possivelmente ocupado.
  const { data, error } = await q.limit(1).maybeSingle()

  if (error) return "unknown"
  return data ? "occupied" : "free"
}

/**
 * Checa disponibilidade do horário pedido. Se ocupado, devolve até 3 horários
 * livres (mesmo dia depois do pedido; se acabar, manhã do próximo dia útil).
 *
 * Story 87-18 — `erroNoPedido` significa UMA coisa só: *"a consulta do horário
 * que o cliente PEDIU falhou"*. Ele **não** significa "algum candidato de
 * alternativa falhou" (isso não aparece no retorno — vira o evento agregado e
 * uma lista de alternativas possivelmente mais curta) e **não** significa
 * "ocupado". Com `erroNoPedido === true`, `free === false` é ausência de
 * informação, não uma afirmação: quem consome tem de dizer "não consegui
 * confirmar", nunca "está ocupado".
 *
 * `emit` é o ÚLTIMO parâmetro de propósito (DECISÃO 3 do @po, `AC10-iii`):
 * nenhum parâmetro existente muda de posição, nome ou default, porque os dois
 * testes que seguram o tri-estado são justamente os que uma troca de assinatura
 * mais ampla reescreveria.
 */
export async function checkSlotAvailability(
  supabase: SupabaseClient,
  orgId: string,
  startUtc: Date,
  excludeAppointmentId?: string | null,
  emit?: EmitSlotQueryError
): Promise<{ free: boolean; alternatives: Date[]; erroNoPedido: boolean }> {
  const primary = await isSlotFree(supabase, orgId, startUtc, excludeAppointmentId)
  if (primary === "free") {
    return { free: true, alternatives: [], erroNoPedido: false }
  }

  // Story 87-18 (`AC2-ii`) — CURTO-CIRCUITO OBRIGATÓRIO, e não é otimização: é
  // teto de latência. Se o horário PEDIDO veio `"unknown"`, a resposta já está
  // decidida ("não consegui confirmar") e as alternativas não são usadas por
  // ela. Varrer os candidatos aqui gastaria até ~37 consultas SEQUENCIAIS
  // (`for … await`, não `Promise.all`) contra um banco que acabou de falhar, no
  // caminho da resposta ao lead — o cenário de outage é justamente o que faz o
  // primário falhar. Sai antes.
  if (primary === "unknown") {
    emit?.({
      level: "error",
      category: "ai",
      event_type: EVENT_SLOT_QUERY_ERROR,
      message: `Consulta de disponibilidade falhou no horário pedido (${startUtc.toISOString()})`,
      metadata: {
        requested_at: startUtc.toISOString(),
        candidatos_com_erro: 1,
        primario_com_erro: true,
      },
    })
    return { free: false, alternatives: [], erroNoPedido: true }
  }

  const alternatives: Date[] = []
  const reqParts = brtParts(startUtc)
  const reqBrt = new Date(startUtc.getTime() - BRT_OFFSET_HOURS * 3600_000)
  const reqMin = reqBrt.getUTCHours() * 60 + reqBrt.getUTCMinutes()

  // Candidatos de 30 em 30 min: resto do dia pedido + próximo dia útil (manhã).
  // A visita de 60min precisa caber inteira no expediente (início + 60 ≤ fechamento).
  const candidates: Date[] = []
  const closeToday = closeHourFor(reqParts.weekday)
  if (closeToday !== null) {
    const firstAfterReq = Math.floor(reqMin / SLOT_STEP_MIN) * SLOT_STEP_MIN + SLOT_STEP_MIN
    for (let m = firstAfterReq; m + VISIT_DURATION_MIN <= closeToday * 60; m += SLOT_STEP_MIN) {
      candidates.push(brtToUtc(reqParts.y, reqParts.m, reqParts.d, Math.floor(m / 60), m % 60))
    }
  }
  // Próximo dia (pula domingo)
  let nextBase = new Date(brtToUtc(reqParts.y, reqParts.m, reqParts.d, 12).getTime() + 86400_000)
  let nextParts = brtParts(nextBase)
  if (nextParts.weekday === 0) {
    nextBase = new Date(nextBase.getTime() + 86400_000)
    nextParts = brtParts(nextBase)
  }
  const closeNext = closeHourFor(nextParts.weekday)
  if (closeNext !== null) {
    for (let m = OPEN_HOUR * 60; m + VISIT_DURATION_MIN <= closeNext * 60; m += SLOT_STEP_MIN) {
      candidates.push(brtToUtc(nextParts.y, nextParts.m, nextParts.d, Math.floor(m / 60), m % 60))
    }
  }

  // Story 87-18 (`AC3`) — um candidato `"unknown"` é OMITIDO e a busca CONTINUA.
  // Nem entra em `alternatives` (seria a mentira original, "verificado e livre")
  // nem aborta o resto (seria criar, para o caminho B, o "um candidato derruba os
  // outros dez" que o `REL-1` já é no caminho A).
  let candidatosComErro = 0
  for (const c of candidates) {
    if (alternatives.length >= 3) break
    const status = await isSlotFree(supabase, orgId, c, excludeAppointmentId)
    if (status === "free") alternatives.push(c)
    else if (status === "unknown") candidatosComErro++
  }

  // Story 87-18 (`AC6`) — evento AGREGADO: no máximo UM por chamada, com a
  // contagem na `metadata`. Onze linhas quase idênticas em `system_events` por
  // um turno de conversa é ruído, não observabilidade.
  if (candidatosComErro > 0) {
    emit?.({
      level: "error",
      category: "ai",
      event_type: EVENT_SLOT_QUERY_ERROR,
      message: `Consulta de disponibilidade falhou em ${candidatosComErro} candidato(s) de alternativa ao checar ${startUtc.toISOString()}`,
      metadata: {
        requested_at: startUtc.toISOString(),
        candidatos_com_erro: candidatosComErro,
        // O primário aqui é `"occupied"` de verdade — o `"unknown"` saiu no
        // curto-circuito acima e nunca alcança este ponto.
        primario_com_erro: false,
      },
    })
  }

  // `erroNoPedido` é FALSE aqui de propósito: o horário pedido foi CONFIRMADO
  // ocupado. A incerteza ficou só nas alternativas → a mensagem existente ("já
  // existe uma visita nesse horário") continua verdadeira, com a lista
  // possivelmente mais curta (`AC6-ii`).
  return { free: false, alternatives, erroNoPedido: false }
}

/**
 * Story 87-17 (`AC3`) — amostra até `k` elementos de `xs` ESPALHADOS do início
 * ao fim, em vez dos `k` primeiros. Determinística e, para `k >= 2`, sempre
 * inclui `xs[0]` e `xs[xs.length - 1]` (invariante da `AC3-iii`: é ela que faz
 * "não existe nada mais tarde do que o último que te ofereci" ser verdade).
 *
 * O `Set` pode colapsar dois índices arredondados no mesmo valor — a saída pode
 * ter MENOS de `k` elementos, e isso é aceitável; o que nunca pode faltar são os
 * extremos. Exportada só para a `AC3` poder assertar a invariante direto, em vez
 * de inferi-la das fixtures de `freeSlotsInPeriod`.
 *
 * `k <= 1` é guarda obrigatória, não zelo: `limit` é parâmetro público com
 * default e a fórmula divide por `k - 1` (em `k = 1` isso seria `NaN` e o `map`
 * devolveria `undefined` dentro do array).
 */
export function espalhar<T>(xs: T[], k: number): T[] {
  if (k <= 0) return []
  if (xs.length <= k) return xs
  if (k === 1) return [xs[0]!]
  const idx = new Set<number>()
  for (let i = 0; i < k; i++) idx.add(Math.round((i * (xs.length - 1)) / (k - 1)))
  return [...idx].sort((a, b) => a - b).map((i) => xs[i]!)
}

/**
 * Story 75-245 — horários LIVRES de um período ("de manhã") num dia, para a
 * Nicole oferecer em vez de inventar. Respeita o expediente do dia (sábado
 * fecha ao meio-dia → período "tarde" devolve vazio), exige a visita de 60min
 * cabendo inteira e ignora horário que já passou.
 *
 * Story 87-17 (Defeito A) — antes o laço PARAVA nos `limit` primeiros livres, e
 * por isso a oferta era sempre a borda de abertura do período: "à tarde" nunca
 * passava de 12h/12h30/13h e "de manhã" era sempre 8h/8h30/9h, com ou sem
 * compromisso na agenda (a conversa da Ana, 26/08/2026, negou 15h e 17h que
 * estavam livres). Agora o período inteiro é conferido — no máximo 11
 * candidatos em `tarde` e 7 em `manha` — e a oferta é uma amostra ESPALHADA
 * desses livres.
 *
 * `AC4` — `isSlotFree` é UMA query ao `appointments` por candidato. Conferir o
 * período inteiro sobe de 3 para até 11 consultas, então elas vão em
 * `Promise.all`: profundidade sequencial 1 (um único round-trip de espera), em
 * vez de 11 em série no caminho da resposta ao lead. O paralelismo é limitado
 * pela geometria do período, não por uma lista de tamanho aberto.
 *
 * Story 87-18 — `houveIncerteza` significa UMA coisa só: *"ALGUM candidato deste
 * período não pôde ser verificado"*. Ele **não** significa "o período não tem
 * horário livre", **não** significa "a oferta é ruim" e **não** é motivo para
 * descartar `slots`: quem consome testa `slots.length` PRIMEIRO e só olha
 * `houveIncerteza` quando a lista veio vazia (`AC4-ii`). Com `slots` não vazio a
 * oferta é boa — ela é uma amostra por construção (`espalhar`), e um candidato a
 * menos não muda a categoria da resposta.
 *
 * 🔴 `slots: []` deixou de ter um significado único: pode ser "não há horário
 * livre nesse período" (`houveIncerteza === false`) ou "não consegui checar
 * nenhum candidato" (`houveIncerteza === true`). Qualquer refatoração que volte a
 * tratar lista vazia como a primeira coisa sem olhar a segunda reabre o defeito
 * desta story num lugar novo (`AC5`).
 */
export async function freeSlotsInPeriod(
  supabase: SupabaseClient,
  orgId: string,
  day: DayParts,
  period: DayPeriod,
  now: Date,
  excludeAppointmentId?: string | null,
  limit = 3,
  emit?: EmitSlotQueryError
): Promise<{ slots: Date[]; houveIncerteza: boolean }> {
  const weekday = brtParts(brtToUtc(day.y, day.m, day.d, 12)).weekday
  const close = closeHourFor(weekday)
  // Dia fechado: nenhuma consulta foi feita, logo nenhuma incerteza — é um
  // "não há horário" com base em regra de expediente, não em ignorância.
  if (close === null) return { slots: [], houveIncerteza: false }

  const { fromMin, toMin } = PERIOD_BOUNDS[period]
  const lastStart = Math.min(toMin, close * 60) - VISIT_DURATION_MIN
  const candidates: Date[] = []
  for (let m = Math.max(fromMin, OPEN_HOUR * 60); m <= lastStart; m += SLOT_STEP_MIN) {
    const candidate = brtToUtc(day.y, day.m, day.d, Math.floor(m / 60), m % 60)
    if (candidate.getTime() <= now.getTime()) continue
    candidates.push(candidate)
  }

  const resultados = await Promise.all(
    candidates.map((c) => isSlotFree(supabase, orgId, c, excludeAppointmentId))
  )
  // 🔴 Story 87-18 — a comparação com `"free"` é EXPLÍCITA de propósito. O
  // predicado de `Array.prototype.filter` é tipado como `=> unknown`, então
  // `filter((_, i) => resultados[i])` compila limpo e passa TODO candidato
  // `"occupied"` como livre (as três strings são truthy). Ver `AC10-ii`.
  const free = candidates.filter((_, i) => resultados[i] === "free")
  const comErro = resultados.filter((r) => r === "unknown").length

  // Story 87-18 (`AC6`) — um evento por CHAMADA, não por candidato.
  if (comErro > 0) {
    emit?.({
      level: "error",
      category: "ai",
      event_type: EVENT_SLOT_QUERY_ERROR,
      message: `Consulta de disponibilidade falhou em ${comErro}/${candidates.length} candidato(s) do período`,
      metadata: {
        dia: dayPartsToIso(day),
        periodo: period,
        candidatos_totais: candidates.length,
        candidatos_com_erro: comErro,
      },
    })
  }

  return { slots: espalhar(free, limit), houveIncerteza: comErro > 0 }
}
