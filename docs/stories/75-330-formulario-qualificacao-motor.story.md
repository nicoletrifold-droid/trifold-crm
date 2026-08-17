# Story 75-330 — Motor do formulário público de qualificação

**Status:** InReview
**Tipo:** Feature nova (rota pública + tabelas novas)
**Epic:** 89 — Formulário de qualificação para tráfego pago
**Story ID:** 75-330
**Complexidade:** M (~5 pts — 2 migrations, 2 tabelas, 1 rota pública, 1 API, 1 tela de config)
**Fluxo:** @sm → @po **GO 8/10** → @dev → @qa → @devops
**Validação:** `docs/qa/po-validation-75-330.md` (@po, 17/08 — 4 correções obrigatórias, aplicadas abaixo e marcadas `[@po 17/08]`)
**Migrations:** **231** = valor novo no enum `lead_source` · **232** = tabelas do formulário

## Contexto

O Épico 89 traz o formulário de tráfego pago para dentro do CRM. Esta story constrói o
**motor**: a definição do formulário, a página pública que o executa com ramificação, e a
gravação das respostas com score. A agenda no fim é a **75-331**; a leitura por IA é a
**75-332**. Nenhuma das duas pode começar sem esta.

A decisão de construir aqui em vez de seguir no YayForms está registrada no epic §2: a peça
cara (agenda pública por token, horários reais, espelho no Google) já existe desde a Story
81-4 e será reusada pela 75-331.

### A regra que não pode ser perdida no caminho

O diretor decidiu (D2) que **todo mundo vê a agenda no fim, sem exceção**. O score, portanto,
**não bloqueia nada** nesta v1. Ele é calculado e gravado assim mesmo. O motivo é explícito:
se em 30 dias ficar claro que abaixo de X só dá trabalho para o SDR, ligar o corte tem que ser
mudar um número — não refazer a tela nem ficar sem histórico para calibrar. Implementar o
score e não usá-lo é intencional, não sobra.

## Escopo

### IN

1. Migration **231**: `ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'form_qualificacao'` — sem isso o INSERT do lead falha com `22P02` (ver AC4). `[@po 17/08]`
1b. Migration **232**: `lead_forms` (definição) + `lead_form_responses` (respostas), com RLS. `[@po 17/08]`
2. Formato do `schema` em `jsonb`: perguntas, tipos, opções, **condições de exibição** e
   **pesos** para o score.
3. Página pública `/formulario/[token]` — sem login, mesma garantia do `/agendar/[token]`.
4. API pública: ler a definição, salvar progresso parcial, finalizar.
5. Criação do lead **assim que o contato é capturado** (não no fim).
6. Captura de UTM/campanha nas **colunas dedicadas de `leads`** para atribuição (ver AC6 — a redação original dizia `metadata` e estava errada).
7. Aceite de LGPD com link para `/politica-de-privacidade`.
8. Tela de configuração para editar o `jsonb` sem deploy.

### OUT

- A agenda no fim da última tela → **75-331**
- Análise das respostas abertas por IA → **75-332**
- Editor visual arrastando campos (a v1 edita o JSON com validação)
- Corte de qualificação escondendo a agenda (revogado por D2)

## Acceptance Criteria

1. **AC1 — Rota pública de verdade.** `/formulario/[token]` abre sem sessão. O `pathname`
   entra no `isPublicRoute` de `lib/supabase/middleware.ts:115`, junto de `/agendar/` e
   `/pasta/`. Validação obrigatória pós-deploy: `curl` anônimo na URL retorna a página, não
   um redirect para `/login`.

2. **AC2 — Token inválido não vaza nada.** Token inexistente, mal formado ou de formulário
   inativo cai na mesma tela genérica de "link inválido ou desativado", sem revelar se o
   token existe, a que org pertence ou qual campanha. Mesmo comportamento do
   `app/agendar/[token]/page.tsx`.

3. **AC3 — Ramificação funciona.** Uma pergunta com condição de exibição só aparece se a
   condição for satisfeita pelas respostas já dadas. Quem responde "à vista" não vê as
   perguntas de financiamento. A decisão de qual é a próxima pergunta vive em **função pura**
   testável sem DOM (o projeto não tem jsdom nem teste de componente — a decisão sai da tela e
   vai para a função).

