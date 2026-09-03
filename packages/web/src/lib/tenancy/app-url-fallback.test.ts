/**
 * Story 900-66 — AC6/AC7 (o resolver) e **AC10 (o carrasco de ALCANCE)**.
 *
 * ## Por que a AC10 existe, e por que ela é a régua que importa
 *
 * As AC6/AC7 medem o resolver ISOLADO. Nenhuma delas fica vermelha se a migração alcançar 21 dos
 * 28 sítios e esquecer 7: o resolver continua correto, os oito casos continuam passando, e a story
 * fecharia com um quarto do trabalho não feito e a suíte verde. É a armadilha "régua que prende
 * presença mas não alcance".
 *
 * A AC10 varre o **código-fonte de produção** e afirma, na forma de conjunto, exatamente quais
 * arquivos ainda podem conter o literal. `.toEqual` sobre as chaves ordenadas, nunca `.has(x)`:
 * `.has` só prova que os declarados estão lá e fica verde com sete arquivos a mais que ninguém
 * migrou.
 *
 * ## Duas cegueiras que esta régua NÃO pode herdar
 *
 * 1. **Comentário.** `lib/notificacoes.ts` tem seis comentários citando o host em prosa (a
 *    documentação dos templates do WhatsApp). Uma régua de texto cru os contaria como sítios.
 *    Daí `linhasDeCodigo()` de `fonte-scan.ts`, que remove comentário de linha, de bloco, a
 *    CONTINUAÇÃO do bloco e a forma JSX.
 * 2. **Aspas e quebra de linha.** A régua de `grep` que a story herdou exigia aspas duplas e
 *    casava linha a linha — e por isso foi cega ao sítio 28 (`app/login/actions.ts`), uma cadeia
 *    de quatro termos em cinco linhas com o literal em aspas simples. Aqui a busca é pelo **host
 *    nu**, no arquivo inteiro como texto: não há aspa nem quebra de linha que a driblem.
 */
import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { arquivosDeProducao, codigoDe } from "./fonte-scan"
import { trifoldOrgId } from "./trifold-org"
import {
  AppUrlIndisponivelError,
  resolveAppUrlFallback,
  resolveCorretorFallbackName,
  tentarAppUrl,
} from "./app-url-fallback"

const FLAG = "TENANT_FALLBACK_FAIL_CLOSED"
const URL_DE_HOJE = "https://crm.trifold.eng.br"

/** Liga a flag para o `it` corrente. O `afterEach` abaixo devolve o ambiente ao estado real. */
function ligarFlag() {
  process.env[FLAG] = "true"
}

afterEach(() => {
  delete process.env[FLAG]
})

// ─────────────────────────────────────────────────────────────────────────────
// AC6 — flag DESLIGADA ⇒ o literal de hoje, byte a byte
// ─────────────────────────────────────────────────────────────────────────────

