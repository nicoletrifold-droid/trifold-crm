status: Done

# Story 3.4 — Qualificacao de Leads

## Contexto
A qualificacao e o core do valor da Nicole. Ela coleta dados do lead de forma PROGRESSIVA e NATURAL durante a conversa — nunca como formulario. Os dados coletados determinam o score de qualificacao, que por sua vez define quando fazer handoff ao corretor. A regra principal: quanto mais qualificado, mais valioso o lead para o corretor.

## Acceptance Criteria
- [x] AC1: Nicole coleta progressivamente (na ordem natural da conversa, nao sequencial forcado):
  - Nome do lead
  - Empreendimento de interesse (Vind/Yarden)
  - Numero de quartos desejado
  - Preferencia de andar (alto/baixo/indiferente)
  - Preferencia de vista
  - Numero de garagens
  - Tem entrada disponivel (obrigatorio para Yarden — story 3.5)
  - Como conheceu a Trifold
  - Disponibilidade para visita
- [x] AC2: `conversation_state.collected_data` e atualizado a cada dado coletado (jsonb)
- [x] AC3: `conversation_state.qualification_step` reflete a etapa atual: `greeting`, `collecting_interest`, `collecting_preferences`, `collecting_payment`, `qualified`, `scheduling_visit`
- [x] AC4: Dados coletados sao sincronizados com a tabela `leads` (campos: `preferred_bedrooms`, `preferred_floor`, `preferred_view`, etc.) — integrado no pipeline.ts
- [x] AC5: Score de qualificacao calculado (0-100) baseado em completude dos dados coletados
- [x] AC6: Score >= 70 marca lead como `qualified` e dispara criterio de handoff
- [x] AC7: Nicole NAO faz perguntas em sequencia rapida — intercala com respostas sobre o empreendimento
- [x] AC8: Se lead ja forneceu dado em mensagem anterior, Nicole nao pergunta novamente
- [x] AC9: Funcao `extractLeadData(message, currentState)` que extrai dados da mensagem do lead usando Claude (Haiku)
- [x] AC10: Funcao `calculateQualificationScore(collectedData)` que retorna score 0-100
- [x] AC11: Kanban stage do lead atualiza automaticamente: "Novo" -> "Em Qualificacao" quando primeira resposta, "Em Qualificacao" -> "Qualificado" quando score >= 70 — integrado no pipeline.ts

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/ai/src/flows/qualification.ts` — Logica do fluxo de qualificacao
- `packages/ai/src/extractors/lead-data-extractor.ts` — Extracao de dados com Claude Haiku
- `packages/ai/src/scoring/qualification-score.ts` — Calculo de score
- `packages/shared/src/types/qualification.ts` — Types de qualificacao

### Estrutura do `collected_data`:
```typescript
interface CollectedData {
  name?: string;
  property_interest?: 'vind' | 'yarden' | 'both' | 'unknown';
  bedrooms?: number;
  preferred_floor?: 'high' | 'low' | 'indifferent';
  preferred_view?: string;
  garage_count?: number;
  has_down_payment?: boolean;
  down_payment_range?: string;
  how_found_trifold?: string;
  visit_availability?: string;
}
```

### Calculo do score:
```typescript
export function calculateQualificationScore(data: CollectedData): number {
  let score = 0;
  if (data.name) score += 10;
  if (data.property_interest && data.property_interest !== 'unknown') score += 20;
  if (data.bedrooms) score += 10;
  if (data.preferred_floor) score += 5;
  if (data.preferred_view) score += 5;
  if (data.garage_count) score += 5;
  if (data.has_down_payment !== undefined) score += 15;
  if (data.how_found_trifold) score += 5;
  if (data.visit_availability) score += 25;
  return score; // max = 100
}
```

### Extractor prompt (Haiku):
```
Extraia os seguintes dados da mensagem do lead (retorne JSON):
- name: nome do lead (se mencionou)
- property_interest: "vind" | "yarden" | "both" | null
- bedrooms: numero de quartos desejado (int ou null)
- preferred_floor: "high" | "low" | "indifferent" | null
- preferred_view: string descrevendo vista preferida ou null
- garage_count: numero de vagas desejado (int ou null)
- has_down_payment: true | false | null (se mencionou ter/nao ter entrada)
- visit_availability: string descrevendo disponibilidade ou null

Mensagem do lead: "{message}"
Dados ja coletados: {current_collected_data}

Retorne APENAS o JSON com campos que foram mencionados nesta mensagem. Campos nao mencionados = null.
```

### Referencia agente-linda:
- Adaptar data extractor pattern de `~/agente-linda/packages/ai/src/extractors/`
- Reusar logica de conversation state de `~/agente-linda/packages/ai/src/flows/`

## Dependencias
- Depende de: 3.1 (prompts de qualificacao), 3.3 (empreendimento identificado), 3.10 (estado da conversa)
- Bloqueia: 3.5 (regra Yarden usa has_down_payment), 3.7 (handoff usa score)

## Estimativa
G (Grande) — 3-4 horas

## File List
- `packages/ai/src/flows/qualification.ts` — Logica do fluxo de qualificacao: calculateQualificationScore, getNextQualificationStep, extractCollectedData

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
