/**
 * Story 900-51 · AC5 — a sequência de escrita, uma implementação para as DUAS superfícies.
 *
 * ## A sequência, e por que ela é de TRÊS passos e não de um
 *
 *   (1) chamada de teste com o valor do POST;
 *   (2) se e só se (1) teve sucesso, `..._write_secret_as_*`  — grava config+secret_ref;
 *   (3) se e só se (2) teve sucesso, `..._mark_connected_as_*` — promove `status`.
 *
 * Dois RPCs, dois eventos de auditoria, nunca um `UPDATE` só que faz as duas coisas. A separação
 * é do R4 do parecer: enquanto escrever o segredo e promover o status eram a mesma operação,
 * qualquer chamador que falasse com a RPC direto (a story a expõe a `authenticated` de propósito)
 * produzia um tile "Conectado" sem nenhuma credencial ter sido testada.
 *
 * ## O limite honesto, repetido aqui porque é aqui que ele opera
 *
 * O banco garante "não marca connected sem um segredo gravado e não vazio" (`P0015`/`P0017`).
 * Ele **não** garante "a credencial foi testada" — essa prova é o passo (1), que é application
 * code. Este arquivo é onde os dois se encontram; nenhum dos dois sozinho basta.
 *
 * ## Por que uma PORTA em vez de dois arquivos parecidos
 *
 * As duas superfícies chamam RPCs de nomes diferentes (`_as_platform` recebe org+ator;
 * `_as_org` não recebe nada, resolve tudo de `auth.uid()`). O que NÃO pode diferir é a
 * sequência. Duplicá-la faria a rota `/dashboard` poder perder o passo (3) num refactor sem que a
 * `/platform` percebesse.
 *
 * **Este arquivo não importa nada de `lib/tenancy/platform-*` — e não pode (AC9).** A ponte entre
 * as duas superfícies é a forma da sequência, nunca o guard de plataforma.
 *
 * ## `PromiseLike`, não `Promise`, nos métodos da porta
 *
 * `supabase.rpc()` devolve um `PostgrestFilterBuilder`, que é *thenable* mas não implementa
 * `catch`/`finally`. Exigir `Promise` obrigaria cada rota a embrulhar a chamada num
 * `async () => await ...` só para satisfazer o tipo — e um wrapper a mais entre a sequência e a
 * RPC é exatamente o lugar onde um dos três passos se perde num refactor. `await` funciona em
 * qualquer thenable, então a orquestração abaixo não muda.
 */

import { chavesDeConfigRecusadas, type ProviderGravavel, type ProviderDoPainel } from "./providers"
import {
  montarRespostaDeErro,
  traduzirErroDoBanco,
  type CodigoDeErro,
  type ErroDoBanco,
  type RespostaDeErro,
} from "./erros"
import { validarCredencial } from "./validacao"

export interface ResultadoDeRpc {
  error: ErroDoBanco | null
}

/**
 * O que cada superfície precisa fornecer. Nenhum método recebe `orgId`: em `_as_org` a org vem de
 * `user_org_id()` dentro do banco, e em `_as_platform` ela é fechada pelo adaptador da rota — o
 * corpo da requisição nunca escolhe a org em nenhuma das duas.
 */
export interface PortaDeEscrita {
  writeSecret(
    provider: ProviderGravavel,
    segredo: string,
    config: Record<string, unknown>,
  ): PromiseLike<ResultadoDeRpc>
  markConnected(provider: ProviderGravavel): PromiseLike<ResultadoDeRpc>
  markError(provider: ProviderGravavel, codigo: CodigoDeErro): PromiseLike<ResultadoDeRpc>
}

export interface PedidoDeEscrita {
  provider: ProviderGravavel
  segredo: string
  config: Record<string, unknown>
  /** `status` atual da linha — decide se uma falha de teste vira `mark_error` ou fica inerte. */
  statusAtual: string | null
}

export interface RespostaDeSucesso {
  ok: true
  provider: ProviderGravavel
  status: "connected"
}

export type RespostaDeEscrita = RespostaDeSucesso | RespostaDeErro

export interface OpcoesDeEscrita {
  /**
   * Decisão de SERVIDOR, por rota (R9). `/platform` passa `true`; `/dashboard` passa `false` e o
   * campo **não é serializado**. `viewerRole` do componente nunca participa desta decisão: se o
   * payload chegou ao navegador, o dado bruto está lá independentemente do que a UI renderiza.
   */
  incluirDetalheTecnico: boolean
}

function erroDeValidacaoDeEntrada(
  codigo: CodigoDeErro,
  detalhe: string,
  opcoes: OpcoesDeEscrita,
): RespostaDeErro {
  return montarRespostaDeErro(codigo, {
    incluirDetalheTecnico: opcoes.incluirDetalheTecnico,
    detalheBruto: detalhe,
  })
}

/** `status` que já significam "isto funcionava" — falha depois deles é regressão, não tentativa. */
const STATUS_JA_CONFIGURADOS = new Set(["connected", "active"])

export async function gravarIntegracao(
  porta: PortaDeEscrita,
  pedido: PedidoDeEscrita,
  opcoes: OpcoesDeEscrita,
): Promise<RespostaDeEscrita> {
  // Allowlist positiva de chaves de `config`. Recusa aqui e recusa no banco são redundantes de
  // propósito: `config->>'page_id'` de `meta_ads` é a chave de roteamento de tenant que o webhook
  // lê, não um campo livre.
  const recusadas = chavesDeConfigRecusadas(pedido.provider as ProviderDoPainel, pedido.config)
  if (recusadas.length > 0) {
    return erroDeValidacaoDeEntrada(
      "unknown",
      `chaves de config fora da allowlist de ${pedido.provider}: ${recusadas.join(", ")}`,
      opcoes,
    )
  }

  // (1) — a chamada de teste. NADA foi persistido até aqui.
  const validacao = await validarCredencial(pedido.provider, pedido.segredo, pedido.config)
  if (!validacao.ok) {
    const codigo = validacao.codigo ?? "unknown"
    // Integração que NUNCA foi configurada não vira `error` por uma tentativa frustrada — senão
    // uma digitação errada deixaria o tile vermelho para sempre. Já configurada, sim: aí a falha
    // é informação nova sobre uma coisa que funcionava.
    if (pedido.statusAtual && STATUS_JA_CONFIGURADOS.has(pedido.statusAtual)) {
      await porta.markError(pedido.provider, codigo)
    }
    return montarRespostaDeErro(codigo, {
      incluirDetalheTecnico: opcoes.incluirDetalheTecnico,
      detalheBruto: validacao.detalheBruto ?? null,
    })
  }

  // (2) — grava config+secret_ref. NUNCA promove status (isso é do banco, não desta linha).
  const escrita = await porta.writeSecret(pedido.provider, pedido.segredo, pedido.config)
  if (escrita.error) {
    return montarRespostaDeErro(traduzirErroDoBanco(escrita.error), {
      incluirDetalheTecnico: opcoes.incluirDetalheTecnico,
      detalheBruto: escrita.error.message ?? null,
    })
  }

  // (3) — só agora o status sobe. Se o banco recusar (P0015 — secret_ref nulo), a resposta é erro,
  // nunca um 200 que afirmaria "salvo" sobre uma promoção que não aconteceu.
  const promocao = await porta.markConnected(pedido.provider)
  if (promocao.error) {
    return montarRespostaDeErro(traduzirErroDoBanco(promocao.error), {
      incluirDetalheTecnico: opcoes.incluirDetalheTecnico,
      detalheBruto: promocao.error.message ?? null,
    })
  }

  return { ok: true, provider: pedido.provider, status: "connected" }
}
