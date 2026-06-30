# Story 75-67 — Corrigir botão dos templates WhatsApp (404) + redirect defensivo

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** M (3-5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** corretor/cliente/gestor que recebe notificação no WhatsApp, **I want** que o **botão da mensagem
abra a página certa** (não 404), **so that** eu consiga atender o lead / ver a obra direto pelo link.

## Contexto
A corretora Valeria recebeu o lead certo, mas clicar no botão do WhatsApp deu **404** (Android). Causa raiz
confirmada via Graph API: os **4 templates funcionais** foram criados com o **`{{1}}` literal** na URL do botão
(`example: null` → a Meta tratou como URL ESTÁTICA), então o link aponta para `/broker/leads/%7B%7B1%7D%7D`
(o `{{1}}` nunca é substituído) → rota `[id]` recebe id inválido → 404. O código nem manda parâmetro de botão.

Templates afetados (todos APPROVED, botão quebrado):
- `novo_lead_corretor` → `/broker/leads/{{1}}` (ATIVO — o que a Valeria clicou)
- `atualizacao_obra_cliente` → `/cliente/{{1}}` (ATIVO — portal recém-religado, Story 75-66)
- `aviso_roleta_gestor` → `/dashboard/leads/{{1}}` (gestor ainda em texto, não usa)
- `novo_boleto_cliente` → `/cliente/{{1}}/financeiro/boleto` (gatilho ainda não implementado)

Decisão do usuário (2026-06-26): **as duas camadas, nos 4 templates.** Tom da correção: robusta e à prova de
reincidência. Ver caveat histórico em [[project-notificacoes-portal]] (issue #26).

## Escopo
**IN:**
### Camada 1 — Redirect defensivo (CÓDIGO — deploy IMEDIATO, mata o 404 sem depender da Meta)
1. `packages/web/src/lib/uuid.ts` (novo) — `isUuid(v: string): boolean` (regex UUID âncora).
2. Em cada rota-alvo, após ler o param e ANTES da query: se `!isUuid(param)` → `redirect(<lista/home>)`:
   - `broker/leads/[id]/page.tsx` → `/broker/leads`
   - `cliente/[obra_id]/page.tsx` → `/cliente`
   - `cliente/[obra_id]/financeiro/boleto/page.tsx` → `/cliente`
   - `dashboard/leads/[id]/page.tsx` → `/dashboard/leads`
3. Teste de `isUuid` (`packages/web/src/lib/uuid.test.ts`): UUID válido, `{{1}}`, `%7B%7B1%7D%7D`, vazio, lixo.

### Camada 2 — Botão dinâmico (META + CÓDIGO — deploy do código SÓ APÓS aprovação da Meta)
4. Editar os 4 templates na Meta (Graph API) → **URL dinâmica**: `url` terminando em `{{1}}` (sem encode) +
   `example` (URL de amostra). Isso re-submete para aprovação (versão APROVADA atual segue ativa até aprovar).
5. Código — adicionar o componente `button` (sub_type url, index 0, param = id) NOS ENVIOS ATIVOS:
   - `lib/roleta/notify-broker.ts` `sendBrokerLeadTemplate` → param = `lead.id`
   - `lib/notificacoes.ts` `sendWhatsApp` (atualizacao_obra_cliente) → param = `obraId`
   - gestor (`aviso_roleta_gestor`) e boleto: hoje não enviam template → só corrigir o template na Meta; deixar
     TODO no código p/ quando forem ligados.
   - **ORDEM CRÍTICA:** não fazer deploy do passo 5 enquanto a Meta não aprovar o botão dinâmico — enviar param
     de botão para template estático = erro **132018** e o envio FALHA (corretor não recebe). Deploy faseado.

**OUT:**
- Não religar/pausar notificações (PORTAL_NOTIF_PAUSED inalterado).
- Não mudar o texto (body) dos templates.
- Não implementar o gatilho de boleto nem migrar o gestor para template (fora de escopo; só corrige o botão).

## Acceptance Criteria
1. **Given** um link de WhatsApp com id inválido (ex.: `{{1}}`/`%7B%7B1%7D%7D`), **when** o corretor/cliente
   abre, **then** é **redirecionado** para a lista/home correspondente — **nunca** 404.
2. **Given** `isUuid`, **when** recebe UUID válido → `true`; `{{1}}`, `%7B%7B1%7D%7D`, vazio, lixo → `false`.
3. **Given** os 4 templates na Meta, **when** consultados após a edição, **then** o botão é **URL dinâmica**
   (`example` presente, `{{1}}` no fim) e o status caminha para APPROVED.
4. **Given** o template dinâmico aprovado, **when** o sistema envia `novo_lead_corretor`/`atualizacao_obra_cliente`,
   **then** inclui o componente `button` com o id real → o link abre o **lead/obra exato**.
5. **Given** o template AINDA não aprovado (janela de review), **when** o sistema envia, **then** NÃO manda param
   de botão (evita 132018) — i.e., o deploy do passo 5 ocorre só após aprovação.
6. typecheck/lint/vitest limpos.

## Dev Notes
- `isUuid`: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`. `redirect()` de `next/navigation`
  (lançar ANTES de qualquer fetch que faça `notFound()`).
- **Edição do template (Graph API):** `POST /{template_id}` reenviando `components` completos (body + buttons),
  com o botão: `{type:"URL", text:"Atender lead", url:"https://crm.trifold.eng.br/broker/leads/{{1}}",
  example:["https://crm.trifold.eng.br/broker/leads/00000000-0000-0000-0000-000000000001"]}`. Token em
  `whatsapp_config.access_token`; WABA `35524602787124855`.
- **Envio com botão dinâmico:** components += `{type:"button", sub_type:"url", index:"0",
  parameters:[{type:"text", text:<id>}]}`. O param é só o **sufixo** que substitui `{{1}}` (a base fica no template).
- **Deploy faseado:** Camada 1 (redirect) sai já; Camada 2 (passo 5) só após Meta APPROVED p/ os 2 ativos.
- Reuso: estende [[project-notificacoes-portal]]; relaciona [[project-roleta]] (notify-broker) e Story 75-24.

### Testing
- `vitest packages/web` (uuid.test.ts) + `type-check` + `lint`.
- Verificação manual pós-deploy Camada 1: abrir `crm.trifold.eng.br/broker/leads/{{1}}` → cai em `/broker/leads`.
- Verificação Camada 2 (após aprovação): novo lead real → botão abre o lead exato.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.67-whatsapp-botao-templates-404.yml`) · readiness 9/10
- Camada 1: uuid.test 4/4 + type-check 8/8. AC1/AC2 OK. AC3 verificado (4 templates DINÂMICOS/PENDING via Graph API).
- **1 obs HIGH:** Camada 2 (código param de botão) só pode deployar após APPROVED (senão 132018) → deploy faseado.
- **Pendente @devops:** merge Camada 1 (mata 404 já); monitorar aprovação Meta; PR Camada 2 após APPROVED. Status → Done após Camada 2.

## Riscos
- **Enviar param de botão antes da Meta aprovar → 132018 (envio falha).** Mitigação: deploy faseado (AC5); a
  Camada 1 já garante experiência sem 404 enquanto a 2 não sobe. **Médio — controlado pela ordem.**
- **Edição re-submete o template e demora p/ aprovar.** Versão aprovada atual segue ativa; sem disrupção. **Baixo.**
- **Redirect mascarar bug real (id legítimo inexistente):** id legítimo é UUID → passa pelo `isUuid` e segue p/
  `notFound()` normal. Só id malformado redireciona. **Baixo.**

## File List
**Camada 1 (deploy agora):**
- `packages/web/src/lib/uuid.ts` (novo) — `isUuid`.
- `packages/web/src/lib/uuid.test.ts` (novo) — 4 casos.
- `packages/web/src/app/broker/leads/[id]/page.tsx` — redirect `/broker/leads` se id inválido.
- `packages/web/src/app/cliente/[obra_id]/page.tsx` — redirect `/cliente` se obra inválida.
- `packages/web/src/app/cliente/[obra_id]/financeiro/boleto/page.tsx` — redirect `/cliente` se obra inválida.
- `packages/web/src/app/dashboard/leads/[id]/page.tsx` — redirect `/dashboard/leads` se id inválido.
- `packages/web/src/app/cliente/boleto/[obra_id]/page.tsx` (novo) — redirect p/ `/cliente/[obra_id]/financeiro/boleto`
  (deep-link do boleto; var no fim da URL p/ a Meta).

**Camada 2 (Meta — submetida; código gated):**
- 4 templates editados na Meta p/ botão dinâmico (PENDING re-aprovação): novo_lead_corretor, atualizacao_obra_cliente,
  aviso_roleta_gestor, novo_boleto_cliente (base do boleto → `/cliente/boleto/{{1}}`).
- Código de envio de param de botão: **PENDENTE** — só deployar após APPROVED (senão 132018). PR separado.

## Dev Agent Record
- **Agent Model:** Claude Opus 4.8 (1M)
- **Completion Notes:**
  - **Camada 1 pronta e validada:** uuid.test 4/4; `pnpm type-check` 8/8. Mata o 404 imediatamente (links quebrados
    redirecionam p/ lista/home). Deploy seguro agora.
  - **Camada 2 (Meta):** 4 templates editados via Graph API p/ URL dinâmica (`{{1}}` no fim + example); todos
    PENDING. Boleto exigiu nova base `/cliente/boleto/{{1}}` (Meta exige var no fim) + rota de redirect criada.
  - **Camada 2 (código):** o componente `button` (param=id) em `sendBrokerLeadTemplate` e `sendWhatsApp` será um
    PR à parte, deployado SÓ após os templates ficarem APPROVED — enviar param p/ template estático = 132018.
  - gestor/boleto: hoje não enviam template; só corrigido o template (sem mudança de código de envio).

## Change Log
- 2026-06-26 — @sm — Story criada. Botão dos 4 templates WhatsApp com `{{1}}` literal → 404 (Valeria). Fix em 2
  camadas: redirect defensivo (código, imediato) + botão dinâmico (Meta + código, deploy faseado pós-aprovação).
- 2026-06-26 — @po — Validação (10 pontos): **GO**, 9/10. Causa raiz confirmada por evidência (Graph API); 6 ACs
  testáveis; escopo IN/OUT claro com **deploy faseado** bem destacado (AC5 evita o 132018); riscos mapeados;
  complexidade M; valor alto (corretor/cliente não atendem pelo link hoje). Status Draft → Ready.
- 2026-06-26 — @dev — Camada 1 implementada (isUuid + 4 redirects + rota redirect boleto + teste 4/4; type-check
  8/8). Camada 2: 4 templates editados na Meta p/ botão dinâmico (PENDING); código de param de botão fica p/ PR
  após aprovação. Status Ready → Review.
- 2026-06-26 — @qa — Gate **PASS** (9/10). Camada 1 OK. 1 obs HIGH: deploy faseado (Camada 2 código só após
  APPROVED, senão 132018). Pendente @devops: merge Camada 1 + PR Camada 2 pós-aprovação.
- 2026-06-26 — @devops — Camada 1 merged (PR #52, deployada). Os 4 templates ficaram **APPROVED** na Meta
  (monitorado). Camada 2 merged (PR #53, commit 3b82e2e) → deploy do Vercel disparado pelo merge. Deep-link do
  botão agora abre o lead/obra exato. Loop de monitoramento (cron 57c5b073) encerrado. Status Review → **Done**.
