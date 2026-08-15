/**
 * Story 87-5 — O CARREGADOR DE HISTÓRICO, UM SÓ, COM TRÊS PAPÉIS.
 *
 * Por que este arquivo existe (e por que a função saiu de `pipeline.ts`):
 *
 *  1. **A fala do corretor é o maior volume dos três e era jogada fora.** Medido
 *     em 30 dias de produção (15/08): `broker` **1.288** mensagens em 305
 *     conversas, contra `user` 1.042/194 e `assistant` 588/144. Dois leitores a
 *     descartavam com o MESMO `.in("role", ["user","assistant"])` —
 *     `pipeline.ts` e o cron `enrich-leads`. O corretor falava mais que a Nicole,
 *     no dobro de conversas, e nem ela nem o extrator viam uma linha disso.
 *
 *  2. **A fala humana de transição já entrava, e ela lia como se fosse DELA.**
 *     `send-message/route.ts:220` grava a transição do handoff — escrita por
 *     humano — com `role: "assistant"`. São **127** mensagens em 60 dias. Como o
 *     carregador só selecionava `role, content`, o `metadata.is_transition` nem
 *     chegava: não havia como distinguir. Aqui a leitura **normaliza** essa
 *     mensagem para `broker`. A GRAVAÇÃO não é tocada — o conserto de origem é
 *     decisão de modelo de dados e está em `docs/backlog.md`.
 *
 *  3. **Uma função, uma regra.** Se o `enrich-leads` reimplementar o filtro, o
 *     defeito volta pela metade — a lição da 75-268 (guarda aplicada a um
 *     caminho e não ao outro). A função era privada de `pipeline.ts` e o cron
 *     vive em `packages/web`; extrair para cá é a mesma manobra que a 87-3 fez
 *     com o grounding. Mora aqui e não em `pipeline.ts` para o cron não ter de
 *     arrastar o pipeline inteiro (Anthropic SDK + todos os flows) para dentro
 *     de uma esteira que só quer 20 linhas de `messages`.
 *
 * **Papel interno ≠ papel da API.** `Anthropic.MessageParam.role` só aceita
 * `"user" | "assistant"`. Internamente existem TRÊS papéis (os consumidores
 * precisam distinguir); na fronteira da API a fala do corretor vai como
 * `assistant` com o `content` prefixado pelo rótulo textual. Mapear para `user`
 * faria a Nicole acreditar que **o lead** disse "entrada de 35 mil" — é
 * estritamente pior que ela achar que foi ela.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Os três papéis que existem numa conversa. O tipo é largo de propósito: ele é
 * a REDE SECUNDÁRIA que faz o compilador acender nos consumidores que atribuem
 * (não nos que comparam — ver o cabeçalho de `lastAssistantMsg`).
 */
export type ConversationRole = "user" | "assistant" | "broker"

/** Papéis que compõem o histórico de conversa. UMA lista, dois leitores. */
export const ROLES_DE_HISTORICO: ConversationRole[] = ["user", "assistant", "broker"]

/**
 * "O nosso lado" — Nicole e corretor. É o referente do `buildNoReintroContext`
 * (AC4) e do sinal de fala fora da janela. Constante nomeada e não literal
 * inline: a AC7 desta story pede que uma lista de papéis de histórico exista em
 * UM lugar só, e um literal solto aqui seria a segunda.
 */
export const PAPEIS_DO_NOSSO_LADO: ConversationRole[] = ["assistant", "broker"]

export interface ConversationMessage {
  role: ConversationRole
  content: string
  created_at?: string
  /**
   * Primeiro nome do corretor, resolvido NA LEITURA. Só existe em
   * `role === "broker"`, e pode ser `null` — o rótulo cai em `[CORRETOR HUMANO]`
   * sem nome. **Nunca falhar a conversa por causa do nome.**
   */
  brokerName?: string | null
}

/**
 * Story 87-8 (`CR-1`) — o que o carregador devolve além das mensagens. Tudo
 * aqui só é preenchido quando a janela TRUNCOU.
 */
export interface HistoricoCarregado {
  /** A CAUDA da conversa, em ordem cronológica crescente. */
  messages: ConversationMessage[]
  /** `rows.length === limit` — a conversa não coube na janela. */
  truncou: boolean
  /** O limite configurado. */
  limite: number
  /**
   * Total de mensagens de histórico na conversa (só quando truncou).
   *
   * Story 87-5 — passa a contar os TRÊS papéis, pela mesma `ROLES_DE_HISTORICO`
   * da janela. Contar dois enquanto a janela carrega três publicaria um
   * `total_na_conversa` menor que o próprio `limite` em conversa truncada.
   */
  totalNaConversa: number | null
  maisAntigaCarregada: string | null
  maisRecenteCarregada: string | null
  /**
   * O NOSSO LADO já falou nesta conversa, mesmo que FORA da janela carregada.
   *
   * Story 87-8 criou o sinal como `nicoleFalouForaDaJanela`; a 87-5 alargou o
   * referente junto com o `buildNoReintroContext`: agora é "Nicole **ou**
   * corretor". Renomear em vez de manter o nome antigo é deliberado — um campo
   * que diz "nicole" e responde "nosso lado" é a colinearidade que já custou
   * caro nesta família de stories.
   *
   * Direção RESTRITIVA: o sinal só pode SUPRIMIR uma reapresentação, nunca
   * provocar uma.
   */
  nossoLadoFalouForaDaJanela: boolean
}

