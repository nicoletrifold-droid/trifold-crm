---
epic: 20
title: Portal do Cliente — Acompanhamento de Obra
status: Ready
created_at: 2026-05-04
updated_at: 2026-05-04
created_by: Morgan (@pm)
priority: High
objetivo_negocio:
  - Entregar transparência e confiança ao cliente durante a obra
  - Reduzir chamados e mensagens avulsas via canal único e organizado
  - Diferenciar a Trifold com portal profissional de acompanhamento
depends_on:
  - Supabase Auth já configurado (users + organizations)
  - Resend email já configurado (Story 20.6 usa para notificações)
  - WhatsApp em configuração final (Story 20.6 com flag de fallback)
  - Supabase Storage habilitado (buckets criados em Story 20.1a)
  - Supabase Realtime habilitado (verificar antes de Story 20.4)
sub_epics:
  - 20A: Fundação (Schema + Auth) — stories 20.1a + 20.1b
  - 20B: Portal do Cliente (5 telas) — stories 20.2, 20.3, 20.4
  - 20C: Painel Admin (Gestão de obras) — story 20.5
  - 20D: Notificações — story 20.6
stories_planned: [20.1a, 20.1b, 20.2, 20.3, 20.4, 20.5, 20.6]
validated_by: Pax (@po)
validated_at: 2026-05-04
validation_issues_fixed: [C1, C2, S1, S2]
---

# Epic 20 — Portal do Cliente: Acompanhamento de Obra

## Objetivo do Epic

Criar um portal dedicado ao cliente final (comprador/proprietário) para que ele acompanhe
a evolução da sua obra em tempo real: progresso geral, fases, galeria de fotos, documentos
e canal de mensagens direto com a equipe Trifold.

O cliente acessa via `/cliente` com credenciais próprias (role `cliente` no Supabase).
O admin cria e gerencia as obras pelo painel admin existente em `/dashboard`.

## Contexto do Sistema Existente

- **Auth:** Supabase Auth + tabela `users` com `user_role` enum (`admin`, `supervisor`, `broker`)
- **Login atual** (`/login`): redireciona `broker → /broker`, demais → `/dashboard`
- **Email:** Resend configurado e funcional (usado em campanhas e follow-ups)
- **WhatsApp:** em configuração final (bot já funcional para leads, será reutilizado)
- **Storage:** Supabase Storage já disponível no projeto
- **Realtime:** Supabase Realtime disponível (usado implicitamente em conversations)

## Nova Arquitetura de Dados

### Tabelas novas (criadas nas migrations):

```sql
-- obras: projetos de construção gerenciados pela Trifold
CREATE TABLE obras (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  description text,
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  current_phase_id uuid,  -- FK para obra_fases (adicionado depois com ALTER)
  expected_delivery_date date,
  status varchar(50) NOT NULL DEFAULT 'em_andamento',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- obra_fases: etapas de cada obra (ordem fixa por order_index)
CREATE TABLE obra_fases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  description text,
  order_index integer NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'pendente', -- 'pendente', 'em_andamento', 'concluida'
  progress_pct integer NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  expected_start_date date,
  expected_end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- obra_fotos: fotos de progresso vinculadas a obra e fase
CREATE TABLE obra_fotos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  fase_id uuid REFERENCES obra_fases(id) ON DELETE SET NULL,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id),
  storage_path text NOT NULL,
  caption text,
  taken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- obra_documentos: documentos (ART/RRT, contratos, memoriais)
CREATE TABLE obra_documentos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id),
  name varchar(255) NOT NULL,
  filename text NOT NULL,
  storage_path text NOT NULL,
  category varchar(100),  -- 'ART/RRT', 'Contratos', 'Memoriais'
  file_size_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- cliente_obras: vínculo M:N entre usuário cliente e obras
CREATE TABLE cliente_obras (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, obra_id)
);

-- obra_mensagens: chat por obra entre cliente e equipe
CREATE TABLE obra_mensagens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  sender_type varchar(20) NOT NULL,  -- 'cliente' | 'equipe'
  content text,
  message_type varchar(20) NOT NULL DEFAULT 'text',  -- 'text' | 'image' | 'audio'
  storage_path text,  -- para image/audio
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- obra_notificacao_prefs: preferências de notificação por usuário cliente
CREATE TABLE obra_notificacao_prefs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  email_enabled boolean NOT NULL DEFAULT true,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  notify_nova_foto boolean NOT NULL DEFAULT true,
  notify_novo_documento boolean NOT NULL DEFAULT true,
  notify_nova_mensagem boolean NOT NULL DEFAULT true,
  notify_progresso boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Alteração no schema existente:
- `user_role` enum: adicionar valor `'cliente'`
- `users.role` já aceita o enum — nenhuma outra mudança necessária

## Rotas Novas

| Rota | Tipo | Descrição |
|------|------|-----------|
| `/cliente` | público | Login do cliente (separado do /login admin) |
| `/cliente/[obra_id]` | privado (role: cliente) | Visão Geral |
| `/cliente/[obra_id]/fases` | privado | Fases da Obra |
| `/cliente/[obra_id]/galeria` | privado | Galeria de Fotos |
| `/cliente/[obra_id]/documentos` | privado | Documentos |
| `/cliente/[obra_id]/mensagens` | privado | Chat |
| `/dashboard/obras` | privado (role: admin/supervisor) | Gestão de obras |
| `/dashboard/obras/[obra_id]` | privado | Detalhe da obra (admin) |
| `/dashboard/obras/nova` | privado | Criar nova obra |

## Fluxo de Autenticação

```
/cliente (login page)
  ↓ signInWithPassword
  ↓ check users.role
  → role === 'cliente' → /cliente/[primeira_obra_id]
  → role !== 'cliente' → /login (redirect com msg de erro)

