# Story 75-368 — Ligar e desligar o follow-up da Nicole por lead, sem cegar o corretor

**Status:** Done (local) — **@qa PASS** em 24/08/2026 após ciclo FAIL→fix→re-review. Aguarda @devops *push.
**Tipo:** Feature — controle operacional por lead
**Epic:** 75 — CRM Trifold
**Complexidade:** S (~3 pts — 1 migration aditiva, 1 condição no cron, 1 rota nova, 1 bloco na gaveta)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Migrations:** **240** (nova, aditiva — 1 coluna em `leads`)
**Depende de:** 75-353 (migration 235 estabeleceu o padrão de coluna-data em `leads` para
controle de envio; esta story segue o mesmo formato, mas com semântica diferente — ver AC1)

## O pedido

Marcos, 24/08/2026, com print da gaveta do lead no Pipeline:

> "Hoje a nicole faz follow-up dos leads, porém preciso fazer uma mudança (…) habilitar e desabilitar
> isto por lead. (…) Se quero q nicole faça deixo ligado e este é o padrão para todos, quando não
> quero q ela faça e eu que irei corretor ou outra pessoa que irá fazer, desliga."

Local do botão, apontado num segundo print: a faixa de ações do lead na gaveta, ao lado do
**"Conversar no WhatsApp"**.

### Valor (por que isso importa, não só o que foi pedido)

Hoje a Nicole manda follow-up para **qualquer** lead da etapa, inclusive um que uma pessoa já assumiu.
O efeito é constrangedor na frente do cliente: o corretor está negociando no WhatsApp e a IA entra por
cima com uma mensagem de reengajamento, como se ninguém estivesse atendendo. Também cruza fios — o lead
responde à mensagem da Nicole no meio de um assunto que o corretor estava conduzindo. O botão devolve ao
time o controle de quem fala com cada lead, que é a decisão comercial mais básica que existe.

## Investigação já feita (prova, não trabalho a repetir)

### 1. Não existe controle por lead hoje — o follow-up é por etapa

`follow_up_rules` (migration 008) tem uma linha por `stage_id`: `alert_days`,
`nicole_takeover_days`, `message_template`, `hsm_template`, `hsm_min_days`, `is_active`. É o que a
tela **Pipeline → "Config follow-up"** edita. Não há nenhuma coluna, tabela ou flag por lead que
quem opera consiga mexer.

### 2. `leads.marketing_optout_at` existe, mas NÃO serve — não reaproveitar

A migration 235 criou `leads.marketing_optout_at`. Semântica dela: **o lead** pediu para parar de
receber promoção (botão "Parar promoções" da Meta). Consequências de reaproveitar, todas erradas
para este pedido:

- misturaria "o lead pediu para parar" com "nossa equipe assume este lead na mão" — duas leituras
  que o time precisa distinguir no dia a dia;
- o opt-out só bloqueia **template de MARKETING** e deixa conversa dentro da janela de 24h passar
  (por desenho, documentado na 235). O botão do Marcos precisa parar o envio da Nicole inteiro,
  dentro e fora da janela.

**Coluna nova, separada.** A 235 fica intocada.

### 3. O achado que decide a implementação: é um `if / else if`, não dois `if`

`packages/web/src/app/api/cron/followup/route.ts:360`

```ts
// Check nicole_takeover_days first (more severe)
if (daysSinceLastContact >= rule.nicole_takeover_days) {
  …                                   // claim + envio da Nicole  → log type 'nicole_sent'
} else if (daysSinceLastContact >= rule.alert_days) {
  …                                   // alerta o corretor        → log type 'alert_broker'
}
```

Como `nicole_takeover_days >= alert_days`, um lead que cruzou o takeover **nunca** chega ao ramo do
alerta hoje: o `if` come ele primeiro. Disso saem duas consequências que o @dev precisa saber antes
de escrever a primeira linha:

