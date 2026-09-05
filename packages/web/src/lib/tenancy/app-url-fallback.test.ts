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
 * A AC10 varre o **código-fonte de produção** e afirma, na forma de **mapa arquivo → contagem**,
 * exatamente quais arquivos ainda podem conter o literal e quantas vezes cada um. `.toEqual` sobre
 * o mapa inteiro, nunca `.has(x)`: `.has` só prova que os declarados estão lá e fica verde com
 * sete arquivos a mais que ninguém migrou.
 *
 * ## Três cegueiras que esta régua NÃO pode herdar
 *
 * 1. **Comentário.** `lib/notificacoes.ts` tem seis comentários citando o host em prosa (a
 *    documentação dos templates do WhatsApp). Uma régua de texto cru os contaria como sítios.
 *    Daí `linhasDeCodigo()` de `fonte-scan.ts`, que remove comentário de linha, de bloco, a
 *    CONTINUAÇÃO do bloco e a forma JSX.
 * 2. **Aspas e quebra de linha.** A régua de `grep` que a story herdou exigia aspas duplas e
 *    casava linha a linha — e por isso foi cega ao sítio 28 (`app/login/actions.ts`), uma cadeia
 *    de quatro termos em cinco linhas com o literal em aspas simples. Aqui a busca é pelo **host
 *    nu**, no arquivo inteiro como texto: não há aspa nem quebra de linha que a driblem.
 * 3. **O nome do arquivo perdoando o sítio que mora nele.** Achado do gate (QA-900-66-1) e MEDIDO:
 *    um conjunto de NOMES fica verde quando o defeito exato que esta story fecha — o literal cru
 *    de volta — cai num arquivo que já estava na lista por outro motivo. Dois dos sete declarados
 *    hospedam sítios migrados (`lib/notificacoes.ts` ×3, `billing-reminders` ×1): eram 4 dos 29
 *    sítios descobertos, e são justamente os avisos ao CLIENTE FINAL. Daí a CONTAGEM ao lado de
 *    cada nome — o perdão é do literal declarado, nunca do arquivo.
 *
 * ## A régua irmã: ausência do literal não é presença do resolver
 *
 * A varredura acima é de AUSÊNCIA. Um sítio desmigrado para `?? ""` some do literal sem passar a
 * chamar ninguém, e ficaria verde (QA-900-66-2, medido no gate). Por isso o `it` de PRESENÇA
 * afirma o número de CHAMADAS de `tentarAppUrl` **e** o de arquivos que as hospedam: a contagem
 * de chamadas pega o sítio desmigrado dentro de um arquivo que tem outros; a de arquivos, o
 * arquivo inteiro desmigrado.
 */
import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { arquivosDeProducao, ocorrenciasNoCodigo } from "./fonte-scan"
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

/** A chamada do resolver, como texto — a agulha da régua de PRESENÇA. */
const CHAMADA = "tentarAppUrl("

/** O módulo desta story: hospeda a DEFINIÇÃO de `tentarAppUrl`, não uma chamada. */
const MODULO = "lib/tenancy/app-url-fallback.ts"

