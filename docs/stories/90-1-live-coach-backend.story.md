# Story 90-1 — Backend: detecção de objeção + sugestão ancorada (Haiku→Sonnet) + persistência

## Metadata
- **Status:** Ready for Review (T1–T6 done; T7/T8 pendentes)
- **Epic:** 90 — Live Coach (`docs/stories/epics/epic-90-live-coach-objecoes.md`)
- **Branch:** `feat/90-1-live-coach-backend`
- **Tipo:** Feature (backend + migration + flow LLM)
- **Complexidade:** Média-alta
- **Prioridade:** P1

## Executor Assignment
- **executor:** `@dev`
- **quality_gate:** `@architect`
- **quality_gate_tools:** `[code_review, pattern_validation, security_scan]`
- **Consulta obrigatória:** `@data-engineer` na migration (RLS + publicação Realtime + numeração)

## Story
**As a** corretor que assumiu a conversa no WhatsApp, **I want** que o CRM detecte a objeção
que o lead acabou de levantar e prepare 1-2 respostas ancoradas em dado real do empreendimento,
**so that** eu responda a objeção com informação em vez de improviso — sem sair da conversa
para garimpar tabela, prazo ou unidade equivalente.

Esta story entrega o MOTOR. Não há UI: as sugestões são geradas e persistidas, e a exposição ao
corretor é a 90-2. Isso é deliberado — permite medir qualidade e custo reais em produção antes
de qualquer coisa aparecer na tela do corretor.

## Contexto
Quando `is_ai_active = false` (corretor assumiu), a Nicole para de responder por desenho
(Story 63-15) e o CRM fica mudo justamente na fase das objeções mais duras. O que existe hoje
é o `behavior-analysis` (Epic 82): bom, porém **on-demand por clique e pesado** (cronologia
inteira no Sonnet) — ninguém clica em botão no meio de uma negociação.

A boa notícia: o gatilho já existe e está testado. A Story 63-12 (`notifyBrokerOnReply`) já
dispara em `after()` dedicado exatamente na condição que queremos — lead respondeu E corretor
já assumiu. Esta story pendura o coach no MESMO gatilho, em `after()` próprio e independente.

## Escopo

**IN:**

- **Migration 242** (`242_coach_suggestions.sql`) — conferir numeração livre antes de criar;
  existe colisão histórica em 240 (`240_followup_nicole_por_lead.sql` + `240_provision_org.sql`):
  - Tabela `coach_suggestions`: `id uuid pk`, `org_id uuid NOT NULL REFERENCES organizations(id)
    ON DELETE CASCADE`, `conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE
    CASCADE`, `lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE`, `message_id uuid
    NOT NULL REFERENCES messages(id) ON DELETE CASCADE` (a mensagem do lead que originou),
    campos do contrato (`objecao text`, `tipo text`, `confianca text`, `respostas jsonb`,
    `ancoras jsonb`, `ancorada boolean NOT NULL DEFAULT false`, `cuidado text NULL`),
    ciclo de vida (`used_at timestamptz NULL`, `dismissed_at timestamptz NULL`),
    `created_at`/`updated_at` + trigger `set_updated_at` (função `update_updated_at()`,
    `001_base_schema.sql:279` — nome do trigger é `set_updated_at` em todo o projeto).
  - Índices: `(conversation_id, created_at DESC)` e `(org_id)`.
  - **RLS ENABLE + policy `coach_suggestions_select`** espelhando `messages_select` da
    migration 229 (via `conversations` → `org_id = user_org_id()` E
    (`has_capability('conversas.ver_qualquer')` OU `leads.assigned_broker_id` = user do broker)).
    Sem essa policy a 90-2 não recebe nada — Realtime entrega filtrado por RLS da sessão.
  - **Publicação Realtime** idempotente no padrão de `102_realtime_messages.sql`
    (`ALTER PUBLICATION supabase_realtime ADD TABLE public.coach_suggestions` dentro do
    `DO $$ ... IF NOT EXISTS (pg_publication_tables) ... $$`).
- **Capability `leads.live_coach`** em `packages/web/src/lib/capabilities.ts` (fonte única).
  Seed é **migration GERADA** — regenerar com
  `node --experimental-transform-types scripts/gen-capability-seed.mts` e versionar como 243;
  **nunca editar o SQL de seed à mão** (o arquivo é marcado como gerado).
  Um switch, dois efeitos: a capability é checada na GERAÇÃO (perfil do corretor dono do lead)
  e, na 90-2, na exibição. Desligar o perfil para de gerar E para de exibir, sem deploy.