**(a) NÃO filtrar na consulta de leads.** A consulta da linha 203 alimenta os DOIS ramos. Um
`.is("nicole_followup_off_at", null)` ali é a solução óbvia e está errada: mataria também o alerta
do corretor — exatamente o oposto do que o Marcos pediu, porque quem desligou a Nicole foi quem vai
atender na mão e é quem mais precisa do lembrete.

**(b) A condição do `if` da 360 é o lugar certo, e o comportamento desejado cai sozinho.** Somando
`&& !followUpDesligado` ao `if`, o lead deixa de entrar no ramo da Nicole e **cascateia para o
`else if`**, que é verdadeiro (ele já passou de `alert_days` faz tempo). Resultado, sem nenhum
código extra: Nicole cala, corretor continua sendo avisado. É a AC2 inteira em um operador.

### 4. Não há risco de virar rajada de alerta

O pré-filtro de 48h (`cooldownSet`, linha ~222) roda **antes** do `if/else` e vale para qualquer
tipo de `follow_up_log` do lead. Um lead com a Nicole desligada passa a gerar `alert_broker` no
lugar de `nicole_sent`, respeitando o mesmo teto de 1 a cada 48h. Nada a construir aqui.

### 5. A gaveta é compartilhada entre dashboard e corretor

`packages/web/src/components/leads/lead-detail-drawer.tsx` (1.235 linhas) serve as duas visões via
`leadBasePath`. O botão "Conversar no WhatsApp" está na linha 709. O padrão de papel do observador
já está resolvido no arquivo (linhas 245-264, Stories 75-267/75-205): **o `role` vem da tabela
`users`, não do `app_metadata` do JWT**, porque contas antigas não têm o claim. Seguir esse padrão,
não inventar outro. E, como o comentário da linha 1160 registra, **o gate real é na rota**, não na
UI.

### 6. Já existe um "Nicole ligada/desligada" por lead — e não é este (achado do @po)

`conversations.is_ai_active` (Epic 63) liga e desliga a Nicole **na conversa**: `handoff/route.ts`
desliga quando o corretor assume, `resume-ai/route.ts` religa ("Devolver para a Nicole"). A UI disso
vive em `packages/web/src/app/broker/leads/[id]/_components/ai-status-banner.tsx` — só na visão do
corretor, dentro da conversa, **não** na gaveta.

Duas consequências:

**(a) Não é substituto.** `is_ai_active` mora em `conversations`; lead que nunca conversou não tem linha
lá. O Marcos quer poder desligar um lead novo de Meta Ads *antes* de qualquer conversa existir, para
ligar ele mesmo. A coluna em `leads` cobre isso e o `is_ai_active` não cobre.

**(b) Risco de confusão de nomenclatura — tratar na UI.** O operador passará a ter duas noções de
"Nicole ligada/desligada" no mesmo lead. O rótulo da AC4 diz **"Follow-up"** justamente para separar as
duas: uma controla a conversa ao vivo, a outra controla o cron. O @dev não pode encurtar o rótulo para
"Nicole: Ligado/Desligado" — perderia a distinção.

> **Item aberto, proposto ao Marcos e fora desta story:** o cron **ignora** `is_ai_active` por completo
> (verificado: zero ocorrências em `api/cron/followup/`). Ou seja, lead com conversa já assumida por um
> humano continua recebendo follow-up da Nicole hoje. Isso é provavelmente o defeito que originou o
> pedido, e é uma correção diferente desta story. Registrado no backlog para o Marcos decidir separado.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Lead desligado e **esquecido** — ninguém religa e o follow-up morre em silêncio para aquele lead | Alta | A coluna guarda a data justamente para permitir, depois, uma lista de "desligados há mais de X dias". Fora do escopo desta story, mas o dado nasce pronto. O badge no kanban (extra não aprovado) seria a mitigação de primeira linha. |
| Corretor desliga o follow-up **para não ser cobrado** pelo lead parado | Média | Mitigado por desenho: a AC2 preserva o `alert_broker`, então desligar a Nicole não faz o lead sumir do radar do gestor — só cala a IA. O `audit_logs` da AC5 dá a trilha. |
| @dev "simplificar" o filtro para a consulta da linha 203 e matar o alerta do corretor | Média | AC2 proíbe explicitamente, a investigação 3 explica o porquê, e T2 exige comentário no código. |
| Confusão com o `is_ai_active` da Epic 63 | Média | Rótulo com a palavra "Follow-up", conforme investigação 6(b). |

