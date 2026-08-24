# QA Gate — Story 75-368 (Follow-up da Nicole por lead)

**Revisor:** @qa (Quinn) · **Data:** 24/08/2026
**Branch:** `feature/75-368-follow-up-nicole-por-lead` · **Commit revisado:** `65d8ee0f`

## Decisão: FAIL → corrigido → **PASS** (re-review 24/08, commit `65d8ee0f` + fix)

O gate abriu **FAIL** por uma issue HIGH (H1, abaixo). O @dev corrigiu no mesmo ciclo e eu
re-revisei. **Veredito final: PASS**, com 3 Concerns LOW que não bloqueiam.

Não é problema de qualidade geral — a implementação está boa e a regressão está verde. É **um caso
concreto**, e ele cai justamente no uso principal que o Marcos descreveu ao pedir a feature.

---

## H1 (HIGH) — Lead sem conversa passa a gerar `alert_broker`, contra invariante explícita da 75-353

**Onde:** `packages/web/src/app/api/cron/followup/route.ts:300-307` (o gate
`podeFollowUpSemConversa`) versus a nova decisão em `:373`.

**A invariante que existe hoje.** `podeFollowUpSemConversa` (`lib/followup/template-fallback.ts:141`)
deixa passar um lead **sem conversa** apenas quando a etapa tem `hsm_template` **e** o lead cruzou o
`nicole_takeover_days`. O comentário no cron declara o motivo, palavra por palavra:

> "O ramo de `alert_broker` continua exigindo conversa, para não virar rajada de notificação ao
> corretor."

Antes da 75-368 essa garantia era **estrutural, não checada**: um lead sem conversa que passasse do
gate tinha, por construção, `dias >= nicole_takeover_days` — então caía sempre no `if` da Nicole e
nunca alcançava o `else if` do alerta.

**O que a 75-368 quebra.** A cascata que a story projetou como virtude é o que rompe a invariante.
Com `nicole_followup_off_at` preenchida, `decidirAcaoDoFollowUp` devolve `"alerta"`, e o lead **sem
conversa** agora entra no ramo que estava proibido de alcançar.

**Por que não é canto raro.** É o cenário que o Marcos descreveu como principal: lead novo de Meta
Ads, que ainda não trocou mensagem nenhuma, desligado para ele mesmo ligar. Lead novo não tem
conversa. E a etapa "1º Contato" é candidata natural a ter `hsm_template`, que foi exatamente o que a
75-353 configurou. Os três ingredientes se encontram no uso normal.

**Efeito observável.** Quem desliga o follow-up de um lead novo esperando silêncio passa a receber
notificação de lead parado por um lead que nunca conversou. Verifiquei que **não há** guarda de
salvamento a jusante: `notifyBrokerOfStalledLead` não olha conversa (zero ocorrências de
`conversation`/`temConversa` no arquivo).

**Correção sugerida (pequena).** `decidirAcaoDoFollowUp` passa a receber `temConversa` e devolve
`"nada"` — não `"alerta"` — quando não há conversa. A regra fica no mesmo lugar puro e testável, e a
invariante da 75-353 passa a ser **checada** em vez de acidental, que é melhor do que era antes.

### RESOLVIDO — verificação da correção

O @dev aplicou exatamente isso. Fui conferir a única coisa que me preocupava na correção: **ela muda
comportamento para lead LIGADO?** Isso violaria a AC3.

**Não muda, e é demonstrável.** Para lead sem conversa, `lastMessage` é null, então
`lastContactRef = last_contact_at ?? null ?? referenciaDeContato` — e `referenciaDeContato` é
`last_contact_at ?? created_at ?? now`. Nos dois ramos o valor coincide, logo
`daysSinceLastContact === diasSemContatoPreliminar`. Como `podeFollowUpSemConversa` só deixa passar
lead sem conversa que já cruzou o takeover, esse lead **sempre** satisfaz `dias >= takeover` e cai no
ramo da Nicole. **O `else if` era estruturalmente inalcançável para lead sem conversa.**

Ou seja: a correção não altera nenhum caminho que existia — apenas impede o caminho novo que a
75-368 teria aberto. O teste que cobre esse estado está anotado no arquivo como não alcançável em
produção, para ninguém no futuro ler como mudança de comportamento.

