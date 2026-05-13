# Story 29.3 — UI: Painel de Controle de Brindes

## Status: Ready

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run typecheck", "npm run lint", "browser test"]

## Story

**Como** administrador ou supervisor do Trifold CRM,
**Quero** ter um painel em `/dashboard/brindes` com tabela de destinatários de brindes, filtros por todos os campos, controle de status de entrega por data comemorativa e CRUD completo,
**Para que** eu possa substituir a planilha Excel e ter visibilidade em tempo real do status das entregas.

## Contexto

Depende da Story 29.1 (tabelas) e Story 29.2 (API routes). Esta story é a entrega final do Epic 29: o painel completo.

**Dados a importar:** ~1015 registros da planilha Excel com os campos Nome da Obra, Mães/Pais, Observação, Endereço. O import será feito via CSV upload ou cola de dados na própria UI.

## Acceptance Criteria

### Acesso e Navegação
- [ ] AC1: Rota `/dashboard/brindes` acessível para roles `admin` e `supervisor`; outros roles recebem redirect para `/dashboard`
- [ ] AC2: Item "Brindes" aparece na sidebar para admin e supervisor (após "Obras" no menu)
- [ ] AC3: Rota protegida via guard no `dashboard/layout.tsx` ou `page.tsx`

### Painel Principal — Tabela
- [ ] AC4: Tabela exibe colunas: Nome da Obra, Tipo (ícone Mãe/Pai), Nome, Cidade/Estado, Status (badge colorido), Ações
- [ ] AC5: Tabela paginada (50 por página) com controles de navegação anterior/próximo
- [ ] AC6: Contagem total de registros exibida acima da tabela ("X destinatários")
- [ ] AC7: Status de entrega exibido como badge colorido: Pendente (cinza), Entregue (verde), Não encontrado (vermelho)
- [ ] AC8: Status depende da data comemorativa selecionada no seletor (AC12)

### Filtros
- [ ] AC9: Barra de filtros com campos: Nome da Obra (select com opções únicas), Tipo (select: Todos/Mãe/Pai), Nome (input texto, busca parcial), Cidade (input texto), Estado (select UF)
- [ ] AC10: Filtros aplicados em tempo real (debounce 300ms para inputs de texto) via chamada à API `/api/brindes/destinatarios`
- [ ] AC11: Botão "Limpar filtros" reseta todos os campos
- [ ] AC12: Seletor de Data Comemorativa no topo da página (dropdown com datas ativas ordenadas por data); quando selecionado, a coluna Status reflete o status de entrega para aquela data

### CRUD — Destinatários
- [ ] AC13: Botão "Novo Destinatário" abre modal de criação com campos: Nome da Obra (input + sugestões das obras existentes), Tipo (select Mãe/Pai/Outro), Nome completo, Observação, e seção de endereço com subcampos: Logradouro, Número, Complemento, Bairro, Cidade, Estado (select UF), CEP, Referência (ex: "OBRA COMUNIDADE")
- [ ] AC14: Modal de edição abre ao clicar em "Editar" na linha; carrega dados existentes do destinatário
- [ ] AC15: Confirmação de exclusão antes de deletar; exibir nome do destinatário na mensagem de confirmação
- [ ] AC16: Após criar/editar/deletar, tabela atualiza sem reload de página (router.refresh() ou revalidação)

### Controle de Status de Entrega
- [ ] AC17: Badge de status na tabela é clicável quando uma data comemorativa está selecionada
- [ ] AC18: Clicar no badge abre dropdown inline com opções: "Pendente", "Entregue", "Não encontrado"
- [ ] AC19: Ao selecionar novo status, chamar `POST /api/brindes/entregas` (upsert) e atualizar badge sem reload
- [ ] AC20: Para destinatários sem entrega registrada para a data selecionada, badge exibe "Pendente" como estado padrão (cinza)

### Gerenciar Datas Comemorativas
- [ ] AC21: Link/botão "Gerenciar Datas" abre modal com lista das datas comemorativas da org
- [ ] AC22: Modal exibe: nome, data formatada (ex: "25/12/2026"), badge ativa/inativa, botão "Desativar/Ativar"
- [ ] AC23: Formulário no modal para adicionar nova data: nome (texto), data (input type="date")

