# Runbook — voltar atrás num prompt da Nicole (`agent_prompts`)

**Story:** 87-1 · **AC4** · criado por @dev (Dex) em 2026-08-11
**Quando usar:** um prompt foi editado e o resultado está errado — a Nicole diz algo que
não devia, ou o texto tem um defeito que já chegou a uma lead.
**Tempo:** ~5 minutos. **Quem pode:** quem tem acesso ao painel admin (opção A) ou a
Management API do Supabase (opção B).

---

## Antes de tudo: qual é o alvo?

> 🔴 **A regra que este runbook existe para impor: restaure sempre a partir da linha do
> histórico (`agent_prompt_versions`), e leia o conteúdo antes de escrevê-lo.**
>
> O **snapshot commitado** (`packages/ai/src/prompts/_production/`) só é alvo de rollback
> quando o `npm run prompts:check` estiver **verde**. Em 10/08/2026 ele estava vermelho em
> 3 de 7 slugs, e restaurar `property-presentation` por ele teria reintroduzido o cabeçalho
> `### YARDEN RESIDENCE` — o erro que queimou 4 dias de conversa com uma lead — além de
> desfazer a reescrita da Tarefa 2 da 87-0. **Voltar atrás para um estado que ninguém olhou
> é o mesmo incidente com outro sinal.**

| situação | alvo |
|---|---|
| a edição ruim tem linha em `agent_prompt_versions` | `previous_content` **daquela linha** (o caminho normal) |
| não há histórico (edição anterior a 11/08/2026) e `prompts:check` está **verde** | o `.txt` do snapshot |
| não há histórico e `prompts:check` está **vermelho** | ❌ **pare.** Reconstrua o texto à mão e trate como edição nova, com motivo |

---

## Passo 0 — Ver o que aconteceu

Pelo painel: `/dashboard/configuracoes/personalidade`. Cada prompt mostra o selo de
paridade e as últimas 5 edições, com **data, autor, motivo** e a primeira linha divergente.

Por SQL (Management API, projeto `dsopqkqjkmhytudaaolv`):

```sql
select id, to_char(created_at,'YYYY-MM-DD HH24:MI:SS') as quando,
       change_reason, author_label,
       char_length(previous_content) as chars_antes,
       char_length(new_content)      as chars_depois
  from agent_prompt_versions
 where slug = '<SLUG>'
 order by created_at desc
 limit 10;
```

> `author_label = 'system'` e `change_reason = null` significam **escrita fora do painel**
> (SQL cru, Management API, migration, script). Isso é achado, não ruído — foi assim que o
> `visit-scheduling` de 04/08/2026 apareceu em produção sem commit nenhum.
>
> **Detector de escrita sem histórico:** se `previous_content` de uma linha **não** for
> igual ao `new_content` da linha anterior, houve um `UPDATE` que o trigger não conseguiu
> registrar (ele engole a falha de propósito — ver Risco 1 da story — e deixa um
> `RAISE WARNING` no log do Postgres). O buraco fica visível na sequência de tamanhos.

## Passo 1 — Escolher a versão

```sql
select id, previous_content
  from agent_prompt_versions
 where slug = '<SLUG>'
 order by created_at desc
 limit 1;
```

## Passo 2 — 🔴 LER o conteúdo que vai virar produção (obrigatório)

Não pule. Cole o `previous_content` e leia. Confira, no mínimo:

- **nomes de empreendimento** batem com o cadastro (`Yarden`, não `Yarden Residence`;
  `Vind Residence`; `Japurá`; `Solum`);
- não há **fatos de empreendimento** (preço, metragem, data de entrega) escritos no prompt —
  eles vêm do bloco de dados do cadastro (decisões D-87-0-b/f);
- não há empreendimento **fora de venda** sendo apresentado.

Se algo estiver errado, **não restaure**: corrija o texto e salve pelo painel como edição
nova, com motivo. Rollback não é desculpa para pular revisão.

## Passo 3 — Restaurar

**Opção A — pelo painel (preferida).** Copie o `previous_content`, cole no campo do slug,
escreva o motivo (ex.: `rollback da edição de 11/08 14:20 — reintroduzia nome errado`) e
salve. Fica com autor identificado.

