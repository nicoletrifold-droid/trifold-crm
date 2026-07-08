# Story 78-9 — UI do Painel de Saúde & Billing (admin-only)

## Metadata
- **Epic:** 78 — Painel de Saúde & Billing da Plataforma
- **Story:** 78-9
- **Status:** InReview
- **Priority:** P1 — é a entrega de valor visível ao usuário ("lembrar as faturas, trazer os valores, ter links diretos")
- **Complexity:** M (1 rota API + 1 página + ~4 componentes; sem migration; ~6-8h)
- **Created:** 2026-07-08
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @ux-design-expert (Uma)
- **Quality Gate:** @dev (Dex)
- **Quality Gate Tools:** `[ui_review, accessibility_check, admin_guard_review, empty_state_review]`

> Nota de sequenciamento (fora de ordem, por pedido explícito do usuário): o épico recomenda `78-1 → 78-2 → 78-3(padrão coletor) → 78-4..78-7 → 78-8 → 78-9`. Esta story foi redigida a pedido direto do usuário ("é a UI que o usuário vê"), **depois** de já existirem no repositório as Stories 78-1 (`Ready`), 78-2, 78-3 e 78-8 (todas `Draft`, mesmo autor @sm) — portanto os contratos de dados e de API dessas quatro já estão fixados e são reusados diretamente aqui (ver Dev Notes e Dependencies). Ainda faltam 78-4, 78-5, 78-6, 78-7, 78-10 como stories formais. **Esta story não deve entrar em `*develop` antes de 78-1 estar aplicada em DEV**, e o valor pleno (coleta automática populando os cards, cadastro de vencimentos funcionando) só aparece após 78-2/78-3(+adaptações 78-4..78-7)/78-8 estarem implementadas — até lá, a UI deve funcionar corretamente em **estado degradado/vazio** (ver AC8), o que já é parte do escopo testável desta story.

---

## User Story

**Como** administrador do Trifold CRM,
**Quero** um painel único (admin-only) que mostre a saúde de coleta, o gasto do mês e o próximo vencimento de cada serviço/integração da plataforma, com link direto para o billing de cada fornecedor,
**Para que** eu nunca esqueça de pagar uma fatura crítica e tenha visibilidade do gasto agregado sem precisar abrir o painel de cada fornecedor separadamente.

---

## Context

O Epic 78 entrega o schema (Story 78-1, `Ready`), o provisionamento de secrets (78-2), os coletores automáticos de Anthropic/OpenAI/Vercel (78-3/78-4/78-5), o coletor parcial de WhatsApp (78-6), o fallback manual de Supabase/Resend (78-7) e o motor de lembretes (78-8). Todas essas stories escrevem dado nas 3 tabelas criadas pela 78-1. **Esta story (78-9) é a única que o usuário efetivamente vê**: ela lê essas 3 tabelas e renderiza o "painel de saúde".

Frase-guia do usuário (repetida no epic): *"Lembrar as faturas, trazer os valores e ter links diretos para consultar os billings de cada plataforma."*

O padrão de referência mais próximo já existe no próprio projeto: `packages/web/src/app/dashboard/sistema/page.tsx` já implementa exatamente esse tipo de "painel de saúde" — cards de status coloridos (verde/amarelo/vermelho), grid de métricas, uma seção de custo estimado do WhatsApp com link direto para a fatura na Meta ("Fatura na Meta ↗"), tudo em Tailwind puro (sem biblioteca de componentes tipo shadcn/ui — **confirmado**: não há `@radix-ui` nem shadcn instalado neste pacote; a pasta `packages/web/src/components/ui/` só tem 2 átomos pequenos, `source-badge.tsx` e `scrollable-x.tsx`). Esta story deve **reusar esse padrão visual diretamente**, não inventar um novo design system.

**Reuso explícito de stories-irmãs já existentes (IDS REUSE > ADAPT > CREATE):** esta story **não** cria uma segunda forma de ler/escrever vencimentos. A Story 78-8 (Draft) já define e fixa a API `GET /api/admin/billing-reminders` (lista `service_billing_reminders` com join em `platform_services`, ordenada por `due_date`) — a seção "Próximos vencimentos" desta UI **consome essa API existente**, não reimplementa a query. Da mesma forma, a Story 78-3 (Draft) já fixa os valores reais de `metric`/`currency` gravados em `service_cost_snapshots` (`cost_usd` com `currency='USD'`; `tokens_input`/`tokens_output` com `currency=null`) — a regra de agregação desta story (filtrar por `currency IS NOT NULL`) é validada por esse contrato real, não é só uma inferência teórica do schema da 78-1.

---

## Scope

### IN (esta story entrega)
- Rota de API admin-only `packages/web/src/app/api/admin/billing-panel/route.ts` (GET) que:
  - Verifica autenticação + `role === "admin"` via `requireAuth()` + `requireRole(appUser, ["admin"])` (mesmo padrão de `packages/web/src/app/api/admin/agent-prompts/route.ts`, **já reusado nesta mesma sequência do épico pela Story 78-8** — ver Dev Notes) — `401` sem sessão, `403` para role diferente de admin.
  - Lê **apenas** `platform_services` e `service_cost_snapshots` (contrato fixado na Story 78-1; valores reais de `metric`/`currency` confirmados na Story 78-3). **Não** lê `service_billing_reminders` — essa tabela já tem API própria (ver abaixo).
  - Agrega: gasto do mês corrente por serviço, gasto total consolidado (excluindo `meta_ads`), status de coleta por serviço (mais recente do mês).
- Página `packages/web/src/app/dashboard/sistema/billing/page.tsx` (client component, `"use client"`, mesmo padrão de fetch + polling de `dashboard/sistema/emails/page.tsx` e `dashboard/sistema/page.tsx`):
  - Cards de serviço (nome, categoria, badge de status de coleta, gasto do mês, "atualizado há X", deep-link do billing) — dado de `GET /api/admin/billing-panel` (rota nova desta story).
  - Indicador visual quando `billing_url_confirmed = false`.
  - Seção "Próximos vencimentos" (lista ordenada por proximidade, destaque para os que estão dentro da janela `alert_days_before`) — dado consumido de `GET /api/admin/billing-reminders`, **API já fixada e entregue pela Story 78-8** (esta story **reusa** essa rota, não reimplementa a query de vencimentos — ver Dev Notes/Dependencies).
  - Total consolidado do mês (soma dos serviços não-Meta-Ads).
  - Seção **separada** para Meta Ads (só renderizada se `platform_services.meta_ads.enabled = true`; hoje é `false` pós-78-1 — ver Dev Notes).
  - Estados vazio (nenhum snapshot/lembrete ainda) e erro (falha em qualquer uma das duas chamadas de API) tratados sem quebrar o layout.
