status: Done

# Story 12.3 — Haiku Batch Enrichment: Resumo IA + Extracao de Dados via LLM

## Contexto
A Story 12.2 corrigiu o sync regex→leads, mas a abordagem regex continua fragil para variacoes do portugues conversacional. A decisao arquitetural DA-1-REV v2 aprovou uma abordagem **hibrida**: regex como fast-path no pipeline (real-time) + Haiku batch a cada 30min como **correcao e enriquecimento**.

Adicionalmente, a Story 4.8 (Resumo IA Conversa) esta NOT STARTED. Esta story consolida ambos: o cron gera **resumo IA + dados extraidos** numa unica chamada Haiku por conversa ativa.

**Cross-epic:** E3 (Nicole Agent) + E4 (Pipeline/Lead Management)
**PRD refs:** E3-F4 (qualificacao), E4-F8 (resumo IA conversa), E4-F4 (lead fields)
**Decisao arquitetural:** DA-1-REV v2 (aprovada pelo @architect)

## Acceptance Criteria

### Cron Job

- [x] AC1: Cron job roda a cada 30 minutos (Vercel Cron ou Supabase Edge Function)
- [x] AC2: Cron busca todas as conversas com `last_message_at` nos ultimos 30 minutos e `is_ai_active = true`
- [x] AC3: Para cada conversa ativa, carrega as ultimas 20 mensagens (user + assistant) ordenadas por created_at

### Haiku Extraction + Summary

- [x] AC4: Uma unica chamada Haiku (`claude-haiku-4-5-20251001`) por conversa retorna JSON com dois campos:
  - `summary`: string (resumo em portugues, max 200 palavras)
  - `extracted_data`: objeto com campos do lead (mesma interface de `collected_data`)
- [x] AC5: Prompt envia: mensagens recentes + dados ja coletados (`conversation_state.collected_data`) + template JSON dos campos possiveis
- [x] AC6: Campos possiveis no `extracted_data`:
  - name, email, property_interest ("vind"/"yarden"), bedrooms (number), floor ("alto"/"baixo"/"medio"), view ("frente"/"fundos"), garages (number), has_down_payment (boolean), source (lead_source enum: "meta_ads"/"website"/"referral"/"walk_in"), visit_availability (string)
- [x] AC7: Haiku retorna APENAS campos explicitamente mencionados na conversa — prompt instrui "nao inventar dados"

### Sync para Banco

- [x] AC8: `leads.ai_summary` atualizado com o `summary` retornado pelo Haiku
- [x] AC9: Campos de `extracted_data` sincronizados para a tabela `leads` usando a mesma logica de mapping do pipeline (name→name, bedrooms→preferred_bedrooms, etc.)
- [x] AC10: Dados do Haiku **sobrescrevem** dados do regex apenas quando o Haiku retorna um valor nao-null para o campo — nunca apaga dados existentes
- [x] AC11: `interest_level` recalculado do `qualification_score` apos sync (cold/warm/hot)
- [x] AC12: `source` do Haiku usa valores do enum `lead_source` diretamente — sem necessidade de mapping

### Resiliencia

- [x] AC13: Se Haiku falhar (timeout/erro), conversa e pulada e logada — nao bloqueia as demais
- [x] AC14: Cron tem timeout total de 50 segundos (Vercel Cron limit) — processa no maximo N conversas por execucao, overflow vai para proxima execucao
- [x] AC15: Emit event de observabilidade para cada conversa processada (sucesso/falha/skip)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/cron/enrich-leads/route.ts` — Endpoint cron (GET com verificacao de CRON_SECRET)
- `packages/ai/src/flows/haiku-enrichment.ts` — Funcao de enriquecimento (chamada Haiku + parse)

### Arquivos a modificar:
- `vercel.json` (ou `packages/web/vercel.json`) — Adicionar cron schedule
- `packages/ai/src/flows/index.ts` — Exportar nova funcao

### Cron Config (Vercel):
```json
{
  "crons": [{
    "path": "/api/cron/enrich-leads",
    "schedule": "*/30 * * * *"
  }]
}
```

### Prompt Template (AC4-AC7):
```
Voce e um assistente de extracao de dados. Analise a conversa abaixo entre Nicole (assistente de vendas) e um lead interessado em imoveis.

