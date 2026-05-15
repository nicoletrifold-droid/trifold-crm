# Epic 33 — Cadastro de Clientes CRM

## Objetivo

Criar uma camada de cadastro de clientes CRM no painel administrativo do Trifold, separada e independente do sistema de portal-users (`users` com `role = 'cliente'`). Um "cliente CRM" representa uma pessoa física associada a uma ou mais obras, que pode ou não ter acesso ao portal do cliente.

## Contexto de Negócio

O Trifold já possui um sistema de portal (`users.role = 'cliente'` + `cliente_obras`) para controle de acesso ao portal do cliente. O que não existe é um cadastro CRM centralizado de clientes — uma ficha completa com dados pessoais, endereço, vínculos com obras/unidades e integração com o módulo de brindes.

**Problemas do processo atual:**
- Não há cadastro centralizado de clientes com dados pessoais completos (CPF, RG, profissão, estado civil, endereço detalhado)
- O módulo de brindes (`brindes_destinatarios`) cadastra pessoas manualmente a cada ciclo, sem reaproveitamento de dados
- A `ClientesTab` em obras exibe portal-users, mas não mantém ficha CRM completa do comprador
- Não há forma de associar um destinatário de brinde a um cliente já cadastrado

**Este epic entrega:**
1. Schema: tabelas `clientes` e `clientes_obras_vinculos` com RLS e índices
2. API REST CRUD completa (clientes + vínculos com obras)
3. UI em Configurações: seção dedicada ao cadastro e gestão de clientes CRM
4. Integração em Obras: enriquecimento da ClientesTab com busca no CRM
5. Integração em Brindes: vincular destinatário a cliente CRM + preencher dados automaticamente

## Stories

| Story | Título | Executor | Estimativa | Status |
|-------|--------|----------|------------|--------|
| 33.1 | Schema: tabela `clientes` + `clientes_obras_vinculos` | @data-engineer | 2h | Draft |
| 33.2 | API CRUD Clientes + Vínculos com Obras | @dev | 4h | Draft |
| 33.3 | UI Configurações: Seção Clientes CRM | @dev | 6h | Draft |
| 33.4 | UI Obras: Integração CRM na ClientesTab | @dev | 2h | Draft |
| 33.5 | UI Brindes: Vincular Cliente no DestinatarioModal | @dev | 4h | Draft |

**Total estimado:** ~18h de desenvolvimento

## Sequência de Implementação

```
Story 33.1 (Schema DB)
      ↓
Story 33.2 (API CRUD)
      ↓
Story 33.3 (UI Configurações) ─┐
Story 33.4 (UI Obras)          ├─ paralelo após 33.2
Story 33.5 (UI Brindes)       ─┘
```

As stories 33.3, 33.4 e 33.5 são independentes entre si e podem ser implementadas em paralelo, pois todas dependem apenas da 33.2 (API).

## Critérios de Sucesso do Epic

- [ ] Tabelas `clientes` e `clientes_obras_vinculos` criadas com RLS correto (org_id isolation)
- [ ] API CRUD completa: criar, listar, editar, excluir clientes e gerenciar vínculos com obras
- [ ] Endpoint de busca rápida (`/api/admin/clientes/search`) para autocomplete em outros módulos
- [ ] UI em `/dashboard/configuracoes/clientes` com tabela paginada, filtros, modais de criação/edição
- [ ] Modal de cliente inclui seção de vínculos com obras (adicionar/remover obra + numero_unidade)
- [ ] ClientesTab em obras exibe banner "Cliente encontrado no CRM" ao buscar por email
- [ ] DestinatarioModal em brindes permite vincular destinatário a cliente CRM e preencher dados automaticamente
- [ ] `brindes_destinatarios.cliente_id` FK para `clientes` adicionada (migration 042)
- [ ] Zero regressão no fluxo existente de portal-users (`users.role = 'cliente'`)

## Arquitetura da Solução

### Separação de Entidades

| Entidade | Tabela | Propósito |
|----------|--------|-----------|
| Portal User | `users` (role='cliente') | Acesso ao portal do cliente |
| Vínculo Portal | `cliente_obras` | user_id ↔ obra_id para autorização no portal |
| Cliente CRM | `clientes` | Ficha CRM completa do comprador |
| Vínculo CRM | `clientes_obras_vinculos` | cliente_id ↔ obra_id + numero_unidade para o CRM |

Um cliente CRM pode ter ou não um `user` correspondente. São entidades distintas sem FK obrigatória entre si.

### Tabela `clientes`

| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | gen_random_uuid() |
| org_id | uuid FK organizations | NOT NULL, base do RLS |
| nome | varchar(255) | NOT NULL |
| cpf | varchar(14) | NULL, formato 000.000.000-00 |
| rg | varchar(20) | NULL |
| email | varchar(255) | NULL, indexed |
| telefone | varchar(20) | NULL |
| whatsapp | varchar(20) | NULL |
| data_nascimento | date | NULL |
| estado_civil | varchar(50) | NULL |
| profissao | varchar(100) | NULL |
| endereco_logradouro | varchar(255) | NULL |
| endereco_numero | varchar(20) | NULL |
| endereco_complemento | varchar(100) | NULL |
| endereco_bairro | varchar(100) | NULL |
| endereco_cidade | varchar(100) | NULL |
| endereco_estado | varchar(2) | NULL |
| endereco_cep | varchar(10) | NULL |
| endereco_referencia | text | NULL |
| observacao | text | NULL |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

### Tabela `clientes_obras_vinculos`

| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | gen_random_uuid() |
| cliente_id | uuid FK clientes | ON DELETE CASCADE |
| obra_id | uuid FK obras | ON DELETE CASCADE |
| numero_unidade | text | NULL |
| created_at | timestamptz | DEFAULT now() |
| — | UNIQUE(cliente_id, obra_id) | Sem duplicatas |

### Rotas API (Story 33.2)

| Método | Rota | Propósito |
|--------|------|-----------|
| GET | `/api/admin/clientes` | Lista paginada com filtros |
| POST | `/api/admin/clientes` | Cria cliente |
| GET | `/api/admin/clientes/[id]` | Detalhe do cliente |
| PATCH | `/api/admin/clientes/[id]` | Edita cliente |
| DELETE | `/api/admin/clientes/[id]` | Remove cliente (soft check brindes) |
| GET | `/api/admin/clientes/[id]/obras` | Lista vínculos com obras |
| POST | `/api/admin/clientes/[id]/obras` | Cria vínculo (obra_id + numero_unidade) |
| PATCH | `/api/admin/clientes/[id]/obras/[vinculo_id]` | Edita numero_unidade |
| DELETE | `/api/admin/clientes/[id]/obras/[vinculo_id]` | Remove vínculo |
| GET | `/api/admin/clientes/search?email=&q=` | Busca rápida para autocomplete |

### Rotas UI

- **Story 33.3:** `/dashboard/configuracoes/clientes` — gestão completa de clientes CRM
- **Story 33.4:** Enriquecimento de `/dashboard/obras/[obra_id]` (ClientesTab)
- **Story 33.5:** Enriquecimento de `/dashboard/brindes` (DestinatarioModal)