- Link de navegação para a nova página a partir do hub `packages/web/src/app/dashboard/sistema/page.tsx` (mesmo padrão da seção "Email Marketing" já existente ali).

### OUT (não entra nesta story)
- Qualquer coletor de custo (Anthropic/OpenAI/Vercel/WhatsApp/Supabase/Resend) — 78-3 (contrato + Anthropic) a 78-7.
- CRUD de cadastro/edição de vencimentos e motor de lembretes/notificação, e a própria rota `GET /api/admin/billing-reminders` — tudo isso é escopo e entrega da Story 78-8 (esta story só **consome** essa API como cliente HTTP; não cria formulário de cadastro nem reimplementa a query).
- Provisionamento de secrets — 78-2.
- Habilitar ou implementar o módulo real de Meta Ads spend — 78-10 (esta story só decide *como* a seção apareceria **se e quando** `enabled = true`; hoje ela fica oculta).
- Conversão de moeda BRL↔USD (NFR-7 do épico proíbe isso).
- Qualquer alteração de schema/migration (nenhuma migration nesta story).

---

## Acceptance Criteria

- [x] **AC1 — Acesso admin-only (rota + API):** A página `/dashboard/sistema/billing` só é utilizável por usuários com `role === "admin"`. A rota `GET /api/admin/billing-panel` retorna `401` sem sessão e `403` para qualquer role autenticado diferente de admin (`supervisor`, `broker`, `obras`, `gerente-comercial`), sem vazar dado parcial no corpo da resposta. A página trata o `401`/`403` explicitamente (mensagem "Acesso restrito a administradores" ou redirect — mesmo padrão de `emails/page.tsx`), nunca uma tela em branco ou crash.

- [x] **AC2 — Card por serviço com status + valor + deep-link:** Para cada linha de `platform_services` com `enabled = true` **exceto `meta_ads`** (que tem seção própria — AC6), renderizar um card contendo: nome do serviço, categoria, badge de status de coleta (ver mapeamento de `collection_status` nos Dev Notes), gasto do mês corrente (formatado na moeda de origem, ver AC7) ou "—" quando não há dado, timestamp relativo "atualizado há X" baseado no snapshot mais recente do serviço, e um link/botão que abre `billing_url` em nova aba (`target="_blank" rel="noreferrer"`).

- [x] **AC3 — Indicador de deep-link não confirmado:** Quando `platform_services.billing_url_confirmed = false` (hoje: `vercel` e `supabase`, conforme seed da Story 78-1), o card exibe um indicador visual (badge/ícone/tooltip) deixando claro que a URL é de melhor esforço e pode precisar de ajuste manual — sem impedir o clique no link.

- [x] **AC4 — Seção de vencimentos ordenada por proximidade (consome a API da Story 78-8):** Uma seção separada busca dados de `GET /api/admin/billing-reminders` (rota fixada e entregue pela Story 78-8 — **esta story não faz `SELECT` direto em `service_billing_reminders`**) e lista os registros com `status IN ('pending', 'alerted')`, ordenados por `due_date` ascendente (mais próximo primeiro; a própria API da 78-8 já retorna ordenado por `due_date`, mas a UI não deve assumir isso sem checar — reordenar defensivamente no client é aceitável). Vencimentos cuja `due_date` está a `<= alert_days_before` dias da data atual (America/Sao_Paulo) recebem destaque visual (cor/badge, ex. mesmo padrão semântico amarelo/vermelho de `HEALTH_STYLES` em `dashboard/sistema/page.tsx`). Quando não há nenhum vencimento cadastrado, **ou quando a rota `GET /api/admin/billing-reminders` ainda não existir** (caso 78-9 seja implementada antes de 78-8 — ver nota de sequenciamento), exibir estado vazio explicativo (ex. "Nenhum vencimento cadastrado ainda"), não uma lista vazia sem contexto nem erro fatal.

- [x] **AC5 — Total consolidado do mês (sem Meta Ads):** Exibir um valor de "gasto total do mês" somando os valores monetários do mês corrente de todos os serviços `enabled = true` **exceto `meta_ads`**. Este total nunca inclui gasto de mídia do Meta Ads (CON-8 do épico).

- [x] **AC6 — Meta Ads em seção separada e opcional:** Existe uma seção visualmente distinta (rótulo claro, ex. "Budget de Mídia — Meta Ads", não misturada com o total consolidado) que só é renderizada quando `platform_services` tem uma linha `slug = 'meta_ads'` com `enabled = true`. No estado atual (pós Story 78-1, `meta_ads.enabled = false`), a seção **não aparece** (nem como card vazio nem como erro) — a ausência é um estado válido, não uma falha.

- [x] **AC7 — Moeda coerente, sem conversão:** Cada valor monetário exibido mostra a moeda de origem (`USD` ou `BRL`, conforme a coluna `currency` do dado agregado). Se, num mesmo serviço ou no total consolidado, houver valores em mais de uma moeda no mesmo período, eles são exibidos **separadamente** (nunca somados aritmeticamente entre moedas diferentes). Nenhuma taxa de câmbio é aplicada em nenhum lugar da UI.

- [x] **AC8 — Estados vazio e de erro tratados (funciona antes de 78-2/78-4..78-7 estarem em produção):** Com o schema da 78-1 aplicado mas **nenhum coletor automático ainda rodando de fato em produção** (estado esperado até 78-2/78-3(adaptações)/78-4..78-7 estarem implementadas e com secrets válidos), a página carrega sem erro: os 6 cards de serviço (Anthropic, OpenAI, Vercel, WhatsApp, Supabase, Resend) aparecem com status "Sem dado" e gasto "—"; a seção de vencimentos mostra o estado vazio da AC4 (cobrindo tanto "sem vencimento cadastrado" quanto "rota `/api/admin/billing-reminders` da 78-8 ainda não implementada/retornando 404"); o total consolidado mostra "—" ou "R$/US$ 0,00" com uma nota indicando ausência de coleta (não um erro/crash). Falha de rede/API (`5xx`, timeout) em qualquer uma das duas chamadas (`/api/admin/billing-panel` e `/api/admin/billing-reminders`) é tratada com mensagem de erro amigável e não uma tela em branco — uma falha não deve impedir a outra seção de renderizar (isolamento de falha por seção, mesmo espírito do NFR-3 do épico aplicado à UI).

