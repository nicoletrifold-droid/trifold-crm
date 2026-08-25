/**
 * Story 900-12a — URLs assinadas para buckets que deixam de ser públicos.
 *
 * ## Por que isto existe
 *
 * `obra-fotos` era um bucket **público**. Em bucket público, policy de SELECT é irrelevante:
 * a URL basta. Verificado em produção depois da Story 900-11:
 *
 *     GET /storage/v1/object/public/obra-fotos/obras/{obra_id}/fotos/{arquivo}  →  HTTP 200
 *
 * Ou seja, as policies org-scoped da 900-11 **não protegiam este bucket**. Quem tivesse o link
 * lia foto de obra de qualquer empresa. Fotos de obra são PII de cliente.
 *
 * Com o bucket privado, a leitura passa a exigir URL assinada — e aí a policy
 * `org_read_obra_fotos` finalmente vale, porque o Storage a consulta antes de assinar.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Validade da assinatura.
 *
 * Uma hora é folgado para renderizar uma galeria e curto o bastante para que um link vazado
 * não seja um link permanente. O trade-off real não é segurança × conveniência, e sim
 * segurança × cache: URL que muda a cada request derruba o cache do browser e do Next/Image.
 * Uma hora mantém a mesma URL estável dentro da sessão típica de uso.
 */
export const VALIDADE_PADRAO_SEGUNDOS = 60 * 60

/**
 * Assina vários caminhos de uma vez.
 *
 * **Sempre em lote.** Assinar dentro de um `.map()` de renderização faria uma chamada de rede
 * por foto — numa galeria de 100 fotos, 100 round-trips. `createSignedUrls` (plural) resolve
 * tudo num pedido só.
 *
 * Devolve um mapa `path → url`. Caminho que falhar ao assinar simplesmente **não aparece** no
 * mapa, e cabe a quem chama decidir o que exibir. Devolver string vazia ou `null` disfarçado de
 * URL faria o `<img>` quebrar sem explicação; a ausência é explícita.
 */
export async function assinarCaminhos(
  client: SupabaseClient,
  bucket: string,
  caminhos: string[],
  validadeSegundos: number = VALIDADE_PADRAO_SEGUNDOS,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unicos = [...new Set(caminhos.filter(Boolean))]
  if (unicos.length === 0) return out

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrls(unicos, validadeSegundos)

  if (error || !data) return out

  for (const item of data) {
    // `item.path` volta como o caminho pedido; `signedUrl` é null quando aquele item falhou.
    if (item.path && item.signedUrl) out.set(item.path, item.signedUrl)
  }
  return out
}
