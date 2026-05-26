# Story 43.1 — Módulo Chamados: tickets de bugs e melhorias do sistema

**Status:** InReview  
**Epic:** 43 — Gestão Interna / Feedback do Sistema  
**Criada por:** @sm (River)  
**Data:** 2026-05-26  

---

## Contexto

Todos os usuários do sistema (admin, supervisor, obras) precisam de um canal centralizado para reportar bugs, erros e solicitar melhorias. Atualmente não existe esse mecanismo — feedbacks são informais e se perdem. O módulo "Chamados" cria esse canal diretamente no dashboard, visível na sidebar para todos os perfis.

O nome "Chamados" foi validado pelo @ux-design-expert como o termo mais adequado para o público B2B brasileiro (cobre bugs e melhorias sem ambiguidade). O título completo da página é "Chamados e Melhorias".

---

## User Stories

> Como **qualquer usuário do sistema**, quero abrir um chamado com imagem + descrição + motivo, para que eu possa reportar erros ou sugerir melhorias de forma estruturada.

> Como **admin**, quero visualizar todos os chamados abertos por qualquer usuário, para que eu possa priorizar e gerenciar as demandas de melhoria do sistema.

> Como **usuário não-admin**, quero ver apenas os meus próprios chamados listados, para que eu acompanhe o status das minhas solicitações sem ver as de outros.

---

## Acceptance Criteria

### AC-1: Item na sidebar do dashboard
- [ ] Item "Chamados" adicionado na sidebar de navegação do admin (`/dashboard/chamados`)
- [ ] Ícone adequado (ex: `ChatBubbleBottomCenterTextIcon` ou similar do Heroicons)
- [ ] Item visível para todos os roles (admin, supervisor, obras, gerente-comercial)
- [ ] Item não aparece no portal do cliente (`/cliente/*`)

### AC-2: Formulário de abertura de chamado
- [ ] Campo: upload de imagem (screenshot do problema) — aceita JPG, PNG, WEBP, máx. 5MB
- [ ] Campo: descrição da falha/melhoria (textarea, obrigatório, mínimo 20 chars)
- [ ] Campo: motivo da necessidade da mudança (textarea, obrigatório, mínimo 10 chars)
- [ ] Campos auto-preenchidos (readonly): nome do usuário logado, data e hora do envio
- [ ] Botão "Enviar Chamado" com loading state durante submissão
- [ ] Feedback de sucesso após envio (toast ou mensagem inline)
- [ ] Formulário resetado após envio com sucesso

### AC-3: Upload de imagem
- [ ] Imagem enviada para bucket Supabase Storage `chamados-attachments`
- [ ] Bucket com RLS: qualquer usuário autenticado pode fazer upload (insert)
- [ ] Admin pode ler todos; usuário pode ler apenas os seus próprios
- [ ] Imagem exibida como miniatura (thumbnail) na listagem de chamados
- [ ] Se nenhuma imagem enviada, campo é opcional — chamado pode ser aberto sem imagem

### AC-4: Listagem de chamados (usuário não-admin)
- [ ] Usuário não-admin vê apenas seus próprios chamados
- [ ] Cada card exibe: data/hora, trecho da descrição, status badge, miniatura da imagem (se houver)
- [ ] Estado vazio com mensagem amigável: "Nenhum chamado aberto ainda." + CTA para abrir o primeiro
- [ ] Chamados ordenados por `created_at DESC` (mais recentes primeiro)

### AC-5: Listagem de chamados (admin)
- [ ] Admin vê todos os chamados de todos os usuários
- [ ] Cada card exibe adicionalmente: nome do reporter
- [ ] Filtro por status: Aberto / Em análise / Resolvido / Todos
- [ ] Contagem total de chamados visível no header da lista
- [ ] Mesma ordenação: `created_at DESC`

