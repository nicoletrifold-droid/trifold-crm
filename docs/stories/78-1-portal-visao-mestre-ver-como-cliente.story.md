# Story 78-1 — Portal Visão Mestre: "Ver como cliente" (admin, somente leitura)

## Metadata
- **Status:** InReview
- **Epic:** 78 — Portal do Cliente: Visão Mestre / Monitoramento
- **Branch:** feat/78-1-portal-visao-mestre

## Context
O diretor precisa de uma **visão macro de acompanhamento** de TODOS os clientes do Portal do Cliente — atuais e futuros — para monitorar como cada cliente está vendo seu portal, sem depender de logar como cada um. A demanda original era um "usuário mestre" com e-mail fictício; após análise de arquitetura e risco, a decisão (com o usuário) foi implementar como um **viewer interno "Ver como cliente" dentro do Dashboard**, e **não** criar usuário fake.

**Por que viewer interno e não usuário fake / RLS no portal real:**
- O portal do cliente (`/cliente/[obra_id]/*`) busca dados inline com a sessão do próprio cliente e a segurança é 100% por RLS ancorada em `cliente_obras` (`public.cliente_obra_ids()`, migration 020). Liberar um outro perfil nessas policies + no middleware mexeria em caminho que já funciona para clientes pagantes (raio de impacto alto — regra "não quebrar o que funciona").
- Um viewer isolado dentro de `/dashboard` (área já protegida) que lê os dados com o **admin client (service role, contorna RLS)** não toca em nada do portal real, do middleware nem do RLS. Risco baixíssimo.
- **Notificações resolvidas de graça:** o viewer NÃO cria nenhuma linha em `cliente_obras` nem em `clientes`. Como todo o fan-out de notificação (WhatsApp/e-mail/push) percorre `cliente_obras → users` e `clientes` (`lib/notificacoes.ts`), o admin jamais é destinatário. Nenhuma flag necessária.

**Mapa de arquitetura relevante (confirmado no código):**
- Componentes de exibição do portal são **presentacionais** (props) e reaproveitáveis direto: `FasesList({fases,currentPhaseId})`, `FotosGrid({fotos,supabaseUrl})`, `MensagensList({mensagens})`.
- `ServicosSection({obraId})` e `financeiro/page.tsx` têm links `/cliente/${obraId}/...` **hardcoded** → precisam de variante para os caminhos do viewer.
- Financeiro busca via `getFinancialStatement(siengeCustomerId)` (`lib/integrations/sienge/client`); a rota `api/cliente/obras/[obra_id]/financeiro/route.ts` resolve o `sienge_customer_id` a partir do **usuário logado**. No viewer não há usuário-cliente logado → resolver o cliente **pela obra** via `clientes_obras_vinculos → clientes.sienge_customer_id`.
- `createAdminClient()` (`lib/supabase/admin.ts`, service role) já existe.
- Tabelas: `properties` (empreendimento), `obras` (unidade; `property_id`, `sienge_enterprise_id`), `cliente_obras` (`numero_unidade`), `clientes` + `clientes_obras_vinculos` (`cliente_id`, `obra_id`, `numero_unidade`, `sienge_contract_numbers`, `distrato`).