- [x] **AC9 — Navegação descobrível:** Um link/card para `/dashboard/sistema/billing` existe no hub `packages/web/src/app/dashboard/sistema/page.tsx`, seguindo o mesmo padrão visual da seção "Email Marketing" já existente ali (grid de links com ícone + label + descrição curta).

---

## Tasks / Subtasks

- [x] **T1** — Confirmar schema aplicado (pré-requisito, AC1-AC8)
  - [x] T1.1 — Confirmar que a migration `164_platform_services_billing.sql` (Story 78-1) está aplicada no Supabase DEV; se não estiver, **não prosseguir** — escalar para @data-engineer/@po.
  - [x] T1.2 — Reler contrato de dados fixado na Story 78-1 (seção "Contrato de Dados para 78-2..78-9") antes de escrever qualquer query.

- [x] **T2** — Criar rota API `GET /api/admin/billing-panel` (AC1, AC2, AC5, AC7)
  - [x] T2.1 — Guard admin: `const auth = await requireAuth(); if (auth.error) return auth.error; const roleError = requireRole(auth.appUser, ["admin"]); if (roleError) return roleError` (mesmo padrão de `packages/web/src/app/api/admin/agent-prompts/route.ts`, **e da própria Story 78-8** — ver Dev Notes; não usar o padrão inline mais antigo de `system-events/route.ts`).
  - [x] T2.2 — Query `platform_services` (todas as linhas `enabled = true`, ordenadas por `display_order`).
  - [x] T2.3 — Query `service_cost_snapshots` do mês corrente (America/Sao_Paulo) por `service_id`; agregar `SUM(value)` agrupado por `service_id, currency` **apenas onde `currency IS NOT NULL`** (ver Dev Notes — é o sinal que distingue métrica monetária de métrica de uso técnico no contrato da 78-1/78-3, ex. `cost_usd`+`currency='USD'` vs. `tokens_input`+`currency=null`).
  - [x] T2.4 — Determinar `collection_status` "efetivo" por serviço = status do snapshot mais recente (`collected_at` mais recente) daquele serviço no mês corrente; se não houver nenhum snapshot no mês, tratar como `"no_data"` (ver mapeamento nos Dev Notes).
  - [x] T2.5 — Calcular total consolidado do mês (soma por moeda, excluindo `meta_ads`).
  - [x] T2.6 — Montar payload de resposta (services + consolidated_total + generated_at). **Não incluir vencimentos aqui** — a UI busca vencimentos separadamente em `GET /api/admin/billing-reminders` (78-8, já existente).

- [x] **T3** — Criar página `packages/web/src/app/dashboard/sistema/billing/page.tsx` (AC1, AC8)
  - [x] T3.1 — `"use client"`, duas chamadas de fetch independentes (`/api/admin/billing-panel` e `/api/admin/billing-reminders`) em `useEffect` + `setInterval` de 30s (mesmo padrão de `dashboard/sistema/page.tsx` e `dashboard/sistema/emails/page.tsx`); falha em uma não deve impedir a outra de renderizar (AC8).
  - [x] T3.2 — Tratar `res.status === 401 || res.status === 403` (mensagem "Acesso restrito a administradores", igual ao padrão de `emails/page.tsx` que faz `router.push("/dashboard")`).
  - [x] T3.3 — Tratar `res.status === 404` da chamada a `/api/admin/billing-reminders` (caso 78-8 ainda não tenha sido implementada) como estado vazio da seção de vencimentos, não como erro (AC4, AC8).
  - [x] T3.4 — Tratar erro de rede/`!res.ok` (exceto 404 tratado acima) com mensagem amigável (mesmo padrão de `dashboard/sistema/page.tsx`, estado `error`).
  - [x] T3.5 — Tratar estado `loading` (placeholder "Carregando...").

- [x] **T4** — Componente de card de serviço (AC2, AC3)
  - [x] T4.1 — Badge de status de coleta com paleta de cores por estado (`ok`=verde, `manual`=azul/cinza, `no_data`=âmbar, `error`=vermelho) — reusar a paleta de `HEALTH_STYLES` de `dashboard/sistema/page.tsx` como referência de padrão (verde/âmbar/vermelho), adicionando a variação `manual`.
  - [x] T4.2 — Exibir gasto do mês formatado na moeda de origem (ver AC7, Dev Notes).
  - [x] T4.3 — Exibir "atualizado há X" (tempo relativo simples, calculado em JS a partir de `collected_at` — não existe helper de tempo relativo no projeto; implementar inline, ex. "há 2h", "há 3 dias", "nunca coletado").
  - [x] T4.4 — Botão/link de deep-link (`billing_url`, `target="_blank" rel="noreferrer"`), com indicador visual se `billing_url_confirmed = false`.

- [x] **T5** — Seção "Próximos vencimentos" (AC4)
  - [x] T5.1 — Lista ordenada por `due_date`.
  - [x] T5.2 — Destaque visual para vencimentos dentro de `alert_days_before` dias.
  - [x] T5.3 — Estado vazio explicativo.

- [x] **T6** — Seção consolidado + Meta Ads separado (AC5, AC6, AC7)
  - [x] T6.1 — Card/bloco de total consolidado do mês (por moeda, excluindo Meta Ads).
  - [x] T6.2 — Seção Meta Ads condicional (`enabled === true`); ausente quando `false` (estado atual).

- [x] **T7** — Navegação (AC9)
  - [x] T7.1 — Adicionar entrada em `packages/web/src/app/dashboard/sistema/page.tsx` apontando para `/dashboard/sistema/billing`, seguindo o grid de links já existente (seção "Email Marketing").

- [ ] **T8** — Validação manual (Testing) — pendente no QA gate (@qa/usuário em DEV)
  - [ ] T8.1 — Testar com usuário admin: painel carrega, cards aparecem com "Sem dado" (estado real pré-78-3..78-8).
  - [ ] T8.2 — Testar com usuário não-admin: API retorna 403, UI trata graciosamente.
  - [ ] T8.3 — Testar cenário de erro de API (ex. desligar rede) — mensagem amigável, sem crash.
  - [ ] T8.4 — Confirmar que Meta Ads não aparece (estado atual `enabled = false`).

---

## Dev Notes

### Arquivos a criar
- `packages/web/src/app/api/admin/billing-panel/route.ts` — rota GET consolidada
- `packages/web/src/app/dashboard/sistema/billing/page.tsx` — página principal (client component)
- Componentes auxiliares sugeridos (mesma pasta, padrão `_components/` já usado em `dashboard/sistema/emails/_components/`): `_components/service-card.tsx`, `_components/upcoming-reminders.tsx`, `_components/meta-ads-section.tsx` (renderizado condicionalmente)