/login (existente)
  → role === 'broker' → /broker (existente)
  → role === 'cliente' → /cliente/[primeira_obra_id]  ← novo branch
  → demais → /dashboard (existente)
```

## Stories

---

### Story 20.1a — Fundação: Migrations, Schema e RLS

**Executor:** `@data-engineer` | **Quality Gate:** `@dev`
**Quality Gate Tools:** `[schema_validation, rls_audit, cross_org_leakage]`
**Complexidade:** G (5h)
**Prioridade:** P0 — bloqueia todas as outras stories

**Descrição:**

Fundação de dados do Portal do Cliente. Apenas SQL — sem código de aplicação.

**Migration `018_portal_cliente.sql`:**

1. Adicionar `'cliente'` ao enum `user_role`:
   ```sql
   ALTER TYPE user_role ADD VALUE 'cliente';
   ```

2. Criar as 7 tabelas novas (schema completo na seção "Nova Arquitetura de Dados" deste epic)

3. FK circular `obras.current_phase_id` — usar strategy de dois passos:
   ```sql
   -- Passo 1: criar obras SEM a FK
   CREATE TABLE obras (..., current_phase_id uuid);
   -- Passo 2: criar obra_fases com FK para obras
   CREATE TABLE obra_fases (..., obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE);
   -- Passo 3: adicionar FK em obras com DEFERRABLE para evitar deadlock em upserts
   ALTER TABLE obras
     ADD CONSTRAINT fk_obras_current_phase
     FOREIGN KEY (current_phase_id) REFERENCES obra_fases(id)
     DEFERRABLE INITIALLY DEFERRED;
   ```

4. Criar buckets no Supabase Storage:
   - `obra-fotos` — público para leitura (policy: `SELECT` para todos)
   - `obra-docs` — privado (acesso via signed URL)
   - `obra-mensagens` — privado (acesso via signed URL)
   > Buckets criados via `supabase storage create` ou pela dashboard. Incluir no migration comentário com instruções.

5. RLS policies:
   - `obras`: `SELECT` para `auth.uid()` em `cliente_obras.user_id` OR `users.role IN ('admin','supervisor')`
   - `obra_fases`, `obra_fotos`, `obra_documentos`, `obra_mensagens`: herdam lógica via subquery em `obras`
   - `obra_notificacao_prefs`: `ALL` apenas para `auth.uid() = user_id`
   - `cliente_obras`: `SELECT` para o próprio cliente; `INSERT/UPDATE/DELETE` para admin/supervisor
   - INSERT/UPDATE/DELETE em `obras`, `obra_fases`, `obra_fotos`, `obra_documentos`: apenas admin/supervisor

**Padrão de RLS existente para referência:** ver `supabase/migrations/004_rls_policies.sql`

**Acceptance Criteria:**
- [ ] Migration 018 aplicada sem erro em dev (`supabase db push`)
- [ ] `user_role` enum contém `'cliente'` (`SELECT enum_range(NULL::user_role)`)
- [ ] 7 tabelas criadas com constraints e FKs corretos
- [ ] FK `obras.current_phase_id` é DEFERRABLE INITIALLY DEFERRED
- [ ] Buckets `obra-fotos`, `obra-docs`, `obra-mensagens` criados no Storage
- [ ] RLS ativa em todas as 7 tabelas (`SELECT relrowsecurity FROM pg_class WHERE relname = 'obras'`)
- [ ] Teste cross-org: cliente da org A não consegue SELECT em obras da org B
- [ ] Teste cross-client: cliente X não consegue SELECT em obras vinculadas apenas ao cliente Y
- [ ] Admin/supervisor consegue INSERT/SELECT em todas as tabelas da sua org
- [ ] `@dev` executa QA gate: query de leakage retorna 0 linhas

**CodeRabbit Integration:** Disabled

**Risco:** MÉDIO — `ALTER TYPE ADD VALUE` é não-blocking no Postgres mas irreversível sem migration de rollback

---

### Story 20.1b — Fundação: Auth Flow, Middleware e Role Metadata

**Executor:** `@dev` | **Quality Gate:** `@architect`
**Quality Gate Tools:** `[auth_flow, middleware_security, role_isolation]`
**Complexidade:** M (4h)
**Prioridade:** P0 — bloqueia 20.2 e 20.5 (pode rodar em paralelo com 20.1a)

**Descrição:**

Camada de autenticação e proteção de rotas para o portal do cliente. Depende de 20.1a para
o enum `cliente` existir, mas pode ser desenvolvida em paralelo.

**Estratégia de role no middleware — Opção B (JWT, zero queries):**

Ao criar/atualizar usuário com role `cliente` no admin, persistir o role no `app_metadata`
do Supabase Auth. O `app_metadata` é incluído automaticamente no JWT, disponível no
middleware sem query extra:

```typescript
// Ao criar usuário cliente (admin action):
await supabase.auth.admin.updateUserById(authId, {
  app_metadata: { role: 'cliente' }
})
```

No middleware, ler o role do JWT:
```typescript
const role = user?.app_metadata?.role ?? appUser?.role
```

**Arquivo a modificar: `packages/web/src/lib/supabase/middleware.ts`**
(NÃO `src/middleware.ts` — este é apenas o wrapper que chama `updateSession()`)

```typescript
// Em updateSession(), após obter user:
const role = user?.app_metadata?.role as string | undefined

