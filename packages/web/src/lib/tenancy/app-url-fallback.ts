/**
 * Story 900-66 (Epic 900) — **a direção da falha**, quando ninguém sabe qual é a URL/marca.
 *
 * Proveniência: `docs/architecture/whitelabel-e-migracao-jud.md` §2.3 nomeia o padrão
 * `X ?? "…Trifold…"` como o invariante estrutural do épico. Ele é **correto hoje** — com uma
 * organização só, a resposta certa por acaso é sempre a mesma — e vira **vazamento de marca no
 * instante em que existirem duas orgs**: um link de outro cliente apontando para
 * `crm.trifold.eng.br`, um e-mail de recuperação de senha levando a pessoa para a marca errada.
 *
 * Este módulo não muda o comportamento de ninguém hoje. Ele **concentra** os 28 pontos em que a
 * decisão é tomada, para que a direção possa ser trocada num lugar só, sob uma flag, quando o
 * segundo tenant existir.
 *
 * ## A flag
 *
 * `TENANT_FALLBACK_FAIL_CLOSED`, lida por `process.env["TENANT_FALLBACK_FAIL_CLOSED"] === "true"`
 * (notação de colchete, mesmo estilo da Story 900-65). **Ausente ⇒ comportamento byte a byte
 * igual ao de hoje**, em todos os sítios. Ligá-la em qualquer ambiente real é escopo de uma
 * story futura — e depende do CON registrado na AC11 da 900-66:
 * `site_url`/`uri_allow_list` do Supabase são **globais do projeto**, não por org, e um host fora
 * da lista faz o redirect ser descartado em silêncio de volta para o `site_url` (ou seja, para a
 * Trifold). Trocar o fallback sem cadastrar a URL do tenant na allow list não muda o destino real
 * do usuário.
 *
 * ## Por que "falhar fechado" e não "cair para um neutro da Jud"
 *
 * `whitelabel-e-migracao-jud.md` §2.3 oferece as duas como igualmente válidas. Não há domínio da
 * Jud confirmado nem resolução de DNS medida — inventar uma URL neutra seria uma string sem
 * lastro, que produziria links quebrados de aparência legítima. Lançar
 * `AppUrlIndisponivelError` é auditável e não finge um domínio que pode não existir.
 *
 * O desfecho no chamador é uniforme nos 28 sítios (AC4): **quem não tem URL não envia**. Não se
 * monta link com string vazia, não se monta link parcial, não se cai para nenhum literal. O erro
 * é capturado, logado (`[900-66]`) e o envio daquela mensagem é abandonado — sem derrubar o
 * restante do laço nas rotas que iteram orgs ou destinatários.
 *
 * ## Por que DOIS resolvers e não um genérico
 *
 * URL e nome-de-corretor têm formas de falha diferentes. URL ausente só vira problema no momento
 * do uso, e ali um erro alto é melhor do que um link quebrado silencioso dentro de um e-mail.
 * Nome de corretor SEMPRE tem um valor de exibição válido (mesmo "Equipe" é texto renderizável) —
 * lançar ali seria derrubar uma conversa por causa de uma saudação. Um resolver só teria retorno
 * `string | never` disfarçado.
 *
 * ## A única diferença de comportamento com a flag DESLIGADA, e por que ela é segura
 *
 * O código de hoje usa `??`, que devolve a **string vazia** quando a env está setada e vazia.
 * Este resolver trata `""` (e só-espaços) como **ausente** e devolve o literal de hoje. É a
 * direção segura: `NEXT_PUBLIC_APP_URL=""` produzia `"/dashboard"` como link absoluto num e-mail,
 * e o repositório tem dois incidentes registrados de env gravada vazia em silêncio pela CLI da
 * Vercel (`vercel env add` via stdin). Com env preenchida — o estado de todo ambiente real — a
 * saída é byte a byte a de hoje.
 */

import { trifoldOrgId } from "./trifold-org"

/**
 * Lançado quando não há URL de aplicação conhecida **e** a flag manda falhar fechado.
 *
 * `name` é fixado explicitamente porque a minificação do build de produção renomeia a classe, e
 * um `err.name` derivado do `constructor.name` deixaria o log ilegível justamente no ambiente em
 * que ele importa.
 */
export class AppUrlIndisponivelError extends Error {
  constructor(message = "URL da aplicação indisponível para esta organização (TENANT_FALLBACK_FAIL_CLOSED)") {
    super(message)
    this.name = "AppUrlIndisponivelError"
  }
}

/** O literal de hoje. Só é devolvido com a flag desligada — que é o padrão. */
const URL_DE_HOJE = "https://crm.trifold.eng.br"

