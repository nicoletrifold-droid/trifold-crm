# Epic 29 — Controle de Entrega de Brindes

## Objetivo

Criar um módulo no painel administrativo para controle de entrega de brindes em datas comemorativas, substituindo a planilha Excel utilizada hoje pela equipe da Trifold.

## Contexto de Negócio

A Trifold mantém uma planilha Excel ("Controle Clientes") com ~1015 registros para controlar a entrega de brindes para colaboradores das obras (pais, mães e outros). A planilha contém: Nome da Obra, Mães, Pais, Observação de entrega, Endereço (campo único sem separação cidade/estado/CEP).

**Problemas do processo atual:**
- Sem controle de status por entrega (entregue / pendente / não encontrado)
- Endereço em campo único sem filtros por cidade/estado
- Sem histórico por data comemorativa
- Sem filtros eficientes para localizar registros

**Este epic entrega:**
1. Banco de dados estruturado para datas comemorativas e destinatários
2. API REST completa (CRUD)
3. Painel web com tabela, filtros por todos os campos e controle de status por entrega
4. Parser de endereços legados (converte texto livre → campos estruturados)
5. Seed pré-cadastrado com datas comemorativas brasileiras mais comuns

## Stories

| Story | Título | Executor | Estimativa | Status |
|-------|--------|----------|------------|--------|
| 29.1 | DB Schema: tabelas + RLS + seed datas comemorativas | @data-engineer | 3h | Draft |
| 29.2 | API Routes: CRUD destinatários, entregas e datas + parser de endereço | @dev | 4h | Draft |
| 29.3 | UI: Painel `/dashboard/brindes` com tabela, filtros e CRUD | @dev | 6h | Draft |

**Total estimado:** ~13h de desenvolvimento

## Sequência de Implementação

```
Story 29.1 (DB) → Story 29.2 (API) → Story 29.3 (UI)
```

As 3 stories são estritamente sequenciais: cada uma depende da anterior.

## Critérios de Sucesso do Epic

- [ ] Tabelas `datas_comemorativas`, `brindes_destinatarios`, `brindes_entregas` criadas com RLS correto
- [ ] Datas comemorativas pré-cadastradas: Natal, Páscoa, Dia das Mães, Dia dos Pais, Carnaval, Dia do Trabalho, São João, Finados, Dia das Crianças, Dia dos Namorados (2026 e 2027)
- [ ] Endereços separados em: logradouro, número, complemento, bairro, cidade, estado, CEP, referência
- [ ] Parser automático para endereços legados da planilha Excel
- [ ] Painel em `/dashboard/brindes` acessível para admin e supervisor
- [ ] Tabela paginada com todos os destinatários
- [ ] Filtros por: Nome da Obra, Tipo (Mãe/Pai), Nome, Cidade, Estado, Data Comemorativa, Status de entrega
- [ ] Status de entrega por combinação destinatário × data comemorativa: Pendente / Entregue / Não encontrado
- [ ] CRUD completo: criar, editar, excluir destinatários
- [ ] Gerenciamento de datas comemorativas: criar e desativar
- [ ] Import dos dados da planilha Excel (pasta ou CSV)

## Arquitetura da Solução

### Tabelas DB

**`datas_comemorativas`**
| Coluna | Tipo | Constraint |
|--------|------|-----------|
| id | uuid | PK default gen_random_uuid() |
| org_id | uuid | FK organizations(id) NOT NULL |
| nome | text | NOT NULL |
| data | date | NOT NULL |
| ativa | boolean | DEFAULT true |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

**`brindes_destinatarios`**
| Coluna | Tipo | Constraint |
|--------|------|-----------|
| id | uuid | PK default gen_random_uuid() |
| org_id | uuid | FK organizations(id) NOT NULL |
| obra_nome | text | NOT NULL |
| tipo | text | CHECK ('mae','pai','outro') NOT NULL |
| nome | text | NOT NULL |
| observacao | text | NULL |
| endereco_logradouro | text | NULL |
| endereco_numero | text | NULL |
| endereco_complemento | text | NULL |
| endereco_bairro | text | NULL |
| endereco_cidade | text | NULL |
| endereco_estado | char(2) | NULL |
| endereco_cep | text | NULL |
| endereco_referencia | text | NULL (ex: "OBRA COMUNIDADE", "SEDE TRIFOLD") |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

**`brindes_entregas`**
| Coluna | Tipo | Constraint |
|--------|------|-----------|
| id | uuid | PK default gen_random_uuid() |
| org_id | uuid | FK organizations(id) NOT NULL |
| destinatario_id | uuid | FK brindes_destinatarios(id) ON DELETE CASCADE |
| data_comemorativa_id | uuid | FK datas_comemorativas(id) ON DELETE CASCADE |
| status | text | CHECK ('pendente','entregue','nao_encontrado') DEFAULT 'pendente' |
| observacao_entrega | text | NULL |
| entregue_em | timestamptz | NULL |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |
| — | UNIQUE | (destinatario_id, data_comemorativa_id) |

### Rotas API (Story 29.2)

| Método | Rota | Propósito |
|--------|------|-----------|
| GET | `/api/brindes/destinatarios` | Lista com filtros e paginação |
| POST | `/api/brindes/destinatarios` | Cria destinatário |
| PATCH | `/api/brindes/destinatarios/[id]` | Edita destinatário |
| DELETE | `/api/brindes/destinatarios/[id]` | Remove destinatário |
| GET | `/api/brindes/datas` | Lista datas comemorativas |
| POST | `/api/brindes/datas` | Cria data comemorativa |
| PATCH | `/api/brindes/datas/[id]` | Edita/desativa data |
| POST | `/api/brindes/entregas` | Cria/atualiza status de entrega |
| POST | `/api/brindes/import` | Import em lote (array de registros) |

### Rota UI (Story 29.3)

- **Rota:** `/dashboard/brindes`
- **Acesso:** admin, supervisor
- **Componentes principais:**
  - `BrindesTable` (client) — tabela com filtros, paginação
  - `BrindesFilterBar` (client) — filtros por todos os campos
  - `DestinatarioModal` (client) — criar/editar destinatário
  - `DateSelectorBadge` (client) — seletor de data comemorativa ativa
  - `StatusBadge` (client) — badge clicável para alterar status