// Unauthenticated routing
if (!user) {
  const url = request.nextUrl.clone()
  url.pathname = pathname.startsWith('/cliente') ? '/cliente' : '/login'
  return NextResponse.redirect(url)
}

// Cross-role blocking
if (role === 'cliente' && (pathname.startsWith('/dashboard') || pathname.startsWith('/broker'))) {
  // Buscar primeira obra do cliente para redirect
  const url = request.nextUrl.clone()
  url.pathname = '/cliente'
  return NextResponse.redirect(url)
}

if (role !== 'cliente' && role !== undefined && pathname.startsWith('/cliente/')) {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}
```

**`/cliente` como rota pública** — adicionar ao matcher de rotas públicas em `updateSession()`:
```typescript
if (pathname === '/login' || pathname === '/cliente' || pathname.startsWith('/api/')) {
  // ... lógica existente
}
```

**`packages/web/src/app/login/actions.ts` — atualizar `login()`:**
```typescript
const destination =
  appUser?.role === 'broker' ? '/broker' :
  appUser?.role === 'cliente' ? await getClienteRedirect(supabase, user.id) :
  '/dashboard'

async function getClienteRedirect(supabase, authId: string): Promise<string> {
  const { data: appUser } = await supabase
    .from('users').select('id').eq('auth_id', authId).single()
  if (!appUser) return '/cliente/sem-obra'

  const { data: vinculo } = await supabase
    .from('cliente_obras')
    .select('obra_id')
    .eq('user_id', appUser.id)
    .order('is_primary', { ascending: false })
    .limit(1)
    .single()

  return vinculo ? `/cliente/${vinculo.obra_id}` : '/cliente/sem-obra'
}
```

**`/cliente/sem-obra` — página informativa:**
Página simples: "Nenhuma obra vinculada à sua conta. Entre em contato com a Trifold."

**Acceptance Criteria:**
- [ ] `/cliente` é rota pública (acesso sem autenticação não redireciona para `/login`)
- [ ] Login com role `cliente` → redireciona para `/cliente/[obra_id]` (obra primária)
- [ ] Login com role `cliente` sem obra vinculada → `/cliente/sem-obra`
- [ ] Login com role `cliente` via `/login` existente também funciona
- [ ] Middleware bloqueia `/cliente/[qualquer-rota]` para usuário não autenticado → `/cliente`
- [ ] Middleware bloqueia `/cliente/[qualquer-rota]` para usuário com role != `cliente` → `/login`
- [ ] Middleware bloqueia `/dashboard` e `/broker` para usuário com role `cliente` → `/cliente`
- [ ] role disponível em middleware via `app_metadata` (sem DB query extra)
- [ ] Cliente logado tentando acessar `/cliente/[obra_id_de_outro_cliente]` → 403 ou redirect (RLS bloqueia no DB)

**CodeRabbit Integration:** Disabled

**Risco:** MÉDIO — middleware afeta TODAS as rotas da aplicação; testar rotas existentes após mudança

---

### Story 20.2 — Portal Cliente: Login, Layout e Visão Geral

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Quality Gate Tools:** `[ui_correctness, auth_flow, responsive]`
**Complexidade:** G (6h)
**Prioridade:** P1 — após 20.1

**Descrição:**

Página de login do cliente + layout base com sidebar + página Visão Geral.

**Design:** Dark theme conforme mockup (fundo `#0F0F0F`, acento `#E8856A` / terra cotta).
Manter consistência visual com o sistema existente (Trifold dark).

