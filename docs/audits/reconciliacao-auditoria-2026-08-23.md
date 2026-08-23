# Reconciliação da auditoria de isolamento — 2026-08-23

**Por que este documento existe.** O Epic 900 foi escrito em 29/07 sobre a auditoria
`rls-multi-tenant-audit.md`. Entre aquela data e hoje, a `main` entregou ~30 commits, incluindo as
migrations `226`–`230` e todo o sistema de *capabilities* (Stories 75-300 a 75-317). **Parte do que a
Onda 1 planeja corrigir já foi corrigida nesse intervalo** — descoberto ao começar a draftar a
`900-4` e encontrar o furo já fechado.

Draftar as 15 stories da Onda 1 contra o texto do epic produziria ACs que descrevem um estado que
não existe mais, e trabalho duplicado. Este documento reconcilia os **13 achados** contra o schema
de produção **verificado hoje**, não inferido.

O levantamento levou minutos porque o gate de tenancy (Onda 0) já existe. Antes dele, isto era uma
auditoria manual — que é justamente o argumento de por que a Onda 0 vinha primeiro.

---

## Quadro geral

| Achado | Estado hoje | Evidência | Story afetada |
|---|---|---|---|
| **P1** grant a PUBLIC | ⚠️ **parcial** — 22 `SECURITY DEFINER` ainda expostas | gate R6 = 22 | triagem nova |
| **P2** view sem `security_invoker` | ✅ **fechado** | gate R5 = 0; as 5 views têm `on` | — |
| **P3** policy `USING(true)` | ✅ **fechado** pelo PR #308 | gate R4 = 0 | — |
| **P4** tabelas de plataforma sem org | ✅ **fechado** pela migration `228` | as 5 tabelas usam `plataforma_only USING (is_platform_admin())` | **`900-16` encolhe** |
| **P5** `privacy_consents` | ✅ **furo fechado** pela `228`; falta `org_id` | policy tem `EXISTS … titular.org_id = user_org_id()`; coluna `org_id` ausente | **`900-4` muda de natureza** |
| **P6** RLS desabilitada | ✅ **fechado** | gate R1 = 0 nas 92 tabelas com `org_id` | — |
| **P7a** policies de Storage sem org | ❌ **aberto** | **21 policies em `storage`, ZERO mencionam org** | `900-11` |
| **P7b** buckets com PII públicos | ❌ **aberto** | `nicole-media` e `obra-fotos` **públicos** | `900-12` |
| **P8** 16 tabelas sem policy | ⚠️ **declarado**, não fechado | allowlisted com `reason:`; isolamento depende do código | `900-14` |
| **P9** UNIQUEs globais | ❌ **aberto** | `properties_slug_key UNIQUE (slug)` e `idx_leads_supremo_id UNIQUE (supremo_id)` seguem globais | `900-5` |
| **P10** `users.auth_id UNIQUE` | ➖ decisão de produto (D4) | fora de escopo por decisão | — |
| **P11** índices sem `org_id` à esquerda | ❌ aberto | não reverificado nesta rodada | `900-6` |
| **P12** rotas em service-role | ❌ **aberto — o maior** | **129 de 318** handlers usam `createAdminClient` | `900-14`/`900-15` |
| **P13** `SECURITY DEFINER` sem `search_path` | ❌ **aberto** | gate R7 = 7 funções | `900-7` |

**Fechados: 4 (P2, P3, P4, P6).** Parciais: 2 (P1, P5). Abertos: 6. Fora de escopo: 1 (P10).

---

## O que muda em cada story

### `900-4` — deixa de ser correção de furo

**Era:** *"consentimentos LGPD deixam de ser legíveis por admin de qualquer empresa"*.
**É hoje:** o furo está fechado. A migration `228` reescreveu a policy para ancorar em
`users.org_id` via `EXISTS`, e o comentário dela registra a mesma causa-raiz que o epic aponta —
*"a tabela nem tem `org_id` (só `user_id`); o escopo vem do JOIN com users"*.

O que resta do FR-5 é **desnormalizar `org_id`** na tabela. Isso continua valendo, por dois motivos
que não são o original:

1. **Performance** — a policy atual roda uma subconsulta por linha.
2. **Visibilidade ao gate**, que é o motivo mais forte: sem `org_id`, **R2 não examina a tabela** (só
   olha tabelas com a coluna) e **R3 não a acusa** (está na grandfather list). Ou seja, hoje o gate é
   **cego** para `privacy_consents`. Se alguém reverter a policy por engano, nada acusa.

**Recomendação:** manter a story, reescrevendo objetivo e ACs. Rebaixar de P0 para P2 — não há furo
aberto, e o ganho é de robustez.

### `900-16` — perde metade do escopo

A re-ancoragem das 5 tabelas do Epic 78 **já foi feita** (`plataforma_only USING (is_platform_admin())`).
Sobrevive: criar a tabela `platform_admins` com níveis, `platform_audit_log` append-only e o
decorador `withPlatformAdmin` — **nenhum dos dois existe** (verificado).

Nota: `is_platform_admin()` já existe como função e é usada nas policies. A `900-16` precisa
reconciliar-se com essa implementação em vez de criar uma paralela.

### Stories confirmadas abertas, sem mudança

`900-5` (P9), `900-7` (P13), `900-11` (P7a), `900-12` (P7b), `900-14`/`900-15` (P12).

**`900-12` merece destaque:** `nicole-media` e `obra-fotos` são buckets **públicos**. Em bucket
público, policy de SELECT é irrelevante — a URL basta. Isso é exposição de PII **hoje**,
independente de multi-tenant, e não depende do pivô SaaS para ser um problema.

### Triagem nova sugerida: as 22 de P1

O gate acusa 22 funções `SECURITY DEFINER` com `EXECUTE` para PUBLIC. Várias são helpers de RLS
(`user_org_id`, `is_admin`, `user_role`, `has_capability`) que **precisam** ser executáveis para as
policies funcionarem — revogar sem critério quebraria o isolamento em vez de reforçá-lo.

Isto não é story de correção, é de **triagem**: separar helper legítimo de exposição real, e revogar
só o segundo. Fazer em lote, sem triagem, é como o hotfix `210` precisou ser feito — e ele foi
follow-up de um problema causado exatamente assim.

---

## Consequência para o planejamento

A Onda 1 é menor do que o epic supõe, mas o **caminho crítico não encurta**: as stories que
sobraram (`900-8`/`9`/`10`, as 54 violações de R2; `900-12`/`13`, storage; `900-15`, as rotas) são
justamente as de tamanho **G**. O que caiu foram itens P e M.

**Reverificar antes de implementar cada story continua obrigatório.** Este documento é um retrato de
2026-08-23; a `main` continua andando, e foi exatamente essa deriva que o produziu.