### Arquivo a editar
- `packages/web/src/app/dashboard/sistema/page.tsx` — adicionar entrada de navegação para a nova página (AC9)

### Padrão de UI a REUSAR (evidência concreta, não inventar novo design system)
- **Referência primária:** `packages/web/src/app/dashboard/sistema/page.tsx` — já implementa exatamente o padrão "painel de saúde":
  - `HEALTH_STYLES` (linhas ~63-67): mapa `green/yellow/red` → `{ bg, dot, label }`, usado para status de saúde por categoria. Reusar esse mesmo padrão de 3 cores + adicionar variação neutra para `"manual"`.
  - `SectionHeader` (linhas ~76-84): componente pequeno de cabeçalho de seção com ícone `lucide-react` + título uppercase + meta opcional à direita. Reusar para as seções "Saúde dos serviços", "Próximos vencimentos", "Consolidado".
  - Seção WhatsApp (linhas ~242-305) é o exemplo mais próximo do que esta story precisa: cards de métrica em grid (`grid grid-cols-2 gap-3 lg:grid-cols-4`), com um link externo destacado no cabeçalho da seção (`<a href="https://business.facebook.com/billing_hub/accounts" target="_blank" rel="noreferrer">Fatura na Meta ↗</a>`) — **este é o padrão exato de deep-link a reusar** para os botões de billing dos cards de serviço.
  - Classe de card padrão do projeto: `"rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"` (repetida dezenas de vezes no arquivo) — usar literalmente essa classe para os novos cards.
- **Referência de composição de página:** `packages/web/src/app/dashboard/sistema/emails/page.tsx` — client component simples que faz fetch + polling de 30s e delega a UI para sub-componentes em `_components/` (`EmailStatsCards`, `EmailAlertsPanel`, `EmailLogsTable`). Replicar essa composição (página fina, lógica de exibição nos componentes).
- **Confirmado — sem shadcn/ui:** não há `@radix-ui` no `package.json` de `packages/web`; `packages/web/src/components/ui/` só contém `source-badge.tsx` e `scrollable-x.tsx` (2 átomos simples). Não introduzir uma biblioteca de componentes nova nesta story — usar Tailwind utilitário direto, como todo o resto de `dashboard/sistema/`.
- **Paleta de cores do projeto:** `stone` (neutro), `orange` (destaque/marca — usado em ícones e links, ex. `text-orange-600`), `emerald`/`red`/`amber` para semântica positiva/negativa/atenção. Seguir essa paleta.

### Padrão de admin guard (API) — REUSAR, não inventar novo (mesmo padrão da Story 78-8, irmã desta)
```ts
// packages/web/src/app/api/admin/agent-prompts/route.ts (padrão existente, reusado pela Story 78-8)
import { requireAuth, requireRole } from "@web/lib/api-auth"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin"])
  if (roleError) return roleError

  // RLS admin-only da Story 78-1 (AC5) já reforça isso na camada de dados —
  // requireRole é defesa em profundidade, não a única barreira.
  ...
}
```
Este é o padrão a aplicar em `/api/admin/billing-panel` — **o mesmo já escolhido pela Story 78-8** (`GET/POST/PATCH/DELETE /api/admin/billing-reminders`) para as rotas novas deste épico. `requireAuth()` retorna `401` (sem sessão), `404` (usuário sem linha em `users`) ou `403` (conta desativada, `is_active=false`) antes mesmo de checar o role; `requireRole(appUser, ["admin"])` retorna `403` para qualquer role diferente de admin. Usar `createClient()`/`supabase` retornado por `requireAuth()` (client vinculado à sessão) para as queries — a RLS admin-only da Story 78-1 reforça a autorização em segunda camada (defesa em profundidade).

**Existem 2 padrões de admin-guard no projeto** — importante não confundir:
1. `requireAuth()` + `requireRole()` de `@web/lib/api-auth.ts` — usado por `admin/agent-prompts/route.ts` e pela Story 78-8. **Este é o padrão a seguir aqui**, por consistência com a story-irmã do mesmo épico.
2. `getServerUser()` inline (`user.role !== "admin"`) de `@web/lib/auth.ts` — usado por rotas mais antigas como `system-events/route.ts` e `admin/email-stats/route.ts`. Não usar este padrão nesta story (evitar inconsistência dentro do próprio Epic 78).

Nota: existe também `isAdmin(user: AppUser): boolean` em `packages/web/src/lib/agent/auth-helpers.ts`, mas esse helper foi criado no contexto do agente de chat (Epic 52) e vive em `lib/agent/`; não é nenhum dos dois padrões acima e não deve ser importado aqui.

### Contrato de dados a consumir

**Direto (via `GET /api/admin/billing-panel`, esta story lê as tabelas):**
- `platform_services` (fixado na Story 78-1): `slug` (chave estável), `name`, `category`, `automation_tier`, `has_auto_cost_collection`, `billing_url`, `billing_url_confirmed`, `enabled`, `display_order`.
- `service_cost_snapshots` (fixado na Story 78-1, valores reais confirmados na Story 78-3): `service_id` (FK), `snapshot_date`, `metric` (texto livre, **sem CHECK/enum** — decisão deliberada da 78-1 para não travar os coletores 78-3..78-7; valores reais já usados pela 78-3 para Anthropic: `cost_usd` com `currency='USD'`, `tokens_input`/`tokens_output` com `currency=null`), `value`, `currency` (**nullable** — só preenchido quando a métrica é monetária), `collection_status` (`ok`/`manual`/`no_data`/`error`).
- **Regra de agregação derivada do contrato (confirmada pelo uso real em 78-3, não é só teoria):** como `metric` não tem enum fixo, a forma confiável de somar "gasto monetário do mês" sem hardcodar nomes de métrica por serviço é filtrar `service_cost_snapshots WHERE currency IS NOT NULL` — a Story 78-3 já grava exatamente `cost_usd`/`currency='USD'` (monetário) vs. `tokens_input`/`tokens_output`/`currency=null` (uso técnico), validando essa regra. Usar essa regra tanto no card por serviço (AC2) quanto no total consolidado (AC5).

**Indireto, via API já existente (esta story NÃO lê a tabela diretamente):**
- `service_billing_reminders` (fixado na Story 78-1: `service_id`, `due_date`, `expected_amount`, `currency`, `billing_cycle`, `alert_days_before`, `status`, `paid_at`) é consumida através de `GET /api/admin/billing-reminders`, **rota já especificada e entregue pela Story 78-8** (lista com join em `platform_services`, ordenada por `due_date`). Esta story 78-9 só faz `fetch("/api/admin/billing-reminders")` no client e renderiza — não duplica a query de vencimentos.