### Import de Dados da Planilha
- [ ] AC24: Seção "Importar" abre modal com textarea para colar linhas no formato CSV (separador vírgula ou tab)
- [ ] AC25: Formato aceito: `obra_nome;tipo;nome;observacao;endereco_raw` (separador `;`)
- [ ] AC26: Preview das primeiras 5 linhas antes de confirmar import
- [ ] AC27: Após import, exibir resultado: "X registros importados, Y erros" com detalhes dos erros
- [ ] AC28: Endereço bruto (`endereco_raw`) passa pelo `parseEndereco()` no servidor via `POST /api/brindes/import`

## Escopo

**IN:**
- Página `/dashboard/brindes/page.tsx` (server component inicial)
- Componentes client: `BrindesTable`, `BrindesFilterBar`, `DestinatarioModal`, `DateSelector`, `StatusBadge`, `DatasModal`, `ImportModal`
- Item na sidebar
- Guard de acesso

**OUT:**
- Exportação para Excel/PDF (pode ser adicionada em story futura)
- Notificações de entrega por WhatsApp/email
- Histórico de alterações de status

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| 1015 registros lentos na tabela | Baixa | Paginação de 50 itens + índices no banco (criados em 29.1) |
| Import de CSV com caracteres especiais (ç, ã) | Média | Usar `TextDecoder` com UTF-8, testar com arquivo real da planilha |
| Sidebar com item novo quebrando layout | Baixa | Seguir padrão exato dos outros itens no `dashboard/layout.tsx` |

## Dev Notes

### Estrutura de arquivos a criar
```
packages/web/src/app/dashboard/brindes/
├── page.tsx                           (server component, carga inicial)
└── _components/
    ├── brindes-table.tsx              (client — tabela paginada)
    ├── brindes-filter-bar.tsx         (client — filtros)
    ├── date-selector.tsx              (client — seletor de data comemorativa)
    ├── status-badge.tsx               (client — badge clicável de status)
    ├── destinatario-modal.tsx         (client — criar/editar)
    ├── datas-modal.tsx                (client — gerenciar datas)
    └── import-modal.tsx              (client — import CSV)
```

### Guard de acesso (padrão do projeto)
Ver `packages/web/src/app/dashboard/obras/page.tsx`:
```typescript
import { getServerUser } from "@web/lib/auth"
import { redirect } from "next/navigation"

export default async function BrindesPage() {
  const user = await getServerUser()
  if (!["admin", "supervisor"].includes(user.role)) {
    redirect("/dashboard")
  }
  // ...
}
```

### Sidebar — onde adicionar
Arquivo: `packages/web/src/app/dashboard/layout.tsx`

**Padrão exato do projeto** (verificado no arquivo — ícones são JSX inline, sem campo `roles`):

1. Adicionar `Gift` ao bloco de imports do lucide-react no topo do arquivo
2. Criar constante após `NAV_ITEM_OBRAS`:
```typescript
const NAV_ITEM_BRINDES = { href: "/dashboard/brindes", label: "Brindes", icon: <Gift className={ICON_SIZE} /> }
```
3. Adicionar ao array `navItems` dentro do bloco `isAdminOrSupervisor` (após `NAV_ITEM_OBRAS`):
```typescript
const navItems = isObras
  ? [NAV_ITEM_OBRAS]
  : [
      ...NAV_ITEMS_BASE,
      ...(isAdminOrSupervisor ? [NAV_ITEM_OBRAS, NAV_ITEM_BRINDES] : []),
      // ... resto igual
    ]
```
O controle de visibilidade por role já é feito pelo spread condicional — não há campo `roles` nos objetos de nav.

### Carga inicial (server component)
```typescript
// page.tsx — server component
const supabase = await createClient()
const { data: datas } = await supabase
  .from("datas_comemorativas")
  .select("id, nome, data, ativa")
  .eq("org_id", user.orgId)
  .eq("ativa", true)
  .order("data")

const { data: obras } = await supabase
  .from("brindes_destinatarios")
  .select("obra_nome")
  .eq("org_id", user.orgId)
  // Distinct via agrupamento no JS ou via .distinct() se disponível

// Passa datas e obras únicas como props para BrindesTable (client)
```

