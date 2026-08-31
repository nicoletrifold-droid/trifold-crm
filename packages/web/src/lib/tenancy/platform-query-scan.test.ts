/**
 * Story 900-22b — AC-B4: o detector de leitura crua e a varredura dos dois diretórios de
 * plataforma.
 *
 * ONDE ESTE ARQUIVO MORA E POR QUÊ: em `lib/tenancy/`, ao lado do detector e da fixture, e
 * **fora** dos dois diretórios varridos. O `it` de varredura real espera `[]`; se este arquivo
 * (que contém `db.from("leads")` como fixture inline) estivesse dentro de `app/platform/**`, a
 * régua se leria a si mesma e nunca ficaria verde. A exclusão de `*.test.ts` no walker abaixo
 * existe pelo mesmo motivo — cinto e suspensório de propósito, para que a segurança não dependa
 * de uma única linha.
 */
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { detectRawTableReads, detectEmbeddedTableReads } from "./platform-query-scan"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(AQUI, "../..") // packages/web/src

/** Os dois diretórios que a AC-B4 manda varrer. */
const DIRETORIOS_VARRIDOS = [
  path.join(SRC, "app/api/platform"),
  path.join(SRC, "app/platform"),
]

/**
 * Restrito a `.ts`/`.tsx` de propósito: um `.md`/`.json` com um trecho de exemplo de código
 * dentro de `app/platform/**` não é acesso a banco e não deve acender. Sem essa restrição, a
 * reação natural ao ruído seria afrouxar as EXCLUSÕES — que é justamente o que não pode
 * acontecer, porque são elas que impedem a régua de se ler a si mesma.
 *
 * Excluímos `*.test.ts`/`*.test.tsx`, `__tests__/` e `__fixtures__/`: código de teste carrega
 * chamadas cruas como fixture literal, de propósito. NÃO REMOVER — sem essas exclusões, um
 * teste futuro colocado dentro dos diretórios varridos deixaria esta suíte permanentemente
 * vermelha e o próximo dev "consertaria" apagando a régua.
 */
function arquivosVarridos(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const alvo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (entrada.name === "__tests__" || entrada.name === "__fixtures__") continue
      arquivosVarridos(alvo, acc)
      continue
    }
    if (!/\.tsx?$/.test(entrada.name)) continue
    if (/\.test\.tsx?$/.test(entrada.name)) continue
    acc.push(alvo)
  }
  return acc
}

describe("detectRawTableReads — formas que o repositório realmente produz (AC-B4 item 1)", () => {
  it("literal numa linha só", () => {
    expect(detectRawTableReads(`const r = db.from("leads").select("id")`)).toEqual(["leads"])
  })

  it("argumento quebrado em várias linhas", () => {
    const fonte = `const r = db.from(
  "leads"
)`
    expect(detectRawTableReads(fonte)).toEqual(["leads"])
  })

  it("receiver na linha ANTERIOR (forma dominante do repositório — 1.511 ocorrências)", () => {
    const fonte = `const { data } = await db
  .from("leads")
  .select("id")`
    expect(detectRawTableReads(fonte)).toEqual(["leads"])
  })

  it("receiver como CHAMADA — é a forma da mutação nomeada na AC-B3", () => {
    expect(detectRawTableReads(`createAdminClient().from("leads").select("id")`)).toEqual([
      "leads",
    ])
  })

  it("homônimos da stdlib não acendem", () => {
    const fonte = `const a = Buffer.from("hex")
const b = Array.from([1, 2, 3])`
    expect(detectRawTableReads(fonte)).toEqual([])
  })

  it("fonte sem acesso a tabela devolve lista vazia", () => {
    expect(detectRawTableReads(`export const x = 1`)).toEqual([])
  })
})

describe("AC-B4 item 3 — fixture commitado do orgs/page.tsx ANTES desta story", () => {
  it("o detector pega as duas leituras cruas que existiam até este PR", () => {
    const fixture = fs.readFileSync(
      path.join(AQUI, "__fixtures__/orgs-page-pre-900-22b.txt"),
      "utf8",
    )
    expect(detectRawTableReads(fixture)).toEqual(["organizations", "users"])
  })
})