### Deep-links e `billing_url_confirmed` (seed real da Story 78-1)
| Slug | `billing_url_confirmed` (seed 78-1) |
|------|--------------------------------------|
| `anthropic` | `true` |
| `openai` | `true` |
| `vercel` | `false` (placeholder `[team]`) |
| `whatsapp` | `true` |
| `supabase` | `false` (placeholder `_`) |
| `resend` | `true` |
| `meta_ads` | `false`, e também `enabled = false` |

`vercel` e `supabase` devem mostrar o indicador de "link não confirmado" (AC3) no estado atual do seed. `meta_ads` não aparece de forma alguma hoje (AC6), pois `enabled = false`.

### Mapeamento de status de coleta → UI
| `collection_status` (snapshot mais recente do mês) | Label sugerido | Cor sugerida |
|----|----|----|
| `ok` | "Coleta OK" | verde (`emerald`) |
| `manual` | "Manual" | neutro/azul (`stone`/`blue`) |
| `no_data` | "Sem dado" | âmbar (`amber`) |
| nenhum snapshot no mês (nulo) | "Sem dado" | âmbar (`amber`) — mesmo tratamento de `no_data` |
| `error` | "Erro na coleta" | vermelho (`red`) |

### Timezone e "mês corrente"
Todos os cálculos de "mês corrente" (para agregação de `service_cost_snapshots` e destaque de vencimentos próximos) devem usar `America/Sao_Paulo` (NFR-8 do épico), evitando erro de borda de dia/mês — mesmo padrão já usado em `dashboard/sistema/page.tsx` (`toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ... })`).

### Testing Standards
- Não há suíte de testes automatizados de UI/E2E no projeto para páginas admin equivalentes (mesmo padrão observado em `dashboard/sistema/*` — validação é manual). Seguir o mesmo processo: validar manualmente logado como admin e como não-admin.
- Não inventar testes automatizados (Playwright/Jest) que não existem como padrão estabelecido nesta área do projeto; se o @dev decidir adicionar, é adicional, não requisito desta story.

---

## Testing

### Abordagem
- Validação manual em ambiente local/DEV, logado como `admin` e como um role não-admin (ex. `supervisor` ou `broker`).
- Sem migration nesta story — não há necessidade de aplicar/reexecutar SQL; depende apenas da migration `164` (Story 78-1) já estar aplicada em DEV.

### Cenários de teste
1. **Admin acessa o painel:** usuário `role = admin` abre `/dashboard/sistema/billing` — página carrega, 6 cards de serviço aparecem (Anthropic, OpenAI, Vercel, WhatsApp, Supabase, Resend), todos em estado "Sem dado" (pré-coletores).
2. **Não-admin bloqueado:** usuário `role = supervisor`/`broker`/`obras`/`gerente-comercial` tenta acessar a API `/api/admin/billing-panel` diretamente — recebe `403`; ao navegar para a página, vê mensagem de acesso restrito (não um painel vazio nem dado parcial).
3. **Deep-links funcionam:** clicar no botão de billing de `anthropic` abre `https://console.anthropic.com/settings/billing` em nova aba; `vercel` e `supabase` mostram o indicador de "não confirmado".
4. **Vencimentos vazio ou API ainda inexistente:** com `service_billing_reminders` vazia, **ou** com a rota `GET /api/admin/billing-reminders` (78-8) ainda não implementada (`404`), a seção mostra estado vazio explicativo, não uma lista em branco nem um erro que quebra a página.
5. **Meta Ads oculto:** com `meta_ads.enabled = false` (seed atual), nenhuma seção de Meta Ads aparece na página.
6. **Erro de API tratado:** simular falha (ex. desconectar a rota temporariamente / forçar erro 500) — página mostra mensagem de erro amigável, não crash/tela branca.
7. **Consolidado sem Meta Ads:** inserir manualmente (via SQL de teste) um snapshot monetário de teste em `anthropic` e outro em `meta_ads` — o total consolidado do mês reflete apenas o de `anthropic`.
8. **Moeda não somada indevidamente:** inserir snapshots de teste com `currency = 'USD'` e `currency = 'BRL'` no mesmo mês — a UI exibe os dois valores separadamente, nunca um único número somado.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | UI assumir que sempre haverá dado nos cards, quebrando antes de 78-3..78-8 existirem | Alta (esperado no momento de criação desta story) | AC8 é explícito e testável: painel deve funcionar corretamente com zero snapshots/lembretes |
| R2 | Hardcodar nomes de `metric` específicos (ex. `"cost_usd"`) em vez de usar a regra `currency IS NOT NULL` | Média | Regra de agregação documentada explicitamente nos Dev Notes, citando a decisão de design da 78-1 |
| R3 | Somar valores de moedas diferentes num único total | Média | AC7 exige exibição separada por moeda; teste 8 cobre isso |
| R4 | Exibir Meta Ads como se fosse conta a pagar (misturado ao consolidado) | Média | AC5/AC6 exigem seção separada e exclusão explícita do total; CON-8 do épico |
| R5 | Introduzir biblioteca de componentes nova (shadcn/ui) não usada no restante do projeto | Baixa | Dev Notes confirma ausência de shadcn/ui e instrui reuso de Tailwind puro |
| R6 | Confundir o guard de `lib/agent/auth-helpers.ts` (Epic 52) ou o padrão antigo `getServerUser()` com o padrão `requireAuth()`/`requireRole()` já escolhido pela Story 78-8 (sibling) | Média | Dev Notes esclarece explicitamente qual dos 2 padrões existentes seguir, por consistência dentro do próprio Epic 78 |
| R7 | Reimplementar a query de `service_billing_reminders` dentro de `/api/admin/billing-panel`, duplicando a lógica já entregue por 78-8 | Média | Scope/AC4 explícitos: vencimentos vêm de `GET /api/admin/billing-reminders` (78-8), nunca de uma segunda query direta nesta story (IDS REUSE > CREATE) |

---

## Dependencies

