# Story 75-44 — Roleta: filtrar corretor por empreendimento (detectar na entrada Meta/WhatsApp)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** M (3-5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** gestor comercial, **I want** que o lead só seja distribuído na roleta para
corretores habilitados no empreendimento de interesse dele, **so that** quem não atende
Vind/Yarden não receba lead daquele empreendimento — respeitando a tela de Empreendimentos
em /dashboard/configuracoes/corretores.

## Contexto
A regra de filtro **já existe** na camada de distribuição: a RPC `roleta_pick_and_advance`
filtra o pool por `broker_assignments` quando `p_property_id` não é nulo, e libera todos
quando é nulo:
```sql
AND (p_property_id IS NULL OR EXISTS (
      SELECT 1 FROM broker_assignments ba
       WHERE ba.broker_id = b.id AND ba.property_id = p_property_id))
```
O `distributor.ts` já passa `lead.property_interest_id` como `p_property_id`.

**O elo quebrado é o intake:** os webhooks **não preenchem** `property_interest_id`.
Hoje só ~93/1.084 leads (~8,6%) têm o campo → o filtro quase nunca atua. Empreendimentos
cadastrados: **Vind Residence** (`...0004-...0001`) e **Yarden** (`...0004-...0002`).

Pré-requisito já entregue: fix do gerente-comercial salvar habilitações (commit `1339aca`).

## Escopo
**IN:**
1. **Meta** (`api/webhooks/meta-ads/route.ts`): detectar empreendimento no texto já
   resolvido (campaign name / ad_name / form name) por match de keyword
   ("vind" → Vind Residence; "yarden" → Yarden) e gravar `property_interest_id` no lead
   **antes** de chamar `distributeLeadToNextBroker` (linha ~241).
2. **WhatsApp** (distribuição pós-conversa / cron idle): detectar o empreendimento
   mencionado na conversa e gravar `property_interest_id` antes da distribuição.
   Avaliar 2 abordagens: (a) keyword match no texto das mensagens; (b) estender o
   classificador Haiku existente (`classifyContactIntent`) para retornar também o
   empreendimento. Decisão de design fica para @dev/@architect na implementação.
3. **Mapeamento keyword→property** centralizado e reusável (helper), tolerante a
   variações ("vind", "vind residence", "yarden").
4. **Fallback:** não identificado → `property_interest_id` permanece NULL → todos os
   corretores disponíveis entram (comportamento atual, já correto).

**OUT:**
- Mudança na RPC `roleta_pick_and_advance` (filtro já existe e está correto).
- Mudança na tela de Empreendimentos / `broker_assignments` (já funciona pós-1339aca).
- Backfill de `property_interest_id` em leads antigos (avaliar em story separada).
- Detecção por NLP sofisticada além de keyword/classificador atual.

## Acceptance Criteria
1. **Meta — identificado:** lead que chega via Meta com "vind" no nome da campanha/anúncio/
   formulário recebe `property_interest_id` = Vind Residence; só corretores habilitados em
   Vind entram na roleta para ele. Idem "yarden" → Yarden.
2. **WhatsApp — identificado:** lead cujo diálogo menciona Vind/Yarden recebe o
   `property_interest_id` correspondente antes da distribuição; pool filtrado pelos habilitados.
3. **Não identificado:** sem keyword/menção → `property_interest_id` NULL → todos os
   disponíveis elegíveis (sem regressão na cobertura atual).
4. **Sem habilitado → pool geral (DECISÃO DO USUÁRIO 2026-06-24, opção b):** se o
   empreendimento é identificado mas nenhum corretor disponível está habilitado nele,
   o lead **cai para o pool geral** (qualquer corretor disponível pode receber) — NÃO fica
   esperando. Implementação sugerida: duas passadas — 1ª filtrada por `property_id`; se
   retornar vazio, 2ª sem filtro (equivalente a `p_property_id = NULL`). **Decisão @po:**
   fazer no `distributor.ts` (chamar a RPC 2x), mantendo a RPC intocada (coerente com OUT).
