# Story 900-11 — Policies de Storage ancoradas em organização

## Metadata
- **Epic:** 900 · **Onda:** 1 — Isolamento · **Story:** 900-11
- **Status:** Ready
- **Priority:** P0 — furo de leitura cross-tenant ativo em produção
- **Complexity:** M
- **Created:** 2026-08-23 · **Author:** @sm (River)
- **Executor:** @data-engineer (Dara) · **Quality Gate:** @qa (Quinn)

---

## O furo, medido em 2026-08-23

**As 21 policies do schema `storage` ancoram apenas em `bucket_id`. Nenhuma menciona organização.**
O gate confirma: `select count(*) from pg_policies where schemaname='storage' and qual like '%org%'`
→ **0**.

Consequências que existem **hoje**, com uma única organização, e que viram vazamento no instante em
que a segunda for provisionada:

| Policy | Efeito |
|---|---|
| `authenticated_read_obra_docs` | **qualquer** usuário autenticado lê documento de obra de **qualquer** empresa |
| `authenticated_read_obra_mensagens` | idem, para anexos de mensagens de obra |
| `admin_delete_obra_docs` · `admin_delete_obra_fotos` | admin de outra empresa pode **apagar** arquivo alheio |
| `chamados_storage_select` · `campaign_assets_*` | leitura por qualquer autenticado |

---

## O que o levantamento de paths revelou — e por que ele define o escopo

O epic supunha que ancorar por path só seria possível depois da convenção `{org_id}/…` da `900-13`.
**Medição contra produção mostra que parte disso já existe:**

| Bucket | Objetos | Ancoragem possível HOJE | Cobertura |
|---|---|---|---|
| `chamados-attachments` | 10 | `path[1] = org_id` | **10/10** ✅ |
| `marketing-artes` | 18 | `path[1] = org_id` | **18/18** ✅ |
| `marketing-brands` | 38 | `path[1] = org_id` | **38/38** ✅ |
| `obra-docs` | 179 | `path[2] = obra_id` → JOIN `obras.org_id` | **179/179** ✅ |
| `obra-fotos` | 115 | `path[2] = obra_id` → JOIN `obras.org_id` | **115/115** ✅ |
| `obra-mensagens` | 2 | `path[2] = obra_id` → JOIN `obras.org_id` | **2/2** ✅ |
| `nicole-media` | 115 | ❌ **não ancorável** | **12/115** |
| `campaign-assets` | 8 | ❌ path por slug | 0/8 |
| `lancamentos` | 7 | ❌ path por id de lançamento | 0/7 |

### `nicole-media` fica de fora, e a razão é dado, não preguiça

O bucket tem **quatro convenções de path convivendo**:

```
broker-chat/…        48 objetos
inbound/…            39
whatsapp-inbound/…   15
{org_id}/…           12   ← só os mais novos
undefined/…           1   ← bug (ver abaixo)
```

Uma policy exigindo `path[1] = org_id` tornaria **103 de 115 arquivos inacessíveis** — quebraria o
histórico de mídia das conversas. A ancoragem dele depende da migração de objetos da `900-13`.
Incluí-lo aqui seria trocar um furo de isolamento por uma quebra funcional.

### 🐛 Achado incidental: um objeto com path `undefined/`

Existe **1 objeto** cujo path começa com a string literal `undefined` — alguém passou `undefined`
como `org_id` e o upload seguiu sem reclamar. É pequeno em volume e grande em significado: mostra
que **o caminho de escrita não valida o org_id**, o que a `900-13` precisa corrigir na origem, não
só migrando o que já existe.

---

## Acceptance Criteria

- [ ] **AC1 — Buckets com `org_id` no path ganham policy ancorada:** `chamados-attachments`,
  `marketing-artes` e `marketing-brands` passam a exigir
  `(storage.foldername(name))[1] = user_org_id()::text` em SELECT, INSERT, UPDATE e DELETE.

- [ ] **AC2 — Buckets de obra ancorados por JOIN:** `obra-docs`, `obra-fotos` e `obra-mensagens`
  exigem que a obra referenciada em `path[2]` pertença à org do chamador:
  `EXISTS (select 1 from obras b where b.id::text = (storage.foldername(name))[2] and b.org_id = user_org_id())`.

- [ ] **AC3 — As capacidades existentes são preservadas:** onde já havia `has_capability(...)`, ela
  permanece **e** ganha o escopo de org. Escopo de org substitui `bucket_id` como âncora, nunca a
  verificação de permissão.

- [ ] **AC4 — `nicole-media`, `campaign-assets` e `lancamentos` NÃO são alterados nesta story**, e o
  motivo fica escrito na própria migration. Mexer neles sem migrar os objetos quebra acesso.

- [ ] **AC5 — Rollback documentado no arquivo**, conforme NFR-8: bloco `-- ROLLBACK` com o
  `DROP/CREATE` reverso de cada policy.

- [ ] **AC6 — Verificação pós-aplicação:** o gate passa a contar policies de storage com escopo de
  org > 0, e um roteiro de smoke confirma que portal do cliente e chamados seguem funcionando.

---

## Tasks
- [ ] **T1** — Migration com as policies dos 6 buckets ancoráveis (AC1-AC3, AC5)
- [ ] **T2** — Comentário na migration explicando os 3 buckets fora de escopo (AC4)
- [ ] **T3** — Aplicar em produção pela Management API e rodar o smoke (AC6)

---

## Dev Notes

**Por que não usar a convenção de path para tudo.** Seria mais simples exigir `{org_id}/…` em todos
os buckets, mas 3 deles não seguem essa convenção e 1 (`nicole-media`) tem 103 objetos que ficariam
órfãos. A story faz o que o dado permite fazer **sem quebrar acesso**, e nomeia o resto.

**A ordem importa.** `DROP POLICY` seguido de `CREATE POLICY` deixa uma janela sem policy. Como RLS
em `storage.objects` é deny-by-default quando não há policy aplicável, a janela é de indisponibilidade,
não de exposição — mas ainda assim a migration deve rodar num único `POST` (transação implícita),
como manda o runbook do projeto.

## Dev Agent Record
_A preencher._