- **Depende de:** Story 78-1 (`Ready` — schema e seed; **bloqueante direta**, sem ela não há tabela para ler). **Depende do contrato de API (não do schema em si) da Story 78-8** (`Draft`) para a seção de vencimentos (`GET /api/admin/billing-reminders`) — se 78-8 ainda não estiver implementada quando 78-9 for desenvolvida, a chamada retorna `404` e a UI trata isso como estado vazio (AC4/AC8), sem bloquear o restante do painel. Consome dado (quando existir) de 78-3 (contrato de coletor + Anthropic), 78-4, 78-5, 78-6, 78-7 (adaptações do coletor para os demais fornecedores) — mas **não bloqueia** neles: a UI deve funcionar em estado degradado/vazio antes deles existirem/rodarem (AC8).
- **Bloqueia:** nada diretamente; é a última entrega de valor visível do MVP do épico. Story 78-10 (opcional, Meta Ads spend) reusaria a seção condicional já prevista aqui (AC6) quando `meta_ads.enabled` for setado para `true`.
- **Dependências técnicas:**
  - `packages/web/src/lib/api-auth.ts` (`requireAuth`, `requireRole`)
  - `packages/web/src/lib/supabase/server.ts` (`createClient`, usado internamente por `requireAuth()`)
  - `packages/web/src/app/dashboard/sistema/page.tsx` (padrão visual + ponto de navegação a editar)
  - `packages/web/src/app/api/admin/agent-prompts/route.ts` (padrão de admin guard a replicar, mesmo escolhido pela Story 78-8)
  - `docs/stories/78-8-cadastro-vencimentos-motor-lembretes.story.md` (contrato exato de `GET /api/admin/billing-reminders` a consumir)
  - `docs/stories/78-3-coletor-anthropic-padrao.story.md` (valores reais de `metric`/`currency` já em uso em `service_cost_snapshots`)

---

## Definition of Done

- [x] Rota `GET /api/admin/billing-panel` criada, retorna 401 sem sessão / 403 para não-admin, 200 com payload agregado para admin
- [x] Página `/dashboard/sistema/billing` criada e navegável a partir do hub `dashboard/sistema`
- [x] Cards de serviço exibem status + gasto do mês + deep-link + indicador de `billing_url_confirmed = false`
- [x] Seção de vencimentos ordenada por proximidade, com destaque para os próximos do prazo
- [x] Total consolidado do mês exclui Meta Ads
- [x] Seção Meta Ads separada e condicional a `enabled = true` (hoje oculta)
- [x] Nenhuma conversão de moeda inventada; valores de moedas diferentes nunca somados num único número
- [x] Estado vazio (zero snapshots/lembretes) e estado de erro de API tratados sem crash
- [ ] Validado manualmente como admin e como não-admin — validação via `tsc`/`eslint` limpos; validação funcional em DEV pendente (@qa/usuário)
- [ ] @dev executou quality gate com verdict PASS ou CONCERNS documentados e aceitos — pendente (@qa)
- [ ] @devops fez push do commit final

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente).
> Validação de qualidade usará processo de revisão manual pelo @dev (quality gate desta story).

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-08 | 0.1 | Story criada a partir do Epic 78 (§7, story 78-9) e do contrato de dados fixado na Story 78-1, a pedido explícito do usuário ("é a UI que o usuário vê"). Escopo inicial: rota API `/api/admin/billing-panel` + página `/dashboard/sistema/billing`, reusando o padrão visual já existente em `dashboard/sistema/page.tsx` (cards de saúde, `HEALTH_STYLES`, seção de deep-link estilo "Fatura na Meta ↗"). [AUTO-DECISION] Regra de agregação de gasto monetário usa `service_cost_snapshots.currency IS NOT NULL` em vez de hardcodar nomes de `metric` → reason: o contrato da 78-1 deliberadamente não usa CHECK/enum em `metric`; `currency` não-nulo é o sinal padronizado disponível para distinguir métrica monetária de métrica de uso técnico. [AUTO-DECISION] AC8 exige que a UI funcione corretamente em estado vazio/degradado (zero coletores rodando em produção) → reason: o valor pleno do painel só aparece depois que os coletores estiverem rodando com secrets válidos; sem esse AC, a story ficaria não-testável até todo o épico estar em produção. [AUTO-DECISION] Seção Meta Ads condicional a `enabled = true`, oculta hoje → reason: seed da 78-1 já define `meta_ads.enabled = false` aguardando decisão OQ-2 do épico; a UI não deve inventar uma exibição para um módulo que não foi habilitado. | @sm (River) |
| 2026-07-08 | 0.2 | **Correção pós-descoberta:** ao investigar o repositório mais a fundo (após a v0.1 já ter sido escrita), constatou-se que as Stories 78-2, 78-3 e 78-8 **já existiam** como arquivos Draft no momento da criação desta story (não haviam sido lidas antes da v0.1). Isso exigiu 3 correções de consistência dentro do próprio épico: (1) [AUTO-DECISION] Admin guard da rota `/api/admin/billing-panel` trocado de `getServerUser()` inline (padrão de `system-events/route.ts`) para `requireAuth()` + `requireRole()` de `@web/lib/api-auth.ts` → reason: a Story 78-8 (mesma sequência do épico, mesmo autor, mesmo dia) já escolheu esse padrão para as novas rotas admin de billing (`agent-prompts/route.ts` como referência); manter os dois padrões diferentes dentro do mesmo épico seria inconsistência evitável. (2) [AUTO-DECISION] A seção "Próximos vencimentos" passou a **consumir `GET /api/admin/billing-reminders`** (API já fixada e entregue pela Story 78-8) em vez de fazer um `SELECT` direto em `service_billing_reminders` dentro da nova rota `/api/admin/billing-panel` → reason: Article IV-A/IDS (REUSE > CREATE) — 78-8 já entrega exatamente essa query (join com `platform_services`, ordenada por `due_date`); duplicar seria trabalho e superfície de manutenção desnecessários. AC4/AC8 e Dependencies atualizados para tratar `404` daquela rota (caso 78-9 seja implementada antes de 78-8) como estado vazio, não erro. (3) Regra de agregação por `currency IS NOT NULL` (já decidida na v0.1 por inferência do schema da 78-1) foi **confirmada como correta** ao ler a Story 78-3, que já usa exatamente esse padrão real (`cost_usd`+`currency='USD'` vs. `tokens_input`+`currency=null`) — nenhuma mudança necessária aqui, apenas reforço de evidência nos Dev Notes. | @sm (River) |
| 2026-07-08 | 0.3 | **Validação cruzada do backlog do Epic 78 (@po Pax) — GO, Status Draft → Ready.** UI consumidora validada como coerente com os produtores: regra de agregação `currency IS NOT NULL` casa com a convenção real dos coletores (78-3 `cost_usd`/USD, 78-7 uso técnico `null`, 78-6 `cost_estimated`/moeda, 78-10 `ad_spend` excluído por slug); admin-guard `requireAuth()`+`requireRole()` consistente com 78-8; seção de vencimentos consome `GET /api/admin/billing-reminders` (78-8) sem duplicar query (REUSE > CREATE); AC8 (estado vazio/degradado + 404 da rota da 78-8) torna a story testável antes do épico inteiro estar em produção. Seção Meta Ads condicional a `enabled=true` alinhada com a ativação feita pela 78-10. Quality gate @dev (não @architect) adequado para story de UI. | @po (Pax) |
| 2026-07-08 | 1.0 | **Implementação (@dev Dex) — Status Ready → InProgress → InReview.** Criados: rota `GET /api/admin/billing-panel` (admin-guard `requireAuth`+`requireRole`; agrega `service_cost_snapshots` do mês corrente em `America/Sao_Paulo` filtrando `currency IS NOT NULL`; status de coleta efetivo pelo snapshot mais recente; total consolidado por moeda excluindo `meta_ads`; `meta_ads` separado em campo próprio) e página `/dashboard/sistema/billing` (client component, polling 30s, duas chamadas independentes com isolamento de falha por seção) + componentes `service-card`, `upcoming-reminders`, `meta-ads-section` e helpers `shared.ts` (formatação de moeda sem conversão, tempo relativo, `daysUntil`, mapa de status). Navegação adicionada ao hub `dashboard/sistema` (seção "Plataforma"). Reuso visual direto de `dashboard/sistema/page.tsx` (Tailwind puro, paleta stone/orange/emerald/red/amber, deep-link estilo "Fatura na Meta ↗"). Vencimentos consomem a API 78-8 (REUSE, `404` → estado vazio). `eslint` e `tsc` limpos nos arquivos desta story (apenas os 4 erros pré-existentes não relacionados permanecem). Validação funcional manual em DEV (admin/não-admin) pendente no QA gate. | @dev (Dex) |

