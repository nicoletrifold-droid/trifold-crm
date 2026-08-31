/**
 * Story 900-51 · AC5/C3 — o contrato de erro de SEIS códigos.
 *
 * ## Por que códigos e não a mensagem do provider
 *
 * A rota nunca devolve o texto bruto do provider ao `/dashboard`. O reuso é real, não alegado:
 * `api/meta-ads/account/test/route.ts:55-58` já mapeia `MetaOAuthException → token_invalid` e
 * `MetaPermissionError → permission_denied`. Esta tabela estende esse contrato para os 5 tiles.
 *
 * ## O 6º código (`page_id_ja_configurado`) e por que ele existe
 *
 * `org_integrations_meta_page_ativo` (a UNIQUE de roteamento reverso da 900-21b) **não filtra
 * `status`**. Medido pelo `@po`: uma linha `disconnected` que já ocupa um `page_id` bloqueia
 * qualquer outra org de gravar o mesmo valor. Combinado com a decisão do dono do produto (o
 * cliente também grava `page_id`), isso converte "sequestro de lead" em "negação de configuração":
 * o dono legítimo da Página bate num `23505` cru e não sabe o que fazer. Este código não resolve a
 * causa (o sequestro em si é o risco aceito em C1) — impede que a vítima receba um erro de banco
 * opaco.
 *
 * ## R9 — `technicalDetail` é decisão de SERVIDOR, por rota
 *
 * `esconder no render não é esconder`: se o payload chegou ao navegador, o dado bruto está no JSON
 * independentemente do que a UI renderiza. Por isso {@link montarRespostaDeErro} recebe
 * `incluirDetalheTecnico` — as duas rotas o fixam, e nenhuma prop de UI participa da decisão.
 */

export const CODIGOS_DE_ERRO = [
  "token_invalid",
  "permission_denied",
  "not_found",
  "network_error",
  "unknown",
  "page_id_ja_configurado",
] as const

export type CodigoDeErro = (typeof CODIGOS_DE_ERRO)[number]

export const MENSAGENS_PT_BR: Readonly<Record<CodigoDeErro, string>> = {
  token_invalid: "A credencial foi recusada. Confira se foi copiada sem espaços extras.",
  permission_denied:
    "A credencial é válida, mas não tem a permissão necessária. Veja o guia do provider.",
  not_found: "Não encontramos esse identificador. Confira se foi digitado certo.",
  network_error: "Não conseguimos contatar o provider agora. Tente de novo em instantes.",
  unknown: "Falha inesperada ao testar a credencial.",
  page_id_ja_configurado:
    "Este identificador já está associado a outra conta. Contate o suporte.",
}

/** Nome da UNIQUE parcial que a 900-21b criou — usada para reconhecer o `23505` certo. */
export const CONSTRAINT_PAGE_ID = "org_integrations_meta_page_ativo"

export interface ErroDoBanco {
  code?: string | null
  message?: string | null
  details?: string | null
}

/**
 * Traduz o erro que veio do Postgres (via PostgREST) para um código do contrato.
 *
 * Os `P00xx` são os da migration 248. `23505` só vira `page_id_ja_configurado` quando a mensagem
 * cita a constraint certa — um `23505` de outra UNIQUE não é o mesmo problema e não deve herdar a
 * mensagem "já está associado a outra conta".
 */
export function traduzirErroDoBanco(erro: ErroDoBanco | null | undefined): CodigoDeErro {
  if (!erro) return "unknown"
  const texto = `${erro.message ?? ""} ${erro.details ?? ""}`
  if (erro.code === "23505" && texto.includes(CONSTRAINT_PAGE_ID)) {
    return "page_id_ja_configurado"
  }
  return "unknown"
}

export interface RespostaDeErro {
  ok: false
  codigo: CodigoDeErro
  mensagem: string
  /** Só existe na resposta de `/platform`. Ausente — não `undefined` no JSON — em `/dashboard`. */
  technicalDetail?: string
}

/**
 * Monta o corpo do erro.
 *
 * `incluirDetalheTecnico` é parâmetro de SERVIDOR: a rota `/dashboard` passa `false` e o campo
 * **não é serializado** (não é enviado com `undefined` — a chave não existe). A rota `/platform`
 * passa `true`. Nenhuma prop de UI participa desta decisão (R9).
 */
export function montarRespostaDeErro(
  codigo: CodigoDeErro,
  opcoes: { incluirDetalheTecnico: boolean; detalheBruto?: string | null },
): RespostaDeErro {
  const base: RespostaDeErro = {
    ok: false,
    codigo,
    mensagem: MENSAGENS_PT_BR[codigo],
  }
  if (opcoes.incluirDetalheTecnico && opcoes.detalheBruto) {
    base.technicalDetail = opcoes.detalheBruto
  }
  return base
}