- **Flow novo `packages/ai/src/flows/live-coach.ts`** — dois passos, exportados separados
  (testáveis isoladamente):
  1. `detectObjection(anthropic, { message, recentHistory })` → **Haiku**
     (`ANTHROPIC_MODELS.haiku`), `timeout: 6000`, `max_tokens` enxuto. Devolve
     `{ objecao, tipo, confianca }` ou `null` (sem objeção).
  2. `draftCoachReply(anthropic, { objecao, tipo, ragContext, leadProfile, recentHistory })` →
     **Sonnet** (`ANTHROPIC_MODELS.sonnet`), **`timeout` explícito de 20000** (teto defensivo:
     `maxDuration = 60` da rota é compartilhado por todo o `after()`). Devolve `respostas[]`,
     `ancoras[]`, `ancorada`, `cuidado?`. Só é chamado quando houve objeção com
     `confianca` >= `media`.
  - `isCoachEligible(text)` — gate textual **antes de qualquer IA**, no padrão de
    `isReviewEligible` (`message-review.ts`): texto curto, só emoji/número/link → `false`,
    zero chamada de modelo.
  - Parse defensivo no padrão de `parseMessageReview`: descascar cerca ```json, fatiar do
    primeiro `{` ao último `}`, validar tipos campo a campo, qualquer desvio → `null`.
    **Lição 82-4: nunca ler `content[0]`** — filtrar blocos `type === "text"` e concatenar.
  - Prompts em pt-BR. O redator recebe instrução explícita de **não prometer** desconto, prazo
    ou condição que não esteja nas âncoras, e de preencher `cuidado` quando o risco existir.
    Sem âncora real ⇒ `ancorada: false` (honestidade, mesmo espírito do `dados_faltando` do 82).
- **Helper de orquestração `packages/web/src/lib/coach/generate-suggestion.ts`** (`server-only`),
  best-effort e **nunca lança** — mesmo contrato de `notify-on-reply.ts`:
  1. Gate `isCoachEligible(text)`.
  2. Gate **humano no atendimento** (corrigido pelo @po — ver Change Log): usar
     **`deriveBrokerActive(messages, isAiActive)`** de `@web/lib/broker/broker-takeover-status`
     (= `brokerSentRecently(...) || !isAiActive`), **não** `brokerSentRecently` puro.
     Motivo: a decisão do épico é `is_ai_active = false`, e há um caso real em que o corretor
     está no comando SEM nunca ter enviado mensagem — handoff manual de admin ou handoff por
     agendamento (`handoff_reason='appointment'`, Story 63-15). `brokerSentRecently` sozinho
     retorna false aí e o coach perderia exatamente o momento mais valioso: o corretor acabou
     de receber a conversa, ainda não falou, e o lead manda a objeção.
     **Guarda de reativação (evita race com o bloco da Nicole):** o `after()` do coach roda
     ANTES do bloco que resolve/atualiza `is_ai_active` (route.ts ~941-974). Por isso o helper
     replica o mesmo cálculo determinístico do webhook — `resolveTakeoverAnchor(handoff_at,
     lastBrokerAt)` + `shouldReactivateAi(anchor)`; se `shouldReactivateAi` for `true`
     (corretor inativo ≥ 24h ⇒ a Nicole vai reassumir nesta mesma invocação), **aborta sem
     gerar**. Ler `is_ai_active` cru e confiar nele criaria sugestão para conversa que a Nicole
     retoma no instante seguinte.
     Todos são helpers puros já existentes — **NÃO reimplementar a regra nem a janela**
     (`BROKER_WINDOW_MS` = 24h é a fonte-de-verdade do banner 63-8, do push 63-12 e do cron
     de follow-up).
  3. Gate `assigned_broker_id` não-null + capability `leads.live_coach` do perfil do dono.
  4. Gate **anti-ruído tardio**: se já existe `messages` com `role='broker'` e
     `created_at > created_at da mensagem inbound`, o corretor já respondeu → aborta sem gerar.
  5. RAG: `searchKnowledge(supabase, text, orgId, state?.current_property_id ?? undefined)` +
     `buildContextFromRAG` (mesma chamada de `pipeline.ts:579`; `current_property_id` vem de
     `conversation_state`). Falha do RAG não aborta — segue sem contexto e marca `ancorada: false`.
  6. Perfil/memória do lead via **`loadMemoryContext`** (`packages/ai/src/memory/loader.ts`).
  7. `detectObjection` → se objeção confiável, `draftCoachReply` → persiste em `coach_suggestions`.
  8. **Uma sugestão ativa por conversa:** antes de inserir, se existir sugestão da mesma
     conversa ainda sem `used_at`/`dismissed_at`, marcar a antiga como `dismissed_at = now()`
     (superseded) em vez de empilhar cards.
  9. `logEvent` (`@web/lib/logger`) com `category: "ai"` nos eventos
     `LIVE_COACH_SKIPPED` / `LIVE_COACH_NO_OBJECTION` / `LIVE_COACH_SUGGESTED` /
     `LIVE_COACH_FAILED`, incluindo `tipo` e contagem de âncoras — é assim que se mede custo
     e taxa de detecção na primeira semana.
- **`.select("id, created_at")` no INSERT inbound** (`route.ts:634`): hoje é
  `.select("created_at")` — o `id` da mensagem **não** é retornado, e a FK `message_id` desta
  story precisa dele. Alterar para `.select("id, created_at")` e passar o id ao helper.
  É a **única** mudança no caminho SÍNCRONO do webhook nesta story. Não resolver isso com um
  segundo SELECT por `whatsapp_message_id` dentro do `after()` (query extra desnecessária num
  dado que a invocação já tem em mãos).
- **Disparo no webhook** (`packages/web/src/app/api/webhook/whatsapp/route.ts`): `after()`
  **dedicado e independente**, imediatamente ao lado do `after()` do `notifyBrokerOnReply`
  (~linha 659), **depois** do early-return de wamid duplicado (PG 23505) — reentrega da Meta
  não pode gerar sugestão repetida. Nenhum `await` do coach antes do `NextResponse.json`.

**OUT:**
- UI, card, Realtime no cliente, rota de usar/descartar → **90-2**.
- Coach de saída (interceptar a resposta do corretor antes do envio) → fora do Epic 90.
- Qualquer envio de mensagem ao lead, mudança de etapa, score ou escrita em `leads`/`messages`/
  `conversations`. Esta story só INSERE/UPDATE em `coach_suggestions`.
- Coach com a Nicole ativa (`is_ai_active = true`) — decisão de gatilho do épico.

## Acceptance Criteria

1. **Given** conversa com corretor assumido (há `role='broker'` nas últimas 24h) e capability
   `leads.live_coach` ligada, **when** o lead envia "achei caro, vi outro mais perto por menos",
   **then** o webhook responde 200 imediatamente e, no `after()`, uma linha é inserida em
   `coach_suggestions` com `objecao`, `tipo='preco'` (ou `concorrente`), `respostas` com 1-2
   rascunhos e `message_id` apontando para a mensagem inbound que a originou (o id vem do
   `.select("id, created_at")` do INSERT, sem query extra).
2. **Given** conversa em que a **Nicole está ativa** (`is_ai_active = true`, sem `role='broker'`
   nas últimas 24h), **when** o lead envia a mesma objeção, **then** NENHUMA sugestão é gerada e
   nenhuma chamada de IA do coach acontece (verificável por log/mock de `detectObjection`).
2b. **Given** conversa em handoff **sem nenhuma mensagem do corretor ainda** (`is_ai_active =
   false` por handoff manual de admin ou `handoff_reason='appointment'`, `lastBrokerAt = null`,
   `handoff_at` há menos de 24h), **when** o lead envia uma objeção, **then** a sugestão **É**
   gerada — `deriveBrokerActive` cobre o caso que `brokerSentRecently` sozinho perderia.
2c. **Given** conversa com `is_ai_active = false` mas corretor inativo há **≥ 24h** (a Nicole vai
   reassumir nesta mesma invocação), **when** o lead envia uma objeção, **then** NADA é gerado
   (guarda `resolveTakeoverAnchor` + `shouldReactivateAi`).
3. **Given** mensagem inelegível ("ok", um emoji, só um link), **when** processada, **then**
   `isCoachEligible` retorna false e **zero** chamadas de modelo são feitas.
4. **Given** mensagem elegível sem objeção ("perfeito, obrigado!"), **when** o Haiku roda,
   **then** `detectObjection` devolve `null`, o Sonnet **não** é chamado e nada é persistido.
5. **Given** RAG e memória sem apoio para a objeção, **when** a sugestão é redigida, **then**
   a linha é persistida com `ancoras = []` e `ancorada = false` — nunca `ancorada = true` sem
   âncora real.
6. **Given** o corretor já respondeu depois da mensagem do lead (existe `role='broker'` com
   `created_at` posterior ao inbound), **when** o `after()` executa, **then** nada é persistido
   (gate anti-ruído tardio).
7. **Given** o flow lançar exceção, estourar timeout ou devolver JSON inválido, **when** o
   webhook processa a mensagem, **then** o webhook responde **200 igual**, a mensagem do lead é
   gravada normalmente, o pipeline da Nicole segue intacto e nada é persistido em
   `coach_suggestions` (fail-open total, com `LIVE_COACH_FAILED` logado).
8. **Given** já existir sugestão ativa (sem `used_at`/`dismissed_at`) na mesma conversa,
   **when** uma sugestão nova é gerada, **then** a anterior recebe `dismissed_at` e apenas uma
   fica ativa.
9. **Given** a capability `leads.live_coach` desligada para o perfil do corretor dono, **when**
   o lead responde, **then** nenhuma sugestão é gerada (kill switch efetivo, sem deploy).
10. **Given** um corretor autenticado que NÃO é dono do lead e sem `conversas.ver_qualquer`,
    **when** consulta `coach_suggestions` com o client do usuário, **then** não vê a linha
    (RLS org-scoped + dono, espelhando `messages_select`).
11. `coach_suggestions` está na publicação `supabase_realtime` (pré-requisito da 90-2),
    verificável por `pg_publication_tables`.
12. Testes verdes (vitest), `type-check` e `lint` OK. Nenhum teste existente de
    `packages/ai` ou do webhook quebrado.

## Quality Gates

> **CodeRabbit Integration:** Disabled — `coderabbit_integration` não está habilitado em
> `.aios-core/core-config.yaml` e nenhuma story deste repo usa a seção. Os gates abaixo são os
> do fluxo real do projeto (@qa `*qa-gate` → @devops `*push`).

- **Tipo primário:** API/Backend. **Secundários:** Database (migration + RLS), Integration
  (webhook da Meta), Security (RLS + capability). **Complexidade:** média-alta.
- **Agentes:** `@dev` (executor), `@data-engineer` (consulta na migration), `@architect`
  (quality gate), `@devops` (push/PR — exclusivo).
- **Pre-Commit (@dev):** fail-open real (try/catch que engole tudo no helper), ausência de
  `await` do coach no caminho síncrono do webhook, nenhuma escrita fora de `coach_suggestions`.
- **Pre-PR (@qa `*qa-gate` → @devops):** toca rota de produção que recebe webhook da Meta.
- **Pre-Deployment:** migrations 242/243 aplicadas em prod **antes** do merge (T7).
- **Severidade bloqueante:** qualquer finding que implique atraso, exceção propagada no webhook,
  ou escrita fora de `coach_suggestions`.
- **Focus areas:** fail-open, isolamento do `after()`, RLS org-scoped + dono, custo por chamada,
  nenhuma regressão no pipeline da Nicole.

## Tasks / Subtasks

- [x] **T1 — Migration 242** (`@dev` + consulta `@data-engineer`): conferir numeração livre em
      `supabase/migrations/` **e no schema remoto de prod** (lição 75-188: "LIVE" no dev ≠ prod);
      tabela + índices + trigger `set_updated_at` + RLS ENABLE + policy `coach_suggestions_select`
      + publicação Realtime idempotente.
- [x] **T2 — Capability**: adicionar `leads.live_coach` em `capabilities.ts`, regenerar o seed
      pelo script e versionar como migration 243 (arquivo gerado, não editar à mão).
- [x] **T3 — Flow `live-coach.ts`**: `isCoachEligible`, `detectObjection` (Haiku),
      `draftCoachReply` (Sonnet), parsers defensivos, tipos exportados; export em `flows/index.ts`.
- [x] **T4 — Helper `generate-suggestion.ts`**: os 4 gates, RAG, memória, persistência,
      supersede da sugestão ativa, `logEvent`, contrato "nunca lança".
- [x] **T5 — Disparo no webhook**: trocar `.select("created_at")` por `.select("id, created_at")`
      no INSERT inbound (route.ts:634) + `after()` dedicado após o early-return de wamid duplicado.
      Nenhuma outra alteração no caminho síncrono.
- [x] **T6 — Testes** (ver Testing abaixo).
- [ ] **T7 — Aplicar migrations em prod**: por SQL Editor / Management API, **antes do merge**
      (`supabase db push` é proibido neste projeto — `schema_migrations` está dessincronizada).
- [ ] **T8 — Medir**: após 48h em prod, registrar nesta story taxa de detecção, % `ancorada=true`
      e custo médio por conversa.

## Dev Notes

- **Ponto de inserção exato:** `route.ts:659` já tem o `after()` do `notifyBrokerOnReply`, com o
  comentário explicando por que ele é independente do bloco da Nicole. Pendurar o coach no mesmo
  lugar, em `after()` separado — uma falha no coach não pode afetar push nem Nicole.
- **Gate de takeover:** `brokerSentRecently` / `BROKER_WINDOW_MS` em
  `packages/web/src/lib/broker/broker-takeover-status.ts`. Reimplementar essa regra criaria uma
  segunda régua que divergiria do banner e do push na primeira mudança — mesmo raciocínio da
  extração do `interest-level.ts` (75-332).
- **Áudio já vem resolvido:** `transcribeAudio` (`route.ts:808`) coloca a transcrição no `content`
  da mensagem. O coach lê `content` e não precisa saber se era áudio.
- **RAG:** `searchKnowledge(supabase, query, orgId, propertyId?)`, threshold 0.45 calibrado na
  75-173 (o 0.7 antigo filtrava tudo). `propertyId` sai de `conversation_state.current_property_id`,
  como em `pipeline.ts:579`.
- **Client Supabase:** admin client (`getSupabaseAdmin()`) recebido por parâmetro, como
  `notifyBrokerOnReply` faz — facilita teste e evita fricção de RLS no `after()`. O gate de
  acesso do corretor é a policy, que existe para a 90-2.
- **Modelos:** usar **sempre** as constantes de `ANTHROPIC_MODELS` (`anthropic.ts`). Não escrever
  string de modelo no flow — foi exatamente a dívida que a 82-1 teve de limpar na rota `/summary`.
- **Sonnet 5 e thinking:** conferir `model-compat`/`supportsSampling` antes de passar `temperature`
  — ver lições 82-4 e 75-349/75-350 e o GOTCHA de adaptive thinking em `marketing-suggestions.ts:208`.
- **`messages` não tem `org_id`** — pegar org via `conversations`. Convenção registrada na 82-1.
- **RLS + Realtime:** a entrega de eventos é filtrada pela policy da sessão (comentário da
  `102_realtime_messages.sql`). Policy de SELECT faltando = card nunca aparece na 90-2, e o bug
  se manifesta como "realtime não funciona".
- **Orçamento de tempo:** `maxDuration = 60` (`route.ts:36`) é compartilhado por toda a
  invocação, incluindo os `after()`. A favor do coach: o pipeline da Nicole está atrás do guard
  `if (isAiActive)` (`route.ts:999`), então **no cenário do coach a Nicole não roda** — os dois
  nunca competem pelos 60s. Ainda assim, timeouts explícitos nos dois passos (Haiku 6s,
  Sonnet 20s) para que o coach jamais seja a causa de um estouro.
- **Variáveis de ambiente: NENHUMA nova.** O coach usa a `ANTHROPIC_API_KEY` já configurada
  (mesmo client de todos os flows) e o Supabase admin já em uso no webhook. O kill switch é a
  capability, não env — de propósito: `vercel env add` via stdin grava valor vazio silenciosamente
  neste projeto (2 incidentes registrados) e mudança de env só vale após `vercel redeploy`,
  o que anularia o "desligar sem deploy".
- **`used_at` / `dismissed_at`** nascem aqui como colunas, mas a rota que os escreve por ação do
  corretor é da **90-2**. Nesta story só o supersede automático escreve `dismissed_at`.

## Testing

- `packages/ai/src/flows/live-coach.test.ts` (padrão de `message-review`/`haiku-enrichment` com
  mock do Anthropic):
  - `isCoachEligible`: curto, emoji, link, número → false; frase real → true.
  - `detectObjection`: objeção clara → tipo correto; agradecimento → `null`; JSON inválido,
    cerca ```json, texto antes/depois do JSON, resposta multi-bloco → parse correto ou `null`.
  - `draftCoachReply`: sem `ragContext` → `ancorada: false`; com contexto → âncoras preenchidas;
    nunca `ancorada: true` com `ancoras` vazio.