5. typecheck/lint limpos; sem regressão na distribuição de leads sem empreendimento.

## Riscos
- **AC4 RESOLVIDO (usuário escolheu pool geral, 2026-06-24):** sem habilitado disponível →
  cai pro pool geral via 2ª passada sem filtro. Risco residual: a RPC hoje faz 1 passada;
  precisa de ajuste (chamar 2x no distributor, ou fallback dentro da RPC) — cuidar do
  advisory lock/atomicidade ao chamar 2x.
- **Falso match de keyword:** nome de campanha pode conter ambos ou nenhum; definir
  precedência e o que fazer em ambiguidade (sugestão: ambíguo → NULL = pool geral).
- **WhatsApp custo/latência:** se usar o classificador Haiku, +1 chamada por conversa;
  keyword match é grátis mas menos robusto.
- **Distribuição WhatsApp** roda no cron idle (5min) — garantir que a gravação do
  `property_interest_id` aconteça antes do `distributeLeadToNextBroker`.

## Dependências
- Fix gerente-comercial habilitações (commit `1339aca`) — entregue.
- RPC `roleta_pick_and_advance` (filtro existente) — sem mudança.

## Criteria of Done
- ACs 1-3 e 5 verificados; AC4 confirmado com o usuário e implementado conforme decisão.
- QA gate PASS.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.44-roleta-filtro-empreendimento-intake.yml`)
- 19 testes verdes (8 novos detect-property + 11 regressão). type-check/lint limpos.
- CONCERNS low não-bloqueante: match por substring (futuro: word-boundary).

## Dev Notes
- **Decisão de design (@dev):** detecção por **keyword match determinístico** (sem custo de
  IA, previsível) no Meta e no WhatsApp. Classificador Haiku ficou de fora — se keyword se
  mostrar insuficiente no WhatsApp, estender depois.
- **Helper `detect-property.ts`:** carrega properties ativos da org, casa por nome completo
  OU 1ª palavra (≥4 chars); exatamente 1 match → id; ambíguo/nenhum → null (pool geral).
  Nunca lança. Usa o client recebido (admin nos webhooks/cron, filtra por `org_id`).
- **Meta:** `property_interest_id` preenchido no insert (lead novo) e no update só se estava
  null (não sobrescreve seleção anterior). Texto analisado: campanha + ad_name + form.
- **WhatsApp:** detecta sobre `convo.text` no cron roleta-retry, grava só se null, antes de
  distribuir.
- **AC4 (pool geral):** 2ª passada no `distributor.ts` com `p_property_id=null` quando a 1ª
  (filtrada) vem vazia. RPC intocada.
- Testes: `detect-property.test.ts` (8 casos). `distributor.test.ts` e `roleta-retry` seguem
  verdes (11). type-check + lint limpos.

## File List
- `packages/web/src/lib/roleta/detect-property.ts` (novo)
- `packages/web/src/lib/roleta/detect-property.test.ts` (novo)
- `packages/web/src/lib/roleta/distributor.ts` (fallback pool geral — AC4)
- `packages/web/src/app/api/webhooks/meta-ads/route.ts` (detecção + grava property_interest_id)
- `packages/web/src/app/api/cron/roleta-retry/route.ts` (detecção no diálogo WhatsApp)

## Change Log
- 2026-06-24 — @sm — Story criada (Draft). Filtro já existe na RPC; escopo é preencher
  `property_interest_id` no intake Meta/WhatsApp.
- 2026-06-24 — @po — Validada GO (9/10). Draft → Ready. Ajuste: fallback do AC4 no
  `distributor.ts` (RPC 2x), RPC permanece intocada (coerência com OUT).
- 2026-06-24 — @dev — Implementada (helper keyword + Meta + WhatsApp + fallback). InProgress → InReview.
- 2026-06-24 — @qa — Gate PASS (19 testes). InReview → (push).
- 2026-06-24 — @devops — Push para main. → Done.
