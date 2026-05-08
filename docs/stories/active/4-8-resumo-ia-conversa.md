status: Done

# Story 4.8 — Resumo IA da Conversa

## Contexto
O resumo IA e um dos maiores diferenciais do CRM — em vez de o corretor ler 30+ mensagens para entender o lead, ele ve um resumo automatico com preferencias, perguntas, objecoes e proximos passos recomendados. O resumo e gerado pelo Claude (Haiku para custo baixo) e atualizado em 3 momentos: apos qualificacao completar, no momento do handoff, e sob demanda (botao "Regenerar resumo"). O resumo e salvo em `leads.ai_summary`.

## Acceptance Criteria
- [ ] AC1: Funcao `generateLeadSummary(leadId)` gera resumo a partir das mensagens da conversa + dados coletados
- [ ] AC2: Resumo inclui secoes estruturadas:
  - **Lead:** Nome, contato
  - **Interesse:** Empreendimento, tipologia, preferencias
  - **Qualificacao:** Score, tem entrada, perfil financeiro
  - **Perguntas feitas:** Lista das duvidas do lead
  - **Objecoes:** Pontos de resistencia identificados
  - **Proximos passos:** Recomendacao para o corretor
- [ ] AC3: Resumo gerado automaticamente quando qualificacao atinge score >= 50
- [ ] AC4: Resumo atualizado automaticamente no momento do handoff (Story 3.10)
- [ ] AC5: Botao "Regenerar resumo" no detalhe do lead (admin/supervisor only) chama a API e atualiza
- [ ] AC6: API route `POST /api/leads/[id]/summary` gera e salva o resumo
- [ ] AC7: Resumo exibido no detalhe do lead (Story 4.5) como card destacado no topo
- [ ] AC8: Resumo usa Claude Haiku (claude-haiku-4-20250414) para manter custo baixo
- [ ] AC9: Resumo limitado a 500 tokens max (conciso e acionavel)
- [ ] AC10: Se nao ha mensagens suficientes (<3 mensagens), exibe "Conversa em andamento — resumo sera gerado automaticamente"

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/ai/src/flows/summary-generator.ts` — Geracao de resumo (expandir da Story 3.10)
- `packages/web/src/app/api/leads/[id]/summary/route.ts` — POST (gerar/regenerar)
- `packages/web/src/components/leads/lead-summary.tsx` — Componente de exibicao

### Prompt de geracao:
```typescript
const SUMMARY_PROMPT = `
Voce e um assistente de CRM imobiliario. Gere um RESUMO EXECUTIVO para o corretor sobre este lead.

FORMATO OBRIGATORIO (Markdown):
## Lead
Nome: [nome]
Score: [score]/100

## Interesse
- Empreendimento: [qual]
- Tipologia: [preferencia]
- Quartos: [X] | Andar: [preferencia] | Vista: [preferencia]
- Garagem: [X vagas]
- Entrada disponivel: [sim/nao/nao informou]

## Perguntas do Lead
- [lista]

## Objecoes Identificadas
- [lista, ou "Nenhuma objecao identificada"]

## Proximos Passos
- [recomendacao para o corretor, 1-3 items]

DADOS:
Preferencias coletadas: ${JSON.stringify(state.collected_data)}
Ultimas mensagens: ${recentMessages}
Score: ${lead.qualification_score}
`;
```

### Trigger automatico:
```typescript
// Chamar apos qualificacao atingir threshold
if (newScore >= 50 && (!lead.ai_summary || previousScore < 50)) {
  await generateAndSaveSummary(leadId);
}

// Chamar no handoff (Story 3.10 ja faz isso)
```

### Referencia agente-linda:
- Adaptar summary generator de `~/agente-linda/packages/ai/src/flows/` (se existir)
- Reusar pattern de chamada Claude com Haiku

## Dependencias
- Depende de: 4.7 (mensagens acessiveis), 3.4 (qualificacao gera score), 3.10 (handoff gera resumo)
- Bloqueia: 6.5 (resumo IA no painel do corretor)

## Estimativa
M (Media) — 2-3 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
