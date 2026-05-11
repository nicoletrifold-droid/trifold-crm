# Epic 24 — Empreendimentos ↔ Obras: Ponte entre Vendas e Acompanhamento de Obra

## Objetivo

Criar a ponte entre o módulo de empreendimentos (`properties`) e o módulo de acompanhamento de obra (`obras`), permitindo que cada empreendimento tenha uma obra vinculada e que os clientes que compraram unidades sejam automaticamente inseridos no portal de acompanhamento.

## Contexto de Negócio

Hoje o CRM opera dois sistemas completamente separados:

| Sistema | Tabela | Propósito |
|---------|--------|-----------|
| Empreendimentos | `properties` | Cadastro de projetos: tipologias, unidades, vendas, leads |
| Obras | `obras` + `cliente_obras` | Portal do cliente: fases, fotos, documentos, mensagens |

**O gap:** quando uma venda é registrada, o cliente NÃO é automaticamente vinculado à obra do empreendimento. A equipe precisa fazer isso manualmente. Além disso, não há como saber, olhando para um empreendimento, qual obra corresponde a ele — e vice-versa.

**A oportunidade:** empreendimentos em fase de lançamento e venda PRECISAM de uma obra ativa para acompanhamento. Ao criar o vínculo, habilitamos:

1. Visão unificada: da captação do lead → venda → acompanhamento de obra
2. Automação: ao registrar uma venda, o cliente entra automaticamente no portal
3. Backfill: empreendimentos existentes recebem suas obras já cadastradas
4. Eficiência operacional: uma única fonte de verdade para o status do empreendimento

## Stories

| Story | Título | Prioridade | Estimativa | Status |
|-------|--------|------------|------------|--------|
| 24.1 | DB Migration: `property_id` em `obras` | P0 — Fundação | 2h | Draft |
| 24.2 | Admin UI: Vincular Empreendimento ↔ Obra | P0 — Core | 5h | Draft |
| 24.3 | Backfill: Vincular Empreendimentos Existentes | P0 — Dados | 3h | Draft |
| 24.4 | Auto-criar Obra ao Cadastrar Empreendimento | P1 — UX | 3h | Draft |
| 24.5 | Auto-vincular Cliente à Obra na Venda de Unidade | P1 — Automação | 4h | Draft |

**Total estimado:** ~17h de desenvolvimento

## Sequência de Implementação

```
Story 24.1 (DB) → Story 24.2 (UI Admin) → Story 24.3 (Backfill)
                                         ↘ Story 24.4 (Auto-criar)
                                           ↘ Story 24.5 (Auto-vincular na venda)
```

Stories 24.4 e 24.5 dependem de 24.1 + 24.2. Story 24.3 pode rodar em paralelo com 24.4.

## Critérios de Sucesso do Epic

- [ ] Cada `obra` pode ter no máximo 1 `property` vinculada (FK nullable)
- [ ] Admin consegue vincular/desvincular empreendimento ↔ obra pela UI
- [ ] Todos os empreendimentos existentes com obra cadastrada estão vinculados
- [ ] Ao cadastrar novo empreendimento, admin pode criar obra vinculada no mesmo fluxo
- [ ] Ao registrar venda de unidade, o cliente é automaticamente adicionado à obra vinculada
- [ ] Tela do empreendimento mostra o status e link direto para a obra
- [ ] Tela da obra mostra o empreendimento vinculado com link

## Arquitetura da Solução

### DB Change (Story 24.1)

```sql
-- Adiciona property_id nullable à tabela obras
ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS property_id uuid
  REFERENCES properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_obras_property_id ON obras(property_id);
```

**Nullable** porque obras podem existir sem um empreendimento vinculado (ex: obras internas da construtora).

### API Surface Necessária

| Método | Rota | Propósito |
|--------|------|-----------|
| `GET` | `/api/admin/properties/[id]/obra` | Retorna obra vinculada ao empreendimento |
| `POST` | `/api/admin/properties/[id]/obra` | Vincula obra existente OU cria nova obra |
| `DELETE` | `/api/admin/properties/[id]/obra` | Desvincula obra do empreendimento |
| `GET` | `/api/admin/obras?property_id=X` | Lista obras (com filtro por property) |

### UI Changes

**Em `/dashboard/properties/[id]`** (nova seção "Obra Vinculada"):
- Badge de status da obra (em andamento / concluída / pausada)
- Progresso % da obra
- Link direto para `/dashboard/obras/[obra_id]`
- Botão "Vincular Obra Existente" (dropdown) ou "Criar Nova Obra"
- Botão "Desvincular" (se vinculada)

**Em `/dashboard/obras/[id]`** (nova seção "Empreendimento"):
- Nome do empreendimento vinculado
- Link direto para `/dashboard/properties/[property_id]`
- Status do empreendimento (lançamento / em venda / entregue)

### Backfill Tool (Story 24.3)

Tela admin simples em `/dashboard/obras/backfill` ou modal na listagem de obras:
- Lista obras sem `property_id`
- Para cada obra: dropdown para selecionar o empreendimento correspondente
- Salva vínculos em batch

### Auto-vínculo na Venda (Story 24.5)

Hook na criação de `unit_sale`:
```
unit_sale criada
  → busca unit.property_id
  → busca obras.property_id = property_id
  → se obra encontrada: insere em cliente_obras (user_id=comprador, obra_id)
  → se cliente não tem auth user: cria conta temporária (mesmo fluxo de criar cliente)
```

## Dependências

- Epic 20 (Portal do Cliente) — `obras`, `cliente_obras`, `obra_*` tables operacionais ✅
- Migration 019/020 — enum `cliente` e tabelas do portal ✅
- `/dashboard/properties/[id]` — UI de empreendimento existente ✅
- `/dashboard/obras/[id]` — UI de obra existente ✅

## Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Empreendimento com múltiplas obras (ex: 2 torres) | Média | `property_id` nullable 1:1 por ora; extensão para 1:N em epic futuro se necessário |
| Cliente sem conta no portal ao registrar venda | Alta | Story 24.5 usa o mesmo fluxo já existente de criar auth user temporário |
| RLS: cliente vendo obras de outros | Baixa | Política `cliente_obras_select_self` já impede; nenhuma mudança necessária |
| Backfill incorreto (obra vinculada ao empreendimento errado) | Média | UI de backfill permite revisão visual antes de salvar |

## Fora do Escopo deste Epic

- Múltiplas obras por empreendimento (1:N) — avaliar em epic futuro
- Relatórios cruzando dados de vendas + progresso de obra — epic futuro
- Notificações automáticas ao cliente após vínculo — já coberto pelas prefs de notificação do Epic 20
- Integração com cronograma de obra externo (ex: MS Project) — fora do roadmap atual
