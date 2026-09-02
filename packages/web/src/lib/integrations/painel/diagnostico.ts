/**
 * Story 900-61 — "em erro" vira "em erro DESDE QUANDO e POR QUÊ", num módulo puro.
 *
 * ## Por que isto não mora dentro do `.tsx`
 *
 * `vitest.config.ts` coleta `packages/web/src/**\/*.test.ts` e **não** `.tsx`. Decisão escrita
 * dentro de um componente é decisão sem carrasco — foi a lição das Stories 900-60 e 900-62, onde
 * mutar o ramo de erro dentro do JSX deixava `tsc` em rc=0 e a suíte inteira verde. Aqui cada
 * ramo tem um `it` que fica vermelho quando ele muda; o `.tsx` só interpola o texto pronto.
 *
 * ## O fallback não é zelo, é o contrato REAL do banco — medido pelo @po
 *
 * `_org_integration_mark_error(..., p_codigo text)` recebe `text` PURO: sem `CHECK`, sem enum,
 * sem validação nenhuma (migration `248`). "É sempre um dos 6 códigos de `erros.ts`" é disciplina
 * do chamador, não garantia do schema — e foi medido no banco de teste em 2026-09-01, dentro de
 * uma transação abortada: `_org_integration_mark_error(..., 'codigo_que_nao_existe')` gravou
 * `last_error = 'codigo_que_nao_existe'` sem reclamar.
 *
 * Logo `MENSAGENS_PT_BR[last_error]` devolveria `undefined`, e a tela escreveria "em erro desde
 * 12/08 — undefined". Por isso {@link motivoDoErro} **nunca** indexa a tabela sem antes conferir
 * a lista, e o desconhecido vira um texto que mostra o código em vez de escondê-lo: quem lê a
 * tela precisa poder citar o valor ao suporte.
 *
 * ⚠️ A conferência é `CODIGOS_DE_ERRO.includes(...)`, e **não** `MENSAGENS_PT_BR[codigo] ?? ...`.
 * A segunda forma tem um furo próprio: `last_error = 'constructor'` (ou `'toString'`) resolve
 * pela cadeia de protótipos e devolve uma FUNÇÃO, que o `??` aceita como valor bom.
 *
 * ## Nada aqui inventa data
 *
 * Carimbo ausente ou impossível de parsear vira `null`, e o texto some — a mesma regra que
 * `diasDesdeOConvite` já segue no console. Um "desde 01/01/1970" seria pior que o silêncio,
 * porque tem cara de medida.
 */

import { CODIGOS_DE_ERRO, MENSAGENS_PT_BR, type CodigoDeErro } from "./erros"

/**
 * O fuso em que este texto declara uma data.
 *
 * Sem `timeZone` quem decide o dia é o fuso do PROCESSO: o servidor da Vercel roda em UTC e a
 * máquina do desenvolvedor em UTC-3, então um `last_check_at` de 21h vira dois dias diferentes —
 * e o teste desta função passaria localmente e falharia no CI, por causa da máquina e não do
 * código.
 *
 * Está declarado AQUI e não importado de `lib/tenancy/console-leitura.ts` (que exporta o mesmo
 * valor como `FUSO_DO_CONSOLE`) por uma razão medida, não por gosto: este módulo é carregado por
 * `integrations-panel.tsx`, que é `"use client"`, e a cadeia de imports daquele arquivo passa por
 * `admin-invite.ts` → `lib/supabase/admin` — o cliente de SERVICE ROLE. Puxar o console para
 * dentro do bundle do navegador para reaproveitar uma string de 17 caracteres é a troca errada.
 */
const FUSO = "America/Sao_Paulo"

/** É um dos SEIS códigos do contrato de `erros.ts`? */
function ehCodigoDeErro(valor: string): valor is CodigoDeErro {
  return (CODIGOS_DE_ERRO as readonly string[]).includes(valor)
}

/**
 * A frase PT-BR do código, ou o rótulo genérico quando o código está fora do contrato.
 *
 * `null` só para ausência de verdade: `NULL` no banco, `undefined` (a coluna não veio na
 * projeção) ou só espaços. "Só espaços" entra aqui porque o alternativo seria renderizar
 * "motivo não reconhecido: " com nada depois — a string vazia que a AC6 proíbe, com um rótulo
 * na frente.
 */
export function motivoDoErro(codigo: string | null | undefined): string | null {
  const limpo = (codigo ?? "").trim()
  if (limpo === "") return null
  return ehCodigoDeErro(limpo)
    ? MENSAGENS_PT_BR[limpo]
    : `motivo não reconhecido: ${limpo}`
}

/**
 * `01/09/2026` a partir do ISO de `last_check_at`, ou `null`.
 *
 * `Number.isNaN(getTime())` é a guarda: `new Date("qualquer coisa")` não lança, e sem isto a tela
 * escreveria "em erro desde Invalid Date".
 */
export function dataDeChecagem(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

/** As duas colunas novas de `org_integrations`, como qualquer consumidor as recebe. */
export interface CamposDeDiagnostico {
  lastError: string | null | undefined
  lastCheckAt: string | null | undefined
}

/**
 * AC6 — a linha do TILE: `Em erro desde 01/09/2026 — A credencial foi recusada…`
 *
 * `null` (a tela não desenha nada e o badge segue sozinho, como hoje) em três casos, e os três
 * são "não há o que declarar":
 *   • o status não é `error` — uma integração reconectada não repete o erro velho. `mark_connected`
 *     já limpa `last_error` no banco, mas a tela não depende disso: linha antiga de um banco que
 *     ainda não rodou a migration `253` cairia aqui;
 *   • sem código E sem data — as duas colunas `NULL` são o estado de TODA linha existente antes
 *     da `253`, e é o comportamento que a AC6 manda preservar;
 *   • qualquer combinação em que as duas peças somem.
 *
 * Com só uma das duas, a frase encolhe em vez de mentir sobre a que falta.
 */
export function linhaDeDiagnostico(
  entrada: CamposDeDiagnostico & { status: string },
): string | null {
  if (entrada.status !== "error") return null
  const desde = dataDeChecagem(entrada.lastCheckAt)
  const motivo = motivoDoErro(entrada.lastError)
  if (!desde && !motivo) return null
  const inicio = desde ? `Em erro desde ${desde}` : "Em erro"
  return motivo ? `${inicio} — ${motivo}` : `${inicio}.`
}

/**
 * AC7 — o RABICHO da linha da Visão geral, que vem depois de `{Provider} em erro`:
 * ` desde 01/09/2026 (A credencial foi recusada…)`.
 *
 * Devolve `""` e não `null` porque o destino é uma interpolação em JSX. É de propósito que a
 * composição inteira esteja aqui: se a página montasse a frase com dois ternários no meio do
 * `<span>`, a decisão voltaria a morar onde o vitest não coleta.
 *
 * A pontuação difere da do tile (parênteses, não travessão) porque a linha da Visão geral já usa
 * travessão para separar a empresa do provider — um segundo travessão na mesma linha faria a
 * mensagem de erro parecer um terceiro campo.
 */
export function detalheDaPendencia(entrada: CamposDeDiagnostico): string {
  const desde = dataDeChecagem(entrada.lastCheckAt)
  const motivo = motivoDoErro(entrada.lastError)
  return `${desde ? ` desde ${desde}` : ""}${motivo ? ` (${motivo})` : ""}`
}
