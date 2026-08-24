/**
 * Story 900-12a — serve foto de obra com autorização, para o bucket poder deixar de ser público.
 *
 * ## Por que uma rota, e não URL assinada montada em cada componente
 *
 * As fotos são montadas em **4 pontos**, espalhados por 3 arquivos com fluxos diferentes:
 * `obra-detail-tabs.tsx` (client, grid + lightbox), `fotos-grid.tsx` (client, consumido pelo
 * `portal-viewer`) e `cliente/[obra_id]/fotos/page.tsx` (server). Assinar em cada um exigiria
 * gerar as URLs no server component pai de cada árvore e passá-las por props — mudança de
 * contrato em três componentes de uma vez, no código que serve o portal do cliente.
 *
 * Esta rota troca isso por uma alteração de **uma linha em cada ponto**: só muda a URL base.
 * Nenhum fluxo de dados, nenhuma prop nova, nada de client x server para reconciliar.
 *
 * ## Quem autoriza é a policy, não esta rota
 *
 * A rota usa o client com a **sessão do usuário** (nunca service-role). `createSignedUrl` só
 * assina se a RLS de `storage.objects` permitir — ou seja, quem decide é a
 * `org_read_obra_fotos` (migration 239): staff vê obras da própria org, cliente vê apenas as
 * obras vinculadas a ele.
 *
 * Isso é deliberado: repetir a regra de autorização aqui criaria uma segunda fonte de verdade
 * que pode divergir da policy. A rota só transporta.
 *
 * ## O redirect
 *
 * Devolvemos 307 para a URL assinada em vez de fazer proxy do binário. O arquivo vai do Storage
 * direto para o browser, sem passar pela função — o que evita custo de banda e timeout de
 * serverless em foto grande.
 */

import { NextResponse } from "next/server"
import { createClient } from "@web/lib/supabase/server"
import { VALIDADE_PADRAO_SEGUNDOS } from "@web/lib/storage/signed-url"

const BUCKET = "obra-fotos"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const storagePath = path.join("/")

  if (!storagePath) {
    return NextResponse.json({ error: "PATH_MISSING" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, VALIDADE_PADRAO_SEGUNDOS)

  if (error || !data?.signedUrl) {
    // 404 e não 403: dizer "existe, mas você não pode ver" confirma a existência do arquivo
    // para quem está sondando paths. Sem sessão, sem permissão e path inexistente devolvem
    // todos a mesma coisa.
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }

  return NextResponse.redirect(data.signedUrl, 307)
}