- `packages/web/src/lib/coach/generate-suggestion.test.ts`:
  - Nicole ativa → zero chamadas de modelo (spy).
  - Corretor assumiu (msg `role='broker'` < 24h) → gera.
  - **Handoff sem msg do corretor** (`is_ai_active=false`, `lastBrokerAt=null`, `handoff_at`
    recente) → gera (regressão do gate corrigido pelo @po).
  - **Corretor inativo ≥ 24h** (Nicole vai reassumir) → não gera.
  - Corretor já respondeu depois do inbound → não gera.
  - Capability off → não gera.
  - Sugestão ativa existente → recebe `dismissed_at`, só uma fica ativa.
  - Flow lançando → helper resolve sem lançar, nada persistido, `LIVE_COACH_FAILED` logado.
- Webhook: teste no diretório existente (`api/webhook/whatsapp/__tests__/`) provando que
  **coach lançando exceção ⇒ webhook responde 200** e a mensagem inbound é gravada igual.
- Regressão obrigatória: suíte de `packages/ai` e do webhook verdes (pipeline da Nicole e
  handoff intocados).

## File List
- `docs/stories/90-1-live-coach-backend.story.md` (this file)
- `supabase/migrations/242_coach_suggestions.sql` (novo — tabela + índices + trigger + RLS + Realtime)
- `supabase/migrations/243_capability_live_coach.sql` (novo — GERADO pelo script, header manual no topo)
- `packages/web/src/lib/capabilities.ts` (capability `leads.live_coach`)
- `packages/web/src/lib/capabilities.test.ts` (lista trancada de `enforced` — invariante do repo)
- `packages/ai/src/flows/live-coach.ts` (novo) + `live-coach.test.ts` (novo, 21 testes)
- `packages/ai/src/flows/index.ts` (exports)
- `packages/ai/src/index.ts` (**MF-1**: export nomeado de `loadMemoryContext`)
- `packages/web/src/lib/coach/barrel-contract.test.ts` (**MF-3**: novo, sem `vi.mock`)
- `packages/web/src/lib/coach/generate-suggestion.ts` (novo) + `generate-suggestion.test.ts` (novo, 16 testes)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (`.select("id, created_at")` + `after()` do coach)
- `packages/web/src/app/api/webhook/whatsapp/__tests__/route.test.ts` (2 testes novos + `created_at` no mock)

