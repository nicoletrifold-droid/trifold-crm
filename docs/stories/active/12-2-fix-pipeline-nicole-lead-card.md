status: Done

# Story 12.2 — Fix Pipeline Nicole → Lead Card Data Sync

## Contexto
O pipeline de qualificacao da Nicole (Story 3.4) extrai dados das conversas com leads via regex e sincroniza com a tabela `leads`. Porem, a investigacao do @analyst revelou **8 gaps criticos** entre o que a Nicole extrai, o que persiste no banco, e o que o lead card/drawer exibe. O resultado: cards com progress bar sempre incompleta, badges invisiveis, campos vazios no drawer mesmo quando os dados foram coletados pela IA.

**Cross-epic:** E3 (Nicole Agent) + E4 (Pipeline/Lead Management) + E7 (Origin Tracking)
**PRD refs:** E3-F4, E4-F1, E4-F3, E4-F4, E4-F5, E7-F2

## Acceptance Criteria

### Fase 1 — Fixes Criticos (P0)

- [x] AC1: `MANDATORY_FIELDS[2].key` corrigido de `"property_interest"` para `"property_interest_id"` em `packages/shared/src/constants/lead-fields.ts` — progress bar no lead card conta empreendimento como preenchido quando `property_interest_id` nao e null
- [x] AC2: `interest_level` derivado automaticamente do `qualification_score` no pipeline sync: cold (<40), warm (40-69), hot (>=70) — campo persistido em `leads.interest_level` a cada mensagem processada
- [x] AC3: `source` sincronizado de `collected_data.source` para `leads.source` com mapa de conversao slug→enum:
  - instagram/facebook/tiktok → `meta_ads`
  - google/youtube → `website`
  - indicacao/amigo/conhecido/boca a boca → `referral`
  - passou_na_frente/placa/stand → `walk_in`
  - valores ja no enum passam direto
- [x] AC4: `visit_scheduled_at` sincronizado em `leads` quando appointment e criado automaticamente pela Nicole — usa a mesma data do appointment inserido

### Fase 2 — Extracao Enriquecida (P0)

- [x] AC5: Email extraido da mensagem do lead via regex (`[\w.+-]+@[\w-]+\.[\w.]+`) e sincronizado para `leads.email`
- [x] AC6: Patterns de nome expandidos para cobrir variacoes PT-BR adicionais:
  - "pode me chamar de X", "me chamam de X"
  - "aqui e X", "aqui o/a X"
  - Nome sozinho na mensagem (quando mensagem curta, <= 3 palavras)
- [x] AC7: Patterns de andar expandidos: "la em cima", "mais alto", "bem alto", "terreo", "andar do meio", "intermediario"
- [x] AC8: Patterns de entrada expandidos: "tenho entrada", "consigo dar entrada", "tenho o valor", "fgts" (true) e "nao tenho entrada", "parcelar tudo", "financiar tudo" (false)
- [x] AC9: Numeros por extenso reconhecidos nos patterns de quartos e garagens: "dois quartos" → 2, "tres vagas" → 3 (cobertura: um/uma ate seis)
- [x] AC10: Source keywords expandidos no `extractCollectedData`: tiktok, youtube, amigo, conhecido, boca a boca — com mapeamento correto para enum

### Fase 3 — Consolidacao Arquitetural (P0/P1)

- [x] AC11: (P0) Multiplos `supabase.from("leads").update()` consolidados em um UNICO batch update por execucao do pipeline — elimina race conditions entre stage_id, assigned_broker_id, ai_summary e demais campos. Prioridade deterministica: handoff > visita > qualificacao
- [ ] AC12: (P1) Lead detail drawer exibe campos extras de `conversation_state.collected_data` (budget_range, family_size, timeline) quando presentes no JSONB, sem necessidade de migration

## Detalhes Tecnicos

### Arquivos a modificar:

**Fase 1:**
- `packages/shared/src/constants/lead-fields.ts` — Fix key mismatch (AC1)
- `packages/ai/src/chat/pipeline.ts` — Adicionar interest_level, source, visit_scheduled_at ao sync (AC2, AC3, AC4)
- `packages/ai/src/flows/qualification.ts` — Corrigir source keywords para enum values (AC3)

**Fase 2:**
- `packages/ai/src/flows/qualification.ts` — Expandir extractCollectedData: email, nome, andar, entrada, numeros extenso, source (AC5-AC10)
- `packages/ai/src/chat/pipeline.ts` — Adicionar sync de email (AC5)

**Fase 3:**
- `packages/ai/src/chat/pipeline.ts` — Refactor sync para batch unico (AC11)
- `packages/web/src/components/leads/lead-detail-drawer.tsx` — Query e display de collected_data extras (AC12)

### Source Enum Mapping (AC3):
```typescript
const SOURCE_SLUG_TO_ENUM: Record<string, string> = {
  instagram: "meta_ads",
  facebook: "meta_ads",
  tiktok: "meta_ads",
  google: "website",
  youtube: "website",
  indicacao: "referral",
  amigo: "referral",
  conhecido: "referral",
  "boca a boca": "referral",
  passou_na_frente: "walk_in",
  placa: "walk_in",
  stand: "walk_in",
}
```

### Portuguese Number Helper (AC9):
```typescript
const PT_NUMBERS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2,
  três: 3, tres: 3, quatro: 4,
  cinco: 5, seis: 6,
}
```

### Batch Update Pattern (AC11):
```typescript
// Acumular todas as mudancas em um unico objeto
const leadPatch: Record<string, unknown> = {}
// ... preencher campos, stage, broker, summary ...
// Prioridade: handoff > visita > qualificacao para stage_id
// UM unico update no final
await supabase.from("leads").update(leadPatch).eq("id", leadId)
```

## Definicao de Pronto
- [x] Todos os AC da Fase 1 passando
- [x] Todos os AC da Fase 2 passando
- [x] AC11 da Fase 3 passando (AC12 pode ser P1 separado)
- [x] `npm run lint` passa sem erros
- [x] `npm run type-check` passa sem erros
- [x] Testes existentes continuam passando
- [x] Lead card progress bar exibe 3/3 quando lead tem name + phone + property_interest_id
- [x] Badge de interest_level visivel no drawer
- [x] Source visivel no drawer apos Nicole extrair da conversa

## Dependencias
- Depende de: 3.4 (qualificacao — ja concluida), 4.1 (kanban — em andamento)
- Relacionada: 4.8 (resumo IA — NOT STARTED, se beneficia dos fixes aqui)
- Relacionada: 7.2 (tracking origem — depende do source sync aqui)

## Estimativa
G (Grande) — 3-4 horas

## Investigacao de Origem
- @analyst (Atlas): Diagnostico completo dos 8 gaps (3 camadas: extracao, sync, exibicao)
- @architect (Aria): Design tecnico com 4 decisoes arquiteturais (DA-1 a DA-4)
- @pm (Morgan): Validacao de escopo contra PRD — GO para 3 fases

## File List
- `packages/shared/src/constants/lead-fields.ts` — Fix key property_interest → property_interest_id (AC1)
- `packages/ai/src/flows/qualification.ts` — Expanded extraction: email, name patterns, floor, entry, PT numbers, source enum mapping (AC3, AC5-AC10)
- `packages/ai/src/chat/pipeline.ts` — Batch update refactor, interest_level sync, source sync, email sync, visit_scheduled_at sync (AC2-AC4, AC5, AC11)
- `docs/stories/active/12-2-fix-pipeline-nicole-lead-card.md` — Story file (this file)

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