## Acceptance Criteria

**AC1 — Coluna nova, aditiva, com data.**
Migration **240** adiciona `leads.nicole_followup_off_at timestamptz` (default NULL). `NULL` = follow-up
da Nicole **ligado** — o padrão pedido pelo Marcos, e que dispensa backfill dos leads existentes.
Preenchida = desligado, e o valor diz *quando* foi desligado. Índice parcial
`where nicole_followup_off_at is not null`, no mesmo formato do `idx_leads_marketing_optout`.
`COMMENT ON COLUMN` explicando a diferença para `marketing_optout_at`. Bloco `ROLLBACK PLAN` no rodapé,
como nas migrations 235 e 239.

**AC2 — Desligado silencia a Nicole e preserva o alerta do corretor.**
Com `nicole_followup_off_at` preenchida, o cron **não** cria `follow_up_log` do tipo `nicole_sent`
nem envia mensagem para o lead; e **continua** criando `alert_broker` quando o lead passa de
`alert_days`. Implementar pela condição da linha 360, conforme a investigação 3(b). Proibido
filtrar na consulta da linha 203.

**AC3 — Ligado não muda nada.**
Com `nicole_followup_off_at` NULL, o comportamento do cron é byte a byte o de hoje: mesma ordem,
mesmo claim, mesmo cooldown, mesma decisão de template HSM da 75-353.

**AC4 — Botão na gaveta, com estado legível sem interação.**
Na faixa de ações de `lead-detail-drawer.tsx`, junto ao "Conversar no WhatsApp": um controle
rotulado — **"Follow-up Nicole: Ligado" / "Follow-up Nicole: Desligado"** — não um ícone de power
sozinho, que num CRM é ambíguo (desliga o quê: o lead? a conversa?). Clique alterna e reflete o novo
estado sem exigir recarregar a página. Estado de carregando e erro tratados; falha da rota não pode
deixar o rótulo mentindo sobre o estado real.

**AC5 — Rota nova, com o gate no servidor.**
Endpoint **`POST /api/leads/[id]/followup-nicole`** — nome fixado aqui pelo @po para o @dev não ter de
inventar; segue a convenção plana das 25 rotas irmãs (`/assign`, `/reativar`, `/resume-ai`).
Idempotente: desligar o que já está desligado devolve 200 sem UPDATE, como o `resume-ai` faz.

**Permissão: espelhar o `resume-ai`**, que é o precedente mais próximo (ação de IA por lead, reversível,
baixo risco) — capability via `can()` **OU** o corretor dono do lead (`assigned_broker_id`). Ler o `role`
e o `org_id` do servidor via `requireAuth()`, com isolamento explícito por `org_id` na consulta do lead,
exatamente como `resume-ai/route.ts:33-49`. A UI esconde, a rota decide. Escrita registrada em
`audit_logs`, como as demais mutações de lead.

**AC6 — Testes.**
Unitário cobrindo os três caminhos do cron: desligado silencia `nicole_sent`; desligado ainda produz
`alert_broker`; ligado mantém o comportamento atual. Mais o caso de borda que o `if/else` cria:
lead desligado **abaixo** de `alert_days` não gera nada.

## Fora de escopo

Propostos ao Marcos em 24/08 e **não aprovados** — não implementar, nem "de brinde":

1. **Marcar no card do kanban** quando o follow-up está desligado.
2. **Registrar no histórico de contatos do lead** quem desligou e quando (o `audit_logs` da AC5 é
   trilha técnica, não entrada visível no histórico).