---

## Dev Agent Record

Implementado por @dev (Dex) em modo autônomo (chapéu front-end).

### Agent Model Used
Opus 4.8 (1M context) — claude-opus-4-8

### Debug Log References
- `npx eslint` nos arquivos criados/alterados: **0 erros, 0 warnings**.
- `npx tsc --noEmit` (packages/web): apenas os **4 erros pré-existentes** não relacionados (`visual-editor.tsx` x3 — `react-email-editor`; `lib/pastas/termo/fill.ts` — `pdf-lib`). Nenhum erro nos arquivos desta story.

### Completion Notes List
- **Admin guard (AC1):** `requireAuth()` + `requireRole(appUser, ["admin"])` de `@web/lib/api-auth` — REUSE do padrão de `admin/agent-prompts/route.ts` e da story-irmã 78-8. `401` sem sessão, `403` para não-admin. A página trata `401`/`403` com redirect para `/dashboard` + mensagem "Acesso restrito a administradores".
- **Agregação (AC5/AC7):** gasto monetário do mês filtra `currency IS NOT NULL` (regra do contrato 78-1/78-3, sem hardcodar `metric`). Soma agrupada por moeda (`sumByCurrency`) — moedas diferentes NUNCA somadas; exibidas separadamente via `formatMoneyList` ("US$ … · R$ …"). Zero conversão de câmbio.
- **Mês corrente (NFR-8):** `currentMonthRangeSaoPaulo()` calcula janela `[monthStart, nextMonthStart)` em `America/Sao_Paulo` via `toLocaleDateString("en-CA", { timeZone })`, evitando erro de borda de dia/mês. Mesma TZ para `daysUntil()` dos vencimentos no client.
- **Status de coleta (AC2):** status efetivo = `collection_status` do snapshot com `collected_at` mais recente no mês; sem snapshot → `no_data`. Badge com paleta emerald/blue/amber/red (STATUS_STYLES).
- **Meta Ads (AC6):** a API separa `meta_ads` em campo próprio (`meta_ads: ServiceSummary | null`) e o exclui do `consolidated_total`. Como o seed 78-1 tem `enabled=false`, o `SELECT enabled=true` não o retorna → `meta_ads=null` → seção oculta. Se um dia `enabled=true` (78-10), a seção condicional `<MetaAdsSection>` renderiza fora do total.
- **Vencimentos (AC4):** seção consome `GET /api/admin/billing-reminders` (78-8, já existente) — sem `SELECT` direto em `service_billing_reminders`. Reordena defensivamente por `due_date`, filtra `status IN (pending, alerted)`, destaca (âmbar/vermelho) os que estão a `<= alert_days_before` dias / vencidos. `404` da rota tratado como estado vazio (não erro).
- **Isolamento de falha por seção (AC8):** as duas chamadas (`billing-panel`, `billing-reminders`) têm estados de erro independentes — falha em uma não impede a outra de renderizar. Estados vazio/loading/erro tratados sem crash.
- **IDS:** REUSE do padrão visual de `dashboard/sistema/page.tsx` (classe de card `rounded-lg border border-stone-200 …`, `SectionHeader` reimplementado localmente na página, deep-link estilo "Fatura na Meta ↗" com cor `#E8856A`), REUSE da API 78-8 e do guard `api-auth`. CREATE justificado: 1 rota nova + 1 página + 3 componentes de apresentação + 1 módulo de helpers (`shared.ts`), pois não havia painel de billing consolidado no projeto. Tailwind puro (sem shadcn/ui, confirmado).

### File List
**Criados:**
- `packages/web/src/app/api/admin/billing-panel/route.ts`
- `packages/web/src/app/dashboard/sistema/billing/page.tsx`
- `packages/web/src/app/dashboard/sistema/billing/_components/shared.ts`
- `packages/web/src/app/dashboard/sistema/billing/_components/service-card.tsx`
- `packages/web/src/app/dashboard/sistema/billing/_components/upcoming-reminders.tsx`
- `packages/web/src/app/dashboard/sistema/billing/_components/meta-ads-section.tsx`

**Alterados:**
- `packages/web/src/app/dashboard/sistema/page.tsx` (nova seção de navegação "Plataforma" → `/dashboard/sistema/billing`, AC9)
- `docs/stories/78-9-ui-painel-saude-billing.story.md` (checkboxes, Dev Agent Record, Change Log, Status)

---

## QA Results

### Review Date: 2026-07-08

### Reviewed By: Quinn (Test Architect & Quality Advisor)

### Escopo da revisão
Revisão estática cuidadosa dos 6 arquivos criados + 1 editado. `tsc --noEmit` e `eslint` executados no pacote `packages/web`. Validação funcional em browser (admin/não-admin) **deferida ao deploy** por acordo do mission — registrada como observação (TEST-001), não como bloqueio.