describe("AC-B3 — orgs/page.tsx passou a ler por platformQuery", () => {
  const PAGE = path.join(SRC, "app/platform/orgs/page.tsx")

  it("não importa mais o client de service-role direto", () => {
    const fonte = fs.readFileSync(PAGE, "utf8")
    const importsCrus = fonte
      .split("\n")
      .filter((l) => /^import\b/.test(l.trim()) && /createAdminClient/.test(l))
    expect(importsCrus).toEqual([])
  })

  it("importa platformQuery", () => {
    const fonte = fs.readFileSync(PAGE, "utf8")
    expect(fonte).toMatch(/^import \{ platformQuery \} from "@web\/lib\/tenancy\/platform-query"$/m)
  })

  it("o detector não encontra nenhuma leitura crua no arquivo", () => {
    expect(detectRawTableReads(fs.readFileSync(PAGE, "utf8"))).toEqual([])
  })

  // REL-001 (gate @qa): o desempate `created_at ASC` de `ensureAdminInvited` só vale se a
  // LEITURA usar o mesmo critério — senão o badge aponta para uma linha e o "Reenviar" age
  // sobre outra, produzindo `400 NO_PENDING_INVITE` sem explicação na org "Trifold" legada,
  // que tem mais de um `role='admin'`. Régua estática porque `page.tsx` é server component
  // sem harness; o que ela impede é a linha sumir num refactor sem ninguém notar.
  it("a consulta dedicada de admin desempata pelo mesmo critério da escrita", () => {
    const fonte = fs.readFileSync(PAGE, "utf8")
    const consulta = fonte.slice(fonte.indexOf('platformQuery("users", "org_id, id, auth_id")'))
    expect(consulta).toMatch(/\.eq\("role", "admin"\)/)
    expect(consulta).toMatch(/\.order\("created_at", \{ ascending: true \}\)/)
  })
})

describe("AC-B4 item 2 — varredura da árvore real", () => {
  it("nenhum `.from(<literal>)` cru sobrevive em app/platform/** e app/api/platform/**", () => {
    const achados: Array<{ arquivo: string; tabelas: string[] }> = []
    for (const dir of DIRETORIOS_VARRIDOS) {
      for (const arquivo of arquivosVarridos(dir)) {
        const tabelas = detectRawTableReads(fs.readFileSync(arquivo, "utf8"))
        if (tabelas.length > 0) {
          achados.push({ arquivo: path.relative(SRC, arquivo), tabelas })
        }
      }
    }
    expect(achados).toEqual([])
  })

  it("a varredura de fato olha para arquivos (guarda de vivacidade — sem isto, `[]` seria trivial)", () => {
    const total = DIRETORIOS_VARRIDOS.reduce(
      (n, dir) => n + arquivosVarridos(dir).length,
      0,
    )
    expect(total).toBeGreaterThan(0)
  })
})

/**
 * Story 900-42a (SEC-001) — a segunda rede passa a enxergar embedding.
 *
 * Até esta story a varredura só procurava `.from(<literal>)`. Embedding do PostgREST vaza
 * linhas de outra tabela SEM emitir `.from()` nenhum, então passava invisível pelas duas redes
 * ao mesmo tempo. O bloco abaixo mede as duas direções: o que TEM de acender e o que NÃO PODE
 * acender. Só o primeiro sentido deixaria uma régua que recusa tudo passar por correta — e ela
 * pararia o painel inteiro na primeira consulta legítima.
 */
describe("detectEmbeddedTableReads — o que TEM de acender (900-42a)", () => {
  it("embedding com colunas nomeadas — a forma que vazava PII de lead", () => {
    const fonte = `const r = await platformQuery("organizations", "id, leads(name, phone)")`
    expect(detectEmbeddedTableReads(fonte)).toHaveLength(1)
  })

  it('embedding com "*" dentro', () => {
    expect(
      detectEmbeddedTableReads(`platformQuery("organizations", "id, users(*)")`),
    ).toHaveLength(1)
  })

  it("argumentos quebrados em várias linhas (forma que o Prettier produz)", () => {
    const fonte = `const { data } = await platformQuery(
  "organizations",
  "id, leads(name, phone)",
)`
    expect(detectEmbeddedTableReads(fonte)).toHaveLength(1)
  })

  it("`.select()` encadeado, não só `platformQuery()` — quem escapar do caminho sancionado", () => {
    expect(detectEmbeddedTableReads(`qualquerBuilder.select("id, leads(name)")`)).toHaveLength(1)
  })

  it("sintaxe de agregado também acende — é forma de embedding (AC8)", () => {
    expect(detectEmbeddedTableReads(`platformQuery("organizations", "id, users(count)")`))
      .toHaveLength(1)
  })
})