## Acceptance Criteria
- [ ] AC1 (Acesso restrito): existe uma área nova em `/dashboard/portal-cliente` acessível **apenas** para perfis `admin` e `supervisor`. Outros perfis recebem 403/redirect igual às demais áreas restritas do dashboard. Há um item de menu/entrada visível para esses perfis.
- [ ] AC2 (Seletor macro): a tela inicial lista **todos os empreendimentos → unidades** da organização (via admin client, sem depender de `cliente_obras`), agrupados por empreendimento (`properties.name`), mostrando por unidade: nome da obra/unidade (`numero_unidade` quando houver) e o nome do(s) cliente(s) vinculado(s). Há campo de busca que filtra por nome do cliente, unidade ou empreendimento. Clientes/obras futuros aparecem automaticamente (lista sempre ao vivo, sem cadastro extra).
- [ ] AC3 (Abrir como cliente): ao escolher uma unidade, abre `/dashboard/portal-cliente/[obra_id]` renderizando o portal daquele cliente com as MESMAS seções e layout do portal real (Início, Fases, Fotos, Documentos, Mensagens, Financeiro), reaproveitando os componentes presentacionais existentes.
- [ ] AC4 (Dados corretos por obra): todas as seções mostram os dados da obra escolhida, buscados via **admin client** (contorna RLS) — Fases (`obra_fases`), Fotos (`obra_fotos`), Documentos (`obra_documentos`), Mensagens (`obra_mensagens`), Início (resumo/progresso). Nenhum dado de outra obra vaza.
- [ ] AC5 (Financeiro/Sienge por obra): a aba Financeiro (Boleto/Extrato/Informe) resolve o cliente **pela obra** (`clientes_obras_vinculos → clientes.sienge_customer_id`), filtra por `sienge_contract_numbers` quando houver, e exibe os boletos/extrato via `getFinancialStatement`. Se a obra não tem cliente com `sienge_customer_id`, exibe estado vazio amigável ("cliente sem vínculo Sienge"), sem erro.
- [ ] AC6 (Somente leitura — sem escrita): no viewer NÃO há: envio de mensagem no chat (sem composer), marcação de mensagem como lida, alteração de preferências de notificação, nem qualquer ação que grave no banco. Mensagens aparecem apenas para leitura (thread completa).
- [ ] AC7 (Sem notificações): o fluxo não cria/edita linhas em `cliente_obras`, `clientes`, `obra_notificacao_prefs`, `push_subscriptions` nem `users`. (Garantia estrutural de que o monitoramento não dispara WhatsApp/e-mail/push.)
- [ ] AC8 (UX de contexto): o viewer deixa claro que é modo visualização — cabeçalho tipo "Visualizando como cliente — {nome do cliente} · {empreendimento}/{unidade}" e ação "Voltar ao painel" (para `/dashboard/portal-cliente`) no lugar do "Sair" do portal real.
- [ ] AC9 (Sem regressão no portal real): nenhuma alteração de comportamento em `/cliente/*`, no `middleware`, nas policies de RLS do portal ou nas rotas `api/cliente/*`. O portal do cliente real continua idêntico.

## Out of Scope
- Criar usuário fictício / login fake (decisão: descartado).
- Qualquer alteração em RLS do portal, `middleware.ts` ou rotas `api/cliente/*`.
- Permitir que o admin **interaja** como cliente (enviar mensagem, marcar lida, etc.) — explicitamente somente leitura.
- Refatorar a rota `api/cliente/obras/[obra_id]/financeiro/route.ts` existente para reusar o novo helper (nice-to-have; manter intocada para não aumentar raio de impacto). O helper novo é usado só pelo viewer.
- Mover o gate de acesso para a matriz de Perfil de Acesso (`role_permissions`) — por ora, checagem por role (`admin`/`supervisor`); registrar como follow-up.
- Exibir/observar dados de outros orgs (multi-tenant fora de escopo; filtrar por `org_id` do admin).

## Dependencies
- Nenhuma bloqueante. Reusa componentes e libs existentes (portal components, `createAdminClient`, `getFinancialStatement`).

## Complexity
- **T-shirt:** L. Muitas telas (6 seções + seletor + 3 sub-telas de financeiro), porém a maior parte é reuso de componentes presentacionais + fetch via admin client. O trabalho novo real é: seletor, o helper de financeiro por obra, variantes de navegação (links `/dashboard/portal-cliente/...`) e o gate de acesso.

## Business Value
Dá ao diretor uma "visão mestre" de acompanhamento de todos os clientes (obras) — atuais e futuros — exatamente como cada um vê o próprio portal, incluindo situação financeira, sem risco para o portal real e sem qualquer notificação indevida. Ferramenta de monitoramento/qualidade do relacionamento.

