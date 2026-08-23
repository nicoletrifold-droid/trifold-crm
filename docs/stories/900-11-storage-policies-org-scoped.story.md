# Story 900-11 — Policies de Storage ancoradas em organização

## Metadata
- **Epic:** 900 · **Onda:** 1 — Isolamento · **Story:** 900-11
- **Status:** Done — aplicada em produção 2026-08-23, smoke executado.
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

- [x] **AC1 — Buckets com `org_id` no path ganham policy ancorada:** `chamados-attachments`,
  `marketing-artes` e `marketing-brands` passam a exigir
  `(storage.foldername(name))[1] = user_org_id()::text` em SELECT, INSERT, UPDATE e DELETE.

- [x] **AC2 — Buckets de obra ancorados por JOIN:** `obra-docs`, `obra-fotos` e `obra-mensagens`
  exigem que a obra referenciada em `path[2]` pertença à org do chamador:
  `EXISTS (select 1 from obras b where b.id::text = (storage.foldername(name))[2] and b.org_id = user_org_id())`.

- [x] **AC3 — As capacidades existentes são preservadas:** onde já havia `has_capability(...)`, ela
  permanece **e** ganha o escopo de org. Escopo de org substitui `bucket_id` como âncora, nunca a
  verificação de permissão.

- [x] **AC4 — `nicole-media`, `campaign-assets` e `lancamentos` NÃO são alterados nesta story**, e o
  motivo fica escrito na própria migration. Mexer neles sem migrar os objetos quebra acesso.

- [x] **AC5 — Rollback documentado no arquivo**, conforme NFR-8: bloco `-- ROLLBACK` com o
  `DROP/CREATE` reverso de cada policy.

- [x] **AC6 — Verificação pós-aplicação:** o gate passa a contar policies de storage com escopo de
  org > 0, e um roteiro de smoke confirma que portal do cliente e chamados seguem funcionando.

---

## Tasks
- [x] **T1** — Migration com as policies dos 6 buckets ancoráveis (AC1-AC3, AC5)
- [x] **T2** — Comentário na migration explicando os 3 buckets fora de escopo (AC4)
- [x] **T3** — Aplicar em produção pela Management API e rodar o smoke (AC6)

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

### Agent Model Used
@dev (Dex) — 2026-08-23.

### Validada no banco de teste, não só escrita

A migration `238` foi aplicada no Supabase de teste (`xnxvygyfyyyzwhiuoehz`), num único POST
(transação implícita), e passou sem erro:

| | antes | depois |
|---|---|---|
| policies em `storage` | 21 | 21 |
| **com escopo de org** | **0** | **13** |

Este é o primeiro uso real do harness da `900-3` para o fim que ele existe: validar uma mudança de
segurança **antes** de tocar produção. Sem ele, a alternativa era aplicar direto e descobrir na
prática — que é exatamente o que o Epic 900 existe para eliminar.

### O que NÃO foi feito, e por quê

**A migration não foi aplicada em produção.** Ela altera controle de acesso a arquivos: se o
predicado estiver errado, o portal do cliente para de exibir fotos e documentos de obra. A aplicação
exige autorização explícita e um smoke logo em seguida (AC6/T3).

**`nicole-media` não foi tocado**, e a decisão é de dado: 103 dos 115 objetos não têm `org_id` no
path. Ancorá-lo agora tornaria o histórico de mídia das conversas inacessível — seria trocar um furo
de isolamento por uma quebra funcional.

### Um limite desta story que precisa ser dito

`obra-fotos` continua sendo um **bucket público**. A policy de SELECT que esta migration cria
melhora o controle via API, mas **em bucket público a URL basta** — quem tiver o link lê o arquivo,
policy nenhuma impede. O furo real desse bucket só fecha na `900-12`, e esta story não deve ser lida
como tendo resolvido a exposição de fotos de obra.

### Aplicação em produção — 2026-08-23

Aplicada em `dsopqkqjkmhytudaaolv` num único POST (transação implícita), depois de validada no
banco de teste. Resultado idêntico ao do teste:

| | antes | depois |
|---|---|---|
| policies em `storage` | 21 | 21 |
| **com escopo de org** | **0** | **13** |

Estado anterior salvo antes de aplicar (`storage-policies-ANTES.json`, 21 policies) — sem isso, o
`-- ROLLBACK` do arquivo seria a única referência, e conferir o que existia viraria adivinhação.

### Smoke — o que passou, e o que NÃO vale como evidência

**1. Acesso legítimo preservado — 100%, sem uma perda:**

| Bucket | Objetos | Alcançáveis pelo predicado novo |
|---|---|---|
| obra-docs | 179 | **179** |
| obra-fotos | 115 | **115** |
| obra-mensagens | 2 | **2** |
| chamados-attachments | 10 | **10** |
| marketing-artes | 18 | **18** |
| marketing-brands | 38 | **38** |

**2. Listagem por `anon` fechada** — `POST /storage/v1/object/list/obra-docs` com a chave
publishable retorna `[]`.

⚠️ **Ressalva honesta sobre este item:** não capturei o comportamento **antes** de aplicar, então o
`[]` é *consistente* com o fechamento, mas não é prova comparativa. O que sustenta a conclusão é a
lógica da policy — `user_org_id()` devolve NULL para `anon`, o que torna o predicado falso e não
retorna linha. Um smoke melhor teria medido os dois lados; fica registrado como lição de método.

**3. Primeira tentativa do smoke de `anon` foi descartada.** Deu `403 signature verification failed`
usando a chave `anon` legada — erro de **formato de chave**, não recusa por policy. Tratá-lo como
"furo fechado" teria sido uma conclusão certa por motivo errado. Refeito com a chave
`sb_publishable_…`.

**4. ⚠️ O bucket público continua servindo por URL direta — verificado, não suposto:**

```
GET /storage/v1/object/public/obra-fotos/obras/{obra_id}/fotos/{arquivo}  →  HTTP 200
```

Isto **prova empiricamente** o limite declarado no escopo: em bucket público a policy de SELECT é
irrelevante, porque a URL basta. **Esta story não resolveu a exposição de fotos de obra** — quem
tiver o link continua lendo. Fechar isso é a `900-12`, e o `HTTP 200` acima é a evidência de que ela
não é opcional.

### File List
- `supabase/migrations/238_storage_policies_org_scoped.sql` (novo) — 6 buckets, com bloco ROLLBACK
- `docs/stories/900-11-storage-policies-org-scoped.story.md` (novo)