### Padrão de modal existente
Ver `packages/web/src/app/dashboard/obras/_components/obra-create-modal.tsx` para referência completa de:
- useState para campos do form
- fetch para API route
- router.refresh() após sucesso
- Tratamento de loading e error

### Estados UF para select de estado
```typescript
const UF_OPTIONS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]
```

### Formato CSV para import (AC24-28)
Orientação ao usuário no modal:
```
Formato: obra_nome;tipo;nome;observacao;endereco_raw
tipo: mae, pai ou outro
Exemplo:
COMUNIDADE EVANGELICA;pai;João da Silva;Retirar na portaria;Rua das Flores 123, Maringá - PR
FORTEGREEN;mae;Maria Souza;;OBRA FORTEGREEN
```

### Arquivos existentes a modificar
- `packages/web/src/app/dashboard/layout.tsx` — adicionar item "Brindes" na sidebar

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não habilitado em `core-config.yaml`. Quality validation via revisão manual.

### Story Type Analysis
**Primary Type**: Frontend
**Secondary Type(s)**: API (consumo)
**Complexity**: High — 7 componentes client, server component, sidebar, guard, modal de import

### Quality Gate Tasks
- [ ] Pre-Commit (@dev): `npm run typecheck && npm run lint` sem erros
- [ ] Browser test: testar golden path — abrir `/dashboard/brindes`, aplicar filtro, criar destinatário, mudar status, importar 3 registros via CSV

### CodeRabbit Focus Areas
**Primary Focus:**
- Autenticação: guard de acesso correto no page.tsx
- Performance: não carregar 1015 registros de uma vez (paginação obrigatória)
- UX: feedback visual em todas as operações assíncronas (loading states)

**Secondary Focus:**
- Sidebar: visibilidade correta por role (admin/supervisor apenas)
- Import: tratamento de UTF-8 e validação de formato antes de enviar ao servidor

## Tasks

- [ ] 1. Criar `packages/web/src/app/dashboard/brindes/page.tsx` (server component, guard, carga inicial de datas e obras únicas) (AC1, AC3)
- [ ] 2. Criar `_components/date-selector.tsx` — dropdown de datas comemorativas com estado selecionado (AC12)
- [ ] 3. Criar `_components/brindes-filter-bar.tsx` — filtros com debounce para texto (AC9, AC10, AC11)
- [ ] 4. Criar `_components/status-badge.tsx` — badge clicável com dropdown inline de status (AC7, AC17, AC18, AC19, AC20)
- [ ] 5. Criar `_components/brindes-table.tsx` — tabela paginada integrando filter-bar, date-selector e status-badge (AC4, AC5, AC6, AC8)
- [ ] 6. Criar `_components/destinatario-modal.tsx` — formulário criar/editar com todos os campos de endereço (AC13, AC14, AC15, AC16)
- [ ] 7. Criar `_components/datas-modal.tsx` — listar, ativar/desativar, criar nova data comemorativa (AC21, AC22, AC23)
- [ ] 8. Criar `_components/import-modal.tsx` — textarea CSV, preview 5 linhas, resultado do import (AC24-AC28)
- [ ] 9. Adicionar item "Brindes" na sidebar do `dashboard/layout.tsx` (AC2)
- [ ] 10. `npm run typecheck && npm run lint` sem erros
- [ ] 11. Testar no browser: fluxo completo (filtros, criar, editar, deletar, mudar status, importar)

## Estimativa: 6h

## Dependências

- Story 29.1 concluída (tabelas no banco)
- Story 29.2 concluída (API routes disponíveis)

## Change Log

| Data | Versão | Descrição | Agente |
|------|--------|-----------|--------|
| 2026-05-13 | 1.0 | Story criada — Epic 29 Controle de Brindes | @sm (River) |
| 2026-05-13 | 1.1 | Should-Fix: padrão de sidebar corrigido (JSX inline + `NAV_ITEM_BRINDES` + spread condicional) | @po (Pax) |