/**
 * Os arquivos de produção que AINDA contêm o host, **quantas vezes cada um**, e por que pode.
 *
 * São **sete**, em três famílias, e cada entrada abaixo carrega o motivo do seu próprio perdão:
 * cinco vêm da tabela "O que fica FORA" da Story 900-66, um por linha dela; o sexto é o módulo
 * criado por ela — a **única declaração** do literal, que é o ponto: o valor passou a ter um dono;
 * o sétimo é a denylist de segurança `HOSTS_DE_TENANT` da Story 900-65, que não é candidata a
 * migrar para o resolver (o motivo mora na entrada).
 *
 * ⚠️ A AC10.4 listou cinco, porque foi escrita antes de o resolver existir. O sexto não é uma
 * exclusão a mais: é o destino para onde os 28 literais migraram. Registrado no Dev Agent Record.
 *
 * ⚠️ O sétimo entrou depois, pela Story 900-68: `lib/tenancy/papel-do-host.ts` (PR #569) foi
 * mergeado DEPOIS desta régua (PR #565) e deixou `main` vermelha — que é exatamente o serviço que
 * a AC10 presta. A régua estava certa; faltava declarar o arquivo novo. Se um oitavo aparecer, o
 * caminho é o mesmo: declarar aqui, com o motivo, e nunca afrouxar a asserção — um cabeçalho que
 * conta errado é o primeiro passo para alguém "arrumar" o mapa apagando a entrada que sobra.
 *
 * ⚠️ É um MAPA, não uma lista, por causa da cegueira 3 do cabeçalho: `lib/notificacoes.ts` e
 * `billing-reminders` hospedam sítios JÁ migrados, e sob uma lista de nomes o literal cru podia
 * voltar para dentro deles com a suíte verde. A contagem é o que fecha isso — cada número abaixo
 * foi medido contra a árvore, e subir qualquer um deles é o defeito que a AC10 existe para pegar.
 */
const RESIDUAL_DECLARADO: Record<string, number> = {
  // A ÚNICA declaração do literal — para onde os 28 sítios apontam agora (AC2). Se ele se
  // multiplicar aqui dentro, a concentração que a story entrega já começou a se desfazer.
  [MODULO]: 1,
  // Tabela "O que fica FORA", linha 2: alvo EXCLUSIVO da Story 900-67 (o `isTrifold` por regex
  // e o logo do e-mail). Incluir aqui criaria dois donos para o mesmo arquivo.
  "lib/email-layout/components/header.ts": 1,
  // Linha 6: `CRM_BASE` é constante INCONDICIONAL (sem `??`, sem env) — não há ramo "não sei"
  // para redirecionar. Mesma classe do `"[Trifold]"` do billing. As outras 3 ocorrências que o
  // arquivo tinha eram sítios, e migraram: por isso 1, e não "o arquivo está perdoado".
  "lib/notificacoes.ts": 1,
  // Linha 6: texto EXIBIDO ao olho humano dentro de uma frase de alerta, não roteamento. O sítio
  // de `APP_URL` que morava aqui migrou — daí 1.
  "app/api/cron/billing-reminders/route.ts": 1,
  // Linha 6: texto exibido — "Acesse crm.trifold.eng.br pelo Safari", três vezes na mesma página.
  "app/broker/instalar/page.tsx": 3,
  // Linha 6: texto exibido no passo a passo de cadastro de corretor.
  "app/dashboard/configuracoes/corretores/novo/page.tsx": 1,
  // Story 900-65: aqui o literal está dentro de `HOSTS_DE_TENANT`, uma DENYLIST DE SEGURANÇA —
  // hosts de inquilino que NUNCA podem ser promovidos a host de console admin, nem que
  // `PLATFORM_ADMIN_HOSTS` mande. É lista estática, avaliada em import-time, e responde à pergunta
  // oposta à do resolver ("quais hosts nunca viram admin?" vs. "para onde mando quem não tem
  // URL?"): não é candidata a consumir `tentarAppUrl`. As outras 3 ocorrências do arquivo estão em
  // JSDoc e `linhasDeCodigo()` as descarta — por isso 1, e não "o arquivo está perdoado".
  "lib/tenancy/papel-do-host.ts": 1,
}

