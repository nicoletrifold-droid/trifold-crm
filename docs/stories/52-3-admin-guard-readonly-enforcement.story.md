# Story 52-3 — Utilitario isAdmin + Read-Only Enforcement (Action Whitelist)

## Metadata
- **Epic:** 52 — Agente de Trafego com Acesso Read-Only ao Pipeline do CRM
- **Story:** 52-3
- **Status:** Done
- **Priority:** P1 — controle de acesso e enforcement de seguranca; bloqueia 52-2
- **Complexity:** S (TypeScript puro — helper + hardening — ~2-3h)
- **Created:** 2026-06-15
- **Revised:** 2026-06-15 (v0.2)
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[is_admin_helper_test, action_whitelist_test, cancel_guard_test, media_regression_test]`

---

## User Story

**Como** sistema Trifold CRM,
**Quero** um utilitario server-side confiavel `isAdmin(user)` que verifica estritamente `role === 'admin'`, e que o sistema de `<action_card>` confine sua whitelist de tipos exclusivamente as acoes de midia existentes,
**Para que** a Story 52-2 (injecao de contexto CRM) possa consumir o utilitario de forma padrao para decidir se injeta dados sensiveis do pipeline — e para que nenhuma acao de CRM seja executavel pelo agente, independente de role.

---

## Context

O Epic 52 conecta o agente gestor de trafego pago ao pipeline comercial do CRM. Antes que qualquer dado sensivel seja injetado no contexto do modelo (Story 52-2), os controles da camada de aplicacao devem estar em vigor.

**Decisao de produto travada pelo stakeholder (resolver a ambiguidade levantada na v0.1):**

> Somente a capacidade de CRM e admin-only. A analise de midia (Meta Ads) do painel do agente CONTINUA disponivel para todos os roles (supervisor, gerente-comercial, broker) — SEM regressao. O que muda e que o **contexto de CRM so e injetado quando o usuario e admin** — gate decidido em 52-2 a partir do utilitario entregue nesta story. O painel do agente em si nao e ocultado.

**Reinterpretacao de FR-7 conforme decisao do PO:**
FR-7 ("painel do agente visivel/acessivel apenas para `role = 'admin'`") e interpretado como: a capacidade de cruzamento CRM do agente e admin-only — nao o painel de midia em si. O painel permanece acessivel para todos os roles autenticados.

**O que esta story entrega:**

1. **Utilitario `isAdmin`** — verificacao estrita `role === 'admin'` via campo `appUser.role` (Supabase server client; NÃO `is_admin_or_supervisor()`). Este utilitario e o contrato consumido pela 52-2 para decidir se injeta contexto CRM.
2. **Hardening da whitelist de `action_card.type`** — constante nomeada `ALLOWED_ACTION_TYPES` confinando tipos a acoes de midia; qualquer tipo fora da lista retorna 403. Vale para TODOS os roles, independente de ser admin ou nao.
3. **Simetria de guard em `cancel`** — espelha o `requireRole(appUser, ["admin"])` ja existente no `confirm`.

**O que esta story NAO entrega (removido da v0.1):**
- Guard 403 para nao-admin em `POST /api/agent/chat`, `GET /api/agent/chat/sessions` ou `GET /api/agent/chat/[session_id]` — nao-admin continua conversando com o agente sobre midia normalmente; o controle de CRM e feito na camada de injecao (52-2).
- Ocultacao do painel do agente (FAB) para nao-admin — representa regressao de funcionalidade existente (CON-5). O painel continua visivel para todos.
- Alteracao na derivacao de `isAdmin` nas pages-server de `campaigns-meta` — o painel continua renderizando para todos; a prop `isAdmin` passada ao `AgentChatPanel` so afeta botoes de confirmacao/cancelamento de acao, como ja ocorre hoje.

**Estado atual do codigo (anchors factuais confirmados no repo):**

- `POST /api/agent/chat` (`route.ts`): chama `requireAuth()`, depois monta contexto e chama o modelo — qualquer usuario autenticado usa o agente. Manter assim; o gate de CRM vai em 52-2.
- `POST /api/agent/action/confirm` (`confirm/route.ts`): **ja tem** `requireRole(appUser, ["admin"])`. Correto — nao alterar o guard; apenas hardenar a whitelist.
- `POST /api/agent/action/cancel` (`cancel/route.ts`): apenas `requireAuth()` — sem guard de role. Assimetria de seguranca: qualquer usuario autenticado pode cancelar uma acao pendente de admin.
- `AgentChatPanel`: recebe `isAdmin` como prop; FAB e renderizado para todos os usuarios; `isAdmin` controla apenas botoes de confirmacao/cancelamento dentro das mensagens. **Comportamento correto — nao alterar**.
- `requireRole` ja existe em `@web/lib/api-auth` — aceita `allowedRoles: string[]` e retorna `NextResponse 403` ou `null`. Reusar.

**Defesa em profundidade (NFR-SEC-1) reencuadrada sobre acesso a dados de CRM:**
- **(a) RLS no banco** — entregue na Story 52-1: nao-admin recebe 0 rows das views de pipeline (backstop).
- **(b) Aplicacao — gate `isAdmin`** — esta story: utilitario que a 52-2 consome para decidir injecao de contexto CRM.
- **(c) UI** — affordances de CRM (ex.: exemplos de perguntas sobre pipeline no painel) so aparecem para admin, se aplicavel; se hoje nao ha afford especifico de CRM na UI, nao ha nada a esconder.

**Sequenciamento:** depende de 52-1 (RLS fundacional). Bloqueia 52-2 (injecao de contexto — nao deve comecar sem o utilitario `isAdmin` disponivel). 52-4 pode ser desenvolvida em paralelo com esta story.

---

## Scope

### IN (esta story entrega)

- Utilitario server-side `isAdmin(user)` — verificacao estrita `user.role === 'admin'` (campo da tabela `users`, nao `is_admin_or_supervisor()`); exportado de local reutilizavel para consumo pela 52-2 (NFR-SEC-1 camada b)
- Guard `role = 'admin'` em `POST /api/agent/action/cancel` — espelhando o guard ja existente no `confirm` (simetria de seguranca)
- Hardening da whitelist de `action_card.type` em `confirm/route.ts`: constante nomeada `ALLOWED_ACTION_TYPES`; qualquer `type` fora da lista retorna 403 — para TODOS os roles (NFR-SEC-2)
- Garantia explicita de NENHUMA regressao para nao-admin no fluxo de midia (CON-5): painel visivel, chat de midia funcionando, sem 403 para nao-admin nas rotas de chat

### OUT (nao entra nesta story)

- Guard 403 para nao-admin em `/api/agent/chat` (POST/GET) — nao-admin usa o agente normalmente para midia; gate de CRM e responsabilidade da 52-2
- Ocultacao do painel do agente (FAB ou janela de chat) para nao-admin
- Alteracao da derivacao de `isAdmin` nas pages-server de `campaigns-meta` (o comportamento atual e correto para o escopo atual)
- RLS no banco — escopo da Story 52-1
- Injecao de dados do pipeline no `context-builder.ts` — escopo da Story 52-2
- Tabela de auditoria de acesso a PII — escopo da Story 52-4
- Renderizacao de respostas integradas — escopo da Story 52-5
- Adicao de novas acoes de CRM ao `action_card`
- Alteracao do comportamento das acoes de midia existentes (`pause_campaign`, `resume_campaign`, `set_daily_budget`)

---

## Acceptance Criteria

- [x] **AC1 — Utilitario `isAdmin` exportado e reutilizavel:** Um helper `isAdmin(user: AppUser): boolean` (ou equivalente — pode ser funcao, pode ser verificacao inline documentada como contrato) e declarado em local acessivel para `context-builder.ts` da Story 52-2 consumir (ex.: `packages/web/src/lib/agent/auth-helpers.ts` ou arquivo equivalente). A implementacao faz `return user.role === 'admin'` — verificacao estrita de string, sem delegacao para `canAccess`, sem uso de `is_admin_or_supervisor()`. O campo `role` e lido do objeto `appUser` retornado pelo `requireAuth()` existente (campo `appUser.role` da tabela `users`).

- [x] **AC2 — Contrato do utilitario documentado para 52-2:** O arquivo que exporta `isAdmin` contem, em comentario JSDoc ou equivalente, o contrato que a 52-2 vai consumir: assinatura, de onde le o `role`, e o que retorna. O @dev que implementar a 52-2 pode usar o helper sem ler outros arquivos.

- [x] **AC3 — Guard de API em `/api/agent/action/cancel` (POST):** Dado que um usuario com `role != 'admin'` tenta `POST /api/agent/action/cancel`, a API retorna `HTTP 403` com body `{"error": "Forbidden"}`. O comportamento e identico ao ja existente em `/api/agent/action/confirm`. Dado que um usuario `admin` faz o mesmo request, o cancelamento processa normalmente.

- [x] **AC4 — Whitelist de `action_card.type` como constante nomeada:** Em `/api/agent/action/confirm/route.ts`, a lista de tipos validos e declarada como constante TypeScript nomeada: `const ALLOWED_ACTION_TYPES = ["pause_campaign", "resume_campaign", "set_daily_budget"] as const`. Qualquer `action_card.type` que nao esteja nessa constante resulta em `HTTP 403` com body `{"error": "ACTION_TYPE_NOT_ALLOWED"}`. O tipo TypeScript `ActionCard` restringe o campo `type` a `typeof ALLOWED_ACTION_TYPES[number]`.

- [x] **AC5 — Simetria de guard confirm/cancel:** As rotas `confirm/route.ts` e `cancel/route.ts` possuem o mesmo guard de role (`requireRole(appUser, ["admin"])`) na mesma posicao relativa (imediatamente apos `requireAuth()`, antes do parse do body). Qualquer assimetria de comportamento entre as duas rotas para role nao-admin e um bug.

- [ ] **AC6 — Sem regressao nas acoes de midia para admin:** Um usuario `admin` consegue: (a) abrir o painel, (b) enviar mensagens que o agente processa normalmente, (c) confirmar ou cancelar `action_card` do tipo `pause_campaign`, `resume_campaign` e `set_daily_budget`. Nenhuma dessas operacoes regride apos as alteracoes desta story (CON-5).

- [ ] **AC7 — Sem regressao para nao-admin no fluxo de midia (CON-5 — critico):** Um usuario com role `supervisor` ou `gerente-comercial` consegue: (a) acessar `/dashboard/campaigns/meta`, (b) ver o painel do agente (FAB visivel), (c) abrir o painel e enviar uma pergunta sobre midia (ex.: "qual o CPL da campanha X?"), (d) receber resposta do agente normalmente — sem 403, sem erro, sem tela em branco. Dado que este role nao e admin, o agente responde apenas com dados de midia (sem contexto de CRM), mas isso e comportamento esperado e correto.

- [x] **AC8 — Guard usando `requireRole` existente:** O guard em `cancel/route.ts` (AC3/AC5) reutiliza o helper `requireRole(appUser, ["admin"])` de `@web/lib/api-auth` — sem reimplementar a logica de verificacao de role.

---

## Tasks / Subtasks

- [x] **T1** — Pre-work: verificar estado atual dos arquivos afetados
  - [x] T1.1 — Ler `packages/web/src/lib/api-auth.ts` — confirmar assinatura exata de `requireRole` e `requireAuth`, e como `appUser.role` e exposto
  - [x] T1.2 — Ler `packages/web/src/app/api/agent/action/cancel/route.ts` completo — confirmar ausencia de guard de role e ponto exato de insercao
  - [x] T1.3 — Ler `packages/web/src/app/api/agent/action/confirm/route.ts` completo — confirmar guard existente e estrutura atual da validacao de `action_card.type`
  - [x] T1.4 — Confirmar que a rota `POST /api/agent/chat` nao e modificada nesta story (nao-admin deve continuar funcionando)
  - [x] T1.5 — Confirmar que `AgentChatPanel` e seu FAB continuam renderizando para todos os roles (sem alteracao)

- [x] **T2** — Criar utilitario `isAdmin` (AC1, AC2)
  - [x] T2.1 — Criar (ou adicionar em arquivo existente adequado) `packages/web/src/lib/agent/auth-helpers.ts` com a funcao `isAdmin`. Se ja existe arquivo similar de helpers do agente, adicionar la em vez de criar novo. (IDS: nenhum helper `isAdmin` existente e nenhum arquivo de helpers do agente — apenas `context-builder.ts` e `system-prompt.ts`; CREATE justificado.)
  - [x] T2.2 — Implementar: `export function isAdmin(user: AppUser): boolean { return user.role === 'admin'; }` — verificacao estrita, sem delegacao.
  - [x] T2.3 — Adicionar JSDoc com o contrato: parametro `user` (tipo `AppUser` de `@web/lib/api-auth`), retorno `boolean`, fonte do `role` (`appUser.role` da tabela `users`, lido pelo `requireAuth()` existente), caso de uso e import path absoluto para a 52-2.
  - [x] T2.4 — Exportar o helper via caminho absoluto `@web/lib/agent/auth-helpers` (alias `@web/*` → `./src/*` confirmado em `tsconfig.json`).

- [x] **T3** — Guard de simetria em `cancel/route.ts` (AC3, AC5, AC8)
  - [x] T3.1 — Inserido `const forbidden = requireRole(appUser, ["admin"]); if (forbidden) return forbidden;` imediatamente apos o bloco de autenticacao em `cancel/route.ts`. Espelha exatamente o padrao de `confirm/route.ts`. Import de `requireRole` adicionado.
  - [x] T3.2 — Guard inserido ANTES do parse do body (entre o destructuring de `auth` e o `try { body = await request.json() }`).

- [x] **T4** — Hardening da whitelist em `confirm/route.ts` (AC4)
  - [x] T4.1 — Declarado `const ALLOWED_ACTION_TYPES = ["pause_campaign", "resume_campaign", "set_daily_budget"] as const` no topo do arquivo, fora da funcao POST.
  - [x] T4.2 — Tipo `ActionCard.type` alterado para `typeof ALLOWED_ACTION_TYPES[number]`.
  - [x] T4.3 — Validacao inline `const validTypes = [...]` (que retornava 400 INVALID_ACTION_TYPE) substituida por verificacao contra `ALLOWED_ACTION_TYPES`, retornando 403 `{"error": "ACTION_TYPE_NOT_ALLOWED"}`.
  - [x] T4.4 — `switch (card.type)` cobre exatamente os tres tipos; type-check passou limpo. (Nota: o switch ja era exaustivo; adicionar um novo tipo a `ALLOWED_ACTION_TYPES` sem case correspondente produziria erro de tipo no `metaBody`/`actionLabel` por uso antes de atribuicao.)
  - [x] T4.5 — Verificado: `agent-chat-panel.tsx` NAO trata `INVALID_ACTION_TYPE` nem inspeciona o body/codigo de erro — o handler `execute()` so checa `res.ok`. A mudanca 400→403 cai no mesmo ramo `!res.ok`. Nenhuma alteracao no componente necessaria (no-op).

- [x] **T5** — Verificacao de tipos e lint
  - [x] T5.1 — `npm run type-check` (script real; story dizia `typecheck`) no workspace `packages/web` — zero erros. Rodado via `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (o script padrao causava OOM no V8 — limitacao de ambiente, nao erro de tipo).
  - [x] T5.2 — `npm run lint` (eslint) nos tres arquivos modificados — zero erros/warnings.

- [ ] **T6** — Testes manuais (cenarios do Testing) — PENDENTE: requer app rodando + usuarios por role no ambiente DEV (xnxvygyfyyyzwhiuoehz). Nao executados neste ambiente; ver Completion Notes.
  - [ ] T6.1 — Testar `action/cancel` com role `admin`: cancela normalmente (200)
  - [ ] T6.2 — Testar `action/cancel` com role `broker`: retorna 403
  - [ ] T6.3 — Testar `action/confirm` com `type = "delete_lead"` (fora da whitelist) e role `admin`: retorna 403 com `ACTION_TYPE_NOT_ALLOWED`
  - [ ] T6.4 — Testar `action/confirm` com `type = "pause_campaign"` e role `admin`: processa normalmente (200)
  - [ ] T6.5 — Regressao de midia para nao-admin: logar como `supervisor`, acessar `/dashboard/campaigns/meta`, verificar que FAB esta visivel, abrir painel, enviar pergunta de midia — agente responde sem 403
  - [ ] T6.6 — Regressao de midia para admin: logar como `admin`, painel funciona, confirm/cancel de acoes de midia funcionam

---

## Dev Notes

### Arquivo novo — utilitario `isAdmin`

Arquivo sugerido: `packages/web/src/lib/agent/auth-helpers.ts`

Se ja existe um arquivo de helpers do agente (ex.: `packages/web/src/lib/agent/utils.ts`), adicionar la. Nao criar arquivo novo se ja ha um lugar natural.

```typescript
import type { AppUser } from "@web/lib/api-auth"; // ajustar import conforme tipo real

/**
 * Verifica se o usuario possui role admin estrito.
 *
 * Contrato para Story 52-2:
 * - Parametro: `user` — objeto AppUser retornado por requireAuth() (campo role da tabela users)
 * - Retorno: true somente se user.role === 'admin'; false para qualquer outro role
 * - Fonte do role: appUser.role (tabela users, preenchida no fluxo de auth existente)
 * - NÃO usa canAccess(), NÃO usa is_admin_or_supervisor()
 *
 * Uso na 52-2 (context-builder.ts):
 *   const admin = isAdmin(appUser);
 *   if (admin) { // injetar contexto CRM } else { // retornar contexto apenas de midia }
 */
