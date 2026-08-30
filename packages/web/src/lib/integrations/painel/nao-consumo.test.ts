/**
 * Story 900-51 · AC6 (Task 9) — a prova de que NENHUM consumo de credencial de tenant foi criado.
 *
 * ## A pergunta que esta régua responde
 *
 * A story entrega um cofre por empresa. O risco que ela abre não é "alguém lê o segredo na tela"
 * (isso é a AC7, e a decifragem devolve 4 caracteres) — é **um caminho de produção passar a
 * consumir a credencial de um tenant**, ou seja, a Trifold executando com a chave do cliente. D14
 * do epic proíbe impersonation, e um consumo desses seria impersonation com outro nome.
 *
 * ## Por que a régua é uma VARREDURA e não uma afirmação
 *
 * "Não criamos consumo" é o tipo de frase que envelhece no primeiro PR seguinte. A varredura
 * abaixo enumera TODOS os arquivos de produção que tocam `secret_ref`, `vault.decrypted_secrets`
 * ou `reveal_last4`, e exige que o conjunto seja exatamente o esperado. Um caminho novo — em
 * qualquer cron, qualquer webhook, qualquer lib — reprova aqui, com o nome do arquivo.
 *
 * A lista é LITERAL de propósito. Derivá-la da varredura faria o teste montar o esperado a partir
 * do que ele vigia, e nunca reprovar coisa nenhuma.
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(AQUI, "../../..") // packages/web/src

/** Os três nomes que qualquer consumo de credencial de tenant teria que atravessar. */
const MARCAS_DE_CONSUMO = ["secret_ref", "decrypted_secrets", "reveal_last4"]

/**
 * Os ÚNICOS arquivos de produção autorizados a mencionar essas marcas, e o que cada um faz.
 *
 * Note o que NÃO está aqui: nenhum `api/cron/`, nenhum `api/webhook…/`, nenhum cliente de
 * provider. Nenhum caminho automático da Trifold toca a credencial de um cliente.
 */
const AUTORIZADOS: Readonly<Record<string, string>> = {
  // Leem para dizer "configurado"/"não configurado" — booleano, nunca o valor.
  "app/dashboard/configuracoes/integracoes/page.tsx": "temSegredo = secret_ref !== null",
  "app/platform/orgs/[id]/integracoes/page.tsx": "temSegredo = secret_ref !== null",
  // Pedem os 4 últimos caracteres, sob clique explícito, por uma RPC que audita antes de devolver.
  "app/api/configuracoes/integracoes/revelar/route.ts": "RPC reveal_last4_as_org",
  "app/api/platform/orgs/[id]/integracoes/revelar/route.ts": "RPC reveal_last4_as_platform",
  // Converte `secret_ref` em booleano ao montar os tiles — o ponteiro nunca atravessa para a tela.
  "lib/integrations/painel/providers.ts": "temSegredo = secret_ref !== null (montagem compartilhada)",
  // Só citam os nomes em comentário/documentação da própria sequência.
  "lib/integrations/painel/escrita.ts": "menção em comentário",
  "lib/integrations/painel/validacao.ts": "menção em comentário",
  "lib/tenancy/platform-query.ts": "menção em comentário",
}

function arquivosDeProducao(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const alvo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (["node_modules", "__tests__", "__fixtures__", "__mocks__"].includes(entrada.name)) continue
      arquivosDeProducao(alvo, acc)
      continue
    }
    if (!/\.tsx?$/.test(entrada.name)) continue
    if (/\.test\.tsx?$/.test(entrada.name)) continue
    acc.push(alvo)
  }
  return acc
}

function arquivosQueTocamCredencial(): string[] {
  const achados = new Set<string>()
  for (const arquivo of arquivosDeProducao(SRC)) {
    const fonte = fs.readFileSync(arquivo, "utf8")
    if (MARCAS_DE_CONSUMO.some((m) => fonte.includes(m))) {
      achados.add(path.relative(SRC, arquivo))
    }
  }
  return [...achados].sort()
}