**`/cliente` — Login Page:**
- Visual idêntico ao `/login` existente mas com rota e redirecionamento para clientes
- Mensagem de erro amigável se tentar logar com role não-cliente
- Sem link para "cadastrar" (usuários criados pelo admin)

**`/cliente/[obra_id]` — Layout (`layout.tsx`):**

Sidebar esquerda (240px) dark com:
- Logo Trifold no topo
- Nav: Visão Geral, Fases da Obra, Galeria de Fotos, Documentos, Mensagens
- Rodapé: nome + email do cliente logado + logout

Se cliente tem múltiplas obras: seletor de obra no topo da sidebar (dropdown).

**`/cliente/[obra_id]/page.tsx` — Visão Geral:**

```
[Header card] Nome da obra + progress bar + % + data de entrega prevista

[4 cards de stats]
  - Fase Atual (nome + status "Em andamento")
  - Progresso (% + badge "No prazo" / "Atrasado")
  - Fase da Obra (nome + "Em execução")
  - Entrega Prevista (data + label "Previsão")

[2 colunas]
  Esquerda: Atividades recentes
    - últimas 10 entradas (fotos adicionadas, docs disponibilizados, mensagens da equipe)
  Direita: Próximos marcos
    - próximas 3-5 fases com status 'pendente', datas e cor por proximidade
```

**Fonte de dados:**
- Progresso e fase atual: `obras` + `obra_fases`
- Atividades recentes: UNION de `obra_fotos`, `obra_documentos`, `obra_mensagens` ordenado por `created_at DESC LIMIT 10`
- Próximos marcos: `obra_fases WHERE status = 'pendente' ORDER BY order_index ASC LIMIT 5`

**Acceptance Criteria:**
- [ ] `/cliente` renderiza página de login (dark theme, logo Trifold)
- [ ] Login com role `cliente` → redireciona para `/cliente/[obra_id]`
- [ ] Sidebar renderiza com 5 itens de navegação
- [ ] Seletor de obra aparece se cliente tiver múltiplas obras
- [ ] Progress bar exibe `obras.progress_pct` corretamente
- [ ] 4 cards de stats com dados reais da obra
- [ ] Atividades recentes: últimas 10 atividades de fotos, docs e mensagens
- [ ] Próximos marcos: até 5 fases pendentes
- [ ] Layout responsivo: sidebar collapsa em mobile (hamburger)
- [ ] Cliente logado em `/cliente/[obra_id_de_outro_cliente]` → 403/redirect