3. Coluna de "quem desligou" (`_by`). O Marcos fechou em **coluna como data**, só.
4. Qualquer mudança em `marketing_optout_at` ou na lógica de template HSM da 75-353.
5. Ação em massa (desligar N leads de uma vez).

## Tasks / Subtasks

- [x] **T1 — Migration 240** (AC1): coluna, índice parcial, comments, rollback plan.
- [x] **T2 — Cron** (AC2, AC3): incluir a coluna no `select` da linha ~203 (ler, não filtrar) e somar
      a condição ao `if` da linha 360. Comentário no código explicando *por que* não é filtro na
      query — senão a próxima pessoa "simplifica" e quebra o alerta.
- [x] **T3 — Rota** (AC5): `PATCH` do toggle, gate por `can()`, `audit_logs`.
- [x] **T4 — UI** (AC4): controle na faixa de ações da gaveta, papel do observador lido de `users`
      conforme investigação 5.
- [x] **T5 — Testes** (AC6): quatro casos do cron.
- [x] **T6 — CodeRabbit** antes do commit (ver seção abaixo).

## Dev Notes

- Migration é **240**. A última aplicada é a 239 (`obra_fotos_policy_por_papel`).
- A coluna nasce com `org_id` já garantido pela tabela `leads`; não é tabela nova, então não há
  policy nova a escrever — as policies de `leads` já cobrem.
- Nome da coluna escolhido para não colidir nem confundir com `marketing_optout_at`. Se o @dev
  achar nome melhor, trocar **antes** da migration existir, nunca depois.
- O cron roda a cada 2h, só entre 8h e 20h BRT, e tem claim atômico por run (75-352) e por lead
  (`claimFollowUp`). Nada disso muda.

## CodeRabbit Integration

- **Quando:** `--prompt-only -t uncommitted` antes do commit; `--base main` antes do PR.
- **Self-healing:** máximo 2 iterações; o que sobrar vira Concern para o @qa.
- **Foco previsto para esta story:** (a) a condição da linha 360 — confirmar que a cascata para o
  `else if` está correta e não deixa lead órfão; (b) a rota nova — gate no servidor, não só na UI;
  (c) a migration — idempotência (`add column if not exists`) e rollback plan.
- **Gates:** lint, typecheck e os testes da AC6 verdes antes do handoff ao @qa.

## File List

**Novos**
- `supabase/migrations/240_followup_nicole_por_lead.sql`
- `supabase/migrations/241_capability_followup_nicole.sql` (gerado — ver desvio D1)
- `packages/web/src/app/api/leads/[id]/followup-nicole/route.ts`
- `packages/web/src/lib/followup/decidir-acao.ts`
- `packages/web/src/lib/followup/decidir-acao.test.ts`

**Editados**
- `packages/web/src/app/api/cron/followup/route.ts`
- `packages/web/src/components/leads/lead-detail-drawer.tsx`
- `packages/web/src/lib/capabilities.ts`
- `packages/web/src/lib/capabilities.test.ts`

## Dev Agent Record

**Agent Model Used:** Fable 5 · modo YOLO · branch `feature/75-368-follow-up-nicole-por-lead`

### Desvios do plano do @sm (e por quê)

**D1 — Migration 241 além da 240.** A AC5 exige gate por `can()`, e capability nova não pode ser
inventada no código: `packages/web/src/lib/capabilities.ts` é fonte única e o seed SQL é **gerado**
por `scripts/gen-capability-seed.mts`. Adicionei `leads.followup_nicole` ao registro e gerei a 241
com o script, exatamente como as migrations 226 e 227 fizeram para capabilities novas. Não editei a
225 (já aplicada em produção). O gerador reemite o seed inteiro, mas com `ON CONFLICT DO NOTHING` —
só as 10 linhas novas entram.

`broker` entra como **false** de propósito: o corretor dono é autorizado pela checagem de
`assigned_broker_id` na rota, não pela capability — mesmo desenho do `resume-ai`. Capability é para
quem mexe em lead de terceiro.

