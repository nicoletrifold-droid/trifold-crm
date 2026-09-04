/**
 * Epic 900 · Console de plataforma — o aviso de "esta lista pode estar incompleta".
 *
 * Nasceu dentro de `app/platform/page.tsx` (Story 900-56) e saiu para cá na `900-58`, quando a
 * lista de empresas passou a precisar exatamente do mesmo aviso. A alternativa era escrever um
 * segundo texto — e duas frases para o mesmo fato é como o console já discordou de si mesmo
 * antes (QA-900-51-2): o operador aprenderia que "a consulta não voltou" tem dois significados.
 *
 * `oQue` é obrigatório porque o que está faltando muda com a tela ("pendências" na Visão geral,
 * "empresas" na lista) e é justamente essa palavra que diz ao operador o que ele NÃO está vendo.
 * Um default genérico ("registros") esconderia a diferença nas duas.
 *
 * As DUAS causas ficam na mesma frase de propósito. Separá-las em dois avisos convidaria a
 * renderizar só um deles — e o efeito prático é o mesmo: há linha que o sistema não viu.
 */

import { TETO_POSTGREST } from "@web/lib/tenancy/console-visao-geral"

export function AvisoDeTeto({ oQue }: { oQue: string }) {
  return (
    <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
      Esta lista pode estar incompleta: uma das consultas não voltou, ou voltou no teto de{" "}
      {TETO_POSTGREST} linhas do PostgREST — em qualquer dos casos há {oQue} que o sistema não
      chegou a ver.
    </p>
  )
}