describe("AC10 — nenhum sítio de fallback ficou para trás", () => {
  const arquivos = arquivosDeProducao(SRC)

  const residual = new Map<string, number>()
  for (const caminho of arquivos) {
    const n = ocorrenciasNoCodigo(fs.readFileSync(caminho, "utf-8"), HOST)
    if (n > 0) residual.set(path.relative(SRC, caminho).split(path.sep).join("/"), n)
  }

  it("a varredura não está vazia (régua que varre zero arquivo aprova qualquer coisa)", () => {
    // Vivacidade da AC10.5: uma varredura que erra o caminho devolve `[]` e passa verde contra
    // qualquer lista. O número é folgado de propósito — é sinal de vida, não de cobertura.
    expect(arquivos.length).toBeGreaterThan(100)
  })

  it("a lista declarada tem exatamente os sete arquivos autorizados", () => {
    expect(Object.keys(RESIDUAL_DECLARADO)).toHaveLength(7)
  })

  it("o residual é EXATAMENTE o declarado — arquivo E contagem", () => {
    // `.toEqual` sobre o mapa inteiro, nunca `.has(x)` nem um conjunto de NOMES. `.has` fica
    // verde com arquivos a mais que ninguém migrou; o conjunto de nomes fica verde com o literal
    // cru de volta dentro de um arquivo já declarado (QA-900-66-1, medido: 4 dos 29 sítios).
    // Este `it` absorve o antigo "declara o literal UMA vez só": ele virou a entrada de `MODULO`.
    expect(Object.fromEntries([...residual.entries()].sort())).toEqual(RESIDUAL_DECLARADO)
  })

  it("os sítios migrados continuam CHAMANDO o resolver", () => {
    // A régua acima é de AUSÊNCIA do literal. Um sítio desmigrado para `?? ""` some do literal
    // sem passar a chamar ninguém — e ficava verde (QA-900-66-2, medido no gate). As DUAS
    // contagens são necessárias: a de arquivos pega o arquivo inteiro desmigrado; a de chamadas
    // pega um sítio dentro de arquivo que tem outros (`notificacoes.ts` tem 3).
    let arquivosComChamada = 0
    let chamadas = 0
    for (const caminho of arquivos) {
      const relativo = path.relative(SRC, caminho).split(path.sep).join("/")
      if (relativo === MODULO) continue // aqui mora a DEFINIÇÃO, não uma chamada
      const n = ocorrenciasNoCodigo(fs.readFileSync(caminho, "utf-8"), CHAMADA)
      if (n > 0) {
        arquivosComChamada += 1
        chamadas += n
      }
    }
    expect({ arquivosComChamada, chamadas }).toEqual({ arquivosComChamada: 24, chamadas: 30 })
  })
})

describe("AC10 — o detector, contra as formas que já driblaram uma régua neste repositório", () => {
  it("acha o host com aspas DUPLAS", () => {
    expect(ocorrenciasNoCodigo(`const x = process.env.A ?? "https://${HOST}"`, HOST)).toBe(1)
  })

  it("acha o host com aspas SIMPLES (a cegueira que deixou o sítio 28 passar)", () => {
    expect(ocorrenciasNoCodigo(`const x = process.env.A ?? 'https://${HOST}'`, HOST)).toBe(1)
  })

  it("acha o host numa cadeia MULTILINHA (a outra metade da cegueira do sítio 28)", () => {
    const fonte = [
      "const baseUrl =",
      "  process.env.NEXT_PUBLIC_SITE_URL ??",
      "  headersList.get('origin') ??",
      "  process.env.NEXT_PUBLIC_APP_URL ??",
      `  'https://${HOST}'`,
    ].join("\n")
    expect(ocorrenciasNoCodigo(fonte, HOST)).toBe(1)
  })

  it("IGNORA o host dentro de comentário de linha", () => {
    expect(ocorrenciasNoCodigo(`// botão aponta para https://${HOST}/cliente/{{1}}`, HOST)).toBe(0)
  })

  it("IGNORA o host dentro de comentário de bloco, inclusive na CONTINUAÇÃO", () => {
    const fonte = ["/**", ` * base https://${HOST}/agendar/cancelar/{{1}}`, " */", "const x = 1"].join("\n")
    expect(ocorrenciasNoCodigo(fonte, HOST)).toBe(0)
  })

  it("conta a ocorrência de código que vem DEPOIS do comentário no mesmo arquivo", () => {
    const fonte = [`// documentação: https://${HOST}/x`, `const CRM_BASE = "https://${HOST}"`].join("\n")
    expect(ocorrenciasNoCodigo(fonte, HOST)).toBe(1)
  })
})