**Cobertura:** 3 testes novos (10 no total no arquivo). Regressão completa reconferida por mim sem
cache: **247 arquivos / 3000 testes passando**, 6 expected-fail.

---

## Os 7 checks

| # | Check | Resultado |
|---|-------|-----------|
| 1 | Code review — padrões, legibilidade | **PASS.** A extração para função pura (D2) é a decisão certa e segue a 75-353. Comentários explicam o *porquê*, não o *o quê*. A troca do `else if` para `acao === "alerta"` preserva a ordem e a semântica. |
| 2 | Testes unitários | **PASS após o fix.** (era CONCERNS) 7/7 passando e as bordas certas cobertas (incl. `takeover == alert`). O eixo "tem conversa" não existia na função, e por isso o teste não podia falhar — foi assim que o H1 passou pelo @dev. Corrigido: a dimensão agora existe e tem 3 casos. |
| 3 | Acceptance criteria | **PASS com ressalva.** AC1..AC6 atendidas ao pé da letra. A AC2 diz "continua criando `alert_broker`" sem ressalvar o caso sem-conversa — o @dev implementou o que a story pediu. **A falha é da story, não do @dev**, e é minha e do @po por não termos visto o acoplamento com a 75-353 na validação. |
| 4 | Sem regressões | **PASS.** 247 arquivos / 2997 testes verdes, reconferido por mim sem cache. Com `nicole_followup_off_at` NULL a decisão é byte a byte a de antes (AC3). |
| 5 | Performance | **PASS.** Uma coluna a mais no `select` que já roda; nenhuma query nova no cron. Índice parcial correto para a cardinalidade. A rota faz 1 SELECT + no máximo 1 UPDATE + 1 INSERT. |
| 6 | Segurança | **PASS.** `requireAuth()`, `org_id` explícito na leitura **e** no UPDATE, `can()` no servidor com fallback para dono do lead, body validado (`typeof === "boolean"`, JSON malformado tratado), sem interpolação de string em SQL, sem segredo no código. Fui checar especificamente se a UI era o único gate — não é. |
| 7 | Documentação | **PASS.** Migrations com `COMMENT`, rollback plan e a justificativa de por que não reaproveitar `marketing_optout_at` nem `is_ai_active`. Dev Agent Record honesto sobre os dois desvios. |

## Concerns (não bloqueiam)

- **C1 (LOW) — CodeRabbit não executado.** Binário ausente: a config aponta para WSL e o host é
  macOS. **Não bloqueia** — é indisponibilidade de ferramenta, não review reprovado, e o @dev reportou
  em vez de omitir. Vale ao @devops registrar que o gate automatizado não cobre esta máquina.
- **C2 (LOW) — Migration 241 reemite o seed inteiro.** Efeito colateral do gerador. Conferi o delta
  contra a 227: além das 10 linhas novas, aparecem `leads.criar` para `gerente-comercial` e `sdr` como
  `true` (mudança já aplicada pela 228). Inerte por `ON CONFLICT DO NOTHING`. Sem ação.
- **C3 (LOW) — `activities` grava mesmo no no-op.** Deliberado, espelha o `resume-ai`, e o
  `metadata.no_op` distingue. Pode inflar a tabela se alguém clicar repetido. Aceitável.

## Rastreabilidade (Given/When/Then)

| AC | Cenário | Coberto por |
|----|---------|-------------|
| AC2 | **Dado** lead desligado acima do takeover, **quando** o cron roda, **então** não envia | `decidir-acao.test.ts` — "desligado silencia a Nicole" |
| AC2 | **Dado** o mesmo lead, **então** o corretor ainda é alertado | "desligado AINDA alerta o corretor" |
| AC2 | **Dado** lead desligado **sem conversa**, **então** não alerta | **H1 — corrigido.** `decidir-acao.test.ts` — "desligado e SEM conversa" |
| AC3 | **Dado** lead ligado, **então** comportamento idêntico ao atual | 3 casos + regressão completa |
| AC6 | **Dado** desligado abaixo de `alert_days`, **então** nada | "borda" |