### AC-6: Database e RLS
- [ ] Tabela `chamados` criada com migration
- [ ] Campos: `id`, `description`, `reason`, `image_url`, `reporter_id`, `reporter_name`, `status`, `created_at`
- [ ] RLS INSERT: qualquer usuário autenticado pode inserir (`auth.uid() IS NOT NULL`)
- [ ] RLS SELECT: usuário vê apenas seus próprios; admin vê todos (`is_admin_or_supervisor()`)
- [ ] RLS UPDATE/DELETE: apenas admin (`is_admin_or_supervisor()`)
- [ ] Status default: `aberto`

### AC-7: Segurança
- [ ] Reporter é sempre derivado do usuário autenticado no servidor (nunca via input do cliente)
- [ ] `reporter_id = auth.uid()` forçado na RLS de INSERT — não pode ser forjado
- [ ] Upload de imagem valida MIME type no servidor (accept list)
- [ ] Nenhum dado de outros usuários exposto a não-admins

---

## Tarefas

- [x] T1: Criar migration SQL para tabela `chamados` + RLS policies
- [x] T2: Criar bucket Supabase Storage `chamados-attachments` + policies de acesso
- [x] T3: Criar API route `POST /api/admin/chamados` para criar chamado + upload imagem
- [x] T4: Criar página `/dashboard/chamados/page.tsx` com lista + formulário
- [x] T5: Criar componente `ChamadoForm` (client component) com upload, descrição, motivo
- [x] T6: Criar componente `ChamadoCard` para exibir chamado na listagem
- [x] T7: Adicionar item "Chamados" na sidebar do dashboard
- [x] T8: QA gate — TypeScript: 0 erros, ESLint: 0 erros

---

## Escopo

**IN:**
- Abertura de chamados com imagem opcional + 2 campos de texto
- Listagem filtrada por role (admin vs não-admin)
- Filtro de status para admin
- Upload de imagem para Supabase Storage

**OUT (não nesta story):**
- Atualização de status pelo admin (fase 2)
- Notificações quando chamado é atualizado (fase 2)
- Comentários/threads em chamados (fase 2)
- Integração com sistema de email (fase 2)
- Dashboard de métricas de chamados (fase 2)

---

## Dependências

- Supabase Storage configurado (já ativo no projeto)
- Função SQL `is_admin_or_supervisor()` já existe no banco
- Sidebar do dashboard (`packages/web/src/app/dashboard/_components/sidebar.tsx`)
- Pattern de Server Action / API Route já em uso no projeto

---

## Complexidade Estimada

**Tamanho:** M (Medium)  
**Pontos:** 5  
**Risco:** Baixo — padrões conhecidos, sem integrações externas

---

## Arquivos a Criar/Modificar

**Novos:**
- `packages/web/src/app/dashboard/chamados/page.tsx`
- `packages/web/src/app/dashboard/chamados/_components/chamado-form.tsx`
- `packages/web/src/app/dashboard/chamados/_components/chamado-card.tsx`
- `packages/web/src/app/dashboard/chamados/loading.tsx`
- `packages/web/src/app/api/admin/chamados/route.ts`
- `supabase/migrations/YYYYMMDD_create_chamados.sql`

**Modificados:**
- `packages/web/src/app/dashboard/_components/sidebar.tsx` — adicionar item Chamados

---

## Notas Técnicas

- Usar `createClient()` (server) para queries com RLS no page.tsx
- Upload de imagem: `supabase.storage.from('chamados-attachments').upload(path, file)`
- Verificar role do usuário via `appUser.role` para decidir qual query usar na listagem
- `reporter_name`: salvar snapshot do nome no momento do envio (evitar referência a usuário deletado)
- Imagem URL: salvar URL pública permanente no campo `image_url` após upload bem-sucedido
- Status badge cores: `aberto` → amber, `em_analise` → blue, `resolvido` → green (usar `status-badge.ts`)

---

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-05-26 | @sm (River) | Story criada — Status: Draft |
| 2026-05-26 | @po (Pax) | Validação GO (10/10) — Status: Draft → Ready |
| 2026-05-26 | @dev (Dex) | Implementação completa — Status: Ready → InProgress |
| 2026-05-26 | @qa (Quinn) | QA Gate PASS (7/7) — Status: InProgress → InReview |
