---
name: env-local-desta-maquina-aponta-producao
description: packages/web/.env.local EXISTE nesta máquina apontando para produção com service-role key, e .env.development não existe — o CLAUDE.md declara o contrário
metadata:
  type: project
---

`packages/web/.env.local` **existe** nesta máquina (807 bytes, 30/07/2026 — anterior à Story
900-3b), aponta para o Supabase de **produção** (`dsopqkqjkmhytudaaolv`) e carrega
`SUPABASE_SERVICE_ROLE_KEY`. E `packages/web/.env.development` **não existe**.

**Why:** o `CLAUDE.md` afirma que "`.env.local` não existe mais (renomeado para
`.env.producao.local`)" e que o default do repositório é teste. Nesta máquina isso é **falso**:
`.env.local` vence qualquer outro arquivo de env no Next, então `pnpm dev` roda contra
**produção** — exatamente o risco que a 900-3b declara eliminado. Descoberto por acidente na
Story 75-373, ao tentar `pnpm --filter @trifold/web build:teste`, que sai **exit 1** por falta do
`.env.development`. Reportado como `ENV-001` (alto, ambiente) no gate da 75-373; não é defeito de
story nenhuma.

**How to apply:**
- **Nunca** rode `next build` nu nem `pnpm dev` nesta máquina para "medir" algo, enquanto esse
  arquivo existir — o alvo é produção, e o `CLAUDE.md` não avisa.
- Se um @dev relatar "`next build` não rodado", verifique a causa antes de cobrar: aqui a causa é
  ambiente, não preguiça, e `build:teste` (o caminho seguro, que força `.env.development`) está
  quebrado por falta do arquivo.
- Substituto legítimo para "o build compila" quando o build não é rodável: precedente do padrão em
  `origin/main` (arquivo `"use client"` que já exporta helper não-componente e está em produção)
  **mais** prova de que nenhuma aresta nova de import chega a código de servidor.
- Verificar antes de assumir que foi consertado: `ls -la packages/web/ | grep env`.