## Dev Agent Record (@dev Dex — 2026-08-27)

**Agent Model Used:** claude-opus-5[1m]
**Branch:** `feat/90-1-live-coach-backend` (local; push é do @devops)

### Validações executadas

> ⚠️ **A primeira versão desta tabela estava ERRADA** e o @qa pegou (MF-2). Eu havia
> reportado "tsc packages/web: limpo (0 erros)" usando
> `timeout 600 npx tsc --noEmit 2>&1 | grep -c "error TS"`. **`timeout` não existe no
> macOS**: o comando abortou, o pipe recebeu zero linhas e o `grep -c` contou 0. Contagem
> de erros de um comando que não executou é sempre 0 — e ela esconderia o MF-1.
> Tabela abaixo re-executada sem `timeout`, cada comando conferido pelo exit code.

| Validação | Comando | Resultado |
|---|---|---|
| Suíte completa | `npx vitest run` | **256 arquivos, 3137 testes verdes** + 6 expected-fail |
| Type-check ai | `npx tsc --noEmit` (packages/ai) | exit 0, limpo |
| Type-check web | `npx tsc --noEmit` (packages/web) | exit 0, limpo |
| Lint web | `npx eslint` (arquivos tocados) | exit 0, limpo |
| Lint ai | — | `packages/ai` **não tem eslint**; seu script `lint` é `tsc --noEmit` (acima) |
| CodeRabbit | — | **não executado**: config aponta para WSL (`~/.local/bin/coderabbit`), esta máquina é darwin, binário ausente. Coerente com o N/A do @po. |