describe("AC6 — nenhum consumo de credencial de tenant", () => {
  it("o conjunto de arquivos que tocam a credencial é exatamente o autorizado", () => {
    expect(arquivosQueTocamCredencial()).toEqual(Object.keys(AUTORIZADOS).sort())
  })

  it("nenhum cron, webhook ou cliente de provider toca a credencial de um tenant", () => {
    // Reafirma o item anterior pelo LADO que importa para a D14: mesmo que alguém acrescente um
    // arquivo à lista autorizada acima (o que aparece em diff), estes três prefixos continuam
    // proibidos — é neles que "a Trifold rodando com a chave do cliente" moraria.
    const proibidos = arquivosQueTocamCredencial().filter(
      (f) =>
        f.startsWith("app/api/cron/") ||
        f.startsWith("app/api/webhook") ||
        f.startsWith("lib/integrations/sienge/") ||
        f.startsWith("lib/meta/"),
    )
    expect(proibidos).toEqual([])
  })

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // QA-900-51-2 — as duas réguas que nasceram do 18º cego
  // ───────────────────────────────────────────────────────────────────────────────────────────
  it("a árvore de `/platform` não menciona a credencial de WhatsApp em lugar nenhum", () => {
    // O tile de WhatsApp do `/platform` precisa de `whatsapp_config`, mas SÓ das colunas não
    // secretas. Puxar a credencial do tenant para o painel da Trifold é impersonation com outro
    // nome (D14) — e a tentação é real, porque `!!access_token` é a derivação que o `/dashboard`
    // usava. Esta régua é o que impede a "correção óbvia" de virar vazamento.
    const achados: string[] = []
    for (const raiz of ["app/platform", "app/api/platform"]) {
      for (const arquivo of arquivosDeProducao(path.join(SRC, raiz))) {
        if (fs.readFileSync(arquivo, "utf8").includes("access_token")) {
          achados.push(path.relative(SRC, arquivo))
        }
      }
    }
    expect(achados).toEqual([])
  })

  it("as DUAS telas montam os tiles pela MESMA função, sem `.map()` próprio", () => {
    // A causa do 18º cego não foi um valor errado: foram duas montagens para o mesmo fato, uma por
    // tela. Consertar só o `/platform` deixaria a causa de pé.
    //
    // A primeira versão desta régua só exigia que as páginas MENCIONASSEM a função de derivação —
    // e a mutação "apaga o ramo do whatsapp no /platform" passava VERDE, porque o `import`
    // sobrevive à remoção do uso. Guarda de EXISTÊNCIA não é guarda de COBERTURA. A régua de
    // cobertura de verdade é `providers.test.ts` (que reproduz o estado real de produção); esta
    // aqui garante o que ela não alcança: que nenhuma das duas páginas volte a ter montagem
    // própria, onde a régua de cobertura não olharia.
    const paginas = [
      "app/dashboard/configuracoes/integracoes/page.tsx",
      "app/platform/orgs/[id]/integracoes/page.tsx",
    ]
    for (const pagina of paginas) {
      const fonte = fs.readFileSync(path.join(SRC, pagina), "utf8")
      expect(fonte, pagina).toContain("montarTilesDoPainel(")
      // Nenhuma das duas pode derivar `temSegredo` por conta própria — é assinatura de montagem
      // paralela, que é exatamente como as duas telas passaram a discordar.
      expect(fonte, pagina).not.toContain("temSegredo:")
    }
  })

  it("a varredura de fato varre (vivacidade) e as marcas de fato acham algo", () => {
    // Sem estes dois números, um `SRC` errado ou uma marca renomeada produziria os mesmos `[]`
    // verdes acima sobre uma árvore vazia.
    expect(arquivosDeProducao(SRC).length).toBeGreaterThan(500)
    expect(arquivosQueTocamCredencial().length).toBeGreaterThan(0)
  })
})