4. **AC4 — Contato capturado cedo vira lead mesmo se abandonar, com origem PRÓPRIA.** Assim
   que nome + telefone são preenchidos, o lead é criado e a resposta parcial é gravada. Se a
   pessoa fechar a aba na pergunta 4 de 6, existe um lead com as 3 respostas que ela deu.

   `[@po 17/08]` O lead nasce com `source = 'form_qualificacao'`, **valor novo**. `leads.source`
   é o ENUM `lead_source` (`001_base_schema.sql:22`) — valor fora do enum **não degrada, estoura
   o INSERT com `22P02`**. Foi exatamente isso que derrubou o link público da imobiliária
   (ver cabeçalho de `181_lead_source_imob_link.sql`, Story 75-190): o parceiro via *"Não foi
   possível registrar o cliente"*. Mesma rota, mesmo erro — não repetir.

   **Proibido** reaproveitar `meta_ads` para fugir da migration: o webhook do Meta Lead Forms
   já grava esse valor (`app/api/webhooks/meta-ads/route.ts:53`) e o `/api/analytics/sources`
   agrupa por `source` cru — os dois funis viram um só e o formulário fica **impossível de
   medir**, que é a razão de existir do epic.

   A varredura dos cinco lugares onde `source` está enumerado à mão é parte da AC:

   | Onde | O que é | Se esquecer |
   |------|---------|-------------|
   | `lib/constants.ts:102` | `SOURCE_OPTIONS` (canônica) | não aparece em seletor nenhum |
   | `app/dashboard/leads/new/page.tsx:44` | union de tipos à mão | `tsc` reprova ou o cast mente |
   | `app/dashboard/leads/page.tsx:28` | lista de filtro | lead some do filtro |
   | `app/dashboard/sistema/webhooks/page.tsx:17,130` | mapa de rótulo + `<option>` | rótulo em branco |
   | `.../email-blasts/novo/_components/step-audience.tsx:9` | cópia local de `SOURCE_OPTIONS` | público do blast incompleto |

5. **AC5 — Score calculado e gravado, sem efeito nenhum.** Cada finalização grava
   `lead_form_responses.score` conforme os pesos do `jsonb`. O score **não** esconde
   perguntas, **não** muda o destino do lead e **não** aparece para o lead. Função pura, com
   testes cobrindo: peso ausente, resposta fora das opções e formulário sem nenhum peso
   definido (score = 0, não erro).

   `[@po 17/08]` **Escala obrigatória: 0–100**, e a story precisa decidir por escrito a relação
   com `leads.qualification_score`, que **já existe e já é mostrado ao corretor** com faixa de
   cor (`app/broker/leads/[id]/page.tsx:200-210`, verde ≥ 70, amarelo ≥ 40). Recomendação do
   @po: gravar nos **dois** — `lead_form_responses.score` como histórico imutável da resposta e
   `leads.qualification_score` para aparecer onde o corretor já olha. O @dev pode contrariar
   com justificativa escrita; o que não pode é a story sair omissa e nascerem dois números
   chamados "Score" com escalas diferentes.

6. **AC6 — Atribuição nas colunas que já existem.** `[@po 17/08]` `utm_source`, `utm_medium`,
   `utm_campaign`, `utm_content` e `utm_term` vão para as **colunas dedicadas de `leads`**
   (`001_base_schema.sql:129-133`), **não** para `metadata`. Enterrar em jsonb criaria uma
   segunda verdade ao lado de colunas que qualquer query de atribuição procura primeiro.
   `metadata` fica só para o que não tem coluna (id do formulário, token de origem). URL sem
   UTM não quebra o envio.

7. **AC7 — LGPD.** O envio exige aceite explícito (checkbox não pré-marcado) com link para
   `/politica-de-privacidade`. O aceite é gravado com data/hora na resposta.

8. **AC8 — Editável sem deploy.** Um admin edita as perguntas pela tela de configuração e a
   página pública passa a servir a versão nova sem build. JSON inválido é **rejeitado na
   gravação** com erro legível — nunca salvo a ponto de quebrar a página pública.

9. **AC9 — Respostas visíveis na ficha.** As respostas aparecem na ficha do lead para o
   corretor, em texto legível (pergunta + resposta), não como JSON cru.

10. **AC10 — RLS fechada.** `lead_forms` e `lead_form_responses` têm RLS habilitada e escopada
    por `org_id`. A escrita pública acontece pela rota com service-role validando o token —
    nunca por policy anônima ampla. Validar com a migration aplicada em transação
    **revertida** antes do deploy.

## Notas técnicas

- **Padrão a copiar:** `app/agendar/[token]/page.tsx` (Server Component valida token →
  passa dados prontos para o client) + `app/api/agendar/[token]/route.ts` (GET lê, POST
  escreve, ambos com o token na rota).
- **Nicole:** definir e registrar nesta story o que acontece com quem abandona no meio. Se o
  formulário não devolver esses leads para a Nicole retomar de onde pararam, nascem duas
  qualificações concorrentes (epic §6). A implementação do retomar pode ser follow-up, mas a
  **decisão** tem que sair daqui escrita.