/** Prefixo do rótulo. Exportado para os testes de vazamento (AC5-iii). */
export const ROTULO_CORRETOR_PREFIXO = "[CORRETOR HUMANO"

/** "Valeria Souza" → "Valeria". Mesma regra do `senderFirstName` da web
 *  (`lib/broker/message-signature.ts`), reimplementada porque `packages/web`
 *  depende de `packages/ai`, e não o contrário. */
export function primeiroNome(nome: string | null | undefined): string {
  if (typeof nome !== "string") return ""
  return nome.trim().split(/\s+/)[0] ?? ""
}

/** `[CORRETOR HUMANO — Odair]` ou, sem nome, `[CORRETOR HUMANO]`. */
export function rotuloDeCorretor(nome?: string | null): string {
  const primeiro = primeiroNome(nome)
  return primeiro ? `${ROTULO_CORRETOR_PREFIXO} — ${primeiro}]` : `${ROTULO_CORRETOR_PREFIXO}]`
}

/**
 * A fala do corretor, prefixada. Formato FECHADO (a story o define para não ser
 * inventado na implementação):  `[CORRETOR HUMANO — {primeiro_nome}]: {content}`
 *
 * O rótulo é montado na FRONTEIRA, nunca persistido em `messages`.
 */
export function prefixarFalaDeCorretor(msg: ConversationMessage): string {
  return `${rotuloDeCorretor(msg.brokerName)}: ${msg.content}`
}

/** Existe fala de corretor na janela? Aciona a instrução da RN4 (AC5). */
export function temFalaDeCorretor(history: ConversationMessage[]): boolean {
  return history.some((m) => m.role === "broker")
}

/**
 * A FRONTEIRA. `Anthropic.MessageParam.role` só aceita dois papéis: o corretor
 * vai como `assistant` (o nosso lado da conversa) com o `content` rotulado.
 *
 * Turnos `assistant` consecutivos já acontecem no `HEAD` (a Nicole divide
 * respostas) e funcionam em produção — o mapeamento não introduz padrão novo.
 */
export function toAnthropicHistory(
  history: ConversationMessage[]
): Array<{ role: "user" | "assistant"; content: string }> {
  return history.map((msg) =>
    msg.role === "broker"
      ? { role: "assistant" as const, content: prefixarFalaDeCorretor(msg) }
      : { role: msg.role, content: msg.content }
  )
}

interface LinhaBruta {
  role: string
  content: string
  created_at?: string
  metadata?: Record<string, unknown> | null
}

function metadataDe(linha: LinhaBruta): Record<string, unknown> {
  const m = linha.metadata
  return m && typeof m === "object" ? m : {}
}

