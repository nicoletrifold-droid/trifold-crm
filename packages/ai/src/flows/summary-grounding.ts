/**
 * Story 87-7 (`W1-3b`) — o `ai_summary` deixa de gravar a fala da Nicole como
 * fato de agenda.
 *
 * Origem: o resumo da Sandra afirmava "Sandra agendou visita para sábado, dia 8"
 * e ela nunca agendou nada. O `updateLeadMemory` recebe a fala da PRÓPRIA Nicole
 * e manda o Haiku "incorporar informação nova" — sem uma linha sobre compromisso
 * e sem consultar `appointments`. O resumo volta ao contexto do turno seguinte
 * (`memory/loader.ts`, fallback do `ai_summary`, ativo em 100 % dos turnos
 * enquanto L1/L2/L3 estiverem vazios), então ela repete com mais confiança.
 *
 * Este módulo é a **terceira camada** do desenho, e é a única que é garantia:
 *   1. a verdade vem do banco, com data ABSOLUTA (`renderFatoDeAgenda`);
 *   2. regra de prompt proibindo derivar compromisso da conversa (nos dois prompts);
 *   3. **guarda de escrita** — resumo que afirma visita sem lastro NÃO é gravado
 *      (`analisarAfirmacaoDeVisita` + `classificarResumo`).
 *
 * A camada 2 sozinha é exatamente o que já falhou: a **RN8** ("NÃO invente
 * informações") existe desde sempre e não impediu nenhum dos incidentes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO NÃO É `detectAffirmedSlot` (AC1, e é o coração da story)
 *
 * `visit-slot.ts:472-473` faz `if (!said.day || !said.time) return null` — exige
 * dia **E** hora. As duas frases reais de produção que motivaram a story **não
 * têm hora**:
 *
 *   Sandra   "Sandra agendou visita para sábado, dia 8"
 *   Lucimara "Marcou visita ao decorado para o dia 8 (sábado), mas precisa
 *             confirmar o horário de trabalho antes de finalizar o agendamento"
 *
 * Medido pelo @dev na T0 sobre os 12 resumos que afirmam visita em produção
 * (08/08): a `detectAffirmedSlot` dispara em **9 de 12** — e **NÃO dispara em
 * nenhum dos que têm `appointments = 0`**. Um guarda construído sobre ela seria
 * cego em 100 % dos casos que ele existe para pegar. Por isso a regra mora aqui.
 *
 * E `visit-slot.ts` **não pode ser tocada** (AC7): mexer nela invalidaria o
 * baseline de lastro da 87-3, que já está em produção e dimensiona o Epic 88.
 * O que se faz aqui é **chamar** `parseDayParts`/`parseTimeParts` — os parsers do
 * projeto —, nunca alterá-los.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Reuso declarado (IDS): `parseDayParts`, `parseTimeParts` (`visit-slot.ts`,
 * chamados sem modificação); `JANELA_CLASSIFICACAO_MIN`, `parseTimestamptz`,
 * `diaBrt` (`agenda-reconcile.ts`) — a mesma janela e a mesma convenção de data
 * BRT da 87-3. **Não inventar outra.**
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { JANELA_CLASSIFICACAO_MIN, diaBrt, parseTimestamptz } from "./agenda-reconcile"
import {
  dayPartsFromUtc,
  parseDayParts,
  parseTimeParts,
  slotToUtc,
  type DayParts,
  type TimeParts,
} from "./visit-slot"

const MIN_MS = 60_000

/** Janela da consulta de `appointments` do guarda: `now ± 60 dias`. */
export const JANELA_APPOINTMENTS_DIAS = 60

/** Teto de linhas da consulta — `limit` explícito, nunca ilimitado. */
export const LIMITE_APPOINTMENTS = 50

/** Tamanho máximo da `citacao_curta` do evento (regra de PII do `W0-2`). */
export const CITACAO_MAX = 120

/**
 * O appointment como este guarda precisa dele. Estrutural de propósito: o
 * `AppointmentDoLead` da 87-3 é atribuível a este tipo sem conversão.
 *
 * `status` entra porque o **bloco do prompt** não pode anunciar como confirmada
 * uma visita cancelada. Para o **lastro**, a doutrina da 87-3 continua valendo
 * inteira: `cancelled` e `no_show` CONTAM — a pergunta é "existia a linha no
 * banco?", e uma visita desmarcada depois EXISTIU.
 */