- **Rate limit:** `[@po 17/08]` POST público com limite por IP **reusando o padrão que já
  existe** — `Map` em memória de módulo, como em `app/api/agent/chat/route.ts:60`. Não existe
  helper compartilhado no projeto e **não é para inventar Redis dentro desta story**. O padrão
  vale por instância de lambda na Vercel e não defende de abuso distribuído: **declarar essa
  limitação em comentário no código**. Defesa séria de endpoint público é story própria.
- **Migrations:** carregar as boas práticas de Postgres antes de escrever a 232 (tipos de
  coluna, índices, RLS). Aplicar em produção pela Management API — nunca `db push`.
  `[@po 17/08]` A **231 é só o `ADD VALUE`** e fica separada de propósito: `ALTER TYPE` e uso
  do valor novo não convivem na mesma transação, e assim ela é verificável sozinha.
- `[@po 17/08]` **Colisão pré-existente, fora do escopo:** há **duas** migrations numeradas
  230 (`230_appointment_status_closed.sql` e `230_f4_rpcs_views_unificacao.sql`). Não afeta
  231/232; registrado em `docs/qa/po-validation-75-330.md` §5 para virar decisão de alguém.
- **Testes:** `vitest` só coleta `.test.ts`. As funções puras desta story (próxima pergunta,
  score, parse do schema) são o alvo dos testes.

## Decisões do @dev (as que a story exigia por escrito)

### D-A · `leads.qualification_score` — escreve nos DOIS (AC5)

Seguida a recomendação do @po. `lead_form_responses.score` guarda o histórico imutável
daquela resposta; `leads.qualification_score` recebe o mesmo número para aparecer onde o
corretor já olha (`broker/leads/[id]/page.tsx:200-210`, faixa de cor 0–100). Escrever só na
tabela de respostas deixaria a tela dele vazia; escrever só no lead perderia o histórico
quando a pessoa preenchesse uma segunda campanha. A escala 0–100 é a mesma nos dois — é o
`calcularScore` que normaliza, e ele é o único lugar onde essa conta existe.

### D-B · Quem abandona no meio — vira lead, e a retomada é follow-up

**Decisão:** a resposta parcial é gravada e o lead nasce (AC4), com `source =
form_qualificacao` e a etapa default. **A Nicole NÃO é acionada automaticamente nesta
story.** O lead segue o caminho normal de qualquer lead novo.

**Por quê não agora:** retomar por WhatsApp exige template aprovado na Meta (fora da janela
de 24h não se manda texto livre), e aprovar template é processo com prazo próprio — não cabe
dentro desta story sem transformá-la em outra coisa. O que esta story garante é o
**substrato**: `status='parcial'`, as respostas dadas até o abandono, e `lead_form_responses`
ligada ao lead. Uma story futura liga a retomada sem precisar mexer em nada disto.

**O risco que fica registrado:** enquanto a retomada não existe, quem abandona no meio é
tratado como lead comum e a Nicole pode recomeçar a qualificação do zero, perguntando o que a
pessoa já respondeu. É o cenário de duas qualificações concorrentes que o epic §6 aponta —
mitigado, não resolvido: o corretor **vê** as respostas parciais na ficha (AC9, com o selo
"Não terminou"), então pelo menos o humano não repete a pergunta.

## Desvios em relação ao parecer do @po (com motivo)

1. **`SOURCE_OPTIONS` NÃO recebeu `form_qualificacao`.** A AC4 mandava incluir, mas essa
   lista é o seletor do cadastro **manual** de lead. Deixá-la lá permitiria um corretor
   carimbar "veio do formulário" num lead que ele digitou — sujando exatamente a métrica que
   o epic existe para medir. Precedente que confirma: `imob_link` também vive em
   `SOURCE_LABELS` e está fora de `SOURCE_OPTIONS`. Motivo registrado em comentário no
   `lib/constants.ts`.

2. **`sistema/webhooks/page.tsx` não fazia parte da varredura.** Aquele `SOURCE_LABELS` é de
   `webhook_events` (`imoveis_sync`, `landing_page`), taxonomia diferente de `leads.source`.
   Era falso positivo do parecer; incluir teria adicionado uma origem inexistente ao filtro
   de webhooks.

3. **A varredura real era MAIOR onde importa:** `lib/constants.ts` tem **três** constantes de
   origem, não uma — `SOURCE_OPTIONS`, `SOURCE_LABELS` (24) e `SOURCE_LABELS_SHORT` (43).
   Sem as duas últimas o lead apareceria como `form_qualificacao` cru na ficha e no Analytics.

4. **Nenhuma capability nova.** A AC8 diz "um admin edita", e a rota `/api/lead-forms` usa o
   **mesmo** `canAccess(..., "configuracoes")` da tela. Criar
   `configuracoes.formularios_editar` exigiria regenerar o seed (`gen-capability-seed.mts`,
   migration ~55 KB) para um ganho que a AC não pediu. Fica anotado como melhoria: hoje quem
   edita formulário precisa de acesso a Configurações inteiro.

