---
name: env-layout-deste-checkout
description: Layout de env deste working copy — packages/web/.env.local NÃO existe mais (é .env.producao.local); o default é teste, e existe um .env.local homônimo na RAIZ que não é o mesmo arquivo
metadata:
  type: project
---

Medido em 04/09/2026, **depois** do rename (a medição anterior desta memória, feita horas antes
no mesmo dia, dizia que só existia `packages/web/.env.local` apontando para produção — isso
**deixou de valer**; o rename foi feito e o CLAUDE.md passou a descrever a realidade):

| Arquivo | Alvo |
|---|---|
| `packages/web/.env.development` | `xnxvygyfyyyzwhiuoehz` (**teste**) — é o que `pnpm dev` usa |
| `packages/web/.env.producao.local` | `dsopqkqjkmhytudaaolv` (**produção**) — herdou o conteúdo do antigo `.env.local` |
| `.env.teste` (raiz) | teste — par de `scripts/`, lido por `scripts/lib/db-env.ts` |
| `.env.producao` (raiz) | produção — só sob `TRIFOLD_ENV=producao` (+ `TRIFOLD_ALLOW_PROD=1` se escreve) |

**`packages/web/.env.local` não existe.** Duas armadilhas que vêm disso:
1. **Existe um `.env.local` na RAIZ do repo** — arquivo diferente, não é o que os scripts antigos
   liam. Ver `ls -a packages/web \| grep env` antes de concluir qualquer coisa; `ls -a \| grep env`
   responde outra pergunta.
2. `node --env-file=<caminho inexistente>` **recusa iniciar** (`node: ...: not found`, exit 9) —
   não degrada em silêncio. Já os carregadores dotenv ad hoc dos scripts (`try { readFileSync }
   catch { return false }`) **engolem o ENOENT** e falham uma linha depois, numa mensagem que não
   menciona arquivo nenhum. Foi esse par de comportamentos que a Story 900-69 corrigiu.

**Why:** quem assumir o layout errado ou mede em produção pensando que é teste, ou conclui que um
script está quebrado por outro motivo. Todos os arquivos de env são gitignored (guardado pelo teste
`scripts/gitignore-env.test.ts`) e nunca podem entrar em commit.

**How to apply:** antes de medir "contra dado real", conferir alvo com
`grep -o 'https://[a-z]*\.supabase\.co' <arquivo>` — o ref na URL diz teste vs produção sem
ambiguidade. Reconferir a cada sessão: isso muda por máquina e por checkout. Para ler **nomes** de
chave sem vazar valor: `grep -o '^[A-Z_]*=' <arquivo>`.
Relacionado: [[prova-de-filtro-e-de-layout]], [[credencial-de-sienge-so-existe-em-producao]].