describe("detectEmbeddedTableReads — o que NÃO PODE acender (controle negativo, 900-42a)", () => {
  it("os columns REAIS dos call sites de produção não acendem", () => {
    // Levantados por `git grep -n "platformQuery(" -- packages/web/src` em 2026-08-31.
    const fonte = `
      await platformQuery("organizations", "id").eq("id", orgId).maybeSingle()
      await platformQuery("org_integrations", "provider, status", orgId)
      await platformQuery("platform_audit_log", "id, actor_type, org_id, action, metadata", orgId)
      await platformQuery("organizations", "id, admin_invite_email")
      await platformQuery("users", "id, auth_id, email")
      await platformQuery(
        "organizations",
        "id, name, slug, google_oauth_tokens",
      )
      await platformQuery("organizations", "id, name, slug, is_active, created_at, admin_invite_email")
      await platformQuery("users", "org_id")
      await platformQuery("users", "org_id, id, auth_id")
      await platformQuery("whatsapp_config", "status, phone_number_id, updated_at", orgId)
    `
    expect(detectEmbeddedTableReads(fonte)).toEqual([])
  })

  it("`platformQuery()` citado em prosa (parênteses vazio) não acende", () => {
    const fonte = `// As leituras passam por \`platformQuery()\` — este arquivo está em app/platform/**`
    expect(detectEmbeddedTableReads(fonte)).toEqual([])
  })

  it("encadeamento depois da chamada não acende", () => {
    const fonte = `await platformQuery("users", "org_id, id, auth_id")
  .eq("role", "admin")
  .order("created_at", { ascending: true })`
    expect(detectEmbeddedTableReads(fonte)).toEqual([])
  })

  it("fonte sem chamada nenhuma devolve lista vazia", () => {
    expect(detectEmbeddedTableReads(`export const x = 1`)).toEqual([])
  })
})

describe("900-42a — varredura da árvore real por embedding", () => {
  it("nenhum embedding sobrevive em app/platform/** e app/api/platform/**", () => {
    const arquivos = DIRETORIOS_VARRIDOS.flatMap((dir) => arquivosVarridos(dir))

    // GUARDA DE VIVACIDADE, no mesmo `it` de propósito: se o walker devolvesse `[]`, o
    // `expect(achados).toEqual([])` abaixo ficaria verde por VACUIDADE — aprovando o vazio em
    // vez de aprovar a árvore. Separar em outro `it` deixaria os dois poderem divergir.
    expect(arquivos.length).toBeGreaterThan(0)

    const achados: Array<{ arquivo: string; trechos: string[] }> = []
    for (const arquivo of arquivos) {
      const trechos = detectEmbeddedTableReads(fs.readFileSync(arquivo, "utf8"))
      if (trechos.length > 0) achados.push({ arquivo: path.relative(SRC, arquivo), trechos })
    }
    expect(achados).toEqual([])
  })

  it("o detector está VIVO contra o corpus real, não só contra fixture sintética", () => {
    // Envenenar um arquivo REAL da árvore varrida e exigir que acenda. Sem isto, o `[]` do
    // teste acima provaria "a árvore está limpa" tanto quanto "o detector está morto" — e um
    // detector morto é indistinguível de uma árvore limpa até o dia em que vaza.
    const arquivos = DIRETORIOS_VARRIDOS.flatMap((dir) => arquivosVarridos(dir))
    expect(arquivos.length).toBeGreaterThan(0)

    const fonteLimpa = fs.readFileSync(arquivos[0] as string, "utf8")
    expect(detectEmbeddedTableReads(fonteLimpa)).toEqual([])

    const fonteEnvenenada = `${fonteLimpa}\nconst vazamento = platformQuery("organizations", "id, leads(name, phone)")\n`
    expect(detectEmbeddedTableReads(fonteEnvenenada)).toHaveLength(1)
  })
})