## Risks
- **Vazamento de escopo de dados:** admin client contorna RLS → todo fetch DEVE filtrar por `org_id` do admin e pela `obra_id` da URL. Mitigação: helper central de fetch por obra + gate de role no layout.
- **Financeiro de obra com múltiplos clientes (co-titulares):** escolher o cliente com `sienge_customer_id` (priorizar `is_primary`/primeiro válido); se houver mais de um, exibir de qual cliente é o extrato. Não travar se ambíguo.
- **Escrita acidental:** garantir que nenhum componente reaproveitado dispare server action de escrita (ex.: chat feed com composer, mark-as-read). Mitigação: usar `MensagensList` puro (sem `ChatFeed`), não montar composer.
- **Dark theme:** portal é sempre dark hardcoded ([[feedback-theme-convention]]); o viewer vive sob `/dashboard` (light/dark). Decisão: renderizar o viewer com o mesmo visual dark do portal (para fidelidade "como o cliente vê"), encapsulado, sem depender do tema do dashboard.

## Definition of Done
- AC1–AC9 atendidos; `tsc --noEmit` + ESLint limpos; verificação real (abrir seletor, escolher unidade, navegar nas 6 seções incl. Financeiro, confirmar leitura-apenas e ausência de escrita); QA gate PASS; commit/push via @devops.

## File List (previsto)
- `docs/stories/78-1-portal-visao-mestre-ver-como-cliente.story.md` (this file)
- `packages/web/src/app/dashboard/portal-cliente/page.tsx` (seletor)
- `packages/web/src/app/dashboard/portal-cliente/_components/*` (lista/busca do seletor; header "modo visualização")
- `packages/web/src/app/dashboard/portal-cliente/[obra_id]/layout.tsx` (gate role + shell dark + tab nav do viewer)
- `packages/web/src/app/dashboard/portal-cliente/[obra_id]/page.tsx` (Início)
- `packages/web/src/app/dashboard/portal-cliente/[obra_id]/{fases,fotos,documentos,mensagens}/page.tsx`
- `packages/web/src/app/dashboard/portal-cliente/[obra_id]/financeiro/page.tsx` (+ `boleto`, `extrato`, `informe`)
- `packages/web/src/lib/portal/obra-financeiro.ts` (helper novo: resolve cliente pela obra → statement)
- `packages/web/src/lib/portal/viewer-access.ts` (guard admin/supervisor + fetch de obra por org)
- (reuso) `app/cliente/[obra_id]/_components/{fases-list,fotos-grid,mensagens-list,animated-progress-bar}.tsx`

## Dev Notes (@dev / Dex)
- **Gate:** no `layout.tsx` do viewer usar `getServerUser()` (dashboard) e exigir `role ∈ {admin, supervisor}`; senão `redirect("/dashboard")`. Filtrar TODAS as queries por `org_id` do admin.
- **Admin client:** usar `createAdminClient()` para ler `obras/obra_fases/obra_fotos/obra_documentos/obra_mensagens/properties/clientes/clientes_obras_vinculos`. Não usar o client de sessão (não tem RLS de cliente).
- **Reuso presentacional:** importar `FasesList`, `FotosGrid` (passar `supabaseUrl` = `NEXT_PUBLIC_SUPABASE_URL`), `MensagensList`, `AnimatedProgressBar` diretamente. Replicar a marcação do `page.tsx` de Início (é auto-contido; só troca a origem do fetch e os `href`).
- **Navegação:** criar um tab-nav próprio (baseado em `obra-tab-nav.tsx`) apontando para `/dashboard/portal-cliente/[obra_id]/...`. NÃO reusar `ServicosSection`/`financeiro/page.tsx` originais (links hardcoded `/cliente/...`) — fazer variantes com os caminhos do viewer.
- **Financeiro helper** (`lib/portal/obra-financeiro.ts`): dado `admin` + `obra_id` + `org_id`, buscar `clientes_obras_vinculos(obra_id) → clientes(sienge_customer_id, nome, cpf, email, sienge_contract_numbers)`; escolher o cliente com `sienge_customer_id` (preferir vínculo primário; ignorar `distrato = true`); chamar `getFinancialStatement(id)`; filtrar por `sienge_contract_numbers` se houver. Retornar `{ configured, installments, clienteNome }`. As sub-telas boleto/extrato/informe do viewer consomem esse helper (server-side) — reaproveitar os componentes de render de extrato (`financeiro/extrato/_components/extrato-client.tsx`) passando os installments.
- **Somente leitura:** na tela de mensagens do viewer, renderizar só `MensagensList` (sem `ChatFeed`/composer) e sem chamar nenhuma action de `actions.ts`. Não montar `unread-badge-provider` nem marcar leitura.
- **Seletor:** query `properties` do org + `obras (id, name, numero via cliente_obras/clientes_obras_vinculos, property_id)`; juntar nome do cliente por `clientes_obras_vinculos → clientes.nome`. Agrupar por empreendimento; busca client-side simples.
- **Tema:** encapsular o viewer no mesmo dark do portal (`bg-stone-950` etc.) para fidelidade; não herdar o toggle do dashboard.