export interface AppointmentDoResumo {
  id: string
  scheduled_at: Date
  status: string
}

/** Status que impedem o bloco de anunciar "VISITA CONFIRMADA". */
const STATUS_CANCELADO = new Set(["cancelled", "canceled"])

export interface AnaliseAfirmacaoVisita {
  /** O texto AFIRMA uma visita marcada (não pergunta, não nega, não propõe). */
  afirma: boolean
  /** Dia afirmado, ancorado em `now`. `null` quando não há dia parseável. */
  dia: DayParts | null
  /** Hora afirmada. `null` é o caso NORMAL — a frase da Sandra não tem hora. */
  hora: TimeParts | null
  /**
   * Ano ESCRITO na frase ("15 de agosto **de 2026**", "03/08/**2026**), ou
   * `null`. Existe porque `parseDayParts` **ignora o ano do texto** e rola a
   * data vencida para o ano seguinte — ver `candidatosDeDia`.
   */
  anoExplicito: number | null
  /** A frase que afirmou, saneada e truncada em `CITACAO_MAX`. */
  citacao: string | null
}

/**
 * Os três veredictos da story, mais `sem_afirmacao`.
 *
 * `sem_afirmacao` existe porque a esmagadora maioria dos resumos não fala de
 * visita nenhuma, e chamar isso de "com_lastro" seria mentir no evento: um
 * resumo sobre 2 suítes e vaga de garagem não tem lastro de agenda — ele não
 * afirma agenda. Os três veredictos do Desenho §2 são os que decidem a escrita;
 * este é o "nem entrou no assunto". **Nenhum deles bloqueia além do
 * `sem_lastro`.**
 */
export type VeredictoResumo = "sem_afirmacao" | "com_lastro" | "sem_lastro" | "indeterminado"

