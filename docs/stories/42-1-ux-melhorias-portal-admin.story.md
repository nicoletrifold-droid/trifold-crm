# Story 42.1 — UX: Melhorias de experiência no portal do cliente e admin

**Status:** Draft  
**Epic:** 42 — UX & Polimento  
**Criada por:** @sm (River)  
**Data:** 2026-05-26  

---

## Contexto

Análise UX conduzida pelo agente @ux-design-expert identificou 6 oportunidades de melhoria de alta/média prioridade no portal do cliente e no painel administrativo. O usuário aprovou todos os 6 itens para implementação.

---

## User Stories

> Como **cliente do portal**, quero que as páginas mostrem indicadores de carregamento, para que eu saiba que o sistema está respondendo e não fique vendo tela em branco.

> Como **admin/operador**, quero validação em tempo real nos formulários, para que eu veja erros de campo imediatamente ao digitar, sem precisar clicar em Salvar para descobrir o problema.

> Como **admin/operador**, quero que o modal de cadastro de clientes esteja organizado em seções, para que eu consiga preencher os dados sem rolar uma lista interminável de campos.

> Como **cliente do portal**, quero que a navegação use os mesmos nomes no desktop e mobile, para que eu me localize facilmente independente do dispositivo.

> Como **usuário do sistema**, quero cores de status consistentes entre o portal e o admin, para que eu entenda o estado das obras sem confusão visual.

> Como **cliente do portal**, quero que o chat carregue mensagens de forma paginada, para que o histórico longo não trave minha conexão.

---

## Acceptance Criteria

### AC-1: Loading states (skeleton screens) no portal
- [ ] Página `/cliente/[obra_id]` (dashboard) exibe skeleton durante carregamento
- [ ] Página `/cliente/[obra_id]/fases` exibe skeleton durante carregamento
- [ ] Página `/cliente/[obra_id]/fotos` exibe skeleton durante carregamento
- [ ] Página `/cliente/[obra_id]/documentos` exibe skeleton durante carregamento
- [ ] Skeletons respeitam o layout real da página (não são apenas barras genéricas)
- [ ] Skeleton é visível por no mínimo 200ms mesmo em conexões rápidas (evitar flash)

### AC-2: Modal de clientes reorganizado
- [ ] Modal de Config > Clientes exibe campos em 2 seções: "Dados Obrigatórios" e "Dados Complementares"
- [ ] Seção "Dados Complementares" inicia colapsada no mobile (expandível)
- [ ] Campos obrigatórios visíveis sem scroll: nome, CPF, e-mail
- [ ] Layout de 2 colunas em desktop para campos complementares (rg/telefone/celular, endereço)
- [ ] Comportamento de submit e validação permanecem iguais

### AC-3: Validação em tempo real
- [ ] Campo CPF no modal de clientes: valida formato (máscara 000.000.000-00) ao sair do campo (onBlur)
- [ ] Campo CPF na aba Clientes de Obras: valida formato ao sair do campo
- [ ] Campo e-mail nos formulários: valida formato ao sair do campo
- [ ] Campo senha: indica força mínima (>= 6 chars) ao sair do campo
- [ ] Mensagens de erro inline abaixo de cada campo (não apenas toast genérico)
- [ ] Campos com erro destacados com borda vermelha

### AC-4: Padronização de labels de navegação
- [ ] Sidebar desktop: `Visão Geral` → renomear para `Início`
- [ ] Tab bar mobile: já usa `Início` — manter
- [ ] Resultado: ambos usam `Início` como rótulo da primeira aba

### AC-5: Cores de status consistentes
- [ ] Status `em_andamento`: portal e admin usam exatamente as mesmas classes Tailwind (`bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300`)
- [ ] Status `concluida`: portal e admin usam `bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300`
- [ ] Status `pausada`: portal e admin usam `bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200`
- [ ] Criar constante/util compartilhada `STATUS_BADGE` para evitar divergência futura

### AC-6: Paginação do chat de mensagens
- [ ] Chat carrega os últimos 30 mensagens inicialmente
- [ ] Botão "Carregar mensagens anteriores" exibido quando há mais mensagens
- [ ] Ao clicar, carrega próximas 30 mensagens sem perder scroll position
- [ ] Indicador de loading durante carregamento incremental
- [ ] Query RLS e filtros existentes de segurança permanecem intactos

---

## Tarefas

- [ ] T1: Criar componente `SkeletonCard` reutilizável no portal
- [ ] T2: Adicionar skeletons nas 4 páginas do portal (dashboard, fases, fotos, docs)
- [ ] T3: Reorganizar `cliente-modal.tsx` em seções com layout 2-col no desktop
- [ ] T4: Adicionar validação onBlur em CPF, e-mail e senha nos formulários afetados
- [ ] T5: Renomear label "Visão Geral" → "Início" na sidebar desktop do portal
- [ ] T6: Criar utilitário `src/lib/status-badge.ts` com constante `STATUS_BADGE` e aplicar em admin e portal
- [ ] T7: Implementar paginação incremental no `chat-feed.tsx` (servidor + cliente)
- [ ] T8: QA gate completo

---

## Arquivos Afetados

- `packages/web/src/app/cliente/[obra_id]/_components/` — skeletons (novos)
- `packages/web/src/app/cliente/[obra_id]/fases/_components/` — skeleton
- `packages/web/src/app/cliente/[obra_id]/fotos/_components/` — skeleton
- `packages/web/src/app/cliente/[obra_id]/documentos/_components/` — skeleton
- `packages/web/src/app/dashboard/configuracoes/clientes/_components/cliente-modal.tsx`
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/clientes-tab.tsx`
- `packages/web/src/app/cliente/[obra_id]/_components/obra-sidebar.tsx` (ou equivalente)
- `packages/web/src/app/cliente/[obra_id]/_components/obra-tab-nav.tsx`
- `packages/web/src/app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx`
- `packages/web/src/lib/status-badge.ts` (novo)
- `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx`

---

## Notas Técnicas

- Skeletons devem usar `animate-pulse` do Tailwind
- Paginação do chat: cursor-based usando `created_at` como cursor (mais eficiente que offset)
- STATUS_BADGE: exportar como `Record<string, string>` sem depender de tipos do DB
- CPF mask: não instalar nova lib — implementar regex simples `/^\d{3}\.\d{3}\.\d{3}-\d{2}$/`
- Modal seções: usar `<details>`/`<summary>` HTML nativo no mobile ou `useState(expanded)`