### Notas de implementação (divergências e descobertas)

1. **`isCoachEligible` divergiu de `isReviewEligible` de propósito.** A régua herdada
   aceita link solto (porque "https"/"exemplo" contam como letras), e a story exige rejeitar.
   O teste pegou isso na primeira execução. Solução: **remover URLs antes de avaliar**. Link
   solto não gera sugestão (o coach não busca conteúdo de página externa, não teria o que
   analisar); link COM texto ao redor passa normalmente. Ambos os casos têm teste.
   Justificativa de custo: aqui cada mensagem elegível paga um Haiku, e lead mandando link de
   concorrente sem escrever nada é comum — na revisão ortográfica isso era inócuo.

2. **O mock do webhook não tinha `messages.created_at`** — embora o schema real defina
   `NOT NULL DEFAULT now()` (`001_base_schema.sql:180`). Consequência silenciosa: nos testes o
   `inboundCreatedAt` da rota vinha sempre `null`, então **nem a guarda anti-rajada (75-359)
   nem o `after()` do coach eram exercidos**. Coluna adicionada ao mock; o teste novo de FK
   tranca isso ("sem o `.select("id, created_at")` o coach nem é agendado").

3. **`.catch()` no call site do `after()` do coach.** O helper já é fail-open por dentro, mas
   o teste de AC7 expôs que uma rejeição vinda de ANTES do try/catch (import quebrado,
   `getSupabaseAdmin()` lançando) viraria unhandled rejection. Segunda linha de defesa
   adicionada — barata e real, não gambiarra de teste.

