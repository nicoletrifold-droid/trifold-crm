---
name: vercelignore-trap-qa
description: Import de packages/web para docs|scripts|bin|.aios-core|.claude|.github passa em build local, CI e testes e quebra SÓ no deploy da Vercel — como o @qa reproduz e prova essa classe de defeito
metadata:
  type: project
---

O `.vercelignore` da **raiz** do repo exclui `.turbo .git .aios-core .claude .gemini .codex .cursor
.antigravity .github docs scripts bin node_modules`. Qualquer import de `packages/web/src` que
aterrisse num desses diretórios é **verde em tudo que o time olha** (`pnpm build` local, CI do
GitHub, `pnpm test`, `pnpm type-check`) e **vermelho só no deploy da Vercel**, com
`Cannot find module` / `TS2307`.

**Why:** a Story `900-14` introduziu `import schemaSnapshot from
"../../../../../docs/audits/schema-snapshot.json"` em `packages/web/src/lib/supabase/org-scoped-admin.ts`.
Resultado: 3 deploys de produção em ERROR e produção parada ~37h (23/08 15:46 UTC → 24/08). A
`900-14b` foi o hotfix (codegen: `org-scoped-tables.generated.ts` dentro da árvore que a Vercel
envia). Depois do corte de escopo do usuário **não sobrou nenhuma regra de lint** impedindo a
reintrodução — a classe de defeito pode voltar.

**Por que o build quebra mesmo sem rota nenhuma importando o arquivo:**
`packages/web/next.config.ts` tem `typescript: { ignoreBuildErrors: false }` explícito e o
`tsconfig.json` inclui `**/*.ts`. O `next build` type-checa o projeto inteiro, alcançável ou não —
então o defeito vive na camada de type-check do build, não no bundling.

**How to apply — como reproduzir e provar (o que fiz na 900-14b):**
1. Mover `docs/` para fora da árvore (rename atômico no mesmo diretório; `trap`/`EXIT` para
   restaurar sempre) e rodar `npx tsc --noEmit` em `packages/web`. Deve dar **exit 0**.
2. **Sempre fazer a contraprova**: no mesmo cenário, criar uma sonda com o import antigo e conferir
   **exit != 0 com TS2307**. Sem ela, o `exit 0` pode significar apenas que o type-check não rodou.
3. Restaurar `docs/` e conferir `git status` idêntico ao inicial + sha256 de
   `docs/audits/schema-snapshot.json`.
4. Grep de regressão: imports de `packages/` aterrissando nesses diretórios. Mirar o **destino**,
   nunca a profundidade dos `../` — `app/api/cron/followup/notify-alert.test.ts:25` importa
   `"../../../../lib/broker/notify-stalled-lead"` legitimamente.

**Turbo mente por cache:** `pnpm type-check` / `pnpm lint` dão FULL TURBO (cache hit = replay, não
execução). Para gate, usar `npx turbo <task> --force` ou rodar a ferramenta direto.

Ver [[artefato-gerado-vs-template-qa]].
