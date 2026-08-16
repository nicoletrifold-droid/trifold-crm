/**
 * Story 87-4 (item W1-2b) — o estado de agenda para de mentir.
 *
 * Antes desta story o mesmo assunto morava em QUATRO chaves soltas de
 * `conversation_state.collected_data` — `visit_availability` (string crua),
 * `visit_pending_date`, `visit_pending_hour`, `visit_pending_minute` — sem
 * procedência, sem âncora temporal e sem validade. Os três defeitos que isso
 * produziu, todos medidos em produção em 07-08/08/2026:
 *
 *  1. A DATA ANDA SOZINHA. `resolveVisitSlotParts` recebia a frase crua e
 *     chamava `parseDayParts(frase, now)` — reancorando a expressão relativa
 *     contra o relógio de CADA leitura. A frase da Edicleia ("sexta-feira às
 *     15h") resolvia 07/08, depois 14/08, depois 21/08, depois 28/08. Um
 *     gerador perpétuo de sextas.
 *  2. A GUARDA PELA METADE. A 75-268 aplicou `periodWithoutDayInMessage` só ao
 *     caminho do `visit_availability`; o `visit_pending_date` entrava sempre.
 *     Foi por isso que a Valnira pediu "Semana de manhã" e ouviu três sábados.
 *  3. PROCEDÊNCIA. `extractCollectedData` rodava sobre a fala da PRÓPRIA Nicole
 *     e gravava a pergunta dela como disponibilidade do lead.
 *
 * A resposta é UM objeto tipado com citação, âncora e validade. A regra que é o
 * coração da story:
 *
 *   > `resolveVisitSlotParts` NUNCA reancora. Ela usa `data_absoluta` ou não usa
 *   > nada. A `citacao` existe para auditoria e para o bloco `[SISTEMA]` poder
 *   > citar em vez de afirmar — NUNCA como fonte de parse.
 *
 * Módulo puro de propósito: nenhum import de `visit-slot` em runtime (só de
 * tipo), para que `visit-slot` possa depender deste sem ciclo.
 */
import type { DayPeriod } from "./visit-slot"

/** Chave única do fato de agenda dentro de `collected_data`. */
export const AGENDA_STATE_KEY = "agenda_state"

/**
 * As quatro chaves do formato antigo. Esta story NÃO migra o conteúdo delas:
 * os 56 registros residuais medidos em produção em 07/08 (9 com
 * `visit_pending_date`, 34 com dia que anda, 6 que resolvem dia+hora a partir de
 * um "Oi") são exatamente a classe que não deve ser preservada. Carimbar âncora
 * em cima de mentira só deixaria a mentira mais difícil de detectar — elas são
 * APAGADAS no primeiro turno em que a conversa for tocada.
 */
export const LEGACY_AGENDA_KEYS = [
  "visit_availability",
  "visit_pending_date",
  "visit_pending_hour",
  "visit_pending_minute",
] as const

/**
 * TTL do fato de agenda, em horas. 48 h é o mesmo critério que o @architect
 * usou no purge manual de 07/08 (`updated_at` anterior a 48 h) — não é número
 * novo, é o número que já tinha sido exercido contra o dado real.
 *
 * `expira_em` é calculado NA ESCRITA (âncora + TTL) e o objeto expirado é
 * APAGADO na escrita seguinte, não apenas ignorado na leitura: estado só
 * ignorado volta a valer se alguém mexer na constante um dia.
 */
export const TTL_AGENDA_STATE_HORAS = 48