4. **Mock de teste refinado para não dar falso verde.** O helper faz 4 queries distintas em
   `messages`; o mock inicial as confundia e o histórico caía no ramo da âncora. Passou a
   distinguir por (colunas do select + filtro de data), e um teste novo prova que o histórico
   chega aos dois prompts na ordem cronológica correta. A ordem `DESC` do mock também foi
   corrigida para refletir o que o Supabase devolve — sem isso o teste de ordem seria tautologia.

5. **`leads.live_coach` entrou com `broker: true`** — ao contrário de `followup_nicole` (241),
   que tem `broker: false`. Não é inconsistência: lá a capability significa "mexer em lead de
   terceiro"; aqui ela é o kill switch do próprio coach, e o corretor dono é justamente quem
   recebe as sugestões. A geração confere a capability no perfil do corretor DONO, então
   desligar um perfil **para de gerar**, não só de exibir. Racional no header da migration 243.

6. **`capabilities.test.ts` tranca a lista de `enforced`** (invariante anti-"botão que mente",
   75-301). A capability nova foi registrada lá — era a única regressão da suíte.

7. **Seed 243 é 100% do gerador.** Diff contra a 241: `104 → 105 capabilities` e as 10 linhas
   de `leads.live_coach`. Nenhuma linha de SQL de seed escrita à mão.