## Evidências dos gates

| Gate | Resultado |
|------|-----------|
| `pnpm type-check` | **8/8 tasks, 0 erros** |
| `pnpm lint` | exit 0 · 25 warnings, **todas de baseline** — nenhuma nos arquivos novos |
| `pnpm build` | **5/5 tasks**; rotas novas presentes: `/formulario/[token]`, `/api/formulario/[token]`, `/api/lead-forms`, `/dashboard/configuracoes/formularios` |
| `pnpm test` | **2480 passed** (195 arquivos), 6 expected-fail de baseline — **+38 casos novos** |

Os 38 casos novos cobrem, nominalmente, o que a AC5 exige (peso ausente, resposta fora das
opções, formulário sem pesos), mais: limpeza em **cascata** da ramificação (trocar a resposta
do avô mata o neto), obrigatória escondida que **não** trava o envio, condição apontando para
frente rejeitada no parse, e resposta preservada quando a pergunta é apagada do formulário.

Um teste meu falhou na primeira execução — e o código estava certo: eu tinha errado o teto do
score no próprio teste (10 + 20 = 30, não 25). Corrigido o teste, não o código.

## File List

**Migrations**
- `supabase/migrations/231_lead_source_form_qualificacao.sql` (novo)
- `supabase/migrations/232_lead_forms.sql` (novo)

**Funções puras + testes**
- `packages/web/src/lib/forms/schema.ts` · `schema.test.ts` (novos)
- `packages/web/src/lib/forms/branching.ts` · `branching.test.ts` (novos)
- `packages/web/src/lib/forms/score.ts` · `score.test.ts` (novos)
- `packages/web/src/lib/forms/format-response.ts` · `format-response.test.ts` (novos)
- `packages/web/src/lib/forms/lead-responses.ts` (novo)

**Rotas**
- `packages/web/src/app/api/formulario/[token]/route.ts` (novo — pública)
- `packages/web/src/app/api/lead-forms/route.ts` (novo — interna)
- `packages/web/src/app/formulario/[token]/page.tsx` · `form-runner.tsx` (novos)
- `packages/web/src/app/dashboard/configuracoes/formularios/page.tsx` · `formularios-client.tsx` (novos)
- `packages/web/src/components/leads/form-responses-panel.tsx` (novo)

**Alterados**
- `packages/web/src/lib/supabase/middleware.ts` — `/formulario/` em `isPublicRoute`
- `packages/web/src/lib/constants.ts` — `SOURCE_LABELS`, `SOURCE_LABELS_SHORT` (+ comentário no `SOURCE_OPTIONS`)
- `packages/web/src/app/dashboard/leads/page.tsx` — `SOURCE_FILTER_KEYS`
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/step-audience.tsx`
- `packages/web/src/app/broker/leads/[id]/page.tsx` — painel de respostas na ficha

## Definition of Done

- [ ] ⛔ **Migrations 231 e 232 NÃO aplicadas** — nem em dev, nem validadas em prod. Sem elas o código novo não funciona (`22P02` no INSERT, tabelas inexistentes). É o próximo passo, e é do @devops
- [x] **Varredura de `source` feita** — 3 constantes em `lib/constants.ts` + filtro da listagem + público do blast. Ver §"Desvios" para os dois lugares do parecer que NÃO entraram, e por quê
- [ ] ⛔ **Lead de teste com origem própria no `/api/analytics/sources`** — depende das migrations aplicadas
- [x] Decisão sobre `leads.qualification_score` escrita na story (AC5) — §D-A
- [ ] ⛔ **`curl` anônimo em `/formulario/[token]` em produção** — depende do deploy
- [x] Testes das funções puras passando; suíte completa sem regressão (2480 passed)
- [x] `tsc` 0 erros, `eslint` sem erro novo, `build` completo
- [x] Decisão sobre o abandono/Nicole registrada na story — §D-B
- [ ] @qa PASS antes do push

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 17/08/2026 | @sm (River) | Story criada a partir do Épico 89, com as decisões D1–D3 do diretor |
| 17/08/2026 | @po (Pax) | **GO 8/10** — `Draft` → `Ready`. 4 correções aplicadas: AC4 (enum `lead_source` + varredura, evita repetir o `22P02` da 181), AC6 (UTM nas colunas dedicadas, não em `metadata`), AC5 (escala 0–100 + decidir sobre `qualification_score`), rate limit com dono. Parecer: `docs/qa/po-validation-75-330.md` |
| 17/08/2026 | @qa (Quinn) | **CONCERNS** — gate abriu em FAIL: opcional em branco travava o formulário (bloqueante), formulário sem campo de contato falhava só no envio, e o rate limit por IP vazava memória. Os 3 corrigidos com regressão. Parecer: `docs/qa/qa-gate-75-330.md` |