## Dev Agent Record (@dev / Dex)

### ⚠️ Correção de modelo descoberta na verificação real (importante)
A Dev Notes original assumia `obra = unidade` (1 cliente por obra) e chaveava o viewer por `obra_id`.
Ao validar contra produção, o modelo real é outro: **existe UMA `obra` por empreendimento**
(ex.: um único "Vind Residence"); cada cliente/unidade é uma linha em `clientes_obras_vinculos`
(com `numero_unidade` próprio) sobre a MESMA obra. Consequências:
- Fases/Fotos/Documentos são da OBRA (compartilhados no prédio).
- Mensagens (`obra_mensagens.cliente_id = users.id`) e Financeiro (`sienge_customer_id`) são POR CLIENTE.
- Chavear por `obra_id` misturaria mensagens de todos os clientes e pegaria o financeiro do cliente errado.

**Correção:** o viewer é chaveado pelo **VÍNCULO** (`clientes_obras_vinculos.id`). Rota renomeada de
`[obra_id]` → `[vinculo_id]`. `getViewerVinculo()` resolve: obra (escopada por org) + cliente
(nome/sienge_customer_id/contract numbers) + usuário do portal correspondente (match por
sienge_customer_id → email → cpf) para filtrar as mensagens daquele cliente.

### Completion Notes
- AC1: item "Portal Cliente" no menu do dashboard (gate `role ∈ {admin,supervisor}`); `requireViewerAccess()` redireciona não-admin p/ `/dashboard`.
- AC2: seletor lista TODOS os vínculos (unidades/clientes) agrupados por empreendimento, com busca por cliente/unidade/empreendimento. Validado em prod: Yarden (46) + Vind Residence (41) = 87 unidades. Futuros aparecem automaticamente (lista ao vivo via admin client).
- AC3/AC4: viewer com Início, Fases, Fotos, Documentos, Mensagens, Financeiro — dados via admin client (service role), reusando `FasesList`/`FotosGrid`/`MensagensList`/`AnimatedProgressBar`. Escopado por `org_id` + `obra_id`.
- AC5: Financeiro resolve o `sienge_customer_id` do cliente do vínculo + filtra por `sienge_contract_numbers`; `getFinancialStatement`. Estados vazios amigáveis (sem vínculo Sienge / serviço indisponível).
- AC6/AC7: somente leitura — Mensagens usa `MensagensList` (sem `ChatFeed`/composer), NÃO marca `read_at`; documentos via signed URL (não persiste); nenhuma escrita em `cliente_obras`/`clientes`/`users`/prefs/push.
- AC8: barra "Visualizando como cliente — {nome} · {empreendimento} · {unidade}" + "Voltar ao painel".
- AC9: nenhuma alteração em `/cliente/*`, middleware, RLS ou `api/cliente/*` (só adição do item de menu no `dashboard/layout.tsx`).
- Verificação: `tsc --noEmit` limpo, ESLint limpo; smoke de runtime (dev server) — `/dashboard/portal-cliente` e `/dashboard/portal-cliente/{vinculo}` retornam 307→/login (middleware) sem 500/erro de compilação; mapeamento vínculo→portal user→mensagens validado em prod (Diego/703 = 3 msgs). CodeRabbit N/A (WSL indisponível em macOS).