### Pendências desta story (NÃO executadas)
- **T7 — aplicar migrations 242/243 em produção.** Escrita irreversível em prod: parada por
  decisão explícita, aguardando OK do Marcos. Lembrete do repo: `supabase db push` é **proibido**
  aqui (`schema_migrations` dessincronizada) — aplicar por SQL Editor / Management API, e
  **antes do merge**. Conferir também se 242 está livre no schema REMOTO (lição 75-188).
- **T8 — medir em prod** (taxa de detecção, % `ancorada=true`, custo/conversa) — só faz sentido
  após T7 e ~48h de tráfego real.

### Correções do gate FAIL (@qa Quinn, 2026-08-27)

**MF-1 (critical) — `loadMemoryContext` não exportado.** `packages/ai/src/index.ts` não
expunha `./memory`. Corrigido com export **nomeado** (não `export *`): só
`loadMemoryContext` + `MemoryContext`, mantendo o resto do módulo interno ao pipeline.
O diagnóstico do @qa estava certo: em runtime o símbolo era `undefined`, o TypeError caía
no try/catch da memória e o coach rodaria permanentemente sem perfil do lead, em silêncio.

**MF-3 (medium) — `barrel-contract.test.ts`.** Único teste da suíte que olha o módulo REAL
de `@trifold/ai`, sem `vi.mock`. Assere `typeof` de cada símbolo que o helper importa, e
tem uma segunda guarda que lê o próprio fonte do helper e confere que a lista não
envelheceu (símbolo novo no import sem entrar na lista = teste vermelho).
**Verifiquei que o teste não é teatro:** revertendo o export do MF-1, ele falha em
`loadMemoryContext`; restaurando, passa. Sem essa checagem eu teria entregado um teste
que nunca reprova nada.

**MF-2 (high) — tabela de validações.** Corrigida acima, com o comando de cada linha e o
exit code conferido individualmente em vez de contagem por pipe. Lição registrada:
`grep -c` sobre a saída de um comando que falhou devolve 0, o que é indistinguível de
"passou" — nunca usar contagem sem confirmar que o comando rodou.

**Concern medium (supersede) — também corrigido**, embora o @qa o tenha marcado como não
bloqueante: o UPDATE agora filtra `org_id` e checa `error`, logando
`LIVE_COACH_SUPERSEDE_FAILED`. Sem isso, uma falha ali deixaria duas sugestões ativas e a
90-2 renderizaria dois cards — AC8 violada sem sinal nenhum. Coberto por teste que injeta
o erro e prova que a sugestão nova ainda é inserida.

Concerns **low** (queries duplicadas com o 63-12) e **info** (funções SQL em prod antes de
T7) permanecem abertos: o primeiro é otimização sem impacto funcional, o segundo é
pré-condição de T7 e está no gate.

