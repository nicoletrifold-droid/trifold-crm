/**
 * Story 87-14 — a DECISÃO do switch da Nicole sai do JSX.
 *
 * POR QUE UMA FUNÇÃO, E NÃO UM `&&` NO COMPONENTE
 * -----------------------------------------------
 * Componente React não é testável neste repositório: não há `@testing-library`,
 * há ZERO arquivos `.test.tsx` e o `include` do `vitest.config.ts` só coleta
 * arquivos `.test.ts` — um `.test.tsx` nem seria executado (medido em 15/08,
 * AC8 da story). Tudo o que for decisão, portanto, sai do JSX e vira algo que um
 * `.test.ts` alcança. O componente fica burro a ponto de a conferência humana
 * ser de uma linha.
 *
 * A REGRA, EM UMA LINHA: `interativo === podeAtivar`.
 *
 * ⚠️ `interativo === false` NÃO É "controle desabilitado".
 * Decisão do Gabriel (15/08, D2 da story): quem não pode operar **continua
 * vendo o estado** — some o CONTROLE, não a informação. O componente renderiza
 * nesse caso exatamente o `<span>` que já está em produção (`properties/page.tsx`),
 * acrescido de `title={motivo}`. **Nenhum `<input>`, nem desabilitado**: um
 * `<input disabled>` ainda comunica *"aqui existe um controle que você não pode
 * usar"*, que é o tipo de meia-verdade que esta story existe para tirar da tela.
 *
 * Módulo PURO de propósito (sem imports server-side, como `capabilities.ts`):
 * é lido por Client Component **e** por teste. `can()` mora em `permissions.ts`
 * (server-only) e é resolvido no Server Component da lista — o componente recebe
 * o booleano pronto.
 */

/**
 * A frase única do "você não pode mexer nisto". Serve em dois lugares e por isso
 * é constante exportada, não literal duplicado:
 *  (1) `motivo`, no `title` do badge de leitura de quem não tem a capability;
 *  (2) a rede de segurança do componente quando a rota devolve 403 — que não
 *      deveria acontecer, porque a lista já resolveu `can()` no servidor.
 */
export const MOTIVO_SEM_PERMISSAO =
  "Só admin e supervisor podem ligar ou desligar a Nicole num empreendimento."

export interface EstadoSwitchNicole {
  /** O estado atual do campo `properties.nicole_enabled`. */
  ligado: boolean
  /**
   * `false` ⇒ **não se renderiza `<input>` nenhum** — só o badge de leitura de
   * hoje. (Decisão do Gabriel, 15/08.)
   */
  interativo: boolean
  /**
   * Não-nulo EXATAMENTE quando `interativo === false`. Vai no `title` do badge
   * de leitura.
   */
  motivo: string | null
  /**
   * Pergunta da confirmação, nas DUAS direções (decisão D3 do @po).
   * `"Ligar a Nicole no {nome}?"` | `"Desligar a Nicole no {nome}?"`
   *
   * Confirmar só ao LIGAR seria régua saturada: nas 4 linhas de produção, ligar
   * só é alcançável em Japura e Solum — que o servidor já barra com 422 dos
   * mínimos —, enquanto desligar é alcançável em Vind e Yarden, **sem rede
   * nenhuma** e sem registro. A confirmação protegeria a direção que já tem rede
   * e deixaria nua a que não tem.
   */
  textoConfirmacao: string
  /**
   * `"Nicole: ligada"` / `"Nicole: desligada"` — o texto que JÁ está em produção
   * no badge da lista. Congelado por teste (AC4-(ii)): com a D2, este rótulo
   * virou o que os 8 papéis sem permissão continuam lendo.
   */
  rotulo: string
}

export function estadoSwitchNicole(input: {
  nicoleEnabled: boolean
  podeAtivar: boolean
  nome: string
}): EstadoSwitchNicole {
  const { nicoleEnabled, podeAtivar, nome } = input

  return {
    ligado: nicoleEnabled,
    interativo: podeAtivar,
    motivo: podeAtivar ? null : MOTIVO_SEM_PERMISSAO,
    // A direção do clique é o INVERSO do estado atual: quem está desligado será
    // ligado, e vice-versa.
    textoConfirmacao: nicoleEnabled
      ? `Desligar a Nicole no ${nome}?`
      : `Ligar a Nicole no ${nome}?`,
    rotulo: nicoleEnabled ? "Nicole: ligada" : "Nicole: desligada",
  }
}