function textoOuNulo(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/**
 * Normaliza os papéis e resolve o nome do corretor.
 *
 * A ordem de resolução do nome é a medida em produção (15/08, 30 dias, 1.288
 * mensagens `role='broker'`), e NÃO a que a v0.1 da story propunha:
 *
 * ```
 *   metadata.signed_as   780 (61 %)  ← já É o primeiro nome, custo ZERO
 *   metadata.sent_by   1.126 (87 %)  ← exige users.name, UMA consulta em LOTE
 *   metadata.broker_id     0 (0 %)   ← só existe nas 127 TRANSIÇÕES
 *   sem metadata           0
 * ```
 *
 * Usar `broker_id` como fonte primária (a proposta original) faria o nome sair
 * vazio nas 1.288 e o rótulo cair em `[CORRETOR HUMANO]` em 100 % dos casos, em
 * silêncio — falha silenciosa dentro de uma story cujo tema é não errar em
 * silêncio.
 *
 * **UMA consulta em lote, nunca N+1.** Isto roda no caminho quente do turno.
 */
async function normalizarLinhas(
  supabase: SupabaseClient,
  linhas: LinhaBruta[]
): Promise<ConversationMessage[]> {
  interface Parcial {
    role: ConversationRole
    content: string
    created_at?: string
    nome: string | null
    userId: string | null
  }

  const parciais: Parcial[] = linhas.map((linha) => {
    const meta = metadataDe(linha)
    const ehTransicao = linha.role === "assistant" && meta.is_transition === true
    // A NORMALIZAÇÃO. Fecha o Defeito 2 sem tocar na gravação.
    const role: ConversationRole = ehTransicao
      ? "broker"
      : (linha.role as ConversationRole)

    if (role !== "broker") {
      return { role, content: linha.content, created_at: linha.created_at, nome: null, userId: null }
    }
    return {
      role,
      content: linha.content,
      created_at: linha.created_at,
      // `signed_as` primeiro: já é o primeiro nome, sem consulta nenhuma.
      nome: textoOuNulo(meta.signed_as),
      // `sent_by` nas reais; `broker_id` só nas transições normalizadas.
      userId: textoOuNulo(meta.sent_by) ?? textoOuNulo(meta.broker_id),
    }
  })

  const idsParaResolver = [
    ...new Set(
      parciais
        .filter((p) => p.role === "broker" && !p.nome && p.userId)
        .map((p) => p.userId as string)
    ),
  ]

  const nomePorId = new Map<string, string>()
  if (idsParaResolver.length > 0) {
    // Fail-open declarado: se a consulta falhar, o rótulo sai sem nome. Nenhuma
    // conversa pode quebrar por causa de um nome.
    const { data } = await supabase.from("users").select("id, name").in("id", idsParaResolver)
    for (const u of (data ?? []) as Array<{ id: string; name: string | null }>) {
      const primeiro = primeiroNome(u.name)
      if (primeiro) nomePorId.set(u.id, primeiro)
    }
  }

  return parciais.map((p) => {
    if (p.role !== "broker") {
      return { role: p.role, content: p.content, created_at: p.created_at }
    }
    const nome = p.nome ?? (p.userId ? nomePorId.get(p.userId) ?? null : null)
    return { role: p.role, content: p.content, created_at: p.created_at, brokerName: nome }
  })
}

/**
 * Story 87-8 — a CAUDA, não a cabeça.
 *
 * O defeito: `ascending: true` + `limit(20)` devolvia as 20 mensagens MAIS
 * ANTIGAS. Em conversa longa a Nicole respondia com precisão a um contexto
 * vencido. A saída continua CRONOLÓGICA CRESCENTE.
 *
 * Story 87-5 — a janela passa a ter TRÊS papéis. Decisão registrada na T0: as
 * **162** mensagens-placeholder do corretor (`[Mídia] Planta`, `[Áudio]`, …) de
 * 1.288 **ENTRAM**; ver o Dev Agent Record para o porquê (média de 0,53 por
 * conversa, e 74 % delas carregam rótulo semântico do que já foi enviado).
 */
export async function loadConversationHistory(
  supabase: SupabaseClient,
  conversationId: string,
  limit: number = 20
): Promise<HistoricoCarregado> {
  const vazio: HistoricoCarregado = {
    messages: [],
    truncou: false,
    limite: limit,
    totalNaConversa: null,
    maisAntigaCarregada: null,
    maisRecenteCarregada: null,
    nossoLadoFalouForaDaJanela: false,
  }

  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at, metadata")
    .eq("conversation_id", conversationId)
    .in("role", ROLES_DE_HISTORICO)
    .order("created_at", { ascending: false })
    // Armadilha 1 da 87-8: duas mensagens no mesmo milissegundo fariam a fatia
    // de corte entrar/sair de forma não determinística e produzir teste
    // intermitente. O desempate por `id` é arbitrário mas ESTÁVEL.
    .order("id", { ascending: false })
    .limit(limit)

  if (error || !data) {
    return vazio
  }

  const linhas = data as LinhaBruta[]
  // Armadilha 2: `.reverse()` muta. `data` vem do driver — devolver a cópia
  // deixa o teste honesto e evita efeito colateral no chamador.
  const messages = await normalizarLinhas(supabase, [...linhas].reverse())
  const truncou = linhas.length === limit

  if (!truncou) {
    return { ...vazio, messages }
  }

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .in("role", ROLES_DE_HISTORICO)

  // Só quando a cauda inteira é do lead.
  let nossoLadoFalouForaDaJanela = false
  if (!messages.some((m) => PAPEIS_DO_NOSSO_LADO.includes(m.role))) {
    const { count: falasNossas } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .in("role", PAPEIS_DO_NOSSO_LADO)
    nossoLadoFalouForaDaJanela = (falasNossas ?? 0) > 0
  }

  return {
    messages,
    truncou,
    limite: limit,
    totalNaConversa: count ?? null,
    maisAntigaCarregada: messages[0]?.created_at ?? null,
    maisRecenteCarregada: messages[messages.length - 1]?.created_at ?? null,
    nossoLadoFalouForaDaJanela,
  }
}