export interface ClassificacaoResumo {
  veredicto: VeredictoResumo
  /**
   * `YYYY-MM-DD` BRT do dia afirmado — o **candidato que casou** quando houve
   * casamento; senão o que o parser resolveu literalmente. Sem isso o evento
   * publicaria `2027-08-03` para uma visita real de `2026-08-03`, que foi
   * exatamente como o `F1` se escondeu.
   */
  diaAfirmado: string | null
  /** Appointment mais próximo do afirmado (mesmo quando não casou). */
  appointmentIdProximo: string | null
  /**
   * `|scheduled_at − afirmado|` em minutos, medido contra o candidato **mais
   * próximo**. Um número legível ("errou por 5 dias") em vez de `525600`.
   */
  divergenciaMin: number | null
  citacao: string | null
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function normalizar(s: string): string {
  return stripAccents(s).toLowerCase()
}

/**
 * A frase fala de VISITA (e não de qualquer outro compromisso). Existe por causa
 * de um falso positivo real, lido pelo @po em produção: *"possui uma **audiência
 * agendada** na justiça contra a empresa"* — tem verbo de agendamento, zero
 * appointments, e não é visita nenhuma.
 */
const VISITA_RE = /\bvisita\b|\bvisitas\b|\bdecorado\b|\bstand\b/

/**
 * Verbo que AFIRMA um compromisso já marcado. Só formas FLEXIONADAS: "agendar"
 * (infinitivo) e "agendamento" (substantivo) ficam de fora de propósito —
 * *"Próximo passo: agendar visita"* e *"finalizar agendamento da visita"* são
 * plano, não fato. É o que impede o guarda de bloquear o resumo que descreve o
 * próximo passo, que é justamente o que o corretor lê no card.
 */
const AFIRMACAO_RE =
  /\bagend(?:ou|ada|ado|adas|ados|amos|ei|aram)\b|\bmarc(?:ou|ada|ado|adas|ados|amos|ei|aram)\b|\bconfirm(?:ou|ada|ado|adas|ados|amos|ei|aram)\b|\bpossui\b|\bja tem\b/

/**
 * Negação. Vale **só quando vem ANTES** do verbo de afirmação na mesma frase —
 * e essa assimetria é normativa, não conveniência de implementação:
 *
 *   • *"Lead **ainda não** confirmou visita"* (Orlice, produção) → a negação
 *     precede o verbo: **não é afirmação**, e o guarda não pode alarmar sobre ela.
 *   • *"**Marcou visita** ao decorado para o dia 8 (sábado), **mas precisa
 *     confirmar** o horário…"* (Lucimara, produção, `appointments = 0`) → a
 *     ressalva vem DEPOIS. **É afirmação**, e o guarda não pode ser absolvido
 *     por ela: o resumo **abre afirmando**, e é a abertura que volta ao contexto
 *     no turno seguinte pelo `loader.ts`. É a `AC1-(ii)`.
 */
const NEGACAO_RE = /\b(?:nao|nunca|aguard\w+|pendente|sem)\b/

/**
 * Ano ESCRITO na frase. Conservador de propósito — só as duas formas em que o
 * ano acompanha uma data: `"… de 2026"` e `"03/08/2026"`. Um `\b20\d{2}\b`
 * solto pegaria metragem, valor e número de unidade.
 */
const ANO_EXPLICITO_RES: RegExp[] = [
  /\bde\s+(20\d{2})\b/,
  /\b\d{1,2}\/\d{1,2}\/(20\d{2})\b/,
]

function anoEscrito(normal: string): number | null {
  for (const re of ANO_EXPLICITO_RES) {
    const m = re.exec(normal)
    if (m) return parseInt(m[1]!, 10)
  }
  return null
}

/**
 * 🔴 O CONSERTO DO `F1` — e ele é o defeito mais caro que este módulo teve.
 *
 * `parseDayParts` (`visit-slot.ts`, que a `AC7` proíbe tocar) foi escrita para
 * um lead PEDINDO visita: ela assume que toda data referida está no FUTURO e
 * **rola para frente** o que já passou. Aqui o texto é um resumo que fala, quase
 * sempre, de uma visita que **já aconteceu** — e a mesma função vira uma bomba:
 *
 *   "visita para segunda-feira, 3 de agosto às 16h"   (Marlene, produção)
 *   appointment REAL .......... 2026-08-03 16:00
 *   parseDayParts em 08/08 .... 2027-08-03      → sem_lastro, divergência 525.600 min
 *
 * E ela **ignora o ano escrito no texto**. Isso morde a própria camada 1 desta
 * story: o bloco `FATO DE AGENDA` ensina o modelo a escrever *"sábado, 15 de
 * agosto de 2026 às 10:00"*. No dia da visita casa; **no dia seguinte a data rola
 * para 2027 e o resumo daquele lead fica bloqueado para sempre** — e como o cron
 * reescreve a cada 30 min, todo lead com visita DE VERDADE congelaria no texto
 * vencido que a `AC11` existe para matar. Nenhuma fixture pegava: todas afirmam
 * um dia `>= now`.
 *
 * O conserto tem duas metades, e as duas moram AQUI (nunca em `visit-slot.ts`):
 *
 * 1. **Ano escrito manda.** Se a frase traz o ano, ele substitui o palpite do
 *    parser e não há candidato nenhum — o texto é explícito.
 * 2. **Sem ano escrito, o dia é AMBÍGUO pelo tamanho exato do rolo que a
 *    `parseDay` pode ter aplicado**, e cada candidato abaixo corresponde a um
 *    ramo dela, não a um chute:
 *      • `−1 ano`   ← ramo `"N de <mês>"` (rola o ano quando a data já passou)
 *      • `−1 mês`   ← ramo `"dia N"` (rola o mês quando `dd < hoje`)
 *      • `−7 dias`  ← ramo do dia da semana (sempre a PRÓXIMA ocorrência)
 *
 * A direção do erro é **fail-open** (mais casamento ⇒ menos bloqueio), que é a
 * postura declarada da story. E o custo de precisão é nulo na prática: os
 * candidatos só podem casar com um appointment dentro da janela de ±60 dias que
 * a consulta já trouxe.
 */
export function candidatosDeDia(analise: AnaliseAfirmacaoVisita): DayParts[] {
  const dia = analise.dia
  if (!dia) return []

  // (1) O ano escrito é autoridade: nada de candidato.
  if (analise.anoExplicito !== null) return [{ ...dia, y: analise.anoExplicito }]

  // (2) Um candidato por ramo de rolo da `parseDay`.
  const menosUmAno: DayParts = { ...dia, y: dia.y - 1 }
  const menosUmMes: DayParts =
    dia.m === 0 ? { y: dia.y - 1, m: 11, d: dia.d } : { ...dia, m: dia.m - 1, d: dia.d }
  const menosSeteDias = dayPartsFromUtc(
    new Date(slotToUtc(dia, { hour: 12, minute: 0 }).getTime() - 7 * 86400_000)
  )

  const vistos = new Set<string>()
  const out: DayParts[] = []
  for (const c of [dia, menosUmAno, menosUmMes, menosSeteDias]) {
    const chave = `${c.y}-${c.m}-${c.d}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    out.push(c)
  }
  return out
}

/** Telefone e e-mail saem da citação (regra de PII do `W0-2`). */
function removerPii(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(?:\+?\d{2}\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/g, "[telefone]")
}

/** Frase saneada e truncada — o que vai para `citacao_curta` no evento (AC8). */
export function citacaoCurta(frase: string): string {
  const limpa = removerPii(frase.replace(/\s+/g, " ").trim())
  return limpa.length <= CITACAO_MAX ? limpa : `${limpa.slice(0, CITACAO_MAX - 1)}…`
}

/**
 * Quebra em frases preservando o texto ORIGINAL (com acento). O corte por
 * abreviação ("Av. Nildo…") é aceitável e conservador: dia e hora vêm SEMPRE
 * antes do endereço nos resumos reais, e um corte a mais degrada para
 * "só dia" — que é o lado fail-open.
 */
function frases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?;:])\s+|\n+/)
    .map((f) => f.trim())
    .filter(Boolean)
}

/** A frase afirma visita marcada? (recebe a frase JÁ normalizada) */
function fraseAfirma(normal: string): boolean {
  if (!VISITA_RE.test(normal)) return false
  const m = AFIRMACAO_RE.exec(normal)
  if (!m) return false
  // A negação só desqualifica quando PRECEDE o verbo — ver `NEGACAO_RE`.
  return !NEGACAO_RE.test(normal.slice(0, m.index))
}

/**
 * O texto afirma uma visita marcada? Em caso afirmativo, qual dia/hora?
 *
 * **Puro.** `now` é o instante da ESCRITA do resumo — o guarda roda só na
 * escrita e NUNCA reancora um resumo antigo na leitura (armadilha 3 da story).
 */
export function analisarAfirmacaoDeVisita(texto: string | null | undefined, now: Date): AnaliseAfirmacaoVisita {
  const vazio: AnaliseAfirmacaoVisita = {
    afirma: false,
    dia: null,
    hora: null,
    anoExplicito: null,
    citacao: null,
  }
  if (!texto || !texto.trim()) return vazio

  let primeiraAfirmacao: string | null = null

  for (const frase of frases(texto)) {
    if (!fraseAfirma(normalizar(frase))) continue
    if (primeiraAfirmacao === null) primeiraAfirmacao = frase

    const dia = parseDayParts(frase, now)
    if (!dia) continue // afirma, mas sem dia aqui — pode haver outra frase com dia

    return {
      afirma: true,
      dia,
      hora: parseTimeParts(frase),
      anoExplicito: anoEscrito(normalizar(frase)),
      citacao: citacaoCurta(frase),
    }
  }

  // Afirmou, mas nenhuma frase tinha dia parseável ⇒ `indeterminado` lá na frente.
  if (primeiraAfirmacao !== null) {
    return { ...vazio, afirma: true, citacao: citacaoCurta(primeiraAfirmacao) }
  }
  return vazio
}

/**
 * O veredicto que decide a GRAVAÇÃO. Puro.
 *
 * Regra de casamento, e ela é a mesma janela da 87-3:
 *   • dia + hora → existe appointment a **≤ 30 min** (`JANELA_CLASSIFICACAO_MIN`);
 *   • só dia     → existe appointment no **mesmo dia BRT**.
 *
 * `indeterminado` (afirma, mas sem dia parseável) **GRAVA** — fail-open
 * deliberado e declarado. Bloquear o que não se consegue julgar congelaria
 * resumos legítimos por ambiguidade de prosa; a doutrina de baldes da 87-3 é a
 * mesma: o que não se sabe classificar não vira alarme, vira número (AC8).
 */
export function classificarResumo(input: {
  analise: AnaliseAfirmacaoVisita
  appointmentsDoLead: AppointmentDoResumo[]
  now: Date
}): ClassificacaoResumo {
  const { analise, appointmentsDoLead } = input

  const base: ClassificacaoResumo = {
    veredicto: "sem_afirmacao",
    diaAfirmado: null,
    appointmentIdProximo: null,
    divergenciaMin: null,
    citacao: analise.citacao,
  }

  if (!analise.afirma) return base
  if (!analise.dia) return { ...base, veredicto: "indeterminado" }

  const hora: TimeParts = analise.hora ?? { hour: 12, minute: 0 }
  const candidatos = candidatosDeDia(analise)
  const literalUtc = slotToUtc(analise.dia, hora)

  const validos = appointmentsDoLead.filter(
    (a) => a.scheduled_at instanceof Date && Number.isFinite(a.scheduled_at.getTime())
  )

  // Casou com QUAL candidato? Guardar o candidato — e não só o `true` — é o que
  // faz o evento publicar `2026-08-03` em vez do `2027-08-03` do parser.
  let casouEm: Date | null = null
  for (const c of candidatos) {
    const afirmadoUtc = slotToUtc(c, hora)
    const bate = analise.hora
      ? validos.some(
          (a) =>
            Math.abs(a.scheduled_at.getTime() - afirmadoUtc.getTime()) <=
            JANELA_CLASSIFICACAO_MIN * MIN_MS
        )
      : validos.some((a) => diaBrt(a.scheduled_at) === diaBrt(afirmadoUtc))
    if (bate) {
      casouEm = afirmadoUtc
      break
    }
  }

  // A divergência sai do candidato MAIS PRÓXIMO, não do literal: `525600` (um
  // ano em minutos) era o número que escondia o `F1` em vez de denunciá-lo.
  //
  // E o candidato que produziu a divergência é o MESMO que vai em
  // `diaAfirmado`: publicar `dia_afirmado: 2027-07-08` ao lado de
  // `divergencia_min: 60` seria um par que se contradiz na própria linha, e
  // quem lesse o evento não teria como saber qual dos dois acreditar.
  let proximo: AppointmentDoResumo | undefined
  let candidatoMaisProximo: Date | null = null
  let menorDelta = Number.POSITIVE_INFINITY
  for (const c of candidatos) {
    const afirmadoUtc = slotToUtc(c, hora)
    for (const a of validos) {
      const delta = Math.abs(a.scheduled_at.getTime() - afirmadoUtc.getTime())
      if (delta < menorDelta) {
        menorDelta = delta
        proximo = a
        candidatoMaisProximo = afirmadoUtc
      }
    }
  }

  return {
    veredicto: casouEm ? "com_lastro" : "sem_lastro",
    diaAfirmado: diaBrt(casouEm ?? candidatoMaisProximo ?? literalUtc),
    appointmentIdProximo: proximo?.id ?? null,
    divergenciaMin: proximo ? Math.round(menorDelta / MIN_MS) : null,
    citacao: analise.citacao,
  }
}

const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"]
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

/** "2026-08-15" (BRT) → "15/08/2026". */
function ddmmaaaa(d: Date): string {
  const [y, m, dd] = diaBrt(d).split("-")
  return `${dd}/${m}/${y}`
}

/** "sábado, 15 de agosto de 2026 às 10:00" — determinístico, BRT, sem `Intl`. */
function porExtenso(d: Date): string {
  const [y, m, dd] = diaBrt(d).split("-").map((n) => parseInt(n, 10)) as [number, number, number]
  const semana = DIAS_SEMANA[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]!
  // `diaBrt` já converteu para BRT; a hora sai do mesmo lugar.
  const brt = new Date(d.getTime() - 3 * 3600_000)
  const hh = String(brt.getUTCHours()).padStart(2, "0")
  const mi = String(brt.getUTCMinutes()).padStart(2, "0")
  return `${semana}, ${dd} de ${MESES[m - 1]} de ${y} às ${hh}:${mi}`
}

/**
 * O bloco `FATO DE AGENDA` que entra nos DOIS prompts de resumo. Puro.
 *
 * Existe para substituir a prosa derivada da conversa por dado do banco com
 * **data absoluta** — que é o defeito medido em **12 de 12** resumos de produção
 * em 08/08: todos afirmam visita com data relativa ("para amanhã", "no dia
 * seguinte", "segunda-feira 27") e **nenhum** tem appointment futuro. O resumo do
 * André diz, em tempo presente, que ele tem visita amanhã; a visita foi em 05/08.
 *
 * A distinção passado × futuro é a `AC11-(i)`: appointment no passado **nunca**
 * vira fato em tempo presente.
 */
export function renderFatoDeAgenda(appointments: AppointmentDoResumo[], now: Date): string {
  const cabecalho = "FATO DE AGENDA (fonte: tabela `appointments` — a ÚNICA fonte autorizada):"
  const validos = appointments.filter(
    (a) => a.scheduled_at instanceof Date && Number.isFinite(a.scheduled_at.getTime())
  )

  const futuras = validos
    .filter((a) => a.scheduled_at.getTime() > now.getTime() && !STATUS_CANCELADO.has(a.status))
    .sort((a, b) => a.scheduled_at.getTime() - b.scheduled_at.getTime())

  if (futuras[0]) {
    return `${cabecalho}\n  VISITA CONFIRMADA para ${porExtenso(futuras[0].scheduled_at)}.`
  }

  const passadas = validos
    .filter((a) => a.scheduled_at.getTime() <= now.getTime())
    .sort((a, b) => b.scheduled_at.getTime() - a.scheduled_at.getTime())

  if (passadas[0]) {
    return `${cabecalho}\n  NÃO HÁ VISITA FUTURA AGENDADA. A última visita registrada foi em ${ddmmaaaa(passadas[0].scheduled_at)}.`
  }

  return `${cabecalho}\n  NÃO HÁ VISITA AGENDADA para este lead.`
}

/**
 * As regras de prompt que acompanham o bloco (camada 2 — necessária, **não
 * suficiente**: a RN8 já provou que texto sozinho não segura).
 */
export const REGRAS_FATO_DE_AGENDA = `REGRAS SOBRE VISITA (OBRIGATORIAS):
- NUNCA escreva que existe visita marcada a partir da conversa. A unica fonte e o bloco FATO DE AGENDA.
- Ao citar a visita, use a DATA ABSOLUTA do bloco. NUNCA "amanha", "no dia seguinte", "este sabado".
- Visita que ja aconteceu se escreve no passado.`

/**
 * Os `appointments` do lead na janela do guarda (`now ± 60 dias`). **Uma
 * consulta, dois consumidores** — se cada esteira tivesse a sua, elas
 * divergiriam, que é exatamente o defeito que a `AC6` existe para impedir.
 *
 * Por que o `activeAppointment` do `pipeline.ts` não serve: ele filtra
 * `gte("scheduled_at", now)` e traz **1**. O guarda precisa também do passado
 * recente — é como se detecta o resumo vencido (AC4).
 *
 * `status` NÃO é filtrado: `cancelled`/`no_show` contam para o lastro (87-3).
 * **Fail-open:** erro de consulta devolve `null`, e o chamador GRAVA como hoje —
 * bloquear por falha de infraestrutura seria pior que o defeito.
 */
export async function carregarAppointmentsDoLead(
  supabase: SupabaseClient,
  leadId: string,
  now: Date,
  opts?: { orgId?: string | null }
): Promise<AppointmentDoResumo[] | null> {
  const janelaMs = JANELA_APPOINTMENTS_DIAS * 86400_000
  let q = supabase
    .from("appointments")
    .select("id, scheduled_at, status")
    .eq("lead_id", leadId)
    .gte("scheduled_at", new Date(now.getTime() - janelaMs).toISOString())
    .lte("scheduled_at", new Date(now.getTime() + janelaMs).toISOString())
  if (opts?.orgId) q = q.eq("org_id", opts.orgId)

  const { data, error } = await q.limit(LIMITE_APPOINTMENTS)
  if (error) return null

  const out: AppointmentDoResumo[] = []
  for (const row of ((data as Array<Record<string, unknown>> | null) ?? [])) {
    const scheduled = parseTimestamptz(row.scheduled_at as string)
    if (!scheduled) continue
    out.push({ id: String(row.id), scheduled_at: scheduled, status: String(row.status ?? "") })
  }
  return out
}
