# Story 87-1 — Governança do painel: quem mudou o prompt, quando, por quê, e como voltar

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Draft
**Origem:** extraída da Story **87-0** (era a AC5-A) no corte aprovado pelo Gabriel em 05/08/2026
**Criada por:** @sm (River) em 2026-08-05
**Executores:** @dev (server action, rota, migration) · @data-engineer (trigger + aplicação em prod)
**Depende de:** 87-0 (Tarefas 1 e 2 — snapshot e reconciliação). Não faz sentido versionar um
conteúdo que ainda vai ser reescrito.
**Não bloqueia a Onda 1.**

---

## Story

**Como** quem acabou de descobrir que o prompt de produção era um fork editado à mão, sem autor,
sem data e sem motivo,
**Quero** que toda escrita em `agent_prompts` registre **quem, quando e por quê**, e guarde a
versão anterior,
**Para que** a próxima divergência seja uma pergunta de 30 segundos (`quem mudou isso?`) em vez
de uma investigação de dois dias — e para que voltar atrás seja um `UPDATE`, não uma arqueologia.

---

## Context

A **D-87-0-a** (05/08) definiu que **o painel admin é a fonte da verdade** dos prompts da Nicole.
Isso resolve a ambiguidade, mas **transfere para o painel um trabalho que o git fazia de graça**:
histórico, autoria, motivo e rollback.

Enquanto o código era a fonte de fato, um `git log` respondia tudo. Agora não responde mais —
e a Story 87-0 documenta o custo exato disso:

