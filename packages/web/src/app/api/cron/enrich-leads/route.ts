import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logEvent } from "@web/lib/logger"

const CRON_SECRET = process.env.CRON_SECRET
const MAX_CONVERSATIONS_PER_RUN = 20
const ENRICHMENT_WINDOW_MINUTES = 30

/**
 * Cron: Enrich leads with Haiku batch extraction.
 * GET /api/cron/enrich-leads
 *
 * Runs every 30 minutes. For each conversation with recent activity:
 * 1. Load last 20 messages
 * 2. Call Haiku for summary + structured data extraction
 * 3. Sync extracted data + ai_summary to leads table
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[ENRICH_CRON] CRON_SECRET not configured")
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { createAnthropicClient } = await import("@trifold/ai")
  const { enrichLeadFromConversation, mapExtractedDataToLeadFields, stripAlreadyFilledPerfil, stripManualInterestLevel, omitAgendaKeys, omitLegacyAgendaKeys, LEGACY_AGENDA_KEYS, calculateQualificationScore, analisarAfirmacaoDeVisita, carregarAppointmentsDoLead, classificarResumo, renderFatoDeAgenda, EVENTO_RESUMO_SEM_LASTRO } = await import("@trifold/ai")
  const anthropic = createAnthropicClient()

  const cutoff = new Date(Date.now() - ENRICHMENT_WINDOW_MINUTES * 60 * 1000).toISOString()

  // AC2: Find conversations with recent activity that haven't been enriched yet
  const { data: rawConversations, error: convError } = await supabase
    .from("conversations")
    .select("id, lead_id, org_id, last_message_at, last_enriched_at")
    .eq("is_ai_active", true)
    .gte("last_message_at", cutoff)
    .limit(MAX_CONVERSATIONS_PER_RUN)

  if (convError) {
    console.error("[ENRICH_CRON] Error fetching conversations:", convError.message)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  // Filter: only process if last_message_at > last_enriched_at (or never enriched)
  const conversations = (rawConversations ?? []).filter((c) => {
    if (!c.last_enriched_at) return true // never enriched
    return new Date(c.last_message_at) > new Date(c.last_enriched_at)
  })

  if (conversations.length === 0) {
    return NextResponse.json({ processed: 0, skipped: rawConversations?.length ?? 0, message: "No new messages to enrich" })
  }

  const results = { processed: 0, skipped: 0, failed: 0 }

  for (const conv of conversations) {
    try {
      // AC3: Load last 20 messages
      //
      // Story 87-8 (deploy B) — até aqui este comentário AFIRMAVA O CONTRÁRIO do
      // que o código fazia: `ascending: true` + `limit(20)` pega as 20 mensagens
      // MAIS ANTIGAS. Ou seja, `ai_summary`, `collected_data`, o score, o Calor e
      // os campos de perfil de toda conversa longa eram extraídos do COMEÇO da
      // conversa. Não era só a Nicole respondendo ao passado: o CRM inteiro
      // acreditava no passado.
      //
      // É a MESMA linha de `loadConversationHistory` (`pipeline.ts`), e é a
      // terceira story seguida em que esta esteira foi a esquecida (87-4: último
      // escritor de 70 % dos estados residuais; 87-7: toca 92,5 % dos resumos).
      //
      // A ordem de leitura é decrescente e o array é revertido logo abaixo — a
      // entrega ao Haiku continua CRONOLÓGICA. O 2º `.order("id")` é desempate
      // determinístico para `created_at` repetido (mesmo milissegundo), senão a
      // fatia de corte oscila e o teste fica intermitente.
      const { data: messagesDesc } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conv.id)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(20)

      const messages = messagesDesc ? [...messagesDesc].reverse() : null

      if (!messages || messages.length < 2) {
        results.skipped++
        continue
      }

      // Load current collected_data from conversation_state
      const { data: state } = await supabase
        .from("conversation_state")
        .select("collected_data")
        .eq("conversation_id", conv.id)
        .single()

      const currentData = (state?.collected_data as Record<string, unknown>) ?? {}

      // Load current lead data for merge logic (Story 75-183: + campos de perfil p/ o guard)
      const { data: currentLead } = await supabase
        .from("leads")
        .select("name, email, preferred_bedrooms, preferred_floor, preferred_view, preferred_garage_count, has_down_payment, source, qualification_score, property_interest_id, profissao, renda_familiar, filhos, estado_civil, faixa_etaria, situacao_moradia, cidade_bairro, tem_pet, interest_level_manual")
        .eq("id", conv.lead_id)
        .single()

      // Story 87-7 — a verdade do banco, UMA consulta por conversa processada
      // (máx. 20 por rodada). Nunca N+1 por mensagem.
      //
      // Fail-open declarado: se a consulta falhar, `appointments` é `null`, o
      // bloco não entra no prompt e o guarda não julga — o cron grava como hoje.
      // Bloquear resumo por falha de infraestrutura seria pior que o defeito.
      const agora = new Date()
      const appointmentsDoLead = await carregarAppointmentsDoLead(
        supabase,
        conv.lead_id,
        agora,
        { orgId: conv.org_id }
      ).catch(() => null)

      // AC4-AC7: Call Haiku for extraction + summary
      const enrichment = await enrichLeadFromConversation(anthropic, {
        messages: messages as Array<{ role: string; content: string }>,
        currentCollectedData: currentData,
        fatoDeAgenda: appointmentsDoLead ? renderFatoDeAgenda(appointmentsDoLead, agora) : null,
      })

      if (!enrichment) {
        console.warn(`[ENRICH_CRON] Failed to parse Haiku response for conversation ${conv.id}`)
        results.failed++
        continue
      }

      // Story 87-4 / B2 — UM DONO SÓ PARA OS 20 PONTOS DE AGENDA.
      //
      // Antes, o `collected_data` persistido e o `qualification_score` gravado em
      // `leads` eram calculados a partir de objetos DIFERENTES: o score saía de
      // `{...currentData, ...extracted}` (com as chaves de agenda) e o estado
      // persistido saía do merge filtrado (sem elas). Dois escritores respondendo
      // coisas diferentes sobre o mesmo fato, com o cron sobrescrevendo o lead a
      // cada 30 min e o pipeline recalculando a cada turno.
      //
      // Agora os dois saem do MESMO objeto — o `collected_data` que será
      // efetivamente gravado — e a pergunta "existe fato de agenda?" é respondida
      // pela MESMA função dos dois lados (`hasAgendaFact`, dentro do
      // `calculateQualificationScore`). Se o pipeline concede os 20 pontos, o cron
      // concede; se não concede, o cron também não.
      const extraidoSemAgenda = omitAgendaKeys(enrichment.extracted_data)

      // Update conversation_state.collected_data with enriched data (AC8-b):
      //   • `omitAgendaKeys` no que veio do Haiku — ele lê a conversa inteira (a
      //     fala do lead E a da Nicole) e não tem citação para oferecer; fato de
      //     agenda sem citação de mensagem `role='user'` não vira estado. A chave
      //     já saiu do `ENRICHMENT_PROMPT`; este filtro é a defesa em profundidade.
      //   • `omitLegacyAgendaKeys` no que já estava gravado — sem isso o cron
      //     reescreveria o resíduo de volta a cada passada (ele é o ÚLTIMO
      //     ESCRITOR de 70 % dos 56 estados residuais medidos em 07/08).
      //     O `agenda_state` do turno é PRESERVADO: só o legado morre.
      const mergedCollectedData = {
        ...omitLegacyAgendaKeys(currentData),
        ...extraidoSemAgenda,
      }

      // Story 87-4 — O RECIBO DO DESCARTE, TAMBÉM POR AQUI.
      //
      // Achado do re-gate do @qa: o `processMessage` retorna FORA DO EXPEDIENTE
      // antes de descartar o legado (`pipeline.ts`, retorno de off-hours), mas
      // avança o `last_message_at`. O cron então pega a conversa, apaga o legado
      // pelo `omitLegacyAgendaKeys`, regrava score/status/Calor — e no turno
      // seguinte já não há chave para o pipeline encontrar. O evento nunca sairia.
      //
      // Isso importa mais do que parece: a decisão de ATUALIZAR os leads (em vez
      // de preservar os 20 pontos) foi tomada porque a queda seria auditável.
      // Sem recibo neste caminho, parte dessa decisão fica sem cobertura e o
      // comercial não teria como explicar por que aqueles leads mudaram de faixa.
      // Dimensionado: 37 dos 56 estados residuais são alcançáveis pelo cron e
      // ~25 % das mensagens de lead chegam fora de 8h–18h.
      //
      // Mesmo `event_type` e mesmo formato de metadata do pipeline, de propósito:
      // a contagem da AC8 é UMA só, some quem apagar.
      const legadoDescartado = LEGACY_AGENDA_KEYS.filter((k) => k in currentData)
      if (legadoDescartado.length > 0) {
        logEvent({
          level: "info",
          category: "cron",
          event_type: "NICOLE_AGENDA_STATE_LEGADO_DESCARTADO",
          message: `Chave(s) de agenda do formato antigo encontradas e apagadas: ${legadoDescartado.join(", ")}`,
          org_id: conv.org_id ?? undefined,
          metadata: {
            lead_id: conv.lead_id ?? null,
            conversation_id: conv.id,
            chaves: legadoDescartado,
            score_antes: calculateQualificationScore(currentData),
            score_depois: calculateQualificationScore(mergedCollectedData),
            origem_do_descarte: "cron_enrich_leads",
          },
        })
      }

      // AC8-AC12: Sync to leads table — o score sai do estado que será PERSISTIDO.
      const leadPatch = mapExtractedDataToLeadFields(
        extraidoSemAgenda,
        mergedCollectedData
      )

      // Story 87-7 — O GUARDA DE ESCRITA, NA SEGUNDA ESTEIRA.
      //
      // O "Always update" acabou aqui, e só para esta chave. Este cron é o
      // escritor DOMINANTE do `ai_summary`: 209 dos 226 leads com resumo (92,5 %)
      // têm conversa que ele já enriqueceu, e ele escreve INCONDICIONALMENTE a
      // cada 30 min, sobre a conversa inteira — com a fala da Nicole dentro
      // (`haiku-enrichment.ts`). Consertar só o `pipeline.ts` deixaria o defeito
      // vivo em quase toda a população, que é o erro que a 87-4 já cometeu uma
      // vez e teve de corrigir com a `AC8-b`.
      //
      // O bloqueio é CIRÚRGICO: só a chave `ai_summary` fica de fora do patch.
      // Perfil, score e Calor seguem normalmente — o resumo congelado nunca é
      // pior que hoje, mas um lead que para de pontuar seria.
      let veredictoResumo: string | null = null
      let classificacaoResumo: ReturnType<typeof classificarResumo> | null = null
      try {
        if (appointmentsDoLead) {
          classificacaoResumo = classificarResumo({
            analise: analisarAfirmacaoDeVisita(enrichment.summary, agora),
            appointmentsDoLead,
            now: agora,
          })
          veredictoResumo = classificacaoResumo.veredicto
        }
      } catch (err) {
        // Fail-open: erro DENTRO do guarda grava como hoje (armadilha 4).
        veredictoResumo = null
        console.error(`[ENRICH_CRON] Guarda do resumo falhou (fail-open) em ${conv.id}:`, err)
      }

      // O recibo em `try` SEPARADO, de propósito: falha ao registrar o evento
      // não pode desligar o guarda. Juntos, um erro no `logEvent` faria o resumo
      // sem lastro ser gravado — a observabilidade derrubando a garantia.
      if (veredictoResumo === "sem_lastro" || veredictoResumo === "indeterminado") {
        try {
          logEvent({
            level: veredictoResumo === "sem_lastro" ? "warn" : "info",
            category: "ai",
            event_type: EVENTO_RESUMO_SEM_LASTRO,
            message:
              veredictoResumo === "sem_lastro"
                ? "Resumo afirmava visita sem appointment correspondente — NAO gravado."
                : "Resumo afirma visita sem dia identificavel — gravado (indeterminado).",
            org_id: conv.org_id ?? undefined,
            metadata: {
              lead_id: conv.lead_id ?? null,
              conversation_id: conv.id,
              origem: "cron_enrich_leads",
              veredicto: veredictoResumo,
              citacao_curta: classificacaoResumo?.citacao ?? null,
              dia_afirmado: classificacaoResumo?.diaAfirmado ?? null,
              appointment_id_proximo: classificacaoResumo?.appointmentIdProximo ?? null,
              divergencia_min: classificacaoResumo?.divergenciaMin ?? null,
            },
          })
        } catch (err) {
          console.error(`[ENRICH_CRON] logEvent do guarda falhou em ${conv.id}:`, err)
        }
      }

      if (veredictoResumo !== "sem_lastro") {
        leadPatch.ai_summary = enrichment.summary
      }

      // Story 75-183 — guard "não sobrescrever humano": campo de PERFIL já preenchido
      // no lead (pelo corretor ou por extração anterior) nunca é atualizado pela IA.
      // Score/summary continuam dinâmicos — o guard é só p/ os campos de perfil.
      stripAlreadyFilledPerfil(leadPatch, (currentLead ?? {}) as Record<string, unknown>)

      // Story 75-237 — temperatura escolhida por humano manda: a IA não desfaz.
      stripManualInterestLevel(leadPatch, currentLead as Record<string, unknown> | null)

      // AC10: Resolve property_interest to property_interest_id
      if (extraidoSemAgenda.property_interest) {
        const interest = (extraidoSemAgenda.property_interest as string).toLowerCase()
        const { data: matchedProperty } = await supabase
          .from("properties")
          .select("id")
          .eq("org_id", conv.org_id)
          .eq("is_active", true)
          .or(`slug.eq.${interest},name.ilike.%${interest}%`)
          .limit(1)
          .maybeSingle()

        if (matchedProperty) {
          leadPatch.property_interest_id = matchedProperty.id
        }
      }

      // Apply patch — only non-null fields (AC10)
      const cleanPatch: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(leadPatch)) {
        if (value !== null && value !== undefined) {
          cleanPatch[key] = value
        }
      }

      if (Object.keys(cleanPatch).length > 0) {
        await supabase.from("leads").update(cleanPatch).eq("id", conv.lead_id)
      }

      await supabase
        .from("conversation_state")
        .update({ collected_data: mergedCollectedData })
        .eq("conversation_id", conv.id)

      // Mark conversation as enriched — prevents reprocessing until new messages arrive
      await supabase
        .from("conversations")
        .update({ last_enriched_at: new Date().toISOString() })
        .eq("id", conv.id)

      // AC15: Log success
      console.log(`[ENRICH_CRON] Enriched lead ${conv.lead_id}: ${Object.keys(enrichment.extracted_data).join(", ")}`)
      results.processed++
    } catch (error) {
      // AC13: Skip failed conversations, don't block others
      console.error(`[ENRICH_CRON] Error processing conversation ${conv.id}:`, error)
      results.failed++
    }
  }

  return NextResponse.json({
    ...results,
    total: conversations.length,
  })
}
