# `_production/` — o que roda de verdade em `agent_prompts`

**Gerado. Não edite estes arquivos à mão.**

Estes `.txt` são uma cópia versionada da tabela `agent_prompts` de **produção**
(org `00000000-0000-0000-0000-000000000001`). Eles existem porque, sob a decisão
**D-87-0-a** (Gabriel, 05/08/2026), **o painel admin é a fonte da verdade** dos prompts
— as constantes em `packages/ai/src/prompts/*.ts` são apenas o **fallback de bootstrap**,
usado quando não há linha ativa com conteúdo (`prompts/index.ts:84-88`).

Sem esta pasta, o repositório não descreve o que a Nicole realmente diz, e não existe
diff revisável nem backup. Um fork editado à mão no slug `visit-scheduling` — que nunca
existiu em commit nenhum — custou um incidente com leads pagos.

## Editar um prompt

Pelo **painel** (`/dashboard/configuracoes/personalidade`). Editar o `.txt` daqui **não
muda nada em produção** — muda só o espelho, e faz o `--check` acusar uma divergência
que não existe.

Depois de salvar no painel, regrave e commite o snapshot no mesmo PR:

```bash
npx tsx scripts/dump-agent-prompts.ts --write
```

## Conferir se o repositório está em dia com a produção

```bash
npx tsx scripts/dump-agent-prompts.ts --check            # exit != 0 se divergir
npx tsx scripts/dump-agent-prompts.ts --check --verbose  # mostra a primeira linha divergente
```

## Normalização

Aplicada aos dois lados de qualquer comparação: `\r\n`/`\r` → `\n`, Unicode **NFC**,
`trim()`. Nada além disso — whitespace interno e pontuação são diferença de verdade.
Declarada e implementada em `packages/ai/src/prompts/snapshot.ts`, e repetida em
`manifest.json` (`normalization`).

`manifest.json` guarda `sha256`/`char_count` do conteúdo **normalizado** (bate com
`shasum -a 256 {slug}.txt`) e `raw_sha256`/`raw_char_count` do conteúdo **cru do banco**,
para a normalização ficar auditável.

> Nota: `char_count` é medido em unidades UTF-16 (JavaScript). O `char_length` do
> Postgres conta *code points* — então slugs com emoji aparecem 1–2 caracteres menores
> quando medidos no banco. Não é divergência.

## Rollback

Este snapshot **é** o backup (critério de rollback da story 87-0): restaurar = escrever
estes `content` de volta em `agent_prompts` via Management API.

> **Nunca rode `scripts/seed-prompts.ts`** para "restaurar": ele faz `upsert` dos 7 slugs
> a partir das constantes do código e apagaria o conteúdo reconciliado (AC12).

Origem: story `docs/stories/87-0-paridade-reconciliacao-agent-prompts.story.md`.
