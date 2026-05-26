---
name: sienge
description: |
  Integração com a API REST do Sienge ERP (construção civil brasileiro).
  Esta skill deve ser usada quando o usuário pede para integrar, sincronizar, consultar
  ou implementar qualquer funcionalidade envolvendo o Sienge: empreendimentos, unidades,
  clientes, contratos de venda, parcelas, comissões ou webhooks.
  Cobre autenticação Basic Auth, rate limits, decisão cache vs direct query,
  webhooks idempotentes e arquitetura para múltiplos usuários simultâneos.
user-invocable: true
argument-hint: "[setup|sync|webhook|debug|prereqs]"
---

# Sienge Integration

Skill de integração com o Sienge ERP para o Trifold CRM. Encapsula autenticação, endpoints, webhooks, rate limits e decisões arquiteturais validadas para 100+ usuários simultâneos.

## Stop Rules (verificar antes de qualquer implementação)

⛔ **PARAR se:**
- Cliente Sienge está em **servidor local (on-premise)** — API não existe, integração impossível
- Credenciais Sienge não criadas ainda — exigem admin no portal Sienge
- CV CRM em uso paralelo sem definir quem escreve (evitar duplicação)

## Pré-requisitos

Confirmar com o usuário antes de qualquer sprint:

| Item | Onde obter |
|------|-----------|
| Cliente em **Data Center** (não on-premise) | Perguntar ao cliente |
| **Subdomain** do tenant (ex: `empresa` de `empresa.sienge.com.br`) | URL do Sienge do cliente |
| **Plano contratado** | Determina se Bulk Data está disponível (só Ultimate) |
| CV CRM em uso paralelo? | Definir quem escreve — Trifold só lê se CV CRM ativo |
| Admin Sienge disponível | Para criar usuário de API e liberar recursos |

## Workflow de Implementação

### 1. Setup inicial

Carregar `references/api-overview.md` para autenticação e rate limits.

Credenciais são criadas no **portal Sienge → Integrações > APIs > Usuários de APIs** — nunca são as credenciais de login humano. Armazenar em Vercel env vars ou Supabase Vault. Nunca commitar.

### 2. Decidir cache vs direct query

**Regra geral: cachear tudo no Supabase.**

Com 100+ usuários, queries diretas ao Sienge esgotam as 200 req/min em minutos. Rate limit é por tenant e compartilhado com outras integrações do cliente (CV CRM, BI tools etc.).

| Dado | Estratégia | Frequência |
|------|-----------|-----------|
| Empreendimentos | Cache — polling | 1x/dia |
| Unidades | Cache — webhook + polling | Tempo real |
| Clientes | Cache — webhook + polling | Tempo real |
| Contratos | Cache — webhook + polling | Tempo real |
| Parcelas | Cache — polling | 4x/dia |
| Preview de antecipação | **Direct query** | On-demand (1 req/ação) |
| Download de anexo | **Direct query** | On-demand (binário) |
| Confirmação antes de reservar | **Direct query** | On-demand |

Carregar `references/architecture.md` para schema das tabelas Supabase e padrão de polling.

### 3. Implementar endpoints REST

Carregar `references/endpoints.md` para lista completa de endpoints com métodos e campos-chave.

Path do client: `packages/web/src/lib/integrations/sienge/`

```
sienge/
├── client.ts       # HTTP client com Basic Auth + retry + backoff exponencial
├── types.ts        # TypeScript types dos recursos
├── mappers.ts      # Sienge fields → Trifold fields
├── sync/           # Polling por recurso (enterprises, units, customers, contracts)
└── webhooks/       # Handler + validators + eventos
```

### 4. Configurar webhooks (tempo real)

Webhooks são **inbound** — não consomem as 200 req/min. Mas cada webhook dispara 1 REST fetch para buscar dados completos — esse fetch conta.

Carregar `references/webhooks.md` para catálogo de eventos, padrão de idempotência e implementação do handler.

Endpoint no Trifold: `POST /api/webhooks/sienge`

Obrigatório: retornar 200 imediato → processar em background → idempotência por `x-sienge-hook-id`.

### 5. Debugging de integração quebrada

| Sintoma | Causa provável | Ação |
|---------|---------------|------|
| Dados parados de sincronizar | Credencial expirou ou usuário desativado | Recriar credenciais no portal Sienge |
| HTTP 401 | Senha expirada | Rotacionar credencial |
| HTTP 403 | Recurso não liberado | Admin Sienge libera o recurso específico |
| HTTP 429 | Rate limit atingido | Backoff exponencial — ver `references/api-overview.md` |
| Webhooks não chegando | Endpoint offline por muito tempo (>10h) | Polling de reconciliação + reconfigurar webhook |
| Dados inconsistentes | Eventos perdidos durante downtime | Forçar polling completo via `sienge_sync_log` |

## Referências

| Arquivo | Conteúdo |
|---------|---------|
| `references/api-overview.md` | Auth Basic Auth, base URL, rate limits, erros comuns, backoff |
| `references/endpoints.md` | Todos os endpoints por módulo com métodos e campos-chave |
| `references/webhooks.md` | Catálogo de eventos, headers, handler idempotente, retry policy |
| `references/architecture.md` | Schema das tabelas Supabase, padrão de polling com cursor, gotchas |

## Quick Reference

**Novo setup:**
1. Confirmar pré-requisitos → stop rules
2. Carregar `references/api-overview.md`
3. Carregar `references/architecture.md`
4. Criar tabelas Supabase
5. Implementar client com retry
6. Setup polling por recurso
7. Configurar webhooks

**Adicionar novo endpoint:**
1. Verificar em `references/endpoints.md`
2. Decidir cache vs direct (tabela acima)
3. Adicionar campo `sienge_*_id UNIQUE` na tabela
4. Implementar mapper em `mappers.ts`

**Depurar:**
1. Checar `sienge_sync_log` no Supabase
2. Checar `sienge_webhook_events` por eventos não processados
3. Usar tabela de sintomas acima