**CodeRabbit Integration:** Disabled

**Risco:** BAIXO — nova rota isolada, sem tocar rotas existentes

---

### Story 20.3 — Portal Cliente: Fases da Obra e Galeria de Fotos

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Quality Gate Tools:** `[ui_correctness, data_accuracy, responsive]`
**Complexidade:** M (5h)
**Prioridade:** P2 — após 20.2

**Descrição:**

Duas telas do portal: cronograma de fases e galeria de fotos.

**`/cliente/[obra_id]/fases` — Fases da Obra:**

```
[Header] "Cronograma da Obra" + progress bar geral + %

[Timeline vertical]
  Para cada fase (ordenada por order_index):
    ● [indicador de status: verde=concluída, laranja=em_andamento, cinza=pendente]
    Card:
      - Número + Nome da fase
      - Descrição
      - Datas: Início (real ou previsto) + Conclusão (real ou previsto)
      - Badge de status: CONCLUÍDA / EM ANDAMENTO / PENDENTE
      - Se em_andamento: progress bar da fase + %
      - Fase ativa: borda esquerda laranja (destaque)
```

**`/cliente/[obra_id]/galeria` — Galeria de Fotos:**

```
[Filtros tabs] "Todas as fases" + uma tab por fase que tem fotos

[Para cada fase com fotos]
  [Header da seção] Nome da fase + badge "X fotos" + data da última foto

  [Grid de fotos] 3 colunas (2 em mobile)
    - Thumbnail com proporção 4:3
    - Caption overlay na parte inferior
    - Click → lightbox com navegação prev/next

[Estado vazio] "Nenhuma foto disponível ainda" se obra sem fotos
```

Fotos servidas do Supabase Storage via `supabase.storage.from('obra-fotos').getPublicUrl(path)`.

**Acceptance Criteria:**
- [ ] Timeline exibe todas as fases em ordem correta
- [ ] Cores dos indicadores corretas por status
- [ ] Fase `em_andamento` tem borda destaque e progress bar
- [ ] Galeria agrupa fotos por fase
- [ ] Filtro de fase funcional (tabs)
- [ ] Lightbox abre ao clicar em foto, com navegação
- [ ] Estado vazio renderiza corretamente
- [ ] Fotos carregam do Supabase Storage (não 404)
- [ ] Responsivo em mobile (grid 2 colunas)

**CodeRabbit Integration:** Disabled

**Risco:** BAIXO — leitura de dados, sem escrita

---

### Story 20.4 — Portal Cliente: Documentos e Mensagens

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Quality Gate Tools:** `[ui_correctness, realtime_messages, file_upload]`
**Complexidade:** G (7h)
**Prioridade:** P2 — após 20.2

**Descrição:**

Tela de documentos e tela de mensagens — a mais complexa do portal.

**`/cliente/[obra_id]/documentos` — Documentos:**

```
[Filtros tabs] "Todos" + "ART/RRT" + "Contratos" + "Memoriais"
  (tabs dinâmicos baseados nas categories existentes na obra)

[Lista de documentos]
  Para cada documento:
    [ícone PDF] Nome | Categoria | Tamanho | Botão "↓ Baixar"
    - Botão Baixar: gera signed URL do Supabase Storage (expira em 60s)
```

**`/cliente/[obra_id]/mensagens` — Mensagens:**

```
[Header] "Equipe Trifold" + indicador online (sempre mostra "Online")

[Feed de mensagens]
  - Mensagens da equipe: alinhadas à esquerda, fundo escuro com borda
    Se enviada por membro específico: "Engo. Lucas Pereira" acima da mensagem
  - Mensagens do cliente: alinhadas à direita, fundo cor de acento
  - Timestamp em cada mensagem (formato: DD/Mmm, HH:mm)
  - Suporte a imagens: thumbnail clicável
  - Suporte a áudio: player nativo HTML5

[Área de input]
  - Campo de texto "Escreva uma mensagem..."
  - Botão 📎 (attach): abre file picker — aceita images/* e audio/*
    → faz upload para Supabase Storage em `obra-mensagens/{obra_id}/{timestamp}-{filename}`
    → cria obra_mensagem com message_type='image'|'audio' e storage_path
  - Botão 🎤 (gravar áudio): MediaRecorder API → upload → mensagem de áudio
  - Botão "Enviar": insere mensagem texto em obra_mensagens
  - Enter envia, Shift+Enter nova linha

[Realtime]
  - Supabase Realtime subscription em `obra_mensagens` filtrada por obra_id
  - Novas mensagens aparecem automaticamente sem refresh
  - Auto-scroll para última mensagem ao receber nova
```