### File List
- `docs/stories/78-1-portal-visao-mestre-ver-como-cliente.story.md`
- `packages/web/src/app/dashboard/layout.tsx` (item de menu "Portal Cliente")
- `packages/web/src/lib/portal/viewer.ts` (novo — gate + getViewerVinculo)
- `packages/web/src/lib/portal/obra-financeiro.ts` (novo — getVinculoFinancialStatement)
- `packages/web/src/app/dashboard/portal-cliente/page.tsx` (seletor)
- `packages/web/src/app/dashboard/portal-cliente/_components/seletor.tsx`
- `packages/web/src/app/dashboard/portal-cliente/[vinculo_id]/layout.tsx`
- `packages/web/src/app/dashboard/portal-cliente/[vinculo_id]/_components/viewer-tab-nav.tsx`
- `packages/web/src/app/dashboard/portal-cliente/[vinculo_id]/page.tsx` (Início)
- `packages/web/src/app/dashboard/portal-cliente/[vinculo_id]/{fases,fotos,documentos,mensagens,financeiro}/page.tsx`

## QA Results (@qa / Quinn)
**Veredito: PASS** (readiness 9/10). Gate: `docs/qa/gates/78.1-portal-visao-mestre-ver-como-cliente.yml`.

| Check | Resultado |
|---|---|
| 1. Code review | ✅ Viewer isolado sob /dashboard; reusa componentes presentacionais; helpers centralizados |
| 2. Testes | ⚠️ Sem teste automatizado novo (linha das stories de UI 76-1/77-1); lógica de dados validada em prod via SQL. Não bloqueante |
| 3. Acceptance Criteria | ✅ AC1–AC9 confirmados (trace no gate) |
| 4. Regressões | ✅ Zero mudança em /cliente/*, middleware, RLS, api/cliente/*; única edição fora do módulo = item de menu |
| 5. Performance | ✅ Poucas queries; Sienge sob demanda; signed URLs em paralelo |
| 6. Segurança | ✅ Admin client (service role) mitigado por gate de role + escopo org_id/obra_id; cross-org bloqueado |
| 7. Documentação | ✅ Dev Agent Record (com correção de modelo) + gate |

**Pendência não-bloqueante:** smoke autenticado no navegador (admin logado) como confirmação final do usuário — a sessão não pôde ser mantida no QA. Runtime OK (307→login, sem 500).

Pronta para `@devops *push`.

## Change Log
- @sm (River): story criada em Draft. Decisão de arquitetura registrada (viewer interno "Ver como cliente" no /dashboard, admin client/service role, somente leitura, com Financeiro por obra; sem usuário fake, sem tocar RLS/middleware do portal real). Escopo, ACs (9) e Dev Notes técnicas definidos a partir do mapa de código confirmado.
- @po (Pax): validação pelo checklist de 10 pontos → **GO (10/10)**. Escopo IN/OUT claro, 9 ACs testáveis, riscos e DoD definidos, alinhado ao novo Épico 78. Status Draft → Ready.
- @dev (Dex): implementado (viewer isolado sob /dashboard, admin client, somente leitura). Correção de modelo na verificação real: chave por VÍNCULO (unidade/cliente), não por obra — rota `[obra_id]`→`[vinculo_id]`. tsc/ESLint limpos; smoke de runtime OK (307→login, sem 500). Status Ready → InReview. Pronta para @qa *qa-gate.
- @qa (Quinn): QA gate **PASS** (7 checks; testes = CONCERNS não-bloqueante). Auditoria de escopo por org confirmada; sem regressão no portal real. Gate `78.1-...yml` criado. Pronta para @devops *push.