**Opção B — por SQL** (quando o painel não está acessível). O motivo vai no **mesmo**
`UPDATE`, senão o histórico registra a restauração sem justificativa:

```sql
update agent_prompts
   set content = (select previous_content from agent_prompt_versions where id = '<ID_DA_LINHA>'),
       last_change_reason = 'rollback da edicao de <QUANDO> — <POR QUE>'
 where slug = '<SLUG>'
   and org_id = '00000000-0000-0000-0000-000000000001';
```

> ⚠️ **Nunca** use `scripts/seed-prompts.ts` nem `npm run seed` para "restaurar". Eles
> sobrescrevem os 7 slugs (o `run-seed` com `[placeholder — Story 3.x]`) e são
> bootstrap-only desde a AC2-b.

## Passo 4 — Conferir

```bash
npm run prompts:check
```

- **verde** → o repositório já descrevia este texto. Acabou.
- **vermelho neste slug** → o texto restaurado é diferente do que está commitado. Regrave o
  espelho e **commite no mesmo dia** (AC7-(iii)):

```bash
npx tsx scripts/dump-agent-prompts.ts --write   # ou: npm run prompts:write
```

## Passo 5 — Registrar

Uma linha no canal do time: slug, o que voltou, por quê, e o link do commit do snapshot.
O histórico responde "quem/quando/por quê"; ele não avisa ninguém sozinho.

---

## Exercício executado (AC4) — 2026-08-11, produção

Alvo: **`off-hours`** — escolhido de propósito por ser um dos dois slugs **órfãos**
(`packages/ai/src/config-surfaces.test.ts`): ele não chega ao system prompt, então nem
durante o exercício a Nicole ficou exposta.

**Passo 0/1 — o histórico depois de 4 `UPDATE`s de teste por SQL cru:**

```
hora      | change_reason                                    | author_label | prev | novo
11:09:08  | (null)                                           | system       |  327 |  363
11:09:46  | teste 87-1: o motivo viaja no mesmo UPDATE        | system       |  386 |  412
11:09:47  | (null)                                           | system       |  412 |  455
11:10:24  | rollback exercitado pelo runbook 87-1 (AC4)…      | system       |  455 |  327
```

Três coisas ficam provadas de graça neste extrato:

1. `UPDATE` por SQL cru **sem motivo** ainda grava histórico (`change_reason` nulo,
   `author_label = system`) — a restrição inegociável das Dev Notes;
2. o motivo **não é herdado**: o `UPDATE` das 11:09:47 não tocou em `last_change_reason`, e
   o histórico registrou `null` em vez de repetir o motivo das 11:09:46;
3. o salto `363 → 386` (o `novo` de uma linha ≠ o `prev` da seguinte) é a **escrita cuja
   linha de histórico se perdeu** — foi o teste do Risco 1, em que forcei o `INSERT` do
   histórico a falhar com um `CHECK (false)`: **o `UPDATE` do prompt gravou assim mesmo**
   (386 chars) e o histórico ficou em 1 linha. Prompt não gravado seria inaceitável;
   histórico perdido é o preço, e ele é detectável.

**Passo 2 — alvo lido antes de escrever:** mensagem de fora do horário, 327 chars, sem
nome de empreendimento e sem fato de cadastro. Aprovado.

**Passo 3/4 — restauração e conferência:**

```
md5 do alvo (antes de tudo):  a6f042a0582d112527c932acd35570a0
md5 depois do rollback:       a6f042a0582d112527c932acd35570a0   ✅ byte a byte

$ npx tsx scripts/dump-agent-prompts.ts --check
✅ agent_prompts == snapshot (7 slugs, org 00000000-0000-0000-0000-000000000001)
```

**Efeito colateral registrado (AC5):** `off-hours.updated_at` saiu de
`2026-08-10 13:50:52.301487+00` para `2026-08-11 11:10:24.31699+00`. O `content` é
idêntico, e há **4 linhas de histórico explicando cada escrita** — que é exatamente o que a
AC5 pede ("se algum divergir sem uma linha de histórico explicando, a AC5 falhou"). Os
outros 6 slugs seguem no baseline de 10/08.
