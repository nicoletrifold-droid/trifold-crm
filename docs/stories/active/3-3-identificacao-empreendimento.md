status: Done

# Story 3.3 — Identificacao de Empreendimento

## Contexto
Quando um lead escreve para a Nicole, ela precisa identificar qual empreendimento interessa: Vind, Yarden, ou nao sabe. Se nao sabe, Nicole apresenta ambos com diferenciais. Se veio de anuncio Meta Ads, o empreendimento pode ja estar identificado pelo referral data (utm_content ou campanha). Essa identificacao direciona toda a conversa subsequente.

## Acceptance Criteria
- [x] AC1: Nicole identifica empreendimento quando lead menciona nome diretamente ("Vind", "Yarden", "aquele da Gleba Itororo", "o de 67m2")
- [x] AC2: Se lead veio de Meta Ads com UTM indicando empreendimento, Nicole ja sabe qual e e confirma
- [x] AC3: Se lead nao sabe qual quer, Nicole apresenta ambos de forma comparativa e concisa
- [x] AC4: Apresentacao comparativa inclui: nome, metragem, diferenciais-chave, localizacao, prazo de entrega
- [x] AC5: Apos identificacao, `conversation_state.current_property_id` e atualizado
- [x] AC6: Se lead mudar de ideia durante a conversa (ex: "na verdade quero saber do Yarden"), Nicole se adapta
- [x] AC7: Funcao `identifyProperty(message, conversationState)` que retorna property_id ou null
- [x] AC8: Dados do empreendimento identificado sao injetados no contexto da IA (RAG filtrado por property)
- [x] AC9: Lead model atualiza campo `property_interest_id` quando identificado — integrado no pipeline.ts

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/ai/src/flows/identify-property.ts` — Logica de identificacao
- `packages/ai/src/extractors/property-extractor.ts` — Extrai menção a empreendimento da mensagem

### Logica de identificacao:
```typescript
export async function identifyProperty(
  message: string,
  state: ConversationState,
  properties: Property[]
): Promise<{ propertyId: string | null; method: 'explicit' | 'utm' | 'unknown' }> {
  // 1. Se ja tem property no state, manter (a menos que lead mude)
  if (state.current_property_id) {
    // Checar se lead esta mudando de empreendimento
    const switchIntent = await detectPropertySwitch(message, state.current_property_id, properties);
    if (switchIntent) return { propertyId: switchIntent, method: 'explicit' };
    return { propertyId: state.current_property_id, method: 'explicit' };
  }

  // 2. Checar UTM data do lead
  if (state.lead?.utm_content) {
    const matched = properties.find(p =>
      state.lead.utm_content.toLowerCase().includes(p.slug)
    );
    if (matched) return { propertyId: matched.id, method: 'utm' };
  }

  // 3. Buscar mencao na mensagem (keywords: nome, bairro, metragem)
  const mentioned = await extractPropertyMention(message, properties);
  if (mentioned) return { propertyId: mentioned.id, method: 'explicit' };

  // 4. Nao identificado — Nicole vai perguntar
  return { propertyId: null, method: 'unknown' };
}
```

### Prompt de apresentacao comparativa:
```
O lead ainda nao sabe qual empreendimento quer. Apresente as 2 opcoes de forma concisa:

VIND RESIDENCE:
- 67m2, 2 suites, sacada com churrasqueira a carvao
- Rua Jose Pereira da Costa — entrega 1o sem 2027
- Ideal para: casais, investidores

YARDEN RESIDENCE:
- 2 opcoes: 83m2 (2 suites) ou 79m2 (2 dorm + 1 suite)
- Gleba Itororo — rooftop exclusivo — entrega 1o sem 2029
- Ideal para: familias, quem busca alto padrao

Pergunte qual deles chama mais atencao.
```

### Referencia agente-linda:
- Adaptar data extractor de `~/agente-linda/packages/ai/src/extractors/` (se existir)

## Dependencias
- Depende de: 3.1 (prompts), 3.2 (RAG com dados dos empreendimentos), 2.5/2.6 (seeds)
- Bloqueia: 3.4 (qualificacao precisa saber o empreendimento), 3.5 (regra Yarden depende de identificacao)

## Estimativa
M (Media) — 2 horas

## File List
- `packages/ai/src/flows/identify-property.ts` — Logica de identificacao de empreendimento por mensagem, UTM e keywords

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