**Side equipe (somente leitura para esta story):**
A equipe responde pelo painel admin (Story 20.5). As mensagens chegam via realtime.

**Acceptance Criteria:**
- [ ] Lista de documentos filtrável por categoria
- [ ] Download gera signed URL (não expõe storage_path diretamente)
- [ ] Mensagens carregam em ordem cronológica
- [ ] Envio de texto funciona e aparece no feed
- [ ] Upload de imagem funciona (thumbnail visível no chat)
- [ ] Upload de áudio funciona (player HTML5 no chat)
- [ ] Realtime: nova mensagem da equipe aparece sem refresh
- [ ] Auto-scroll ao receber nova mensagem
- [ ] Estado vazio de mensagens renderiza corretamente

**CodeRabbit Integration:** Disabled

**Risco:** MÉDIO — Realtime e upload de mídia requerem validação cuidadosa

---

### Story 20.5 — Painel Admin: Gestão de Obras

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Quality Gate Tools:** `[crud_correctness, file_upload, ui_correctness]`
**Complexidade:** XG (8h)
**Prioridade:** P1 — em paralelo com 20.2 (dependência: 20.1)

**Descrição:**

Seção do painel admin para criar e gerenciar obras, popular dados e responder clientes.

**`/dashboard/obras` — Lista de Obras:**

```
[Header] "Obras" + botão "+ Nova Obra"

[Tabela]
  Colunas: Nome | Status | Cliente(s) | Progresso | Entrega Prevista | Ações
  - Ações: [Ver] [Editar] [Arquivar]
```

**`/dashboard/obras/nova` e `/dashboard/obras/[obra_id]/editar`:**

Formulário:
- Nome da obra *
- Descrição
- Data prevista de entrega
- Status (em_andamento / concluída / pausada)
- Progresso geral % (slider 0-100)
- Clientes vinculados (multi-select de usuários com role=`cliente` da org)

**`/dashboard/obras/[obra_id]` — Detalhe Admin:**

5 abas:
1. **Fases:** CRUD de fases (criar, editar, reordenar, atualizar progresso/status/datas)
2. **Fotos:** Upload de fotos (múltiplas), selecionar fase, adicionar caption
3. **Documentos:** Upload de documentos, nome, categoria
4. **Mensagens:** Chat com o cliente — interface igual ao portal, mas no lado da equipe.
   Mensagens da equipe mostram nome do usuário admin logado como remetente.
5. **Clientes:** Gerenciar vínculos cliente ↔ obra

**Upload de arquivos:**
- Supabase Storage bucket `obras` (fotos em `obra-fotos/`, docs em `obra-docs/`)
- Limite: 50MB por arquivo para documentos, 10MB para fotos
- Apenas admin/supervisor tem permissão de upload

**Acceptance Criteria:**
- [ ] CRUD completo de obras (criar, editar, status, progresso)
- [ ] CRUD de fases: criar, editar, reordenar (drag or order_index), atualizar status
- [ ] Upload de múltiplas fotos com seleção de fase
- [ ] Upload de documentos com nome e categoria
- [ ] Chat admin: mensagens enviadas aparecem no portal do cliente via realtime
- [ ] Vínculo admin → cliente: associar/desassociar usuários `cliente` a uma obra
- [ ] Criar usuário `cliente` via painel: formulário em `/dashboard/obras/[obra_id]` → aba Clientes com campo "Adicionar cliente" (email + nome + telefone) → cria `auth.users` + `users` com role `cliente` + `app_metadata: {role: 'cliente'}` + vínculo em `cliente_obras`
- [ ] RLS respeitada: admin só gerencia obras da sua org

**CodeRabbit Integration:** Disabled

**Risco:** MÉDIO — feature grande, priorizar corretude sobre polish

---

### Story 20.6 — Central de Notificações

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Quality Gate Tools:** `[notification_delivery, preference_settings, email_template]`
**Complexidade:** M (5h)
**Prioridade:** P3 — após 20.4 e 20.5

