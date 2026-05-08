status: Done

# Story 5.3 — Configuracao da Personalidade Nicole

## Contexto
O admin precisa poder ajustar a personalidade e comportamento da Nicole sem mexer em codigo. Isso inclui editar o prompt principal (personalidade, tom, restricoes), guardrails ativos, e testar como a Nicole responderia. A Story 3.1 define a personalidade inicial — esta story cobre a interface admin para edita-la em producao.

## Acceptance Criteria
- [x] AC1: Pagina `/dashboard/configuracoes/personalidade` exibe o prompt atual da Nicole
- [x] AC2: **Exibicao do prompt principal:** Textarea read-only com o personality_prompt do agent_config
- [ ] AC3: **Editor de guardrails:** Lista de guardrails com toggle ativo/inativo cada
- [ ] AC4: **Preview de teste:** Campo para digitar pergunta de teste + botao "Testar resposta"
- [ ] AC5: Botao "Salvar" atualiza a tabela `agent_prompts` e `agent_config`
- [ ] AC6: Historico de versoes: ao salvar, a versao anterior e mantida (campo `version` auto-incrementa)
- [ ] AC7: Botao "Reverter para versao anterior" restaura o prompt anterior
- [x] AC8: API route: GET `/api/agent-config` para leitura de configuracoes
- [ ] AC9: Validacao: prompt nao pode estar vazio, guardrails nao pode ter todos desativados
- [ ] AC10: Indicador visual de quando o prompt foi modificado pela ultima vez e por quem
- [x] AC11 (bonus): Exibicao de mensagem de saudacao e mensagem fora de horario (read-only)
- [x] AC12 (bonus): Exibicao de info do modelo (model_primary, temperatura, max_tokens)
- [x] AC13 (bonus): Listagem de prompts do agente (agent_prompts) por tipo com badges coloridos

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/settings/personality/page.tsx` — Pagina de config
- `packages/web/src/components/settings/prompt-editor.tsx` — Editor de prompt
- `packages/web/src/components/settings/guardrails-config.tsx` — Toggle de guardrails
- `packages/web/src/components/settings/prompt-tester.tsx` — Preview de teste
- `packages/web/src/app/api/settings/personality/route.ts` — GET, PATCH
- `packages/web/src/app/api/settings/personality/test/route.ts` — POST (testar)

### Tabelas envolvidas:
```typescript
// agent_prompts — armazena o system prompt (com versionamento)
// agent_config — armazena configuracoes (guardrails, model, etc.)
```

### Endpoint de teste:
```typescript
// POST /api/settings/personality/test
export async function POST(request: Request) {
  const { prompt, guardrails, testMessage } = await request.json();

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: buildSystemPrompt(prompt, guardrails),
    messages: [{ role: 'user', content: testMessage }],
  });

  return Response.json({
    response: response.content[0].text,
    tokens_used: response.usage.output_tokens,
  });
}
```

### Referencia agente-linda:
- Adaptar settings de `~/agente-linda/packages/web/src/app/dashboard/settings/` (se existir)
- Reusar pattern de prompt editor e tester

## Dependencias
- Depende de: 1.2 (schema agent_prompts, agent_config), 1.5 (auth admin), 3.1 (personalidade Nicole)
- Bloqueia: Nenhuma

## Estimativa
M (Media) — 2-3 horas

## File List

### Created/Modified
- `packages/web/src/app/dashboard/configuracoes/personalidade/page.tsx` — Criado: pagina de configuracao de personalidade da Nicole com exibicao read-only do personality_prompt, mensagens de saudacao e fora de horario, info do modelo (model_primary/temperatura/max_tokens), listagem de agent_prompts ativos com badges por tipo; acesso restrito a admin/supervisor
- `packages/web/src/app/api/agent-config/route.ts` — Criado: endpoint GET para leitura do agent_config da organizacao

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