- o `visit-scheduling` de produção não correspondia a **nenhum commit**, e até hoje **não se sabe
  quem o editou** em 2026-08-04 17:28 UTC (limitação nº 5 do @analyst: *"vale descobrir por quem
  e por quê antes de sobrescrever"*);
- a divergência sobreviveu **~4 meses** porque nada registrava que ela existia.

> **A 87-0 restaura a paridade uma vez. Esta story é o que impede a paridade de apodrecer de
> novo pelo lado do painel.** A outra metade da rede é o job de diff em CI (condição nº 10 do
> @architect, item de backlog `[CI] Job de diff de agent_prompts`, dependente de D5).

### As três superfícies de escrita (a AC precisa cobrir as três)

| # | caminho | quem usa | hoje registra motivo? |
|---|---|---|---|
| 1 | server action `savePromptAction` (`personalidade/page.tsx:17-38`) | **produto, no painel — o caminho real** | não |
| 2 | `PUT /api/admin/agent-prompts/[slug]` | integrações / uso programático | não |
| 3 | `scripts/seed-prompts.ts` | bootstrap | não (e é destrutivo — neutralizado pela AC12 da 87-0) |

> **[@po, C4 da validação da 87-0]** A AC original mirava só o caminho 2 — **que o painel não
> usa**. E o `visit-scheduling` foi editado **por fora dos três**, provavelmente via SQL/Management
> API. Por isso o histórico é recomendado **por trigger no banco**: é o único ponto por onde
> *toda* escrita passa, inclusive a que não vem da aplicação.

---

## Escopo

1. **Histórico de versões de `agent_prompts`**, alimentado por **trigger** (agnóstico ao caminho
   de escrita) — guarda conteúdo anterior, autor, timestamp e motivo.
2. **Motivo obrigatório** nos caminhos 1 e 2. Sem motivo, não grava.
3. **Rollback documentado**: restaurar uma versão anterior é um procedimento escrito e exercitado,
   não improviso.
4. **O painel mostra o histórico** — quem editou, quando e por quê, ao lado do campo.

### Fora de escopo

- **Job de diff em CI** — condição nº 10 do @architect, depende de **D5**, item de backlog próprio.
- **Reconciliação de conteúdo** — é a 87-0.
- **Fazer os campos órfãos valerem** — é a 87-2.
- **Aprovação/workflow de duas pessoas** para publicar prompt. Discutido e **deliberadamente fora**:
  a decisão D-87-0-a valoriza justamente a edição rápida sem deploy. O controle aqui é
  *rastreabilidade*, não *burocracia*. Se um dia for necessário, é story própria.
- **Versionar `agent_config`** (`personality_prompt`, `greeting_message`, …) — o destino desses
  campos é decidido na **87-2**; versionar antes de saber se vão existir é trabalho jogado fora.

---

## Acceptance Criteria

**AC1 — Toda escrita em `agent_prompts` deixa rastro, por qualquer caminho.**
Existe trigger em `agent_prompts` que, a cada `UPDATE` de `content`, grava a versão anterior.
*Verifica-se:* executar um `UPDATE` **direto por SQL/Management API** (o caminho que ninguém
controla) e confirmar que apareceu uma linha no histórico com o conteúdo **anterior**, o
timestamp e o autor disponível (`auth.uid()` quando houver). Este é o teste que importa: se
funciona por SQL cru, funciona pelos outros três.

**AC2 — Motivo é obrigatório no painel, e a mensagem de erro é útil.**
*Verifica-se:* salvar pela tela **sem** motivo → não grava (o `updated_at` do slug não muda) e a
tela mostra o porquê; salvar **com** motivo → grava, e o motivo aparece no histórico. Idem para
`PUT /api/admin/agent-prompts/[slug]`, que passa a exigir o campo e a responder **400** sem ele.

**AC3 — O histórico é legível por quem vai precisar dele às 23h de um sábado.**
*Verifica-se:* a tela de personalidade lista, por slug, as últimas N versões com **data, autor,
motivo** e um diff (ou o conteúdo anterior). Verificado por captura de tela anexada + teste da
consulta.

**AC4 — Rollback é procedimento, não improviso.**
*Verifica-se:* seguindo o runbook escrito nesta story, restaurar um slug para a versão anterior
e confirmar por `dump-agent-prompts --check` (script entregue pela 87-0) que o snapshot volta a
divergir/convergir conforme o esperado. Exercitado uma vez, com output colado.

**AC5 — Nenhuma regressão e nenhuma escrita perdida.**
*Verifica-se:* `npx vitest run`, `npm run type-check` e `npm run lint` sem erro novo; e o
`updated_at` dos 7 slugs **não muda** durante a implementação (a migration não pode tocar em
`content`).

---

## Dev Notes

- **Migration:** o maior prefixo local hoje é **215** (`215_meta_capi_outbox.sql`). Conferir no
  momento de criar e **aplicar por Supabase Management API**, arquivo inteiro num POST —
  `supabase db push` é proibido neste projeto (R-G do epic). Runbook existente.
- **Onde o painel escreve:** server action `savePromptAction`
  (`packages/web/src/app/dashboard/configuracoes/personalidade/page.tsx:17-38`), que faz
  `update({ content })` direto no Supabase com o client do servidor — **não** passa pela rota de
  API. Qualquer validação só na rota é validação que o produto nunca vê.
- **RLS:** a escrita em `agent_prompts` é admin-only desde a Story 53-2 (migration 096). A tabela
  de histórico precisa nascer com RLS coerente — leitura para admin, escrita só pelo trigger.
- **Autor:** o trigger deve tolerar `auth.uid()` nulo (escrita por service role / Management API),
  gravando algo como `system` em vez de falhar. **Uma escrita sem autor identificado precisa
  aparecer no histórico como tal** — é exatamente o caso do `visit-scheduling` de 04/08, e
  esconder isso derrotaria o propósito da story.
- **Não versione o conteúdo em arquivo aqui.** O snapshot em
  `packages/ai/src/prompts/_production/` é da 87-0 e continua sendo a cópia revisável no repo.
  Esta story cuida do histórico **dentro** do banco.

---

## Riscos

| # | risco | sev | mitigação |
|---|---|---|---|
| 1 | Trigger mal escrito **bloqueia escrita** de prompt em produção — no incidente seguinte, ninguém consegue corrigir a Nicole | **Alta** | Trigger só **grava histórico**, nunca valida nem rejeita; a obrigatoriedade do motivo vive na aplicação. Testar `UPDATE` por SQL antes de aplicar |
| 2 | Motivo obrigatório vira campo preenchido com "." e o histórico fica inútil | **Média** | Mínimo de caracteres + o motivo aparece na tela ao lado da versão (constrangimento social funciona melhor que validação) |
| 3 | Tabela de histórico cresce sem limite | **Baixa** | Prompt muda raramente (7 slugs, ~1 edição/mês). Sem política de expurgo por ora, registrado |

---

## Referências

- `docs/stories/87-0-paridade-reconciliacao-agent-prompts.story.md` — decisão **D-87-0-a**, a
  Nota de tensão sobre a CI, e o script `dump-agent-prompts --check` usado na AC4
- `docs/qa/po-validation-87-0.md` — correção **C4**: as três superfícies de escrita e a
  recomendação de trigger
- `docs/architecture/2026-08-05-validacao-epic-87.md` §6.3 item 3, §7 item 10
- Stories 53-1 (mecanismo de override) e 53-2 (painel admin-only, migration 096)

---

**CodeRabbit Integration**: Disabled (sem `coderabbit_integration` em `.aios-core/core-config.yaml`)

---

## Definition of Done

- [ ] AC1–AC5 verificadas, com output colado nas que exigem execução
- [ ] Migration aplicada em produção por Management API, prefixo conferido no momento
- [ ] Runbook de rollback escrito **e exercitado** uma vez
- [ ] @po validou · @qa deu gate · @devops fez o push

---

## Change Log

| data | quem | o que |
|---|---|---|
| 2026-08-05 | @sm | Story criada a partir da AC5-A da 87-0, no corte aprovado pelo Gabriel. Incorpora a correção **C4** do @po (as 3 superfícies de escrita; o painel usa server action, não a rota PUT; histórico por trigger porque o `visit-scheduling` foi editado por fora das três). |