**Descrição:**

Configuração de preferências de notificação pelo cliente e disparo automático de notificações
quando eventos ocorrem na obra.

**Preferências (dentro do portal, ícone de sino ou menu do usuário):**

```
[Central de Notificações]
  "Receber notificações via:"
    ☑ E-mail (seu-email@exemplo.com)
    ☐ WhatsApp (+55 11 99999-9999)
              [salvar número se não preenchido]

  "Notificar quando:"
    ☑ Nova foto adicionada
    ☑ Novo documento disponível
    ☑ Nova mensagem da equipe
    ☑ Progresso da obra atualizado
```

**Triggers de notificação (server-side, via API routes):**

| Evento | Disparado por | Canal |
|--------|-------------|-------|
| Nova foto `obra_fotos` INSERT | Admin faz upload | Email + WhatsApp (se habilitado) |
| Novo doc `obra_documentos` INSERT | Admin faz upload | Email + WhatsApp |
| Nova mensagem da equipe | Admin envia mensagem | Email + WhatsApp |
| Progresso atualizado | Admin edita `obras.progress_pct` | Email + WhatsApp |

**Implementação via database triggers ou Supabase Edge Functions:**
- Opção simples: API route do Next.js que dispara notificação após cada operação admin
- Usar `sendEmail` (Resend — já configurado) para email
- Usar o mesmo cliente WhatsApp já integrado no bot para WhatsApp

**Template de email:**
```
Assunto: "Atualização na sua obra — [Nome da Obra]"
Corpo: transactional template simples com logo Trifold + descrição do evento + CTA "Ver no Portal"
```

**WhatsApp:**
- Mensagem simples: "Olá [Nome]! Há uma atualização na sua obra [Nome Obra]: [evento]. Acesse: [link]"
- Usar `phone` do usuário cliente em `users.phone`
- Se WhatsApp indisponível no momento: log + skip silencioso (sem erro para o usuário)

**Acceptance Criteria:**
- [ ] Página de preferências salva em `obra_notificacao_prefs`
- [ ] Email disparado ao cliente quando admin adiciona foto (se email_enabled=true)
- [ ] Email disparado ao cliente quando admin adiciona documento
- [ ] Email disparado ao cliente quando equipe envia mensagem no chat
- [ ] WhatsApp disparado se whatsapp_enabled=true e users.phone preenchido
- [ ] Se WhatsApp indisponível: skip silencioso + log (não bloqueia operação admin)
- [ ] Cliente pode desabilitar qualquer canal ou tipo de notificação
- [ ] Template de email com logo e CTA funcional

**CodeRabbit Integration:** Disabled

**Nota futura:** Stories `10-1-setup-pwa.md` e `10-2-push-notifications.md` já existem em `docs/stories/completed/`. Quando PWA for retomado, referenciar esse trabalho como base em vez de tratar como greenfield.

**Risco:** BAIXO — email já funcional; WhatsApp com fallback gracioso

---

## Dependências e Pré-requisitos

| Dependência | Status | Necessária para |
|-------------|--------|-----------------|
| Supabase Auth (`users` + `organizations`) | Em produção | 20.1a |
| `user_role` enum acessível via migration | Em produção | 20.1a |
| Resend configurado (`RESEND_API_KEY`) | Em produção | 20.6 |
| WhatsApp bot funcional | Em configuração | 20.6 (com fallback) |
| Supabase Storage habilitado + buckets criados | Criado em 20.1a | 20.3, 20.4, 20.5 |
| Supabase Realtime habilitado | Verificar antes de 20.4 | 20.4 |
| `app_metadata.role` em auth users clientes | Implementado em 20.1b | 20.2, middleware |

## Estimativa e Sequência

| Story | Executor | Complexidade | Estimativa | Bloqueada por |
|-------|----------|-------------|------------|---------------|
| 20.1a — Migrations, Schema e RLS | @data-engineer | G | 5h | — |
| 20.1b — Auth Flow e Middleware | @dev | M | 4h | 20.1a (enum `cliente`) |
| 20.2 — Login + Layout + Visão Geral | @dev | G | 6h | 20.1a + 20.1b |
| 20.3 — Fases + Galeria | @dev | M | 5h | 20.2 |
| 20.4 — Documentos + Mensagens | @dev | G | 7h | 20.2 |
| 20.5 — Painel Admin: Gestão de Obras | @dev | XG | 8h | 20.1a + 20.1b |
| 20.6 — Notificações | @dev | M | 5h | 20.4 + 20.5 |