/**
 * Story 87-4 (revisão pós-gate do @qa) — DE ONDE o fato veio, dentro da conversa.
 * Não confundir com `origem`, que é QUEM falou.
 *
 * As quatro chaves antigas NÃO eram redundantes, e foi esse o erro do desenho
 * original desta story: `visit_pending_*` e `visit_availability` carregavam
 * semânticas diferentes, e o `HEAD` dependia da diferença.
 *
 *   `pendencia` — o dia/hora que o lead deu EM RESPOSTA a uma pergunta nossa.
 *                 Era o `visit_pending_*`. Não é stale por construção: nós
 *                 acabamos de perguntar. Vale em TODOS os ramos, inclusive no da
 *                 visita já marcada (é o pedido de remarcação do lead).
 *
 *   `mencao`    — o dia/hora colhido de texto solto, sem termos perguntado nada.
 *                 Era o `visit_availability`. O `HEAD` o excluía do ramo da
 *                 visita já marcada de propósito ("NÃO do visit_availability,
 *                 que guarda o slot ANTIGO") — sem essa exclusão, um "Oi" REMARCA
 *                 a visita de quem está em negociação avançada.
 *
 * E é a `mencao` que produziu o incidente da Valnira (03/08 23:57): conferido na
 * conversa em produção, o sábado dos "três sábados" veio da fala da PRÓPRIA
 * Nicole ("…durante a semana ou sábado de manhã?") — não havia pendência nenhuma,
 * aquele era o primeiro turno em que se perguntou o dia. Por isso a guarda de
 * período vale para a `mencao` e NÃO para a `pendencia`: aplicá-la à pendência
 * não protegeria a Valnira (ela não tinha uma) e faz o pedido de remarcação de
 * quem respondeu à nossa pergunta sumir em silêncio.
 */
export type FonteAgenda = "pendencia" | "mencao"

export interface AgendaState {
  /** Trecho LITERAL da mensagem role='user' que originou o fato. Sem citação, não há estado. */
  citacao: string
  /** Quem falou. Só 'lead' produz disponibilidade. */
  origem: "lead"
  /** De onde veio dentro da conversa: resposta a pergunta nossa, ou texto solto. */
  fonte: FonteAgenda
  /** Dia resolvido NO MOMENTO DA ESCRITA (YYYY-MM-DD), ou null quando o lead só deu hora/período. */
  data_absoluta: string | null
  hora: number | null
  minuto: number | null
  periodo: DayPeriod | null
  /** O instante contra o qual a resolução foi feita. É A ÂNCORA. */
  ancorado_em: string
  /** ancorado_em + TTL. Depois disso não entra no contexto e é apagado. */
  expira_em: string

  // ─── Reservados pela Story do item W1-2c. NADA escreve e NADA lê hoje. ───────
  // Declarados aqui de propósito, para que o W1-2c seja "passar a escrever dois
  // campos" e não uma SEGUNDA mudança de formato no mesmo objeto.
  //
  // ATENÇÃO — os dois NÃO têm a mesma confiabilidade (refinamento do @po, 07/08):
  //
  //   ofertas_do_sistema  ← deriva de authorizedSlotUtc / freeSlotsInPeriod, ou seja,
  //                         de um valor que o SISTEMA calculou. Confiança ALTA.
  //                         É ESTE que a Onda 3 (item W3-2e) vai LER para resolver
  //                         o "Ok" do lead.
  //
  //   afirmado_pela_nicole ← sai da detectAffirmedSlot, parseada da PROSA dela.
  //                         Precisão medida: ~79% (5 de 30 disparos em 60 dias são
  //                         pergunta ou oferta, não afirmação — @po §3.2).
  //                         WRITE-ONLY: observabilidade apenas. NUNCA é insumo de
  //                         decisão enquanto a guarda de interrogação do Epic 88
  //                         (condição nº 7 do @architect) não subir.
  ofertas_do_sistema?: string[]
  afirmado_pela_nicole?: string | null
}

/** Tamanho máximo da citação persistida — auditoria, não arquivo de conversa. */
const CITACAO_MAX = 280

/**
 * Monta um `AgendaState` já ancorado. `dataAbsoluta` entra JÁ resolvida
 * (YYYY-MM-DD): quem resolve é o parser, contra o `now` deste turno, e essa
 * resolução nunca mais é refeita.
 */