describe("AC6 — flag desligada: a saída é a de hoje", () => {
  it("env ausente devolve o literal de hoje", () => {
    expect(resolveAppUrlFallback(undefined)).toBe("https://crm.trifold.eng.br")
  })

  it("env vazia devolve o literal de hoje (vazio é 'ausente')", () => {
    expect(resolveAppUrlFallback("")).toBe("https://crm.trifold.eng.br")
  })

  it("env preenchida devolve a env, intocada", () => {
    expect(resolveAppUrlFallback("https://crm.empresa-b.com.br")).toBe("https://crm.empresa-b.com.br")
  })

  it("corretor sem nome, org da Trifold ⇒ 'Trifold'", () => {
    expect(resolveCorretorFallbackName({ orgId: trifoldOrgId(), flagLigada: false })).toBe("Trifold")
  })

  it("corretor sem nome, QUALQUER outra org ⇒ 'Trifold' também (o de hoje é incondicional)", () => {
    expect(resolveCorretorFallbackName({ orgId: "org-que-nao-e-a-trifold", flagLigada: false })).toBe(
      "Trifold"
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC7 — flag LIGADA ⇒ a direção nova
// ─────────────────────────────────────────────────────────────────────────────

describe("AC7 — flag ligada: falha fechado em vez de cair para a Trifold", () => {
  it("env ausente lança AppUrlIndisponivelError", () => {
    ligarFlag()
    expect(() => resolveAppUrlFallback(undefined)).toThrow(AppUrlIndisponivelError)
  })

  it("env vazia lança AppUrlIndisponivelError", () => {
    ligarFlag()
    expect(() => resolveAppUrlFallback("")).toThrow(AppUrlIndisponivelError)
  })

  it("env preenchida continua vencendo, com ou sem flag", () => {
    ligarFlag()
    expect(resolveAppUrlFallback("https://qualquer.com")).toBe("https://qualquer.com")
  })

  it("corretor sem nome, org da Trifold ⇒ 'Trifold' (byte-idêntico para a Trifold real)", () => {
    expect(resolveCorretorFallbackName({ orgId: trifoldOrgId(), flagLigada: true })).toBe("Trifold")
  })

  it("corretor sem nome, outra org ⇒ 'Equipe'", () => {
    expect(resolveCorretorFallbackName({ orgId: "org-fictícia-qualquer", flagLigada: true })).toBe(
      "Equipe"
    )
  })

  it("valor só de espaços conta como ausente", () => {
    ligarFlag()
    expect(() => resolveAppUrlFallback("   ")).toThrow(AppUrlIndisponivelError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC4 — o desfecho: `tentarAppUrl` devolve `ok:false`, não propaga, e não engole o resto
// ─────────────────────────────────────────────────────────────────────────────

describe("AC4 — tentarAppUrl: quem não tem URL não envia", () => {
  it("com a flag desligada devolve ok:true com o literal de hoje", () => {
    expect(tentarAppUrl(undefined, "sitio-de-teste")).toEqual({ ok: true, url: URL_DE_HOJE })
  })

  it("com a flag ligada e sem env devolve ok:false, sem lançar", () => {
    ligarFlag()
    expect(tentarAppUrl(undefined, "sitio-de-teste", { orgId: "org-x" })).toEqual({ ok: false })
  })

  it("o catch é estreito: erro que NÃO é AppUrlIndisponivelError continua propagando", () => {
    // Um `catch` genérico aqui esconderia caminho morto. O erro precisa nascer DENTRO do `try`
    // de `tentarAppUrl` para que o teste meça o catch, e não o argumento: por isso o valor é um
    // objeto cujo `trim()` — a primeira coisa que `resolveAppUrlFallback` toca — explode.
    const envHostil = {
      trim() {
        throw new TypeError("erro alheio ao fallback de marca")
      },
    } as unknown as string
    expect(() => tentarAppUrl(envHostil, "sitio-de-teste")).toThrow(TypeError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC10 — o carrasco de ALCANCE
// ─────────────────────────────────────────────────────────────────────────────

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(AQUI, "../..") // packages/web/src

/** O host nu. Sem aspas, sem protocolo: nenhuma das duas formas de aspas o dribla. */
const HOST = "crm.trifold.eng.br"

/**
 * Quantas vezes o host aparece nas linhas de CÓDIGO de `fonte` — arquivo inteiro como texto,
 * não linha a linha.
 */
function ocorrenciasDoHost(fonte: string): number {
  return codigoDe(fonte).split(HOST).length - 1
}

/**
 * Os arquivos de produção que AINDA contêm o host, e por que cada um pode.
 *
 * Cinco vêm da tabela "O que fica FORA" da story, um por linha dela. O sexto é o módulo criado
 * por esta story — a **única declaração** do literal, que é o ponto: o valor passou a ter um dono.
 *
 * ⚠️ A AC10.4 listou cinco, porque foi escrita antes de o resolver existir. O sexto não é uma
 * exclusão a mais: é o destino para onde os 28 literais migraram. Registrado no Dev Agent Record.
 */
const RESIDUAL_DECLARADO = [
  // A ÚNICA declaração do literal — para onde os 28 sítios apontam agora (AC2).
  "lib/tenancy/app-url-fallback.ts",
  // Tabela "O que fica FORA", linha 2: alvo EXCLUSIVO da Story 900-67 (o `isTrifold` por regex
  // e o logo do e-mail). Incluir aqui criaria dois donos para o mesmo arquivo.
  "lib/email-layout/components/header.ts",
  // Linha 6: `CRM_BASE` é constante INCONDICIONAL (sem `??`, sem env) — não há ramo "não sei"
  // para redirecionar. Mesma classe do `"[Trifold]"` do billing.
  "lib/notificacoes.ts",
  // Linha 6: texto EXIBIDO ao olho humano dentro de uma frase de alerta, não roteamento.
  "app/api/cron/billing-reminders/route.ts",
  // Linha 6: texto exibido — "Acesse crm.trifold.eng.br pelo Safari".
  "app/broker/instalar/page.tsx",
  // Linha 6: texto exibido no passo a passo de cadastro de corretor.
  "app/dashboard/configuracoes/corretores/novo/page.tsx",
]

describe("AC10 — nenhum sítio de fallback ficou para trás", () => {
  const arquivos = arquivosDeProducao(SRC)

  const residual = new Map<string, number>()
  for (const caminho of arquivos) {
    const n = ocorrenciasDoHost(fs.readFileSync(caminho, "utf-8"))
    if (n > 0) residual.set(path.relative(SRC, caminho).split(path.sep).join("/"), n)
  }

  it("a varredura não está vazia (régua que varre zero arquivo aprova qualquer coisa)", () => {
    // Vivacidade da AC10.5: uma varredura que erra o caminho devolve `[]` e passa verde contra
    // qualquer lista. O número é folgado de propósito — é sinal de vida, não de cobertura.
    expect(arquivos.length).toBeGreaterThan(100)
  })

  it("a lista declarada tem exatamente os seis arquivos autorizados", () => {
    expect(RESIDUAL_DECLARADO).toHaveLength(6)
  })

  it("o conjunto residual é EXATAMENTE o declarado", () => {
    // `.toEqual` sobre as chaves ordenadas, nunca `.has(x)`: `.has` fica verde com arquivos a
    // mais que ninguém migrou — que é precisamente o defeito que esta AC existe para pegar.
    expect([...residual.keys()].sort()).toEqual([...RESIDUAL_DECLARADO].sort())
  })

  it("app-url-fallback.ts declara o literal UMA vez só", () => {
    // Se o literal se multiplicar dentro do próprio módulo, a concentração que a story entrega
    // já começou a se desfazer.
    expect(residual.get("lib/tenancy/app-url-fallback.ts")).toBe(1)
  })
})

describe("AC10 — o detector, contra as formas que já driblaram uma régua neste repositório", () => {
  it("acha o host com aspas DUPLAS", () => {
    expect(ocorrenciasDoHost(`const x = process.env.A ?? "https://${HOST}"`)).toBe(1)
  })

  it("acha o host com aspas SIMPLES (a cegueira que deixou o sítio 28 passar)", () => {
    expect(ocorrenciasDoHost(`const x = process.env.A ?? 'https://${HOST}'`)).toBe(1)
  })

  it("acha o host numa cadeia MULTILINHA (a outra metade da cegueira do sítio 28)", () => {
    const fonte = [
      "const baseUrl =",
      "  process.env.NEXT_PUBLIC_SITE_URL ??",
      "  headersList.get('origin') ??",
      "  process.env.NEXT_PUBLIC_APP_URL ??",
      `  'https://${HOST}'`,
    ].join("\n")
    expect(ocorrenciasDoHost(fonte)).toBe(1)
  })

  it("IGNORA o host dentro de comentário de linha", () => {
    expect(ocorrenciasDoHost(`// botão do template aponta para https://${HOST}/cliente/{{1}}`)).toBe(0)
  })

  it("IGNORA o host dentro de comentário de bloco, inclusive na CONTINUAÇÃO", () => {
    const fonte = ["/**", ` * base https://${HOST}/agendar/cancelar/{{1}}`, " */", "const x = 1"].join("\n")
    expect(ocorrenciasDoHost(fonte)).toBe(0)
  })

  it("conta a ocorrência de código que vem DEPOIS do comentário no mesmo arquivo", () => {
    const fonte = [`// documentação: https://${HOST}/x`, `const CRM_BASE = "https://${HOST}"`].join("\n")
    expect(ocorrenciasDoHost(fonte)).toBe(1)
  })
})