**Total estimado: ~40h** (~5-6 dias dev dedicado)

**Sequência:**
```
20.1a (schema) → 20.1b (auth) → 20.2 + 20.5 em paralelo → 20.3 + 20.4 → 20.6
```
> 20.1a e 20.1b podem rodar em paralelo após alinhamento de que o enum `cliente` será criado em 20.1a.

## Compatibilidade

- [x] Nenhuma rota existente modificada (só adições)
- [x] Login actions atualizado com branch novo (não-breaking para roles existentes)
- [x] Middleware atualizado com regra adicional para `/cliente/*`
- [x] Enum `user_role` apenas adiciona valor (não-breaking em Supabase)
- [x] Rollback: remover rotas `/cliente/*` e `/dashboard/obras` sem efeito em outras features

## Gestão de Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| RLS cross-org leakage (cliente vê dados de outro cliente) | Alta | @data-engineer valida em 20.1; teste explícito na QA gate |
| Alteração enum `user_role` em produção | Média | Migration `ALTER TYPE ... ADD VALUE` é não-blocking no Postgres |
| Realtime + upload simultâneo no chat | Média | Testes de integração em 20.4; auto-scroll defensivo |
| WhatsApp indisponível ao lançar 20.6 | Baixa | Implementado com flag + skip silencioso desde o início |
| Supabase Storage bucket não configurado | Média | Verificar antes de iniciar 20.3; criar bucket em 20.1 |

## Definition of Done

- [ ] Story 20.1a: 7 tabelas criadas + RLS auditada + buckets Storage + enum `cliente`
- [ ] Story 20.1b: auth flow + middleware + `app_metadata` com role para JWT
- [ ] Story 20.2: portal acessível via `/cliente`, visão geral com dados reais
- [ ] Story 20.3: fases e galeria funcionais com dados do admin
- [ ] Story 20.4: documentos + chat realtime com upload de imagem/áudio
- [ ] Story 20.5: admin consegue criar obra, popular dados, responder cliente
- [ ] Story 20.6: notificações por email funcionando; WhatsApp com fallback
- [ ] QA gate PASS em todas as stories
- [ ] @devops push após cada QA gate aprovado
- [ ] Cliente real consegue fazer login, ver obra e trocar mensagem com a equipe

## Handoff para @sm

> Criar stories detalhadas para o **Epic 20 — Portal do Cliente**.
>
> **Sequência obrigatória:** 20.1a → 20.1b → 20.2 + 20.5 em paralelo → 20.3 + 20.4 → 20.6
>
> **Stack:** Next.js 14 App Router, Supabase (Auth + Storage + Realtime), TypeScript, Tailwind
>
> **Padrões de referência:**
> - RLS existente: `supabase/migrations/004_rls_policies.sql`
> - Login/actions: `packages/web/src/app/login/actions.ts`
> - Middleware REAL (onde a lógica está): `packages/web/src/lib/supabase/middleware.ts`
>   (NÃO `src/middleware.ts` — este só chama updateSession())
> - Supabase client: `packages/web/src/lib/supabase/`
> - Email (Resend): `packages/web/src/app/api/` — buscar padrão de uso existente
>
> **Decisões arquiteturais validadas pelo @po:**
> - Story 20.1a: @data-engineer cria migration + RLS + Storage buckets
> - Story 20.1b: @dev implementa auth flow + middleware; role armazenado em `app_metadata` (JWT, sem DB query no middleware)
> - FK circular `obras.current_phase_id`: usar DEFERRABLE INITIALLY DEFERRED
> - Buckets necessários: `obra-fotos` (público), `obra-docs` (privado), `obra-mensagens` (privado)
> - Criação de usuário `cliente` é OBRIGATÓRIA no AC de Story 20.5 (não opcional)
> - CodeRabbit: Disabled em todas as stories (incluir notice em cada uma)
>
> **Design:** dark theme com acento terra cotta (#E8856A).
> Ver `packages/web/src/app/globals.css` para tokens de cor existentes.

— Morgan, planejando o futuro 📊