export function buildAgendaState(input: {
  citacao: string
  now: Date
  /** Obrigatória: é ela que decide se o fato pode mexer numa visita já marcada. */
  fonte: FonteAgenda
  dataAbsoluta?: string | null
  hora?: number | null
  minuto?: number | null
  periodo?: DayPeriod | null
}): AgendaState {
  const ancorado = input.now
  return {
    citacao: input.citacao.trim().slice(0, CITACAO_MAX),
    origem: "lead",
    fonte: input.fonte,
    data_absoluta: input.dataAbsoluta ?? null,
    hora: input.hora ?? null,
    minuto: input.minuto ?? null,
    periodo: input.periodo ?? null,
    ancorado_em: ancorado.toISOString(),
    expira_em: new Date(ancorado.getTime() + TTL_AGENDA_STATE_HORAS * 3600_000).toISOString(),
  }
}

/** O fato veio de uma pergunta NOSSA? Só a pendência pode mexer numa visita já marcada. */
export function isPendencia(state: AgendaState | null | undefined): boolean {
  return state?.fonte === "pendencia"
}

/** O estado já passou da validade em `now`? Fronteira: `expira_em` exato ainda VALE. */
export function isAgendaStateExpired(state: AgendaState, now: Date): boolean {
  const expira = Date.parse(state.expira_em)
  if (Number.isNaN(expira)) return true // sem validade legível não é estado, é lixo
  return now.getTime() > expira
}

/**
 * Valida a forma do que está gravado. `collected_data` é `jsonb` livre e já
 * recebeu de tudo — objeto sem citação, sem âncora ou com `origem` diferente de
 * `'lead'` NÃO é estado de agenda e é tratado como ausente.
 *
 * Story 87-12 — passa a ser exportada (só isso: nenhuma linha do corpo muda).
 * O resumo do corretor (`flows/handoff.ts`) precisa da MESMA regra de admissão
 * que `readAgendaState` e `hasAgendaFact` já usam: a procedência do fato está
 * no TIPO (`origem: 'lead'` + `citacao` não-vazia), nunca no texto. Copiar a
 * validação para lá criaria um segundo leitor divergente do mesmo objeto — que
 * é exatamente o que o painel (`leads/[id]/page.tsx:199-206`) faz hoje, e por
 * isso ele NÃO confere `origem`.
 *
 * ⚠️ Exportar isto NÃO abre os campos reservados do item W1-2c: `ofertas_do_sistema`
 * e `afirmado_pela_nicole` seguem WRITE-ONLY (ver `:108-126`). Quem consome esta
 * função lê `citacao`, `data_absoluta`, `hora`, `minuto`, `periodo` e `fonte`.
 * Fora de `flows/`, ninguém: ela NÃO é reexportada em `flows/index.ts`.
 */
export function parseAgendaState(raw: unknown): AgendaState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (typeof o.citacao !== "string" || !o.citacao.trim()) return null
  if (o.origem !== "lead") return null
  if (typeof o.ancorado_em !== "string" || typeof o.expira_em !== "string") return null
  const dataAbsoluta =
    typeof o.data_absoluta === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.data_absoluta)
      ? o.data_absoluta
      : null
  const periodo = o.periodo === "manha" || o.periodo === "tarde" ? o.periodo : null
  return {
    citacao: o.citacao,
    origem: "lead",
    // FAIL-CLOSED: estado gravado antes desta revisão não tem `fonte`. Tratar
    // como `mencao` é a leitura conservadora — é a que NÃO deixa o estado mexer
    // numa visita já marcada.
    fonte: o.fonte === "pendencia" ? "pendencia" : "mencao",
    data_absoluta: dataAbsoluta,
    hora: typeof o.hora === "number" ? o.hora : null,
    minuto: typeof o.minuto === "number" ? o.minuto : null,
    periodo,
    ancorado_em: o.ancorado_em,
    expira_em: o.expira_em,
    ...(Array.isArray(o.ofertas_do_sistema) ? { ofertas_do_sistema: o.ofertas_do_sistema as string[] } : {}),
    ...(typeof o.afirmado_pela_nicole === "string" ? { afirmado_pela_nicole: o.afirmado_pela_nicole } : {}),
  }
}

/**
 * Lê o estado de agenda de um `collected_data`. Devolve `state = null` quando
 * não existe, quando a forma é inválida OU quando expirou — e sinaliza
 * `expired` para que o chamador possa apagar e registrar o evento.
 */