**D2 — Extraí a decisão para função pura.** A story pedia teste do cron, mas os três testes que já
existem em `api/cron/followup/` (`resolve-broker-name`, `notify-alert`) testam **funções puras**, não
a rota com mocks — e a 75-353, citada na própria story, extraiu `decidirTemplateDoFollowUp` pelo
mesmo motivo. Criei `decidirAcaoDoFollowUp` e **liguei o cron a ela**, para o teste cobrir o código
que roda e não uma cópia da regra.

### Validações executadas

| Validação | Resultado |
|---|---|
| `tsc --noEmit` (packages/web) | limpo |
| `eslint` nos 4 arquivos tocados | **0 errors**, 5 warnings — todos **pré-existentes**, confirmado rodando o mesmo lint na `main` via `git stash` |
| `vitest run` (regressão completa) | **247 arquivos, 2997 testes passando**, 6 expected-fail |
| `decidir-acao.test.ts` | 7/7 |

**Uma quebra encontrada e corrigida:** `capabilities.test.ts` mantém a lista fixa de capabilities
enforced. Capability nova quebra esse teste por desenho (é o alarme funcionando). Adicionei a chave à
lista — mesma manutenção que 226/227 exigiram.

**T6 — CodeRabbit NÃO executado.** O binário não existe nesta máquina: a config do agente aponta para
WSL (`~/.local/bin/coderabbit`) e o host é macOS. Não é falha de review — é ferramenta indisponível.
Registrado aqui para o @qa decidir se bloqueia ou vira Concern.

### O que ficou onde

- **AC1** → `240_followup_nicole_por_lead.sql`. `nicole_followup_off_at timestamptz`, índice parcial,
  `COMMENT` explicando a diferença para `marketing_optout_at` e `is_ai_active`, rollback plan.
- **AC2/AC3** → `decidir-acao.ts` + `followup/route.ts`. O `else if` virou `acao === "alerta"`, e a
  cascata que preserva o `alert_broker` está coberta por teste dedicado.
- **AC4** → `lead-detail-drawer.tsx`. Botão com `BellRing`/`BellOff`, rótulo **"Follow-up Nicole:
  Ligado/Desligado"** (a palavra "Follow-up" é obrigatória por decisão do @po), `aria-pressed`,
  atualização otimista **com rollback** — se a rota falhar o rótulo volta ao estado real e aparece
  aviso, nunca mente.
- **AC5** → `POST /api/leads/[id]/followup-nicole`. Body `{ off: boolean }` validado, `requireAuth()`,
  isolamento por `org_id` na consulta, `can("leads.followup_nicole")` OU corretor dono, idempotente
  (só faz UPDATE quando o estado muda), grava em `activities` mesmo no no-op.
- **AC6** → `decidir-acao.test.ts`, 7 casos incluindo a borda "desligado e abaixo de `alert_days`" e
  regra sem folga (`takeover == alert`).

### Fora de escopo — confirmado não implementado

Nenhum dos 5 itens da seção "Fora de escopo" foi tocado. Sem badge no kanban, sem entrada no histórico
de contatos, sem coluna `_by`, sem mudança em `marketing_optout_at` ou no HSM da 75-353, sem ação em
massa. O item do backlog aberto pelo @po (cron ignora `is_ai_active`) também **não** foi implementado.

## QA Results

**Gate completo:** `docs/qa/qa-gate-75-368.md`

**Decisão: FAIL → corrigido → PASS.** 3 Concerns LOW, nenhum bloqueia.

### H1 (HIGH) — encontrado e corrigido no mesmo ciclo

O ramo `alert_broker` sempre exigiu conversa: `podeFollowUpSemConversa` só libera lead sem conversa
quando a etapa tem template E ele cruzou o takeover, e o comentário do cron declara que "o ramo de
`alert_broker` continua exigindo conversa, para não virar rajada de notificação ao corretor". Até
esta story a garantia era **estrutural**: lead sem conversa que passava do gate tinha
`dias >= takeover` e caía sempre no ramo da Nicole.

