# Story 75-330 — Motor do formulário público de qualificação

**Status:** Draft
**Tipo:** Feature nova (rota pública + tabelas novas)
**Epic:** 89 — Formulário de qualificação para tráfego pago
**Story ID:** 75-330
**Complexidade:** M (~5 pts — 1 migration, 2 tabelas, 1 rota pública, 1 API, 1 tela de config)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Migration:** 231 (a 230 é a última aplicada)

## Contexto

O Épico 89 traz o formulário de tráfego pago para dentro do CRM. Esta story constrói o
**motor**: a definição do formulário, a página pública que o executa com ramificação, e a
gravação das respostas com score. A agenda no fim é a **75-331**; a leitura por IA é a
**75-332**. Nenhuma das duas pode começar sem esta.

A decisão de construir aqui em vez de seguir no YayForms está registrada no epic §2: a peça
cara (agenda pública por token, horários reais, espelho no Google) já existe desde a Story
81-4 e será reusada pela 75-331.

### A regra que não pode ser perdida no caminho

O diretor decidiu (D2) que **todo mundo vê a agenda no fim, sem exceção**. O score, portanto,
**não bloqueia nada** nesta v1. Ele é calculado e gravado assim mesmo. O motivo é explícito:
se em 30 dias ficar claro que abaixo de X só dá trabalho para o SDR, ligar o corte tem que ser
mudar um número — não refazer a tela nem ficar sem histórico para calibrar. Implementar o
score e não usá-lo é intencional, não sobra.

## Escopo

### IN

1. Migration **231**: `lead_forms` (definição) + `lead_form_responses` (respostas), com RLS.
2. Formato do `schema` em `jsonb`: perguntas, tipos, opções, **condições de exibição** e
   **pesos** para o score.
3. Página pública `/formulario/[token]` — sem login, mesma garantia do `/agendar/[token]`.
4. API pública: ler a definição, salvar progresso parcial, finalizar.
5. Criação do lead **assim que o contato é capturado** (não no fim).
6. Captura de UTM/campanha em `leads.metadata` para atribuição.
7. Aceite de LGPD com link para `/politica-de-privacidade`.
8. Tela de configuração para editar o `jsonb` sem deploy.

### OUT

- A agenda no fim da última tela → **75-331**
- Análise das respostas abertas por IA → **75-332**
- Editor visual arrastando campos (a v1 edita o JSON com validação)
- Corte de qualificação escondendo a agenda (revogado por D2)

## Acceptance Criteria

1. **AC1 — Rota pública de verdade.** `/formulario/[token]` abre sem sessão. O `pathname`
   entra no `isPublicRoute` de `lib/supabase/middleware.ts:115`, junto de `/agendar/` e
   `/pasta/`. Validação obrigatória pós-deploy: `curl` anônimo na URL retorna a página, não
   um redirect para `/login`.

2. **AC2 — Token inválido não vaza nada.** Token inexistente, mal formado ou de formulário
   inativo cai na mesma tela genérica de "link inválido ou desativado", sem revelar se o
   token existe, a que org pertence ou qual campanha. Mesmo comportamento do
   `app/agendar/[token]/page.tsx`.

3. **AC3 — Ramificação funciona.** Uma pergunta com condição de exibição só aparece se a
   condição for satisfeita pelas respostas já dadas. Quem responde "à vista" não vê as
   perguntas de financiamento. A decisão de qual é a próxima pergunta vive em **função pura**
   testável sem DOM (o projeto não tem jsdom nem teste de componente — a decisão sai da tela e
   vai para a função).

4. **AC4 — Contato capturado cedo vira lead mesmo se abandonar.** Assim que nome + telefone
   são preenchidos, o lead é criado e a resposta parcial é gravada. Se a pessoa fechar a aba
   na pergunta 4 de 6, existe um lead com as 3 respostas que ela deu. O lead nasce com
   `source` vindo da constante compartilhada de origens — **importada**, nunca uma string
   literal reproduzida aqui.

5. **AC5 — Score calculado e gravado, sem efeito nenhum.** Cada finalização grava
   `lead_form_responses.score` conforme os pesos do `jsonb`. O score **não** esconde
   perguntas, **não** muda o destino do lead e **não** aparece para o lead. Função pura, com
   testes cobrindo: peso ausente, resposta fora das opções e formulário sem nenhum peso
   definido (score = 0, não erro).

6. **AC6 — Atribuição preservada.** `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`
   e `utm_term` presentes na URL são gravados em `leads.metadata`. URL sem UTM não quebra o
   envio.

7. **AC7 — LGPD.** O envio exige aceite explícito (checkbox não pré-marcado) com link para
   `/politica-de-privacidade`. O aceite é gravado com data/hora na resposta.

8. **AC8 — Editável sem deploy.** Um admin edita as perguntas pela tela de configuração e a
   página pública passa a servir a versão nova sem build. JSON inválido é **rejeitado na
   gravação** com erro legível — nunca salvo a ponto de quebrar a página pública.

9. **AC9 — Respostas visíveis na ficha.** As respostas aparecem na ficha do lead para o
   corretor, em texto legível (pergunta + resposta), não como JSON cru.

10. **AC10 — RLS fechada.** `lead_forms` e `lead_form_responses` têm RLS habilitada e escopada
    por `org_id`. A escrita pública acontece pela rota com service-role validando o token —
    nunca por policy anônima ampla. Validar com a migration aplicada em transação
    **revertida** antes do deploy.

## Notas técnicas

- **Padrão a copiar:** `app/agendar/[token]/page.tsx` (Server Component valida token →
  passa dados prontos para o client) + `app/api/agendar/[token]/route.ts` (GET lê, POST
  escreve, ambos com o token na rota).
- **Nicole:** definir e registrar nesta story o que acontece com quem abandona no meio. Se o
  formulário não devolver esses leads para a Nicole retomar de onde pararam, nascem duas
  qualificações concorrentes (epic §6). A implementação do retomar pode ser follow-up, mas a
  **decisão** tem que sair daqui escrita.
- **Rate limit:** POST público precisa de limite por IP.
- **Migration:** carregar as boas práticas de Postgres antes de escrever a 231 (tipos de
  coluna, índices, RLS). Aplicar em produção pela Management API — nunca `db push`.
- **Testes:** `vitest` só coleta `.test.ts`. As funções puras desta story (próxima pergunta,
  score, parse do schema) são o alvo dos testes.

## Definition of Done

- [ ] Migration 231 aplicada em dev e validada em prod por transação revertida
- [ ] `curl` anônimo em `/formulario/[token]` retorna a página em produção
- [ ] Testes das funções puras passando; suíte completa sem regressão
- [ ] `tsc` 0 erros, `eslint` sem erro novo, `build` completo
- [ ] Decisão sobre o abandono/Nicole registrada na story
- [ ] @qa PASS antes do push

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 17/08/2026 | @sm (River) | Story criada a partir do Épico 89, com as decisões D1–D3 do diretor |