### 7 Quality Checks

1. **Code review (patterns/reuso):** PASS. Reusa fielmente o padrão de `dashboard/sistema/page.tsx` (classe de card `rounded-lg border border-stone-200 …`, `SectionHeader`, deep-link estilo "Fatura na Meta ↗" com cor `#E8856A`), Tailwind puro (sem shadcn/ui, confirmado). Página fina + componentes de apresentação em `_components/`, igual a `emails/`. Helpers isolados em `shared.ts`.
2. **Testes:** N/A automatizado (sem suíte E2E/unit para páginas admin equivalentes — padrão do projeto). Validação manual pendente (TEST-001, low).
3. **Acceptance Criteria (AC1–AC9):** PASS — todos satisfeitos (mapa abaixo).
4. **Regressões:** PASS. Mudanças puramente aditivas (1 rota nova, 1 página nova, 3 componentes, 1 módulo de helpers, 1 seção de nav no hub). `tsc` acusa apenas os **4 erros pré-existentes** não relacionados (`visual-editor.tsx` x3 — `react-email-editor`; `lib/pastas/termo/fill.ts` — `pdf-lib`). `eslint` limpo (0/0).
5. **Performance:** PASS. Duas queries + agregação em memória; polling de 30s adequado a painel admin.
6. **Segurança (OWASP):** PASS. `requireAuth()` + `requireRole(["admin"])` (401/403/404) + RLS admin-only da 78-1 (defesa em profundidade); corpo do 403 = `{ error: 'Forbidden' }`, sem vazar dado. Deep-links com `rel="noreferrer"`. `billing_url` renderizado como `href` sem validação de scheme, mas é dado admin-seeded (SEC-001, low, negligenciável).
7. **Documentação:** PASS. Story, Dev Notes e Dev Agent Record completos e coerentes com o código.

### Traceability AC → evidência

| AC | Veredito | Evidência |
|----|----------|-----------|
| AC1 — admin-only (rota + página) | PASS | `billing-panel/route.ts:88-93` `requireAuth`+`requireRole(["admin"])` (401 sem sessão, 404 sem user, 403 desativado/não-admin, corpo sem dado); `page.tsx:40-43,61-64,99-105` trata 401/403 → `restricted` → redirect `/dashboard` + msg "Acesso restrito a administradores". |
| AC2 — card por serviço (status+valor+deep-link) | PASS | `route.ts:132-178` separa `meta_ads`, monta `ServiceSummary` (status efetivo pelo snapshot `collected_at` mais recente; `no_data` sem snapshot); `service-card.tsx` renderiza nome, categoria, badge, `formatMoneyList(month_costs)`, `relativeTime(last_collected_at)`, link `target="_blank" rel="noreferrer"`. |
| AC3 — indicador de deep-link não confirmado | PASS | `service-card.tsx:54-62` `AlertTriangle` + "Link não confirmado" quando `billing_url_confirmed === false` (seed 78-1: `vercel`/`supabase`), sem impedir o clique. |
| AC4 — vencimentos ordenados (consome API 78-8) | PASS | `page.tsx:58-81` `fetch("/api/admin/billing-reminders")` (78-8 **existe**, retorna `{ data: [...] }` com join `platform_services`); `upcoming-reminders.tsx` filtra `status IN (pending,alerted)`, reordena por `due_date`, destaca `<= alert_days_before`/vencidos (âmbar/vermelho), estado vazio explicativo; `page.tsx:66-70` 404 → vazio. |
| AC5 — total consolidado (sem Meta Ads) | PASS | `route.ts:180-183` `consolidated_total = sumByCurrency(regularSummaries.flatMap month_costs)` — `meta_ads` excluído; `page.tsx:124-148` exibe com nota "Não inclui budget de mídia do Meta Ads". |
| AC6 — Meta Ads separado e opcional | PASS | `route.ts:96-101` `.eq("enabled",true)` → seed `meta_ads.enabled=false` não retorna → `meta_ads=null`; `page.tsx:177` `{panel?.meta_ads && <MetaAdsSection/>}` oculta; `meta-ads-section.tsx` seção distinta fora do total. |
| AC7 — moeda coerente, sem conversão | PASS | `route.ts:71-80` `sumByCurrency` agrupa por moeda (nunca soma moedas distintas); `shared.ts:55-71` `formatMoney`/`formatMoneyList` exibe separado por " · ", zero câmbio. |
| AC8 — estados vazio/erro (funciona pré-coletores) | PASS | `page.tsx` `loading`/`panelError`/`remindersError` independentes (isolamento de falha por seção); cards em "Sem dado" + total "—" com nota; `upcoming-reminders.tsx` estado vazio/erro; 404 tratado como vazio. |
| AC9 — navegação descobrível | PASS | `dashboard/sistema/page.tsx:178-201` seção "Plataforma" (ícone `Wallet`) com link para `/dashboard/sistema/billing`, mesmo padrão de grid dos demais hubs. |

### Verificações executadas
- `npx tsc --noEmit` (packages/web) → apenas os 4 erros pré-existentes (visual-editor x3, fill.ts). Zero nos arquivos da story. **Confirmado.**
- `npx eslint` nos arquivos da story → 0 erros / 0 warnings. **Confirmado.**
- Contrato da API 78-8 conferido: `GET /api/admin/billing-reminders` retorna `{ data: [...] }` com `platform_services(slug,name,category)` — casa com `ReminderRow`/`firstService()` da UI.

### Issues (severidade)
- **REL-001 (low):** `month_costs` soma todos os snapshots monetários do mês; se um coletor futuro gravar valor cumulativo em vez de delta diário, poderia super-contar. Fora do escopo (coletores 78-3..78-7 não implantados); AC5 satisfeito como especificado.
- **TEST-001 (low):** validação funcional manual (admin/não-admin, erro de API, Meta Ads oculto) ainda não executada em browser (T8 aberto). Mitigado: guard idêntico ao da 78-8 já em produção.
- **SEC-001 (low):** `billing_url` sem validação de scheme; dado admin-seeded, risco negligenciável.

### Veredito

**Gate: PASS** — os 9 ACs estão satisfeitos em revisão estática, sem issues high/medium; apenas 3 observações low, todas não-bloqueantes. Próximo passo: executar T8.1–T8.4 (validação funcional em DEV/deploy como admin e como não-admin) e então `@devops *push`.

### Gate Status

Gate: PASS → docs/qa/gates/78.9-ui-painel-saude-billing.yml