export function isAdmin(user: AppUser): boolean {
  return user.role === "admin";
}
```

### Padrao de guard de API (copiar de `confirm/route.ts`)

```typescript
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const forbidden = requireRole(appUser, ["admin"])
  if (forbidden) return forbidden

  // ... resto da logica
}
```

Aplicar identicamente em `cancel/route.ts`. Verificar em T1.2 se a estrutura atual do arquivo usa `auth.supabase` ou outra desestruturacao — adaptar sem inventar.

### Whitelist de action_card — mudanca de status code (400 → 403)

A mudanca de `400 INVALID_ACTION_TYPE` para `403 ACTION_TYPE_NOT_ALLOWED` e intencional: um `type` desconhecido nao e erro de formato (o JSON e valido), e uma tentativa de executar acao nao autorizada. 403 e semanticamente correto para enforcement de whitelist de seguranca.

Verificar se `agent-chat-panel.tsx` trata o codigo de erro `INVALID_ACTION_TYPE` com logica condicional (ex.: mensagem diferente no UI). Se sim, atualizar para `ACTION_TYPE_NOT_ALLOWED`. Se nao ha tratamento especifico, nenhuma alteracao no componente e necessaria.

### O que NAO modificar

- `packages/web/src/app/api/agent/chat/route.ts` — nao adicionar guard de role; nao-admin continua usando o agente para midia
- `packages/web/src/app/api/agent/chat/sessions/route.ts` — idem
- `packages/web/src/app/api/agent/chat/[session_id]/route.ts` — idem
- `packages/web/src/components/agent/agent-chat-panel.tsx` — nao ocultar FAB; comportamento atual correto
- `packages/web/src/app/dashboard/campaigns/meta/page.tsx` — nao alterar derivacao de `isAdmin` (o painel continua para todos)
- `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/page.tsx` — idem
- Qualquer arquivo de `packages/ai` — esta story nao toca a IA Nicole (CON-4)
- Arquivos de migration / schema — sem alteracao de banco nesta story

### Sem migration de banco

Esta story nao cria nem altera nenhum arquivo de migration. E TypeScript puro.

### Observacao sobre `appUser.role` vs JWT `app_metadata.role`

O `requireAuth()` de `api-auth.ts` retorna `appUser` com o campo `role` lido da tabela `users` (ou populado pelo middleware de auth). Verificar em T1.1 qual campo exato esta disponivel. A consistencia entre `users.role` e `app_metadata.role` do JWT e responsabilidade do fluxo de auth existente — nao reimplementar.

---

## Testing

### Abordagem

- Testes manuais por role usando o ambiente Supabase DEV isolado (`xnxvygyfyyyzwhiuoehz`) — NAO usar prod
- Verificacao de tipos (`typecheck`) e lint como gates automaticos
- Nenhum novo arquivo de teste unitario e obrigatorio (a logica e trivial e coberta por teste manual); se o @dev quiser adicionar teste unitario para `isAdmin`, e bem-vindo mas nao bloqueante

### Cenarios de teste

1. **Action cancel — role admin (positivo):**
   `POST /api/agent/action/cancel` com usuario `admin` e `message_id` valido → processa normalmente (200)

2. **Action cancel — role broker (negativo — assimetria fechada):**
   `POST /api/agent/action/cancel` com usuario `broker` → retorna 403 `{"error": "Forbidden"}`. Antes desta story, retornaria 200 ou 404.

3. **Action cancel — role supervisor (negativo):**
   `POST /api/agent/action/cancel` com usuario `supervisor` → retorna 403.

4. **Whitelist de action_card — tipo invalido:**
   `POST /api/agent/action/confirm` com `action_card.type = "delete_lead"` e usuario `admin` → retorna 403 `{"error": "ACTION_TYPE_NOT_ALLOWED"}`

5. **Whitelist de action_card — tipo invalido, role qualquer:**
   `POST /api/agent/action/confirm` com `action_card.type = "export_leads"` e usuario `admin` → retorna 403 `{"error": "ACTION_TYPE_NOT_ALLOWED"}`. O enforcement da whitelist vale para todos os roles.

6. **Whitelist de action_card — tipos validos (regressao):**
   `POST /api/agent/action/confirm` com `action_card.type = "pause_campaign"`, `"resume_campaign"` e `"set_daily_budget"` com usuario `admin` → cada um processa normalmente (200)

7. **Regressao midia — nao-admin (critico):**
   Logar como `supervisor`, acessar `/dashboard/campaigns/meta`. Verificar: (a) FAB laranja visivel, (b) clicar no FAB → painel abre, (c) digitar "qual o CPL da minha melhor campanha?" → agente responde com dados de midia, sem 403, sem erro.

8. **Regressao midia — gerente-comercial:**
   Mesmo cenario do teste 7 com role `gerente-comercial`. Resultado identico esperado.

9. **Regressao completa para admin:**
   Logar como `admin`, acessar `/dashboard/campaigns/meta`, FAB visivel, painel abre, mensagem enviada processada, action_card de `pause_campaign` confirmado com sucesso.

10. **Isola `isAdmin` — supervisor com excecao de permissao "sistema":**
    Dado um usuario `supervisor` que tem excecao de permissao para o modulo "sistema" (via Story 35-6), verificar que o utilitario `isAdmin` retorna `false` para ele — a verificacao e sobre `role === 'admin'`, nao sobre `canAccess`. (Este teste valida que a 52-2 nao injetara contexto CRM para esse usuario mesmo que ele tenha excecao de modulo.)

---

## Riscos

| ID | Risco | Severidade | Mitigacao |
|----|-------|-----------|-----------|
| R1 | Guard de cancel inserido em posicao errada (apos parse do body em vez de antes) | Media | T3.2 verifica posicao; espelhar exatamente o confirm |
| R2 | Mudanca de status code 400→403 quebra tratamento de erro no frontend | Baixa | T4.5 verifica se `agent-chat-panel.tsx` trata o erro com logica especifica; atualizar se necessario |
| R3 | `appUser.role` nao disponivel no objeto retornado por `requireAuth()` | Media | T1.1 verifica campo disponivel antes de qualquer editar; se nao existir, verificar middleware de auth |
| R4 | Nao-admin recebe 403 inesperado em alguma rota de chat (regressao) | Alta | Cenarios 7 e 8 validam explicitamente; nenhuma rota de chat deve ser tocada nesta story |
| R5 | `isAdmin` importado pela 52-2 com caminho errado (import quebrado em prod) | Baixa | T5.1 typecheck captura importacao quebrada; definir o path absoluto no contrato do helper |

---

## Dependencies

- **Depende de:** Story 52-1 (camada de leitura e RLS no banco — fundacional; esta story pode ser desenvolvida em paralelo com 52-4 pois nao consome as views ainda, mas o sequenciamento do epico recomenda 52-1 concluida primeiro)
- **Bloqueia diretamente:** Story 52-2 (injecao de contexto — o `context-builder.ts` consome o utilitario `isAdmin` exportado por esta story para decidir a injecao de CRM)
- **Dependencias tecnicas:**
  - `packages/web/src/lib/api-auth.ts` (`requireAuth`, `requireRole`, tipo `AppUser`) — ja existe; apenas consumir
  - `packages/web/src/lib/permissions.ts` (`canAccess`) — NAO usar nesta story; o utilitario `isAdmin` e uma verificacao estrita de role, sem delegacao ao sistema de permissoes

---

## Definition of Done

- [x] Utilitario `isAdmin(user): boolean` exportado de arquivo acessivel para o `context-builder.ts` (`@web/lib/agent/auth-helpers`)
- [x] `isAdmin` implementado com verificacao estrita `user.role === 'admin'` (sem `canAccess`, sem `is_admin_or_supervisor()`)
- [x] Contrato documentado em JSDoc no proprio arquivo do utilitario
- [x] Guard `requireRole(appUser, ["admin"])` adicionado em `POST /api/agent/action/cancel`
- [x] `ALLOWED_ACTION_TYPES` declarado como constante em `confirm/route.ts`; `type` fora da whitelist retorna 403 com `ACTION_TYPE_NOT_ALLOWED`
- [x] `POST /api/agent/chat` NAO possui guard de role — nao-admin continua funcionando para midia (rota nao tocada)
- [ ] FAB do agente continua visivel para nao-admin — verificado pelos cenarios 7 e 8 (PENDENTE teste manual; codigo do FAB nao foi tocado)
- [ ] Admin acessa painel e acoes normalmente — verificado pelo cenario 9 (PENDENTE teste manual)
- [ ] Action_card com `type` fora da whitelist retorna 403 — cenario 4 (PENDENTE teste manual; logica implementada e type-checked)
- [ ] Action cancel com role nao-admin retorna 403 — cenarios 2 e 3 (PENDENTE teste manual; guard implementado)
- [x] `npm run type-check` (script real) sem erros novos
- [x] `npm run lint` sem warnings novos (nos arquivos tocados)
- [ ] @qa executou quality gate com verdict PASS ou CONCERNS documentados e aceitos
- [ ] @devops fez push do commit final

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI nao esta habilitado em `core-config.yaml`.
> Validacao de qualidade usara processo de revisao manual pelo @qa.

---

## Change Log

| Data | Versao | Descricao | Autor |
|------|--------|-----------|-------|
| 2026-06-15 | 0.1 | Story drafted a partir do Epic 52 e inspecao direta do codigo existente; ambiguidade de visibilidade do painel documentada como Questao Aberta para @po resolver | @sm (River) |
| 2026-06-15 | 0.2 | Reescrita completa apos decisao travada pelo PO: somente capacidade de CRM e admin-only; painel de midia mantido para todos os roles sem regressao. Removidos: guard 403 para nao-admin em /api/agent/chat, ocultacao do FAB para nao-admin, alteracao de derivacao de isAdmin nas pages. Adicionados: utilitario isAdmin exportavel com contrato documentado (consumido pela 52-2), AC7 de nao-regressao para nao-admin, cenarios de teste de regressao de midia. Defesa em profundidade reencuadrada sobre acesso ao dado de CRM (nao sobre o endpoint de chat inteiro). Complexidade revisada de M para S. | @sm (River) |
| 2026-06-15 | 0.3 | Validacao PO (checklist 10/10) — veredito GO. Status Draft → Ready. Reinterpretacao de FR-7 (capacidade CRM admin-only, nao o painel de midia) confirmada como alinhada a decisao do stakeholder. Contrato do utilitario isAdmin aprovado como fonte unica para o gate da 52-2. | @po (Pax) |
| 2026-06-16 | 0.5 | Quality gate @qa (Quinn) — veredito **PASS** (7/7 dimensoes; tests = CONCERNS nao-bloqueante). Revisao estatica + gates re-executados independentemente (eslint 0/0; tsc 0 erros com heap 8192). CON-5 confirmado sem regressao (rotas de chat e FAB intactos). isAdmin estrito validado contra is_admin_or_supervisor() (1 vs 4 roles). Spot-check HTTP por role recomendado quando o app rodar. Status Review → Done (validado estaticamente/em dev; commit/push PROD pendente @devops). Gate: docs/qa/gates/52.3-admin-guard-readonly-enforcement.yml | @qa (Quinn) |
| 2026-06-16 | 0.4 | Implementacao (T1-T5). Criado `auth-helpers.ts` com `isAdmin` (CREATE justificado por IDS). Guard `requireRole` em `cancel/route.ts` (simetria com confirm). Whitelist `ALLOWED_ACTION_TYPES` + 403 `ACTION_TYPE_NOT_ALLOWED` em `confirm/route.ts`. type-check e lint limpos. T4.5 confirmado no-op (panel nao inspeciona codigo de erro). T6 (testes manuais por role) pendente — requer app + usuarios. Rotas de chat e FAB nao tocados (CON-5). Status Ready → Review. | @dev (Dex) |

---

## Dev Agent Record

### Agent Model Used
Claude Opus 4.8 (1M context) — @dev (Dex)

### Debug Log References
- `npx tsc --noEmit` (com `--max-old-space-size=8192`): zero erros de tipo.
- `npx eslint` nos 3 arquivos tocados: zero erros/warnings.

### Completion Notes List

**Implementacao concluida (T1-T5). T6 (testes manuais) pendente — ver abaixo.**

1. **Utilitario `isAdmin` (AC1, AC2)** — criado `packages/web/src/lib/agent/auth-helpers.ts`. IDS: busca confirmou que NAO existe helper `isAdmin` em `api-auth.ts` nem arquivo de helpers do agente (`src/lib/agent/` contem apenas `context-builder.ts` e `system-prompt.ts`) → decisao CREATE justificada (nenhum candidato a REUSE/ADAPT). Implementacao estrita `user.role === 'admin'`, importa o tipo `AppUser` de `@web/lib/api-auth`. JSDoc documenta o contrato completo para a 52-2 (assinatura, fonte do role, import path absoluto, exemplo de uso). NAO usa `canAccess()` nem `is_admin_or_supervisor()`.

2. **Guard em `cancel/route.ts` (AC3, AC5, AC8)** — adicionado import de `requireRole` e o bloco `const forbidden = requireRole(appUser, ["admin"]); if (forbidden) return forbidden;` imediatamente apos `const { supabase, appUser } = auth` e ANTES do parse do body. Espelha exatamente o padrao de `confirm/route.ts` (mesma posicao relativa, mesmo helper, mesmo body de erro `{"error":"Forbidden"}`).

3. **Hardening da whitelist em `confirm/route.ts` (AC4)** — `ALLOWED_ACTION_TYPES` declarado como `const ... as const` no topo do modulo; `ActionCard.type` tipado como `typeof ALLOWED_ACTION_TYPES[number]`; validacao inline (`validTypes` → 400 `INVALID_ACTION_TYPE`) substituida por checagem contra `ALLOWED_ACTION_TYPES` → 403 `ACTION_TYPE_NOT_ALLOWED`. Vale para todos os roles.

**Divergencias do que a story previa (código real vs. story):**
- Scripts npm: a story instrui `npm run typecheck` / `npm run lint`; os scripts reais em `packages/web/package.json` sao `type-check` e `lint`. Usei os reais.
- `type-check` padrao causou OOM no V8 (crash de heap, nao erro de tipo). Rodei `tsc --noEmit` com `--max-old-space-size=8192` — passou limpo. Limitacao de ambiente, registrada para o @qa/@devops.
- Destructuring em `cancel/route.ts` e `const { supabase, appUser } = auth` (a story usava `auth.error`/`auth.supabase` como hipotese) — adaptado ao codigo real, sem inventar.
- T4.5: `agent-chat-panel.tsx` NAO inspeciona o codigo de erro (`INVALID_ACTION_TYPE`/body) — o handler `execute()` so verifica `res.ok`. A mudanca de status 400→403 nao requer alteracao no componente (no-op confirmado).

**NAO modificado (escopo travado, conforme story/epic):**
- `/api/agent/chat` (POST/GET), `chat/sessions`, `chat/[session_id]` — sem guard de role; nao-admin continua usando o agente para midia (CON-5).
- `agent-chat-panel.tsx` — FAB e painel intactos para todos os roles.
- pages-server de `campaigns-meta` — derivacao de `isAdmin` inalterada.
- Nenhuma migration/SQL.

**Pendente de teste manual (T6 / AC6 / AC7) — requer app rodando + usuarios por role no Supabase DEV (xnxvygyfyyyzwhiuoehz), nao disponivel neste ambiente:**
- Cenario 1/T6.1: `action/cancel` com `admin` → 200.
- Cenario 2/T6.2: `action/cancel` com `broker` → 403 `{"error":"Forbidden"}` (antes retornaria 200/404 — assimetria fechada).
- Cenario 3: `action/cancel` com `supervisor` → 403.
- Cenario 4/T6.3: `action/confirm` com `type="delete_lead"` (admin) → 403 `ACTION_TYPE_NOT_ALLOWED`.
- Cenario 5: `action/confirm` com `type="export_leads"` (admin) → 403 `ACTION_TYPE_NOT_ALLOWED`.
- Cenario 6/T6.4: `action/confirm` com `pause_campaign`/`resume_campaign`/`set_daily_budget` (admin) → 200 (regressao).
- Cenario 7/T6.5 (CRITICO): `supervisor` em `/dashboard/campaigns/meta` → FAB visivel, painel abre, pergunta de midia respondida sem 403.
- Cenario 8: idem com `gerente-comercial`.
- Cenario 9/T6.6: regressao completa admin (painel + confirm/cancel de midia).
- Cenario 10: `isAdmin` retorna `false` para `supervisor` com excecao de modulo "sistema" (verificacao e sobre `role`, nao `canAccess`) — coberto por inspecao de codigo (helper le `user.role` literalmente, sem delegacao).

### File List

#### Modified
- `packages/web/src/app/api/agent/action/cancel/route.ts` — import de `requireRole` + guard `requireRole(appUser, ["admin"])` apos auth, antes do parse do body
- `packages/web/src/app/api/agent/action/confirm/route.ts` — `ALLOWED_ACTION_TYPES` como const nomeada; `ActionCard.type` retipado; validacao → 403 `ACTION_TYPE_NOT_ALLOWED`

#### Created
- `packages/web/src/lib/agent/auth-helpers.ts` — utilitario `isAdmin(user: AppUser): boolean` com contrato JSDoc para a 52-2

---

## QA Results

### Review Date: 2026-06-16

### Reviewed By: Quinn (Test Architect / Guardian)

### Tipo de revisao
TypeScript de baixo risco (helper + hardening). Revisao majoritariamente ESTATICA, com gates automaticos (type-check + lint) re-executados de forma independente.

### Avaliacao por dimensao (7 checks)

1. **Code review — PASS.** `isAdmin` faz verificacao estrita `return user.role === "admin"` (grep confirmou ausencia de `canAccess` e `is_admin_or_supervisor()` no arquivo). JSDoc completo e suficiente para a 52-2 consumir sem ler outros arquivos (assinatura, fonte do `role`, import path absoluto, exemplo de uso). O guard em `cancel/route.ts` espelha exatamente o `confirm`: `requireRole(appUser, ["admin"])` apos `requireAuth()` e ANTES do parse do body, reusando o helper de `@web/lib/api-auth`. Whitelist e `as const`; `ActionCard.type = typeof ALLOWED_ACTION_TYPES[number]`; type fora da lista → 403 `ACTION_TYPE_NOT_ALLOWED`.

2. **AC mapping — PASS.** AC1, AC2, AC3, AC4, AC5, AC8 atendidos e verificados estaticamente contra o codigo real. AC6 e AC7 (nao-regressao em runtime) cobertos por inspecao de codigo (FAB/painel nao gated; rotas de chat intactas) — spot-check manual recomendado, nao-bloqueante.

3. **No regression (CON-5 — CRITICO) — PASS.** As tres rotas de chat (`chat/route.ts`, `chat/sessions/route.ts`, `chat/[session_id]/route.ts`) importam apenas `requireAuth` — nenhum `requireRole`/`isAdmin`. O FAB e o painel NAO foram ocultados: a prop `isAdmin` em `agent-chat-panel.tsx` gateia somente os botoes confirm/cancel dentro do action_card (linha 182), nao o painel. As pages-server de campaigns-meta nao foram alteradas. `git status` confirma exatamente os 3 arquivos do File List, sem scope creep.

4. **Performance — PASS.** N/A material. Mudancas triviais em memoria; nenhum I/O ou custo introduzido.

5. **Security — PASS.** A mudanca 400→403 e semanticamente correta (type desconhecido nao e erro de formato — JSON valido — e sim tentativa de acao nao autorizada). A whitelist e allowlist (default-deny): qualquer type de CRM/desconhecido cai no 403. O guard de `cancel` fecha a assimetria (antes qualquer autenticado cancelava acao de admin). `isAdmin` (1 role) e estritamente mais restrito que `is_admin_or_supervisor()` (migration 084: admin/supervisor/obras/gerente-comercial — 4 roles) — escolha correta para o gate de CRM da 52-2, que sem isso vazaria PII para nao-admins.

6. **Docs — PASS.** Dev Agent Record e File List precisos e completos; divergencias de ambiente (scripts reais `type-check`/`lint`, OOM no V8, destructuring real de `auth`, no-op de T4.5) registradas com honestidade. Contrato do `isAdmin` claro para a 52-2.

7. **Tests — CONCERNS (nao-bloqueante).** Os testes HTTP por role (cancel 403, whitelist 403, regressao de midia para supervisor/gerente-comercial) NAO foram executados — exigem app Next.js rodando + usuarios por role no DEV (`xnxvygyfyyyzwhiuoehz`). A logica e trivial e verificavel estaticamente com alta confianca. Spot-check manual recomendado quando o app rodar.

### Gates automaticos re-executados (independente do @dev)
- **Lint:** `npx eslint` nos 3 arquivos tocados → zero erros/warnings (exit 0).
- **Type-check:** `npx tsc --noEmit` com `NODE_OPTIONS=--max-old-space-size=8192` → zero diagnosticos. Confirmado: o script padrao sofre OOM no V8 (limitacao de ambiente, nao erro de codigo).

### Spot-check manual recomendado (nao-bloqueante, quando o app rodar)
- `action/cancel`: admin → 200; broker/supervisor → 403 `{"error":"Forbidden"}`.
- `action/confirm`: type fora da whitelist (ex. `delete_lead`/`export_leads`) → 403 `ACTION_TYPE_NOT_ALLOWED`; types validos → 200.
- Regressao de midia: `supervisor` e `gerente-comercial` em `/dashboard/campaigns/meta` veem o FAB, abrem o painel e recebem resposta de midia sem 403.

### Gate Status

Gate: PASS → docs/qa/gates/52.3-admin-guard-readonly-enforcement.yml

### Recommended Status

**Done** — QA PASS + validado estaticamente (gates re-executados). Honestidade: "Done" aqui significa QA aprovado e logica verificada estaticamente; os testes HTTP por role sao spot-check recomendado quando o app rodar (nao-bloqueante), e commit/push para PROD permanece passo do @devops. Mesmo padrao adotado nas 52-1/52-4.

— Quinn, guardiao da qualidade 🛡️