A cascata que a 75-368 projetou como virtude rompia essa invariante — e não num canto raro, mas no
**caso principal do pedido**: lead novo de Meta Ads, sem conversa nenhuma, desligado para alguém
ligar na mão. O efeito seria o oposto do esperado: quem desliga buscando silêncio passaria a receber
alerta de lead parado. Confirmei que não havia guarda a jusante — `notifyBrokerOfStalledLead` não
olha conversa.

**A falha é da story, não da implementação.** A AC2 mandava preservar o `alert_broker` sem ressalvar
o caso sem-conversa, e o @dev entregou exatamente o pedido. O acoplamento com a 75-353 passou por mim
e pelo @po na validação.

**Correção:** `temConversa` entra na função pura; sem conversa a decisão é `"nada"`. A invariante da
75-353 deixa de ser acidental e passa a ser checada — mais forte do que era antes desta story.

**AC3 verificada explicitamente:** a correção não muda nenhum caminho existente. Para lead sem
conversa, `daysSinceLastContact === diasSemContatoPreliminar`, e o gate exige `>= takeover`; logo o
`else if` era inalcançável nesse caso. Prova completa no arquivo do gate.

### Concerns (3 · LOW · nenhum bloqueia)

- **C1 — CodeRabbit não executado.** Binário ausente (config aponta para WSL, host é macOS). É
  indisponibilidade de ferramenta, não review reprovado, e o @dev reportou em vez de omitir. Vale o
  @devops registrar que o gate automatizado não cobre esta máquina.
- **C2 — Migration 241 reemite o seed inteiro.** Delta contra a 227 traz também `leads.criar` para
  `gerente-comercial`/`sdr` (mudança já aplicada pela 228). Inerte por `ON CONFLICT DO NOTHING`.
- **C3 — `activities` grava mesmo no no-op.** Deliberado, espelha o `resume-ai`, `metadata.no_op`
  distingue.

### Validações independentes (rodadas por mim, sem cache)

| Validação | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| `vitest run` (regressão completa) | **247 arquivos / 3000 testes**, 6 expected-fail |
| `decidir-acao.test.ts` | 10/10 |
| Segurança (7º check) | `requireAuth`, `org_id` explícito na leitura **e** no UPDATE, `can()` no servidor com fallback para dono, body validado, sem SQL interpolado, sem segredo. Confirmei que a UI **não** é o único gate. |

## Change Log

| Data | Autor | O quê |
|------|-------|-------|
| 24/08/2026 | @sm (River) | Draft criado a partir do pedido do Marcos, com desenho já fechado por ele (botão silencia só a Nicole, alerta do corretor preservado, coluna como data). |
| 24/08/2026 | @po (Pax) | Validação de 10 pontos: **GO condicional, 7/10**. Lacunas corrigidas pelo @po: valor de negócio ausente (ponto 7), seção de Riscos inexistente (ponto 8), e AC5 com a rota não fixada (ponto 3 — `/api/leads/[id]/…` com reticências obrigaria o @dev a inventar o endpoint). Somada a investigação 6 (`conversations.is_ai_active` da Epic 63 já existe e cria risco de confusão de nomenclatura). Pós-correção **10/10** → Status Draft → Ready. |
| 24/08/2026 | @dev (Dex) | Implementada. 6 tarefas concluídas, regressão completa verde (247 arquivos / 2997 testes). Dois desvios documentados: migration 241 para a capability nova (D1) e extração da decisão para função pura (D2). CodeRabbit não executado — binário indisponível no host. Status Ready → Ready for Review. |
| 24/08/2026 | @qa (Quinn) | Gate FAIL por H1 (HIGH): a cascata da AC2 fazia lead sem conversa cair no `alert_broker`, quebrando invariante da 75-353 justamente no caso principal do pedido. Corrigido no mesmo ciclo (`temConversa` na função pura, 3 testes novos). AC3 verificada como intacta com prova. Re-review: **PASS** com 3 Concerns LOW. Status → Done (local), aguarda @devops. |