export function readAgendaState(
  collectedData: Record<string, unknown>,
  now: Date
): { state: AgendaState | null; expired: boolean } {
  const parsed = parseAgendaState(collectedData[AGENDA_STATE_KEY])
  if (!parsed) return { state: null, expired: false }
  if (isAgendaStateExpired(parsed, now)) return { state: null, expired: true }
  return { state: parsed, expired: false }
}

/** Grava (ou apaga, com `null`) o estado de agenda. Muta o objeto recebido. */
export function writeAgendaState(
  collectedData: Record<string, unknown>,
  state: AgendaState | null
): void {
  if (state) collectedData[AGENDA_STATE_KEY] = state
  else delete collectedData[AGENDA_STATE_KEY]
}

/**
 * Remove as quatro chaves do formato antigo. Muta o objeto e devolve a lista do
 * que foi removido — é o insumo do evento `NICOLE_AGENDA_STATE_LEGADO_DESCARTADO`,
 * cuja contagem é a prova (AC8) de que os registros residuais morreram sozinhos,
 * sem novo purge manual.
 */
export function stripLegacyAgendaKeys(collectedData: Record<string, unknown>): string[] {
  const removidas: string[] = []
  for (const key of LEGACY_AGENDA_KEYS) {
    if (key in collectedData) {
      removidas.push(key)
      delete collectedData[key]
    }
  }
  return removidas
}

/**
 * Story 87-4 / AC8-b — cópia SEM nenhuma chave de agenda (nem as quatro legadas,
 * nem a nova). É o filtro que o cron `enrich-leads` aplica ao `extracted_data`
 * do Haiku antes do merge.
 *
 * Por que existe, sendo que a chave saiu do `ENRICHMENT_PROMPT`: defesa em
 * profundidade. O Haiku lê a conversa inteira — a fala do lead E a fala da
 * Nicole — e pode devolver a chave por hábito de contexto mesmo sem ela no
 * prompt. Sem este filtro, a segunda esteira continuaria repondo o fato falso e
 * a AC8 seria inexequível: dos 56 estados residuais medidos em 07/08, **39
 * (70 %) têm este cron como ÚLTIMO ESCRITOR**.
 *
 * O `agenda_state` também é removido daqui de propósito: o único escritor
 * legítimo dele é o `processMessage`, que tem a mensagem do lead na mão para
 * citar. O Haiku não tem citação — logo não pode produzir estado.
 */
export function omitAgendaKeys<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  for (const key of LEGACY_AGENDA_KEYS) delete out[key]
  delete out[AGENDA_STATE_KEY]
  return out
}

/**
 * Story 87-4 / AC8-b-(iii) — cópia sem as quatro chaves LEGADAS, preservando o
 * `agenda_state`. É o que o cron aplica ao `collected_data` que já estava
 * gravado: sem isso o cron reescreveria o resíduo de volta a cada passada (ele
 * persiste `{...currentData, ...extraido}`), e a consulta que distingue "a chave
 * sumiu porque a conversa morreu" de "a chave sumiu porque o cron parou de
 * escrever" nunca ficaria verde. Preserva o `agenda_state` porque destruir o
 * estado vivo do turno seria uma regressão de agendamento a cada 30 minutos.
 */
export function omitLegacyAgendaKeys<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  for (const key of LEGACY_AGENDA_KEYS) delete out[key]
  return out
}

/**
 * "Existe fato de agenda?" para o score de qualificação (peso 20) e para o passo
 * seguinte da qualificação. Aceita o formato novo E o legado: uma conversa ainda
 * não tocada continua pontuando como pontuava, e a regressão de score (que muda o
 * gatilho de handoff sem ninguém associar as duas coisas — Risco 2) fica restrita
 * ao turno em que o legado é descartado.
 */
export function hasAgendaFact(collectedData: Record<string, unknown>): boolean {
  if (parseAgendaState(collectedData[AGENDA_STATE_KEY])) return true
  const legado = collectedData.visit_availability
  return legado !== undefined && legado !== null && legado !== ""
}