Retorne um JSON com exatamente dois campos:
1. "summary": resumo da conversa em portugues (max 200 palavras, foco em: perfil do lead, interesse, preferencias, objecoes, proximo passo)
2. "extracted_data": objeto com APENAS campos que foram EXPLICITAMENTE mencionados pelo lead na conversa

Campos possiveis em extracted_data:
- name: string (nome do lead)
- email: string
- property_interest: "vind" | "yarden"
- bedrooms: number
- floor: "alto" | "baixo" | "medio"
- view: "frente" | "fundos"
- garages: number
- has_down_payment: true | false
- source: "meta_ads" | "website" | "referral" | "walk_in"
- visit_availability: string (dia/horario mencionado)

REGRAS:
- Retorne APENAS JSON valido, sem markdown
- Em extracted_data, inclua SOMENTE campos que o lead mencionou explicitamente
- NAO invente dados — se o lead nao falou, nao inclua o campo
- Se o lead mencionou interesse em ambos empreendimentos, use o que ele demonstrou MAIS interesse
- Para source, mapeie: instagram/facebook/tiktok → "meta_ads", google/youtube → "website", indicacao/amigo → "referral", placa/stand/passou na frente → "walk_in"

Dados ja coletados: {current_collected_data}

Conversa:
{messages}
```

### API Route Pattern:
```typescript
// GET /api/cron/enrich-leads
// Verificacao: req.headers["authorization"] === `Bearer ${process.env.CRON_SECRET}`
// 1. Query conversas ativas com mensagens nos ultimos 30min
// 2. Para cada: carregar mensagens + collected_data + lead atual
// 3. Chamar Haiku com prompt template
// 4. Parse JSON response
// 5. Sync summary + extracted_data para leads table
// 6. Emit events
```

## Definicao de Pronto
- [ ] Cron executa a cada 30min sem erros
- [ ] ai_summary atualizado para leads com conversas recentes
- [ ] Dados extraidos pelo Haiku corrigem erros do regex (ex: Vind/Yarden)
- [ ] `npm run lint` passa
- [ ] `npm run type-check` passa
- [ ] Testes unitarios para `haiku-enrichment.ts` (parse JSON, fallback, mapping)
- [ ] Endpoint protegido por CRON_SECRET
- [ ] Timeout respeitado (50s max)

## Dependencias
- Depende de: 12.2 (pipeline sync — deve estar mergeada)
- Relacionada: 4.8 (resumo IA — esta story SUBSTITUI 4.8)
- Relacionada: 11.2 (motor followup — pode usar o mesmo cron pattern)

## Estimativa
G (Grande) — 3-4 horas

## Decisoes Arquiteturais
- DA-1-REV v2: Abordagem hibrida regex (fast-path) + Haiku (batch 30min) aprovada pelo @architect
- Custo estimado: ~$1/mes (50-100 chamadas Haiku/dia)
- Sem mudanca de schema — usa campos existentes da tabela leads

## File List
- `packages/ai/src/flows/haiku-enrichment.ts` — Haiku extraction + summary function (AC4-AC7, AC9-AC12)
- `packages/ai/src/flows/haiku-enrichment.test.ts` — 15 unit tests (parse, mapping, scoring)
- `packages/ai/src/flows/index.ts` — Export new functions
- `packages/web/src/app/api/cron/enrich-leads/route.ts` — Cron endpoint (AC1-AC3, AC8, AC13-AC15)
- `packages/web/vercel.json` — Cron schedule config (AC1)
- `docs/stories/active/12-3-haiku-batch-enrichment.md` — Story file

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
