/**
 * Story 900-25 · AC3/AC3b — a config ISOLADA da Camada B (`tests/tenancy/**`).
 *
 * ## Por que uma config própria, e não um `include` a mais em `vitest.config.ts`
 *
 * `vitest.config.ts` roda em `pnpm test`, o gate rápido de todo PR: sem rede, sem credencial.
 * Acrescentar `tests/**` ao `include` de lá faria **todo** `pnpm test` tentar resolver
 * `TENANCY_TEST_SUPABASE_URL` — e um ambiente sem a credencial (contribuidor sem acesso ao
 * projeto Supabase, runner de CI sem o secret) veria o job vermelho por um motivo que não é dele.
 * Config isolada + script dedicado (`pnpm test:tenancy`) NOMEIA a diferença em vez de escondê-la
 * atrás de um `describe.skipIf` dentro do gate de todo mundo.
 *
 * ## O 12º instrumento cego (D2 do parecer do `@po`) e o loader abaixo
 *
 * Medido pelo `@po` executando a config da v0.1: **o Vitest não lê nenhum `.env` deste
 * repositório**. `.env.teste` não é um nome que o Vite carregue sozinho (ele carrega
 * `.env`/`.env.local`/`.env.[mode]`), e quem lê `.env.teste` é `scripts/lib/db-env.ts`, que esta
 * suíte não usa. Resultado medido: `TENANCY_TEST_SUPABASE_URL` chegava `undefined` dentro do
 * teste, a guarda de skip disparava, e `pnpm test:tenancy` saía **exit 0 com zero asserção
 * executada** — escondendo dois `expect(1).toBe(2)` propositalmente falsos.
 *
 * O loader abaixo roda no processo que sobe os workers, ANTES de qualquer teste: quando os
 * workers herdam o ambiente, `process.env` já está populado. `process.env` VENCE o arquivo —
 * mesma precedência de `scripts/lib/db-env.ts`, para `TENANCY_TEST_SUPABASE_URL=... pnpm
 * test:tenancy` continuar sendo a forma de apontar para outro lugar sem editar arquivo.
 */
import { defineConfig } from "vitest/config"
import { existsSync, readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import path from "node:path"

const RAIZ = __dirname
const ARQUIVO_ENV_TESTE = path.resolve(RAIZ, ".env.teste")

if (existsSync(ARQUIVO_ENV_TESTE)) {
  // Menor 6 do parecer (rodada 2): `node:util.parseEnv` só existe a partir do Node 20.12/21.7.
  // Este projeto roda em Node 25, mas `.claude/CLAUDE.md` documenta "Node 18+" como requisito —
  // divergência maior que esta story (registrada no Dev Agent Record para o `@devops`). Sem esta
  // guarda o sintoma num Node antigo seria "parseEnv is not a function" no meio do boot do
  // Vitest, longe da causa.
  if (typeof parseEnv !== "function") {
    throw new Error(
      "tests/tenancy: node:util.parseEnv indisponível — requer Node 20.12+/21.7+. " +
        `Versão atual: ${process.version}.`,
    )
  }
  const doArquivo = parseEnv(readFileSync(ARQUIVO_ENV_TESTE, "utf-8"))
  for (const [chave, valor] of Object.entries(doArquivo)) {
    if (process.env[chave] === undefined) process.env[chave] = valor as string
  }
}

export default defineConfig({
  resolve: {
    alias: {
      "@web": path.resolve(RAIZ, "packages/web/src"),
      // Correção D1 do parecer do `@po` — SEM este alias, `@trifold/shared/constants/supabase-refs`
      // não resolve a partir de `tests/`: `tests/` na raiz não está dentro de nenhum pacote do
      // workspace (`node_modules/@trifold/` não existe na raiz; o link real só existe em
      // `packages/web/node_modules/@trifold/shared`), e `packages/shared/package.json` não tem
      // campo `exports`. O alias de string do Vite reescreve o prefixo para dentro de `src/`,
      // igual ao `@web` já faz. Vivacidade provada por `alias-vivo.test.ts`.
      "@trifold/shared": path.resolve(RAIZ, "packages/shared/src"),
      "server-only": path.resolve(RAIZ, "packages/web/src/__mocks__/server-only.ts"),
      // ── Os dois abaixo NÃO estavam na AC3, e a razão de existirem foi MEDIDA, não suposta:
      // `ls node_modules/next` e `ls node_modules/@supabase` na raiz → **não existem** (o pnpm
      // instala as duas dentro de `packages/web/node_modules`). Sem estes aliases, um teste em
      // `tests/tenancy/` que importa `NextRequest` ou `createClient` falha em RESOLUÇÃO, não em
      // asserção. Apontar para o mesmo caminho que `packages/web` resolve é o que garante que o
      // `next/server` do teste e o do handler sob teste sejam o MESMO módulo — condição para o
      // `vi.mock("next/server")` do teste alcançar o `after()` da rota.
      "@supabase/supabase-js": path.resolve(RAIZ, "packages/web/node_modules/@supabase/supabase-js"),
      next: path.resolve(RAIZ, "packages/web/node_modules/next"),
    },
  },
  test: {
    include: ["tests/tenancy/**/*.test.ts"],
    // Integração com rede + service-role real: sequencial, sem paralelismo entre arquivos — dois
    // arquivos rodando `provision_org("Org A", "org-a-…")` ao mesmo tempo colidiriam no slug.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
