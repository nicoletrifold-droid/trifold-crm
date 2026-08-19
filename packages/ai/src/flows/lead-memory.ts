import { textoDaResposta, ANTHROPIC_MODELS } from "../client/anthropic"
import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  analisarAfirmacaoDeVisita,
  carregarAppointmentsDoLead,
  classificarResumo,
  renderFatoDeAgenda,
  REGRAS_FATO_DE_AGENDA,
  type VeredictoResumo,
} from "./summary-grounding"

/**
 * Story 87-7 — o `event_type` é UM SÓ para as duas esteiras (pipeline e cron), e
 * `metadata.origem` é o que as desempata. Sem ele a contagem da janela de 24 h
 * não se resolve — foi a lição do `origem_do_descarte` da 87-4.
 */
export const EVENTO_RESUMO_SEM_LASTRO = "NICOLE_RESUMO_SEM_LASTRO_BLOQUEADO"

export type OrigemEscritaResumo = "pipeline" | "cron_enrich_leads"

/**
 * Mesma forma do `PipelineEvent` (`chat/pipeline.ts`), declarada aqui por
 * estrutura para não criar o ciclo `pipeline → flows/index → lead-memory →
 * pipeline`. Mesma solução que a 87-3 usou para consumir a `detectAffirmedSlot`.
 */
export interface EventoDeResumo {
  level: "error" | "warn" | "info"
  category: string
  event_type: string
  message: string
  metadata?: Record<string, unknown>
}

/**
 * Updates the lead's running summary/memory after each interaction.
 * Uses Haiku (fast, cheap) to analyze the latest messages and update
 * the summary with new personal info, preferences, and context.
 *
 * This gives Nicole "memory" without loading full chat history every time.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Story 87-7 — DUAS MUDANÇAS NO PROMPT, e nenhuma delas é a garantia.
 *
 * 1. **`fatoDeAgenda`** entra renderizado do banco, com data absoluta. A
 *    verdade sobre compromisso deixa de ser derivada da prosa.
 * 2. **A fala da Nicole continua entrando, agora ROTULADA e desqualificada
 *    como fonte de fato.** Foi ratificado pelo @po em 08/08 manter o
 *    `assistantMessage`: o "próximo passo" é o que o corretor lê no card, e a
 *    remoção não seria nem simétrica — só ESTE escritor recebe a fala dela como
 *    campo separado; o cron `enrich-leads` (92,5 % da população) recebe a
 *    conversa inteira. Remover aqui deixaria o cron contaminando o mesmo campo
 *    com o time acreditando que a fonte foi cortada.
 *
 * Quem garante é a **camada 3** — o guarda de escrita em
 * `atualizarResumoComLastro`. Se o rótulo bastasse, a RN8 ("NÃO invente
 * informações") já teria bastado, e ela falhou em 100 % dos incidentes.
 * ─────────────────────────────────────────────────────────────────────────
 */
export async function updateLeadMemory(params: {
  anthropic: Anthropic
  currentSummary: string | null
  userMessage: string
  assistantMessage: string
  collectedData: Record<string, unknown>
  /** Story 87-7 — bloco `FATO DE AGENDA` vindo de `renderFatoDeAgenda`. */
  fatoDeAgenda?: string | null
}): Promise<string> {
  const { anthropic, currentSummary, userMessage, assistantMessage, collectedData } = params

  const blocoAgenda = params.fatoDeAgenda ? `\n${params.fatoDeAgenda}\n` : ""
  const regrasAgenda = params.fatoDeAgenda ? `\n\n${REGRAS_FATO_DE_AGENDA}` : ""

  const prompt = `Atualize o resumo de um lead imobiliario.

RESUMO ATUAL:
${currentSummary || "Primeiro contato."}

DADOS COLETADOS:
${JSON.stringify(collectedData, null, 2)}
${blocoAgenda}
ULTIMA INTERACAO:
Lead: "${userMessage}"
CONTEXTO (fala da Nicole — NAO e fato; nunca derive daqui compromisso, preco ou promessa): "${assistantMessage}"

REGRAS OBRIGATORIAS:
- Maximo 3 a 4 frases curtas (NUNCA mais que 80 palavras)
- Texto corrido, sem markdown, sem listas, sem bullet points
- Foque em: quem e o lead, o que quer, preferencias do imovel, proximo passo
- Incorpore informacao nova e mantenha as anteriores relevantes
- Se nao houver info nova, retorne o resumo atual sem mudancas
- NUNCA ultrapasse 80 palavras${regrasAgenda}`

  try {
    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODELS.haiku,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    })

    // Story 75-349 — por FILTRO, nunca por posição (thinking pode vir no bloco 0).
    return textoDaResposta(response.content) || currentSummary || ""
  } catch (error) {
    console.error("Error updating lead memory:", error)
    return currentSummary ?? ""
  }
}

export interface ResultadoEscritaResumo {
  gravou: boolean
  veredicto: VeredictoResumo | null
  /** O guarda falhou por erro próprio e o resumo foi gravado como hoje (fail-open). */
  falhouAberto: boolean
}

