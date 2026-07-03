# Story 75-117 — Módulo "Central de Materiais" (link marketing → corretor)

## Metadata
- **Status:** Draft — aguardando @po *validate · **Epic:** 35 (Permissões / Módulos) · **Branch:** feat/75-117-central-materiais · **Complexidade:** M (3-4 pontos)
- **executor:** @dev + @data-engineer (tabela config) · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, teste de acesso por perfil, migration idempotente em txn rollback]
- **Prioridade:** 🟢 MÉDIA — gestão quer dar aos corretores acesso rápido às peças de marketing (fotos, artes, tudo que o marketing produz), hoje só num link solto de SharePoint.

## Story
**As a** gestor comercial, **I want** um módulo "Central de Materiais" no menu que leve os corretores aos materiais de marketing (link externo), **so that** o corretor encontre num clique tudo que o marketing produz — sem eu depender de dev pra trocar o link nem pra liberar novos perfis.

## Contexto
Hoje os materiais do marketing vivem numa pasta de SharePoint compartilhada (link solto, hoje pessoal de um usuário). A ideia é transformar isso em módulo do CRM.

**Padrão a reusar (link externo no menu):** o item "Fluxo de Pagamento" já é exatamente isso — `{ href: "https://...", label, icon, external: true }` em `packages/web/src/app/dashboard/layout.tsx:241`, gated por `permissions["fluxo"]` (matriz de Perfil de Acesso). A Central de Materiais clona esse padrão.

**Matriz de Perfil de Acesso:** módulos ficam em `packages/web/src/lib/permissions-modules.ts` (`ALL_MODULES` + `MODULE_LABELS` + `MODULE_DESCRIPTIONS`) e são resolvidos via `getUserPermissions` / `canAccess`. Registrar `"materiais"` ali é o que faz o módulo (a) aparecer na matriz e (b) ser liberável a qualquer perfil **sem dev** — atende ao pedido de "se alguém mais precisar, fazemos via sistema". Padrão de seed já usado na Story 75-93 (migration 132).

**Config editável:** não há tabela genérica de settings key-value; o padrão do projeto é tabela org-scoped dedicada (ex.: `roleta_config`, `email_settings`). Criar `materiais_config` (org_id UNIQUE, url, updated_by, updated_at) e uma seção de edição em Configurações. Assim admin/supervisor troca a URL do SharePoint sem dev (link de SharePoint quebra/muda).

## Escopo
**IN:**
1. **Registrar módulo `"materiais"`** em `lib/permissions-modules.ts`: `ALL_MODULES` += `"materiais"`, `MODULE_LABELS["materiais"]="Central de Materiais"`, `MODULE_DESCRIPTIONS["materiais"]="Materiais de marketing (artes, fotos, peças) para os corretores."`.
2. **Migration** (idempotente `ON CONFLICT DO NOTHING`) — seed `role_permissions` p/ todos os roles de todas as orgs espelhando o acesso pedido:
   - `materiais` = true para: `admin`, `supervisor`, `gerente-comercial`, `consultoria`, `corretor`; demais false.
3. **Tabela `materiais_config`** (mesma migration ou vizinha): `org_id uuid NOT NULL UNIQUE`, `url text`, `updated_by uuid`, `updated_at timestamptz default now()`. Sem RLS policy pública (acesso via admin client server-side, padrão dos guards). Seed opcional da URL inicial do SharePoint em branco (gestor cola depois).
4. **Item de menu** em `dashboard/layout.tsx`, **logo abaixo do `fluxoItem`**: `const showMateriais = Boolean(permissions["materiais"])`; `materiaisItem = { href: <url da config>, label: "Central de Materiais", icon: <BookOpen/>, external: true }`. Inserir em `afterRoleta` após o Fluxo. Se a URL estiver vazia, apontar para uma página interna `/dashboard/materiais` que mostra "materiais em breve / peça ao gestor configurar" (evita link quebrado).
5. **Seção de config** em Configurações (gate admin/supervisor): campo "URL da Central de Materiais" + salvar → grava em `materiais_config`. Validação de URL (https).
6. **Menu do corretor** (`/broker`): adicionar o mesmo item de link externo no menu do corretor, gated por `permissions["materiais"]` do usuário corretor (corretor está no seed = true).

**OUT:**
- Não hospeda arquivos no CRM (sem bucket/upload) — é link externo pro SharePoint. (Trazer arquivos pra dentro é uma Fase 2 futura, só se o marketing topar subir no CRM.)
- Não embute o SharePoint em iframe (SharePoint bloqueia framing) — abre em nova aba (`external: true`).
- Não cria perfil/permissão fina nova além do módulo na matriz.

## Acceptance Criteria
1. **Given** a matriz de Perfil de Acesso, **then** "Central de Materiais" aparece como módulo e pode ser ligado/desligado por perfil.
2. **Given** o seed, **then** admin, supervisor, gerente-comercial, consultoria e corretor já veem o item no menu; demais perfis não.
3. **Given** a URL configurada, **then** clicar em "Central de Materiais" (dashboard e app do corretor) abre o link do SharePoint em **nova aba**.
4. **Given** admin/supervisor em Configurações, **then** consegue trocar a URL e a mudança reflete no menu de todos — **sem dev**.
5. **Given** a URL ainda não configurada, **then** o item leva a uma página interna com aviso (nunca um link quebrado/vazio).
6. **Given** um perfil com "Central de Materiais" desmarcado na matriz, **then** o item some pra quem tem esse perfil.
7. migration idempotente (rodar 2x não duplica); acesso preservado (ninguém perde módulo existente); typecheck/lint limpos.

## Dev Notes
- Ícone sugerido: `BookOpen` ou `Images` (lucide) — combina com "materiais/artes". Confirmar import no bloco de ícones do layout.
- `afterRoleta` (dashboard/layout.tsx:250): inserir `...(showMateriais ? [materiaisItem] : [])` **após** `...(showFluxo ? [fluxoItem] : [])` para ficar abaixo do Fluxo de Pagamento.
- URL vem da config: buscar `materiais_config.url` no server component do layout (1 query org-scoped) junto com as demais; se vazia → `href: "/dashboard/materiais"`.
- Seed do módulo (mesma cara da migration 132 da Story 75-93):
  ```sql
  INSERT INTO role_permissions (org_id, role_id, module, can_access)
  SELECT r.org_id, r.id, 'materiais',
         r.name IN ('admin','supervisor','gerente-comercial','consultoria','corretor')
  FROM roles r
  ON CONFLICT (role_id, module) DO NOTHING;
  ```
- Verificar numeração da migration antes de criar (conflito histórico em torno de 074/075; olhar o maior número atual em `supabase/migrations`).
- ⚠️ Raio de impacto toca controle de acesso e o menu de todos. Testar seed em txn rollback + provar que nenhum perfil perde módulo. Ref. [[feedback-nao-quebrar-o-que-funciona]], [[project-roles-permissoes]], [[project-submodulos-perfil-acesso]] (cuidado com "botão que mente" — só ligar na matriz o que é realmente gateado).
- Decisões de produto travadas com o usuário: nome = "Central de Materiais"; posição = abaixo de Fluxo de Pagamento; URL editável no sistema (não hardcoded); visível no dashboard + app do corretor; perfis iniciais = admin/supervisor/gerente-comercial/consultoria/corretor.