## Change Log
| Data | Autor | Mudança |
|---|---|---|
| 2026-08-27 | River (@sm) | Story criada a partir do Epic 90 (handoff do @pm) |
| 2026-08-27 | Pax (@po) | **Validação: GO.** 2 correções críticas aplicadas: (1) gate trocado de `brokerSentRecently` para `deriveBrokerActive` + guarda de reativação — a versão original divergia da decisão do épico (`is_ai_active = false`) e perdia o handoff recém-feito; (2) `.select("id, created_at")` no INSERT inbound, sem o qual a FK `message_id` não tem o id. Mais: timeout explícito no passo Sonnet, `loadMemoryContext` nomeada, AC 2b/2c novas, orçamento dos 60s documentado. |
| 2026-08-27 | Dex (@dev) | T1–T6 implementadas: migrations 242/243, capability, flow `live-coach.ts`, helper `generate-suggestion.ts`, disparo no webhook e 39 testes novos. Suíte completa verde (3128), type-check e lint limpos. T7/T8 pendentes (prod). |

## QA Results (@qa Quinn — 2026-08-27)

**Gate: FAIL** — `docs/qa/gates/90-1-live-coach-backend.yml`

Um defeito objetivo, fix trivial. O desenho está correto e a implementação é fiel à
story; o problema é um import que não existe.

### MF-1 (critical) — `loadMemoryContext` não é exportado por `@trifold/ai`
`generate-suggestion.ts:11` importa o símbolo, mas `packages/ai/src/index.ts` não exporta
`./memory` e nenhum barrel o reexporta (`flows/index.ts` exporta `lead-memory`/
`updateLeadMemory` — outro módulo). Em produção o símbolo é `undefined`, a chamada lança
TypeError e o try/catch do bloco de memória engole: **o coach rodaria permanentemente sem
o perfil do lead** — metade da ancoragem prometida pelo épico — sem sinal em
`system_events`. Falha silenciosa e permanente.

### MF-2 (high) — o type-check do packages/web nunca rodou
A story reporta "tsc --noEmit (packages/web): limpo (0 erros)". O comando foi
`timeout 600 npx tsc --noEmit 2>&1 | grep -c "error TS"`, e **`timeout` não existe no
macOS**: o comando abortou, o pipe recebeu zero linhas e o `grep -c` contou 0. Reproduzido
lado a lado — com `timeout` → 0; sem → 1. Contagem de erro de um comando que falhou é
sempre 0.

### MF-3 (medium) — a suíte é cega para esta classe de bug
`vi.mock("@trifold/ai", ...)` fabrica o módulo inteiro, inclusive `loadMemoryContext`. Por
isso 39 testes verdes conviveram com o import quebrado. Falta um teste de contrato de
barrel (sem mock) que assere `typeof` dos símbolos que o helper importa.

### Por que FAIL e não CONCERNS
Três camadas de silêncio em cascata: ferramenta ausente engolida pelo pipe → mock que
fabrica o símbolo → fail-open que esconde o TypeError. Nenhuma é errada isoladamente;
juntas deixam passar um defeito permanente em produção.

### Verificado e correto (não presumido)
Gate de takeover conforme a correção do @po, com testes para handoff-sem-msg e para
Nicole-vai-reassumir; `ancorada` derivada (teste prova que `true` com lista vazia é
rebaixado); `confianca:"baixa"` nunca persiste; nenhuma escrita fora de
`coach_suggestions` (grep); `after()` independente e após o early-return de wamid;
`.select("id, created_at")` como única mudança no caminho síncrono, com teste trancando a
FK; migration 242 espelha `messages_select` da 229 e a publicação Realtime segue a 102;
243 é 100% do gerador. Suíte 3128 verde, `tsc` do ai limpo, eslint limpo.

### Concerns não bloqueantes
- **medium** — o UPDATE do supersede não checa `error` nem filtra `org_id`: se falhar,
  ficam duas sugestões ativas e a 90-2 renderiza dois cards (AC8 violada em silêncio).
- **low** — 2-3 queries por inbound antes do gate 3 descartar, uma delas repetindo o que
  `notifyBrokerOnReply` já faz no mesmo request.
- **info** — a policy da 242 depende de `has_capability` (230/241), `user_org_id` e
  `user_broker_id` (004): confirmar as três em prod antes de T7, e aplicar 242 antes da 243.

**Próximo passo:** `@dev *apply-qa-fixes` (MF-1, MF-2, MF-3) → re-gate.
| 2026-08-27 | Dex (@dev) | **apply-qa-fixes**: MF-1 (export de `loadMemoryContext` no barrel), MF-3 (teste de contrato de barrel, com prova de que reprova de verdade), MF-2 (tabela de validações re-executada sem `timeout`) e o concern do supersede (`org_id` + checagem de erro). Suíte 3137 verde, tsc limpo nos dois pacotes (exit 0 conferido), eslint limpo. |