/**
 * Story 87-7 — o ESCRITOR A com o guarda de escrita.
 *
 * Roda dentro do bloco fire-and-forget do `pipeline.ts` (a cada 5 mensagens),
 * **fora do caminho da resposta ao lead** — a consulta de `appointments` não
 * acrescenta um milissegundo ao turno do WhatsApp.
 *
 * O guarda decide **se grava**, NUNCA o que a Nicole fala. Regenerar/degradar/
 * silenciar a resposta é `W3-3` (Onda 3) e está fora de escopo por escrito.
 *
 * **Fail-open no erro do guarda** (armadilha 4 da story): o `.then()` do
 * pipeline não é aguardado, então um `throw` aqui viraria `unhandledRejection`
 * mudo. Qualquer erro DENTRO do guarda grava como hoje e emite um evento de
 * erro — bloquear por bug do guarda seria pior que o defeito que ele conserta.
 */
export async function atualizarResumoComLastro(params: {
  supabase: SupabaseClient
  anthropic: Anthropic
  leadId: string
  conversationId: string
  orgId?: string | null
  currentSummary: string | null
  userMessage: string
  assistantMessage: string
  collectedData: Record<string, unknown>
  now?: Date
  onEvent?: (e: EventoDeResumo) => void
}): Promise<ResultadoEscritaResumo> {
  const { supabase, anthropic, leadId, conversationId, currentSummary } = params
  const now = params.now ?? new Date()
  // O `emit` é BLINDADO: um `throw` do consumidor de evento não pode derrubar a
  // escrita do resumo. Sem isto a observabilidade viraria fail-closed — o
  // caminho fire-and-forget engoliria a rejeição e o resumo sumiria em silêncio.
  const emitBruto = params.onEvent ?? (() => {})
  const emit = (e: EventoDeResumo) => {
    try {
      emitBruto(e)
    } catch (err) {
      console.error("Evento do guarda de resumo falhou (nao bloqueante):", err)
    }
  }

  let appointments: Awaited<ReturnType<typeof carregarAppointmentsDoLead>> = null
  try {
    appointments = await carregarAppointmentsDoLead(supabase, leadId, now, { orgId: params.orgId })
  } catch {
    appointments = null
  }

  const novoResumo = await updateLeadMemory({
    anthropic,
    currentSummary,
    userMessage: params.userMessage,
    assistantMessage: params.assistantMessage,
    collectedData: params.collectedData,
    fatoDeAgenda: appointments ? renderFatoDeAgenda(appointments, now) : null,
  })

  // Mesma condição do `HEAD` (`if (newSummary)`), de propósito. Curto-circuitar
  // em `novoResumo === currentSummary` pareceria uma economia, mas faria o
  // guarda NUNCA avaliar o caso em que o Haiku devolve o mesmo resumo
  // contaminado — e o evento da AC8 subcontaria em silêncio.
  if (!novoResumo) {
    return { gravou: false, veredicto: null, falhouAberto: false }
  }

  let veredicto: VeredictoResumo = "sem_afirmacao"
  let classificacao: ReturnType<typeof classificarResumo> | null = null
  let falhouAberto = false

  try {
    // Sem `appointments` (consulta falhou) não há como julgar — grava como hoje.
    if (appointments) {
      classificacao = classificarResumo({
        analise: analisarAfirmacaoDeVisita(novoResumo, now),
        appointmentsDoLead: appointments,
        now,
      })
      veredicto = classificacao.veredicto
    }
  } catch (err) {
    falhouAberto = true
    emit({
      level: "error",
      category: "ai",
      event_type: `${EVENTO_RESUMO_SEM_LASTRO}_ERRO`,
      message: `Guarda do resumo falhou; resumo gravado como hoje (fail-open): ${String(err)}`,
      metadata: { lead_id: leadId, conversation_id: conversationId, origem: "pipeline" },
    })
  }

  if (!falhouAberto && (veredicto === "sem_lastro" || veredicto === "indeterminado")) {
    emit({
      level: veredicto === "sem_lastro" ? "warn" : "info",
      category: "ai",
      event_type: EVENTO_RESUMO_SEM_LASTRO,
      message:
        veredicto === "sem_lastro"
          ? "Resumo afirmava visita sem appointment correspondente — NAO gravado."
          : "Resumo afirma visita sem dia identificavel — gravado (indeterminado).",
      metadata: {
        lead_id: leadId,
        conversation_id: conversationId,
        origem: "pipeline" satisfies OrigemEscritaResumo,
        veredicto,
        citacao_curta: classificacao?.citacao ?? null,
        dia_afirmado: classificacao?.diaAfirmado ?? null,
        appointment_id_proximo: classificacao?.appointmentIdProximo ?? null,
        divergencia_min: classificacao?.divergenciaMin ?? null,
      },
    })
  }

  if (!falhouAberto && veredicto === "sem_lastro") {
    // O resumo ANTERIOR permanece exatamente como está. A story impede escrita;
    // nunca apaga.
    return { gravou: false, veredicto, falhouAberto: false }
  }

  await supabase.from("leads").update({ ai_summary: novoResumo }).eq("id", leadId)
  return { gravou: true, veredicto, falhouAberto }
}
