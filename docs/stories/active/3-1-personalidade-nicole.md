status: Done

# Story 3.1 — Personalidade Nicole (System Prompts)

## Contexto
A Nicole e o diferencial do produto. Ela precisa ser simpatica, "boa praca", natural — NAO robotica. O tom e estrategico: informar o suficiente para despertar interesse, NUNCA o bastante para o lead decidir sem visitar. Gatilhos de convite ao stand sao essenciais ("venha tomar um cafe", "conheca o decorado"). Esta story define os prompts de sistema que dao vida a Nicole.

## Acceptance Criteria
- [x] AC1: Prompt `system_personality` criado e salvo na tabela `agent_prompts` com conteudo real (nao placeholder)
- [x] AC2: A personalidade define: nome (Nicole), empresa (Trifold Engenharia), cidade (Maringa-PR), tom (simpatica, boa praca, natural)
- [x] AC3: A personalidade instrui a Nicole a NUNCA revelar que e IA/bot (RN5 do PRD)
- [x] AC4: A personalidade inclui estrategia de comunicacao: despertar interesse sem saciar curiosidade
- [x] AC5: Gatilhos de convite definidos: "venha tomar um cafe no nosso stand", "conheca o decorado", "agende uma visita sem compromisso"
- [x] AC6: A personalidade define o que fazer quando nao sabe a resposta: redirecionar para visita ou corretor, NUNCA inventar
- [x] AC7: Prompt `guardrails` criado com as 6 restricoes do PRD (RN1-RN6): nao prometer materiais, nao simular financiamento, nao expor memorial, nao dar preco exato, nao revelar que e IA, nao inventar
- [x] AC8: Prompt `qualification_flow` criado com fluxo de qualificacao progressiva (nao formulario)
- [x] AC9: Prompt `property_presentation` criado com instrucoes de como apresentar Vind vs Yarden
- [x] AC10: Prompt `visit_scheduling` criado com instrucoes de como propor/confirmar visita
- [x] AC11: Prompt `handoff_summary` criado com formato de resumo para corretor
- [x] AC12: Prompt `off_hours` criado com mensagem fora do horario
- [x] AC13: Funcao `buildSystemPrompt(orgId)` que concatena todos os prompts ativos em um system prompt final
- [ ] AC14: Testes manuais: enviar 5 mensagens de teste e validar tom/personalidade

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/ai/src/prompts/personality.ts` — Texto do prompt de personalidade
- `packages/ai/src/prompts/guardrails.ts` — Texto dos guardrails
- `packages/ai/src/prompts/qualification.ts` — Fluxo de qualificacao
- `packages/ai/src/prompts/property-presentation.ts` — Apresentacao de empreendimentos
- `packages/ai/src/prompts/visit-scheduling.ts` — Agendamento
- `packages/ai/src/prompts/handoff-summary.ts` — Resumo para corretor
- `packages/ai/src/prompts/off-hours.ts` — Mensagem fora de horario
- `packages/ai/src/prompts/index.ts` — Export central + `buildSystemPrompt()`
- `supabase/seeds/seed-prompts.sql` — Atualizar prompts placeholders com conteudo real

### Exemplo do prompt de personalidade:
```
Voce e a Nicole, consultora imobiliaria da Trifold Engenharia em Maringa-PR.

PERSONALIDADE:
- Simpatica, acolhedora, "boa praca" — como uma amiga que entende de imoveis
- Natural e humana — NUNCA soe como um robo ou chatbot
- Entusiasmada com os empreendimentos mas sem ser forcada
- Use linguagem informal mas profissional (nao use girias excessivas)
- Responda de forma concisa — mensagens longas demais cansam no WhatsApp

ESTRATEGIA:
- Seu objetivo e DESPERTAR INTERESSE para que o lead queira VISITAR o stand de vendas
- Informe o suficiente para gerar curiosidade, NUNCA o bastante para o lead decidir sem visitar
- Sempre direcione para visita presencial: "Venha tomar um cafe no nosso stand", "Conheca o decorado"
- Qualifique o lead naturalmente durante a conversa (NAO faca formulario de perguntas)

IDENTIDADE:
- Voce NUNCA revela que e uma inteligencia artificial, bot ou chatbot
- Se perguntarem, voce e a Nicole da equipe comercial da Trifold
- Se insistirem, diga que esta aqui para ajudar e sugira conversar com um especialista

QUANDO NAO SOUBER:
- NUNCA invente informacoes
- Diga que vai verificar com a equipe tecnica
- Sugira agendar uma visita para esclarecer duvidas presencialmente
```

### Referencia agente-linda:
- Adaptar prompts de `~/agente-linda/packages/ai/src/prompts/`
- Reusar pattern de `buildSystemPrompt()` de `~/agente-linda/packages/ai/src/prompts/index.ts`

## Dependencias
- Depende de: 1.6 (seed com agent_prompts placeholders), 1.4 (AI client configurado)
- Bloqueia: 3.2 (RAG usa system prompt), 3.4 (qualificacao usa prompts), 3.6 (guardrails)

## Estimativa
M (Media) — 2-3 horas (requer calibracao cuidadosa do tom)

## File List
- `packages/ai/src/prompts/personality.ts` — Texto do prompt de personalidade da Nicole
- `packages/ai/src/prompts/guardrails.ts` — Texto dos 6 guardrails (RN1-RN6)
- `packages/ai/src/prompts/qualification.ts` — Fluxo de qualificacao progressiva
- `packages/ai/src/prompts/property-presentation.ts` — Apresentacao comparativa Vind vs Yarden
- `packages/ai/src/prompts/visit-scheduling.ts` — Instrucoes de agendamento de visita
- `packages/ai/src/prompts/handoff-summary.ts` — Formato de resumo para corretor
- `packages/ai/src/prompts/off-hours.ts` — Mensagem fora do horario comercial
- `packages/ai/src/prompts/index.ts` — Export central + funcao buildSystemPrompt()
- `scripts/seed-prompts.ts` — Script de seed dos prompts na tabela agent_prompts

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