/** Nome de exibição de hoje, quando o corretor não tem nome preenchido. */
const NOME_DE_HOJE = "Trifold"

/** Nome de exibição neutro, para org que não é a Trifold, com a flag ligada. */
const NOME_NEUTRO = "Equipe"

/** A flag, lida no momento do uso — nunca memoizada em constante de módulo. */
function falhaFechadaLigada(): boolean {
  return process.env["TENANT_FALLBACK_FAIL_CLOSED"] === "true"
}

/**
 * A base de URL da aplicação, ou o erro, quando a env não diz.
 *
 * O valor da env entra como **argumento** de propósito: `process.env.NEXT_PUBLIC_*` é substituído
 * textualmente pelo bundler do Next no arquivo em que está escrito. Ler a env aqui dentro faria
 * os 27 call sites deixarem de ser inlineados e passarem a depender do `process.env` de runtime,
 * que no browser não existe.
 *
 * @param envValue o valor de `process.env.NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL` do call site
 * @throws {AppUrlIndisponivelError} quando não há valor **e** a flag está ligada
 */
export function resolveAppUrlFallback(envValue: string | undefined): string {
  if (envValue !== undefined && envValue.trim() !== "") return envValue
  if (falhaFechadaLigada()) throw new AppUrlIndisponivelError()
  return URL_DE_HOJE
}

/**
 * O nome exibido no lugar do corretor sem nome, na abertura de conversa do WhatsApp.
 *
 * `flagLigada` entra como parâmetro em vez de ser lida aqui porque este resolver é chamado de um
 * caminho que já tem o `org_id` em mãos: quem chama decide, e o teste não precisa mexer em
 * `process.env` para exercitar as quatro combinações.
 *
 * Com a flag ligada e uma org que não é a Trifold, devolve um termo genérico em vez de buscar o
 * nome real da organização: `loadOpeningContext` não carrega `organizations.name`, e uma query a
 * mais só para este fallback trocaria "mudar a direção da falha" por "adicionar capacidade nova".
 * Marca real em mensagem transacional é outra classe de trabalho.
 */
export function resolveCorretorFallbackName(input: { orgId: string; flagLigada: boolean }): string {
  if (!input.flagLigada) return NOME_DE_HOJE
  // `trifoldOrgId()` importado, nunca o UUID literal: `trifold-org-literal.test.ts` (Story 900-23)
  // é uma catraca que reprova arquivo novo com o literal, e a resposta certa a ela é importar o
  // marcador — não pedir uma linha na allowlist.
  return input.orgId === trifoldOrgId() ? NOME_DE_HOJE : NOME_NEUTRO
}

/**
 * O resultado de tentar descobrir a URL base — o desfecho uniforme da AC4 nos 28 sítios.
 *
 * `ok: false` significa **"não sei qual é a URL desta organização"**, e a única resposta honesta
 * a isso é **não enviar**. Nada de link com string vazia, link parcial ou queda para literal.
 */
export type AppUrlTentativa = { ok: true; url: string } | { ok: false }

/**
 * `resolveAppUrlFallback` na forma de resultado, para os call sites que precisam **decidir o que
 * fazer** quando não há URL.
 *
 * Por que resultado e não `try/catch` em cada sítio: o desfecho fica **visível na linha seguinte**
 * de cada call site (`return 503`, `continue`, `return`), que é exatamente o que a AC4 manda
 * auditar sítio a sítio. Um helper que recebesse o envio como callback esconderia a decisão dentro
 * deste arquivo e faria os 28 sítios parecerem iguais quando não são.
 *
 * O `catch` é **estreito de propósito**: só `AppUrlIndisponivelError` vira `ok: false`. Qualquer
 * outro erro é relançado, para que o comportamento de falha de hoje continue exatamente o que era
 * — `catch` genérico esconde caminho morto.
 *
 * Enquanto `TENANT_FALLBACK_FAIL_CLOSED` não for `"true"` — o padrão, e o estado de todo ambiente
 * real nesta story — esta função **nunca** devolve `ok: false`.
 *
 * @param sitio identificador curto do call site, para o log
 * @param contexto campos extras do log (tipicamente `{ orgId }`), quando o sítio os tem em mãos
 */
export function tentarAppUrl(
  envValue: string | undefined,
  sitio: string,
  contexto?: Record<string, unknown>,
): AppUrlTentativa {
  try {
    return { ok: true, url: resolveAppUrlFallback(envValue) }
  } catch (erro) {
    if (!(erro instanceof AppUrlIndisponivelError)) throw erro
    console.error("[900-66] app-url indisponível — envio abortado", { sitio, ...contexto })
    return { ok: false }
  }
}
