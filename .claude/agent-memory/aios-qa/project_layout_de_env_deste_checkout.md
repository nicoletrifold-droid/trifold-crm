---
name: layout-de-env-deste-checkout
description: packages/web/.env.local NÃO existe mais (é .env.producao.local) — resolvido em 04/09/2026; e o .env.local da RAIZ é outro arquivo, com só VERCEL_OIDC_TOKEN
metadata:
  type: project
---

Substitui a medição anterior (`env-local-desta-maquina-aponta-producao`, 75-373), que **deixou de
valer**: em 04/09/2026 o rename foi feito nesta máquina e o layout agora bate com o `CLAUDE.md`.

Medido em 04/09/2026 (Story 900-69):

| Arquivo | Conteúdo / alvo |
|---|---|
| `packages/web/.env.development` | teste (`xnxvygyfyyyzwhiuoehz`) — é o que `pnpm dev` usa; tem `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` não-vazios |
| `packages/web/.env.producao.local` | produção (`dsopqkqjkmhytudaaolv`), herdou o conteúdo do antigo `.env.local`; **não tem `SIENGE_*`** |
| `packages/web/.env.local` | **não existe** |
| `.env.local` (RAIZ) | **1 variável só: `VERCEL_OIDC_TOKEN`** (gerada pela CLI da Vercel). `grep -ci supabase` → **0** |
| `.env.teste` / `.env.producao` (raiz) | par de `scripts/lib/db-env.ts` |

**Why:** a armadilha agora é de **homônimo**, não de alvo. Quem conferir com `ls -a | grep env` vê
um `.env.local` na raiz e conclui que um fix de caminho para `packages/web/.env.local` é
desnecessário — são arquivos diferentes. E `node --env-file=<inexistente>` **recusa iniciar**
(`not found`, exit **9**), enquanto os carregadores dotenv ad hoc dos scripts
(`try { readFileSync } catch { return false }`) **engolem o ENOENT** e falham uma linha depois numa
mensagem que não cita arquivo nenhum.

**How to apply:** `ls -a packages/web | grep env` responde outra pergunta que `ls -a | grep env` —
use o primeiro quando o assunto for o app Next. Para saber o alvo sem vazar valor:
`grep -o 'https://[a-z]*\.supabase\.co' <arquivo>`; para listar chaves: `grep -o '^[A-Z_]*=' <arquivo>`.
Reconferir por sessão: isso muda por máquina. Relacionado:
[[sentinela-de-exit-prova-carregamento-de-env]], [[project-migrations]].
